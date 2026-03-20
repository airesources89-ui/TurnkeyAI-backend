// ════════════════════════════════════════════════
// ── lib/email.js — Email (Brevo) and SMS (Twilio) sending
// ════════════════════════════════════════════════
const BREVO_API_KEY      = process.env.BREVO_API_KEY;
const ADMIN_EMAIL        = 'turnkeyaiservices@gmail.com';
const BASE_URL           = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE       = process.env.TWILIO_PHONE;

// ── Email via Brevo ──
async function sendEmail({ to, subject, html }) {
  if (!BREVO_API_KEY) { console.warn('[email] No BREVO_API_KEY'); return; }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'TurnkeyAI Services', email: 'turnkeyaiservices@gmail.com' },
      to: [{ email: to }], subject, htmlContent: html
    })
  });
  const d = await res.json();
  if (!res.ok) console.error('[Brevo error]', d);
  return d;
}

// ── SMS via Twilio (uses the master TWILIO_PHONE number) ──
async function sendSMS(to, body) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
    console.warn('[Twilio] Missing credentials — SMS skipped'); return;
  }
  const cleaned = to.replace(/\D/g,'');
  const e164 = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const params = new URLSearchParams({ To: e164, From: TWILIO_PHONE, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const d = await res.json();
  if (!res.ok) console.error('[Twilio error]', d);
  return d;
}

// ── Video script generator ──
function generateVideoScript(data) {
  const biz      = data.businessName || 'our business';
  const owner    = data.ownerName || 'there';
  const city     = data.city || 'your area';
  const industry = (data.industry || 'service').replace(/_/g,' ');
  const tagline  = data.missionStatement || `Quality ${industry} you can count on`;
  const phone    = data.phone || '';
  const services = Object.keys(data)
    .filter(k => k.startsWith('service_') && data[k]==='on').slice(0,2)
    .map(k => k.replace('service_','').replace(/_/g,' ')).join(' or ');
  return `Hi, I'm ${owner} from ${biz}.\n\nWe're a ${industry} business proudly serving ${city} and the surrounding areas.\n\n${tagline}.\n\n${services ? `Whether you need help with ${services}, we're here for you.` : 'We are here to serve you.'}\n\n${phone ? `Give us a call at ${phone} — ` : ''}We look forward to earning your business.`;
}

// ── Mini-Me email ──
async function sendMiniMeEmail(client) {
  const data = client.data;
  const script = generateVideoScript(data);
  const uploadUrl   = `${BASE_URL}/video-upload.html?token=${client.previewToken}`;
  const consentUrl  = `${BASE_URL}/api/mini-me-consent/${client.id}?token=${client.previewToken}`;
  const subscribeUrl= `${BASE_URL}/api/mini-me-subscribe/${client.id}?token=${client.previewToken}`;
  await sendEmail({
    to: data.email,
    subject: `🎬 Your Mini-Me AI Avatar — Next Steps — ${data.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#00D68F;margin:0;font-size:28px;">Meet Your Mini-Me</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">Your AI-powered digital twin is almost ready</p>
      </div>
      <div style="padding:32px;">
        <p>Hi ${data.ownerName || 'there'},</p>
        <p>You're signed up for <strong>Mini-Me</strong> — your personal AI avatar that represents you on your website 24/7.</p>
        <div style="background:#f8fafc;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="color:#00D68F;margin:0 0 16px;">📝 Your Script</h3>
          <p style="font-style:italic;line-height:1.9;color:#1a1a2e;white-space:pre-line;">${script}</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${uploadUrl}" style="background:#0066FF;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">📤 Upload My Video Clip</a>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${consentUrl}" style="background:#00D68F;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">✅ I Consent — Build My Mini-Me</a>
        </div>
        <div style="background:#fff8ed;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-top:24px;">
          <p style="margin:0;font-size:14px;color:#92400e;"><strong>Continue Mini-Me after your free avatar?</strong> Just $59/month. <a href="${subscribeUrl}" style="color:#0066FF;font-weight:700;">✅ Yes, sign me up →</a></p>
        </div>
        <p style="margin-top:32px;">Questions? Call <strong>(603) 922-2004</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ── Free video email ──
async function sendFreeVideoEmail(client) {
  const data = client.data;
  const script = generateVideoScript(data);
  const uploadUrl = `${BASE_URL}/video-upload.html?token=${client.previewToken}&type=promo`;
  await sendEmail({
    to: data.email,
    subject: `🎬 Your Free 60-Second Promo Video — Next Steps — ${data.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#00D68F,#0066FF);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:28px;">Your Free Promo Video</h1>
      </div>
      <div style="padding:32px;">
        <p>Hi ${data.ownerName || 'there'},</p>
        <p>As a TurnkeyAI client you get one <strong>free 60-second promotional video</strong>.</p>
        <div style="background:#f8fafc;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="color:#0066FF;margin:0 0 16px;">📝 Your Script</h3>
          <p style="font-style:italic;line-height:1.9;color:#1a1a2e;white-space:pre-line;">${script}</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${uploadUrl}" style="background:#0066FF;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">📤 Upload My Video Clip</a>
        </div>
        <p>We'll have your finished video back to you within 48 hours.</p>
        <p style="margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ── Send credentials email (client goes live) ──
async function sendCredentialsEmail(client) {
  const dashUrl = `${BASE_URL}/pages/client-dashboard.html?token=${client.dashToken}`;
  const phoneDisplay = client.twilioNumber
    ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : null;
  const phoneSection = phoneDisplay
    ? `<div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
        <p style="font-size:13px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Your Business Phone Line</p>
        <div style="font-size:28px;font-weight:700;color:#0066FF;letter-spacing:2px;font-family:'Bebas Neue',monospace;">${phoneDisplay}</div>
        <p style="font-size:13px;color:#6B7280;margin-top:10px;">This is your dedicated business number. It forwards to your cell, handles missed calls with auto text-back, and provides AI after-hours support.</p>
      </div>`
    : '';
  await sendEmail({
    to: client.data.email,
    subject: `🎉 Your website is LIVE — ${client.data.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#00D68F;margin:0;font-size:32px;">🎉 You're LIVE!</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:16px;">${client.data.businessName} is now on the internet</p>
      </div>
      <div style="padding:32px;">
        <p>Hi ${client.data.ownerName || 'there'},</p>
        <p>Congratulations — <strong>${client.data.businessName}</strong> is now live!</p>
        <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
          <p style="font-size:13px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Your Live Website</p>
          <a href="${client.liveUrl || '#'}" style="font-size:22px;font-weight:700;color:#0066FF;text-decoration:underline;">${client.liveUrl || 'Your site URL will appear here'}</a>
        </div>
        ${phoneSection}
        <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#0066FF;">📋 Your Client Dashboard</h3>
          <p style="margin:0 0 8px;"><strong>Login URL:</strong><br><a href="${dashUrl}" style="color:#0066FF;word-break:break-all;">${dashUrl}</a></p>
          <p style="margin:16px 0 0;"><strong>Password:</strong></p>
          <div style="background:#1a1a2e;color:#00D68F;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;border-radius:8px;margin-top:8px;">${client.dashPassword}</div>
        </div>
        <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(603) 922-2004</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

console.log('[module] lib/email.js loaded');

module.exports = {
  ADMIN_EMAIL,
  sendEmail,
  sendSMS,
  generateVideoScript,
  sendMiniMeEmail,
  sendFreeVideoEmail,
  sendCredentialsEmail,
};
