const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Rate limiting ──
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' }
});
const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions. Please wait a few minutes and try again.' }
});
app.use(generalLimiter);

app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const BREVO_API_KEY      = process.env.BREVO_API_KEY;
const ADMIN_EMAIL        = 'turnkeyaiservices@gmail.com';
const PORT               = process.env.PORT || 8080;
const BASE_URL           = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const CF_ACCOUNT_ID      = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN       = process.env.CLOUDFLARE_API_TOKEN;
const CF_AI_TOKEN        = process.env.CF_AI_TOKEN;
const ADMIN_KEY          = process.env.ADMIN_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE       = process.env.TWILIO_PHONE;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Startup validation ──
if (!ADMIN_KEY) { console.error('[FATAL] ADMIN_KEY env var is not set. Exiting.'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('[FATAL] DATABASE_URL env var is not set. Exiting.'); process.exit(1); }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── PostgreSQL ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      data JSONB NOT NULL DEFAULT '{}',
      preview_token TEXT,
      dash_token TEXT,
      dash_password TEXT,
      live_url TEXT,
      cf_project_name TEXT,
      mini_me_consent BOOLEAN DEFAULT FALSE,
      mini_me_consent_at TIMESTAMPTZ,
      mini_me_subscribed BOOLEAN DEFAULT FALSE,
      mini_me_subscribed_at TIMESTAMPTZ,
      mini_me_video_file TEXT,
      promo_video_file TEXT,
      free_video_requested BOOLEAN DEFAULT FALSE,
      logo_file TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Telephony columns (idempotent) ──
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS twilio_number TEXT`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS forwarding_number TEXT`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_hours_json JSONB`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telephony_enabled BOOLEAN DEFAULT FALSE`);

  // ── Coming Soon features table ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coming_soon_features (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'New Feature',
      rating_sum INTEGER DEFAULT 0,
      total_ratings INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[DB] Tables ready.');

  // ── Seed coming-soon features (idempotent) ──
  const seedFeatures = [
    ['google_business', 'Google Business Profile Sync', 'Automatically sync your website info to your Google Business Profile. When you update your site, Google updates too.', 'Google Integration', 1],
    ['lead_crm', 'Built-In Lead CRM & Pipeline', 'Every booking request, chat inquiry, and form submission captured in one dashboard. No more lost leads.', 'Lead Management', 2],
    ['review_engine', 'Automated Review Request Engine', 'After every completed job, your customer gets an automatic text or email asking for a Google review.', 'Reputation', 3],
    ['call_summaries', 'AI Call Summaries', 'Every call to your business automatically summarized by AI — who called, what they needed, and what was discussed.', 'AI Phone', 4],
    ['online_estimator', 'Online Estimator', 'Let customers get a ballpark estimate directly from your website by answering a few simple questions about their project.', 'Customer Tools', 5],
    ['domain_auto', 'One-Click Custom Domain Setup', 'Tell us the domain you want and we handle everything — registration, DNS, SSL, email forwarding.', 'Infrastructure', 6],
  ];
  for (const [id, name, description, category, sortOrder] of seedFeatures) {
    await pool.query(
      `INSERT INTO coming_soon_features (id, name, description, category, sort_order) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [id, name, description, category, sortOrder]
    );
  }
  console.log('[DB] Coming-soon features seeded.');
}

let clients = {};

async function loadClientsFromDB() {
  const result = await pool.query('SELECT * FROM clients');
  clients = {};
  for (const row of result.rows) { clients[row.id] = rowToClient(row); }
  console.log(`[DB] Loaded ${result.rows.length} clients.`);
}

function rowToClient(row) {
  return {
    id: row.id, status: row.status, data: row.data || {},
    previewToken: row.preview_token, dashToken: row.dash_token,
    dashPassword: row.dash_password, liveUrl: row.live_url,
    cfProjectName: row.cf_project_name,
    miniMeConsent: row.mini_me_consent,
    miniMeConsentAt: row.mini_me_consent_at ? row.mini_me_consent_at.toISOString() : null,
    miniMeSubscribed: row.mini_me_subscribed,
    miniMeSubscribedAt: row.mini_me_subscribed_at ? row.mini_me_subscribed_at.toISOString() : null,
    miniMeVideoFile: row.mini_me_video_file, promoVideoFile: row.promo_video_file,
    freeVideoRequested: row.free_video_requested, logoFile: row.logo_file,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    // ── Telephony fields ──
    twilioNumber: row.twilio_number || null,
    forwardingNumber: row.forwarding_number || null,
    businessHoursJson: row.business_hours_json || null,
    telephonyEnabled: row.telephony_enabled || false,
  };
}

async function saveClient(client) {
  clients[client.id] = client;
  try {
    await pool.query(`
      INSERT INTO clients (
        id,status,data,preview_token,dash_token,dash_password,
        live_url,cf_project_name,mini_me_consent,mini_me_consent_at,
        mini_me_subscribed,mini_me_subscribed_at,mini_me_video_file,
        promo_video_file,free_video_requested,logo_file,approved_at,
        twilio_number,forwarding_number,business_hours_json,telephony_enabled,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
      ON CONFLICT (id) DO UPDATE SET
        status=EXCLUDED.status, data=EXCLUDED.data,
        preview_token=EXCLUDED.preview_token, dash_token=EXCLUDED.dash_token,
        dash_password=EXCLUDED.dash_password, live_url=EXCLUDED.live_url,
        cf_project_name=EXCLUDED.cf_project_name,
        mini_me_consent=EXCLUDED.mini_me_consent,
        mini_me_consent_at=EXCLUDED.mini_me_consent_at,
        mini_me_subscribed=EXCLUDED.mini_me_subscribed,
        mini_me_subscribed_at=EXCLUDED.mini_me_subscribed_at,
        mini_me_video_file=EXCLUDED.mini_me_video_file,
        promo_video_file=EXCLUDED.promo_video_file,
        free_video_requested=EXCLUDED.free_video_requested,
        logo_file=EXCLUDED.logo_file, approved_at=EXCLUDED.approved_at,
        twilio_number=EXCLUDED.twilio_number,
        forwarding_number=EXCLUDED.forwarding_number,
        business_hours_json=EXCLUDED.business_hours_json,
        telephony_enabled=EXCLUDED.telephony_enabled,
        updated_at=NOW()
    `, [
      client.id, client.status, JSON.stringify(client.data),
      client.previewToken, client.dashToken, client.dashPassword,
      client.liveUrl, client.cfProjectName,
      client.miniMeConsent || false, client.miniMeConsentAt || null,
      client.miniMeSubscribed || false, client.miniMeSubscribedAt || null,
      client.miniMeVideoFile || null, client.promoVideoFile || null,
      client.freeVideoRequested || false, client.logoFile || null,
      client.approvedAt || null,
      client.twilioNumber || null,
      client.forwardingNumber || null,
      client.businessHoursJson ? JSON.stringify(client.businessHoursJson) : null,
      client.telephonyEnabled || false,
    ]);
  } catch(e) { console.error('[saveClient]', e.message); }
}

function makeToken()    { return crypto.randomBytes(16).toString('hex'); }
function makePassword() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function makeSlug(n) {
  return (n||'client').toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim()
    .replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,40).replace(/-$/,'');
}

// ── Input validation ──
function validate(body, required) {
  for (const [field, label] of required) {
    const val = (body[field] || '').toString().trim();
    if (!val) return `Missing required field: ${label}`;
    if (val.length > 2000) return `Field too long: ${label}`;
  }
  const email = body.email || body.uploaderEmail || '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address';
  return null;
}

// ── MRR calculation ──
function calculateMRR() {
  const active = Object.values(clients).filter(c => c.status === 'active');
  let total = 0;
  for (const c of active) {
    let base = 99;
    const plan = (c.data.plan || c.data.tier || c.data.packageType || '').toLowerCase();
    if (plan.includes('social') || plan.includes('full') || plan === '159') base = 159;
    else if (plan.includes('blog') || plan === '129') base = 129;
    else if (plan === '218') base = 218;
    if (base === 99 && c.data.wants_social === 'yes') base = 159;
    else if (base === 99 && c.data.wants_blog === 'yes') base = 129;
    if (c.miniMeSubscribed) base += 59;
    total += base;
  }
  return { total, activeCount: active.length, perClient: active.length ? Math.round(total / active.length) : 0 };
}

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

// ── SMS via Twilio ──
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

// ════════════════════════════════════════════════
// ── TELEPHONY SUITE ──
// ════════════════════════════════════════════════

// ── Provision a Twilio phone number for a client ──
async function provisionTwilioNumber(client) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[Telephony] Missing Twilio credentials — provisioning skipped');
    return null;
  }
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' };

  // Extract area code from client's phone
  const clientPhone = (client.data.phone || '').replace(/\D/g, '');
  const areaCode = clientPhone.length >= 10 ? clientPhone.slice(clientPhone.length - 10, clientPhone.length - 7) : '';

  let availableNumber = null;

  // Try local area code first
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

  // Fallback: any US number
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

  // Purchase the number
  try {
    const voiceUrl = `${BASE_URL}/api/telephony/voice`;
    const voiceStatusUrl = `${BASE_URL}/api/telephony/voice-status`;
    const smsUrl = `${BASE_URL}/api/telephony/sms-incoming`;

    const buyParams = new URLSearchParams({
      PhoneNumber: availableNumber,
      VoiceUrl: voiceUrl,
      VoiceMethod: 'POST',
      StatusCallback: voiceStatusUrl,
      StatusCallbackMethod: 'POST',
      SmsUrl: smsUrl,
      SmsMethod: 'POST',
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

    // Update client record
    client.twilioNumber = twilioNumber;
    client.forwardingNumber = client.data.phone || '';
    client.telephonyEnabled = true;

    // Build business hours JSON from intake data
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

    // Notify admin
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

// ── Check if current time is outside business hours ──
function isAfterHours(client) {
  if (!client.businessHoursJson) return false; // If no hours set, assume always open

  const now = new Date();
  // Default to Central Time (CST/CDT)
  const ctString = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const ct = new Date(ctString);

  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const today = dayNames[ct.getDay()];
  const dayConfig = client.businessHoursJson[today];

  if (!dayConfig || !dayConfig.open) return true; // Closed today = after hours

  // Parse hours string like "9:00 AM - 5:00 PM" or "9:00 AM – 5:00 PM"
  const hoursStr = (dayConfig.hours || '').replace(/–/g, '-');
  const parts = hoursStr.split('-').map(s => s.trim());
  if (parts.length !== 2) return false; // Can't parse, assume open

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
  if (openMin === null || closeMin === null) return false; // Can't parse, assume open

  const nowMin = ct.getHours() * 60 + ct.getMinutes();
  return nowMin < openMin || nowMin >= closeMin;
}

// ── Find client by their Twilio number ──
function findClientByTwilioNumber(twilioNumber) {
  return Object.values(clients).find(c => c.twilioNumber === twilioNumber && c.telephonyEnabled);
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

// ── Generate TwiML response string ──
function twiml(content) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
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

// ── Deploy to Cloudflare Pages ──
async function deployToCloudflarePages(projectName, htmlContent) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    console.warn('[CF Pages] Missing credentials — skipping'); return { url: null, skipped: true };
  }
  const checkRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`,
    { headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` } }
  );
  if (!checkRes.ok) {
    const createRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName, production_branch: 'main' })
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error('CF Pages create failed: ' + JSON.stringify(createData.errors));
    await new Promise(r => setTimeout(r, 3000));
  }
  const { execSync } = require('child_process');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tkai-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), htmlContent, 'utf8');
    const cmd = `npx wrangler@3 pages deploy "${tmpDir}" --project-name="${projectName}" --branch=main --commit-dirty=true`;
    try {
      execSync(cmd, {
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: CF_API_TOKEN },
        stdio: 'pipe',
        timeout: 60000
      });
    } catch(err) {
      const detail = err.stderr ? err.stderr.toString() : err.message;
      throw new Error('Wrangler deploy failed: ' + detail);
    }
    return { url: `https://${projectName}.pages.dev` };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
  }
}

// ── Send credentials email ──
async function sendCredentialsEmail(client) {
  const dashUrl = `${BASE_URL}/client-dashboard.html?token=${client.dashToken}`;
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
          <a href="${client.liveUrl}" style="font-size:22px;font-weight:700;color:#0066FF;text-decoration:none;">${client.liveUrl}</a>
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

// ── Run deploy (first-time: generates tokens, sends credentials email) ──
async function runDeploy(client) {
  const dashToken   = makeToken();
  const dashPassword= makePassword();
  const projectName = `turnkeyai-${makeSlug(client.data.businessName)}`;
  const liveHTML    = generateSiteHTML(client.data, false, client);
  const deployment  = await deployToCloudflarePages(projectName, liveHTML);
  client.status       = 'active';
  client.dashToken    = dashToken;
  client.dashPassword = dashPassword;
  client.liveUrl      = deployment.url || `https://${projectName}.pages.dev`;
  client.cfProjectName= projectName;
  client.approvedAt   = new Date().toISOString();
  client.updatedAt    = new Date().toISOString();
  await saveClient(client);
  await sendCredentialsEmail(client);
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `✅ LIVE: ${client.data.businessName}`,
    html: `<p><strong>${client.data.businessName}</strong> is live at <a href="${client.liveUrl}">${client.liveUrl}</a></p><p>Dashboard password: <strong>${client.dashPassword}</strong></p><p>${client.data.ownerName} — ${client.data.email} — ${client.data.phone}</p>`
  });
  if (client.data.addon_after_hours === 'yes' || client.data.addon_missed_call === 'yes') {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📞 Phone Services Needed: ${client.data.businessName}`,
      html: `<p>After Hours: ${client.data.addon_after_hours==='yes'?'✅':'❌'} | Missed Call SMS: ${client.data.addon_missed_call==='yes'?'✅':'❌'}</p><p>Phone: ${client.data.phone}</p>`
    }).catch(()=>{});
  }

  // ── Telephony: auto-provision after successful deploy ──
  try {
    if (client.data.phone) {
      console.log(`[Telephony] Provisioning number for ${client.data.businessName}...`);
      await provisionTwilioNumber(client);
      // Re-deploy with Twilio number on the site if provisioning succeeded
      if (client.twilioNumber) {
        console.log(`[Telephony] Re-deploying site with Twilio number for ${client.data.businessName}...`);
        const updatedHTML = generateSiteHTML(client.data, false, client);
        await deployToCloudflarePages(client.cfProjectName, updatedHTML);
      }
    }
  } catch (telErr) {
    console.error('[Telephony] Provisioning failed (deploy still succeeded):', telErr.message);
  }

  return client;
}

// ── Redeploy live site only (no token/password reset, no credentials email) ──
async function redeployLive(client) {
  if (!client.cfProjectName) throw new Error('No CF project name — site has not been deployed yet.');
  const liveHTML = generateSiteHTML(client.data, false, client);
  await deployToCloudflarePages(client.cfProjectName, liveHTML);
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
}

// ── FINALIZED DESIGN STANDARD: Gulf Coast Template ──
function generateSiteHTML(data, isPreview, clientObj) {
  const biz      = data.businessName || 'Your Business';
  const owner    = data.ownerName || '';
  const rawPhone = data.phone || '';
  // Use Twilio number on live sites if available
  const phone    = (!isPreview && clientObj && clientObj.twilioNumber)
    ? clientObj.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : rawPhone;
  const phoneRaw = phone.replace(/\D/g, '');
  const email    = data.email || '';
  const city     = data.city || data.targetCity || '';
  const state    = data.state || '';
  const address  = [data.address, city, state, data.zip].filter(Boolean).join(', ');
  const about    = data.aboutUs || '';
  const tagline  = data.missionStatement || `Quality service you can count on.`;
  const industry = (data.industry || 'local business').replace(/_/g,' ');
  const advantage= data.competitiveAdvantage || '';
  const awards   = data.awards || '';
  const ownerPhoto  = data.ownerPhoto || '';
  const miniMeVideo = data.miniMeVideoUrl || '';
  const chatName    = data.chatName || 'Chat With Us';

  const heroImages = {
    plumbing:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80',
    electrician:'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1600&q=80',
    electrical:'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1600&q=80',
    hvac:'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80',
    roofing:'https://images.unsplash.com/photo-1632823471565-1ecdf5c6da12?w=1600&q=80',
    landscaping:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d84?w=1600&q=80',
    lawn:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d84?w=1600&q=80',
    cleaning:'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1600&q=80',
    auto_repair:'https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=1600&q=80',
    automotive:'https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=1600&q=80',
    restaurant:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80',
    salon:'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=80',
    fencing:'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?w=1600&q=80',
    construction:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
    painting:'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=1600&q=80',
    pest_control:'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=1600&q=80',
    default:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
  };
  const industryKey = (data.industry||'').toLowerCase().replace(/ /g,'_');
  const heroImage = heroImages[industryKey] || heroImages.default;

  const iconSet = {
    plumbing:['fa-faucet-drip','fa-toilet','fa-fire-flame-curved','fa-pipe-section','fa-house-flood-water','fa-bolt'],
    electrician:['fa-bolt','fa-plug','fa-lightbulb','fa-solar-panel','fa-screwdriver-wrench','fa-shield-halved'],
    electrical:['fa-bolt','fa-plug','fa-lightbulb','fa-solar-panel','fa-screwdriver-wrench','fa-shield-halved'],
    hvac:['fa-wind','fa-temperature-half','fa-fan','fa-snowflake','fa-fire','fa-wrench'],
    roofing:['fa-house-chimney','fa-hammer','fa-hard-hat','fa-cloud-rain','fa-shield-halved','fa-star'],
    landscaping:['fa-leaf','fa-seedling','fa-tree','fa-scissors','fa-sun','fa-tractor'],
    lawn:['fa-leaf','fa-seedling','fa-tree','fa-scissors','fa-sun','fa-tractor'],
    cleaning:['fa-broom','fa-spray-can','fa-soap','fa-star','fa-shield-halved','fa-house'],
    auto_repair:['fa-car','fa-wrench','fa-oil-can','fa-gear','fa-gauge-high','fa-screwdriver-wrench'],
    restaurant:['fa-utensils','fa-pizza-slice','fa-burger','fa-wine-glass','fa-star','fa-clock'],
    salon:['fa-scissors','fa-spa','fa-star','fa-heart','fa-clock','fa-shield-halved'],
    default:['fa-star','fa-shield-halved','fa-wrench','fa-thumbs-up','fa-clock','fa-phone'],
  }[industryKey] || ['fa-star','fa-shield-halved','fa-wrench','fa-thumbs-up','fa-clock','fa-phone'];

  const palettes = {
    plumbing:{primary:'#0a1628',accent:'#f59e0b',accent2:'#e85d04'},
    electrician:{primary:'#0f172a',accent:'#f59e0b',accent2:'#eab308'},
    electrical:{primary:'#0f172a',accent:'#f59e0b',accent2:'#eab308'},
    hvac:{primary:'#0c1a2e',accent:'#38bdf8',accent2:'#0ea5e9'},
    roofing:{primary:'#1c0a0a',accent:'#f59e0b',accent2:'#b91c1c'},
    landscaping:{primary:'#14532d',accent:'#84cc16',accent2:'#16a34a'},
    lawn:{primary:'#14532d',accent:'#84cc16',accent2:'#16a34a'},
    cleaning:{primary:'#0a1628',accent:'#06b6d4',accent2:'#0891b2'},
    auto_repair:{primary:'#1e1b4b',accent:'#f59e0b',accent2:'#f97316'},
    restaurant:{primary:'#1c0a0a',accent:'#f97316',accent2:'#dc2626'},
    salon:{primary:'#1e1b4b',accent:'#ec4899',accent2:'#a855f7'},
    default:{primary:'#0a1628',accent:'#f59e0b',accent2:'#e85d04'},
  };
  let pal = palettes[industryKey] || palettes.default;
  if (data.colorPreference) {
    const cp = data.colorPreference.toLowerCase();
    if      (cp.includes('red'))    pal = {primary:'#1c0a0a',accent:'#f59e0b',accent2:'#dc2626'};
    else if (cp.includes('green'))  pal = {primary:'#14532d',accent:'#84cc16',accent2:'#16a34a'};
    else if (cp.includes('purple')) pal = {primary:'#1e1b4b',accent:'#a78bfa',accent2:'#7c3aed'};
    else if (cp.includes('orange')) pal = {primary:'#1c1917',accent:'#f59e0b',accent2:'#ea580c'};
    else if (cp.includes('teal'))   pal = {primary:'#042f2e',accent:'#06b6d4',accent2:'#0d9488'};
    else if (cp.includes('blue'))   pal = {primary:'#0a1628',accent:'#38bdf8',accent2:'#0066FF'};
    else if (cp.includes('pink'))   pal = {primary:'#1e1b4b',accent:'#ec4899',accent2:'#a855f7'};
  }

  const serviceItems = [];
  Object.keys(data).forEach(k => {
    if (k.startsWith('service_') && data[k] === 'on') {
      const name = k.replace('service_','').replace(/_/g,' ');
      const price = data['price_'+k.replace('service_','')] || '';
      serviceItems.push({ name: name.charAt(0).toUpperCase()+name.slice(1), price });
    }
  });
  if (data.additionalServices) {
    data.additionalServices.split('\n').forEach(s => s.trim() && serviceItems.push({ name: s.trim(), price: '' }));
  }

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hoursData = days.map((d,i) => data['day_'+d] ? { label: dayLabels[i], hours: data['hours_'+d]||'Open' } : null).filter(Boolean);

  const payKeys = ['cash','card','check','venmo','cashapp','zelle'];
  const payLabels = {cash:'Cash',card:'Credit/Debit Card',check:'Check',venmo:'Venmo',cashapp:'CashApp',zelle:'Zelle'};
  const payMethods = payKeys.filter(k => data['pay_'+k]).map(k => payLabels[k]).join(' · ');

  const clientId    = data.id || '';
  const previewToken= data._previewToken || '';
  const clientApproveUrl = clientId && previewToken ? `${BASE_URL}/api/client-approve/${clientId}?token=${previewToken}` : '';

  const previewBanner = isPreview
    ? `<div style="background:#1a1d24;border-bottom:2px solid #f59e0b;padding:0;position:relative;z-index:101;">
        <div style="padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="color:#f59e0b;font-weight:700;font-size:14px;">🔍 PREVIEW — This site is not yet live</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${clientApproveUrl?`<a href="${clientApproveUrl}" style="background:#00D68F;color:#071c12;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">✅ Approve &amp; Go Live →</a>`:''}
            <button onclick="document.getElementById('changeModal').style.display='flex'" style="background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.25);color:white;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">✏️ Request Changes</button>
          </div>
        </div>
      </div>
      <div id="changeModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;align-items:center;justify-content:center;padding:24px;" onclick="if(event.target===this)this.style.display='none'">
        <div style="background:#1a1d24;border:1px solid #2e3240;border-radius:20px;padding:36px;width:100%;max-width:500px;color:white;">
          <h2 style="font-size:20px;font-weight:800;margin:0 0 8px;font-family:sans-serif;">Request Changes</h2>
          <p style="color:rgba(255,255,255,.6);font-size:14px;margin:0 0 24px;">Choose how you'd like to make changes:</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <button onclick="document.getElementById('changeModal').style.display='none';document.getElementById('changeSection').style.display='block';window.scrollTo(0,99999)" style="background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;padding:18px;cursor:pointer;color:white;text-align:left;font-family:inherit;">
              <div style="font-size:24px;margin-bottom:8px;">✏️</div>
              <div style="font-weight:700;font-size:14px;">Minor Changes</div>
              <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Edit text, hours, services yourself</div>
            </button>
            <button onclick="document.getElementById('changeModal').style.display='none';document.getElementById('majorChangeSection').style.display='block';window.scrollTo(0,99999)" style="background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;padding:18px;cursor:pointer;color:white;text-align:left;font-family:inherit;">
              <div style="font-size:24px;margin-bottom:8px;">📧</div>
              <div style="font-weight:700;font-size:14px;">Major Changes</div>
              <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Describe it — we handle everything</div>
            </button>
          </div>
          <button onclick="document.getElementById('changeModal').style.display='none'" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;color:rgba(255,255,255,.6);cursor:pointer;font-family:inherit;font-size:14px;">Cancel</button>
        </div>
      </div>
      <div id="changeSection" style="display:none;background:#f4f6fa;border-top:3px solid #0066FF;padding:40px 24px;">
        <div style="max-width:700px;margin:0 auto;">
          <h2 style="font-family:sans-serif;font-size:24px;font-weight:800;color:#1a1d24;margin:0 0 6px;">✏️ Update Your Information</h2>
          <p style="color:#6b7280;margin:0 0 28px;font-size:15px;">Make changes below — click Submit to send updates to TurnkeyAI for review.</p>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:28px;margin-bottom:16px;">
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Business Name</label><input id="upd_biz" type="text" value="${(data.businessName||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Phone Number</label><input id="upd_phone" type="text" value="${(data.phone||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Tagline / Mission Statement</label><input id="upd_tagline" type="text" value="${(data.missionStatement||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">About Us</label><textarea id="upd_about" rows="4" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;resize:vertical;">${(data.aboutUs||'').replace(/<[^>]*>/g,'')}</textarea></div>
            <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Additional Notes for TurnkeyAI</label><textarea id="upd_notes" rows="3" placeholder="Anything else you want changed..." style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;resize:vertical;"></textarea></div>
          </div>
          <button onclick="submitMinorChanges()" style="background:#0066FF;color:white;border:none;border-radius:10px;padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:sans-serif;">Submit Changes to TurnkeyAI →</button>
          <button onclick="document.getElementById('changeSection').style.display='none'" style="margin-left:12px;background:none;border:none;color:#6b7280;font-size:14px;cursor:pointer;font-family:sans-serif;">Cancel</button>
        </div>
      </div>
      <div id="majorChangeSection" style="display:none;background:#f4f6fa;border-top:3px solid #00D68F;padding:40px 24px;">
        <div style="max-width:700px;margin:0 auto;">
          <h2 style="font-family:sans-serif;font-size:24px;font-weight:800;color:#1a1d24;margin:0 0 6px;">📧 Tell Us What You Need</h2>
          <p style="color:#6b7280;margin:0 0 28px;font-size:15px;">Describe the changes and we'll handle everything within 24–48 hours.</p>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:28px;margin-bottom:16px;">
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Your Name</label><input id="maj_name" type="text" value="${(data.ownerName||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Your Email</label><input id="maj_email" type="email" value="${(data.email||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Describe What You Want Changed</label><textarea id="maj_details" rows="6" placeholder="Be as specific as possible..." style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;resize:vertical;"></textarea></div>
          </div>
          <button onclick="submitMajorChanges()" style="background:#00D68F;color:#071c12;border:none;border-radius:10px;padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:sans-serif;">Send to TurnkeyAI →</button>
          <button onclick="document.getElementById('majorChangeSection').style.display='none'" style="margin-left:12px;background:none;border:none;color:#6b7280;font-size:14px;cursor:pointer;font-family:sans-serif;">Cancel</button>
        </div>
      </div>
      <script>
      function submitMinorChanges(){
        var changes={businessName:document.getElementById('upd_biz').value,phone:document.getElementById('upd_phone').value,missionStatement:document.getElementById('upd_tagline').value,aboutUs:document.getElementById('upd_about').value,notes:document.getElementById('upd_notes').value};
        fetch('${BASE_URL}/api/preview-change-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'minor',clientId:'${clientId}',token:'${previewToken}',changes:changes})})
        .then(function(){document.getElementById('changeSection').style.display='none';var b=document.createElement('div');b.style='position:fixed;bottom:24px;right:24px;background:#00D68F;color:#071c12;padding:16px 24px;border-radius:12px;font-weight:700;font-size:14px;z-index:9999;font-family:sans-serif;';b.textContent='✅ Changes sent! We will update your site within 24 hours.';document.body.appendChild(b);setTimeout(function(){b.remove();},5000);})
        .catch(function(){alert('Send failed. Please email turnkeyaiservices@gmail.com');});
      }
      function submitMajorChanges(){
        var details={name:document.getElementById('maj_name').value,email:document.getElementById('maj_email').value,details:document.getElementById('maj_details').value};
        fetch('${BASE_URL}/api/preview-change-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'major',clientId:'${clientId}',token:'${previewToken}',changes:details})})
        .then(function(){document.getElementById('majorChangeSection').style.display='none';var b=document.createElement('div');b.style='position:fixed;bottom:24px;right:24px;background:#00D68F;color:#071c12;padding:16px 24px;border-radius:12px;font-weight:700;font-size:14px;z-index:9999;font-family:sans-serif;';b.textContent='✅ Message sent! We will be in touch within 24 hours.';document.body.appendChild(b);setTimeout(function(){b.remove();},5000);})
        .catch(function(){alert('Send failed. Please email turnkeyaiservices@gmail.com');});
      }
      <\/script>`
    : `<div style="background:${pal.primary};color:rgba(255,255,255,.7);text-align:center;padding:10px 24px;font-size:13px;">⚡ Powered by <a href="https://turnkeyaiservices.com" style="color:${pal.accent};font-weight:700;text-decoration:none;">TurnkeyAI Services</a></div>`;

  const serviceCardsHTML = serviceItems.map((s,i) => `
    <div class="svc-card" style="background:white;border-radius:14px;padding:1.8rem;box-shadow:0 4px 24px rgba(10,22,40,.08);border:1px solid rgba(10,22,40,.06);transition:transform .25s,box-shadow .25s;position:relative;overflow:hidden;">
      <div style="width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,${pal.accent},${pal.accent2});display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:white;margin-bottom:1.1rem;">
        <i class="fas ${iconSet[i%iconSet.length]}"></i>
      </div>
      <h3 style="font-size:1.05rem;font-weight:700;color:#1e293b;margin-bottom:.5rem;">${s.name}</h3>
      ${s.price?`<p style="font-weight:700;color:${pal.accent};font-size:1rem;">${s.price}</p>`:'<p style="font-size:.88rem;color:#64748b;line-height:1.6;">Professional service you can count on.</p>'}
    </div>`).join('');

  const hoursRows = hoursData.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);">
      <span style="color:rgba(255,255,255,.75);font-size:.95rem;">${h.label}</span>
      <span style="color:white;font-weight:600;font-size:.95rem;">${h.hours}</span>
    </div>`).join('');

  const miniMeSection = miniMeVideo ? `
    <section style="padding:5rem 1.5rem;background:${pal.primary};text-align:center;">
      <div style="max-width:680px;margin:0 auto;">
        <div style="display:inline-block;background:${pal.accent};color:${pal.primary};padding:5px 16px;border-radius:50px;font-size:.75rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:1.2rem;">A Message From ${owner||'Our Team'}</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:2.8rem;color:white;letter-spacing:1.5px;margin-bottom:1.5rem;">Meet Us Personally</h2>
        <video src="${miniMeVideo}" controls style="width:100%;border-radius:16px;max-height:380px;box-shadow:0 20px 60px rgba(0,0,0,.5);"></video>
      </div>
    </section>` : '';

  const chatSystem = `You work for ${biz}, a ${industry} business in ${city}. Be helpful and friendly. Answer questions about services, pricing, hours, and location. Phone: ${phone}. Email: ${email}. ${advantage?'What sets us apart: '+advantage:''}`;

  const bizWords  = biz.split(' ');
  const bizFirst  = bizWords.slice(0,-1).join(' ') || biz;
  const bizLast   = bizWords.length > 1 ? bizWords.slice(-1)[0] : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${biz}${isPreview?' | PREVIEW':''} | ${city}</title>
  <meta name="description" content="${tagline} Serving ${city}${state?', '+state:''}. ${phone?'Call '+phone:''}">
  <meta property="og:title" content="${biz}">
  <meta property="og:description" content="${tagline}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#050d1a;overflow-x:hidden;-webkit-font-smoothing:antialiased}
    img{max-width:100%}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(10,22,40,.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(245,158,11,.18)}
    .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:white;letter-spacing:2px}
    .nav-logo span{color:${pal.accent}}
    .nav-links{display:flex;gap:1.5rem;list-style:none;align-items:center}
    .nav-links a{color:rgba(255,255,255,.8);text-decoration:none;font-size:.88rem;font-weight:500;letter-spacing:.4px;transition:color .2s}
    .nav-links a:hover{color:${pal.accent}}
    .nav-cta{background:${pal.accent}!important;color:${pal.primary}!important;padding:.5rem 1.2rem;border-radius:6px;font-weight:700!important}
    .hero{min-height:100vh;position:relative;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding-top:70px}
    .hero-bg{position:absolute;inset:0;background-image:url('${heroImage}');background-size:cover;background-position:center;animation:slowZoom 20s ease-in-out infinite alternate}
    @keyframes slowZoom{from{transform:scale(1.03)}to{transform:scale(1.1)}}
    .hero-overlay{position:absolute;inset:0;background:linear-gradient(160deg,rgba(10,22,40,.93) 0%,rgba(26,58,107,.72) 55%,rgba(232,93,4,.18) 100%)}
    .hero-content{position:relative;z-index:2;max-width:820px;padding:0 1.5rem;animation:fadeUp .9s ease both}
    @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    .hero-badge{display:inline-flex;align-items:center;gap:.5rem;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);color:${pal.accent};font-size:.75rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:.4rem 1rem;border-radius:50px;margin-bottom:1.4rem}
    .hero h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(3.2rem,8vw,6rem);color:white;line-height:1;letter-spacing:2px;margin-bottom:1.1rem}
    .hero h1 span{color:${pal.accent}}
    .hero p{font-size:1.1rem;color:rgba(255,255,255,.82);line-height:1.7;max-width:540px;margin:0 auto 2rem}
    .hero-btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
    .btn-primary{background:${pal.accent};color:${pal.primary};padding:.85rem 1.9rem;border-radius:8px;font-weight:700;font-size:.97rem;text-decoration:none;border:none;cursor:pointer;transition:all .25s;display:inline-flex;align-items:center;gap:.5rem;font-family:inherit}
    .btn-primary:hover{background:${pal.accent2};color:white;transform:translateY(-2px);box-shadow:0 8px 25px rgba(245,158,11,.4)}
    .btn-outline{background:transparent;color:white;padding:.85rem 1.9rem;border-radius:8px;font-weight:600;font-size:.97rem;text-decoration:none;border:2px solid rgba(255,255,255,.35);cursor:pointer;transition:all .25s;display:inline-flex;align-items:center;gap:.5rem}
    .btn-outline:hover{border-color:${pal.accent};color:${pal.accent};transform:translateY(-2px)}
    .hero-stats{display:flex;justify-content:center;gap:2.5rem;flex-wrap:wrap;margin-top:2.5rem}
    .stat strong{display:block;font-family:'Bebas Neue',sans-serif;font-size:2rem;color:${pal.accent};letter-spacing:1px}
    .stat span{font-size:.75rem;color:rgba(255,255,255,.55);letter-spacing:.5px}
    .trust-bar{background:${pal.accent};padding:.85rem 2rem;display:flex;align-items:center;justify-content:center;gap:2rem;flex-wrap:wrap}
    .trust-bar span{font-size:.78rem;font-weight:700;color:${pal.primary};letter-spacing:.5px;display:flex;align-items:center;gap:.4rem;text-transform:uppercase}
    section{padding:5.5rem 1.5rem}
    .container{max-width:1080px;margin:0 auto}
    .section-label{font-size:.72rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${pal.accent};margin-bottom:.5rem}
    .section-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(2rem,5vw,3.2rem);letter-spacing:1.5px;line-height:1.05;margin-bottom:.9rem}
    .section-sub{font-size:1rem;color:#64748b;line-height:1.7;max-width:520px}
    .services-section{background:#f0f4ff}
    .services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}
    .svc-card:hover{transform:translateY(-5px)!important;box-shadow:0 16px 48px rgba(10,22,40,.14)!important}
    .why-section{background:${pal.primary};position:relative;overflow:hidden}
    .why-bg{position:absolute;inset:0;background-image:url('${heroImage}');background-size:cover;opacity:.07}
    .why-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.4rem;margin-top:2.8rem}
    .why-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:1.7rem;transition:background .25s,transform .25s}
    .why-card:hover{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);transform:translateY(-4px)}
    .why-card i{font-size:1.7rem;color:${pal.accent};margin-bottom:.9rem;display:block}
    .why-card h4{font-size:.97rem;font-weight:700;color:white;margin-bottom:.45rem}
    .why-card p{font-size:.84rem;color:rgba(255,255,255,.5);line-height:1.6}
    .reviews-section{background:white}
    .reviews-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}
    .review-card{background:#f0f4ff;border-radius:14px;padding:1.7rem;border-left:4px solid ${pal.accent};transition:transform .2s}
    .review-card:hover{transform:translateY(-4px)}
    .stars{color:${pal.accent};font-size:.88rem;margin-bottom:.75rem}
    .review-card p{font-size:.92rem;color:#1e293b;line-height:1.7;font-style:italic;margin-bottom:.9rem}
    .reviewer{font-size:.8rem;font-weight:700;color:#0a1628}
    .booking-section{background:#f0f4ff}
    .booking-wrap{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:2.8rem;align-items:start}
    .booking-form{background:white;border-radius:16px;padding:2rem;box-shadow:0 8px 32px rgba(10,22,40,.1)}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.9rem;margin-bottom:.9rem}
    .form-group{display:flex;flex-direction:column;gap:.3rem;margin-bottom:.9rem}
    .form-group label{font-size:.72rem;font-weight:700;color:#0a1628;letter-spacing:.3px;text-transform:uppercase}
    .form-group input,.form-group select,.form-group textarea{border:1.5px solid #e2e8f0;border-radius:8px;padding:.65rem .85rem;font-size:.9rem;font-family:inherit;color:#1e293b;background:#f8fafc;outline:none}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:${pal.accent}}
    .form-group textarea{resize:vertical;min-height:75px}
    .btn-book{width:100%;background:${pal.accent};color:${pal.primary};border:none;border-radius:8px;padding:.88rem;font-size:.97rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:.5rem}
    .btn-book:hover{background:${pal.accent2};color:white}
    .cta-section{background:linear-gradient(135deg,${pal.primary} 0%,#1a3a6b 60%,rgba(232,93,4,.2) 100%);text-align:center}
    .cta-phone{display:block;font-family:'Bebas Neue',sans-serif;font-size:2.6rem;color:${pal.accent};text-decoration:none;letter-spacing:2px;margin-bottom:1.4rem}
    footer{background:#050d1a;padding:2.5rem 1.5rem 1.8rem;border-top:1px solid rgba(245,158,11,.15)}
    .footer-inner{max-width:1080px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1.2rem}
    .footer-logo{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:white;letter-spacing:2px}
    .footer-logo span{color:${pal.accent}}
    .footer-links{display:flex;gap:1.4rem}
    .footer-links a{color:rgba(255,255,255,.45);font-size:.82rem;text-decoration:none}
    .footer-copy{color:rgba(255,255,255,.25);font-size:.75rem;width:100%;text-align:center;margin-top:1.4rem;padding-top:1.4rem;border-top:1px solid rgba(255,255,255,.06)}
    #chatWidget{position:fixed;bottom:24px;right:24px;z-index:9999}
    #chatToggleBtn{background:linear-gradient(135deg,${pal.accent},${pal.accent2});color:${pal.primary};border:none;border-radius:50px;padding:13px 20px;font-size:.92rem;font-weight:700;cursor:pointer;box-shadow:0 6px 24px rgba(245,158,11,.4);font-family:inherit;display:flex;align-items:center;gap:8px}
    #chatBox{display:none;flex-direction:column;background:white;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,.2);width:330px;max-height:470px;overflow:hidden;border:1px solid #e5e7eb}
    #chatHeader{background:linear-gradient(135deg,${pal.primary},#1a3a6b);color:white;padding:15px 18px;display:flex;justify-content:space-between;align-items:center}
    #chatMessages{flex:1;overflow-y:auto;padding:14px;min-height:210px;background:#f9fafb}
    #chatInputRow{padding:11px;border-top:1px solid #e5e7eb;display:flex;gap:8px;background:white}
    #chatInput{flex:1;padding:9px 13px;border:2px solid #e5e7eb;border-radius:10px;font-size:.88rem;font-family:inherit;outline:none}
    #chatSendBtn{background:${pal.accent};color:${pal.primary};border:none;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:700;font-family:inherit}
    .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
    .reveal.visible{opacity:1;transform:translateY(0)}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @media(max-width:768px){.booking-wrap{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}.nav-links li:not(:last-child){display:none}}
  </style>
</head>
<body>

${previewBanner}

<nav>
  <div class="nav-logo">${bizFirst} <span>${bizLast}</span></div>
  <ul class="nav-links">
    <li><a href="#services">Services</a></li>
    <li><a href="#why">Why Us</a></li>
    <li><a href="#reviews">Reviews</a></li>
    <li><a href="#booking">Book Now</a></li>
    <li><a href="#contact" class="nav-cta">Get a Quote</a></li>
  </ul>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <div class="hero-badge"><i class="fas fa-shield-halved"></i> Licensed &amp; Insured · ${city}${state?', '+state:''}</div>
    <h1>${bizFirst} <span>${bizLast}</span></h1>
    <p>${tagline}</p>
    <div class="hero-btns">
      ${phone?`<a href="tel:${phoneRaw}" class="btn-primary"><i class="fas fa-phone"></i> Call Now — Free Estimate</a>`:''}
      <a href="#services" class="btn-outline"><i class="fas fa-wrench"></i> Our Services</a>
    </div>
    <div class="hero-stats">
      ${awards?`<div class="stat"><strong>🏆</strong><span>${awards}</span></div>`:''}
      <div class="stat"><strong>5★</strong><span>Average Rating</span></div>
      <div class="stat"><strong>24/7</strong><span>Emergency Line</span></div>
      <div class="stat"><strong>100%</strong><span>Satisfaction</span></div>
    </div>
  </div>
</section>

<div class="trust-bar reveal">
  <span><i class="fas fa-check-circle"></i> Licensed &amp; Bonded</span>
  <span><i class="fas fa-clock"></i> Same-Day Service</span>
  <span><i class="fas fa-dollar-sign"></i> Upfront Pricing</span>
  <span><i class="fas fa-star"></i> 5-Star Rated</span>
  <span><i class="fas fa-map-marker-alt"></i> ${city}${state?', '+state:''} &amp; Surrounding Areas</span>
</div>

${miniMeSection}

${serviceItems.length?`
<section class="services-section" id="services">
  <div class="container">
    <div class="reveal">
      <div class="section-label">What We Do</div>
      <h2 class="section-title" style="color:#0a1628;">Our Services</h2>
      <p class="section-sub">Proudly serving ${city}${state?', '+state:''} and surrounding areas.</p>
    </div>
    <div class="services-grid">${serviceCardsHTML}</div>
    ${payMethods?`<div class="reveal" style="text-align:center;margin-top:2rem;padding:1.2rem;background:white;border-radius:10px;"><p style="color:#64748b;font-size:.92rem;">💳 We accept: <strong style="color:#0a1628;">${payMethods}</strong></p></div>`:''}
  </div>
</section>`:''}

<section class="why-section" id="why">
  <div class="why-bg"></div>
  <div class="container" style="position:relative;z-index:2;">
    <div class="reveal">
      <div class="section-label">Why Choose Us</div>
      <h2 class="section-title" style="color:white;">The ${city} Standard</h2>
      <p class="section-sub" style="color:rgba(255,255,255,.6);">We're not just a ${industry} company — we're your neighbors.</p>
    </div>
    <div class="why-grid">
      <div class="why-card reveal"><i class="fas fa-stopwatch"></i><h4>Fast Response</h4><p>Same-day service available. 60-minute target arrival for emergencies.</p></div>
      <div class="why-card reveal"><i class="fas fa-tag"></i><h4>Upfront Pricing</h4><p>Flat price quoted before we start. No surprises, ever.</p></div>
      <div class="why-card reveal"><i class="fas fa-certificate"></i><h4>Licensed Professionals</h4><p>Every job performed by fully licensed and insured technicians.</p></div>
      <div class="why-card reveal"><i class="fas fa-broom"></i><h4>Clean Job Sites</h4><p>We protect your property and clean up completely before we leave.</p></div>
    </div>
    ${advantage?`<div class="reveal" style="margin-top:2.5rem;background:rgba(255,255,255,.07);border:1px solid rgba(245,158,11,.3);border-radius:14px;padding:1.5rem 2rem;display:flex;gap:1rem;"><i class="fas fa-trophy" style="color:${pal.accent};font-size:1.5rem;flex-shrink:0;"></i><p style="color:rgba(255,255,255,.85);line-height:1.7;">${advantage}</p></div>`:''}
  </div>
</section>

${about||ownerPhoto?`
<section style="padding:5.5rem 1.5rem;background:white;" id="about">
  <div class="container">
    <div style="display:grid;grid-template-columns:${ownerPhoto?'1fr 1fr':'1fr'};gap:3.5rem;align-items:center;">
      <div class="reveal">
        <div class="section-label">Our Story</div>
        <h2 class="section-title" style="color:#0a1628;">About ${biz}</h2>
        ${about?`<p style="font-size:1rem;color:#374151;line-height:1.85;">${about}</p>`:''}
      </div>
      ${ownerPhoto?`<div class="reveal"><img src="${ownerPhoto}" alt="${owner}" style="width:100%;border-radius:20px;object-fit:cover;max-height:420px;box-shadow:0 20px 60px rgba(0,0,0,.12);"></div>`:''}
    </div>
  </div>
</section>`:''}

<section class="reviews-section" id="reviews">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Customer Reviews</div>
      <h2 class="section-title" style="color:#0a1628;">What Our Clients Say</h2>
    </div>
    <div class="reviews-grid">
      <div class="review-card reveal"><div class="stars">★★★★★</div><p>"Fast, professional, and fair pricing. Showed up on time and got it done right the first time."</p><div class="reviewer">— Satisfied Customer, ${city}</div></div>
      <div class="review-card reveal"><div class="stars">★★★★★</div><p>"Best ${industry} company in the area. Quoted less than the competition and the quality was excellent."</p><div class="reviewer">— Happy Client, ${state||city}</div></div>
      <div class="review-card reveal"><div class="stars">★★★★★</div><p>"Called in the morning, they were here by noon. Explained everything clearly and left the place spotless."</p><div class="reviewer">— Local Homeowner, ${city}</div></div>
    </div>
  </div>
</section>

<section class="booking-section" id="booking">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Schedule Service</div>
      <h2 class="section-title" style="color:#0a1628;">Book Your Appointment</h2>
      <p class="section-sub">Fill out the form and we'll confirm within the hour.</p>
    </div>
    <div class="booking-wrap">
      <div class="reveal">
        <h3 style="font-size:1.2rem;font-weight:700;color:#0a1628;margin-bottom:.9rem;">Fast, Easy Scheduling</h3>
        <p style="font-size:.92rem;color:#64748b;line-height:1.7;margin-bottom:1.4rem;">No phone tag. Submit your request and we'll confirm your time slot promptly.</p>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:.65rem;">
          <li style="display:flex;align-items:center;gap:.55rem;font-size:.9rem;"><i class="fas fa-check-circle" style="color:${pal.accent};"></i> Same-day appointments often available</li>
          <li style="display:flex;align-items:center;gap:.55rem;font-size:.9rem;"><i class="fas fa-check-circle" style="color:${pal.accent};"></i> Free estimates on all jobs</li>
          <li style="display:flex;align-items:center;gap:.55rem;font-size:.9rem;"><i class="fas fa-check-circle" style="color:${pal.accent};"></i> Upfront pricing before we start</li>
          <li style="display:flex;align-items:center;gap:.55rem;font-size:.9rem;"><i class="fas fa-check-circle" style="color:${pal.accent};"></i> Licensed, insured technicians</li>
        </ul>
      </div>
      <div class="booking-form reveal">
        <h4 style="font-size:1.05rem;font-weight:700;color:#0a1628;margin-bottom:1.4rem;"><i class="fas fa-calendar-check" style="color:${pal.accent};margin-right:.4rem;"></i> Request an Appointment</h4>
        <div class="form-row">
          <div class="form-group"><label>First Name</label><input type="text" id="book_fname" placeholder="John"></div>
          <div class="form-group"><label>Last Name</label><input type="text" id="book_lname" placeholder="Smith"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Phone</label><input type="tel" id="book_phone" placeholder="${phone||'(555) 555-0000'}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="book_email" placeholder="you@email.com"></div>
        </div>
        <div class="form-group">
          <label>Service Needed</label>
          <select id="book_service">
            <option value="">Select a service…</option>
            ${serviceItems.length?serviceItems.map(s=>`<option>${s.name}</option>`).join(''):`<option>${industry.charAt(0).toUpperCase()+industry.slice(1)} Service</option>`}
            <option>Other / Not Sure</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Preferred Date</label><input type="date" id="book_date"></div>
          <div class="form-group"><label>Preferred Time</label>
            <select id="book_time"><option>Morning (8am–12pm)</option><option>Afternoon (12pm–5pm)</option><option>Evening (5pm–8pm)</option></select>
          </div>
        </div>
        <div class="form-group"><label>Describe the Issue</label><textarea id="book_notes" placeholder="Brief description…"></textarea></div>
        <button class="btn-book" onclick="handleBooking(this)"><i class="fas fa-calendar-check"></i> Request Appointment</button>
        <p style="font-size:.72rem;color:#64748b;text-align:center;margin-top:.65rem;">We'll confirm within 1 hour during business hours.</p>
      </div>
    </div>
  </div>
</section>

<section class="cta-section" id="contact">
  <div class="container">
    <div class="reveal">
      <div class="section-label" style="color:${pal.accent};">Ready to Get Started?</div>
      <h2 class="section-title" style="color:white;">Get Your Free Estimate Today</h2>
      <p style="color:rgba(255,255,255,.75);font-size:1.05rem;max-width:480px;margin:0 auto 2.2rem;line-height:1.7;">Call us now or submit a request. We respond within the hour during business hours.</p>
      ${phone?`<a href="tel:${phoneRaw}" class="cta-phone"><i class="fas fa-phone-volume"></i> ${phone}</a>`:''}
      <a href="#booking" class="btn-primary" style="font-size:1rem;padding:.95rem 2.2rem;display:inline-flex;"><i class="fas fa-calendar-check"></i> Schedule Online</a>
    </div>
  </div>
</section>

${(hoursData.length||phone||email)?`
<section style="padding:5rem 1.5rem;background:${pal.primary};">
  <div class="container">
    <div style="text-align:center;margin-bottom:3rem;" class="reveal">
      <div class="section-label" style="color:${pal.accent};">Get In Touch</div>
      <h2 class="section-title" style="color:white;">Contact &amp; Hours</h2>
    </div>
    <div style="display:grid;grid-template-columns:${hoursData.length?'1fr 1fr':'1fr'};gap:2.5rem;">
      ${hoursData.length?`<div class="reveal" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2rem;"><h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:white;letter-spacing:1px;margin-bottom:1.5rem;">Business Hours</h3>${hoursRows}</div>`:''}
      <div class="reveal" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2rem;">
        <h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:white;letter-spacing:1px;margin-bottom:1.5rem;">Contact Us</h3>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          ${phone?`<a href="tel:${phoneRaw}" style="display:flex;align-items:center;gap:1rem;color:white;text-decoration:none;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📞</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Phone</div><div style="font-size:1rem;font-weight:600;">${phone}</div></div></a>`:''}
          ${email?`<a href="mailto:${email}" style="display:flex;align-items:center;gap:1rem;color:white;text-decoration:none;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✉️</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Email</div><div style="font-size:.92rem;word-break:break-all;">${email}</div></div></a>`:''}
          ${address.length>5?`<div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📍</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Location</div><div style="font-size:.92rem;color:rgba(255,255,255,.85);">${address}</div></div></div>`:''}
        </div>
      </div>
    </div>
  </div>
</section>`:''}

<footer>
  <div class="footer-inner">
    <div class="footer-logo">${bizFirst} <span>${bizLast}</span></div>
    <div class="footer-links">
      <a href="#services">Services</a><a href="#why">About</a><a href="#reviews">Reviews</a><a href="#booking">Book</a><a href="#contact">Contact</a>
    </div>
  </div>
  <div class="footer-copy">© ${new Date().getFullYear()} ${biz} · ${city}${state?', '+state:''} · All Rights Reserved · Powered by <a href="https://turnkeyaiservices.com" target="_blank" rel="noopener" style="color:${pal.accent};text-decoration:none;font-weight:600;">TurnkeyAI Services</a></div>
</footer>

<div id="chatWidget">
  <button id="chatToggleBtn" onclick="openChat()">💬 ${chatName}</button>
  <div id="chatBox">
    <div id="chatHeader">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:9px;height:9px;background:#00D68F;border-radius:50%;animation:pulse 2s infinite;"></div>
        <span style="font-weight:700;font-size:.92rem;">💬 ${chatName}</span>
      </div>
      <span onclick="closeChat()" style="cursor:pointer;font-size:1.2rem;opacity:.7;">✕</span>
    </div>
    <div id="chatMessages"></div>
    <div id="chatInputRow">
      <input id="chatInput" type="text" placeholder="Ask a question..." onkeydown="if(event.key==='Enter')sendMsg()">
      <button id="chatSendBtn" onclick="sendMsg()">Send</button>
    </div>
  </div>
</div>

<script>
(function(){
  var obs=new IntersectionObserver(function(entries){entries.forEach(function(e,i){if(e.isIntersecting)setTimeout(function(){e.target.classList.add('visible');},i*70);});},{threshold:.1});
  document.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});
})();
function handleBooking(btn){
  var fname=document.getElementById('book_fname').value.trim();
  var lname=document.getElementById('book_lname').value.trim();
  var phone=document.getElementById('book_phone').value.trim();
  var email=document.getElementById('book_email').value.trim();
  var service=document.getElementById('book_service').value;
  var date=document.getElementById('book_date').value;
  var time=document.getElementById('book_time').value;
  var notes=document.getElementById('book_notes').value.trim();
  if(!phone&&!email){alert('Please enter a phone number or email so we can confirm your appointment.');return;}
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Sending...';btn.disabled=true;
  fetch('${BASE_URL}/api/booking-lead',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({firstName:fname,lastName:lname,phone:phone,email:email,service:service,preferredDate:date,preferredTime:time,notes:notes,businessName:'${biz.replace(/'/g,"\\'")}',businessEmail:'${email.replace(/'/g,"\\'")}',businessPhone:'${phone.replace(/'/g,"\\'")}',city:'${city.replace(/'/g,"\\'")}',industry:'${industry.replace(/'/g,"\\'")}' })
  })
  .then(function(r){return r.json();})
  .then(function(){btn.innerHTML='<i class="fas fa-check"></i> Request Sent!';btn.style.background='#16a34a';btn.style.color='white';setTimeout(function(){btn.innerHTML='<i class="fas fa-calendar-check"></i> Request Appointment';btn.style.background='';btn.style.color='';btn.disabled=false;},5000);})
  .catch(function(){btn.innerHTML='<i class="fas fa-calendar-check"></i> Request Appointment';btn.disabled=false;alert('Something went wrong. Please call us directly.');});
}
var chatOpen=false;
var chatHistory=[];
var chatSystemPrompt=${JSON.stringify(chatSystem)};
function openChat(){
  chatOpen=true;
  document.getElementById('chatToggleBtn').style.display='none';
  var box=document.getElementById('chatBox');
  box.style.display='flex';
  if(!chatHistory.length){addMsg('bot','Hi! How can I help you today?');}
  document.getElementById('chatInput').focus();
}
function closeChat(){
  chatOpen=false;
  document.getElementById('chatBox').style.display='none';
  document.getElementById('chatToggleBtn').style.display='flex';
}
function addMsg(role,text){
  var msgs=document.getElementById('chatMessages');
  var d=document.createElement('div');
  d.style.cssText='margin-bottom:10px;display:flex;'+(role==='user'?'justify-content:flex-end;':'');
  var b=document.createElement('div');
  b.style.cssText='padding:9px 13px;border-radius:12px;max-width:82%;font-size:.88rem;line-height:1.5;'+(role==='user'?'background:#0066FF;color:white;':'background:white;border:1px solid #e5e7eb;color:#1e293b;');
  b.textContent=text;d.appendChild(b);msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}
async function sendMsg(){
  var input=document.getElementById('chatInput');
  var msg=input.value.trim();if(!msg)return;
  input.value='';
  addMsg('user',msg);
  chatHistory.push({role:'user',content:msg});
  var typing=document.createElement('div');
  typing.id='typing';typing.style.cssText='margin-bottom:10px;font-size:.8rem;color:#94a3b8;';
  typing.textContent='Typing...';
  document.getElementById('chatMessages').appendChild(typing);
  try{
    var r=await fetch('${BASE_URL}/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,history:chatHistory,system:chatSystemPrompt,businessName:'${biz.replace(/'/g,"\\'")}' })});
    var d=await r.json();
    var reply=d.reply||'Sorry, I had trouble with that. Please call us directly.';
    if(document.getElementById('typing'))document.getElementById('typing').remove();
    addMsg('bot',reply);
    chatHistory.push({role:'assistant',content:reply});
  }catch(e){
    if(document.getElementById('typing'))document.getElementById('typing').remove();
    addMsg('bot','Sorry, I had trouble connecting. Please call ${phone||'us'} directly.');
  }
}
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════
// ── API ROUTES ──
// ════════════════════════════════════════════════

// ── Shared intake handler ──
async function handleIntakeSubmission(data, res) {
  const id = data.id || ('client_' + Date.now());
  const previewToken = makeToken();
  clients[id] = {
    id, status: 'pending', data: { ...data, id }, previewToken,
    dashToken: null, dashPassword: null, liveUrl: null, cfProjectName: null,
    miniMeConsent: null, miniMeConsentAt: null,
    miniMeSubscribed: false,
    freeVideoRequested: data.wants_free_video === 'yes' || data.wantsFreeVideo === 'yes',
    twilioNumber: null, forwardingNumber: null, businessHoursJson: null, telephonyEnabled: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await saveClient(clients[id]);

  if (data.logoBase64 && data.logoFileName) {
    try {
      const ext = (data.logoFileName.split('.').pop() || 'png').toLowerCase();
      const logoFile = `logo_${id}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, logoFile), Buffer.from(data.logoBase64, 'base64'));
      clients[id].logoFile = logoFile;
      clients[id].data.logoUrl = `${BASE_URL}/uploads/${logoFile}`;
      delete clients[id].data.logoBase64;
      await saveClient(clients[id]);
    } catch(e) { console.error('[logo save]', e.message); }
  }

  if ((data.paymentMethod || '').toLowerCase() === 'partner') {
    const partnerPreviewUrl = `${BASE_URL}/preview/${previewToken}`;
    if (data.email) {
      await sendEmail({
        to: data.email,
        subject: `🎉 Your website preview is ready — ${data.businessName || 'Your Business'}`,
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${data.ownerName||'there'} — your preview is ready.</p></div><div style="padding:32px;"><div style="text-align:center;margin-bottom:24px;"><a href="${partnerPreviewUrl}" style="background:#0066FF;color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;display:inline-block;">👁️ View My Website Preview</a></div><p style="font-size:14px;color:#6B7280;">Questions? Call (603) 922-2004 or email <a href="mailto:turnkeyaiservices@gmail.com">turnkeyaiservices@gmail.com</a></p></div></div>`
      }).catch(e => console.error('[partner preview email]', e.message));
    }
    res.json({ success: true, id, preview: partnerPreviewUrl, partner: true });
    (async () => {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `🤝 Partner Submission: ${data.businessName || 'New Client'} — Preview Ready`,
        html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🤝 Partner Bypass Submission</h1><p style="color:rgba(255,255,255,.8);margin:8px 0 0;">${data.businessName || ''} — preview sent to client</p></div><div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><p><strong>Business:</strong> ${data.businessName || '—'}</p><p><strong>Owner:</strong> ${data.ownerName || '—'}</p><p><strong>Email:</strong> ${data.email || '—'}</p><p><strong>Phone:</strong> ${data.phone || '—'}</p><p><strong>Industry:</strong> ${data.industry || '—'}</p><p><strong>City:</strong> ${data.city || '—'}</p><p style="margin-top:20px;"><a href="${partnerPreviewUrl}" style="background:#0066FF;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">👁️ View Preview</a></p></div></div>`
      }).catch(e => console.error('[partner admin email]', e.message));
      if (data.wants_mini_me === 'yes' || data.wantsMiniMe === 'yes') {
        sendMiniMeEmail(clients[id]).catch(()=>{});
      } else if (data.wants_free_video === 'yes' || data.wantsFreeVideo === 'yes') {
        sendFreeVideoEmail(clients[id]).catch(()=>{});
      }
    })();
    return;
  }

  const previewUrl = `${BASE_URL}/preview/${previewToken}`;
  const approveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;
  const d = data;

  const row = (label, val) => val
    ? `<tr><td style="padding:9px 14px;font-weight:600;color:#374151;background:#f9fafb;width:170px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${val}</td></tr>` : '';
  const tableWrap = rows => `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">${rows}</table>`;
  const h2 = txt => `<h2 style="color:#0066FF;font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${txt}</h2>`;

  const servicesList = Object.keys(d).filter(k => k.startsWith('service_') && d[k]==='on')
    .map(k => { const n=k.replace('service_',''); return `${n.replace(/_/g,' ')}${d['price_'+n]?' — '+d['price_'+n]:''}`; });
  const days2 = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hoursLines = days2.filter(dy => d['day_'+dy]).map(dy => `<li>${dy.charAt(0).toUpperCase()+dy.slice(1)}: ${d['hours_'+dy]||'Open'}</li>`);

  const domainBlock = d.hasDomain === 'yes'
    ? `<div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#92400e;margin:0 0 10px;">🌐 DNS SETUP NEEDED — Customer Has Domain</p><p style="margin:0 0 6px;font-size:14px;"><strong>Domain:</strong> ${d.existingDomain||'(not provided)'}</p><p style="margin:0 0 6px;font-size:14px;"><strong>Registrar:</strong> ${(d.domainRegistrar||'unknown').replace(/_/g,' ')}</p><p style="margin:0;font-size:14px;"><strong>Keep email?</strong> ${d.keepExistingEmail==='yes'?'✅ YES — do NOT change MX records':'❌ No'}</p></div>`
    : d.hasDomain === 'no'
    ? `<div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#3730a3;margin:0 0 10px;">🆕 DOMAIN REGISTRATION NEEDED</p><p style="margin:0 0 6px;font-size:14px;"><strong>Suggested:</strong> ${d.suggestedDomain||'(ask client)'}</p><p style="margin:0;font-size:14px;"><strong>Action:</strong> Register on Namecheap → Cloudflare DNS → Zoho email → Point to Railway.</p></div>`
    : '';

  const addons = [];
  if (d.wants_mini_me==='yes'||d.wantsMiniMe==='yes') addons.push('🤖 Mini-Me AI Avatar ($59/mo)');
  if ((d.wants_free_video==='yes'||d.wantsFreeVideo==='yes')&&d.wants_mini_me!=='yes') addons.push('🎬 Free 60-Second Promo Video');
  if (d.addon_after_hours==='yes'||d.wantsAfterHours==='yes') addons.push('📞 After Hours Answering');
  if (d.addon_missed_call==='yes'||d.wantsMissedCall==='yes') addons.push('📱 Missed Call Text Return');
  const payMethodsStr = ['cash','card','check','venmo','cashapp','zelle'].filter(p=>d['pay_'+p]).join(', ');

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||''}, ${d.state||''} — ${(d.industry||'').replace(/_/g,' ')}`,
    html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1><p style="color:rgba(255,255,255,0.82);margin:6px 0 0;font-size:14px;">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">${domainBlock}${h2('Business Information')}${tableWrap(`${row('Business Name',d.businessName)}${row('Owner',d.ownerName)}${row('Industry',(d.industry||'').replace(/_/g,' '))}${row('Phone',d.phone)}${row('Email',d.email)}${row('Address',[d.address,d.city||d.location,d.state,d.zip].filter(Boolean).join(', '))}${row('Years in Business',d.yearsInBusiness)}`)}${servicesList.length?`${h2('Services & Pricing')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${servicesList.map(s=>'<li>'+s+'</li>').join('')}</ul>`:''}${hoursLines.length?`${h2('Business Hours')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${hoursLines.join('')}</ul>`:''}${h2('About the Business')}${tableWrap(`${row('Business Story',d.aboutUs)}${row('Mission',d.missionStatement)}${row('Awards',d.awards)}`)}${h2('Other')}${tableWrap(`${row('Competitive Advantage',d.competitiveAdvantage)}${row('Payment Methods',payMethodsStr)}${row('Color Preference',d.colorPreference)}${row('Referral Source',d.referralSource)}`)}${addons.length?`<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#065f46;margin:0 0 10px;">🎯 Add-Ons Selected</p><ul style="margin:0;padding-left:20px;line-height:2;">${addons.map(a=>'<li><strong>'+a+'</strong></li>').join('')}</ul></div>`:''}<div style="border-top:1px solid #e5e7eb;padding-top:22px;display:flex;gap:12px;flex-wrap:wrap;"><a href="${approveUrl}" style="background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">✅ Approve & Go Live</a><a href="${previewUrl}" style="background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;">👁️ Preview Site</a></div></div></div>`
  });

  if (d.email) {
    const clientAddons = [];
    if (d.wants_mini_me==='yes'||d.wantsMiniMe==='yes') clientAddons.push('<li>🤖 <strong>Mini-Me AI Avatar</strong> — recording instructions coming shortly</li>');
    else if (d.wants_free_video==='yes'||d.wantsFreeVideo==='yes') clientAddons.push('<li>🎬 <strong>Free 60-Second Promo Video</strong> — recording instructions coming shortly</li>');
    if (d.addon_after_hours==='yes') clientAddons.push('<li>📞 <strong>After Hours Answering</strong> — activated when site goes live</li>');
    if (d.addon_missed_call==='yes') clientAddons.push('<li>📱 <strong>Missed Call Text Return</strong> — activated when site goes live</li>');

    await sendEmail({
      to: d.email,
      subject: `🎉 Your website preview is ready — ${d.businessName||'Your Business'}`,
      html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:28px;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${d.ownerName||'there'} — your website preview is ready.</p></div><div style="padding:32px;"><p style="font-size:16px;line-height:1.75;margin:0 0 24px;">We've built a preview of your new <strong>${d.businessName||'business'}</strong> website.</p><div style="text-align:center;margin:0 0 28px;"><a href="${previewUrl}" style="background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;display:inline-block;">👁️ View My Website Preview</a></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0;font-size:15px;">Review your preview — the approve button is inside the preview page.</p></div>${clientAddons.length?`<ul style="margin:0 0 20px;padding-left:20px;line-height:2.2;font-size:14px;">${clientAddons.join('')}</ul>`:''}<p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(603) 922-2004</strong></p></div></div>`
    });

    if (d.wants_mini_me==='yes'||d.wantsMiniMe==='yes') {
      sendMiniMeEmail(clients[id]).catch(e => console.error('[miniMe email]', e.message));
    } else if (d.wants_free_video==='yes'||d.wantsFreeVideo==='yes') {
      sendFreeVideoEmail(clients[id]).catch(e => console.error('[video email]', e.message));
    }
  }

  res.json({ success: true, id, preview: previewUrl });
}

// ── POST /api/submission-created ──
app.post('/api/submission-created', postLimiter, async (req, res) => {
  try {
    const validErr = validate(req.body, [['businessName','Business Name'],['email','Email'],['phone','Phone']]);
    if (validErr) return res.status(400).json({ error: validErr });
    await handleIntakeSubmission(req.body, res);
  } catch(err) { console.error('[/api/submission-created]', err); res.status(500).json({ error: 'Submission failed' }); }
});

// ── POST /api/intake (legacy) ──
app.post('/api/intake', postLimiter, async (req, res) => {
  try {
    const validErr = validate(req.body, [['businessName','Business Name'],['email','Email']]);
    if (validErr) return res.status(400).json({ error: validErr });
    await handleIntakeSubmission(req.body, res);
  } catch(err) { console.error('[/api/intake]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/booking-lead ──
app.post('/api/booking-lead', postLimiter, async (req, res) => {
  try {
    if (!req.body.phone && !req.body.email) return res.status(400).json({ error: 'Phone or email is required' });
    const d = req.body;
    const customerName = [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Potential Customer';
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📅 New Booking Request: ${d.businessName || 'Website Visitor'} — ${d.service || 'General Inquiry'}`,
      html: `<div style="font-family:sans-serif;max-width:600px;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:20px 28px;border-radius:12px 12px 0 0;"><h2 style="color:white;margin:0;">📅 New Booking Request</h2></div><div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:140px;color:#374151;">Customer</td><td style="padding:8px;">${customerName}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Phone</td><td style="padding:8px;"><a href="tel:${(d.phone||'').replace(/\D/g,'')}">${d.phone||'Not provided'}</a></td></tr><tr><td style="padding:8px;font-weight:700;color:#374151;">Email</td><td style="padding:8px;">${d.email||'Not provided'}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Service</td><td style="padding:8px;">${d.service||'Not specified'}</td></tr><tr><td style="padding:8px;font-weight:700;color:#374151;">Date Pref.</td><td style="padding:8px;">${d.preferredDate||'Flexible'} ${d.preferredTime||''}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Notes</td><td style="padding:8px;">${d.notes||'—'}</td></tr><tr><td style="padding:8px;font-weight:700;color:#374151;">Source</td><td style="padding:8px;">${d.businessName||''} website — ${d.city||''}</td></tr></table></div></div>`
    });
    if (d.phone) {
      await sendSMS(d.phone, `Hi ${d.firstName||'there'}! ${d.businessName||'We'} received your appointment request. We'll confirm your ${d.preferredDate||'appointment'} shortly. Questions? Call ${d.businessPhone||'us'}.`).catch(()=>{});
    }
    res.json({ success: true });
  } catch(err) { console.error('[/api/booking-lead]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/chat ──
app.post('/api/chat', postLimiter, async (req, res) => {
  try {
    if (!req.body.message || req.body.message.length > 1000) return res.status(400).json({ reply: 'Invalid message.' });
    const { message, history, system, businessName } = req.body;
    if (!CF_AI_TOKEN || !CF_ACCOUNT_ID) {
      return res.json({ reply: `Thanks for reaching out to ${businessName||'us'}! Please call us directly for immediate assistance.` });
    }
    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => messages.push({ role: h.role, content: h.content }));
    }
    messages.push({ role: 'user', content: message });
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${CF_AI_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: system || `You are a helpful assistant for ${businessName||'this business'}.` }, ...messages] }) }
    );
    const cfData = await cfRes.json();
    const reply = cfData?.result?.response || `Thanks for your question! Please call us directly for the best assistance.`;
    res.json({ reply });
  } catch(err) { console.error('[/api/chat]', err); res.json({ reply: 'Sorry, I had trouble with that. Please call us directly.' }); }
});

// ── POST /api/video-upload ──
app.post('/api/video-upload', postLimiter, async (req, res) => {
  try {
    const validErr = validate(req.body, [['token','Upload token']]);
    if (validErr) return res.status(400).json({ error: validErr });
    const { token, videoBase64, videoType, uploaderName, uploaderEmail, businessName, fileName, fileSize } = req.body;
    const client = Object.values(clients).find(c => c.previewToken === token);
    if (!client) return res.status(404).json({ error: 'Invalid upload token' });
    if (!videoBase64) return res.status(400).json({ error: 'No video data received' });
    const ext = (fileName || 'video.mp4').split('.').pop().toLowerCase() || 'mp4';
    const videoFile = `video_${videoType||'promo'}_${client.id}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, videoFile), Buffer.from(videoBase64, 'base64'));
    const videoUrl = `${BASE_URL}/uploads/${videoFile}`;
    if (videoType === 'mini_me') { client.miniMeVideoFile = videoFile; client.data.miniMeVideoUrl = videoUrl; }
    else { client.promoVideoFile = videoFile; client.data.promoVideoUrl = videoUrl; }
    client.updatedAt = new Date().toISOString();
    await saveClient(client);
    const typeLabel = videoType === 'mini_me' ? 'Mini-Me AI Avatar Clip' : 'Free 60-Second Promo Video';
    await sendEmail({ to: ADMIN_EMAIL, subject: `🎬 Video Upload Ready: ${businessName||client.data.businessName||'Client'} — ${typeLabel}`, html: `<div style="font-family:sans-serif;max-width:600px;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:20px 28px;border-radius:12px 12px 0 0;"><h2 style="color:#00D68F;margin:0;">🎬 Video Upload Ready</h2></div><div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:140px;">Business</td><td style="padding:8px;">${businessName||client.data.businessName}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Uploader</td><td style="padding:8px;">${uploaderName||'—'}</td></tr><tr><td style="padding:8px;font-weight:700;">Email</td><td style="padding:8px;">${uploaderEmail||client.data.email||'—'}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Video Type</td><td style="padding:8px;">${typeLabel}</td></tr><tr><td style="padding:8px;font-weight:700;">File</td><td style="padding:8px;">${videoFile} (${fileSize||'—'})</td></tr></table><p style="margin-top:16px;"><strong>Action:</strong> Download and process: <a href="${videoUrl}" style="color:#0066FF;">${videoUrl}</a></p></div></div>` });
    if (uploaderEmail || client.data.email) {
      await sendEmail({ to: uploaderEmail || client.data.email, subject: `✅ Video Received — ${businessName||client.data.businessName}`, html: `<h2 style="color:#0066FF;font-family:sans-serif;">We Got Your Video Clip!</h2><p style="font-family:sans-serif;">Hi ${uploaderName||'there'},</p><p style="font-family:sans-serif;">Your ${typeLabel.toLowerCase()} has been received. Production begins within 48 hours.</p><p style="font-family:sans-serif;">Questions? Call <strong>(603) 922-2004</strong></p><p style="font-family:sans-serif;">— TurnkeyAI Services Team</p>` });
    }
    res.json({ success: true, videoUrl });
  } catch(err) { console.error('[/api/video-upload]', err); res.status(500).json({ error: 'Upload failed: ' + err.message }); }
});

// ── POST /api/video-upload-notify (legacy fallback) ──
app.post('/api/video-upload-notify', async (req, res) => {
  try {
    const d = req.body;
    const typeLabel = d.videoType === 'mini_me' ? 'Mini-Me AI Avatar Clip' : d.videoType === 'both' ? 'Promo Video + Mini-Me Clip' : 'Free 60-Second Promo Video';
    await sendEmail({ to: ADMIN_EMAIL, subject: `⚠️ Video Upload Fallback: ${d.businessName||'Unknown'}`, html: `<h2 style="color:#f59e0b;font-family:sans-serif;">Video Upload Fallback</h2><table style="border-collapse:collapse;width:100%;max-width:500px;font-family:sans-serif;"><tr><td style="padding:8px;font-weight:700;">Client</td><td style="padding:8px;">${d.uploaderName||''}</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Business</td><td style="padding:8px;">${d.businessName||''}</td></tr><tr><td style="padding:8px;font-weight:700;">Email</td><td style="padding:8px;">${d.email||''}</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Video Type</td><td style="padding:8px;">${typeLabel}</td></tr><tr><td style="padding:8px;font-weight:700;">File</td><td style="padding:8px;">${d.fileName||''} (${d.fileSize||''})</td></tr>${d.uploadError?`<tr style="background:#fff8f0;"><td style="padding:8px;font-weight:700;color:#dc2626;">Upload Error</td><td style="padding:8px;color:#dc2626;">${d.uploadError}</td></tr>`:''}</table>` });
    if (d.email) await sendEmail({ to: d.email, subject: `✅ Video Received — ${d.businessName||'Your Business'}`, html: `<h2 style="color:#0066FF;font-family:sans-serif;">We Got Your Video Clip!</h2><p style="font-family:sans-serif;">Hi ${d.uploaderName||'there'}, production begins within 48 hours.</p><p style="font-family:sans-serif;">Questions? Call (603) 922-2004</p>` });
    res.json({ success: true });
  } catch(err) { console.error('[/api/video-upload-notify]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── GET /api/admin/clients ──
app.get('/api/admin/clients', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const mrrSummary = calculateMRR();
  const clientList = Object.values(clients).map(c => ({
    id: c.id, businessName: c.data.businessName, ownerName: c.data.ownerName,
    email: c.data.email, phone: c.data.phone, industry: c.data.industry,
    city: c.data.city, status: c.status, liveUrl: c.liveUrl,
    createdAt: c.createdAt, previewToken: c.previewToken,
    dashPassword: c.dashPassword, approvedAt: c.approvedAt,
    wantsMiniMe: c.data.wants_mini_me || c.data.wantsMiniMe,
    miniMeConsent: c.miniMeConsent, miniMeConsentAt: c.miniMeConsentAt,
    miniMeSubscribed: c.miniMeSubscribed,
    miniMeVideoFile: c.miniMeVideoFile || null, promoVideoFile: c.promoVideoFile || null,
    wantsFreeVideo: c.freeVideoRequested,
    wantsAfterHours: c.data.addon_after_hours, wantsMissedCall: c.data.addon_missed_call,
    twilioNumber: c.twilioNumber || null, forwardingNumber: c.forwardingNumber || null,
    telephonyEnabled: c.telephonyEnabled || false,
    domainStatus: {
      hasDomain: c.data.hasDomain || null, existingDomain: c.data.existingDomain || null,
      domainRegistrar: c.data.domainRegistrar || null, keepExistingEmail: c.data.keepExistingEmail || null,
      suggestedDomain: c.data.suggestedDomain || null, cfProjectName: c.cfProjectName || null,
      needsDnsAction: (c.data.hasDomain === 'yes' || c.data.hasDomain === 'no') && c.status !== 'active'
    }
  }));
  res.json({ mrr: mrrSummary, clients: clientList });
});

// ── GET /api/approve/:id ──
app.get('/api/approve/:id', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('Unauthorized');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('Client not found');
  if (client.status === 'active') return res.send(`<h2>${client.data.businessName} is already live at <a href="${client.liveUrl}">${client.liveUrl}</a></h2>`);
  try {
    await runDeploy(client);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h1 style="color:#00D68F;">✅ ${client.data.businessName} is LIVE!</h1><p><a href="${client.liveUrl}" target="_blank">${client.liveUrl}</a></p><p>Dashboard password: <strong>${client.dashPassword}</strong></p></body></html>`);
  } catch(err) { console.error('[approve]', err); res.status(500).send('Deploy failed: ' + err.message); }
});

// ── GET /api/redeploy/:id ──
app.get('/api/redeploy/:id', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('Unauthorized');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('Client not found');
  if (!client.data.businessName) return res.status(400).send('Client has no businessName — cannot deploy.');
  client.status = 'pending';
  try {
    await runDeploy(client);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:white;"><h1 style="color:#00D68F;">✅ ${client.data.businessName} Re-Deployed!</h1><p>Live at: <a href="${client.liveUrl}" style="color:#0066FF;">${client.liveUrl}</a></p><p>New dashboard password: <strong>${client.dashPassword}</strong></p></body></html>`);
  } catch(err) { client.status = 'active'; console.error('[redeploy]', err); res.status(500).send('Re-deploy failed: ' + err.message); }
});

// ── GET /api/client-approve/:id ──
app.get('/api/client-approve/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('Not found');
  if (client.previewToken !== req.query.token) return res.status(403).send('Invalid token');
  if (client.status === 'active') return res.redirect(client.liveUrl);
  try {
    await runDeploy(client);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:white;"><h1 style="color:#00D68F;">🎉 You're LIVE!</h1><p style="font-size:1.2rem;">Your site is now at:</p><a href="${client.liveUrl}" style="font-size:1.5rem;color:#0066FF;">${client.liveUrl}</a><p style="margin-top:20px;color:rgba(255,255,255,.6);">Check your email for your dashboard login.</p></body></html>`);
  } catch(err) { console.error('[client-approve]', err); res.status(500).send('Deployment failed. Please contact us.'); }
});

// ── GET /preview/:token ──
app.get('/preview/:token', (req, res) => {
  const client = Object.values(clients).find(c => c.previewToken === req.params.token);
  if (!client) return res.status(404).send('<h2>Preview not found or expired.</h2>');
  const data = { ...client.data, _previewToken: client.previewToken, id: client.id };
  res.send(generateSiteHTML(data, true, null));
});

// ── GET /api/mini-me-consent/:id ──
app.get('/api/mini-me-consent/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(403).send('Invalid token');
  client.miniMeConsent = true;
  client.miniMeConsentAt = new Date().toISOString();
  await saveClient(client);
  await sendEmail({ to: ADMIN_EMAIL, subject: `✅ Mini-Me Consent: ${client.data.businessName}`, html: `<p><strong>${client.data.businessName}</strong> (${client.data.ownerName}) has consented to Mini-Me avatar creation.</p>` });
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2 style="color:#00D68F;">✅ Consent recorded!</h2><p>We\'ll begin building your Mini-Me avatar.</p></body></html>');
});

// ── GET /api/mini-me-subscribe/:id ──
app.get('/api/mini-me-subscribe/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(403).send('Invalid token');
  client.miniMeSubscribed = true;
  client.miniMeSubscribedAt = new Date().toISOString();
  await saveClient(client);
  await sendEmail({ to: ADMIN_EMAIL, subject: `💰 Mini-Me Subscription: ${client.data.businessName}`, html: `<p><strong>${client.data.businessName}</strong> subscribed to Mini-Me at $59/mo. Set up recurring billing for ${client.data.email}.</p>` });
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2 style="color:#00D68F;">✅ Subscribed!</h2><p>Your Mini-Me subscription is active at $59/month.</p></body></html>');
});

// ── POST /api/preview-change-request ──
app.post('/api/preview-change-request', async (req, res) => {
  try {
    const { type, clientId, token, changes } = req.body;
    const client = clients[clientId];
    if (!client || client.previewToken !== token) return res.status(403).json({ error: 'Invalid token' });
    await sendEmail({ to: ADMIN_EMAIL, subject: `✏️ ${type === 'major' ? 'Major' : 'Minor'} Change Request: ${client.data.businessName}`, html: `<h2 style="font-family:sans-serif;">Change Request — ${type}</h2><p style="font-family:sans-serif;"><strong>Client:</strong> ${client.data.businessName} (${client.data.email})</p><pre style="background:#f4f6fa;padding:16px;border-radius:8px;overflow:auto;">${JSON.stringify(changes, null, 2)}</pre>` });
    res.json({ success: true });
  } catch(err) { console.error('[change-request]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/client-update ──
app.post('/api/client-update', async (req, res) => {
  const { token, password, updateType, updateData } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing credentials' });
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.trim().toUpperCase()) return res.status(401).json({ error: 'Wrong password' });

  try {
    if (updateType === 'content_update') {
      const BLOCKED = ['id','dashToken','dashPassword','previewToken','_previewToken'];
      const incoming = updateData || {};
      Object.keys(incoming).forEach(k => {
        if (!BLOCKED.includes(k)) client.data[k] = incoming[k];
      });
      await saveClient(client);
      if (client.status !== 'active' || !client.cfProjectName) {
        return res.json({ success: true, message: 'Your information has been saved. Your site will reflect the changes on next deployment.' });
      }
      try {
        await redeployLive(client);
        return res.json({ success: true, message: 'Your site has been updated and redeployed. Changes will be live within 1–2 minutes.' });
      } catch(deployErr) {
        console.error('[content_update redeploy]', deployErr.message);
        return res.status(500).json({ error: 'Your information was saved, but the redeploy failed: ' + deployErr.message + '. Please contact support at (603) 922-2004.' });
      }
    }

    if (updateType === 'hours') {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const hours = {};
      days.forEach(d => {
        hours[d] = { open: !!updateData['day_'+d], hours: updateData['hours_'+d] || '9:00 AM – 5:00 PM' };
      });
      client.data.hours = hours;
      await saveClient(client);
      if (client.status === 'active') {
        const projectName = client.cfProjectName || `turnkeyai-${makeSlug(client.data.businessName)}`;
        const liveHTML = generateSiteHTML(client.data, false, client);
        deployToCloudflarePages(projectName, liveHTML).catch(e => console.error('[hours redeploy]', e.message));
      }
      return res.json({ success: true, message: 'Hours saved and site updating.' });
    }

    if (updateType === 'change_request') {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `✏️ Change Request: ${client.data.businessName}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><h2 style="color:#0066FF;">Change Request — ${updateData.requestType || 'General'}</h2><p><strong>Client:</strong> ${client.data.businessName}</p><p><strong>Email:</strong> ${client.data.email}</p><p><strong>Phone:</strong> ${client.data.phone}</p><p><strong>Request:</strong></p><div style="background:#f4f6fa;padding:16px;border-radius:8px;">${updateData.details}</div></div>`
      });
      return res.json({ success: true, message: 'Request sent! We\'ll handle it within 24–48 hours.' });
    }

    if (updateType === 'request_minime') {
      await sendMiniMeEmail(client);
      return res.json({ success: true, message: 'Mini-Me requested! Check your email.' });
    }

    if (updateType === 'request_free_video') {
      client.freeVideoRequested = true;
      await saveClient(client);
      await sendFreeVideoEmail(client);
      return res.json({ success: true, message: 'Check your email for recording instructions!' });
    }

    return res.status(400).json({ error: 'Unknown updateType' });
  } catch(err) {
    console.error('[client-update]', err);
    res.status(500).json({ error: 'Update failed. Please try again.' });
  }
});

// ── POST /api/client-auth ──
app.post('/api/client-auth', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.trim().toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  res.json({
    businessName: client.data.businessName,
    status: client.status,
    liveUrl: client.liveUrl,
    data: client.data,
    miniMeConsent: client.miniMeConsent || false,
    miniMeVideoUrl: client.miniMeVideoFile || null,
    freeVideoRequested: client.freeVideoRequested || false,
    twilioNumber: client.twilioNumber || null,
    telephonyEnabled: client.telephonyEnabled || false
  });
});

// ── POST /api/admin/bind-domain ──
app.post('/api/admin/bind-domain', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { clientId, customDomain } = req.body;
  if (!clientId || !customDomain) return res.status(400).json({ error: 'clientId and customDomain are required' });
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!client.cfProjectName) return res.status(400).json({ error: 'Client has no CF Pages project yet — deploy first' });
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return res.status(500).json({ error: 'CF credentials not configured' });
  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${client.cfProjectName}/domains`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: customDomain.replace(/^https?:\/\//,'').trim() }) }
    );
    const cfData = await cfRes.json();
    if (!cfRes.ok) return res.status(502).json({ error: 'CF API error', details: cfData.errors });
    client.data.customDomain = customDomain;
    client.liveUrl = `https://${customDomain.replace(/^https?:\/\//,'').trim()}`;
    client.updatedAt = new Date().toISOString();
    await saveClient(client);
    res.json({ success: true, customDomain, liveUrl: client.liveUrl });
  } catch(err) { console.error('[bind-domain]', err.message); res.status(500).json({ error: 'Bind domain failed: ' + err.message }); }
});

// ── Stripe webhook ──
app.post('/api/stripe-webhook', async (req, res) => {
  let event;
  try {
    event = STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body);
  } catch(err) { console.error('[stripe webhook]', err.message); return res.status(400).send('Webhook error'); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const clientId = session.metadata?.clientId;
    if (clientId && clients[clientId]) {
      clients[clientId].miniMeSubscribed = true;
      clients[clientId].miniMeSubscribedAt = new Date().toISOString();
      await saveClient(clients[clientId]);
      await sendEmail({ to: ADMIN_EMAIL, subject: `💰 Stripe Payment: ${clients[clientId].data.businessName}`, html: `<p>Payment confirmed for ${clients[clientId].data.businessName}. Mini-Me activated.</p>` });
    }
  }
  res.json({ received: true });
});

// ════════════════════════════════════════════════
// ── TELEPHONY WEBHOOK ROUTES ──
// ════════════════════════════════════════════════

// ── POST /api/telephony/voice — Twilio calls this when someone dials a client's Twilio number ──
app.post('/api/telephony/voice', async (req, res) => {
  try {
    const calledNumber = req.body.Called || req.body.To || '';
    const callerNumber = req.body.From || '';
    const client = findClientByTwilioNumber(calledNumber);

    if (!client) {
      console.warn('[Telephony/voice] No client found for number:', calledNumber);
      res.type('text/xml').send(twiml(
        `<Say voice="alice">We're sorry, this number is not currently in service. Please try again later.</Say><Hangup/>`
      ));
      return;
    }

    const biz = client.data.businessName || 'the business';
    const industry = (client.data.industry || 'service').replace(/_/g, ' ');

    if (isAfterHours(client)) {
      // After hours: greeting + voicemail + SMS
      console.log(`[Telephony/voice] After-hours call to ${biz} from ${callerNumber}`);
      res.type('text/xml').send(twiml(
        `<Say voice="alice">Thank you for calling ${biz}. We are currently closed. Please leave a message after the tone and we will return your call on our next business day. You can also send us a text at this number for immediate AI assistance.</Say>` +
        `<Record maxLength="120" action="${BASE_URL}/api/telephony/voicemail" transcribe="true" transcribeCallback="${BASE_URL}/api/telephony/transcription" />`
      ));

      // Send after-hours text to caller
      (async () => {
        try {
          let aiReply = `Hi! Thanks for calling ${biz}. We're currently closed but received your call. We'll get back to you first thing on our next business day. In the meantime, feel free to text this number and our AI assistant can help with basic questions.`;

          // Try to generate a smarter reply via Workers AI
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

      // Notify admin
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `📞 After-Hours Call: ${biz} — ${callerNumber}`,
        html: `<p>After-hours call to <strong>${biz}</strong> from <strong>${callerNumber}</strong>. Voicemail recorded. Auto-text sent to caller.</p>`
      }).catch(() => {});

    } else {
      // Business hours: forward to client's phone with missed-call fallback
      console.log(`[Telephony/voice] Forwarding call to ${biz} (${client.forwardingNumber}) from ${callerNumber}`);
      const forwardTo = (client.forwardingNumber || '').replace(/\D/g, '');
      const e164Forward = forwardTo.length === 10 ? `+1${forwardTo}` : `+${forwardTo}`;

      res.type('text/xml').send(twiml(
        `<Dial callerId="${client.twilioNumber}" timeout="25" record="record-from-answer-dual" recordingStatusCallback="${BASE_URL}/api/telephony/transcription" action="${BASE_URL}/api/telephony/voice-status">` +
        `<Number>${e164Forward}</Number>` +
        `</Dial>`
      ));
    }
  } catch (err) {
    console.error('[Telephony/voice] Error:', err);
    res.type('text/xml').send(twiml(`<Say voice="alice">We're experiencing technical difficulties. Please try again later.</Say><Hangup/>`));
  }
});

// ── POST /api/telephony/voice-status — Called when <Dial> completes (missed call detection) ──
app.post('/api/telephony/voice-status', async (req, res) => {
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

      // Send missed-call text-back to the caller
      const missedMsg = `Hi! We missed your call to ${biz}. We're sorry we couldn't answer — we'll call you back as soon as possible. If it's urgent, please text this number and we can help right away.`;
      await sendSMSFrom(client.twilioNumber, callerNumber, missedMsg);

      // Notify the business owner via SMS to their forwarding number
      if (client.forwardingNumber) {
        await sendSMSFrom(client.twilioNumber, client.forwardingNumber,
          `📞 Missed call to ${biz} from ${callerNumber}. Auto text-back sent to caller.`
        ).catch(() => {});
      }

      // Notify admin
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `📵 Missed Call: ${biz} — ${callerNumber}`,
        html: `<p>Missed call to <strong>${biz}</strong> from <strong>${callerNumber}</strong>. Status: ${dialStatus}. Auto text-back sent to caller.</p>`
      }).catch(() => {});
    }
  } catch (err) { console.error('[Telephony/voice-status]', err.message); }
});

// ── POST /api/telephony/voicemail — Called when after-hours voicemail recording completes ──
app.post('/api/telephony/voicemail', async (req, res) => {
  res.type('text/xml').send(twiml(`<Say voice="alice">Thank you. We'll get back to you soon. Goodbye.</Say><Hangup/>`));
  try {
    const callerNumber = req.body.From || req.body.Caller || '';
    const calledNumber = req.body.Called || req.body.To || '';
    const recordingUrl = req.body.RecordingUrl || '';
    const client = findClientByTwilioNumber(calledNumber);
    if (!client) return;

    const biz = client.data.businessName || 'Unknown Business';
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `🎙️ Voicemail: ${biz} — from ${callerNumber}`,
      html: `<p>New voicemail for <strong>${biz}</strong> from <strong>${callerNumber}</strong>.</p>${recordingUrl ? `<p><a href="${recordingUrl}.mp3" style="color:#0066FF;">🎧 Listen to Recording</a></p>` : '<p>(Recording URL not available yet — check Twilio console)</p>'}`
    }).catch(() => {});
  } catch (err) { console.error('[Telephony/voicemail]', err.message); }
});

// ── POST /api/telephony/sms-incoming — Handles inbound SMS to a client's Twilio number ──
app.post('/api/telephony/sms-incoming', async (req, res) => {
  try {
    const smsFrom = req.body.From || '';
    const smsTo = req.body.To || '';
    const smsBody = (req.body.Body || '').trim();
    const client = findClientByTwilioNumber(smsTo);

    if (!client || !smsBody) {
      res.type('text/xml').send(twiml(''));
      return;
    }

    const biz = client.data.businessName || 'the business';
    const industry = (client.data.industry || 'service').replace(/_/g, ' ');
    const city = client.data.city || '';
    const phone = client.twilioNumber ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : '';

    console.log(`[Telephony/SMS] Inbound to ${biz} from ${smsFrom}: "${smsBody.substring(0, 80)}"`);

    // Generate AI reply via Cloudflare Workers AI
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

    // Send AI reply back
    await sendSMSFrom(client.twilioNumber, smsFrom, aiReply);

    // Forward the SMS to the business owner
    if (client.forwardingNumber) {
      await sendSMSFrom(client.twilioNumber, client.forwardingNumber,
        `📱 Text from ${smsFrom} to ${biz}:\n"${smsBody.substring(0, 300)}"\n\nAI replied automatically. Reply to this number to respond directly.`
      ).catch(() => {});
    }

    // Log to admin
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `💬 SMS: ${biz} — from ${smsFrom}`,
      html: `<div style="font-family:sans-serif;max-width:600px;"><h3 style="color:#0066FF;">Inbound SMS to ${biz}</h3><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:100px;">From</td><td style="padding:8px;">${smsFrom}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Message</td><td style="padding:8px;">${smsBody}</td></tr><tr><td style="padding:8px;font-weight:700;">AI Reply</td><td style="padding:8px;color:#059669;">${aiReply}</td></tr></table></div>`
    }).catch(() => {});

    // Respond to Twilio with empty TwiML (we already sent the reply via API)
    res.type('text/xml').send(twiml(''));
  } catch (err) {
    console.error('[Telephony/sms-incoming]', err.message);
    res.type('text/xml').send(twiml(''));
  }
});

// ── POST /api/telephony/transcription — Twilio recording/transcription callback ──
app.post('/api/telephony/transcription', async (req, res) => {
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
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `📝 Call Record: ${biz} — ${callerNumber} (${recordingDuration || '?'}s)`,
        html: `<div style="font-family:sans-serif;max-width:600px;"><h3 style="color:#0066FF;">Call Recording — ${biz}</h3><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:120px;">Caller</td><td style="padding:8px;">${callerNumber}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Duration</td><td style="padding:8px;">${recordingDuration || '?'} seconds</td></tr>${recordingUrl ? `<tr><td style="padding:8px;font-weight:700;">Recording</td><td style="padding:8px;"><a href="${recordingUrl}.mp3" style="color:#0066FF;">🎧 Listen</a></td></tr>` : ''}${transcriptionText ? `<tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Transcript</td><td style="padding:8px;">${transcriptionText}</td></tr>` : ''}</table></div>`
      }).catch(() => {});
    }
  } catch (err) { console.error('[Telephony/transcription]', err.message); }
});

// ── GET /api/admin/telephony-status — Admin view of all telephony ──
app.get('/api/admin/telephony-status', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const telephonyClients = Object.values(clients).map(c => ({
    id: c.id,
    businessName: c.data.businessName || '(unnamed)',
    status: c.status,
    twilioNumber: c.twilioNumber || null,
    forwardingNumber: c.forwardingNumber || null,
    telephonyEnabled: c.telephonyEnabled || false,
    businessHoursJson: c.businessHoursJson || null,
  })).filter(c => c.twilioNumber || c.telephonyEnabled);
  res.json({
    totalProvisioned: telephonyClients.length,
    clients: telephonyClients
  });
});

// ── GET /api/coming-soon ──
app.get('/api/coming-soon', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coming_soon_features ORDER BY sort_order ASC, created_at ASC');
    const features = result.rows.map(r => ({
      id: r.id, name: r.name, description: r.description,
      category: r.category, ratingSum: r.rating_sum, totalRatings: r.total_ratings
    }));
    res.json({ features });
  } catch(err) { console.error('[coming-soon GET]', err); res.status(500).json({ features: [] }); }
});

// ── POST /api/coming-soon ──
app.post('/api/coming-soon', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { action, id, name, description, category } = req.body;
  try {
    if (action === 'add') {
      const newId = 'feat_' + Date.now();
      await pool.query(
        'INSERT INTO coming_soon_features (id, name, description, category) VALUES ($1,$2,$3,$4)',
        [newId, name, description, category || 'New Feature']
      );
    } else if (action === 'edit') {
      await pool.query(
        'UPDATE coming_soon_features SET name=$1, description=$2, category=$3 WHERE id=$4',
        [name, description, category || 'New Feature', id]
      );
    } else if (action === 'delete') {
      await pool.query('DELETE FROM coming_soon_features WHERE id=$1', [id]);
    }
    const result = await pool.query('SELECT * FROM coming_soon_features ORDER BY sort_order ASC, created_at ASC');
    const features = result.rows.map(r => ({
      id: r.id, name: r.name, description: r.description,
      category: r.category, ratingSum: r.rating_sum, totalRatings: r.total_ratings
    }));
    res.json({ features });
  } catch(err) { console.error('[coming-soon POST]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/coming-soon/rate ──
app.post('/api/coming-soon/rate', postLimiter, async (req, res) => {
  const { featureId, rating } = req.body;
  if (!featureId || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid' });
  try {
    await pool.query(
      'UPDATE coming_soon_features SET rating_sum = rating_sum + $1, total_ratings = total_ratings + 1 WHERE id = $2',
      [Math.round(rating), featureId]
    );
    res.json({ success: true });
  } catch(err) { console.error('[coming-soon/rate]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── Static admin page ──
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });

// ── Health check ──
app.get('/health', (req, res) => { res.json({ status: 'ok', clients: Object.keys(clients).length, uptime: process.uptime() }); });

// ── Catch-all SPA ──
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Not found');
});

// ── Start ──
initDB().then(() => loadClientsFromDB()).then(() => {
  app.listen(PORT, () => console.log(`[TurnkeyAI] Server running on port ${PORT}`));
}).catch(err => { console.error('[startup error]', err); process.exit(1); });
