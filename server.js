const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const { Pool } = require('pg');
const app = express();

app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = 'george@turnkeyaiservices.com';
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Startup validation ──
if (!ADMIN_KEY) { console.error('[FATAL] ADMIN_KEY env var is not set. Exiting.'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('[FATAL] DATABASE_URL env var is not set. Exiting.'); process.exit(1); }

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── PostgreSQL setup ──
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
  console.log('[DB] Table ready.');
}

// In-memory cache (same pattern as before — fast reads, DB is source of truth)
let clients = {};

async function loadClientsFromDB() {
  const result = await pool.query('SELECT * FROM clients');
  clients = {};
  for (const row of result.rows) {
    clients[row.id] = rowToClient(row);
  }
  console.log(`[DB] Loaded ${result.rows.length} clients into memory.`);
}

function rowToClient(row) {
  const data = row.data || {};
  if (row.mini_me_video_file) data.miniMeVideoUrl = data.miniMeVideoUrl || null;
  return {
    id: row.id,
    status: row.status,
    data: data,
    previewToken: row.preview_token,
    dashToken: row.dash_token,
    dashPassword: row.dash_password,
    liveUrl: row.live_url,
    cfProjectName: row.cf_project_name,
    miniMeConsent: row.mini_me_consent,
    miniMeConsentAt: row.mini_me_consent_at ? row.mini_me_consent_at.toISOString() : null,
    miniMeSubscribed: row.mini_me_subscribed,
    miniMeSubscribedAt: row.mini_me_subscribed_at ? row.mini_me_subscribed_at.toISOString() : null,
    miniMeVideoFile: row.mini_me_video_file,
    promoVideoFile: row.promo_video_file,
    freeVideoRequested: row.free_video_requested,
    logoFile: row.logo_file,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

async function saveClient(client) {
  // Update in-memory immediately
  clients[client.id] = client;
  // Persist to DB
  try {
    await pool.query(`
      INSERT INTO clients (
        id, status, data, preview_token, dash_token, dash_password,
        live_url, cf_project_name, mini_me_consent, mini_me_consent_at,
        mini_me_subscribed, mini_me_subscribed_at, mini_me_video_file,
        promo_video_file, free_video_requested, logo_file, approved_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        data = EXCLUDED.data,
        preview_token = EXCLUDED.preview_token,
        dash_token = EXCLUDED.dash_token,
        dash_password = EXCLUDED.dash_password,
        live_url = EXCLUDED.live_url,
        cf_project_name = EXCLUDED.cf_project_name,
        mini_me_consent = EXCLUDED.mini_me_consent,
        mini_me_consent_at = EXCLUDED.mini_me_consent_at,
        mini_me_subscribed = EXCLUDED.mini_me_subscribed,
        mini_me_subscribed_at = EXCLUDED.mini_me_subscribed_at,
        mini_me_video_file = EXCLUDED.mini_me_video_file,
        promo_video_file = EXCLUDED.promo_video_file,
        free_video_requested = EXCLUDED.free_video_requested,
        logo_file = EXCLUDED.logo_file,
        approved_at = EXCLUDED.approved_at,
        updated_at = NOW()
    `, [
      client.id,
      client.status,
      JSON.stringify(client.data),
      client.previewToken,
      client.dashToken,
      client.dashPassword,
      client.liveUrl,
      client.cfProjectName,
      client.miniMeConsent || false,
      client.miniMeConsentAt || null,
      client.miniMeSubscribed || false,
      client.miniMeSubscribedAt || null,
      client.miniMeVideoFile || null,
      client.promoVideoFile || null,
      client.freeVideoRequested || false,
      client.logoFile || null,
      client.approvedAt || null,
    ]);
  } catch (e) {
    console.error('[saveClient DB error]', e.message);
  }
}

// Legacy shim — any old saveClients() calls now flush all dirty clients
function saveClients() {
  Object.values(clients).forEach(c => saveClient(c).catch(e => console.error('[saveClients shim]', e.message)));
}

function makeToken() { return crypto.randomBytes(16).toString('hex'); }
function makePassword() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function makeSlug(n) {
  return (n||'client').toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,40).replace(/-$/,'');
}

async function sendEmail({ to, subject, html }) {
  if (!BREVO_API_KEY) { console.warn('[email] No BREVO_API_KEY'); return; }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'TurnkeyAI Services', email: 'noreply@turnkeyaiservices.com' },
      to: [{ email: to }], subject, htmlContent: html
    })
  });
  const d = await res.json();
  if (!res.ok) console.error('[Brevo error]', d);
  return d;
}

async function sendSMS(to, body) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
    console.warn('[Twilio] Missing credentials — SMS skipped'); return { skipped: true };
  }
  const cleaned = to.replace(/\D/g, '');
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

function generateVideoScript(data) {
  const biz = data.businessName || 'our business';
  const owner = data.ownerName || 'there';
  const city = data.city || 'your area';
  const industry = (data.industry || 'service').replace(/_/g, ' ');
  const tagline = data.missionStatement || `Quality ${industry} you can count on`;
  const phone = data.phone || '';
  const services = Object.keys(data).filter(k => k.startsWith('service_') && data[k]==='on').slice(0,2).map(k=>k.replace('service_','').replace(/_/g,' ')).join(' or ');
  return `Hi, I'm ${owner} from ${biz}.\n\nWe're a ${industry} business proudly serving ${city} and the surrounding areas.\n\n${tagline}.\n\n${services ? `Whether you need help with ${services}, we're here for you.` : 'We are here to serve you.'}\n\n${phone ? `Give us a call at ${phone} — ` : ''}We look forward to earning your business.`;
}

async function sendMiniMeEmail(client) {
  const data = client.data;
  const script = generateVideoScript(data);
  const uploadUrl = `${BASE_URL}/video-upload.html?token=${client.previewToken}`;
  const consentUrl = `${BASE_URL}/api/mini-me-consent/${client.id}?token=${client.previewToken}`;
  const subscribeUrl = `${BASE_URL}/api/mini-me-subscribe/${client.id}?token=${client.previewToken}`;
  await sendEmail({
    to: data.email,
    subject: `🎬 Your Mini-Me AI Avatar — Next Steps — ${data.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:32px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:#00D68F;margin:0;font-size:28px;">Meet Your Mini-Me</h1><p style="color:rgba(255,255,255,.85);margin:8px 0 0;">Your AI-powered digital twin is almost ready</p></div><div style="padding:32px;"><p>Hi ${data.ownerName || 'there'},</p><p>You're signed up for <strong>Mini-Me</strong> — your personal AI avatar that represents you on your website 24/7.</p><div style="background:#f8fafc;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="color:#00D68F;margin:0 0 16px;">📝 Your Script</h3><p style="font-style:italic;line-height:1.9;color:#1a1a2e;white-space:pre-line;">${script}</p></div><div style="text-align:center;margin:24px 0;"><a href="${uploadUrl}" style="background:#0066FF;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">📤 Upload My Video Clip</a></div><div style="text-align:center;margin:24px 0;"><a href="${consentUrl}" style="background:#00D68F;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">✅ I Consent — Build My Mini-Me</a></div><div style="background:#fff8ed;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-top:24px;"><p style="margin:0;font-size:14px;color:#92400e;"><strong>Continue Mini-Me after your free avatar?</strong> Just $59/month. <a href="${subscribeUrl}" style="color:#0066FF;font-weight:700;">✅ Yes, sign me up →</a></p></div><p style="margin-top:32px;">Questions? Call <strong>(228) 604-3200</strong></p><p>— The TurnkeyAI Services Team</p></div></div>`
  });
}

async function sendFreeVideoEmail(client) {
  const data = client.data;
  const script = generateVideoScript(data);
  const uploadUrl = `${BASE_URL}/video-upload.html?token=${client.previewToken}&type=promo`;
  await sendEmail({
    to: data.email,
    subject: `🎬 Your Free 60-Second Promo Video — Next Steps — ${data.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#00D68F,#0066FF);padding:32px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:28px;">Your Free Promo Video</h1></div><div style="padding:32px;"><p>Hi ${data.ownerName || 'there'},</p><p>As a TurnkeyAI client you get one <strong>free 60-second promotional video</strong>.</p><div style="background:#f8fafc;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="color:#0066FF;margin:0 0 16px;">📝 Your Script</h3><p style="font-style:italic;line-height:1.9;color:#1a1a2e;white-space:pre-line;">${script}</p></div><div style="text-align:center;margin:24px 0;"><a href="${uploadUrl}" style="background:#0066FF;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">📤 Upload My Video Clip</a></div><p>We'll have your finished video back to you within 48 hours.</p><p style="margin-top:24px;">Questions? Call <strong>(228) 604-3200</strong></p><p>— The TurnkeyAI Services Team</p></div></div>`
  });
}

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
    await new Promise(r => setTimeout(r, 2000));
  }
  const htmlBuffer = Buffer.from(htmlContent, 'utf8');
  const htmlHash = require('crypto').createHash('sha256').update(htmlBuffer).digest('hex');
  const manifest = { '/index.html': htmlHash };
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest), { filename: 'manifest', contentType: 'application/json' });
  form.append('/index.html', htmlBuffer, { filename: 'index.html', contentType: 'text/html; charset=utf-8' });
  const deployRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, ...form.getHeaders() }, body: form }
  );
  const deployData = await deployRes.json();
  console.log('[CF Pages deploy response]', JSON.stringify(deployData).substring(0,300));
  if (!deployRes.ok) throw new Error('CF Pages deploy failed: ' + JSON.stringify(deployData.errors));
  const liveUrl = `https://${projectName}.pages.dev`;
  console.log(`[CF Pages] Deployed: ${liveUrl}`);
  return { url: liveUrl, deploymentId: deployData.result?.id };
}

async function sendCredentialsEmail(client) {
  const dashUrl = `${BASE_URL}/client-dashboard.html?token=${client.dashToken}`;
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
        <p>Congratulations — <strong>${client.data.businessName}</strong> is now live and ready for customers!</p>
        <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
          <p style="font-size:13px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Your Live Website</p>
          <a href="${client.liveUrl}" style="font-size:22px;font-weight:700;color:#0066FF;text-decoration:none;">${client.liveUrl}</a>
        </div>
        <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#0066FF;">📋 Your Client Dashboard</h3>
          <p style="margin:0 0 8px;font-size:15px;"><strong>Login URL:</strong><br><a href="${dashUrl}" style="color:#0066FF;word-break:break-all;">${dashUrl}</a></p>
          <p style="margin:16px 0 0;font-size:15px;"><strong>Your Password:</strong></p>
          <div style="background:#1a1a2e;color:#00D68F;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;border-radius:8px;margin-top:8px;">${client.dashPassword}</div>
          <p style="font-size:12px;color:#6B7280;margin-top:8px;">Keep this password safe — use it to log into your dashboard</p>
        </div>
        <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(228) 604-3200</strong> or email <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

async function runDeploy(client) {
  const dashToken = makeToken();
  const dashPassword = makePassword();
  const projectName = `turnkeyai-${makeSlug(client.data.businessName)}`;
  const liveHTML = generateSiteHTML(client.data, false);
  const deployment = await deployToCloudflarePages(projectName, liveHTML);
  client.status = 'active';
  client.dashToken = dashToken;
  client.dashPassword = dashPassword;
  client.liveUrl = deployment.url || `https://${projectName}.pages.dev`;
  client.cfProjectName = projectName;
  client.approvedAt = new Date().toISOString();
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
  await sendCredentialsEmail(client);
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `✅ LIVE: ${client.data.businessName}`,
    html: `<p><strong>${client.data.businessName}</strong> is live at <a href="${client.liveUrl}">${client.liveUrl}</a></p><p>Dashboard password: <strong>${client.dashPassword}</strong></p><p>Client: ${client.data.ownerName} — ${client.data.email} — ${client.data.phone}</p>`
  });
  if (client.data.addon_after_hours === 'yes' || client.data.addon_missed_call === 'yes' || client.data.addon_voicemail_drop === 'yes') {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📞 Phone Services Needed: ${client.data.businessName}`,
      html: `<p><strong>${client.data.businessName}</strong> requested phone services:<br>After Hours: ${client.data.addon_after_hours==='yes'?'✅':'❌'} | Missed Call SMS: ${client.data.addon_missed_call==='yes'?'✅':'❌'} | Voicemail Drop: ${client.data.addon_voicemail_drop==='yes'?'✅':'❌'}<br>Phone: ${client.data.phone} — assign Twilio number and configure.</p>`
    }).catch(() => {});
  }
  return client;
}


// ── FINALIZED DESIGN STANDARD: Gulf Coast Plumbing Template ──
// Bebas Neue + DM Sans | Navy/Amber/Orange | Cinematic hero bg + slow-zoom
// Trust bar | Service cards | Why Us | Reviews | Booking form | CTA | Footer
function generateSiteHTML(data, isPreview) {
  const biz      = data.businessName || 'Your Business';
  const owner    = data.ownerName || '';
  const phone    = data.phone || '';
  const email    = data.email || '';
  const city     = data.city || data.targetCity || '';
  const state    = data.state || '';
  const address  = [data.address, city, state, data.zip].filter(Boolean).join(', ');
  const about    = data.aboutUs || '';
  const tagline  = data.missionStatement || `Quality service you can count on.`;
  const industry = (data.industry || 'local business').replace(/_/g, ' ');
  const advantage= data.competitiveAdvantage || '';
  const awards   = data.awards || '';
  const ownerPhoto  = data.ownerPhoto || '';
  const miniMeVideo = data.miniMeVideoUrl || '';
  const chatEndpoint = `${BASE_URL}/api/chat`;
  const chatName = data.chatName || 'Chat With Us';
  const chatPersonality = data.chatPersonality || 'friendly';

  const heroImages = {
    plumbing:    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80',
    electrician: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1600&q=80',
    electrical:  'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1600&q=80',
    hvac:        'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80',
    roofing:     'https://images.unsplash.com/photo-1632823471565-1ecdf5c6da12?w=1600&q=80',
    landscaping: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d84?w=1600&q=80',
    lawn:        'https://images.unsplash.com/photo-1558618047-3c8c76ca7d84?w=1600&q=80',
    cleaning:    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1600&q=80',
    auto_repair: 'https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=1600&q=80',
    automotive:  'https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=1600&q=80',
    restaurant:  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80',
    salon:       'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=80',
    fencing:     'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?w=1600&q=80',
    construction:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
    painting:    'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=1600&q=80',
    pest_control:'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=1600&q=80',
    agriculture: 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=1600&q=80',
    default:     'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
  };
  const industryKey = (data.industry || '').toLowerCase().replace(/ /g,'_');
  const heroImage = heroImages[industryKey] || heroImages.default;

  const industryIcons = {
    plumbing:    ['fa-faucet-drip','fa-toilet','fa-fire-flame-curved','fa-pipe-section','fa-house-flood-water','fa-bolt'],
    electrician: ['fa-bolt','fa-plug','fa-lightbulb','fa-solar-panel','fa-screwdriver-wrench','fa-shield-halved'],
    electrical:  ['fa-bolt','fa-plug','fa-lightbulb','fa-solar-panel','fa-screwdriver-wrench','fa-shield-halved'],
    hvac:        ['fa-wind','fa-temperature-half','fa-fan','fa-snowflake','fa-fire','fa-wrench'],
    roofing:     ['fa-house-chimney','fa-hammer','fa-hard-hat','fa-cloud-rain','fa-shield-halved','fa-star'],
    landscaping: ['fa-leaf','fa-seedling','fa-tree','fa-scissors','fa-sun','fa-tractor'],
    lawn:        ['fa-leaf','fa-seedling','fa-tree','fa-scissors','fa-sun','fa-tractor'],
    cleaning:    ['fa-broom','fa-spray-can','fa-soap','fa-star','fa-shield-halved','fa-house'],
    auto_repair: ['fa-car','fa-wrench','fa-oil-can','fa-gear','fa-gauge-high','fa-screwdriver-wrench'],
    restaurant:  ['fa-utensils','fa-pizza-slice','fa-burger','fa-wine-glass','fa-star','fa-clock'],
    salon:       ['fa-scissors','fa-spa','fa-star','fa-heart','fa-clock','fa-shield-halved'],
    default:     ['fa-star','fa-shield-halved','fa-wrench','fa-thumbs-up','fa-clock','fa-phone'],
  };
  const iconSet = industryIcons[industryKey] || industryIcons.default;

  const palettes = {
    plumbing:    { primary: '#0a1628', accent: '#f59e0b', accent2: '#e85d04' },
    electrician: { primary: '#0f172a', accent: '#f59e0b', accent2: '#eab308' },
    electrical:  { primary: '#0f172a', accent: '#f59e0b', accent2: '#eab308' },
    hvac:        { primary: '#0c1a2e', accent: '#38bdf8', accent2: '#0ea5e9' },
    roofing:     { primary: '#1c0a0a', accent: '#f59e0b', accent2: '#b91c1c' },
    landscaping: { primary: '#14532d', accent: '#84cc16', accent2: '#16a34a' },
    lawn:        { primary: '#14532d', accent: '#84cc16', accent2: '#16a34a' },
    cleaning:    { primary: '#0a1628', accent: '#06b6d4', accent2: '#0891b2' },
    auto_repair: { primary: '#1e1b4b', accent: '#f59e0b', accent2: '#f97316' },
    restaurant:  { primary: '#1c0a0a', accent: '#f97316', accent2: '#dc2626' },
    salon:       { primary: '#1e1b4b', accent: '#ec4899', accent2: '#a855f7' },
    default:     { primary: '#0a1628', accent: '#f59e0b', accent2: '#e85d04' },
  };
  let pal = palettes[industryKey] || palettes.default;
  if (data.colorPreference) {
    const cp = data.colorPreference.toLowerCase();
    if      (cp.includes('red'))    pal = { primary: '#1c0a0a', accent: '#f59e0b', accent2: '#dc2626' };
    else if (cp.includes('green'))  pal = { primary: '#14532d', accent: '#84cc16', accent2: '#16a34a' };
    else if (cp.includes('purple')) pal = { primary: '#1e1b4b', accent: '#a78bfa', accent2: '#7c3aed' };
    else if (cp.includes('orange')) pal = { primary: '#1c1917', accent: '#f59e0b', accent2: '#ea580c' };
    else if (cp.includes('teal'))   pal = { primary: '#042f2e', accent: '#06b6d4', accent2: '#0d9488' };
    else if (cp.includes('blue'))   pal = { primary: '#0a1628', accent: '#38bdf8', accent2: '#0066FF' };
    else if (cp.includes('pink'))   pal = { primary: '#1e1b4b', accent: '#ec4899', accent2: '#a855f7' };
  }

  const serviceItems = [];
  Object.keys(data).forEach(k => {
    if (k.startsWith('service_') && data[k] === 'on') {
      const name = k.replace('service_', '').replace(/_/g, ' ');
      const price = data['price_' + k.replace('service_', '')] || '';
      serviceItems.push({ name: name.charAt(0).toUpperCase() + name.slice(1), price });
    }
  });
  if (data.additionalServices) {
    data.additionalServices.split('\n').forEach(s => s.trim() && serviceItems.push({ name: s.trim(), price: '' }));
  }

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hoursData = days.map((d,i) => data['day_'+d] ? { label: dayLabels[i], hours: data['hours_'+d] || 'Open' } : null).filter(Boolean);

  const payKeys = ['cash','card','check','venmo','cashapp','zelle'];
  const payLabels = { cash:'Cash', card:'Credit/Debit Card', check:'Check', venmo:'Venmo', cashapp:'CashApp', zelle:'Zelle' };
  const payMethods = payKeys.filter(k => data['pay_'+k]).map(k => payLabels[k]).join(' · ');

  const clientId = data.id || '';
  const previewToken = data._previewToken || '';
  const clientApproveUrl = clientId && previewToken ? `${BASE_URL}/api/client-approve/${clientId}?token=${previewToken}` : '';

  const previewBanner = isPreview
    ? `<div style="background:#1a1d24;border-bottom:2px solid #f59e0b;padding:0;">
        <div style="padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="color:#f59e0b;font-weight:700;font-size:14px;">🔍 PREVIEW — This site is not yet live</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${clientApproveUrl ? `<a href="${clientApproveUrl}" style="background:#00D68F;color:#071c12;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">✅ Approve &amp; Go Live →</a>` : ''}
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
        .catch(function(){alert('Send failed. Please email george@turnkeyaiservices.com');});
      }
      function submitMajorChanges(){
        var details={name:document.getElementById('maj_name').value,email:document.getElementById('maj_email').value,details:document.getElementById('maj_details').value};
        fetch('${BASE_URL}/api/preview-change-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'major',clientId:'${clientId}',token:'${previewToken}',changes:details})})
        .then(function(){document.getElementById('majorChangeSection').style.display='none';var b=document.createElement('div');b.style='position:fixed;bottom:24px;right:24px;background:#00D68F;color:#071c12;padding:16px 24px;border-radius:12px;font-weight:700;font-size:14px;z-index:9999;font-family:sans-serif;';b.textContent='✅ Message sent! We will be in touch within 24 hours.';document.body.appendChild(b);setTimeout(function(){b.remove();},5000);})
        .catch(function(){alert('Send failed. Please email george@turnkeyaiservices.com');});
      }
      <\/script>`
    : `<div style="background:${pal.primary};color:rgba(255,255,255,.7);text-align:center;padding:10px 24px;font-size:13px;">⚡ Powered by <a href="https://turnkeyaiservices.com" style="color:${pal.accent};font-weight:700;text-decoration:none;">TurnkeyAI Services</a> — AI-Powered Websites for Local Business</div>`;

  const serviceCardsHTML = serviceItems.map((s, i) => `
    <div class="svc-card" style="background:white;border-radius:14px;padding:1.8rem;box-shadow:0 4px 24px rgba(10,22,40,.08);border:1px solid rgba(10,22,40,.06);transition:transform .25s,box-shadow .25s;position:relative;overflow:hidden;">
      <div style="width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,${pal.accent},${pal.accent2});display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:white;margin-bottom:1.1rem;">
        <i class="fas ${iconSet[i % iconSet.length]}"></i>
      </div>
      <h3 style="font-size:1.05rem;font-weight:700;color:#1e293b;margin-bottom:.5rem;">${s.name}</h3>
      ${s.price ? `<p style="font-weight:700;color:${pal.accent};font-size:1rem;">${s.price}</p>` : '<p style="font-size:.88rem;color:#64748b;line-height:1.6;">Professional service you can count on.</p>'}
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
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:2.8rem;color:white;letter-spacing:1.5px;margin:0 0 1.5rem;">Meet Us Personally</h2>
        <video src="${miniMeVideo}" controls style="width:100%;border-radius:16px;max-height:380px;box-shadow:0 20px 60px rgba(0,0,0,.5);"></video>
      </div>
    </section>` : '';

  const chatSystem = `You work for ${biz}, a ${industry} business in ${city}. Be ${chatPersonality}. Answer questions about services, pricing, hours, and location. Phone: ${phone}. Email: ${email}. ${advantage ? 'What sets us apart: '+advantage : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${biz}${isPreview?' | PREVIEW':''} | ${city}</title>
  <meta name="description" content="${tagline} Serving ${city}${state?', '+state:''} and surrounding areas.${phone?' Call '+phone:''}">
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
    a{color:inherit}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(10,22,40,.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(245,158,11,.18)}
    .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:white;letter-spacing:2px}
    .nav-logo span{color:${pal.accent}}
    .nav-links{display:flex;gap:1.5rem;list-style:none;align-items:center}
    .nav-links a{color:rgba(255,255,255,.8);text-decoration:none;font-size:.88rem;font-weight:500;letter-spacing:.4px;transition:color .2s}
    .nav-links a:hover{color:${pal.accent}}
    .nav-cta{background:${pal.accent}!important;color:${pal.primary}!important;padding:.5rem 1.2rem;border-radius:6px;font-weight:700!important;transition:background .2s!important}
    .nav-cta:hover{background:${pal.accent2}!important;color:white!important}
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
    .stat{text-align:center}
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
    .services-section .section-title{color:#0a1628}
    .services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}
    .svc-card:hover{transform:translateY(-5px)!important;box-shadow:0 16px 48px rgba(10,22,40,.14)!important}
    .svc-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${pal.accent},${pal.accent2});transform:scaleX(0);transition:transform .3s}
    .svc-card:hover::after{transform:scaleX(1)}
    .why-section{background:${pal.primary};position:relative;overflow:hidden}
    .why-bg{position:absolute;inset:0;background-image:url('${heroImage}');background-size:cover;background-position:center;opacity:.07}
    .why-section .section-title{color:white}
    .why-section .section-sub{color:rgba(255,255,255,.6)}
    .why-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.4rem;margin-top:2.8rem}
    .why-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:1.7rem;transition:background .25s,transform .25s}
    .why-card:hover{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);transform:translateY(-4px)}
    .why-card i{font-size:1.7rem;color:${pal.accent};margin-bottom:.9rem;display:block}
    .why-card h4{font-size:.97rem;font-weight:700;color:white;margin-bottom:.45rem}
    .why-card p{font-size:.84rem;color:rgba(255,255,255,.5);line-height:1.6}
    .reviews-section{background:white}
    .reviews-section .section-title{color:#0a1628}
    .reviews-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}
    .review-card{background:#f0f4ff;border-radius:14px;padding:1.7rem;border-left:4px solid ${pal.accent};box-shadow:0 2px 16px rgba(10,22,40,.06);transition:transform .2s,box-shadow .2s}
    .review-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(10,22,40,.1)}
    .stars{color:${pal.accent};font-size:.88rem;margin-bottom:.75rem}
    .review-card p{font-size:.92rem;color:#1e293b;line-height:1.7;font-style:italic;margin-bottom:.9rem}
    .reviewer{font-size:.8rem;font-weight:700;color:#0a1628;letter-spacing:.3px}
    .booking-section{background:#f0f4ff}
    .booking-section .section-title{color:#0a1628}
    .booking-wrap{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:2.8rem;align-items:start}
    .booking-info h3{font-size:1.2rem;font-weight:700;color:#0a1628;margin-bottom:.9rem}
    .booking-info p{font-size:.92rem;color:#64748b;line-height:1.7;margin-bottom:1.4rem}
    .booking-perks{list-style:none;display:flex;flex-direction:column;gap:.65rem}
    .booking-perks li{display:flex;align-items:center;gap:.55rem;font-size:.9rem;color:#1e293b}
    .booking-perks li i{color:${pal.accent};font-size:.85rem}
    .booking-form{background:white;border-radius:16px;padding:2rem;box-shadow:0 8px 32px rgba(10,22,40,.1);border:1px solid rgba(10,22,40,.07)}
    .booking-form h4{font-size:1.05rem;font-weight:700;color:#0a1628;margin-bottom:1.4rem}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.9rem;margin-bottom:.9rem}
    .form-group{display:flex;flex-direction:column;gap:.3rem;margin-bottom:.9rem}
    .form-group label{font-size:.72rem;font-weight:700;color:#0a1628;letter-spacing:.3px;text-transform:uppercase}
    .form-group input,.form-group select,.form-group textarea{border:1.5px solid #e2e8f0;border-radius:8px;padding:.65rem .85rem;font-size:.9rem;font-family:inherit;color:#1e293b;background:#f8fafc;transition:border-color .2s;outline:none}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:${pal.accent};box-shadow:0 0 0 3px rgba(245,158,11,.12)}
    .form-group textarea{resize:vertical;min-height:75px}
    .btn-book{width:100%;background:${pal.accent};color:${pal.primary};border:none;border-radius:8px;padding:.88rem;font-size:.97rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s,transform .2s;display:flex;align-items:center;justify-content:center;gap:.5rem}
    .btn-book:hover{background:${pal.accent2};color:white;transform:translateY(-2px);box-shadow:0 8px 24px rgba(245,158,11,.35)}
    .form-note{font-size:.72rem;color:#64748b;text-align:center;margin-top:.65rem}
    .cta-section{background:linear-gradient(135deg,${pal.primary} 0%,#1a3a6b 60%,rgba(232,93,4,.2) 100%);position:relative;overflow:hidden;text-align:center}
    .cta-section::before{content:'';position:absolute;inset:0;background-image:url('${heroImage}');background-size:cover;background-position:center;opacity:.06}
    .cta-section .container{position:relative;z-index:2}
    .cta-section .section-title{color:white}
    .cta-section p{color:rgba(255,255,255,.75);font-size:1.05rem;max-width:480px;margin:0 auto 2.2rem;line-height:1.7}
    .cta-phone{display:block;font-family:'Bebas Neue',sans-serif;font-size:2.6rem;color:${pal.accent};text-decoration:none;letter-spacing:2px;margin-bottom:1.4rem;transition:color .2s}
    .cta-phone:hover{color:white}
    footer{background:#050d1a;padding:2.5rem 1.5rem 1.8rem;border-top:1px solid rgba(245,158,11,.15)}
    .footer-inner{max-width:1080px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1.2rem}
    .footer-logo{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:white;letter-spacing:2px}
    .footer-logo span{color:${pal.accent}}
    .footer-links{display:flex;gap:1.4rem}
    .footer-links a{color:rgba(255,255,255,.45);font-size:.82rem;text-decoration:none;transition:color .2s}
    .footer-links a:hover{color:${pal.accent}}
    .footer-copy{color:rgba(255,255,255,.25);font-size:.75rem;width:100%;text-align:center;margin-top:1.4rem;padding-top:1.4rem;border-top:1px solid rgba(255,255,255,.06)}
    #chatWidget{position:fixed;bottom:24px;right:24px;z-index:9999}
    #chatToggleBtn{background:linear-gradient(135deg,${pal.accent},${pal.accent2});color:${pal.primary};border:none;border-radius:50px;padding:13px 20px;font-size:.92rem;font-weight:700;cursor:pointer;box-shadow:0 6px 24px rgba(245,158,11,.4);font-family:inherit;display:flex;align-items:center;gap:8px;white-space:nowrap}
    #chatBox{display:none;flex-direction:column;background:white;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,.2);width:330px;max-height:470px;overflow:hidden;border:1px solid #e5e7eb}
    #chatHeader{background:linear-gradient(135deg,${pal.primary},#1a3a6b);color:white;padding:15px 18px;display:flex;justify-content:space-between;align-items:center}
    #chatMessages{flex:1;overflow-y:auto;padding:14px;min-height:210px;background:#f9fafb}
    #chatInputRow{padding:11px;border-top:1px solid #e5e7eb;display:flex;gap:8px;background:white}
    #chatInput{flex:1;padding:9px 13px;border:2px solid #e5e7eb;border-radius:10px;font-size:.88rem;font-family:inherit;outline:none;transition:border-color .2s}
    #chatInput:focus{border-color:${pal.accent}}
    #chatSendBtn{background:${pal.accent};color:${pal.primary};border:none;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:700;font-size:.88rem;font-family:inherit}
    .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
    .reveal.visible{opacity:1;transform:translateY(0)}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @media(max-width:768px){.booking-wrap{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}.nav-links li:not(:last-child){display:none}}
    @media(max-width:400px){#chatBox{width:calc(100vw - 32px)}}
  </style>
</head>
<body>

${previewBanner}

<nav>
  <div class="nav-logo">${biz.split(' ').slice(0,-1).join(' ')||biz} <span>${biz.split(' ').length > 1 ? biz.split(' ').slice(-1)[0] : ''}</span></div>
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
    <h1>${biz.split(' ').slice(0,-1).join(' ')||biz} <span>${biz.split(' ').length > 1 ? biz.split(' ').slice(-1)[0] : ''}</span></h1>
    <p>${tagline}</p>
    <div class="hero-btns">
      ${phone?`<a href="tel:${phone.replace(/\D/g,'')}" class="btn-primary"><i class="fas fa-phone"></i> Call Now — Free Estimate</a>`:''}
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

${serviceItems.length ? `
<section class="services-section" id="services">
  <div class="container">
    <div class="reveal">
      <div class="section-label">What We Do</div>
      <h2 class="section-title">Our Services</h2>
      <p class="section-sub">Proudly serving ${city}${state?', '+state:''} and surrounding areas with professional ${industry} services.</p>
    </div>
    <div class="services-grid">${serviceCardsHTML}</div>
    ${payMethods?`<div class="reveal" style="text-align:center;margin-top:2rem;padding:1.2rem;background:white;border-radius:10px;box-shadow:0 2px 12px rgba(10,22,40,.06);"><p style="color:#64748b;font-size:.92rem;">💳 We accept: <strong style="color:#0a1628;">${payMethods}</strong></p></div>`:''}
  </div>
</section>` : ''}

<section class="why-section" id="why">
  <div class="why-bg"></div>
  <div class="container" style="position:relative;z-index:2;">
    <div class="reveal">
      <div class="section-label">Why Choose Us</div>
      <h2 class="section-title">The ${city} Standard</h2>
      <p class="section-sub">We're not just a ${industry} company — we're your neighbors. We show up, do it right, and treat your property like our own.</p>
    </div>
    <div class="why-grid">
      <div class="why-card reveal"><i class="fas fa-stopwatch"></i><h4>Fast Response</h4><p>Same-day service available. For emergencies, we target a 60-minute arrival window in our service area.</p></div>
      <div class="why-card reveal"><i class="fas fa-tag"></i><h4>Upfront Pricing</h4><p>You're quoted a flat price before we start. No surprises, no hourly mystery charges, ever.</p></div>
      <div class="why-card reveal"><i class="fas fa-certificate"></i><h4>Licensed Professionals</h4><p>Every job is performed by fully licensed and insured technicians — never a helper or sub.</p></div>
      <div class="why-card reveal"><i class="fas fa-broom"></i><h4>Clean Job Sites</h4><p>We protect your property, clean up completely, and leave things better than we found them.</p></div>
    </div>
    ${advantage?`<div class="reveal" style="margin-top:2.5rem;background:rgba(255,255,255,.07);border:1px solid rgba(245,158,11,.3);border-radius:14px;padding:1.5rem 2rem;display:flex;align-items:flex-start;gap:1rem;"><i class="fas fa-trophy" style="color:${pal.accent};font-size:1.5rem;margin-top:.2rem;flex-shrink:0;"></i><p style="color:rgba(255,255,255,.85);line-height:1.7;font-size:.97rem;">${advantage}</p></div>`:''}
  </div>
</section>

${about||ownerPhoto?`
<section style="padding:5.5rem 1.5rem;background:white;" id="about">
  <div class="container">
    <div style="display:grid;grid-template-columns:${ownerPhoto?'1fr 1fr':'1fr'};gap:3.5rem;align-items:center;">
      <div class="reveal">
        <div class="section-label">Our Story</div>
        <h2 class="section-title" style="color:#0a1628;">About ${biz}</h2>
        ${about?`<p style="font-size:1rem;color:#374151;line-height:1.85;margin-bottom:1.2rem;">${about}</p>`:''}
        ${data.ownerBackground?`<p style="font-size:.92rem;color:#64748b;line-height:1.7;">${data.ownerBackground}</p>`:''}
      </div>
      ${ownerPhoto?`<div class="reveal"><img src="${ownerPhoto}" alt="${owner}" style="width:100%;border-radius:20px;object-fit:cover;max-height:420px;box-shadow:0 20px 60px rgba(0,0,0,.12);"></div>`:''}
    </div>
  </div>
</section>`:''}

<section class="reviews-section" id="reviews">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Customer Reviews</div>
      <h2 class="section-title">What Our Clients Say</h2>
    </div>
    <div class="reviews-grid">
      <div class="review-card reveal"><div class="stars">★★★★★</div><p>"Fast, professional, and fair pricing. They showed up on time and got the job done right the first time. Highly recommend!"</p><div class="reviewer">— Satisfied Customer, ${city}</div></div>
      <div class="review-card reveal"><div class="stars">★★★★★</div><p>"Best ${industry} company in the area. They quoted me less than the competition and the quality of work was excellent."</p><div class="reviewer">— Happy Client, ${state||city}</div></div>
      <div class="review-card reveal"><div class="stars">★★★★★</div><p>"Called in the morning, they were here by noon. Explained everything clearly and left the place spotless. Will call again!"</p><div class="reviewer">— Local Homeowner, ${city}</div></div>
    </div>
  </div>
</section>

<section class="booking-section" id="booking">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Schedule Service</div>
      <h2 class="section-title">Book Your Appointment</h2>
      <p class="section-sub">Fill out the form and we'll confirm your appointment within the hour.</p>
    </div>
    <div class="booking-wrap">
      <div class="booking-info reveal">
        <h3>Fast, Easy Scheduling</h3>
        <p>No phone tag, no waiting on hold. Submit your request and we'll confirm your time slot promptly.</p>
        <ul class="booking-perks">
          <li><i class="fas fa-check-circle"></i> Same-day appointments often available</li>
          <li><i class="fas fa-check-circle"></i> Free estimates on all jobs</li>
          <li><i class="fas fa-check-circle"></i> Upfront pricing before we start</li>
          <li><i class="fas fa-check-circle"></i> Licensed, insured technicians</li>
          <li><i class="fas fa-check-circle"></i> 24/7 emergency line available</li>
        </ul>
      </div>
      <div class="booking-form reveal">
        <h4><i class="fas fa-calendar-check" style="color:${pal.accent};margin-right:.4rem;"></i> Request an Appointment</h4>
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
            ${serviceItems.length ? serviceItems.map(s=>`<option>${s.name}</option>`).join('') : `<option>${industry.charAt(0).toUpperCase()+industry.slice(1)} Service</option>`}
            <option>Other / Not Sure</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Preferred Date</label><input type="date" id="book_date"></div>
          <div class="form-group"><label>Preferred Time</label>
            <select id="book_time"><option>Morning (8am–12pm)</option><option>Afternoon (12pm–5pm)</option><option>Evening (5pm–8pm)</option></select>
          </div>
        </div>
        <div class="form-group"><label>Describe the Issue</label><textarea id="book_notes" placeholder="Brief description of what you need…"></textarea></div>
        <button class="btn-book" onclick="handleBooking(this)"><i class="fas fa-calendar-check"></i> Request Appointment</button>
        <p class="form-note">We'll confirm your appointment by phone or email within 1 hour.</p>
      </div>
    </div>
  </div>
</section>

<section class="cta-section" id="contact">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Ready to Get Started?</div>
      <h2 class="section-title">Get Your Free Estimate Today</h2>
      <p>Call us now or submit a request. We'll respond within the hour during business hours — and immediately for emergencies.</p>
      ${phone?`<a href="tel:${phone.replace(/\D/g,'')}" class="cta-phone"><i class="fas fa-phone-volume"></i> ${phone}</a>`:''}
      <a href="#booking" class="btn-primary" style="font-size:1rem;padding:.95rem 2.2rem;display:inline-flex;"><i class="fas fa-calendar-check"></i> Schedule Online</a>
    </div>
  </div>
</section>

${(hoursData.length||phone||email||address.length>5)?`
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
          ${phone?`<a href="tel:${phone.replace(/\D/g,'')}" style="display:flex;align-items:center;gap:1rem;color:white;text-decoration:none;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">📞</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Phone / Text</div><div style="font-size:1rem;font-weight:600;">${phone}</div></div></a>`:''}
          ${email?`<a href="mailto:${email}" style="display:flex;align-items:center;gap:1rem;color:white;text-decoration:none;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">✉️</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Email</div><div style="font-size:.92rem;font-weight:500;word-break:break-all;">${email}</div></div></a>`:''}
          ${address.length>5?`<div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">📍</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Location</div><div style="font-size:.92rem;font-weight:500;color:rgba(255,255,255,.85);">${address}</div></div></div>`:''}
        </div>
      </div>
    </div>
  </div>
</section>`:''}

<footer>
  <div class="footer-inner">
    <div class="footer-logo">${biz.split(' ').slice(0,-1).join(' ')||biz} <span>${biz.split(' ').length > 1 ? biz.split(' ').slice(-1)[0] : ''}</span></div>
    <div class="footer-links">
      <a href="#services">Services</a>
      <a href="#why">About</a>
      <a href="#reviews">Reviews</a>
      <a href="#booking">Book</a>
      <a href="#contact">Contact</a>
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
      <span onclick="closeChat()" style="cursor:pointer;font-size:1.2rem;opacity:.7;line-height:1;">✕</span>
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
  var els=document.querySelectorAll('.reveal');
  var obs=new IntersectionObserver(function(entries){entries.forEach(function(e,i){if(e.isIntersecting){setTimeout(function(){e.target.classList.add('visible');},i*70);}});},{threshold:.1});
  els.forEach(function(el){obs.observe(el);});
})();
function handleBooking(btn){
  var fname=document.getElementById('book_fname').value.trim();
  var lname=document.getElementById('book_lname').value.trim();
  var phone=document.getElementById('book_phone').value.trim();
  var email=document.getElementById('book_email').value.trim();
  var service=document.getElementById('book_service').value.trim();
  var date=document.getElementById('book_date').value.trim();
  var time=document.getElementById('book_time').value.trim();
  var notes=document.getElementById('book_notes').value.trim();
  if(!phone&&!email){alert('Please enter a phone number or email so we can confirm your appointment.');return;}
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Sending...';btn.disabled=true;
  fetch('${BASE_URL}/api/booking-lead',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({firstName:fname,lastName:lname,phone:phone,email:email,service:service,preferredDate:date,preferredTime:time,notes:notes,businessName:'${biz.replace(/'/g,"\\'")}',businessEmail:'${email.replace(/'/g,"\\'")}',businessPhone:'${phone.replace(/'/g,"\\'")}',city:'${city.replace(/'/g,"\\'")}',industry:'${industry.replace(/'/g,"\\'")}' })
  })
  .then(function(r){return r.json();})
  .then(function(){
    btn.innerHTML='<i class="fas fa-check"></i> Request Sent!';btn.style.background='#16a34a';btn.style.color='white';
    setTimeout(function(){btn.innerHTML='<i class="fas fa-calendar-check"></i> Request Appointment';btn.style.background='';btn.style.color='';btn.disabled=false;},5000);
  })
  .catch(function(){
    btn.innerHTML='<i class="fas fa-calendar-check"></i> Request Appointment';btn.disabled=false;
    alert('Something went wrong. Please call ${phone.replace(/'/g,"\\'")||'us'} directly to book.');
  });
}
(function(){
  var EP='${chatEndpoint}';
  var SYS='${chatSystem.replace(/'/g,"\\'")}';
  var msgs=[{r:'a',t:'Hi! How can I help you today with ${biz.replace(/'/g,"\\'")}?'}];
  function render(){
    var c=document.getElementById('chatMessages');if(!c)return;
    c.innerHTML=msgs.map(function(m){
      return m.r==='u'
        ?'<div style="text-align:right;margin-bottom:9px;"><span style="background:${pal.accent};color:${pal.primary};padding:7px 13px;border-radius:13px 13px 3px 13px;display:inline-block;max-width:84%;font-size:.86rem;line-height:1.5;font-weight:600;">'+m.t+'</span></div>'
        :'<div style="margin-bottom:9px;"><span style="background:white;border:1px solid #e5e7eb;padding:7px 13px;border-radius:13px 13px 13px 3px;display:inline-block;max-width:84%;font-size:.86rem;line-height:1.5;color:#1f2937;">'+m.t+'</span></div>';
    }).join('');
    c.scrollTop=c.scrollHeight;
  }
  window.openChat=function(){document.getElementById('chatToggleBtn').style.display='none';var box=document.getElementById('chatBox');box.style.display='flex';render();setTimeout(function(){document.getElementById('chatInput').focus();},100);};
  window.closeChat=function(){document.getElementById('chatBox').style.display='none';document.getElementById('chatToggleBtn').style.display='flex';};
  window.sendMsg=async function(){
    var inp=document.getElementById('chatInput');var t=(inp.value||'').trim();if(!t)return;
    msgs.push({r:'u',t:t});inp.value='';render();msgs.push({r:'a',t:'...'});render();
    try{
      var r=await fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,systemPrompt:SYS})});
      var d=await r.json();msgs[msgs.length-1]={r:'a',t:d.reply||'Sorry, I could not process that.'};
    }catch(e){msgs[msgs.length-1]={r:'a',t:'Chat is temporarily unavailable. Please call ${phone.replace(/'/g,"\\'")||"us"} directly.'};}
    render();
  };
  render();
})();
</script>

</body>
</html>`;
}


app.get('/health', (req, res) => res.json({ status: 'TurnkeyAI Backend Running', clients: Object.keys(clients).length, time: new Date().toISOString() }));

// ── NEW: Booking lead capture ──
app.post('/api/booking-lead', async (req, res) => {
  try {
    const d = req.body;
    const { firstName, lastName, phone, email, service, preferredDate, preferredTime, notes, businessName, businessEmail, businessPhone, city, industry } = d;
    // Notify business owner
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📅 New Booking Request: ${businessName} — ${firstName} ${lastName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:20px;">📅 New Booking Request</h1>
          <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px;">${businessName} — ${city}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;width:140px;">Name</td><td style="padding:10px 14px;">${firstName} ${lastName}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:700;">Phone</td><td style="padding:10px 14px;">${phone||'—'}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Email</td><td style="padding:10px 14px;">${email||'—'}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:700;">Service</td><td style="padding:10px 14px;">${service||'—'}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Date</td><td style="padding:10px 14px;">${preferredDate||'—'}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:700;">Time</td><td style="padding:10px 14px;">${preferredTime||'—'}</td></tr>
            ${notes?`<tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Notes</td><td style="padding:10px 14px;">${notes}</td></tr>`:''}
          </table>
          ${phone?`<a href="tel:${phone.replace(/\D/g,'')}" style="display:inline-block;background:#00D68F;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:10px;">📞 Call Back Now</a>`:''}
          ${email?`<a href="mailto:${email}" style="display:inline-block;background:#0066FF;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">✉️ Reply by Email</a>`:''}
        </div>
      </div>`
    });
    // Auto-reply to customer if they gave email
    if (email) {
      await sendEmail({
        to: email,
        subject: `✅ Appointment Request Received — ${businessName}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">✅ Request Received!</h1>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;">
            <p>Hi ${firstName||'there'},</p>
            <p><strong>${businessName}</strong> received your appointment request and will confirm your time slot within 1 hour.</p>
            <div style="background:#f0f4ff;border-radius:10px;padding:18px;margin:20px 0;">
              <p style="margin:0 0 8px;font-weight:700;">Your Request Summary</p>
              <p style="margin:0;font-size:14px;color:#374151;">Service: ${service||'General'}<br>Date: ${preferredDate||'TBD'}<br>Time: ${preferredTime||'TBD'}</p>
            </div>
            <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>${businessPhone||'(228) 604-3200'}</strong></p>
            <p>— ${businessName} Team</p>
          </div>
        </div>`
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch(err) {
    console.error('[/api/booking-lead]', err);
    res.status(500).json({ error: 'Failed to send booking request' });
  }
});

app.post('/api/submission-created', async (req, res) => {
  try {
    const data = req.body;
    const id = data.id || ('client_' + Date.now());
    const previewToken = makeToken();
    clients[id] = {
      id, status: 'pending', data, previewToken,
      dashToken: null, dashPassword: null, liveUrl: null, cfProjectName: null,
      miniMeConsent: null, miniMeConsentAt: null, miniMeVideoUrl: null,
      miniMeSubscribed: false,
      freeVideoRequested: data.wants_free_video === 'yes',
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
        console.log(`[logo] Saved: ${logoFile}`);
      } catch(e) { console.error('[logo save]', e.message); }
    }

    if ((data.paymentMethod || '').toLowerCase() === 'partner') {
      console.log(`[partner bypass] Auto-deploying ${data.businessName}...`);
      const partnerPreviewUrl = `${BASE_URL}/preview/${previewToken}`;
      const partnerApproveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;

      if (data.email) {
        await sendEmail({
          to: data.email,
          subject: `🎉 Your website preview is ready — ${data.businessName || 'Your Business'}`,
          html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#1F2937;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:28px;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:16px;">Hi ${data.ownerName || 'there'} — your website preview is ready to review.</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;"><p style="font-size:16px;line-height:1.75;margin:0 0 24px;">We've built a preview of your new <strong>${data.businessName || 'business'}</strong> website.</p><div style="text-align:center;margin:0 0 28px;"><a href="${partnerPreviewUrl}" style="display:inline-block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;box-shadow:0 6px 24px rgba(0,102,255,.35);">👁️ View My Website Preview</a></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 6px;font-size:15px;">Review your preview — the approve button is inside the preview page.</p></div><p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email them to <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p><p style="font-size:14px;color:#6B7280;margin:0 0 24px;">Questions? Call <strong>(228) 604-3200</strong> or reply to this email.</p><div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;"><p style="font-size:12px;color:#9CA3AF;margin:0;">TurnkeyAI Services — AI-Powered Websites for Local Business<br>Bay St. Louis, MS 39520</p></div></div></div>`
        }).catch(e => console.error('[partner bypass preview email]', e.message));
      }

      res.json({ success: true, id, preview: partnerPreviewUrl, partner: true });
      (async () => {
        try { await runDeploy(clients[id]); }
        catch(e) {
          console.error('[partner bypass deploy]', e.message);
          const c = clients[id];
          c.status = 'active';
          c.dashToken = c.dashToken || makeToken();
          c.dashPassword = c.dashPassword || makePassword();
          c.liveUrl = c.liveUrl || partnerPreviewUrl;
          c.approvedAt = new Date().toISOString();
          await saveClient(c);
          await sendCredentialsEmail(c).catch(e2 => console.error('[partner bypass credentials email]', e2.message));
        }
        const c = clients[id];
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `✅ Partner Client: ${data.businessName}`,
          html: `<p><strong>${data.businessName}</strong> submitted via Partner bypass.</p><p>Owner: ${data.ownerName} — ${data.email} — ${data.phone}</p><p>Live URL: <a href="${c.liveUrl}">${c.liveUrl}</a></p><p>Dashboard password: <strong>${c.dashPassword}</strong></p><p><a href="${partnerApproveUrl}" style="background:#00D68F;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Re-Approve & Redeploy →</a></p>`
        }).catch(e => console.error('[partner bypass admin email]', e.message));
        if (data.wants_mini_me === 'yes') {
          sendMiniMeEmail(clients[id]).catch(e => console.error('[partner bypass miniMe email]', e.message));
        } else if (data.wants_free_video === 'yes') {
          sendFreeVideoEmail(clients[id]).catch(e => console.error('[partner bypass video email]', e.message));
        }
      })();
      return;
    }

    const previewUrl = `${BASE_URL}/preview/${previewToken}`;
    const approveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;
    const d = data;

    const row = (label, val) => val
      ? `<tr><td style="padding:9px 14px;font-weight:600;color:#374151;background:#f9fafb;width:170px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${val}</td></tr>`
      : '';
    const table = (rows) => `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">${rows}</table>`;
    const h2 = (txt) => `<h2 style="color:#0066FF;font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${txt}</h2>`;

    const servicesList = Object.keys(d)
      .filter(k => k.startsWith('service_') && d[k] === 'on')
      .map(k => { const n = k.replace('service_',''); return `${n.replace(/_/g,' ')}${d['price_'+n] ? ' — ' + d['price_'+n] : ''}`; });

    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const hoursLines = days.filter(dy => d['day_'+dy]).map(dy => `<li>${dy.charAt(0).toUpperCase()+dy.slice(1)}: ${d['hours_'+dy]||'Open'}</li>`);

    const domainBlock = (() => {
      if (d.hasDomain === 'yes') {
        return `<div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:10px;padding:18px 22px;margin-bottom:22px;">
          <p style="font-weight:700;color:#92400e;margin:0 0 10px;font-size:15px;">🌐 DNS SETUP NEEDED — Customer Has Domain</p>
          <p style="margin:0 0 6px;font-size:14px;"><strong>Domain:</strong> ${d.existingDomain||'(not provided)'}</p>
          <p style="margin:0 0 6px;font-size:14px;"><strong>Registrar:</strong> ${(d.domainRegistrar||'unknown').replace(/_/g,' ')}</p>
          <p style="margin:0 0 6px;font-size:14px;"><strong>Keep existing email?</strong> ${d.keepExistingEmail==='yes'?'✅ YES — do NOT change MX records':'❌ No existing email'}</p>
          <p style="margin:0 0 0;font-size:13px;color:#92400e;"><strong>Action:</strong> Send client DNS A record instructions for ${(d.domainRegistrar||'their registrar').replace(/_/g,' ')}. Point A record to Railway IP. ${d.keepExistingEmail==='yes'?'⚠️ Preserve MX records.':''}</p>
        </div>`;
      } else if (d.hasDomain === 'no') {
        return `<div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:10px;padding:18px 22px;margin-bottom:22px;">
          <p style="font-weight:700;color:#3730a3;margin:0 0 10px;font-size:15px;">🆕 DOMAIN REGISTRATION NEEDED — Free with Package</p>
          <p style="margin:0 0 6px;font-size:14px;"><strong>Suggested domain:</strong> ${d.suggestedDomain||'(not provided — ask client)'}</p>
          <p style="margin:0 0 6px;font-size:14px;"><strong>Action:</strong> Register on Namecheap → Transfer DNS to Cloudflare → Set up Zoho free email → Point A record to Railway.</p>
          <a href="https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent((d.suggestedDomain||'').replace(/https?:\/\//,'').trim())}" style="display:inline-block;background:#6366f1;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin-top:8px;">Check Availability on Namecheap →</a>
        </div>`;
      }
      return '';
    })();

    const addons = [];
    if (d.wants_mini_me === 'yes') addons.push(`🤖 Mini-Me AI Avatar ($59/mo)`);
    if (d.wants_free_video === 'yes' && d.wants_mini_me !== 'yes') addons.push('🎬 Free 60-Second Promo Video');
    if (d.addon_after_hours === 'yes') addons.push('📞 After Hours Answering');
    if (d.addon_missed_call === 'yes') addons.push('📱 Missed Call Text Return');

    const payMethods = ['cash','card','check','venmo','cashapp','zelle'].filter(p => d['pay_'+p]).join(', ');

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||''}, ${d.state||''} — ${(d.industry||'').replace(/_/g,' ')}`,
      html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;color:#1F2937;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1><p style="color:rgba(255,255,255,0.82);margin:6px 0 0;font-size:14px;">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">${domainBlock}${h2('Business Information')}${table(`${row('Business Name', d.businessName)}${row('Owner', d.ownerName)}${row('Industry', (d.industry||'').replace(/_/g,' '))}${row('Phone', d.phone)}${row('Email', d.email)}${row('Address', [d.address,d.city,d.state,d.zip].filter(Boolean).join(', '))}${row('Years in Business', d.yearsInBusiness)}`)}${d.logoUrl?`<div style="margin-bottom:16px;"><p style="font-weight:700;font-size:14px;color:#374151;margin:0 0 8px;">Logo Uploaded:</p><img src="${d.logoUrl}" style="max-height:80px;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:white;" alt="Logo"></div>`:''}${h2('Online Presence')}${table(`${row('Current Website', d.currentWebsite)}${row('Domain Status', d.hasDomain==='yes'?`Has domain: ${d.existingDomain||''}`:d.hasDomain==='no'?`Needs domain: ${d.suggestedDomain||'TBD'}`:'Not specified')}${row('Facebook', d.facebook)}${row('Instagram', d.instagram)}${row('Google Business', d.googleBusiness)}${row('Logo', d.hasLogo==='yes'?'✅ Uploaded':d.hasLogo==='email'?'📧 Will email':'❌ Needs one')}`)}${servicesList.length ? `${h2('Services & Pricing')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${servicesList.map(s=>'<li>'+s+'</li>').join('')}</ul>` : ''}${hoursLines.length ? `${h2('Business Hours')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${hoursLines.join('')}</ul>` : ''}${h2('About the Business')}${table(`${row('Business Story', d.aboutUs)}${row('Owner Background', d.ownerBackground)}${row('Mission / Tagline', d.missionStatement)}${row('Awards / Certs', d.awards)}`)}${h2('Payment & Other')}${table(`${row('Service Radius', d.targetRadius)}${row('Competitive Advantage', d.competitiveAdvantage)}${row('Payment Methods', payMethods)}${row('Color Preference', d.colorPreference)}${row('Referral Source', d.referralSource)}${row('Additional Notes', d.additionalNotes)}`)}${addons.length ? `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#065f46;margin:0 0 10px;font-size:15px;">🎯 Add-Ons Selected</p><ul style="margin:0;padding-left:20px;line-height:2;font-size:14px;">${addons.map(a=>'<li><strong>'+a+'</strong></li>').join('')}</ul></div>` : ''}<div style="border-top:1px solid #e5e7eb;padding-top:22px;display:flex;gap:12px;flex-wrap:wrap;"><a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✅ Approve & Go Live</a><a href="${previewUrl}" style="display:inline-block;background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">👁️ Preview Site</a></div></div></div>`
    });

    if (d.email) {
      const clientAddons = [];
      if (d.wants_mini_me === 'yes') clientAddons.push('<li>🤖 <strong>Mini-Me AI Avatar</strong> — recording instructions coming in a separate email momentarily</li>');
      else if (d.wants_free_video === 'yes') clientAddons.push('<li>🎬 <strong>Free 60-Second Promo Video</strong> — recording instructions coming in a separate email momentarily</li>');
      if (d.addon_after_hours === 'yes') clientAddons.push('<li>📞 <strong>After Hours Answering</strong> — activated automatically when your site goes live</li>');
      if (d.addon_missed_call === 'yes') clientAddons.push('<li>📱 <strong>Missed Call Text Return</strong> — activated automatically when your site goes live</li>');

      await sendEmail({
        to: d.email,
        subject: `🎉 Your website preview is ready — ${d.businessName||'Your Business'}`,
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#1F2937;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:28px;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${d.ownerName||'there'} — your website preview is ready to review.</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;"><p style="font-size:16px;line-height:1.75;margin:0 0 24px;">We've built a preview of your new <strong>${d.businessName||'business'}</strong> website.</p><div style="text-align:center;margin:0 0 28px;"><a href="${previewUrl}" style="display:inline-block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;box-shadow:0 6px 24px rgba(0,102,255,.35);">👁️ View My Website Preview</a></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 6px;font-size:15px;">Review your preview — the approve button is inside the preview page.</p></div>${clientAddons.length ? `<ul style="margin:0 0 20px;padding-left:20px;line-height:2.2;font-size:14px;">${clientAddons.join('')}</ul>` : ''}<p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email them to <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p><p style="font-size:14px;color:#6B7280;margin:0 0 24px;">Questions? Call <strong>(228) 604-3200</strong> or reply to this email.</p><div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;"><p style="font-size:12px;color:#9CA3AF;margin:0;">TurnkeyAI Services — AI-Powered Websites for Local Business<br>Bay St. Louis, MS 39520</p></div></div></div>`
      });

      if (d.wants_mini_me === 'yes') {
        sendMiniMeEmail(clients[id]).catch(e => console.error('[submission miniMe email]', e.message));
      } else if (d.wants_free_video === 'yes') {
        sendFreeVideoEmail(clients[id]).catch(e => console.error('[submission video email]', e.message));
      }
    }

    res.json({ success: true, id, preview: previewUrl });
  } catch (err) { console.error('[/api/submission-created]', err); res.status(500).json({ error: 'Submission failed' }); }
});

app.get('/preview/:token', (req, res) => {
  const client = Object.values(clients).find(c => c.previewToken === req.params.token);
  if (!client) return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;">Preview not found.</h2>');
  const previewData = { ...client.data, _previewToken: client.previewToken, id: client.id };
  res.send(generateSiteHTML(previewData, true));
});

app.get('/api/approve/:id', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('<h2>Unauthorized</h2>');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('<h2>Not found</h2>');
  if (client.status === 'active') return res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Already approved</h2><p><a href="${client.liveUrl}">${client.liveUrl}</a></p></body></html>`);
  res.send(`<html><head><meta http-equiv="refresh" content="5;url=${BASE_URL}/api/approve-status/${req.params.id}?adminKey=${adminKey}"></head><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2 style="color:#0066FF;">⏳ Deploying ${client.data.businessName||'site'}...</h2><p>Takes about 10-15 seconds.</p></body></html>`);
  (async () => {
    try { await runDeploy(client); }
    catch (err) {
      console.error('[approve deploy]', err);
      client.status = 'active';
      client.dashToken = client.dashToken || makeToken();
      client.dashPassword = client.dashPassword || makePassword();
      client.liveUrl = `${BASE_URL}/preview/${client.previewToken}`;
      client.approvedAt = new Date().toISOString();
      await saveClient(client);
      sendCredentialsEmail(client).catch(e => console.error('[approve catch email]', e.message));
    }
  })();
});

app.get('/api/approve-status/:id', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('<h2>Unauthorized</h2>');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('<h2>Not found</h2>');
  if (client.status === 'active') {
    res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2 style="color:#00D68F;">✅ ${client.data.businessName||'Client'} is LIVE!</h2><p><a href="${client.liveUrl}">${client.liveUrl}</a></p><p>Password: <strong>${client.dashPassword}</strong></p><p style="margin-top:24px;"><a href="${client.liveUrl}" style="background:#00D68F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Live Site →</a></p></body></html>`);
  } else {
    res.send(`<html><head><meta http-equiv="refresh" content="3;url=${BASE_URL}/api/approve-status/${req.params.id}?adminKey=${adminKey}"></head><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>⏳ Still deploying...</h2><p>Refreshing...</p></body></html>`);
  }
});

app.get('/api/client-approve/:id', async (req, res) => {
  const { token } = req.query;
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;">Not found</h2>');
  if (!token || token !== client.previewToken) return res.status(403).send('<h2 style="font-family:sans-serif;padding:40px;">Invalid link. Please use the link from your email.</h2>');
  if (client.status === 'active') {
    return res.send(`<html><head><meta http-equiv="refresh" content="3;url=${client.liveUrl||BASE_URL+'/client-dashboard.html?token='+client.dashToken}"></head><body style="font-family:sans-serif;padding:60px;text-align:center;"><h2 style="color:#00D68F;">✅ Your site is already live!</h2><p>Redirecting to your dashboard...</p><p><a href="${client.liveUrl}" style="color:#0066FF;">${client.liveUrl}</a></p></body></html>`);
  }
  res.send(`<html><head><meta http-equiv="refresh" content="5;url=${BASE_URL}/api/client-approve-status/${req.params.id}?token=${token}"></head><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f9fafb;"><div style="max-width:480px;margin:0 auto;background:white;padding:48px 40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><div style="font-size:48px;margin-bottom:16px;">🚀</div><h2 style="color:#0066FF;margin:0 0 12px;">Launching your website...</h2><p style="color:#6B7280;font-size:15px;margin:0;">This takes about 15 seconds. Please don't close this page.</p><div style="margin-top:28px;background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;"><div style="background:linear-gradient(90deg,#0066FF,#00D68F);height:100%;width:60%;border-radius:99px;animation:bar 2s ease-in-out infinite alternate;"></div></div><style>@keyframes bar{from{width:30%}to{width:90%}}</style></div></body></html>`);
  (async () => {
    try { await runDeploy(client); }
    catch (err) {
      console.error('[client-approve deploy]', err);
      client.status = 'active';
      client.dashToken = client.dashToken || makeToken();
      client.dashPassword = client.dashPassword || makePassword();
      client.liveUrl = `${BASE_URL}/preview/${client.previewToken}`;
      client.approvedAt = new Date().toISOString();
      await saveClient(client);
      sendCredentialsEmail(client).catch(e => console.error('[client-approve catch email]', e.message));
    }
  })();
});

app.get('/api/client-approve-status/:id', (req, res) => {
  const { token } = req.query;
  const client = clients[req.params.id];
  if (!client || !token || token !== client.previewToken) return res.status(403).send('<h2>Invalid link.</h2>');
  if (client.status === 'active') {
    const dashUrl = `${BASE_URL}/client-dashboard.html?token=${client.dashToken}`;
    res.send(`<html><head><meta http-equiv="refresh" content="4;url=${dashUrl}"></head><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f9fafb;"><div style="max-width:500px;margin:0 auto;background:white;padding:48px 40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><div style="font-size:56px;margin-bottom:16px;">🎉</div><h2 style="color:#00D68F;margin:0 0 10px;">You're Live!</h2><p style="font-size:16px;color:#374151;margin:0 0 24px;"><strong>${client.data.businessName||'Your business'}</strong> is now live on the internet.</p><a href="${client.liveUrl}" style="display:block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:12px;">🌐 View My Live Site</a><a href="${dashUrl}" style="display:block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">📋 Go to My Dashboard</a><p style="margin-top:20px;font-size:13px;color:#9CA3AF;">Your dashboard password: <strong style="color:#374151;">${client.dashPassword||''}</strong></p></div></body></html>`);
  } else {
    res.send(`<html><head><meta http-equiv="refresh" content="3;url=${BASE_URL}/api/client-approve-status/${req.params.id}?token=${token}"></head><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f9fafb;"><div style="max-width:420px;margin:0 auto;background:white;padding:40px;border-radius:16px;"><div style="font-size:40px;margin-bottom:16px;">⏳</div><h2 style="color:#0066FF;">Still launching...</h2><p style="color:#6B7280;">Refreshing automatically...</p></div></body></html>`);
  }
});

app.get('/api/prefill/:id', (req, res) => {
  const { token } = req.query;
  const client = clients[req.params.id];
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (!token || (token !== client.previewToken && token !== client.dashToken)) return res.status(403).json({ error: 'Invalid token' });
  res.json({ success: true, data: client.data, businessName: client.data.businessName, status: client.status });
});

app.post('/api/client-update-intake/:id', async (req, res) => {
  const { token } = req.query;
  const client = clients[req.params.id];
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (!token || (token !== client.previewToken && token !== client.dashToken)) return res.status(403).json({ error: 'Invalid token' });
  client.data = { ...client.data, ...req.body, _updatedAt: new Date().toISOString() };
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
  try {
    if (client.status === 'active') {
      await runDeploy(client);
      await sendEmail({ to: ADMIN_EMAIL, subject: `🔄 Site Updated: ${client.data.businessName}`, html: `<p><strong>${client.data.businessName}</strong> submitted an update and their site has been rebuilt. <a href="${client.liveUrl}">View live site</a></p>` });
      if (client.data.email) await sendEmail({ to: client.data.email, subject: `Your site has been updated — ${client.data.businessName}`, html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">✅ Site Updated!</h1></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;"><p>Your changes to <strong>${client.data.businessName}</strong> are live now.</p><a href="${client.liveUrl}" style="display:inline-block;background:#0066FF;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;">View My Site →</a><p style="margin-top:20px;font-size:13px;color:#6B7280;">Questions? Call (228) 604-3200</p></div></div>` });
      res.json({ success: true, message: 'Site rebuilt', liveUrl: client.liveUrl });
    } else {
      res.json({ success: true, message: 'Info updated. Preview refreshed.', previewUrl: `${BASE_URL}/preview/${client.previewToken}` });
    }
  } catch (err) {
    console.error('[client-update-intake]', err);
    res.status(500).json({ error: 'Update failed. Please try again or call (228) 604-3200.' });
  }
});

app.post('/api/stripe-webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — rejecting request');
      return res.status(400).send('Webhook secret not configured');
    }
    if (sig) {
      const hmac = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET);
      hmac.update(req.body);
      if ('sha256='+hmac.digest('hex') !== sig) return res.status(400).send('Invalid signature');
    }
    const event = JSON.parse(req.body);
    if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.succeeded') return res.json({ received: true });
    res.json({ received: true });
    (async () => {
      try {
        const session = event.data.object;
        const customerEmail = (session.customer_email||session.receipt_email||'').toLowerCase().trim();
        if (!customerEmail) return;
        const client = Object.values(clients).find(c => c.status==='pending' && (c.data.email||'').toLowerCase().trim()===customerEmail);
        if (!client) { console.log(`[stripe-webhook] No pending client for ${customerEmail}`); return; }
        await runDeploy(client);
      } catch(err) { console.error('[stripe-webhook auto-deploy]', err.message); }
    })();
  } catch(err) { console.error('[stripe-webhook]', err.message); res.status(400).send('Error'); }
});

app.get('/api/mini-me-consent/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(404).send('<h2>Not found</h2>');
  client.miniMeConsent = true; client.miniMeConsentAt = new Date().toISOString();
  await saveClient(client);
  sendEmail({ to: ADMIN_EMAIL, subject: `✅ Mini-Me Consent: ${client.data.businessName}`, html: `<p>${client.data.businessName} (${client.data.ownerName}) consented to Mini-Me. Timestamp: ${client.miniMeConsentAt}</p>` }).catch(() => {});
  res.send(`<html><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f0fff4;"><h2 style="color:#00D68F;">✅ Consent Recorded!</h2><p>Thank you, ${client.data.ownerName||'there'}. We have your authorization to create your Mini-Me avatar.</p><p>Now upload your video clip using the link in your email!</p></body></html>`);
});

app.get('/api/mini-me-subscribe/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(404).send('<h2>Not found</h2>');
  client.miniMeSubscribed = true; client.miniMeSubscribedAt = new Date().toISOString();
  await saveClient(client);
  sendEmail({ to: ADMIN_EMAIL, subject: `💰 Mini-Me Subscription: ${client.data.businessName}`, html: `<p>${client.data.businessName} wants $59/mo Mini-Me subscription. Email: ${client.data.email}. Set up Stripe subscription.</p>` }).catch(() => {});
  res.send(`<html><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f0f9ff;"><h2 style="color:#0066FF;">🎉 You're Signed Up for Mini-Me!</h2><p>Your $59/month subscription has been requested. We'll send a payment link shortly.</p><p>Questions? Call <strong>(228) 604-3200</strong></p></body></html>`);
});

app.post('/api/video-upload', async (req, res) => {
  try {
    const { token, videoBase64, fileName, videoType } = req.body;
    const client = Object.values(clients).find(c => c.previewToken === token);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const ext = (fileName||'clip.mp4').split('.').pop()||'mp4';
    const videoFileName = `${client.id}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, videoFileName), Buffer.from(videoBase64, 'base64'));
    const isPromo = videoType === 'promo';
    if (isPromo) { client.promoVideoFile = videoFileName; client.promoVideoUploadedAt = new Date().toISOString(); }
    else { client.miniMeVideoFile = videoFileName; client.miniMeVideoUploadedAt = new Date().toISOString(); }
    await saveClient(client);
    const setVideoLink = `${BASE_URL}/api/admin/set-video?adminKey=${ADMIN_KEY}&clientId=${client.id}&videoType=${isPromo?'promo':'miniMe'}&videoUrl=PASTE_URL_HERE`;
    await sendEmail({ to: ADMIN_EMAIL, subject: `🎬 Video Uploaded: ${client.data.businessName} — ${isPromo?'Promo':'Mini-Me'}`, html: `<div style="font-family:sans-serif;max-width:600px;"><h2 style="color:#0066FF;">${isPromo?'🎬 Promo Video':'🤖 Mini-Me Clip'} Received</h2><table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"><tr style="background:#f9fafb;"><td style="padding:9px 14px;font-weight:700;">Business</td><td style="padding:9px 14px;">${client.data.businessName}</td></tr><tr><td style="padding:9px 14px;font-weight:700;">Owner</td><td style="padding:9px 14px;">${client.data.ownerName}</td></tr><tr style="background:#f9fafb;"><td style="padding:9px 14px;font-weight:700;">Email</td><td style="padding:9px 14px;">${client.data.email}</td></tr><tr><td style="padding:9px 14px;font-weight:700;">Phone</td><td style="padding:9px 14px;">${client.data.phone}</td></tr><tr style="background:#f9fafb;"><td style="padding:9px 14px;font-weight:700;">File</td><td style="padding:9px 14px;">${videoFileName}</td></tr><tr><td style="padding:9px 14px;font-weight:700;">Mini-Me Consent</td><td style="padding:9px 14px;">${client.miniMeConsent?'✅ '+client.miniMeConsentAt:'⏳ Pending'}</td></tr></table><div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;"><p style="font-weight:700;color:#0066FF;margin:0 0 10px;">📋 After producing the video:</p><p style="margin:0 0 10px;font-size:14px;color:#374151;">1. Host the finished video (YouTube, Vimeo, or direct URL)<br>2. Copy the URL<br>3. Replace PASTE_URL_HERE in the link below and open it in your browser to publish it to their site:</p><p style="font-family:monospace;font-size:12px;word-break:break-all;background:#fff;padding:12px;border-radius:6px;border:1px solid #e5e7eb;color:#374151;">${setVideoLink}</p></div></div>` });
    res.json({ success: true, message: "Video uploaded! We'll have your video ready within 48 hours." });
  } catch(err) { console.error('[video-upload]', err); res.status(500).json({ error: 'Upload failed' }); }
});

app.post('/api/admin/set-video', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { clientId, videoUrl, videoType } = req.body;
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (videoType === 'miniMe') {
    client.data.miniMeVideoUrl = videoUrl;
    client.miniMeVideoFile = client.miniMeVideoFile || null;
  } else {
    client.data.promoVideoUrl = videoUrl;
  }
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
  if (client.cfProjectName) {
    (async () => { try { await deployToCloudflarePages(client.cfProjectName, generateSiteHTML(client.data, false)); } catch(e) { console.error('[set-video redeploy]', e.message); } })();
  }
  // Notify client their video is live
  if (client.data.email) {
    sendEmail({
      to: client.data.email,
      subject: `🎬 Your video is live on your website — ${client.data.businessName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="color:#00D68F;margin:0;font-size:26px;">🎬 Your Video is Live!</h1>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;">
          <p>Hi ${client.data.ownerName||'there'},</p>
          <p>Your ${videoType==='miniMe'?'Mini-Me AI Avatar':'promotional video'} is now live on your website.</p>
          ${client.liveUrl?`<div style="text-align:center;margin:24px 0;"><a href="${client.liveUrl}" style="display:inline-block;background:#0066FF;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;">View My Website →</a></div>`:''}
          <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(228) 604-3200</strong></p>
          <p>— The TurnkeyAI Services Team</p>
        </div>
      </div>`
    }).catch(e => console.error('[set-video client notification]', e.message));
  }
  res.json({ success: true });
});

app.post('/api/missed-call', async (req, res) => {
  try {
    const { clientId, callerPhone } = req.body;
    const client = clients[clientId];
    if (!client) return res.status(404).json({ error: 'Not found' });
    if (client.data.addon_missed_call !== 'yes') return res.json({ skipped: true });
    const msg = `Hi! This is ${client.data.ownerName||'the team'} from ${client.data.businessName}. Sorry I missed your call — I'll get back to you shortly. Questions? Call ${client.data.phone}.`;
    await sendSMS(callerPhone, msg);
    res.json({ success: true });
  } catch(err) { console.error('[missed-call]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/after-hours', async (req, res) => {
  try {
    const { clientId, callerPhone } = req.body;
    const client = clients[clientId];
    if (!client) return res.status(404).json({ error: 'Not found' });
    if (client.data.addon_after_hours !== 'yes') return res.json({ skipped: true });
    const msg = `Thanks for calling ${client.data.businessName}! We're currently closed but will contact you when we reopen. For urgent matters, reply to this text.`;
    await sendSMS(callerPhone, msg);
    res.json({ success: true });
  } catch(err) { console.error('[after-hours]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/client-auth', (req, res) => {
  const { token, password } = req.body;
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  res.json({ success: true, businessName: client.data.businessName, ownerName: client.data.ownerName, status: client.status, liveUrl: client.liveUrl, miniMeConsent: client.miniMeConsent, miniMeSubscribed: client.miniMeSubscribed, miniMeVideoUrl: client.data.miniMeVideoUrl||null, freeVideoRequested: client.freeVideoRequested||false, data: { hours: extractHours(client.data), services: extractServices(client.data), phone: client.data.phone, email: client.data.email, address: client.data.address, city: client.data.city, state: client.data.state, miniMe: client.data.wants_mini_me, wantsAfterHours: client.data.addon_after_hours, wantsMissedCall: client.data.addon_missed_call }, previewToken: client.previewToken });
});

app.post('/api/client-update', async (req, res) => {
  const { token, password, updateType, updateData } = req.body;
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  if (updateType === 'hours') {
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(d => {
      if (updateData['day_'+d] !== undefined) client.data['day_'+d] = updateData['day_'+d];
      if (updateData['hours_'+d] !== undefined) client.data['hours_'+d] = updateData['hours_'+d];
    });
    client.updatedAt = new Date().toISOString();
    await saveClient(client);
    if (client.cfProjectName) { (async()=>{ try{ await deployToCloudflarePages(client.cfProjectName, generateSiteHTML(client.data,false)); }catch(e){console.error('[hours re-deploy]',e.message);} })(); }
    sendEmail({ to: ADMIN_EMAIL, subject: `🕒 Hours Updated: ${client.data.businessName}`, html: `<p>${client.data.businessName} updated hours.</p>` }).catch(()=>{});
    return res.json({ success: true, message: 'Hours updated! Live site refreshing — changes appear within 30 seconds.' });
  }
  if (updateType === 'request_minime') {
    client.data.wants_mini_me = 'yes';
    await saveClient(client);
    await sendMiniMeEmail(client).catch(e=>console.error('[dashboard miniMe]',e.message));
    return res.json({ success: true, message: 'Mini-Me request received! Check your email for next steps.' });
  }
  if (updateType === 'request_free_video') {
    client.freeVideoRequested = true;
    await saveClient(client);
    await sendFreeVideoEmail(client).catch(e=>console.error('[dashboard video]',e.message));
    return res.json({ success: true, message: 'Free video request received! Check your email for next steps.' });
  }
  if (updateType === 'change_request') {
    sendEmail({ to: ADMIN_EMAIL, subject: `📋 Change Request: ${client.data.businessName}`, html: `<h3>Change Request</h3><p><strong>Type:</strong> ${updateData.requestType||'General'}</p><p><strong>Details:</strong> ${updateData.details||''}</p>` }).catch(()=>{});
    sendEmail({ to: client.data.email, subject: `We received your change request — ${client.data.businessName}`, html: `<p>Hi ${client.data.ownerName||'there'},</p><p>Received! We'll handle it within 24-48 hours.</p><p>— TurnkeyAI Services</p>` }).catch(()=>{});
    return res.json({ success: true, message: "Change request submitted. We'll handle it within 24-48 hours." });
  }
  res.status(400).json({ error: 'Unknown update type' });
});

app.get('/api/admin/clients', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  res.json(Object.values(clients).map(c => ({
    id: c.id, businessName: c.data.businessName, ownerName: c.data.ownerName, email: c.data.email, phone: c.data.phone, industry: c.data.industry, city: c.data.city, status: c.status, liveUrl: c.liveUrl, createdAt: c.createdAt, previewToken: c.previewToken, dashPassword: c.dashPassword, approvedAt: c.approvedAt,
    wantsMiniMe: c.data.wants_mini_me, miniMeConsent: c.miniMeConsent, miniMeConsentAt: c.miniMeConsentAt, miniMeSubscribed: c.miniMeSubscribed, miniMeVideoFile: c.miniMeVideoFile||null, promoVideoFile: c.promoVideoFile||null, wantsFreeVideo: c.freeVideoRequested, wantsAfterHours: c.data.addon_after_hours, wantsMissedCall: c.data.addon_missed_call
  })));
});

app.post('/api/preview-change-request', async (req, res) => {
  try {
    const { type, clientId, token, changes } = req.body;
    const client = clients[clientId];
    if (!client || client.previewToken !== token) return res.status(403).json({ error: 'Invalid' });
    const label = type === 'minor' ? '✏️ Minor Changes' : '📧 Major Changes';
    await sendEmail({ to: ADMIN_EMAIL, subject: `${label}: ${client.data.businessName}`, html: `<h2 style="color:#0066FF;">${label}</h2><p><strong>Business:</strong> ${client.data.businessName}</p><p><strong>Owner:</strong> ${client.data.ownerName} — ${client.data.email}</p><pre style="background:#f9fafb;padding:16px;border-radius:8px;font-size:13px;">${JSON.stringify(changes, null, 2)}</pre><p><a href="${BASE_URL}/preview/${token}" style="color:#0066FF;">View Preview →</a></p>` });
    if (client.data.email) await sendEmail({ to: client.data.email, subject: `We got your change request — ${client.data.businessName}`, html: `<p>Hi ${client.data.ownerName || 'there'},</p><p>We received your change request and will have it updated within 24–48 hours.</p><p>Questions? Call <strong>(228) 604-3200</strong></p><p>— TurnkeyAI Services</p>` });
    res.json({ success: true });
  } catch(err) { console.error('[preview-change-request]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/territory-partner', async (req, res) => { try { const d=req.body; await sendEmail({to:ADMIN_EMAIL,subject:`New Territory Partner: ${d.name||'Unknown'}`,html:`<h2>Territory Partner Application</h2><pre>${JSON.stringify(d,null,2)}</pre>`}); if(d.email)await sendEmail({to:d.email,subject:'Your TurnkeyAI Territory Partner Application',html:`<h2>Thanks, ${d.name}!</h2><p>We'll review within 24 hours.</p><p>— TurnkeyAI Services Team</p>`}); res.json({success:true}); } catch(err){console.error('[/api/territory-partner]',err);res.status(500).json({error:'Failed'});} });
app.post('/api/family-intake', async (req, res) => { try { const d=req.body; await sendEmail({to:ADMIN_EMAIL,subject:`New Family Site: ${d.familyName||'Unknown'}`,html:`<h2>Family Intake</h2><pre>${JSON.stringify(d,null,2)}</pre>`}); if(d.email)await sendEmail({to:d.email,subject:'Your TurnkeyAI Family Site Request',html:`<h2>Thanks!</h2><p>Preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>`}); res.json({success:true}); } catch(err){console.error('[/api/family-intake]',err);res.status(500).json({error:'Failed'});} });
app.post('/api/crafter-intake', async (req, res) => { try { const d=req.body; await sendEmail({to:ADMIN_EMAIL,subject:`New Crafter Store: ${d.shopName||d.name||'Unknown'}`,html:`<h2>Crafter Intake</h2><pre>${JSON.stringify(d,null,2)}</pre>`}); if(d.email)await sendEmail({to:d.email,subject:'Your TurnkeyAI Crafter Store Request',html:`<h2>Thanks!</h2><p>Preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>`}); res.json({success:true}); } catch(err){console.error('[/api/crafter-intake]',err);res.status(500).json({error:'Failed'});} });

app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt||'You are a helpful assistant for TurnkeyAI Services.' }, { role: 'user', content: message }] })
    });
    const data = await response.json();
    res.json({ reply: data.result?.response || 'Sorry, I could not process that.' });
  } catch(err) { console.error('[/api/chat]', err); res.status(500).json({ reply: 'Chat temporarily unavailable.' }); }
});

// Legacy endpoint — kept for backward compatibility with old video-upload.html
app.post('/api/video-upload-notify', async (req, res) => {
  try {
    const d = req.body;
    const typeLabel = d.videoType === 'mini_me' ? 'Mini-Me AI Avatar Clip' : d.videoType === 'both' ? 'Promo Video + Mini-Me Clip' : 'Free 60-Second Promo Video';
    await sendEmail({ to: ADMIN_EMAIL, subject: `🎬 Video Clip Uploaded: ${d.businessName || 'Unknown'}`, html: `<h2 style="color:#0066FF;">New Client Video Clip Submitted</h2><table style="border-collapse:collapse;width:100%;max-width:500px;"><tr><td style="padding:8px;font-weight:700;">Client</td><td style="padding:8px;">${d.uploaderName||''}</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Business</td><td style="padding:8px;">${d.businessName||''}</td></tr><tr><td style="padding:8px;font-weight:700;">Email</td><td style="padding:8px;">${d.email||''}</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Video Type</td><td style="padding:8px;">${typeLabel}</td></tr><tr><td style="padding:8px;font-weight:700;">File</td><td style="padding:8px;">${d.fileName||''} (${d.fileSize||''})</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Consent</td><td style="padding:8px;">${d.consentGiven?'✅ Yes — '+(d.consentTimestamp||''):'❌ No'}</td></tr>${d.notes?`<tr><td style="padding:8px;font-weight:700;">Notes</td><td style="padding:8px;">${d.notes}</td></tr>`:''}</table>` });
    if (d.email) await sendEmail({ to: d.email, subject: `✅ Video Received — ${d.businessName||'Your Business'}`, html: `<h2 style="color:#0066FF;">We Got Your Video Clip!</h2><p>Hi ${d.uploaderName||'there'},</p><p>Production begins within 48 hours.</p><p>Questions? Call (228) 604-3200</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch(err) { console.error('[/api/video-upload-notify]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/intake', async (req, res) => {
  try {
    const data = req.body;
    const id = data.id || ('client_' + Date.now());
    const previewToken = makeToken();
    const newClient = {
      id, status: 'pending', data, previewToken,
      dashToken: null, dashPassword: null, liveUrl: null, cfProjectName: null,
      miniMeConsent: null, miniMeConsentAt: null, miniMeVideoUrl: null,
      miniMeSubscribed: false,
      freeVideoRequested: data.wants_free_video === 'yes' || data.wantsFreeVideo === 'yes',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    clients[id] = newClient;
    await saveClient(newClient);
    const previewUrl = `${BASE_URL}/preview/${previewToken}`;
    const approveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;
    const d = data;
    const row = (label, val) => val ? `<tr><td style="padding:9px 14px;font-weight:600;color:#374151;background:#f9fafb;width:170px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${val}</td></tr>` : '';
    const table = (rows) => `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">${rows}</table>`;
    const h2 = (txt) => `<h2 style="color:#0066FF;font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${txt}</h2>`;
    const addons = [];
    if (d.wants_mini_me === 'yes' || d.wantsMiniMe === 'yes') addons.push('🤖 Mini-Me AI Avatar ($59/mo)');
    if ((d.wants_free_video === 'yes' || d.wantsFreeVideo === 'yes') && d.wants_mini_me !== 'yes') addons.push('🎬 Free 60-Second Promo Video');
    if (d.addon_after_hours === 'yes' || d.wantsAfterHours === 'yes') addons.push('📞 After Hours Answering');
    if (d.addon_missed_call === 'yes' || d.wantsMissedCall === 'yes') addons.push('📱 Missed Call Text Return');
    await sendEmail({ to: ADMIN_EMAIL, subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||d.location||''} — ${(d.industry||'').replace(/_/g,' ')}`, html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">${h2('Business Information')}${table(`${row('Business Name', d.businessName)}${row('Owner', d.ownerName)}${row('Industry', (d.industry||'').replace(/_/g,' '))}${row('Phone', d.phone)}${row('Email', d.email)}${row('City', d.city||d.location)}${row('State', d.state)}${row('Color Preference', d.colorPreference)}`)}${addons.length?`<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#065f46;margin:0 0 10px;">🎯 Add-Ons</p><ul style="margin:0;padding-left:20px;line-height:2;">${addons.map(a=>'<li>'+a+'</li>').join('')}</ul></div>`:''}<details style="margin-bottom:22px;"><summary style="cursor:pointer;font-weight:600;color:#0066FF;padding:10px;background:#f9fafb;border-radius:8px;">📋 All Data</summary><pre style="font-size:12px;background:#f9fafb;padding:14px;border-radius:8px;overflow:auto;">${JSON.stringify(d,null,2)}</pre></details><div style="display:flex;gap:12px;flex-wrap:wrap;"><a href="${approveUrl}" style="background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">✅ Approve & Go Live</a><a href="${previewUrl}" style="background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;">👁️ Preview Site</a></div></div></div>` });
    if (d.email) {
      await sendEmail({ to: d.email, subject: `🎉 Your website preview is ready — ${d.businessName||'Your Business'}`, html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${d.ownerName||'there'} — your website preview is ready.</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;"><div style="text-align:center;margin:0 0 28px;"><a href="${previewUrl}" style="display:inline-block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;">👁️ View My Website Preview</a></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 6px;font-size:15px;">Review your preview — the approve button is inside the preview page.</p></div><p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(228) 604-3200</strong> or email <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p></div></div>` });
      if (d.wants_mini_me === 'yes' || d.wantsMiniMe === 'yes') sendMiniMeEmail(clients[id]).catch(e => console.error('[intake miniMe]', e.message));
      else if (d.wants_free_video === 'yes' || d.wantsFreeVideo === 'yes') sendFreeVideoEmail(clients[id]).catch(e => console.error('[intake video]', e.message));
    }
    res.json({ success: true });
  } catch(err) { console.error('[/api/intake]', err); res.status(500).json({ error: 'Failed' }); }
});

function extractHours(data) {
  const r={};
  ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(d=>{ r[d]={open:!!data['day_'+d],hours:data['hours_'+d]||''}; });
  return r;
}
function extractServices(data) {
  const s=[];
  Object.keys(data).forEach(k=>{ if(k.startsWith('service_')&&data[k]==='on'){const n=k.replace('service_','');s.push({key:n,label:n.replace(/_/g,' '),price:data['price_'+n]||''});} });
  return s;
}

app.get('/admin', (req, res) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.redirect('/admin-login.html');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else if (req.path === '/' || req.path === '') {
    res.sendFile(path.join(__dirname, 'public', 'business.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Startup ──
initDB()
  .then(() => loadClientsFromDB())
  .then(() => {
    app.listen(PORT, () => console.log(`TurnkeyAI backend running on port ${PORT}`));
  })
  .catch(err => {
    console.error('[FATAL] DB init failed:', err.message);
    process.exit(1);
  });
