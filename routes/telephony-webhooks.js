// ════════════════════════════════════════════════
// ── routes/telephony-webhooks.js — Twilio voice/SMS webhooks
// ── IVR menu during business hours, voicemail after hours,
// ── missed call text-back, AI SMS, call recording
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { clients } = require('../lib/db');
const { sendEmail, ADMIN_EMAIL } = require('../lib/email');
const { twiml, sendSMSFrom, findClientByTwilioNumber, isAfterHours } = require('../lib/telephony');
const { logAnalyticsEvent } = require('../lib/analytics');

const BASE_URL       = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const CF_AI_TOKEN    = process.env.CF_AI_TOKEN;
const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;

// ══════════════════════════════════════
// ── Helper: Build spoken hours string from intake data ──
// ══════════════════════════════════════
function buildSpokenHours(data) {
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const parts = [];
  let i = 0;
  while (i < days.length) {
    if (!data['day_' + days[i]]) { i++; continue; }
    const hours = data['hours_' + days[i]] || 'Open';
    let j = i + 1;
    while (j < days.length && data['day_' + days[j]] && (data['hours_' + days[j]] || 'Open') === hours) { j++; }
    if (j - i === 1) {
      parts.push(`${dayLabels[i]}, ${hours}`);
    } else {
      parts.push(`${dayLabels[i]} through ${dayLabels[j - 1]}, ${hours}`);
    }
    i = j;
  }
  if (!parts.length) return 'Please call during normal business hours.';
  return 'We are open ' + parts.join('. ') + '.';
}

// ══════════════════════════════════════
// ── Helper: Check if client has custom IVR departments ──
// ══════════════════════════════════════
function hasCustomDepts(data) {
  return !!(data && data.ivr_dept1_name && data.ivr_dept1_name.trim());
}

// ══════════════════════════════════════
// ── Helper: Extract digit from dept ext field ──
// ── Handles "Press 1", "1", "Press 2", "2", etc.
// ══════════════════════════════════════
function extractDigit(extField) {
  if (!extField) return null;
  const match = String(extField).match(/\d/);
  return match ? match[0] : null;
}

// ══════════════════════════════════════
// ── Helper: Build custom department list from intake data ──
// ── Returns array of { digit, name } for populated depts ──
// ══════════════════════════════════════
function getCustomDepts(data) {
  const depts = [];
  for (let i = 1; i <= 3; i++) {
    const name = data[`ivr_dept${i}_name`] ? data[`ivr_dept${i}_name`].trim() : '';
    const extRaw = data[`ivr_dept${i}_ext`] || '';
    const digit = extractDigit(extRaw) || String(i); // fall back to sequential digit
    if (name) depts.push({ digit, name });
  }
  return depts;
}

// ══════════════════════════════════════
// ── Helper: Build custom department TwiML menu ──
// ══════════════════════════════════════
function buildCustomMenuTwiml(client, depts) {
  const biz = client.data.businessName || 'the business';
  const lastDigit = depts[depts.length - 1].digit;

  // Build greeting
  let greetingTwiml;
  if (client.ivrGreetingFile) {
    greetingTwiml = `<Play>${BASE_URL}/uploads/${client.ivrGreetingFile}</Play>`;
  } else {
    greetingTwiml = `<Say voice="alice">Thank you for calling ${biz}.</Say>`;
  }

  // Build menu prompt from dept names
  const menuLines = depts.map(d => `Press ${d.digit} for ${d.name}.`).join(' ');
  const connectLine = `Press ${Number(lastDigit) + 1}, or stay on the line, to speak with someone directly.`;
  const menuPrompt = `<Say voice="alice">${menuLines} ${connectLine}</Say>`;

  // Total digits to gather = last dept digit + 1 for direct connect
  return (
    `<Gather numDigits="1" action="${BASE_URL}/api/telephony/ivr-action" method="POST" timeout="6">` +
    greetingTwiml +
    menuPrompt +
    `</Gather>` +
    `<Redirect method="POST">${BASE_URL}/api/telephony/ivr-action?Digits=${Number(lastDigit) + 1}</Redirect>`
  );
}

// ── POST /api/telephony/voice ──
router.post('/api/telephony/voice', async (req, res) => {
  try {
    const calledNumber = req.body.Called || req.body.To || '';
    const callerNumber = req.body.From || '';
    const client = findClientByTwilioNumber(calledNumber);
    if (!client) {
      console.warn('[Telephony/voice] No client found for number:', calledNumber);
      res.type('text/xml').send(twiml(`<Say voice="alice">We're sorry, this number is not currently in service. Please try again later.</Say><Hangup/>`));
      return;
    }
    const biz = client.data.businessName || 'the business';
    const industry = (client.data.industry || 'service').replace(/_/g, ' ');

    // ── Analytics: log call event ──
    logAnalyticsEvent(client.id, 'call', isAfterHours(client) ? 'after_hours' : 'business_hours', { from: callerNumber });

    if (isAfterHours(client)) {
      // ═══════════════════════════════════
      // ── AFTER HOURS: Voicemail + AI SMS (unchanged) ──
      // ═══════════════════════════════════
      console.log(`[Telephony/voice] After-hours call to ${biz} from ${callerNumber}`);
      res.type('text/xml').send(twiml(
        `<Say voice="alice">Thank you for calling ${biz}. We are currently closed. Please leave a message after the tone and we will return your call on our next business day. You can also send us a text at this number for immediate AI assistance.</Say>` +
        `<Record maxLength="120" action="${BASE_URL}/api/telephony/voicemail" transcribe="true" transcribeCallback="${BASE_URL}/api/telephony/transcription" />`
      ));
      (async () => {
        try {
          let aiReply = `Hi! Thanks for calling ${biz}. We're currently closed but received your call. We'll get back to you first thing on our next business day. In the meantime, feel free to text this number and our AI assistant can help with basic questions.`;
          if (CF_AI_TOKEN && CF_ACCOUNT_ID) {
            try {
              const aiSystem = `You are the after-hours AI assistant for ${biz}, a ${industry} business. The caller just reached voicemail. Send a brief, friendly text message (under 300 characters) acknowledging their call, letting them know the business is closed, and offering to help via text. Do not make up hours or prices.`;
              const cfRes = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
                { method: 'POST', headers: { 'Authorization': `Bearer ${CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: [{ role: 'system', content: aiSystem }, { role: 'user', content: `Someone just called ${biz} after hours. Send them a friendly text.` }] }) }
              );
              const cfData = await cfRes.json();
              if (cfData?.result?.response) aiReply = cfData.result.response.substring(0, 480);
            } catch (aiErr) { console.warn('[Telephony] AI reply failed, using default:', aiErr.message); }
          }
          await sendSMSFrom(client.twilioNumber, callerNumber, aiReply);
        } catch (smsErr) { console.error('[Telephony] After-hours SMS failed:', smsErr.message); }
      })();
      sendEmail({ to: ADMIN_EMAIL, subject: `📞 After-Hours Call: ${biz} — ${callerNumber}`, html: `<p>After-hours call to <strong>${biz}</strong> from <strong>${callerNumber}</strong>. Voicemail recorded. Auto-text sent to caller.</p>` }).catch(() => {});
    } else {
      // ═══════════════════════════════════
      // ── BUSINESS HOURS: IVR opt-out check first ──
      // ═══════════════════════════════════

      // ── If client opted out of IVR, forward directly ──
      if (client.data.ivrOptIn === 'no') {
        console.log(`[Telephony/voice] IVR opt-out for ${biz} — forwarding directly to ${client.forwardingNumber}`);
        const forwardTo = (client.forwardingNumber || '').replace(/\D/g, '');
        const e164Forward = forwardTo.length === 10 ? `+1${forwardTo}` : `+${forwardTo}`;
        res.type('text/xml').send(twiml(
          `<Dial callerId="${client.twilioNumber}" timeout="25" record="record-from-answer-dual" recordingStatusCallback="${BASE_URL}/api/telephony/transcription" action="${BASE_URL}/api/telephony/voice-status">` +
          `<Number>${e164Forward}</Number></Dial>`
        ));
        return;
      }

      // ── IVR active: custom departments or standard menu ──
      console.log(`[Telephony/voice] IVR menu for ${biz} — call from ${callerNumber}`);

      if (hasCustomDepts(client.data)) {
        // ── Custom department menu ──
        const depts = getCustomDepts(client.data);
        console.log(`[Telephony/voice] Using custom dept menu for ${biz}:`, depts.map(d => `${d.digit}=${d.name}`).join(', '));
        res.type('text/xml').send(twiml(buildCustomMenuTwiml(client, depts)));
      } else {
        // ── Standard 4-option menu (unchanged) ──
        let greetingTwiml;
        if (client.ivrGreetingFile) {
          greetingTwiml = `<Play>${BASE_URL}/uploads/${client.ivrGreetingFile}</Play>`;
        } else {
          greetingTwiml = `<Say voice="alice">Thank you for calling ${biz}.</Say>`;
        }
        const menuPrompt = `<Say voice="alice">Press 1 to schedule an appointment. Press 2 for our business hours. Press 3 to send us a message. Press 4, or simply stay on the line, to speak with someone directly.</Say>`;
        res.type('text/xml').send(twiml(
          `<Gather numDigits="1" action="${BASE_URL}/api/telephony/ivr-action" method="POST" timeout="6">` +
          greetingTwiml +
          menuPrompt +
          `</Gather>` +
          `<Redirect method="POST">${BASE_URL}/api/telephony/ivr-action?Digits=4</Redirect>`
        ));
      }
    }
  } catch (err) {
    console.error('[Telephony/voice] Error:', err);
    res.type('text/xml').send(twiml(`<Say voice="alice">We're experiencing technical difficulties. Please try again later.</Say><Hangup/>`));
  }
});

// ══════════════════════════════════════
// ── POST /api/telephony/ivr-action — Handle IVR keypress ──
// ══════════════════════════════════════
router.post('/api/telephony/ivr-action', async (req, res) => {
  try {
    const digit = req.body.Digits || req.query.Digits || '4';
    const callerNumber = req.body.From || req.body.Caller || '';
    const calledNumber = req.body.Called || req.body.To || '';
    const client = findClientByTwilioNumber(calledNumber);

    if (!client) {
      res.type('text/xml').send(twiml(`<Say voice="alice">We're sorry, something went wrong. Goodbye.</Say><Hangup/>`));
      return;
    }

    const biz = client.data.businessName || 'the business';
    const siteUrl = client.liveUrl || `https://${client.cfProjectName || 'turnkeyai'}.pages.dev`;

    // ── Custom department routing ──
    if (hasCustomDepts(client.data)) {
      const depts = getCustomDepts(client.data);
      const lastDigit = depts[depts.length - 1].digit;
      const directDigit = String(Number(lastDigit) + 1);
      const matchedDept = depts.find(d => d.digit === digit);

      if (matchedDept) {
        // ── Matched a custom department: announce and forward ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed ${digit} — dept: ${matchedDept.name}`);
        const forwardTo = (client.forwardingNumber || '').replace(/\D/g, '');
        const e164Forward = forwardTo.length === 10 ? `+1${forwardTo}` : `+${forwardTo}`;
        res.type('text/xml').send(twiml(
          `<Say voice="alice">Connecting you to ${matchedDept.name}. Please hold.</Say>` +
          `<Dial callerId="${client.twilioNumber}" timeout="25" record="record-from-answer-dual" recordingStatusCallback="${BASE_URL}/api/telephony/transcription" action="${BASE_URL}/api/telephony/voice-status">` +
          `<Number>${e164Forward}</Number></Dial>`
        ));
        return;
      }

      if (digit === directDigit) {
        // ── Direct connect digit for custom menu ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed ${digit} — direct connect (custom menu)`);
        const forwardTo = (client.forwardingNumber || '').replace(/\D/g, '');
        const e164Forward = forwardTo.length === 10 ? `+1${forwardTo}` : `+${forwardTo}`;
        res.type('text/xml').send(twiml(
          `<Say voice="alice">Connecting you now. Please hold.</Say>` +
          `<Dial callerId="${client.twilioNumber}" timeout="25" record="record-from-answer-dual" recordingStatusCallback="${BASE_URL}/api/telephony/transcription" action="${BASE_URL}/api/telephony/voice-status">` +
          `<Number>${e164Forward}</Number></Dial>`
        ));
        return;
      }

      // ── Invalid digit for custom menu: replay ──
      console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed invalid digit ${digit} (custom menu)`);
      res.type('text/xml').send(twiml(buildCustomMenuTwiml(client, depts)));
      return;
    }

    // ── Standard 4-option menu routing (unchanged) ──
    switch (digit) {
      case '1': {
        // ── Schedule an appointment: send SMS with link ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed 1 — scheduling link`);
        res.type('text/xml').send(twiml(
          `<Say voice="alice">We're sending you a text with a link to schedule your appointment online. Thank you for calling ${biz}!</Say><Hangup/>`
        ));
        const schedUrl = `${siteUrl}/scheduling.html`;
        sendSMSFrom(client.twilioNumber, callerNumber, `Here's your link to schedule an appointment with ${biz}: ${schedUrl}`).catch(e => console.error('[IVR SMS]', e.message));
        break;
      }
      case '2': {
        // ── Business hours: read aloud, then replay menu ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed 2 — business hours`);
        const spokenHours = buildSpokenHours(client.data);
        res.type('text/xml').send(twiml(
          `<Say voice="alice">${spokenHours}</Say>` +
          `<Gather numDigits="1" action="${BASE_URL}/api/telephony/ivr-action" method="POST" timeout="6">` +
          `<Say voice="alice">Press 1 to schedule an appointment. Press 3 to send us a message. Press 4, or stay on the line, to speak with someone.</Say>` +
          `</Gather>` +
          `<Redirect method="POST">${BASE_URL}/api/telephony/ivr-action?Digits=4</Redirect>`
        ));
        break;
      }
      case '3': {
        // ── Send a message: send SMS with link ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed 3 — messaging link`);
        res.type('text/xml').send(twiml(
          `<Say voice="alice">We're sending you a text with a link to send us a message online. Thank you for calling ${biz}!</Say><Hangup/>`
        ));
        const msgUrl = `${siteUrl}/messaging.html`;
        sendSMSFrom(client.twilioNumber, callerNumber, `Here's your link to send a message to ${biz}: ${msgUrl}`).catch(e => console.error('[IVR SMS]', e.message));
        break;
      }
      case '4': {
        // ── Speak with someone: forward to real phone ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed 4 — forwarding to ${client.forwardingNumber}`);
        const forwardTo = (client.forwardingNumber || '').replace(/\D/g, '');
        const e164Forward = forwardTo.length === 10 ? `+1${forwardTo}` : `+${forwardTo}`;
        res.type('text/xml').send(twiml(
          `<Say voice="alice">Connecting you now. Please hold.</Say>` +
          `<Dial callerId="${client.twilioNumber}" timeout="25" record="record-from-answer-dual" recordingStatusCallback="${BASE_URL}/api/telephony/transcription" action="${BASE_URL}/api/telephony/voice-status">` +
          `<Number>${e164Forward}</Number></Dial>`
        ));
        break;
      }
      default: {
        // ── Invalid digit: replay menu once, then forward ──
        console.log(`[IVR] ${biz}: Caller ${callerNumber} pressed invalid digit ${digit}`);
        res.type('text/xml').send(twiml(
          `<Say voice="alice">Sorry, that's not a valid option.</Say>` +
          `<Gather numDigits="1" action="${BASE_URL}/api/telephony/ivr-action" method="POST" timeout="6">` +
          `<Say voice="alice">Press 1 to schedule an appointment. Press 2 for business hours. Press 3 to send a message. Press 4 to speak with someone.</Say>` +
          `</Gather>` +
          `<Redirect method="POST">${BASE_URL}/api/telephony/ivr-action?Digits=4</Redirect>`
        ));
        break;
      }
    }
  } catch (err) {
    console.error('[IVR/action] Error:', err);
    // Failsafe: forward to real phone
    try {
      const calledNumber = req.body.Called || req.body.To || '';
      const client = findClientByTwilioNumber(calledNumber);
      if (client && client.forwardingNumber) {
        const forwardTo = client.forwardingNumber.replace(/\D/g, '');
        const e164 = forwardTo.length === 10 ? `+1${forwardTo}` : `+${forwardTo}`;
        res.type('text/xml').send(twiml(`<Say voice="alice">Please hold.</Say><Dial callerId="${client.twilioNumber}" timeout="25"><Number>${e164}</Number></Dial>`));
      } else {
        res.type('text/xml').send(twiml(`<Say voice="alice">We're experiencing technical difficulties. Please try again later.</Say><Hangup/>`));
      }
    } catch (_) {
      res.type('text/xml').send(twiml(`<Say voice="alice">We're experiencing technical difficulties. Please try again later.</Say><Hangup/>`));
    }
  }
});

// ── POST /api/telephony/voice-status ──
router.post('/api/telephony/voice-status', async (req, res) => {
  res.type('text/xml').send(twiml(''));
  try {
    const dialStatus = req.body.DialCallStatus || '';
    const callerNumber = req.body.From || req.body.Caller || '';
    const calledNumber = req.body.Called || req.body.To || '';
    if (['no-answer', 'busy', 'failed', 'canceled'].includes(dialStatus)) {
      const client = findClientByTwilioNumber(calledNumber);
      if (!client) return;
      const biz = client.data.businessName || 'the business';
      console.log(`[Telephony] Missed call to ${biz} from ${callerNumber} (status: ${dialStatus})`);
      const missedMsg = `Hi! We missed your call to ${biz}. We're sorry we couldn't answer — we'll call you back as soon as possible. If it's urgent, please text this number and we can help right away.`;
      await sendSMSFrom(client.twilioNumber, callerNumber, missedMsg);
      if (client.forwardingNumber) {
        await sendSMSFrom(client.twilioNumber, client.forwardingNumber, `📞 Missed call to ${biz} from ${callerNumber}. Auto text-back sent to caller.`).catch(() => {});
      }
      sendEmail({ to: ADMIN_EMAIL, subject: `📵 Missed Call: ${biz} — ${callerNumber}`, html: `<p>Missed call to <strong>${biz}</strong> from <strong>${callerNumber}</strong>. Status: ${dialStatus}. Auto text-back sent to caller.</p>` }).catch(() => {});
    }
  } catch (err) { console.error('[Telephony/voice-status]', err.message); }
});

// ── POST /api/telephony/voicemail ──
router.post('/api/telephony/voicemail', async (req, res) => {
  res.type('text/xml').send(twiml(`<Say voice="alice">Thank you. We'll get back to you soon. Goodbye.</Say><Hangup/>`));
  try {
    const callerNumber = req.body.From || req.body.Caller || '';
    const calledNumber = req.body.Called || req.body.To || '';
    const recordingUrl = req.body.RecordingUrl || '';
    const client = findClientByTwilioNumber(calledNumber);
    if (!client) return;
    const biz = client.data.businessName || 'Unknown Business';
    sendEmail({ to: ADMIN_EMAIL, subject: `🎙️ Voicemail: ${biz} — from ${callerNumber}`, html: `<p>New voicemail for <strong>${biz}</strong> from <strong>${callerNumber}</strong>.</p>${recordingUrl ? `<p><a href="${recordingUrl}.mp3" style="color:#0066FF;">🎧 Listen to Recording</a></p>` : '<p>(Recording URL not available yet — check Twilio console)</p>'}` }).catch(() => {});
  } catch (err) { console.error('[Telephony/voicemail]', err.message); }
});

// ── POST /api/telephony/sms-incoming ──
router.post('/api/telephony/sms-incoming', async (req, res) => {
  try {
    const smsFrom = req.body.From || '';
    const smsTo = req.body.To || '';
    const smsBody = (req.body.Body || '').trim();
    const client = findClientByTwilioNumber(smsTo);
    if (!client || !smsBody) { res.type('text/xml').send(twiml('')); return; }
    const biz = client.data.businessName || 'the business';
    const industry = (client.data.industry || 'service').replace(/_/g, ' ');
    const city = client.data.city || '';
    const phone = client.twilioNumber ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : '';
    console.log(`[Telephony/SMS] Inbound to ${biz} from ${smsFrom}: "${smsBody.substring(0, 80)}"`);

    // ── Analytics: log SMS event ──
    logAnalyticsEvent(client.id, 'sms', null, { from: smsFrom });

    let aiReply = `Thanks for texting ${biz}! We received your message and will get back to you shortly. For immediate help, call us at ${phone}.`;
    if (CF_AI_TOKEN && CF_ACCOUNT_ID) {
      try {
        const smsSystem = `You are the AI text assistant for ${biz}, a ${industry} business in ${city}. Answer customer questions helpfully and briefly (under 400 characters). Be friendly and professional. Phone: ${phone}. If you don't know specific pricing or availability, say you'll have someone follow up. Do not make up information.`;
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'system', content: smsSystem }, { role: 'user', content: smsBody }] }) }
        );
        const cfData = await cfRes.json();
        if (cfData?.result?.response) aiReply = cfData.result.response.substring(0, 480);
      } catch (aiErr) { console.warn('[Telephony/SMS] AI reply failed:', aiErr.message); }
    }
    await sendSMSFrom(client.twilioNumber, smsFrom, aiReply);
    if (client.forwardingNumber) {
      await sendSMSFrom(client.twilioNumber, client.forwardingNumber, `📱 Text from ${smsFrom} to ${biz}:\n"${smsBody.substring(0, 300)}"\n\nAI replied automatically. Reply to this number to respond directly.`).catch(() => {});
    }
    sendEmail({ to: ADMIN_EMAIL, subject: `💬 SMS: ${biz} — from ${smsFrom}`, html: `<div style="font-family:sans-serif;max-width:600px;"><h3 style="color:#0066FF;">Inbound SMS to ${biz}</h3><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:100px;">From</td><td style="padding:8px;">${smsFrom}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Message</td><td style="padding:8px;">${smsBody}</td></tr><tr><td style="padding:8px;font-weight:700;">AI Reply</td><td style="padding:8px;color:#059669;">${aiReply}</td></tr></table></div>` }).catch(() => {});
    res.type('text/xml').send(twiml(''));
  } catch (err) {
    console.error('[Telephony/sms-incoming]', err.message);
    res.type('text/xml').send(twiml(''));
  }
});

// ── POST /api/telephony/transcription ──
router.post('/api/telephony/transcription', async (req, res) => {
  res.sendStatus(200);
  try {
    const callerNumber = req.body.From || req.body.Caller || '';
    const calledNumber = req.body.Called || req.body.To || '';
    const recordingUrl = req.body.RecordingUrl || '';
    const recordingDuration = req.body.RecordingDuration || '';
    const transcriptionText = req.body.TranscriptionText || '';
    const recordingStatus = req.body.RecordingStatus || '';
    const client = findClientByTwilioNumber(calledNumber);
    if (!client) return;
    const biz = client.data.businessName || 'Unknown';
    console.log(`[Telephony/transcription] Call to ${biz}: ${recordingDuration}s, status: ${recordingStatus}`);
    if (recordingUrl || transcriptionText) {
      await sendEmail({ to: ADMIN_EMAIL, subject: `📝 Call Record: ${biz} — ${callerNumber} (${recordingDuration || '?'}s)`, html: `<div style="font-family:sans-serif;max-width:600px;"><h3 style="color:#0066FF;">Call Recording — ${biz}</h3><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:120px;">Caller</td><td style="padding:8px;">${callerNumber}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Duration</td><td style="padding:8px;">${recordingDuration || '?'} seconds</td></tr>${recordingUrl ? `<tr><td style="padding:8px;font-weight:700;">Recording</td><td style="padding:8px;"><a href="${recordingUrl}.mp3" style="color:#0066FF;">🎧 Listen</a></td></tr>` : ''}${transcriptionText ? `<tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Transcript</td><td style="padding:8px;">${transcriptionText}</td></tr>` : ''}</table></div>` }).catch(() => {});
    }
  } catch (err) { console.error('[Telephony/transcription]', err.message); }
});

console.log('[module] routes/telephony-webhooks.js loaded');
module.exports = router;
