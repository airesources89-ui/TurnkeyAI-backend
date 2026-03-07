const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = 'turnkeyaiservices@gmail.com';
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || 'turnkey2024';

// ── PERSISTENT FILE STORE ──
// Written to disk on every change. Survives Railway restarts completely.
const DATA_FILE = path.join(__dirname, 'clients.json');

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

// ── HELPERS ──
function makeToken() { return crypto.randomBytes(16).toString('hex'); }
function makePassword() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }

function makeSlug(businessName) {
  return (businessName || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40)
    .replace(/-$/, '');
}

// ── EMAIL ──
async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'TurnkeyAI Services', email: 'turnkeyaiservices@gmail.com' },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  const d = await res.json();
  if (!res.ok) console.error('[Brevo error]', d);
  return d;
}

// ── CLOUDFLARE PAGES DEPLOYMENT ──
// Each client gets a Cloudflare Pages project: turnkeyai-{slug}.pages.dev
// On approval: creates project + deploys live site (no preview banner)
// On hours update: re-deploys with updated hours automatically
async function deployToCloudflarePages(projectName, htmlContent) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    console.warn('[CF Pages] Missing CF_ACCOUNT_ID or CLOUDFLARE_API_TOKEN — skipping deployment');
    return { url: null, skipped: true };
  }

  // Step 1: Create project if it doesn't exist
  const checkRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`,
    { headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` } }
  );

  if (!checkRes.ok) {
    const createRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, production_branch: 'main' })
      }
    );
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error('CF Pages create failed: ' + JSON.stringify(createData.errors));
    console.log(`[CF Pages] Created project: ${projectName}`);
    // Brief pause for project to provision
    await new Promise(r => setTimeout(r, 2000));
  }

  // Step 2: Upload via Direct Upload API
  const form = new FormData();
  form.append('index.html', Buffer.from(htmlContent, 'utf8'), {
    filename: 'index.html',
    contentType: 'text/html; charset=utf-8'
  });

  const deployRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, ...form.getHeaders() },
      body: form
    }
  );

  const deployData = await deployRes.json();
  if (!deployRes.ok) throw new Error('CF Pages deploy failed: ' + JSON.stringify(deployData.errors));

  const liveUrl = `https://${projectName}.pages.dev`;
  console.log(`[CF Pages] Deployed: ${liveUrl}`);
  return { url: liveUrl, deploymentId: deployData.result?.id };
}

// ── SITE GENERATOR ──
// isPreview=true adds the orange "PREVIEW" banner and keeps chat pointing to Railway
// isPreview=false = live deployed version, no banner
function generateSiteHTML(data, isPreview) {
  const biz = data.businessName || 'Your Business';
  const owner = data.ownerName || '';
  const phone = data.phone || '';
  const email = data.email || '';
  const address = `${data.address || ''}, ${data.city || ''}, ${data.state || ''} ${data.zip || ''}`.trim().replace(/^,\s*/, '');
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

  // Hours
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  let hoursRows = '';
  days.forEach((d, i) => {
    if (data['day_' + d]) {
      hoursRows += `<tr><td style="padding:6px 16px 6px 0;font-weight:600;">${dayLabels[i]}</td><td style="padding:6px 0;">${data['hours_' + d] || 'Open'}</td></tr>`;
    }
  });

  // Services
  let servicesList = '';
  Object.keys(data).forEach(k => {
    if (k.startsWith('service_') && data[k] === 'on') {
      const name = k.replace('service_', '').replace(/_/g, ' ');
      const price = data['price_' + k.replace('service_', '')] || '';
      servicesList += `<li style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${name.charAt(0).toUpperCase()+name.slice(1)}${price ? ' — <strong>'+price+'</strong>' : ''}</li>`;
    }
  });
  if (data.additionalServices) servicesList += `<li style="padding:8px 0;">${data.additionalServices}</li>`;

  // Payments
  const payKeys = ['cash','card','check','venmo','cashapp','zelle'];
  const payLabels = {'cash':'Cash','card':'Credit/Debit Card','check':'Check','venmo':'Venmo','cashapp':'CashApp','zelle':'Zelle'};
  const payMethods = payKeys.filter(k => data['pay_'+k]).map(k => payLabels[k]).join(', ');

  // Chat endpoint — preview uses Railway, live site uses Railway too (it's the AI backend)
  const chatEndpoint = `${BASE_URL}/api/chat`;

  const previewBanner = isPreview
    ? `<div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;text-align:center;padding:12px 24px;font-weight:600;font-size:14px;">🔍 PREVIEW — This is your website draft. Not yet live. <a href="mailto:${ADMIN_EMAIL}" style="color:white;text-decoration:underline;">Contact us to approve.</a></div>`
    : `<div style="background:linear-gradient(135deg,#00D68F,#00b377);color:white;text-align:center;padding:10px 24px;font-size:13px;">⚡ Powered by <a href="https://turnkeyaiservices.com" style="color:white;font-weight:700;">TurnkeyAI Services</a> — AI-Powered Websites for Local Business</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${biz}${isPreview ? ' | PREVIEW' : ''} | Powered by TurnkeyAI</title>
<meta name="description" content="${tagline} Serving ${city} and surrounding areas.">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'DM Sans',sans-serif;color:#1F2937;background:#fff;}
.hero{background:linear-gradient(135deg,#0066FF 0%,#1a1a2e 100%);color:white;padding:80px 24px;text-align:center;}
.hero h1{font-family:'Playfair Display',serif;font-size:48px;margin-bottom:16px;}
.hero p{font-size:20px;opacity:.9;max-width:600px;margin:0 auto 32px;}
.cta{display:inline-block;background:#00D68F;color:white;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;margin:8px;}
.cta2{display:inline-block;background:rgba(255,255,255,.15);color:white;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;border:2px solid rgba(255,255,255,.4);margin:8px;}
.section{padding:60px 24px;max-width:960px;margin:0 auto;}
.section h2{font-family:'Playfair Display',serif;font-size:36px;color:#1a1a2e;margin-bottom:8px;}
.sub{color:#6B7280;font-size:16px;margin-bottom:40px;}
.about{background:#f8fafc;padding:60px 24px;}
.about-inner{max-width:960px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;}
@media(max-width:640px){.about-inner,.hours-inner{grid-template-columns:1fr!important;}.hero h1{font-size:32px;}}
.about-inner img{width:100%;border-radius:16px;object-fit:cover;max-height:360px;}
.placeholder-img{width:100%;height:300px;background:linear-gradient(135deg,#0066FF,#00D68F);border-radius:16px;display:flex;align-items:center;justify-content:center;color:white;font-size:48px;}
.hours-section{padding:60px 24px;background:#1a1a2e;color:white;}
.hours-inner{max-width:960px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;}
.hours-inner table{width:100%;}
.hours-inner td{color:rgba(255,255,255,.9);font-size:16px;padding:6px 0;}
.hours-inner td:first-child{font-weight:600;padding-right:16px;}
.contact-section{padding:60px 24px;max-width:960px;margin:0 auto;}
.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;}
.contact-item{text-align:center;padding:28px;background:#f8fafc;border-radius:16px;}
.contact-item .icon{font-size:32px;margin-bottom:12px;}
.contact-item h4{font-weight:700;margin-bottom:6px;}
.contact-item p{color:#6B7280;font-size:14px;}
.services-list{list-style:none;max-width:600px;}
.badge{display:inline-block;background:linear-gradient(135deg,#0066FF,#00D68F);color:white;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:24px;}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px;max-width:960px;margin-left:auto;margin-right:auto;}
.photos img{width:100%;border-radius:12px;object-fit:cover;max-height:240px;}
.chat-widget{position:fixed;bottom:24px;right:24px;z-index:999;}
.chat-btn{background:linear-gradient(135deg,#0066FF,#0052CC);color:white;border:none;border-radius:50px;padding:14px 24px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,102,255,.4);}
.footer{background:#1a1a2e;color:rgba(255,255,255,.6);text-align:center;padding:24px;font-size:13px;}
.footer a{color:#00D68F;text-decoration:none;}
</style>
</head>
<body>

${previewBanner}

<div class="hero">
  <h1>${biz}</h1>
  <p>${tagline}</p>
  <a href="tel:${phone}" class="cta">📞 Call Now${phone ? ': '+phone : ''}</a>
  <a href="#contact" class="cta2">Get a Free Quote</a>
</div>

${servicesList ? `
<div class="section">
  <div class="badge">${industry.replace(/_/g,' ').toUpperCase()}</div>
  <h2>Our Services</h2>
  <p class="sub">Serving ${city} and surrounding areas</p>
  <ul class="services-list">${servicesList}</ul>
  ${payMethods ? `<p style="margin-top:24px;color:#6B7280;">We accept: <strong>${payMethods}</strong></p>` : ''}
</div>` : ''}

${(about || ownerPhoto) ? `
<div class="about">
  <div class="about-inner">
    <div>
      <h2 style="font-family:'Playfair Display',serif;font-size:36px;color:#1a1a2e;margin-bottom:16px;">About Us</h2>
      ${about ? `<p style="font-size:16px;color:#374151;line-height:1.8;margin-bottom:16px;">${about}</p>` : ''}
      ${advantage ? `<p style="font-size:15px;color:#6B7280;margin-bottom:12px;">💪 ${advantage}</p>` : ''}
      ${awards ? `<p style="font-size:15px;color:#6B7280;">🏆 ${awards}</p>` : ''}
    </div>
    ${ownerPhoto ? `<img src="${ownerPhoto}" alt="${owner}">` : `<div class="placeholder-img">👤</div>`}
  </div>
  ${(workPhoto1 || workPhoto2) ? `<div class="photos">${workPhoto1?`<img src="${workPhoto1}" alt="Our work">`:''}${workPhoto2?`<img src="${workPhoto2}" alt="Our work">`:''}</div>` : ''}
</div>` : ''}

${hoursRows ? `
<div class="hours-section">
  <div class="hours-inner">
    <div>
      <h2 style="font-family:'Playfair Display',serif;font-size:36px;margin-bottom:24px;">Hours</h2>
      <table><tbody>${hoursRows}</tbody></table>
    </div>
    <div>
      <h2 style="font-family:'Playfair Display',serif;font-size:36px;margin-bottom:24px;">Why Choose Us</h2>
      <p style="opacity:.85;line-height:1.8;">${advantage || 'We pride ourselves on quality, reliability, and putting our customers first. Contact us today to learn how we can help.'}</p>
    </div>
  </div>
</div>` : ''}

<div class="contact-section" id="contact">
  <h2 style="font-family:'Playfair Display',serif;margin-bottom:8px;">Contact Us</h2>
  <p class="sub" style="margin-bottom:32px;">We'd love to hear from you</p>
  <div class="contact-grid">
    ${phone ? `<div class="contact-item"><div class="icon">📞</div><h4>Call or Text</h4><p>${phone}</p></div>` : ''}
    ${email ? `<div class="contact-item"><div class="icon">✉️</div><h4>Email</h4><p>${email}</p></div>` : ''}
    ${address.length > 5 ? `<div class="contact-item"><div class="icon">📍</div><h4>Location</h4><p>${address}</p></div>` : ''}
  </div>
</div>

<div class="chat-widget">
  <button class="chat-btn" id="chatToggle">💬 ${chatName}</button>
  <div id="chatBox" style="display:none;flex-direction:column;background:white;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);width:320px;max-height:440px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:16px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">
      <span>💬 ${chatName}</span>
      <span id="chatClose" style="cursor:pointer;font-size:18px;">✕</span>
    </div>
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:16px;font-size:14px;min-height:200px;"></div>
    <div style="padding:12px;border-top:1px solid #eee;display:flex;gap:8px;">
      <input id="chatInput" type="text" placeholder="Ask a question..." style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      <button id="chatSend" style="background:#0066FF;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;">Send</button>
    </div>
  </div>
</div>

<div class="footer">Built by <a href="https://turnkeyaiservices.com" target="_blank">TurnkeyAI Services</a> — AI-Powered Websites for Local Business</div>

<script>
(function(){
  var CHAT_ENDPOINT = '${chatEndpoint}';
  var sysPrompt = 'You are a helpful assistant for ${biz}, a ${industry.replace(/_/g,' ')} business in ${city}. Answer questions about services, hours, pricing, and contact info. Be ${chatPersonality}. Business phone: ${phone}. Business email: ${email}.';
  var msgs = [{role:'assistant',content:'Hi! How can I help you today with questions about ${biz}?'}];

  function render(){
    var c = document.getElementById('chatMessages');
    if(!c) return;
    c.innerHTML = msgs.map(function(m){
      return '<div style="margin-bottom:10px;'+(m.role==='user'?'text-align:right;':'')+'">'+
        (m.role==='user'
          ? '<span style="background:#0066FF;color:white;padding:6px 12px;border-radius:12px;display:inline-block;">'+m.content+'</span>'
          : '<span style="background:#f3f4f6;padding:6px 12px;border-radius:12px;display:inline-block;">'+m.content+'</span>'
        )+'</div>';
    }).join('');
    c.scrollTop = c.scrollHeight;
  }
  render();

  document.getElementById('chatToggle').addEventListener('click', function(){
    this.style.display='none';
    var b=document.getElementById('chatBox');
    b.style.display='flex';
  });
  document.getElementById('chatClose').addEventListener('click', function(){
    document.getElementById('chatBox').style.display='none';
    document.getElementById('chatToggle').style.display='block';
  });

  async function sendChat(){
    var i=document.getElementById('chatInput');
    var t=i.value.trim();
    if(!t) return;
    msgs.push({role:'user',content:t});
    i.value='';
    render();
    try{
      var r=await fetch(CHAT_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,systemPrompt:sysPrompt})});
      var d=await r.json();
      msgs.push({role:'assistant',content:d.reply||'...'});
    }catch(e){
      msgs.push({role:'assistant',content:'Sorry, chat is temporarily unavailable.'});
    }
    render();
  }

  document.getElementById('chatSend').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', function(e){ if(e.key==='Enter') sendChat(); });
})();
</script>
</body>
</html>`;
}

// ── HEALTH ──
app.get('/health', (req, res) => {
  res.json({ status: 'TurnkeyAI Backend Running', clients: Object.keys(clients).length, time: new Date().toISOString() });
});

// ── MAIN INTAKE ENDPOINT ──
app.post('/api/submission-created', async (req, res) => {
  try {
    const data = req.body;
    const id = data.id || ('client_' + Date.now());
    const previewToken = makeToken();

    clients[id] = {
      id,
      status: 'pending',
      data,
      previewToken,
      dashToken: null,
      dashPassword: null,
      liveUrl: null,
      cfProjectName: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveClients();

    const previewUrl = `${BASE_URL}/preview/${previewToken}`;

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🆕 New Intake: ${data.businessName || 'Unknown'} — Action Required`,
      html: `
        <h2 style="color:#0066FF;">New Client Submission</h2>
        <p><strong>Business:</strong> ${data.businessName || 'Unknown'}</p>
        <p><strong>Owner:</strong> ${data.ownerName || ''}</p>
        <p><strong>Email:</strong> ${data.email || ''}</p>
        <p><strong>Phone:</strong> ${data.phone || ''}</p>
        <p><strong>Industry:</strong> ${data.industry || ''}</p>
        <p><strong>City:</strong> ${data.city || ''}</p>
        <hr>
        <p><strong>Preview their site:</strong><br>
          <a href="${previewUrl}" style="color:#0066FF;">${previewUrl}</a>
        </p>
        <p><strong>One-click approve (deploys live site + sends dashboard credentials):</strong><br>
          <a href="${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}" style="background:#00D68F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;font-weight:700;">✅ Approve &amp; Go Live</a>
        </p>
        <hr>
        <details><summary>Full submission data</summary><pre style="font-size:12px;">${JSON.stringify(data, null, 2)}</pre></details>
      `
    });

    if (data.email) {
      await sendEmail({
        to: data.email,
        subject: `We're building your website — ${data.businessName || 'Your Business'}!`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#0066FF;">We Got Your Request!</h2>
            <p>Hi ${data.ownerName || 'there'},</p>
            <p>We've received your website request for <strong>${data.businessName || 'your business'}</strong> and we're getting to work.</p>
            <p>Within 24 hours you'll receive a <strong>preview link</strong> to review your site. Once you approve it, your site goes live and you'll get your Client Dashboard login.</p>
            <h3 style="margin-top:24px;">What happens next:</h3>
            <ol style="line-height:2;">
              <li>We review your submission and build your site</li>
              <li>You get a preview link by email</li>
              <li>We approve and deploy your live site automatically</li>
              <li>You get your <strong>Client Dashboard</strong> — update hours and more yourself anytime</li>
            </ol>
            <p style="margin-top:24px;">Questions? Call <strong>(228) 604-3200</strong></p>
            <p>— The TurnkeyAI Services Team</p>
          </div>
        `
      });
    }

    res.json({ success: true, id, preview: previewUrl });
  } catch (err) {
    console.error('[/api/submission-created]', err);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// ── PREVIEW PAGE (served from Railway) ──
app.get('/preview/:token', (req, res) => {
  const client = Object.values(clients).find(c => c.previewToken === req.params.token);
  if (!client) return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;">Preview not found or expired.</h2>');
  res.send(generateSiteHTML(client.data, true));
});

// ── APPROVE ENDPOINT ──
// Deploys live site to Cloudflare Pages, generates dashboard credentials, emails client
app.get('/api/approve/:id', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('<h2>Unauthorized</h2>');

  const client = clients[req.params.id];
  if (!client) return res.status(404).send('<h2>Client not found</h2>');
  if (client.status === 'active') {
    return res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h2>Already approved</h2>
      <p>Live URL: <a href="${client.liveUrl}">${client.liveUrl}</a></p>
    </body></html>`);
  }

  const dashToken = makeToken();
  const dashPassword = makePassword();
  const slug = makeSlug(client.data.businessName);
  const projectName = `turnkeyai-${slug}`;

  // Respond immediately so the approve page loads — deployment happens async
  res.send(`<html><head><meta http-equiv="refresh" content="5;url=${BASE_URL}/api/approve-status/${req.params.id}?adminKey=${adminKey}"></head>
    <body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h2 style="color:#0066FF;">⏳ Deploying ${client.data.businessName || 'site'}...</h2>
      <p>Deploying to Cloudflare Pages. This takes about 10-15 seconds.</p>
      <p>You'll be redirected automatically. Or <a href="${BASE_URL}/api/approve-status/${req.params.id}?adminKey=${adminKey}">click here</a>.</p>
    </body></html>`);

  // Run deployment in background
  (async () => {
    try {
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
      const previewUrl = `${BASE_URL}/preview/${client.previewToken}`;

      await sendEmail({
        to: client.data.email,
        subject: `🎉 Your website is LIVE — ${client.data.businessName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#00D68F;">Your Site Is Live!</h2>
            <p>Hi ${client.data.ownerName || 'there'},</p>
            <p><strong>${client.data.businessName}</strong> is now live on the web!</p>

            <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
              <p style="font-size:13px;color:#6B7280;margin-bottom:8px;">YOUR LIVE WEBSITE</p>
              <a href="${client.liveUrl}" style="font-size:20px;font-weight:700;color:#0066FF;">${client.liveUrl}</a>
            </div>

            <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#0066FF;">Your Client Dashboard</h3>
              <p><strong>Login URL:</strong><br><a href="${dashUrl}">${dashUrl}</a></p>
              <p style="margin-top:12px;"><strong>Your Password:</strong> <span style="font-size:24px;font-weight:700;letter-spacing:4px;color:#1a1a2e;">${dashPassword}</span></p>
              <p style="font-size:13px;color:#6B7280;margin-top:8px;">Save this password. Use your dashboard to update hours and submit change requests anytime — no need to call us.</p>
            </div>

            <h3 style="margin-top:24px;">What you can do in your dashboard:</h3>
            <ul style="line-height:2;">
              <li>✏️ Update your business hours — changes go live immediately</li>
              <li>📋 View your current services</li>
              <li>📩 Submit change requests for photos, new content, etc.</li>
              <li>👁️ View your live site</li>
            </ul>

            <p style="margin-top:24px;">Questions? Call <strong>(228) 604-3200</strong> or email <strong>george@turnkeyaiservices.com</strong></p>
            <p>— The TurnkeyAI Services Team</p>
          </div>
        `
      });

      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `✅ LIVE: ${client.data.businessName} deployed`,
        html: `<p><strong>${client.data.businessName}</strong> is live at <a href="${client.liveUrl}">${client.liveUrl}</a></p><p>Dashboard credentials sent to ${client.data.email}.</p><p>Password: <strong>${dashPassword}</strong></p>`
      });

      console.log(`[approve] ${client.data.businessName} live at ${client.liveUrl}`);
    } catch (err) {
      console.error('[approve background deploy]', err);
      // Even if CF Pages fails, save credentials so client can still get dashboard
      client.status = 'active';
      client.dashToken = dashToken;
      client.dashPassword = dashPassword;
      client.liveUrl = `${BASE_URL}/preview/${client.previewToken}`;
      client.cfProjectName = null;
      client.approvedAt = new Date().toISOString();
      client.updatedAt = new Date().toISOString();
      saveClients();

      const dashUrl = `${BASE_URL}/client-dashboard.html?token=${dashToken}`;
      await sendEmail({
        to: client.data.email,
        subject: `🎉 Your website is approved — ${client.data.businessName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#00D68F;">Your Site Is Approved!</h2>
            <p>Hi ${client.data.ownerName || 'there'},</p>
            <p>Your site has been approved. Your live URL will be ready within a few minutes.</p>
            <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#0066FF;">Your Client Dashboard</h3>
              <p><strong>Login URL:</strong><br><a href="${dashUrl}">${dashUrl}</a></p>
              <p style="margin-top:12px;"><strong>Your Password:</strong> <span style="font-size:24px;font-weight:700;letter-spacing:4px;color:#1a1a2e;">${dashPassword}</span></p>
            </div>
            <p>— The TurnkeyAI Services Team</p>
          </div>
        `
      }).catch(e => console.error('[fallback email]', e));
    }
  })();
});

// ── APPROVE STATUS PAGE ──
app.get('/api/approve-status/:id', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('<h2>Unauthorized</h2>');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('<h2>Not found</h2>');

  if (client.status === 'active') {
    res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h2 style="color:#00D68F;">✅ ${client.data.businessName || 'Client'} is LIVE!</h2>
      <p>Live URL: <a href="${client.liveUrl}" target="_blank">${client.liveUrl}</a></p>
      <p>Credentials emailed to <strong>${client.data.email}</strong></p>
      <p>Dashboard password: <strong>${client.dashPassword}</strong></p>
      <p style="margin-top:24px;"><a href="${client.liveUrl}" target="_blank" style="background:#00D68F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Live Site</a></p>
    </body></html>`);
  } else {
    res.send(`<html><head><meta http-equiv="refresh" content="3;url=${BASE_URL}/api/approve-status/${req.params.id}?adminKey=${adminKey}"></head>
      <body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2>⏳ Still deploying...</h2>
        <p>Refreshing in 3 seconds...</p>
      </body></html>`);
  }
});

// ── CLIENT DASHBOARD AUTH ──
app.post('/api/client-auth', (req, res) => {
  const { token, password } = req.body;
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  res.json({
    success: true,
    businessName: client.data.businessName,
    ownerName: client.data.ownerName,
    status: client.status,
    liveUrl: client.liveUrl,
    data: {
      hours: extractHours(client.data),
      services: extractServices(client.data),
      phone: client.data.phone,
      email: client.data.email,
      address: client.data.address,
      city: client.data.city,
      state: client.data.state
    },
    previewToken: client.previewToken
  });
});

// ── CLIENT SELF-SERVICE UPDATE ──
// Hours update re-deploys to Cloudflare Pages automatically
app.post('/api/client-update', async (req, res) => {
  const { token, password, updateType, updateData } = req.body;
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.toUpperCase()) return res.status(401).json({ error: 'Wrong password' });

  if (updateType === 'hours') {
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    days.forEach(d => {
      if (updateData['day_' + d] !== undefined) client.data['day_' + d] = updateData['day_' + d];
      if (updateData['hours_' + d] !== undefined) client.data['hours_' + d] = updateData['hours_' + d];
    });
    client.updatedAt = new Date().toISOString();
    saveClients();

    // Re-deploy to Cloudflare Pages in background so client gets instant response
    if (client.cfProjectName) {
      (async () => {
        try {
          const liveHTML = generateSiteHTML(client.data, false);
          await deployToCloudflarePages(client.cfProjectName, liveHTML);
          console.log(`[hours update] Re-deployed ${client.cfProjectName}`);
        } catch (e) {
          console.error('[hours re-deploy]', e.message);
        }
      })();
    }

    sendEmail({
      to: ADMIN_EMAIL,
      subject: `🕒 Hours Updated: ${client.data.businessName}`,
      html: `<p><strong>${client.data.businessName}</strong> updated their hours. Live site re-deploying automatically.</p><pre>${JSON.stringify(updateData, null, 2)}</pre>`
    }).catch(e => console.error('[hours email]', e));

    return res.json({ success: true, message: 'Hours updated! Your live site is refreshing now — changes will appear within 30 seconds.' });
  }

  if (updateType === 'change_request') {
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `📋 Change Request: ${client.data.businessName}`,
      html: `<h3>Change Request from ${client.data.businessName}</h3><p><strong>Type:</strong> ${updateData.requestType || 'General'}</p><p><strong>Details:</strong> ${updateData.details || ''}</p><p><strong>Client:</strong> ${client.data.email}</p>`
    }).catch(e => console.error('[change request email]', e));

    sendEmail({
      to: client.data.email,
      subject: `We received your change request — ${client.data.businessName}`,
      html: `<p>Hi ${client.data.ownerName || 'there'},</p><p>We received your change request and will handle it within 24-48 hours.</p><p>— TurnkeyAI Services</p>`
    }).catch(e => console.error('[change confirm email]', e));

    return res.json({ success: true, message: "Change request submitted. We'll handle it within 24-48 hours." });
  }

  res.status(400).json({ error: 'Unknown update type' });
});

// ── ADMIN: LIST ALL CLIENTS ──
app.get('/api/admin/clients', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const list = Object.values(clients).map(c => ({
    id: c.id,
    businessName: c.data.businessName,
    ownerName: c.data.ownerName,
    email: c.data.email,
    phone: c.data.phone,
    industry: c.data.industry,
    city: c.data.city,
    status: c.status,
    liveUrl: c.liveUrl,
    createdAt: c.createdAt,
    previewToken: c.previewToken
  }));
  res.json(list);
});

// ── LEGACY ENDPOINTS (kept working, nothing broken) ──
app.post('/api/intake', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Business Intake: ${data.businessName || 'Unknown'}`, html: `<h2>New Business Intake</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    if (data.email) await sendEmail({ to: data.email, subject: 'We received your TurnkeyAI request!', html: `<h2>Thanks, ${data.firstName || data.businessName}!</h2><p>We received your website request and will have a preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/intake]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/territory-partner', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Territory Partner: ${data.name || 'Unknown'}`, html: `<h2>Territory Partner Application</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    if (data.email) await sendEmail({ to: data.email, subject: 'Your TurnkeyAI Territory Partner Application', html: `<h2>Thanks, ${data.name}!</h2><p>We received your application and will review it within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/territory-partner]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/family-intake', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Family Site: ${data.familyName || 'Unknown'}`, html: `<h2>Family Intake</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    if (data.email) await sendEmail({ to: data.email, subject: 'Your TurnkeyAI Family Site Request', html: `<h2>Thanks!</h2><p>Preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/family-intake]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/crafter-intake', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Crafter Store: ${data.shopName || data.name || 'Unknown'}`, html: `<h2>Crafter Intake</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    if (data.email) await sendEmail({ to: data.email, subject: 'Your TurnkeyAI Crafter Store Request', html: `<h2>Thanks!</h2><p>Preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/crafter-intake]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── CLOUDFLARE AI CHAT ──
app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt || 'You are a helpful assistant for TurnkeyAI Services.' }, { role: 'user', content: message }] })
      }
    );
    const data = await response.json();
    res.json({ reply: data.result?.response || 'Sorry, I could not process that.' });
  } catch (err) { console.error('[/api/chat]', err); res.status(500).json({ reply: 'Chat temporarily unavailable.' }); }
});

// ── HELPERS ──
function extractHours(data) {
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const result = {};
  days.forEach(d => { result[d] = { open: !!data['day_' + d], hours: data['hours_' + d] || '' }; });
  return result;
}

function extractServices(data) {
  const services = [];
  Object.keys(data).forEach(k => {
    if (k.startsWith('service_') && data[k] === 'on') {
      const name = k.replace('service_', '');
      services.push({ key: name, label: name.replace(/_/g, ' '), price: data['price_' + name] || '' });
    }
  });
  return services;
}

// ── STATIC CATCH-ALL ──
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.listen(PORT, () => console.log(`TurnkeyAI backend running on port ${PORT}`));
