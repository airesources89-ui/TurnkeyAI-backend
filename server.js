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
      sender: { name: 'TurnkeyAI Services', email: 'turnkeyaiservices@gmail.com' },
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
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#00D68F;margin:0;font-size:28px;">Meet Your Mini-Me</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">Your AI-powered digital twin is almost ready</p>
      </div>
      <div style="padding:32px;">
        <p>Hi ${data.ownerName || 'there'},</p>
        <p>You're signed up for <strong>Mini-Me</strong> — your personal AI avatar that represents you on your website 24/7, answers questions in your voice, and never takes a day off.</p>
        <div style="background:#f0f9ff;border-left:4px solid #0066FF;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="color:#0066FF;margin:0 0 12px;">What is Mini-Me?</h3>
          <p style="margin:0;color:#374151;">Mini-Me is an AI-powered video avatar that looks and sounds like you. It greets your website visitors, answers their questions, and represents your business personally — even when you're busy or sleeping. Built from a short video clip you record on your phone.</p>
        </div>
        <h3 style="color:#1a1a2e;">Step 1 — Record Your Clip (2 minutes)</h3>
        <ul style="line-height:2;color:#374151;">
          <li>Use your phone camera</li>
          <li>Good lighting — face a window or lamp</li>
          <li>Hold phone at eye level</li>
          <li>30–60 seconds, one take is fine</li>
          <li>Video and audio together — no editing needed</li>
        </ul>
        <div style="background:#f8fafc;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="color:#00D68F;margin:0 0 16px;">📝 Your Script (ready to use)</h3>
          <p style="font-style:italic;line-height:1.9;color:#1a1a2e;white-space:pre-line;">${script}</p>
          <p style="font-size:13px;color:#6B7280;margin-top:12px;">Feel free to use your own words — this is just a starting point.</p>
        </div>
        <h3 style="color:#1a1a2e;">Step 2 — Upload Your Clip</h3>
        <div style="text-align:center;margin:24px 0;">
          <a href="${uploadUrl}" style="background:#0066FF;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">📤 Upload My Video Clip</a>
        </div>
        <h3 style="color:#1a1a2e;">Step 3 — Authorize Your Avatar</h3>
        <div style="text-align:center;margin:24px 0;">
          <a href="${consentUrl}" style="background:#00D68F;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">✅ I Consent — Build My Mini-Me</a>
        </div>
        <p style="font-size:12px;color:#9CA3AF;">By clicking above you authorize TurnkeyAI Services to use your image and likeness to create an AI avatar for use on your business website. Stored securely with timestamp.</p>
        <div style="background:#fff8ed;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-top:24px;">
          <p style="margin:0;font-size:14px;color:#92400e;"><strong>Continue your Mini-Me subscription after your free avatar?</strong> Just $59/month — includes updates, re-renders, and new scripts anytime. <a href="${subscribeUrl}" style="color:#0066FF;font-weight:700;">✅ Yes, sign me up for $59/mo →</a></p>
        </div>
        <p style="margin-top:32px;">Questions? Call <strong>(228) 604-3200</strong> or email <strong>george@turnkeyaiservices.com</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

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
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">60 seconds that will grow your business</p>
      </div>
      <div style="padding:32px;">
        <p>Hi ${data.ownerName || 'there'},</p>
        <p>As a TurnkeyAI client you get one <strong>free 60-second promotional video</strong>. We'll produce it professionally using your short phone recording.</p>
        <h3 style="color:#1a1a2e;">Step 1 — Record Your Clip</h3>
        <ul style="line-height:2;color:#374151;">
          <li>Use your phone camera</li>
          <li>Good lighting, eye level, one take is fine</li>
          <li>30–60 seconds, video and audio together</li>
        </ul>
        <div style="background:#f8fafc;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="color:#0066FF;margin:0 0 16px;">📝 Your Script</h3>
          <p style="font-style:italic;line-height:1.9;color:#1a1a2e;white-space:pre-line;">${script}</p>
          <p style="font-size:13px;color:#6B7280;margin-top:12px;">Use this or speak freely — your call.</p>
        </div>
        <h3 style="color:#1a1a2e;">Step 2 — Upload Your Clip</h3>
        <div style="text-align:center;margin:24px 0;">
          <a href="${uploadUrl}" style="background:#0066FF;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">📤 Upload My Video Clip</a>
        </div>
        <p>We'll have your finished video back to you within 48 hours and add it directly to your website.</p>
        <p style="margin-top:24px;">Questions? Call <strong>(228) 604-3200</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
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
  const form = new FormData();
  form.append('index.html', Buffer.from(htmlContent, 'utf8'), { filename: 'index.html', contentType: 'text/html; charset=utf-8' });
  const deployRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, ...form.getHeaders() }, body: form }
  );
  const deployData = await deployRes.json();
  if (!deployRes.ok) throw new Error('CF Pages deploy failed: ' + JSON.stringify(deployData.errors));
  const liveUrl = `https://${projectName}.pages.dev`;
  console.log(`[CF Pages] Deployed: ${liveUrl}`);
  return { url: liveUrl, deploymentId: deployData.result?.id };
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
  const dashUrl = `${BASE_URL}/client-dashboard.html?token=${dashToken}`;
  await sendEmail({
    to: client.data.email,
    subject: `🎉 Your website is LIVE — ${client.data.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#00D68F;">Your Site Is Live!</h2>
      <p>Hi ${client.data.ownerName || 'there'},</p>
      <p><strong>${client.data.businessName}</strong> is now live!</p>
      <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
        <p style="font-size:13px;color:#6B7280;margin-bottom:8px;">YOUR LIVE WEBSITE</p>
        <a href="${client.liveUrl}" style="font-size:20px;font-weight:700;color:#0066FF;">${client.liveUrl}</a>
      </div>
      <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
        <h3 style="margin:0 0 16px;color:#0066FF;">Your Client Dashboard</h3>
        <p><strong>Login URL:</strong><br><a href="${dashUrl}">${dashUrl}</a></p>
        <p style="margin-top:12px;"><strong>Password:</strong> <span style="font-size:24px;font-weight:700;letter-spacing:4px;">${dashPassword}</span></p>
      </div>
      <p>Questions? Call <strong>(228) 604-3200</strong></p>
      <p>— The TurnkeyAI Services Team</p>
    </div>`
  });
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `✅ LIVE: ${client.data.businessName}`,
    html: `<p><strong>${client.data.businessName}</strong> live at <a href="${client.liveUrl}">${client.liveUrl}</a> | Dashboard password: <strong>${dashPassword}</strong></p>`
  });
  if (client.data.wants_mini_me === 'yes') await sendMiniMeEmail(client).catch(e => console.error('[miniMe email]', e.message));
  if (client.data.wants_free_video === 'yes' && client.data.wants_mini_me !== 'yes') await sendFreeVideoEmail(client).catch(e => console.error('[video email]', e.message));
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
  const address = `${data.address||''}, ${data.city||''}, ${data.state||''} ${data.zip||''}`.trim().replace(/^,\s*/,'');
  const about = data.aboutUs || '';
  const tagline = data.missionStatement || 'Quality service you can count on.';
  const industry = data.industry || '';
  const city = data.city || data.targetCity || '';
  const chatName = data.chatName || 'Ask Us Anything';
  const chatPersonality = data.chatPersonality || 'friendly';
  const advantage = data.competitiveAdvantage || '';
  const awards = data.awards || '';
  const ownerPhoto = data.ownerPhoto || '';
  const workPhoto1 = data.workPhoto1 || '';
  const workPhoto2 = data.workPhoto2 || '';
  const miniMeVideo = data.miniMeVideoUrl || '';
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  let hoursRows = '';
  days.forEach((d,i) => { if(data['day_'+d]) hoursRows+=`<tr><td style="padding:6px 16px 6px 0;font-weight:600;">${dayLabels[i]}</td><td style="padding:6px 0;">${data['hours_'+d]||'Open'}</td></tr>`; });
  let servicesList = '';
  Object.keys(data).forEach(k => {
    if(k.startsWith('service_') && data[k]==='on'){
      const name=k.replace('service_','').replace(/_/g,' ');
      const price=data['price_'+k.replace('service_','')]||'';
      servicesList+=`<li style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${name.charAt(0).toUpperCase()+name.slice(1)}${price?' — <strong>'+price+'</strong>':''}</li>`;
    }
  });
  if(data.additionalServices) servicesList+=`<li style="padding:8px 0;">${data.additionalServices}</li>`;
  const payKeys=['cash','card','check','venmo','cashapp','zelle'];
  const payLabels={'cash':'Cash','card':'Credit/Debit Card','check':'Check','venmo':'Venmo','cashapp':'CashApp','zelle':'Zelle'};
  const payMethods=payKeys.filter(k=>data['pay_'+k]).map(k=>payLabels[k]).join(', ');
  const chatEndpoint=`${BASE_URL}/api/chat`;
  const previewBanner=isPreview
    ?`<div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;text-align:center;padding:12px 24px;font-weight:600;font-size:14px;">🔍 PREVIEW — Not yet live. <a href="mailto:${ADMIN_EMAIL}" style="color:white;text-decoration:underline;">Contact us to approve.</a></div>`
    :`<div style="background:linear-gradient(135deg,#00D68F,#00b377);color:white;text-align:center;padding:10px 24px;font-size:13px;">⚡ Powered by <a href="https://turnkeyaiservices.com" style="color:white;font-weight:700;">TurnkeyAI Services</a></div>`;
  const miniMeSection=miniMeVideo?`<div style="padding:60px 24px;background:#1a1a2e;text-align:center;"><div style="max-width:640px;margin:0 auto;"><h2 style="font-family:'Playfair Display',serif;color:white;font-size:32px;margin-bottom:8px;">Meet ${owner||'Our Team'}</h2><p style="color:rgba(255,255,255,.7);margin-bottom:24px;">A personal message just for you</p><video src="${miniMeVideo}" controls style="width:100%;border-radius:16px;max-height:360px;"></video></div></div>`:'';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${biz}${isPreview?' | PREVIEW':''} | Powered by TurnkeyAI</title><meta name="description" content="${tagline} Serving ${city} and surrounding areas."><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'DM Sans',sans-serif;color:#1F2937;background:#fff;}.hero{background:linear-gradient(135deg,#0066FF 0%,#1a1a2e 100%);color:white;padding:80px 24px;text-align:center;}.hero h1{font-family:'Playfair Display',serif;font-size:48px;margin-bottom:16px;}.hero p{font-size:20px;opacity:.9;max-width:600px;margin:0 auto 32px;}.cta{display:inline-block;background:#00D68F;color:white;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;margin:8px;}.cta2{display:inline-block;background:rgba(255,255,255,.15);color:white;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;border:2px solid rgba(255,255,255,.4);margin:8px;}.section{padding:60px 24px;max-width:960px;margin:0 auto;}.section h2{font-family:'Playfair Display',serif;font-size:36px;color:#1a1a2e;margin-bottom:8px;}.sub{color:#6B7280;font-size:16px;margin-bottom:40px;}.about{background:#f8fafc;padding:60px 24px;}.about-inner{max-width:960px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;}@media(max-width:640px){.about-inner,.hours-inner{grid-template-columns:1fr!important;}.hero h1{font-size:32px;}}.about-inner img{width:100%;border-radius:16px;object-fit:cover;max-height:360px;}.placeholder-img{width:100%;height:300px;background:linear-gradient(135deg,#0066FF,#00D68F);border-radius:16px;display:flex;align-items:center;justify-content:center;color:white;font-size:48px;}.hours-section{padding:60px 24px;background:#1a1a2e;color:white;}.hours-inner{max-width:960px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;}.hours-inner table{width:100%;}.hours-inner td{color:rgba(255,255,255,.9);font-size:16px;padding:6px 0;}.hours-inner td:first-child{font-weight:600;padding-right:16px;}.contact-section{padding:60px 24px;max-width:960px;margin:0 auto;}.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;}.contact-item{text-align:center;padding:28px;background:#f8fafc;border-radius:16px;}.contact-item .icon{font-size:32px;margin-bottom:12px;}.contact-item h4{font-weight:700;margin-bottom:6px;}.contact-item p{color:#6B7280;font-size:14px;}.services-list{list-style:none;max-width:600px;}.badge{display:inline-block;background:linear-gradient(135deg,#0066FF,#00D68F);color:white;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:24px;}.photos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px;max-width:960px;margin-left:auto;margin-right:auto;}.photos img{width:100%;border-radius:12px;object-fit:cover;max-height:240px;}.chat-widget{position:fixed;bottom:24px;right:24px;z-index:999;}.chat-btn{background:linear-gradient(135deg,#0066FF,#0052CC);color:white;border:none;border-radius:50px;padding:14px 24px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,102,255,.4);}.footer{background:#1a1a2e;color:rgba(255,255,255,.6);text-align:center;padding:24px;font-size:13px;}.footer a{color:#00D68F;text-decoration:none;}</style></head><body>
${previewBanner}
<div class="hero"><h1>${biz}</h1><p>${tagline}</p><a href="tel:${phone}" class="cta">📞 Call Now${phone?': '+phone:''}</a><a href="#contact" class="cta2">Get a Free Quote</a></div>
${miniMeSection}
${servicesList?`<div class="section"><div class="badge">${industry.replace(/_/g,' ').toUpperCase()}</div><h2>Our Services</h2><p class="sub">Serving ${city} and surrounding areas</p><ul class="services-list">${servicesList}</ul>${payMethods?`<p style="margin-top:24px;color:#6B7280;">We accept: <strong>${payMethods}</strong></p>`:''}</div>`:''}
${(about||ownerPhoto)?`<div class="about"><div class="about-inner"><div><h2 style="font-family:'Playfair Display',serif;font-size:36px;color:#1a1a2e;margin-bottom:16px;">About Us</h2>${about?`<p style="font-size:16px;color:#374151;line-height:1.8;margin-bottom:16px;">${about}</p>`:''}${advantage?`<p style="font-size:15px;color:#6B7280;margin-bottom:12px;">💪 ${advantage}</p>`:''}${awards?`<p style="font-size:15px;color:#6B7280;">🏆 ${awards}</p>`:''}</div>${ownerPhoto?`<img src="${ownerPhoto}" alt="${owner}">`:`<div class="placeholder-img">👤</div>`}</div>${(workPhoto1||workPhoto2)?`<div class="photos">${workPhoto1?`<img src="${workPhoto1}" alt="Our work">`:''}${workPhoto2?`<img src="${workPhoto2}" alt="Our work">`:''}</div>`:''}</div>`:''}
${hoursRows?`<div class="hours-section"><div class="hours-inner"><div><h2 style="font-family:'Playfair Display',serif;font-size:36px;margin-bottom:24px;">Hours</h2><table><tbody>${hoursRows}</tbody></table></div><div><h2 style="font-family:'Playfair Display',serif;font-size:36px;margin-bottom:24px;">Why Choose Us</h2><p style="opacity:.85;line-height:1.8;">${advantage||'We pride ourselves on quality, reliability, and putting our customers first.'}</p></div></div></div>`:''}
<div class="contact-section" id="contact"><h2 style="font-family:'Playfair Display',serif;margin-bottom:8px;">Contact Us</h2><p class="sub" style="margin-bottom:32px;">We'd love to hear from you</p><div class="contact-grid">${phone?`<div class="contact-item"><div class="icon">📞</div><h4>Call or Text</h4><p>${phone}</p></div>`:''}${email?`<div class="contact-item"><div class="icon">✉️</div><h4>Email</h4><p>${email}</p></div>`:''}${address.length>5?`<div class="contact-item"><div class="icon">📍</div><h4>Location</h4><p>${address}</p></div>`:''}</div></div>
<div class="chat-widget"><button class="chat-btn" id="chatToggle">💬 ${chatName}</button><div id="chatBox" style="display:none;flex-direction:column;background:white;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);width:320px;max-height:440px;overflow:hidden;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:16px;font-weight:700;display:flex;justify-content:space-between;align-items:center;"><span>💬 ${chatName}</span><span id="chatClose" style="cursor:pointer;font-size:18px;">✕</span></div><div id="chatMessages" style="flex:1;overflow-y:auto;padding:16px;font-size:14px;min-height:200px;"></div><div style="padding:12px;border-top:1px solid #eee;display:flex;gap:8px;"><input id="chatInput" type="text" placeholder="Ask a question..." style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;"><button id="chatSend" style="background:#0066FF;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;">Send</button></div></div></div>
<div class="footer">Built by <a href="https://turnkeyaiservices.com" target="_blank">TurnkeyAI Services</a> — AI-Powered Websites for Local Business</div>
<script>(function(){var E='${chatEndpoint}';var s='You are a helpful assistant for ${biz}, a ${industry.replace(/_/g,' ')} business in ${city}. Answer questions about services, hours, pricing, and contact info. Be ${chatPersonality}. Phone: ${phone}. Email: ${email}.';var msgs=[{role:'assistant',content:'Hi! How can I help you today with ${biz}?'}];function render(){var c=document.getElementById('chatMessages');if(!c)return;c.innerHTML=msgs.map(function(m){return '<div style="margin-bottom:10px;'+(m.role==='user'?'text-align:right;':'')+'">'+( m.role==='user'?'<span style="background:#0066FF;color:white;padding:6px 12px;border-radius:12px;display:inline-block;">'+m.content+'</span>':'<span style="background:#f3f4f6;padding:6px 12px;border-radius:12px;display:inline-block;">'+m.content+'</span>')+'</div>';}).join('');c.scrollTop=c.scrollHeight;}render();document.getElementById('chatToggle').addEventListener('click',function(){this.style.display='none';document.getElementById('chatBox').style.display='flex';});document.getElementById('chatClose').addEventListener('click',function(){document.getElementById('chatBox').style.display='none';document.getElementById('chatToggle').style.display='block';});async function sendChat(){var i=document.getElementById('chatInput');var t=i.value.trim();if(!t)return;msgs.push({role:'user',content:t});i.value='';render();try{var r=await fetch(E,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,systemPrompt:s})});var d=await r.json();msgs.push({role:'assistant',content:d.reply||'...'});}catch(e){msgs.push({role:'assistant',content:'Sorry, chat is temporarily unavailable.'});}render();}document.getElementById('chatSend').addEventListener('click',sendChat);document.getElementById('chatInput').addEventListener('keydown',function(e){if(e.key==='Enter')sendChat();});})();</script></body></html>`;
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

    // Partner bypass — instant deploy, no payment needed
    if ((data.paymentMethod || '').toLowerCase() === 'partner') {
      console.log(`[partner bypass] Auto-deploying ${data.businessName}...`);
      res.json({ success: true, id, preview: `${BASE_URL}/preview/${previewToken}`, partner: true });
      (async () => { try { await runDeploy(clients[id]); } catch(e) { console.error('[partner bypass]', e.message); } })();
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

    const addons = [];
    if (d.wants_mini_me === 'yes') addons.push(`🤖 Mini-Me AI Avatar ($59/mo) — consent given at ${d.mini_me_consent_timestamp||'submission'}`);
    if (d.wants_free_video === 'yes' && d.wants_mini_me !== 'yes') addons.push('🎬 Free 60-Second Promo Video');
    if (d.addon_after_hours === 'yes') addons.push('📞 After Hours Answering');
    if (d.addon_missed_call === 'yes') addons.push('📱 Missed Call Text Return');
    if (d.addon_voicemail_drop === 'yes') addons.push('🎙️ Custom Voicemail Greeting');

    const payMethods = ['cash','card','check','venmo','cashapp','zelle'].filter(p => d['pay_'+p]).join(', ');

    // ── ADMIN EMAIL ──────────────────────────────────────────────────────────
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||''}, ${d.state||''} — ${(d.industry||'').replace(/_/g,' ')}`,
      html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;color:#1F2937;">
<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;">
  <h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1>
  <p style="color:rgba(255,255,255,0.82);margin:6px 0 0;font-size:14px;">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p>
</div>
<div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">

${h2('Business Information')}
${table(`
  ${row('Business Name', d.businessName)}
  ${row('Owner', d.ownerName)}
  ${row('Industry', (d.industry||'').replace(/_/g,' '))}
  ${row('Business Type', d.businessType)}
  ${row('Phone', d.phone)}
  ${row('Email', d.email)}
  ${row('Address', [d.address,d.city,d.state,d.zip].filter(Boolean).join(', '))}
  ${row('Years in Business', d.yearsInBusiness)}
`)}

${h2('Online Presence')}
${table(`
  ${row('Current Website', d.currentWebsite)}
  ${row('Facebook', d.facebook)}
  ${row('Instagram', d.instagram)}
  ${row('Google Business', d.googleBusiness)}
  ${row('Other Social', d.otherSocial)}
  ${row('Logo', d.hasLogo==='yes'?'✅ Will email':'❌ Needs one')}
`)}

${servicesList.length ? `${h2('Services & Pricing')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${servicesList.map(s=>'<li>'+s+'</li>').join('')}</ul>` : ''}
${d.additionalServices ? `<p style="margin:0 0 20px;"><strong>Additional Services:</strong> ${d.additionalServices}</p>` : ''}

${hoursLines.length ? `${h2('Business Hours')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${hoursLines.join('')}</ul>` : ''}

${h2('AI Chat Setup')}
${table(`
  ${row('Chat Personality', d.chatPersonality)}
  ${row('Chat Name', d.chatName)}
  ${row('Pricing Display', d.pricingDisplay)}
  ${row('Frequent Questions', d.faqQuestions)}
`)}

${h2('About the Business')}
${table(`
  ${row('Business Story', d.aboutUs)}
  ${row('Owner Background', d.ownerBackground)}
  ${row('Milestones', d.milestones)}
  ${row('Mission / Tagline', d.missionStatement)}
  ${row('Community', d.communityInvolvement)}
  ${row('Awards / Certs', d.awards)}
`)}

${h2('Target Market & Payment')}
${table(`
  ${row('Target City', d.targetCity)}
  ${row('Service Radius', d.targetRadius)}
  ${row('Competitive Advantage', d.competitiveAdvantage)}
  ${row('Payment Methods', payMethods)}
  ${row('Referral Source', d.referralSource)}
  ${row('Additional Notes', d.additionalNotes)}
`)}

${addons.length ? `
<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;">
  <p style="font-weight:700;color:#065f46;margin:0 0 10px;font-size:15px;">🎯 Add-Ons Selected</p>
  <ul style="margin:0;padding-left:20px;line-height:2;font-size:14px;">${addons.map(a=>'<li><strong>'+a+'</strong></li>').join('')}</ul>
</div>` : `<p style="background:#f9fafb;padding:12px;border-radius:8px;color:#6B7280;margin-bottom:22px;">No add-ons selected.</p>`}

<div style="border-top:1px solid #e5e7eb;padding-top:22px;display:flex;gap:12px;flex-wrap:wrap;">
  <a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✅ Approve & Go Live</a>
  <a href="${previewUrl}" style="display:inline-block;background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">👁️ Preview Site</a>
</div>

</div></div>`
    });

    // ── CLIENT EMAIL ─────────────────────────────────────────────────────────
    if (d.email) {
      const clientAddons = [];
      if (d.wants_mini_me === 'yes') clientAddons.push('<li>🤖 <strong>Mini-Me AI Avatar</strong> — you\'ll receive a custom script and recording instructions within 24 hours</li>');
      else if (d.wants_free_video === 'yes') clientAddons.push('<li>🎬 <strong>Free 60-Second Promo Video</strong> — you\'ll receive a custom script and recording instructions within 24 hours</li>');
      if (d.addon_after_hours === 'yes') clientAddons.push('<li>📞 <strong>After Hours Answering</strong> — activated automatically when your site goes live</li>');
      if (d.addon_missed_call === 'yes') clientAddons.push('<li>📱 <strong>Missed Call Text Return</strong> — activated automatically when your site goes live</li>');
      if (d.addon_voicemail_drop === 'yes') clientAddons.push('<li>🎙️ <strong>Custom Voicemail Greeting</strong> — we\'ll write it and send it for your approval</li>');

      const reviewUrl = `${BASE_URL}/client-review.html?id=${id}&token=${previewToken}`;
      const clientApproveUrl = `${BASE_URL}/api/client-approve/${id}?token=${previewToken}`;
      const changesUrl = `${BASE_URL}/client-review.html?id=${id}&token=${previewToken}&action=changes`;

      await sendEmail({
        to: d.email,
        subject: `🎉 We're building your website — ${d.businessName||'Your Business'}!`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1F2937;">
<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;font-size:26px;">We Got It! 🎉</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px;">Hi ${d.ownerName||'there'} — your website is on the way.</p>
</div>
<div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;">

  <p style="font-size:15px;line-height:1.7;margin:0 0 22px;">We've received everything for <strong>${d.businessName||'your business'}</strong>. Our team is building your AI-powered website now. You'll receive a preview link within 24 hours to review before anything goes live.</p>

  <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:10px;padding:20px;margin:0 0 22px;">
    <p style="font-weight:700;margin:0 0 12px;color:#0066FF;">What you're getting:</p>
    <ul style="margin:0;padding-left:20px;line-height:2.1;font-size:14px;">
      <li>✅ AI-powered business website for <strong>${d.businessName||'your business'}</strong></li>
      <li>✅ 24/7 AI chat assistant — captures leads while you sleep</li>
      <li>✅ Client dashboard — update hours and request changes anytime</li>
      ${clientAddons.join('')}
    </ul>
  </div>

  <div style="background:#f9fafb;border-radius:10px;padding:20px;margin:0 0 22px;">
    <p style="font-weight:700;margin:0 0 10px;">What happens next:</p>
    <ol style="margin:0;padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
      <li>We build your website — typically within 24 hours</li>
      <li>You'll receive a preview link by email to review</li>
      <li>Approve it to go live — or request any changes</li>
      <li>Activate for <strong>$99/month, no setup fee</strong></li>
    </ol>
  </div>

  <p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email them to <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p>
  <p style="font-size:14px;color:#6B7280;margin:0 0 24px;">Questions? Call <strong>(228) 604-3200</strong> or reply to this email.</p>

  <div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;">
    <p style="font-size:12px;color:#9CA3AF;margin:0;">TurnkeyAI Services — AI-Powered Websites for Local Business<br>300 Blakemore Ave, Bay St. Louis, MS 39520</p>
  </div>
</div></div>`
      });
    }

    res.json({ success: true, id, preview: previewUrl });
  } catch (err) { console.error('[/api/submission-created]', err); res.status(500).json({ error: 'Submission failed' }); }
});

app.get('/preview/:token', (req, res) => {
  const client = Object.values(clients).find(c => c.previewToken === req.params.token);
  if (!client) return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;">Preview not found.</h2>');
  res.send(generateSiteHTML(client.data, true));
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
      client.status='active'; client.dashToken=client.dashToken||makeToken(); client.dashPassword=client.dashPassword||makePassword();
      client.liveUrl=`${BASE_URL}/preview/${client.previewToken}`; client.approvedAt=new Date().toISOString(); saveClients();
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
    return res.send(`<html><head><meta http-equiv="refresh" content="3;url=${client.liveUrl||BASE_URL+'/client-dashboard.html?token='+client.dashToken}"></head>
    <body style="font-family:sans-serif;padding:60px;text-align:center;">
    <h2 style="color:#00D68F;">✅ Your site is already live!</h2>
    <p>Redirecting to your dashboard...</p>
    <p><a href="${client.liveUrl}" style="color:#0066FF;">${client.liveUrl}</a></p>
    </body></html>`);
  }
  res.send(`<html><head><meta http-equiv="refresh" content="5;url=${BASE_URL}/api/client-approve-status/${req.params.id}?token=${token}"></head>
  <body style="font-family:sans-serif;padding:60px;text-align:center;background:#f9fafb;">
  <div style="max-width:480px;margin:0 auto;background:white;padding:48px 40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="font-size:48px;margin-bottom:16px;">🚀</div>
    <h2 style="color:#0066FF;margin:0 0 12px;">Launching your website...</h2>
    <p style="color:#6B7280;font-size:15px;margin:0;">This takes about 15 seconds. Please don't close this page.</p>
    <div style="margin-top:28px;background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#0066FF,#00D68F);height:100%;width:60%;border-radius:99px;animation:bar 2s ease-in-out infinite alternate;"></div>
    </div>
    <style>@keyframes bar{from{width:30%}to{width:90%}}</style>
  </div>
  </body></html>`);
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
    }
  })();
});

app.get('/api/client-approve-status/:id', (req, res) => {
  const { token } = req.query;
  const client = clients[req.params.id];
  if (!client || !token || token !== client.previewToken) return res.status(403).send('<h2>Invalid link.</h2>');
  if (client.status === 'active') {
    const dashUrl = `${BASE_URL}/client-dashboard.html?token=${client.dashToken}`;
    res.send(`<html><head><meta http-equiv="refresh" content="4;url=${dashUrl}"></head>
    <body style="font-family:sans-serif;padding:60px;text-align:center;background:#f9fafb;">
    <div style="max-width:500px;margin:0 auto;background:white;padding:48px 40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <div style="font-size:56px;margin-bottom:16px;">🎉</div>
      <h2 style="color:#00D68F;margin:0 0 10px;">You're Live!</h2>
      <p style="font-size:16px;color:#374151;margin:0 0 24px;"><strong>${client.data.businessName||'Your business'}</strong> is now live on the internet.</p>
      <a href="${client.liveUrl}" style="display:block;background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:12px;">🌐 View My Live Site</a>
      <a href="${dashUrl}" style="display:block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">📋 Go to My Dashboard</a>
      <p style="margin-top:20px;font-size:13px;color:#9CA3AF;">Your dashboard password: <strong style="color:#374151;">${client.dashPassword||''}</strong></p>
    </div></body></html>`);
  } else {
    res.send(`<html><head><meta http-equiv="refresh" content="3;url=${BASE_URL}/api/client-approve-status/${req.params.id}?token=${token}"></head>
    <body style="font-family:sans-serif;padding:60px;text-align:center;background:#f9fafb;">
    <div style="max-width:420px;margin:0 auto;background:white;padding:40px;border-radius:16px;">
      <div style="font-size:40px;margin-bottom:16px;">⏳</div>
      <h2 style="color:#0066FF;">Still launching...</h2>
      <p style="color:#6B7280;">Refreshing automatically...</p>
    </div></body></html>`);
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
    let event;
    if (STRIPE_WEBHOOK_SECRET && sig) {
      const hmac = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET);
      hmac.update(req.body);
      if ('sha256='+hmac.digest('hex') !== sig) return res.status(400).send('Invalid signature');
    }
    event = JSON.parse(req.body);
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
    await sendEmail({ to: ADMIN_EMAIL, subject: `🎬 Video Uploaded: ${client.data.businessName} — ${isPromo?'Promo':'Mini-Me'}`, html: `<h3>${isPromo?'Promo Video':'Mini-Me Clip'} Received</h3><p><strong>Business:</strong> ${client.data.businessName}</p><p><strong>File:</strong> ${videoFileName}</p><p><strong>Mini-Me Consent:</strong> ${client.miniMeConsent?'✅ '+client.miniMeConsentAt:'⏳ Pending'}</p>` });
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
  res.json({ success: true, businessName: client.data.businessName, ownerName: client.data.ownerName, status: client.status, liveUrl: client.liveUrl, miniMeConsent: client.miniMeConsent, miniMeSubscribed: client.miniMeSubscribed, miniMeVideoUrl: client.data.miniMeVideoUrl||null, freeVideoRequested: client.freeVideoRequested||false, data: { hours: extractHours(client.data), services: extractServices(client.data), phone: client.data.phone, email: client.data.email, address: client.data.address, city: client.data.city, state: client.data.state }, previewToken: client.previewToken });
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
    id: c.id, businessName: c.data.businessName, ownerName: c.data.ownerName, email: c.data.email, phone: c.data.phone, industry: c.data.industry, city: c.data.city, status: c.status, liveUrl: c.liveUrl, createdAt: c.createdAt, previewToken: c.previewToken,
    wantsMiniMe: c.data.wants_mini_me, miniMeConsent: c.miniMeConsent, miniMeSubscribed: c.miniMeSubscribed, miniMeVideoFile: c.miniMeVideoFile||null, promoVideoFile: c.promoVideoFile||null, wantsFreeVideo: c.freeVideoRequested, wantsAfterHours: c.data.addon_after_hours, wantsMissedCall: c.data.addon_missed_call, wantsVoicemailDrop: c.data.addon_voicemail_drop
  })));
});

// ── /api/intake — legacy endpoint, now sends full rich emails ────────────────
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
    const d = data;

    const row = (label, val) => val
      ? `<tr><td style="padding:9px 14px;font-weight:600;color:#374151;background:#f9fafb;width:170px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${val}</td></tr>`
      : '';
    const table = (rows) => `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">${rows}</table>`;
    const h2 = (txt) => `<h2 style="color:#0066FF;font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${txt}</h2>`;

    const addons = [];
    if (d.wants_mini_me === 'yes' || d.wantsMiniMe === 'yes') addons.push('🤖 Mini-Me AI Avatar ($59/mo)');
    if ((d.wants_free_video === 'yes' || d.wantsFreeVideo === 'yes') && d.wants_mini_me !== 'yes') addons.push('🎬 Free 60-Second Promo Video');
    if (d.addon_after_hours === 'yes' || d.wantsAfterHours === 'yes') addons.push('📞 After Hours Answering');
    if (d.addon_missed_call === 'yes' || d.wantsMissedCall === 'yes') addons.push('📱 Missed Call Text Return');
    if (d.addon_voicemail_drop === 'yes' || d.wantsVoicemailDrop === 'yes') addons.push('🎙️ Custom Voicemail Greeting');

    // ── ADMIN EMAIL ──────────────────────────────────────────────────────────
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||d.location||''} — ${(d.industry||'').replace(/_/g,' ')}`,
      html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;color:#1F2937;">
<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;">
  <h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1>
  <p style="color:rgba(255,255,255,0.82);margin:6px 0 0;font-size:14px;">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p>
</div>
<div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">
${h2('Business Information')}
${table(`
  ${row('Business Name', d.businessName)}
  ${row('Owner', d.ownerName)}
  ${row('Industry', (d.industry||'').replace(/_/g,' '))}
  ${row('Business Type', d.businessType)}
  ${row('Phone', d.phone)}
  ${row('Email', d.email)}
  ${row('City', d.city||d.location)}
  ${row('State', d.state)}
  ${row('Address', d.address)}
  ${row('Years in Business', d.yearsInBusiness)}
  ${row('Current Website', d.currentWebsite)}
`)}
${addons.length ? `
<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;">
  <p style="font-weight:700;color:#065f46;margin:0 0 10px;font-size:15px;">🎯 Add-Ons Selected</p>
  <ul style="margin:0;padding-left:20px;line-height:2;font-size:14px;">${addons.map(a=>'<li><strong>'+a+'</strong></li>').join('')}</ul>
</div>` : ''}
<details style="margin-bottom:22px;"><summary style="cursor:pointer;font-weight:600;color:#0066FF;padding:10px;background:#f9fafb;border-radius:8px;">📋 View All Submitted Data</summary><pre style="font-size:12px;background:#f9fafb;padding:14px;border-radius:8px;overflow:auto;margin-top:8px;">${JSON.stringify(d,null,2)}</pre></details>
<div style="display:flex;gap:12px;flex-wrap:wrap;">
  <a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✅ Approve & Go Live</a>
  <a href="${previewUrl}" style="display:inline-block;background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">👁️ Preview Site</a>
</div>
</div></div>`
    });

    // ── CLIENT EMAIL ─────────────────────────────────────────────────────────
    if (d.email) {
      const clientAddons = [];
      if (d.wants_mini_me === 'yes' || d.wantsMiniMe === 'yes') clientAddons.push('<li>🤖 <strong>Mini-Me AI Avatar</strong> — you\'ll receive a custom script and recording instructions within 24 hours</li>');
      else if (d.wants_free_video === 'yes' || d.wantsFreeVideo === 'yes') clientAddons.push('<li>🎬 <strong>Free 60-Second Promo Video</strong> — you\'ll receive a custom script and recording instructions within 24 hours</li>');
      if (d.addon_after_hours === 'yes' || d.wantsAfterHours === 'yes') clientAddons.push('<li>📞 <strong>After Hours Answering</strong> — activated when your site goes live</li>');
      if (d.addon_missed_call === 'yes' || d.wantsMissedCall === 'yes') clientAddons.push('<li>📱 <strong>Missed Call Text Return</strong> — activated when your site goes live</li>');
      if (d.addon_voicemail_drop === 'yes' || d.wantsVoicemailDrop === 'yes') clientAddons.push('<li>🎙️ <strong>Custom Voicemail Greeting</strong> — we\'ll write it and send for your approval</li>');

      await sendEmail({
        to: d.email,
        subject: `🎉 We're building your website — ${d.businessName||'Your Business'}!`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1F2937;">
<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;font-size:26px;">We Got It! 🎉</h1>
  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px;">Hi ${d.ownerName||'there'} — your website is on the way.</p>
</div>
<div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;">
  <p style="font-size:15px;line-height:1.7;margin:0 0 22px;">We've received everything for <strong>${d.businessName||'your business'}</strong>. Our team is building your AI-powered website now. You'll receive a preview link within 24 hours to review before anything goes live.</p>
  <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:10px;padding:20px;margin:0 0 22px;">
    <p style="font-weight:700;margin:0 0 12px;color:#0066FF;">What you're getting:</p>
    <ul style="margin:0;padding-left:20px;line-height:2.1;font-size:14px;">
      <li>✅ AI-powered business website for <strong>${d.businessName||'your business'}</strong></li>
      <li>✅ 24/7 AI chat assistant — captures leads while you sleep</li>
      <li>✅ Client dashboard — update hours and request changes anytime</li>
      ${clientAddons.join('')}
    </ul>
  </div>
  <div style="background:#f9fafb;border-radius:10px;padding:20px;margin:0 0 22px;">
    <p style="font-weight:700;margin:0 0 10px;">What happens next:</p>
    <ol style="margin:0;padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
      <li>We build your website — typically within 24 hours</li>
      <li>You'll receive a preview link by email to review</li>
      <li>Approve it to go live — or request any changes</li>
      <li>Activate for <strong>$99/month, no setup fee</strong></li>
    </ol>
  </div>
  <p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email them to <a href="mailto:george@turnkeyaiservices.com" style="color:#0066FF;">george@turnkeyaiservices.com</a></p>
  <p style="font-size:14px;color:#6B7280;margin:0 0 24px;">Questions? Call <strong>(228) 604-3200</strong> or reply to this email.</p>
  <div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;">
    <p style="font-size:12px;color:#9CA3AF;margin:0;">TurnkeyAI Services — AI-Powered Websites for Local Business<br>300 Blakemore Ave, Bay St. Louis, MS 39520</p>
  </div>
</div></div>`
      });
    }

    res.json({ success: true });
  } catch(err) { console.error('[/api/intake]', err); res.status(500).json({ error: 'Failed' }); }
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

app.post('/api/video-upload-notify', async (req, res) => {
  try {
    const d = req.body;
    const typeLabel = d.videoType === 'mini_me' ? 'Mini-Me AI Avatar Clip' : d.videoType === 'both' ? 'Promo Video + Mini-Me Clip' : 'Free 60-Second Promo Video';
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🎬 Video Clip Uploaded: ${d.businessName || 'Unknown'}`,
      html: `<h2 style="color:#0066FF;">New Client Video Clip Submitted</h2>
        <table style="border-collapse:collapse;width:100%;max-width:500px;">
          <tr><td style="padding:8px;font-weight:700;color:#374151;">Client</td><td style="padding:8px;">${d.uploaderName||''}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;color:#374151;">Business</td><td style="padding:8px;">${d.businessName||''}</td></tr>
          <tr><td style="padding:8px;font-weight:700;color:#374151;">Email</td><td style="padding:8px;">${d.email||''}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;color:#374151;">Video Type</td><td style="padding:8px;">${typeLabel}</td></tr>
          <tr><td style="padding:8px;font-weight:700;color:#374151;">File</td><td style="padding:8px;">${d.fileName||''} (${d.fileSize||''})</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;color:#374151;">Consent</td><td style="padding:8px;">${d.consentGiven?'✅ Yes — '+(d.consentTimestamp||''):'❌ No'}</td></tr>
          ${d.notes?`<tr><td style="padding:8px;font-weight:700;color:#374151;">Notes</td><td style="padding:8px;">${d.notes}</td></tr>`:''}
        </table>
        <p style="margin-top:20px;color:#6B7280;font-size:13px;">The client will also email the video file to george@turnkeyaiservices.com.</p>`
    });
    if (d.email) {
      await sendEmail({
        to: d.email,
        subject: `✅ Video Received — ${d.businessName||'Your Business'}`,
        html: `<h2 style="color:#0066FF;">We Got Your Video Clip!</h2>
          <p>Hi ${d.uploaderName||'there'},</p>
          <p>We've received your submission for <strong>${typeLabel}</strong>. Production begins within 48 hours.</p>
          <p>You'll receive a preview by email before anything goes live on your site.</p>
          <p style="margin-top:20px;"><strong>Important:</strong> Please also email your video file to <a href="mailto:george@turnkeyaiservices.com">george@turnkeyaiservices.com</a> so we can begin production.</p>
          <p>Questions? Call us at (228) 604-3200</p>
          <p>— TurnkeyAI Services Team</p>`
      });
    }
    res.json({ success: true });
  } catch(err) { console.error('[/api/video-upload-notify]', err); res.status(500).json({ error: 'Failed' }); }
});

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) res.sendFile(filePath);
  else res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`TurnkeyAI backend running on port ${PORT}`));
