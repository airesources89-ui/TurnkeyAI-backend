// ════════════════════════════════════════════════
// ── lib/telephony.js — Twilio telephony provisioning and helpers
// ── Future: add call analytics, IVR menus, call queuing,
// ── voicemail-to-email transcription, number porting
// ════════════════════════════════════════════════
const { clients, saveClient } = require('./db');
const { sendEmail, ADMIN_EMAIL } = require('./email');

const BASE_URL           = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const CF_AI_TOKEN        = process.env.CF_AI_TOKEN;
const CF_ACCOUNT_ID      = process.env.CF_ACCOUNT_ID;

// ── Generate TwiML response string ──
function twiml(content) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}

// ── Send SMS from a specific Twilio number (not the master TWILIO_PHONE) ──
async function sendSMSFrom(from, to, body) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[Twilio] Missing credentials — SMS skipped'); return;
  }
  const cleaned = to.replace(/\D/g, '');
  const e164 = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const params = new URLSearchParams({ To: e164, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const d = await res.json();
  if (!res.ok) console.error('[Twilio SMS error]', d);
  return d;
}

// ── Find client by their Twilio number ──
function findClientByTwilioNumber(twilioNumber) {
  return Object.values(clients).find(c => c.twilioNumber === twilioNumber && c.telephonyEnabled);
}

// ── Check if current time is outside business hours ──
function isAfterHours(client) {
  if (!client.businessHoursJson) return false;
  const now = new Date();
  const ctString = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const ct = new Date(ctString);
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const today = dayNames[ct.getDay()];
  const dayConfig = client.businessHoursJson[today];
  if (!dayConfig || !dayConfig.open) return true;
  const hoursStr = (dayConfig.hours || '').replace(/–/g, '-');
  const parts = hoursStr.split('-').map(s => s.trim());
  if (parts.length !== 2) return false;
  function parseTime(str) {
    const match = str.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const openMin = parseTime(parts[0]);
  const closeMin = parseTime(parts[1]);
  if (openMin === null || closeMin === null) return false;
  const nowMin = ct.getHours() * 60 + ct.getMinutes();
  return nowMin < openMin || nowMin >= closeMin;
}

// ── Provision a Twilio phone number for a client ──
async function provisionTwilioNumber(client) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[Telephony] Missing Twilio credentials — provisioning skipped');
    return null;
  }
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  const clientPhone = (client.data.phone || '').replace(/\D/g, '');
  const areaCode = clientPhone.length >= 10 ? clientPhone.slice(clientPhone.length - 10, clientPhone.length - 7) : '';
  let availableNumber = null;

  if (areaCode) {
    try {
      const searchRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&Limit=1&VoiceEnabled=true&SmsEnabled=true`,
        { headers: { 'Authorization': `Basic ${auth}` } }
      );
      const searchData = await searchRes.json();
      if (searchData.available_phone_numbers && searchData.available_phone_numbers.length > 0) {
        availableNumber = searchData.available_phone_numbers[0].phone_number;
      }
    } catch (e) { console.warn('[Telephony] Area code search failed:', e.message); }
  }

  if (!availableNumber) {
    try {
      const searchRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/US/Local.json?Limit=1&VoiceEnabled=true&SmsEnabled=true`,
        { headers: { 'Authorization': `Basic ${auth}` } }
      );
      const searchData = await searchRes.json();
      if (searchData.available_phone_numbers && searchData.available_phone_numbers.length > 0) {
        availableNumber = searchData.available_phone_numbers[0].phone_number;
      }
    } catch (e) { console.error('[Telephony] Fallback search failed:', e.message); }
  }

  if (!availableNumber) {
    console.error('[Telephony] No available numbers found');
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `⚠️ Telephony Provisioning Failed: ${client.data.businessName}`,
      html: `<p>Could not find an available Twilio number for <strong>${client.data.businessName}</strong> (area code: ${areaCode || 'none'}).</p><p>Provision manually in the Twilio console.</p>`
    }).catch(() => {});
    return null;
  }

  try {
    const voiceUrl = `${BASE_URL}/api/telephony/voice`;
    const voiceStatusUrl = `${BASE_URL}/api/telephony/voice-status`;
    const smsUrl = `${BASE_URL}/api/telephony/sms-incoming`;
    const buyParams = new URLSearchParams({
      PhoneNumber: availableNumber,
      VoiceUrl: voiceUrl, VoiceMethod: 'POST',
      StatusCallback: voiceStatusUrl, StatusCallbackMethod: 'POST',
      SmsUrl: smsUrl, SmsMethod: 'POST',
    });
    const buyRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
      { method: 'POST', headers, body: buyParams }
    );
    const buyData = await buyRes.json();
    if (!buyRes.ok) {
      console.error('[Telephony] Purchase failed:', buyData);
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `⚠️ Telephony Purchase Failed: ${client.data.businessName}`,
        html: `<p>Failed to purchase ${availableNumber} for <strong>${client.data.businessName}</strong>.</p><pre>${JSON.stringify(buyData, null, 2)}</pre>`
      }).catch(() => {});
      return null;
    }
    const twilioNumber = buyData.phone_number;
    console.log(`[Telephony] Provisioned ${twilioNumber} for ${client.data.businessName}`);
    client.twilioNumber = twilioNumber;
    client.forwardingNumber = client.data.phone || '';
    client.telephonyEnabled = true;
    const daysOfWeek = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const hoursObj = {};
    daysOfWeek.forEach(day => {
      if (client.data['day_' + day]) {
        hoursObj[day] = { open: true, hours: client.data['hours_' + day] || '9:00 AM - 5:00 PM' };
      } else {
        hoursObj[day] = { open: false, hours: null };
      }
    });
    client.businessHoursJson = hoursObj;
    await saveClient(client);
    const formattedNumber = twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📞 Telephony Active: ${client.data.businessName} — ${formattedNumber}`,
      html: `<div style="font-family:sans-serif;max-width:600px;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:20px 28px;border-radius:12px 12px 0 0;"><h2 style="color:#00D68F;margin:0;">📞 Telephony Provisioned</h2></div><div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:160px;">Business</td><td style="padding:8px;">${client.data.businessName}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Twilio Number</td><td style="padding:8px;"><strong>${formattedNumber}</strong></td></tr><tr><td style="padding:8px;font-weight:700;">Forwards To</td><td style="padding:8px;">${client.data.phone}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Features</td><td style="padding:8px;">Missed call text-back ✅<br>After-hours AI SMS ✅<br>Call recording ✅<br>Transcription ✅</td></tr></table></div></div>`
    }).catch(() => {});
    return twilioNumber;
  } catch (e) {
    console.error('[Telephony] Provisioning error:', e.message);
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `⚠️ Telephony Error: ${client.data.businessName}`,
      html: `<p>Error provisioning number for <strong>${client.data.businessName}</strong>: ${e.message}</p>`
    }).catch(() => {});
    return null;
  }
}

console.log('[module] lib/telephony.js loaded');

module.exports = {
  twiml,
  sendSMSFrom,
  findClientByTwilioNumber,
  isAfterHours,
  provisionTwilioNumber,
};
