require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_EMAIL = 'airesources89@gmail.com';
const FROM_EMAIL = 'noreply@turnkeyaiservices.com';
const SITE_BASE_URL = 'https://turnkeyai-backend-production.up.railway.app';
const PORT = process.env.PORT || 3000;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const SUBMISSIONS = {};
const PARTNERS = {};
const PREVIEW_SITES = {};
const LIVE_SITES = {};

app.get('/', (req, res) => res.json({ status: 'TurnkeyAI Running', clients: Object.keys(SUBMISSIONS).length, time: new Date().toISOString() }));

app.get('/api/submissions', (req, res) => res.json(Object.values(SUBMISSIONS).sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))));
app.get('/api/partners', (req, res) => res.json(Object.values(PARTNERS).sort((a,b)=>new Date(b.appliedAt)-new Date(a.appliedAt))));

app.post('/api/update-submission', (req, res) => {
  const { id, status, notes } = req.body;
  if (SUBMISSIONS[id]) { if (status) SUBMISSIONS[id].status = status; if (notes) SUBMISSIONS[id].notes = notes; }
  res.json({ updated: !!SUBMISSIONS[id] });
});
app.post('/api/update-partner', (req, res) => {
  const { id, status, approvedZips } = req.body;
  if (PARTNERS[id]) { if (status) PARTNERS[id].status = status; if (approvedZips) PARTNERS[id].approvedZips = approvedZips; }
  res.json({ updated: !!PARTNERS[id] });
});

// Serve preview sites
app.get('/preview/:siteName', (req, res) => {
  const html = PREVIEW_SITES[req.params.siteName];
  if (!html) return res.status(404).send('<html><body style="font-family:Arial;text-align:center;padding:80px;"><h2>Preview not ready yet</h2><p>Check back soon or call (603) 922-2004.</p></body></html>');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

// Serve live sites
app.get('/site/:siteName', (req, res) => {
  const html = LIVE_SITES[req.params.siteName] || PREVIEW_SITES[req.params.siteName];
  if (!html) return res.status(404).send('<html><body style="font-family:Arial;text-align:center;padding:80px;"><h2>Site not found</h2></body></html>');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

// Client self-service update
app.post('/api/client-update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    const sub = SUBMISSIONS[id];
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    Object.assign(sub.rawData, updates);
    sub.rawData.businessName = updates.businessName || sub.rawData.businessName;
    const newHTML = generateSiteHTML(sub.rawData);
    PREVIEW_SITES[sub.previewSite] = newHTML;
    sub.status = 'review';
    const reviewUrl = SITE_BASE_URL + '/client-review.html?site=' + sub.previewSite + '&id=' + id + '&biz=' + encodeURIComponent(sub.businessName) + '&email=' + encodeURIComponent(sub.email) + '&owner=' + encodeURIComponent(sub.ownerName);
    if (sub.email) {
      await sendEmail({ to: sub.email, subject: 'Your Updated Preview is Ready — ' + sub.businessName, html:
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
        '<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px 24px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;">Updated Preview Ready</h1></div>' +
        '<div style="padding:32px;background:white;border:1px solid #e2e8f0;">' +
        '<p>Hi ' + sub.ownerName + ', your changes have been applied to <strong>' + sub.businessName + '</strong>.</p>' +
        '<div style="text-align:center;margin:24px 0;">' +
        '<a href="' + SITE_BASE_URL + '/preview/' + sub.previewSite + '" style="display:inline-block;padding:14px 32px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin-bottom:12px;display:block;max-width:260px;margin:0 auto 12px;">View Updated Preview</a>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">' +
        '<a href="' + reviewUrl + '&action=approve" style="display:inline-block;padding:12px 24px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✓ Approve & Go Live</a>' +
        '<a href="' + reviewUrl + '&action=changes" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✏ More Changes</a>' +
        '</div></div></div>' +
        '<div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com</div></div>'
      });
    }
    await notifyAdmin('Client Updated: ' + sub.businessName,
      '<p><b>' + sub.businessName + '</b> made self-service edits.<br>Preview: <a href="' + SITE_BASE_URL + '/preview/' + sub.previewSite + '">' + SITE_BASE_URL + '/preview/' + sub.previewSite + '</a></p>');
    return res.json({ success: true, previewUrl: SITE_BASE_URL + '/preview/' + sub.previewSite });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

function generateSiteHTML(data) {
  const biz = data.businessName || 'Your Business';
  const owner = data.ownerName || '';
  const phone = data.phone || '(555) 000-0000';
  const email = data.email || '';
  const city = data.city || '';
  const state = data.state || '';
  const about = data.aboutUs || ('Welcome to ' + biz + '. We are proud to serve ' + city + ' and the surrounding area.');
  const mission = data.missionStatement || '';
  const industry = data.industry || 'cleaning';
  const chatName = data.chatName || 'Ask Us';
  const awards = data.awards || '';
  const community = data.communityInvolvement || '';

  const services = [];
  for (const key of Object.keys(data)) {
    if (key.startsWith('svc_') && (data[key] === 'on' || data[key] === true || data[key] === '1')) {
      const svcName = key.replace('svc_','').replace(/_/g,' ');
      const price = data['price_' + key.replace('svc_','')] || '';
      services.push({ name: svcName, price });
    }
  }

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hoursRows = days.filter(d => data['day_'+d]).map(d =>
    '<tr><td style="padding:8px 16px;font-weight:600;text-transform:capitalize;color:#374151;">' + d + '</td><td style="padding:8px 16px;color:#6B7280;">' + (data['hours_'+d]||'Call for hours') + '</td></tr>'
  ).join('');

  const payMethods = ['cash','card','check','venmo','cashapp','zelle','paypal','stripe','financing']
    .filter(m => data['pay_'+m]).map(m => m.charAt(0).toUpperCase()+m.slice(1)).join(' · ');

  const colors = { cleaning:'#0066FF',restaurant:'#c53030',plumbing:'#2b6cb0',electrical:'#b7791f',hvac:'#285e61',landscaping:'#276749',auto_detailing:'#553c9a',auto_repair:'#553c9a',fitness:'#c53030',salon:'#b83280',pet_services:'#6b46c1',default:'#0066FF' };
  const primary = colors[industry] || colors.default;

  const servicesHtml = services.length ? `
    <section style="padding:60px 0;background:#f8fafc;">
      <div style="max-width:960px;margin:0 auto;padding:0 24px;">
        <h2 style="text-align:center;font-size:32px;font-weight:800;margin-bottom:40px;color:#1a202c;">Our Services</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;">
          ${services.map(s=>`<div style="background:#fff;padding:22px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);border-top:3px solid ${primary};">
            <div style="font-size:16px;font-weight:700;color:#1a202c;text-transform:capitalize;">${s.name}</div>
            ${s.price?`<div style="color:${primary};font-weight:600;margin-top:6px;">${s.price}</div>`:''}
          </div>`).join('')}
        </div>
      </div>
    </section>` : '';

  const hoursHtml = hoursRows ? `
    <section style="padding:60px 0;background:#fff;">
      <div style="max-width:960px;margin:0 auto;padding:0 24px;text-align:center;">
        <h2 style="font-size:32px;font-weight:800;margin-bottom:32px;color:#1a202c;">Business Hours</h2>
        <table style="margin:0 auto;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden;min-width:300px;">
          ${hoursRows}
        </table>
      </div>
    </section>` : '';

  const trustBadges = [
    awards ? `<div style="text-align:center;padding:16px;"><div style="font-size:24px;">🏆</div><div style="font-size:14px;font-weight:600;margin-top:6px;color:#374151;">${awards}</div></div>` : '',
    community ? `<div style="text-align:center;padding:16px;"><div style="font-size:24px;">🤝</div><div style="font-size:14px;font-weight:600;margin-top:6px;color:#374151;">${community}</div></div>` : '',
    `<div style="text-align:center;padding:16px;"><div style="font-size:24px;">⭐</div><div style="font-size:14px;font-weight:600;margin-top:6px;color:#374151;">5-Star Rated</div></div>`,
    payMethods ? `<div style="text-align:center;padding:16px;"><div style="font-size:24px;">💳</div><div style="font-size:14px;font-weight:600;margin-top:6px;color:#374151;">${payMethods}</div></div>` : ''
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${biz}${city?' | '+city:''}${state?', '+state:''}</title>
<meta name="description" content="${about.substring(0,155).replace(/"/g,'&quot;')}">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a202c;}
nav{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1);padding:16px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100;}
.nav-brand{font-size:22px;font-weight:800;color:${primary};}
.nav-phone{font-size:16px;font-weight:700;color:${primary};text-decoration:none;}
.hero{background:linear-gradient(135deg,${primary},${primary}bb);color:#fff;padding:80px 24px;text-align:center;}
.hero h1{font-size:48px;font-weight:800;margin-bottom:16px;line-height:1.1;}
.hero p{font-size:20px;opacity:.9;max-width:600px;margin:0 auto 32px;}
.btn{display:inline-block;padding:16px 36px;border-radius:10px;font-size:18px;font-weight:700;text-decoration:none;border:none;cursor:pointer;}
.btn-white{background:#fff;color:${primary};}
.btn-outline{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.7);margin-left:12px;}
.about-section{padding:60px 0;background:#fff;}
.about-grid{max-width:960px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;}
.trust-bar{background:${primary}11;padding:24px;display:flex;flex-wrap:wrap;justify-content:center;gap:0;}
.contact-section{background:${primary};color:#fff;padding:60px 24px;text-align:center;}
.contact-grid{display:flex;gap:40px;justify-content:center;flex-wrap:wrap;margin-top:28px;}
.contact-item .label{font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:.75;}
.contact-item .value{font-size:18px;font-weight:700;margin-top:4px;}
.chat-fab{position:fixed;bottom:24px;right:24px;background:${primary};color:#fff;border:none;border-radius:50px;padding:14px 24px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:999;}
#chatWin{display:none;position:fixed;bottom:80px;right:24px;width:320px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);z-index:998;overflow:hidden;}
footer{background:#1a202c;color:#718096;padding:24px;text-align:center;font-size:13px;}
@media(max-width:700px){.hero h1{font-size:32px;}.about-grid{grid-template-columns:1fr;gap:24px;}.btn-outline{margin-left:0;margin-top:10px;display:block;}}
</style>
</head>
<body>
<nav>
  <div class="nav-brand">${biz}</div>
  <a class="nav-phone" href="tel:${phone}">${phone}</a>
</nav>
<section class="hero">
  <h1>${biz}</h1>
  <p>${mission||('Serving '+city+(state?', '+state:'')+' with pride and professionalism')}</p>
  <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:12px;">
    <a href="tel:${phone}" class="btn btn-white">📞 Call Now</a>
    <a href="#contact" class="btn btn-outline">Get a Free Quote</a>
  </div>
</section>
<div class="trust-bar">${trustBadges}</div>
<section class="about-section">
  <div class="about-grid">
    <div>
      <h2 style="font-size:32px;font-weight:800;margin-bottom:18px;">About ${biz}</h2>
      <p style="font-size:16px;line-height:1.8;color:#4a5568;">${about}</p>
      ${owner?`<p style="margin-top:16px;font-size:15px;color:#718096;font-style:italic;">— ${owner}</p>`:''}
    </div>
    <div style="background:linear-gradient(135deg,${primary}12,${primary}22);border-radius:16px;padding:32px;text-align:center;">
      <div style="font-size:56px;margin-bottom:12px;">⭐</div>
      <div style="font-size:26px;font-weight:800;color:${primary};">Trusted Local Service</div>
      <div style="color:#4a5568;margin-top:10px;font-size:15px;">Serving ${city||'our community'} and surrounding areas</div>
    </div>
  </div>
</section>
${servicesHtml}
${hoursHtml}
<section id="contact" class="contact-section">
  <div style="max-width:960px;margin:0 auto;">
    <h2 style="font-size:36px;font-weight:800;margin-bottom:12px;">Contact Us Today</h2>
    <p style="opacity:.9;font-size:18px;">Ready to get started? We'd love to hear from you.</p>
    <div class="contact-grid">
      <div class="contact-item"><div class="label">Phone</div><div class="value"><a href="tel:${phone}" style="color:#fff;">${phone}</a></div></div>
      ${email?`<div class="contact-item"><div class="label">Email</div><div class="value"><a href="mailto:${email}" style="color:#fff;">${email}</a></div></div>`:''}
      ${city?`<div class="contact-item"><div class="label">Location</div><div class="value">${city}${state?', '+state:''}</div></div>`:''}
    </div>
    <div style="margin-top:40px;">
      <a href="tel:${phone}" class="btn btn-white" style="font-size:20px;padding:18px 48px;">Call Now: ${phone}</a>
    </div>
  </div>
</section>
<footer><p>&copy; ${new Date().getFullYear()} ${biz}. All rights reserved. | Powered by <a href="https://turnkeyaiservices.com" style="color:#a0aec0;">TurnkeyAI Services</a></p></footer>
<button class="chat-fab" onclick="document.getElementById('chatWin').style.display=document.getElementById('chatWin').style.display==='none'?'block':'none'">💬 ${chatName}</button>
<div id="chatWin">
  <div style="background:${primary};color:#fff;padding:16px;font-weight:700;">Chat with ${biz}</div>
  <div style="padding:20px;font-size:14px;color:#4a5568;">
    <p>Hi! How can we help you today?</p>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
      <a href="tel:${phone}" style="background:${primary};color:#fff;padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:600;text-align:center;">📞 Call Us Now</a>
      ${email?`<a href="mailto:${email}" style="background:#f7fafc;color:${primary};padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:600;text-align:center;border:1px solid #e2e8f0;">✉️ Send Email</a>`:''}
    </div>
  </div>
</div>
</body>
</html>`;
}

async function sendEmail({ to, subject, html, replyTo = null }) {
  const msg = { to, from: { email: FROM_EMAIL, name: 'TurnkeyAI Services' }, subject, html };
  if (replyTo) msg.replyTo = replyTo;
  try { await sgMail.send(msg); console.log('[TurnkeyAI] Email sent to', to); return true; }
  catch (e) { console.error('[TurnkeyAI] SendGrid error:', e.response?.body || e.message); return false; }
}
async function notifyAdmin(subject, html) { return sendEmail({ to: ADMIN_EMAIL, subject, html }); }

app.post('/api/submission-created', async (req, res) => {
  try {
    let data = {}, formName = '';
    const body = req.body;
    if (body && body.payload) { data = body.payload.data || body.payload || {}; formName = body.payload.form_name || data['form-name'] || 'client-intake'; }
    else { data = body || {}; formName = data['form-name'] || data.form_name || 'client-intake'; }

    if (formName === 'territory-partner') {
      const name = ((data.firstName||'') + ' ' + (data.lastName||'')).trim();
      const pid = data.id || ('partner_'+Date.now());
      PARTNERS[pid] = { id:pid, name, email:data.email||'', phone:data.phone||'', territory:data.market||data.territory||'', zipCodes:data.zipCodes||'', tier:data.selectedTier||'node', status:'pending', appliedAt:new Date().toISOString() };
      await notifyAdmin('New Territory Partner: '+name,
        '<div style="font-family:Arial;max-width:600px;padding:24px;"><h2>New Territory Partner Application</h2>' +
        '<p><b>Name:</b> '+name+'</p><p><b>Email:</b> '+PARTNERS[pid].email+'</p>' +
        '<p><b>Phone:</b> '+PARTNERS[pid].phone+'</p><p><b>Territory:</b> '+PARTNERS[pid].territory+'</p>' +
        '<p><b>ZIPs:</b> '+PARTNERS[pid].zipCodes+'</p><p><b>Tier:</b> '+PARTNERS[pid].tier+'</p>' +
        '<p><a href="'+SITE_BASE_URL+'/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p></div>');
      return res.json({ handled:true, type:'territory-partner' });
    }

    if (formName !== 'client-intake') return res.json({ skipped:true, formName });

    function ue(s) { return s ? s.replace(/\\'/g,"'").replace(/\\"/g,'"') : s; }
    const businessName = ue(data.businessName || 'New Business');
    const ownerName = ue(data.ownerName || 'Client');
    const email = data.email || '';
    const phone = data.phone || '';
    const city = data.city || '';
    const state = data.state || '';
    const industry = data.industry || 'cleaning';
    const operatorRef = data.operator_ref || '';
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,30);
    const sid = data.id || ('client_'+Date.now());
    const previewName = 'preview-'+slug+'-'+Date.now().toString(36);
    const liveUrl = SITE_BASE_URL + '/site/' + slug;
    const reviewUrl = SITE_BASE_URL+'/client-review.html?site='+previewName+'&id='+sid+'&biz='+encodeURIComponent(businessName)+'&email='+encodeURIComponent(email)+'&owner='+encodeURIComponent(ownerName);

    const siteHTML = generateSiteHTML({ ...data, businessName, ownerName, phone, city, state, industry });
    PREVIEW_SITES[previewName] = siteHTML;

    SUBMISSIONS[sid] = { id:sid, businessName, ownerName, email, phone, city, state, industry, operator_ref:operatorRef, status:operatorRef?'trial':'review', previewSite:previewName, liveSlug:slug, reviewUrl, liveUrl, submittedAt:data.submittedAt||new Date().toISOString(), rawData:{ ...data, businessName, ownerName, phone, city, state, industry } };

    await notifyAdmin('NEW SUBMISSION: '+businessName,
      '<div style="font-family:Arial;max-width:600px;">' +
      '<div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:white;border-radius:12px 12px 0 0;"><h2 style="margin:0;">New Client Submission</h2></div>' +
      '<div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">' +
      '<p><b>Business:</b> '+businessName+'</p><p><b>Owner:</b> '+ownerName+'</p>' +
      '<p><b>Email:</b> '+email+'</p><p><b>Phone:</b> '+phone+'</p>' +
      '<p><b>Location:</b> '+city+(state?', '+state:'')+'</p><p><b>Industry:</b> '+industry+'</p>' +
      (operatorRef?'<p><b>Partner Ref:</b> '+operatorRef+'</p>':'') +
      '<p><a href="'+SITE_BASE_URL+'/preview/'+previewName+'" style="display:inline-block;padding:12px 24px;background:#0066FF;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:8px;">Preview Site</a>' +
      '<a href="'+SITE_BASE_URL+'/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p>' +
      '</div></div>');

    if (email) {
      await sendEmail({ to:email, subject:'Your TurnkeyAI Website is Ready to Review — '+businessName, html:
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
        '<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:40px 24px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;">Your Website is Ready!</h1></div>' +
        '<div style="padding:32px;background:white;border:1px solid #e2e8f0;">' +
        '<p>Hi '+ownerName+', your AI-powered website for <strong>'+businessName+'</strong> is ready to review.</p>' +
        '<div style="text-align:center;margin:28px 0;"><a href="'+SITE_BASE_URL+'/preview/'+previewName+'" style="display:inline-block;padding:16px 40px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:18px;">Preview Your Website</a></div>' +
        '<div style="text-align:center;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="'+reviewUrl+'&action=approve" style="display:inline-block;padding:14px 28px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✓ Approve & Go Live</a>' +
        '<a href="'+reviewUrl+'&action=edit" style="display:inline-block;padding:14px 28px;background:#6366f1;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✏ Edit My Info</a>' +
        '<a href="'+reviewUrl+'&action=changes" style="display:inline-block;padding:14px 28px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">📝 Request Changes</a>' +
        '</div>' +
        '<p style="color:#92400E;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:16px;font-size:14px;margin-top:24px;">If we do not hear from you within 72 hours, we will go ahead and make your site live.</p></div>' +
        '<div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com</div></div>'
      });
    }
    return res.json({ success:true, businessName, email, reviewUrl, previewUrl:SITE_BASE_URL+'/preview/'+previewName });
  } catch(e) { console.error('[TurnkeyAI] Submission error:', e.message); return res.status(500).json({ error:e.message }); }
});

app.post('/api/client-review-action', async (req, res) => {
  try {
    const { action, previewSite, id, email, businessName, ownerName, changeType, currentInfo, correctedInfo, additionalNotes } = req.body;
    const sub = id ? SUBMISSIONS[id] : Object.values(SUBMISSIONS).find(s=>s.previewSite===previewSite);

    if (action === 'approve') {
      if (sub) {
        sub.status = 'active';
        const liveSlug = sub.liveSlug || previewSite;
        LIVE_SITES[liveSlug] = PREVIEW_SITES[previewSite] || PREVIEW_SITES[sub.previewSite];
        sub.liveUrl = SITE_BASE_URL + '/site/' + liveSlug;
      }
      await notifyAdmin('✅ SITE WENT LIVE: '+businessName,
        '<div style="font-family:Arial;max-width:600px;padding:24px;"><h2 style="color:#10B981;">Site is Now Live!</h2>' +
        '<p><b>Business:</b> '+businessName+'</p><p><b>Email:</b> '+email+'</p>' +
        '<p><b>Live URL:</b> <a href="'+(sub?sub.liveUrl:'')+'">'+( sub?sub.liveUrl:'')+'</a></p>' +
        '<p style="background:#d1fae5;padding:12px;border-radius:8px;">The client approved and the site went live automatically. No action needed.</p></div>');
      return res.json({ success:true, action:'approve', message:'Your site is now live! Check your email for the live link.', liveUrl: sub ? sub.liveUrl : '' });
    }

    if (action === 'changes') {
      if (sub) sub.status = 'changes_requested';
      await notifyAdmin('✏️ Change Request: '+businessName,
        '<div style="font-family:Arial;max-width:600px;padding:24px;"><h2 style="color:#f59e0b;">Client Requested Changes</h2>' +
        '<p><b>Business:</b> '+businessName+'</p><p><b>Email:</b> '+email+'</p>' +
        '<p><b>What to change:</b> '+(changeType||'Not specified')+'</p>' +
        '<p><b>Current (wrong):</b> '+(currentInfo||'—')+'</p>' +
        '<p><b>Should be:</b> '+(correctedInfo||'—')+'</p>' +
        '<p><b>Notes:</b> '+(additionalNotes||'None')+'</p>' +
        '<p><a href="'+SITE_BASE_URL+'/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p></div>');
      return res.json({ success:true, action:'changes_received', message:'Your change request has been sent. We will update your site and send a new preview link within 24 hours.' });
    }

    if (action === 'resend-review') {
      const rUrl = SITE_BASE_URL+'/client-review.html?site='+previewSite+'&id='+(id||'')+'&biz='+encodeURIComponent(businessName)+'&email='+encodeURIComponent(email)+'&owner='+encodeURIComponent(ownerName||'');
      if (email) {
        await sendEmail({ to:email, subject:'Updated Preview Ready — '+businessName, html:
          '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
          '<div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px 24px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;">Updated Preview Ready</h1></div>' +
          '<div style="padding:32px;background:white;border:1px solid #e2e8f0;">' +
          '<p>Hi '+(ownerName||'there')+', your updated site is ready.</p>' +
          '<div style="text-align:center;margin:24px 0;">' +
          '<a href="'+SITE_BASE_URL+'/preview/'+previewSite+'" style="display:block;padding:14px 32px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;max-width:260px;margin:0 auto 12px;">Preview Site</a>' +
          '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
          '<a href="'+rUrl+'&action=approve" style="display:inline-block;padding:12px 24px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✓ Approve</a>' +
          '<a href="'+rUrl+'&action=edit" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✏ Edit</a>' +
          '<a href="'+rUrl+'&action=changes" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">📝 More Changes</a>' +
          '</div></div></div>' +
          '<div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com</div></div>'
        });
      }
      return res.json({ success:true, action:'review_resent' });
    }
    return res.status(400).json({ error:'Unknown action' });
  } catch(e) { console.error('[TurnkeyAI] Review action error:', e.message); return res.status(500).json({ error:e.message }); }
});

app.post('/api/partner-action', async (req, res) => {
  try {
    const { action, partner } = req.body;
    const p = PARTNERS[partner.id];
    let subject, html;
    if (action === 'approve' || action === 'modify') {
      if (p) { p.status='active'; if (partner.approvedZips) p.approvedZips=partner.approvedZips; }
      subject = 'Welcome to TurnkeyAI — You Are Approved!';
      html = '<div style="font-family:Arial;max-width:600px;padding:32px;"><h2 style="color:#10B981;">You Are Approved, '+partner.name+'!</h2>' +
        '<p><b>Territory:</b> '+partner.territory+'</p>'+(partner.approvedZips?'<p><b>Approved ZIPs:</b> '+partner.approvedZips+'</p>':'') +
        '<p><b>License Level:</b> '+partner.tier.toUpperCase()+'</p>' +
        '<p>Next steps: Pay your license fee, your site goes live within 24 hours, then start enrolling clients at $99/month — you keep 60%.</p>' +
        '<p>Questions? Call (603) 922-2004 or email airesources89@gmail.com</p>' +
        '<p>— George Dickson, TurnkeyAI Services</p></div>';
    } else {
      if (p) p.status='declined';
      subject = 'TurnkeyAI Territory Partner Application Update';
      html = '<p>Hi '+partner.name+', thank you for your interest. We have decided not to move forward at this time.<br><br>— George Dickson, TurnkeyAI Services</p>';
    }
    await sendEmail({ to:partner.email, subject, html, replyTo:ADMIN_EMAIL });
    await notifyAdmin('Partner '+action+': '+partner.name, '<p><b>'+partner.name+'</b> — Action: '+action+'<br>Territory: '+partner.territory+'<br>Email: '+partner.email+'</p>');
    return res.json({ sent:true });
  } catch(e) { console.error('[TurnkeyAI] Partner action error:', e.message); return res.status(500).json({ error:e.message }); }
});

app.listen(PORT, () => console.log('[TurnkeyAI] Backend running on port', PORT));
