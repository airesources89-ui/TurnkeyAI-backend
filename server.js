const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const app = express();

app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = 'turnkeyaiservices@gmail.com';
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || 'turnkey2024';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const DATA_FILE = path.join(__dirname, 'clients.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadClients() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { console.error('[loadClients]', e.message); }
  return {};
}
function saveClients() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(clients, null, 2), 'utf8'); }
  catch (e) { console.error('[saveClients]', e.message); }
}
const clients = loadClients();
console.log(`[startup] Loaded ${Object.keys(clients).length} clients from disk.`);

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
  saveClients();
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

function generateSiteHTML(data, isPreview) {
  const biz = data.businessName || 'Your Business';
  const owner = data.ownerName || '';
  const phone = data.phone || '';
  const email = data.email || '';
  const city = data.city || data.targetCity || '';
  const state = data.state || '';
  const address = [data.address, city, state, data.zip].filter(Boolean).join(', ');
  const about = data.aboutUs || '';
  const tagline = data.missionStatement || `Quality service you can count on.`;
  const industry = (data.industry || '').replace(/_/g, ' ');
  const chatName = data.chatName || 'Chat With Us';
  const chatPersonality = data.chatPersonality || 'friendly';
  const advantage = data.competitiveAdvantage || '';
  const awards = data.awards || '';
  const ownerPhoto = data.ownerPhoto || '';
  const workPhoto1 = data.workPhoto1 || '';
  const workPhoto2 = data.workPhoto2 || '';
  const miniMeVideo = data.miniMeVideoUrl || '';
  const chatEndpoint = `${BASE_URL}/api/chat`;

  const palettes = {
    cleaning: { primary: '#2563eb', accent: '#06b6d4', dark: '#0f172a' },
    agriculture: { primary: '#16a34a', accent: '#84cc16', dark: '#14532d' },
    restaurant: { primary: '#dc2626', accent: '#f97316', dark: '#1c1917' },
    plumbing: { primary: '#1d4ed8', accent: '#0ea5e9', dark: '#0f172a' },
    landscaping: { primary: '#15803d', accent: '#65a30d', dark: '#14532d' },
    fencing: { primary: '#b45309', accent: '#d97706', dark: '#1c1917' },
    roofing: { primary: '#b91c1c', accent: '#f59e0b', dark: '#1c1917' },
    hvac: { primary: '#0369a1', accent: '#0891b2', dark: '#0c4a6e' },
    salon: { primary: '#7c3aed', accent: '#ec4899', dark: '#1e1b4b' },
    auto_repair: { primary: '#1e40af', accent: '#f59e0b', dark: '#1e1b4b' },
  };
  const pal = palettes[data.industry] || { primary: '#0066FF', accent: '#00D68F', dark: '#1a1a2e' };

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
  const hoursData = days.map((d, i) => data['day_' + d] ? { label: dayLabels[i], hours: data['hours_' + d] || 'Open' } : null).filter(Boolean);

  const payKeys = ['cash','card','check','venmo','cashapp','zelle'];
  const payLabels = { cash:'Cash', card:'Credit/Debit Card', check:'Check', venmo:'Venmo', cashapp:'CashApp', zelle:'Zelle' };
  const payMethods = payKeys.filter(k => data['pay_' + k]).map(k => payLabels[k]).join(' · ');

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
    : `<div style="background:${pal.dark};color:rgba(255,255,255,.7);text-align:center;padding:10px 24px;font-size:13px;">⚡ Powered by <a href="https://turnkeyaiservices.com" style="color:${pal.accent};font-weight:700;text-decoration:none;">TurnkeyAI Services</a> — AI-Powered Websites for Local Business</div>`;

  const navPhone = phone ? `<a href="tel:${phone.replace(/\D/g,'')}" style="background:${pal.accent};color:${pal.dark};padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:6px;">📞 ${phone}</a>` : '';

  const servicesGrid = serviceItems.length ? serviceItems.map(s => `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px;box-shadow:0 2px 8px rgba(0,0,0,.05);">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:10px;height:10px;background:${pal.accent};border-radius:50%;flex-shrink:0;"></div>
        <span style="font-size:16px;color:#1f2937;font-weight:500;">${s.name}</span>
      </div>
      ${s.price ? `<span style="font-weight:700;color:${pal.primary};font-size:16px;white-space:nowrap;">${s.price}</span>` : ''}
    </div>`).join('') : '';

  const hoursGrid = hoursData.length ? hoursData.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.1);">
      <span style="color:rgba(255,255,255,.8);font-size:15px;">${h.label}</span>
      <span style="color:white;font-weight:600;font-size:15px;">${h.hours}</span>
    </div>`).join('') : '';

  const miniMeSection = miniMeVideo ? `
    <section style="padding:80px 24px;background:${pal.dark};text-align:center;">
      <div style="max-width:680px;margin:0 auto;">
        <div style="display:inline-block;background:${pal.accent};color:${pal.dark};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:20px;">A Message From ${owner || 'Our Team'}</div>
        <h2 style="font-family:Georgia,serif;font-size:36px;color:white;margin:0 0 24px;">Meet ${owner || 'Us'} Personally</h2>
        <video src="${miniMeVideo}" controls style="width:100%;border-radius:16px;max-height:380px;box-shadow:0 20px 60px rgba(0,0,0,.5);"></video>
      </div>
    </section>` : '';

  const photosSection = (ownerPhoto || workPhoto1 || workPhoto2) ? `
    <section style="padding:80px 24px;background:#f8fafc;">
      <div style="max-width:1000px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:48px;">
          <div style="display:inline-block;background:${pal.primary}18;color:${pal.primary};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;">Our Work</div>
          <h2 style="font-family:Georgia,serif;font-size:36px;color:${pal.dark};margin:0;">See What We Do</h2>
        </div>
        <div style="display:grid;grid-template-columns:${(ownerPhoto && (workPhoto1 || workPhoto2)) ? '1fr 1fr' : '1fr'};gap:24px;">
          ${ownerPhoto ? `<div style="border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.1);"><img src="${ownerPhoto}" alt="${owner}" style="width:100%;height:320px;object-fit:cover;display:block;"></div>` : ''}
          ${(workPhoto1 || workPhoto2) ? `<div style="display:grid;grid-template-rows:${workPhoto1 && workPhoto2 ? '1fr 1fr' : '1fr'};gap:16px;">${workPhoto1 ? `<div style="border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.1);"><img src="${workPhoto1}" alt="Our work" style="width:100%;height:${workPhoto2?'152px':'320px'};object-fit:cover;display:block;"></div>` : ''}${workPhoto2 ? `<div style="border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.1);"><img src="${workPhoto2}" alt="Our work" style="width:100%;height:152px;object-fit:cover;display:block;"></div>` : ''}</div>` : ''}
        </div>
      </div>
    </section>` : '';

  const chatSystem = `${owner ? `You work for ${biz}, a ${industry} business in ${city}.` : `You represent ${biz}.`} Be ${chatPersonality}. Answer questions about services, pricing, hours, and location. Phone: ${phone}. Email: ${email}. ${advantage ? 'What sets us apart: ' + advantage : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${biz}${isPreview ? ' | PREVIEW' : ''} | ${city}</title>
  <meta name="description" content="${tagline} Serving ${city}${state ? ', ' + state : ''} and surrounding areas.${phone ? ' Call ' + phone : ''}">
  <meta property="og:title" content="${biz}">
  <meta property="og:description" content="${tagline}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #1f2937; background: white; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    img { max-width: 100%; }
    a { color: inherit; }
    @media (max-width: 640px) {
      .hero-ctas { flex-direction: column !important; align-items: stretch !important; }
      .hero-ctas a { text-align: center !important; }
      .about-grid { grid-template-columns: 1fr !important; }
      .services-grid-inner { grid-template-columns: 1fr !important; }
      .hours-contact-grid { grid-template-columns: 1fr !important; }
      .nav-phone { display: none !important; }
    }
    #chatWidget { position: fixed; bottom: 24px; right: 24px; z-index: 9999; }
    #chatToggleBtn { background: linear-gradient(135deg, ${pal.primary}, ${pal.dark}); color: white; border: none; border-radius: 50px; padding: 14px 22px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 24px ${pal.primary}55; font-family: inherit; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
    #chatBox { display: none; flex-direction: column; background: white; border-radius: 20px; box-shadow: 0 12px 48px rgba(0,0,0,.2); width: 340px; max-height: 480px; overflow: hidden; border: 1px solid #e5e7eb; }
    #chatHeader { background: linear-gradient(135deg, ${pal.primary}, ${pal.dark}); color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
    #chatMessages { flex: 1; overflow-y: auto; padding: 16px; min-height: 220px; background: #f9fafb; }
    #chatInputRow { padding: 12px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; background: white; }
    #chatInput { flex: 1; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 14px; font-family: inherit; outline: none; transition: border-color .2s; }
    #chatInput:focus { border-color: ${pal.primary}; }
    #chatSendBtn { background: ${pal.primary}; color: white; border: none; border-radius: 10px; padding: 10px 18px; cursor: pointer; font-weight: 700; font-size: 14px; font-family: inherit; }
  </style>
</head>
<body>

${previewBanner}

<nav style="background:white;border-bottom:1px solid #e5e7eb;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.06);">
  <div style="font-size:20px;font-weight:700;color:${pal.dark};">${biz}</div>
  <div style="display:flex;align-items:center;gap:16px;">
    <a href="#services" style="color:#6b7280;text-decoration:none;font-size:14px;font-weight:500;">Services</a>
    <a href="#about" style="color:#6b7280;text-decoration:none;font-size:14px;font-weight:500;">About</a>
    <a href="#contact" style="color:#6b7280;text-decoration:none;font-size:14px;font-weight:500;">Contact</a>
    ${navPhone}
  </div>
</nav>

<section style="background:linear-gradient(135deg, ${pal.dark} 0%, ${pal.primary}cc 60%, ${pal.accent}44 100%);padding:100px 24px 90px;text-align:center;position:relative;overflow:hidden;">
  <div style="position:relative;max-width:720px;margin:0 auto;">
    <div style="display:inline-block;background:${pal.accent}22;border:1px solid ${pal.accent}55;color:${pal.accent};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:24px;">${industry || 'Local Business'} · ${city}${state ? ', ' + state : ''}</div>
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:clamp(36px,6vw,64px);font-weight:700;color:white;margin:0 0 20px;line-height:1.15;">${biz}</h1>
    <p style="font-size:clamp(16px,2.5vw,20px);color:rgba(255,255,255,.85);max-width:560px;margin:0 auto 40px;line-height:1.7;">${tagline}</p>
    <div class="hero-ctas" style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
      ${phone ? `<a href="tel:${phone.replace(/\D/g,'')}" style="background:${pal.accent};color:${pal.dark};padding:18px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:17px;display:inline-block;box-shadow:0 6px 24px ${pal.accent}55;">📞 Call Now — ${phone}</a>` : ''}
      <a href="#contact" style="background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);color:white;padding:18px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:17px;display:inline-block;backdrop-filter:blur(10px);">Get a Free Quote →</a>
    </div>
    ${awards ? `<p style="margin-top:32px;color:rgba(255,255,255,.6);font-size:14px;">🏆 ${awards}</p>` : ''}
  </div>
</section>

${miniMeSection}

${serviceItems.length ? `
<section id="services" style="padding:80px 24px;background:white;">
  <div style="max-width:1000px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:52px;">
      <div style="display:inline-block;background:${pal.primary}12;color:${pal.primary};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;">What We Offer</div>
      <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:clamp(28px,4vw,42px);color:${pal.dark};margin:0 0 12px;">Our Services</h2>
      <p style="color:#6b7280;font-size:16px;max-width:480px;margin:0 auto;">Proudly serving ${city}${state ? ', ' + state : ''} and surrounding areas</p>
    </div>
    <div class="services-grid-inner" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      ${servicesGrid}
    </div>
    ${payMethods ? `<div style="text-align:center;margin-top:32px;padding:20px;background:#f8fafc;border-radius:12px;"><p style="color:#6b7280;font-size:15px;">💳 We accept: <strong style="color:${pal.dark};">${payMethods}</strong></p></div>` : ''}
  </div>
</section>` : ''}

${(about || ownerPhoto || advantage) ? `
<section id="about" style="padding:80px 24px;background:#f8fafc;">
  <div style="max-width:1000px;margin:0 auto;">
    <div class="about-grid" style="display:grid;grid-template-columns:${ownerPhoto ? '1fr 1fr' : '1fr'};gap:56px;align-items:center;">
      <div>
        <div style="display:inline-block;background:${pal.primary}12;color:${pal.primary};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:20px;">Our Story</div>
        <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:clamp(28px,4vw,40px);color:${pal.dark};margin:0 0 20px;">About ${biz}</h2>
        ${about ? `<p style="font-size:16px;color:#374151;line-height:1.85;margin-bottom:20px;">${about}</p>` : ''}
        ${advantage ? `<div style="display:flex;align-items:flex-start;gap:12px;padding:16px 20px;background:white;border-radius:12px;border-left:4px solid ${pal.accent};margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,.05);"><span style="font-size:20px;">💪</span><p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">${advantage}</p></div>` : ''}
        ${data.ownerBackground ? `<p style="font-size:15px;color:#6b7280;line-height:1.7;">${data.ownerBackground}</p>` : ''}
      </div>
      ${ownerPhoto ? `<div><img src="${ownerPhoto}" alt="${owner}" style="width:100%;border-radius:20px;object-fit:cover;max-height:420px;box-shadow:0 20px 60px rgba(0,0,0,.15);"></div>` : ''}
    </div>
  </div>
</section>` : ''}

${photosSection}

${(hoursData.length || phone || email || address) ? `
<section style="padding:80px 24px;background:${pal.dark};" id="contact">
  <div style="max-width:1000px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:52px;">
      <div style="display:inline-block;background:rgba(255,255,255,.1);color:${pal.accent};padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;">Get In Touch</div>
      <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:clamp(28px,4vw,42px);color:white;margin:0 0 12px;">Contact Us</h2>
      <p style="color:rgba(255,255,255,.6);font-size:16px;">We'd love to hear from you — reach out any time</p>
    </div>
    <div class="hours-contact-grid" style="display:grid;grid-template-columns:${hoursData.length ? '1fr 1fr' : '1fr'};gap:40px;">
      ${hoursData.length ? `<div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:32px;"><h3 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:white;margin:0 0 24px;">Business Hours</h3>${hoursGrid}</div>` : ''}
      <div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:32px;">
        <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:white;margin:0 0 24px;">Contact Information</h3>
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${phone ? `<a href="tel:${phone.replace(/\D/g,'')}" style="display:flex;align-items:center;gap:14px;color:white;text-decoration:none;padding:16px;background:rgba(255,255,255,.07);border-radius:12px;"><span style="font-size:24px;background:${pal.accent}22;width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;">📞</span><div><div style="font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Phone / Text</div><div style="font-size:17px;font-weight:600;">${phone}</div></div></a>` : ''}
          ${email ? `<a href="mailto:${email}" style="display:flex;align-items:center;gap:14px;color:white;text-decoration:none;padding:16px;background:rgba(255,255,255,.07);border-radius:12px;"><span style="font-size:24px;background:${pal.accent}22;width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;">✉️</span><div><div style="font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Email</div><div style="font-size:15px;font-weight:500;word-break:break-all;">${email}</div></div></a>` : ''}
          ${address.length > 5 ? `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px;background:rgba(255,255,255,.07);border-radius:12px;"><span style="font-size:24px;background:${pal.accent}22;width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📍</span><div><div style="font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Location</div><div style="font-size:15px;font-weight:500;color:rgba(255,255,255,.9);">${address}</div></div></div>` : ''}
        </div>
      </div>
    </div>
    ${phone ? `<div style="text-align:center;margin-top:40px;"><a href="tel:${phone.replace(/\D/g,'')}" style="display:inline-block;background:${pal.accent};color:${pal.dark};padding:20px 48px;border-radius:14px;text-decoration:none;font-weight:700;font-size:19px;box-shadow:0 8px 32px ${pal.accent}44;">📞 Call Now — ${phone}</a></div>` : ''}
  </div>
</section>` : ''}

<footer style="background:#0a0a14;color:rgba(255,255,255,.5);padding:28px 24px;text-align:center;font-size:13px;">
  <p style="margin-bottom:8px;color:rgba(255,255,255,.7);font-weight:500;">${biz} · ${city}${state ? ', ' + state : ''}</p>
  <p>Built by <a href="https://turnkeyaiservices.com" target="_blank" rel="noopener" style="color:${pal.accent};text-decoration:none;font-weight:600;">TurnkeyAI Services</a>${phone ? ` · <a href="tel:${phone.replace(/\D/g,'')}" style="color:rgba(255,255,255,.5);text-decoration:none;">${phone}</a>` : ''}</p>
</footer>

<div id="chatWidget">
  <button id="chatToggleBtn" onclick="openChat()">💬 ${chatName}</button>
  <div id="chatBox">
    <div id="chatHeader">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:10px;height:10px;background:#00D68F;border-radius:50%;animation:pulse 2s infinite;"></div>
        <span style="font-weight:700;font-size:15px;">💬 ${chatName}</span>
      </div>
      <span onclick="closeChat()" style="cursor:pointer;font-size:20px;opacity:.7;line-height:1;">✕</span>
    </div>
    <div id="chatMessages"></div>
    <div id="chatInputRow">
      <input id="chatInput" type="text" placeholder="Ask a question..." onkeydown="if(event.key==='Enter')sendMsg()">
      <button id="chatSendBtn" onclick="sendMsg()">Send</button>
    </div>
  </div>
</div>

<style>
@keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
@media(max-width:400px){#chatBox{width:calc(100vw - 32px);}}
</style>

<script>
(function(){
  var EP='${chatEndpoint}';
  var SYS='${chatSystem.replace(/'/g,"\\'")}';
  var msgs=[{r:'a',t:'Hi! How can I help you today with ${biz.replace(/'/g,"\\'")}?'}];
  var open=false;
  function render(){
    var c=document.getElementById('chatMessages');
    if(!c)return;
    c.innerHTML=msgs.map(function(m){
      return m.r==='u'
        ?'<div style="text-align:right;margin-bottom:10px;"><span style="background:${pal.primary};color:white;padding:8px 14px;border-radius:14px 14px 4px 14px;display:inline-block;max-width:85%;font-size:14px;line-height:1.5;">'+m.t+'</span></div>'
        :'<div style="margin-bottom:10px;"><span style="background:white;border:1px solid #e5e7eb;padding:8px 14px;border-radius:14px 14px 14px 4px;display:inline-block;max-width:85%;font-size:14px;line-height:1.5;color:#1f2937;">'+m.t+'</span></div>';
    }).join('');
    c.scrollTop=c.scrollHeight;
  }
  window.openChat=function(){
    open=true;
    document.getElementById('chatToggleBtn').style.display='none';
    var box=document.getElementById('chatBox');
    box.style.display='flex';
    render();
    setTimeout(function(){document.getElementById('chatInput').focus();},100);
  };
  window.closeChat=function(){
    open=false;
    document.getElementById('chatBox').style.display='none';
    document.getElementById('chatToggleBtn').style.display='flex';
  };
  window.sendMsg=async function(){
    var inp=document.getElementById('chatInput');
    var t=(inp.value||'').trim();
    if(!t)return;
    msgs.push({r:'u',t:t});
    inp.value='';
    render();
    msgs.push({r:'a',t:'...'});
    render();
    try{
      var r=await fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,systemPrompt:SYS})});
      var d=await r.json();
      msgs[msgs.length-1]={r:'a',t:d.reply||'Sorry, I could not process that.'};
    }catch(e){
      msgs[msgs.length-1]={r:'a',t:'Chat is temporarily unavailable. Please call ${phone.replace(/'/g,"\\'")||"us"} directly.'};
    }
    render();
  };
  render();
})();
</script>

</body>
</html>`;
}

app.get('/health', (req, res) => res.json({ status: 'TurnkeyAI Backend Running', clients: Object.keys(clients).length, time: new Date().toISOString() }));

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
    saveClients();

    if ((data.paymentMethod || '').toLowerCase() === 'partner') {
      console.log(`[partner bypass] Auto-deploying ${data.businessName}...`);
      const partnerPreviewUrl = `${BASE_URL}/preview/${previewToken}`;
      const partnerApproveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;
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
          saveClients();
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
    const clientApproveUrl = `${BASE_URL}/api/client-approve/${id}?token=${previewToken}`;
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

    const addons = [];
    if (d.wants_mini_me === 'yes') addons.push(`🤖 Mini-Me AI Avatar ($59/mo)`);
    if (d.wants_free_video === 'yes' && d.wants_mini_me !== 'yes') addons.push('🎬 Free 60-Second Promo Video');
    if (d.addon_after_hours === 'yes') addons.push('📞 After Hours Answering');
    if (d.addon_missed_call === 'yes') addons.push('📱 Missed Call Text Return');

    const payMethods = ['cash','card','check','venmo','cashapp','zelle'].filter(p => d['pay_'+p]).join(', ');

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||''}, ${d.state||''} — ${(d.industry||'').replace(/_/g,' ')}`,
      html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;color:#1F2937;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1><p style="color:rgba(255,255,255,0.82);margin:6px 0 0;font-size:14px;">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">${h2('Business Information')}${table(`${row('Business Name', d.businessName)}${row('Owner', d.ownerName)}${row('Industry', (d.industry||'').replace(/_/g,' '))}${row('Phone', d.phone)}${row('Email', d.email)}${row('Address', [d.address,d.city,d.state,d.zip].filter(Boolean).join(', '))}${row('Years in Business', d.yearsInBusiness)}`)}${h2('Online Presence')}${table(`${row('Current Website', d.currentWebsite)}${row('Facebook', d.facebook)}${row('Instagram', d.instagram)}${row('Google Business', d.googleBusiness)}${row('Logo', d.hasLogo==='yes'?'✅ Will email':'❌ Needs one')}`)}${servicesList.length ? `${h2('Services & Pricing')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${servicesList.map(s=>'<li>'+s+'</li>').join('')}</ul>` : ''}${hoursLines.length ? `${h2('Business Hours')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${hoursLines.join('')}</ul>` : ''}${h2('About the Business')}${table(`${row('Business Story', d.aboutUs)}${row('Owner Background', d.ownerBackground)}${row('Mission / Tagline', d.missionStatement)}${row('Awards / Certs', d.awards)}`)}${h2('Payment & Other')}${table(`${row('Service Radius', d.targetRadius)}${row('Competitive Advantage', d.competitiveAdvantage)}${row('Payment Methods', payMethods)}${row('Referral Source', d.referralSource)}${row('Additional Notes', d.additionalNotes)}`)}${addons.length ? `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#065f46;margin:0 0 10px;font-size:15px;">🎯 Add-Ons Selected</p><ul style="margin:0;padding-left:20px;line-height:2;font-size:14px;">${addons.map(a=>'<li><strong>'+a+'</strong></li>').join('')}</ul></div>` : ''}<div style="border-top:1px solid #e5e7eb;padding-top:22px;display:flex;gap:12px;flex-wrap:wrap;"><a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✅ Approve & Go Live</a><a href="${previewUrl}" style="display:inline-block;background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">👁️ Preview Site</a></div></div></div>`
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
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#1F2937;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:28px;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:16px;">Hi ${d.ownerName||'there'} — your website preview is ready to review.</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;"><p style="font-size:16px;line-height:1.75;margin:0 0 24px;">We've built a preview of your new <strong>${d.businessName||'business'}</strong> website.</p><div style="text-align:center;margin:0 0 28px;"><a href="${previewUrl}" style="display:inline-block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;box-shadow:0 6px 24px rgba(0,102,255,.35);">👁️ View My Website Preview</a></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 6px;font-size:15px;">Happy with the preview?</p><p style="font-size:14px;color:#374151;margin:0 0 18px;">Click below to approve and go live.</p><a href="${clientApproveUrl}" style="display:inline-block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:18px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:17px;">✅ Approve My Website →</a></div>${clientAddons.length ? `<ul style="margin:0 0 20px;padding-left:20px;line-height:2.2;font-size:14px;">${clientAddons.join('')}</ul>` : ''}<p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email them to <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p><p style="font-size:14px;color:#6B7280;margin:0 0 24px;">Questions? Call <strong>(228) 604-3200</strong> or reply to this email.</p><div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;"><p style="font-size:12px;color:#9CA3AF;margin:0;">TurnkeyAI Services — AI-Powered Websites for Local Business<br>Bay St. Louis, MS 39520</p></div></div></div>`
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
      saveClients();
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
      saveClients();
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
  saveClients();
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
    if (STRIPE_WEBHOOK_SECRET && sig) {
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

app.get('/api/mini-me-consent/:id', (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(404).send('<h2>Not found</h2>');
  client.miniMeConsent = true; client.miniMeConsentAt = new Date().toISOString(); saveClients();
  sendEmail({ to: ADMIN_EMAIL, subject: `✅ Mini-Me Consent: ${client.data.businessName}`, html: `<p>${client.data.businessName} (${client.data.ownerName}) consented to Mini-Me. Timestamp: ${client.miniMeConsentAt}</p>` }).catch(() => {});
  res.send(`<html><body style="font-family:sans-serif;padding:60px;text-align:center;background:#f0fff4;"><h2 style="color:#00D68F;">✅ Consent Recorded!</h2><p>Thank you, ${client.data.ownerName||'there'}. We have your authorization to create your Mini-Me avatar.</p><p>Now upload your video clip using the link in your email!</p></body></html>`);
});

app.get('/api/mini-me-subscribe/:id', (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(404).send('<h2>Not found</h2>');
  client.miniMeSubscribed = true; client.miniMeSubscribedAt = new Date().toISOString(); saveClients();
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
    saveClients();
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
  if (videoType === 'miniMe') client.data.miniMeVideoUrl = videoUrl;
  else client.data.promoVideoUrl = videoUrl;
  client.updatedAt = new Date().toISOString(); saveClients();
  if (client.cfProjectName) {
    (async () => { try { await deployToCloudflarePages(client.cfProjectName, generateSiteHTML(client.data, false)); } catch(e) { console.error('[set-video]', e.message); } })();
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
    client.updatedAt = new Date().toISOString(); saveClients();
    if (client.cfProjectName) { (async()=>{ try{ await deployToCloudflarePages(client.cfProjectName, generateSiteHTML(client.data,false)); }catch(e){console.error('[hours re-deploy]',e.message);} })(); }
    sendEmail({ to: ADMIN_EMAIL, subject: `🕒 Hours Updated: ${client.data.businessName}`, html: `<p>${client.data.businessName} updated hours.</p>` }).catch(()=>{});
    return res.json({ success: true, message: 'Hours updated! Live site refreshing — changes appear within 30 seconds.' });
  }
  if (updateType === 'request_minime') {
    client.data.wants_mini_me = 'yes'; saveClients();
    await sendMiniMeEmail(client).catch(e=>console.error('[dashboard miniMe]',e.message));
    return res.json({ success: true, message: 'Mini-Me request received! Check your email for next steps.' });
  }
  if (updateType === 'request_free_video') {
    client.freeVideoRequested = true; saveClients();
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
    clients[id] = {
      id, status: 'pending', data, previewToken,
      dashToken: null, dashPassword: null, liveUrl: null, cfProjectName: null,
      miniMeConsent: null, miniMeConsentAt: null, miniMeVideoUrl: null,
      miniMeSubscribed: false,
      freeVideoRequested: data.wants_free_video === 'yes' || data.wantsFreeVideo === 'yes',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    saveClients();
    const previewUrl = `${BASE_URL}/preview/${previewToken}`;
    const approveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;
    const clientApproveUrl = `${BASE_URL}/api/client-approve/${id}?token=${previewToken}`;
    const d = data;
    const row = (label, val) => val ? `<tr><td style="padding:9px 14px;font-weight:600;color:#374151;background:#f9fafb;width:170px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${val}</td></tr>` : '';
    const table = (rows) => `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">${rows}</table>`;
    const h2 = (txt) => `<h2 style="color:#0066FF;font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${txt}</h2>`;
    const addons = [];
    if (d.wants_mini_me === 'yes' || d.wantsMiniMe === 'yes') addons.push('🤖 Mini-Me AI Avatar ($59/mo)');
    if ((d.wants_free_video === 'yes' || d.wantsFreeVideo === 'yes') && d.wants_mini_me !== 'yes') addons.push('🎬 Free 60-Second Promo Video');
    if (d.addon_after_hours === 'yes' || d.wantsAfterHours === 'yes') addons.push('📞 After Hours Answering');
    if (d.addon_missed_call === 'yes' || d.wantsMissedCall === 'yes') addons.push('📱 Missed Call Text Return');
    await sendEmail({ to: ADMIN_EMAIL, subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||d.location||''} — ${(d.industry||'').replace(/_/g,' ')}`, html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">${h2('Business Information')}${table(`${row('Business Name', d.businessName)}${row('Owner', d.ownerName)}${row('Industry', (d.industry||'').replace(/_/g,' '))}${row('Phone', d.phone)}${row('Email', d.email)}${row('City', d.city||d.location)}${row('State', d.state)}`)}${addons.length?`<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#065f46;margin:0 0 10px;">🎯 Add-Ons</p><ul style="margin:0;padding-left:20px;line-height:2;">${addons.map(a=>'<li>'+a+'</li>').join('')}</ul></div>`:''}<details style="margin-bottom:22px;"><summary style="cursor:pointer;font-weight:600;color:#0066FF;padding:10px;background:#f9fafb;border-radius:8px;">📋 All Data</summary><pre style="font-size:12px;background:#f9fafb;padding:14px;border-radius:8px;overflow:auto;">${JSON.stringify(d,null,2)}</pre></details><div style="display:flex;gap:12px;flex-wrap:wrap;"><a href="${approveUrl}" style="background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">✅ Approve & Go Live</a><a href="${previewUrl}" style="background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;">👁️ Preview Site</a></div></div></div>` });
    if (d.email) {
      await sendEmail({ to: d.email, subject: `🎉 Your website preview is ready — ${d.businessName||'Your Business'}`, html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${d.ownerName||'there'} — your website preview is ready.</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;"><div style="text-align:center;margin:0 0 28px;"><a href="${previewUrl}" style="display:inline-block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;">👁️ View My Website Preview</a></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 16px;">Happy with it? Go live now:</p><a href="${clientApproveUrl}" style="display:inline-block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:18px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:17px;">✅ Approve & Go Live →</a></div><p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(228) 604-3200</strong> or email <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p></div></div>` });
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

// ── ADMIN DASHBOARD ROUTE ──
app.get('/admin', (req, res) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.redirect('/admin-login.html');
  }
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

app.listen(PORT, () => console.log(`TurnkeyAI backend running on port ${PORT}`));
