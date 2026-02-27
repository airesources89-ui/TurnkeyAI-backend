require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const path = require('path');
const crypto = require('crypto');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_EMAIL = 'airesources89@gmail.com';
const FROM_EMAIL = 'noreply@turnkeyaiservices.com';
const SITE_BASE_URL = 'https://turnkeyai-backend-production.up.railway.app';
const PORT = process.env.PORT || 3000;
const MASTER_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'TurnkeyAI2024!';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const SUBMISSIONS = {};
const PARTNERS = {};
const PREVIEW_SITES = {};
const LIVE_SITES = {};
const SITE_ADMIN_CREDS = {};

app.get('/', (req, res) => res.json({ 
  status: 'TurnkeyAI Running', 
  clients: Object.keys(SUBMISSIONS).length, 
  live: Object.keys(LIVE_SITES).length,
  time: new Date().toISOString() 
}));

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key === MASTER_ADMIN_PASS) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── ADMIN DATA ───────────────────────────────────────────────────────
app.get('/api/submissions', adminAuth, (req, res) => res.json(Object.values(SUBMISSIONS).sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))));
app.get('/api/partners', adminAuth, (req, res) => res.json(Object.values(PARTNERS).sort((a,b)=>new Date(b.appliedAt)-new Date(a.appliedAt))));
app.post('/api/update-submission', adminAuth, (req, res) => {
  const { id, status, notes } = req.body;
  if (SUBMISSIONS[id]) { if (status) SUBMISSIONS[id].status=status; if (notes) SUBMISSIONS[id].notes=notes; }
  res.json({ updated: !!SUBMISSIONS[id] });
});
app.post('/api/update-partner', adminAuth, (req, res) => {
  const { id, status, approvedZips } = req.body;
  if (PARTNERS[id]) { if (status) PARTNERS[id].status=status; if (approvedZips) PARTNERS[id].approvedZips=approvedZips; }
  res.json({ updated: !!PARTNERS[id] });
});

// ── AI CHATBOT ───────────────────────────────────────────────────────
app.post('/api/chat/:siteName', async (req, res) => {
  const { message } = req.body;
  const siteName = req.params.siteName;
  const sub = Object.values(SUBMISSIONS).find(s => s.liveSlug === siteName || s.previewSite === siteName || s.previewSite === ('preview-'+siteName));
  if (!sub) return res.json({ reply: "Thanks for reaching out! Please call us for assistance." });

  const biz = sub.businessName;
  const phone = sub.phone;
  const city = sub.city;
  const industry = sub.industry || 'service';
  const rd = sub.rawData || {};
  const lc = (message||'').toLowerCase();

  // Build service list from actual submission data
  const serviceList = Object.keys(rd)
    .filter(k => k.startsWith('svc_') && (rd[k]==='on'||rd[k]===true||rd[k]==='1'||rd[k]==='true'))
    .map(k => k.replace('svc_','').replace(/_/g,' '))
    .join(', ');

  // Build hours from actual data
  const dayNames = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const openDays = dayNames.filter(d => rd['day_'+d]);
  const hoursDetail = openDays.map(d => `${d.charAt(0).toUpperCase()+d.slice(1)}: ${rd['hours_'+d]||'call for hours'}`).join(', ');

  // Payment methods
  const payMethods = ['cash','card','check','venmo','cashapp','zelle','paypal','stripe','financing']
    .filter(m => rd['pay_'+m]).map(m => m.charAt(0).toUpperCase()+m.slice(1));

  const about = rd.aboutUs || '';
  const awards = rd.awards || '';
  const mission = rd.missionStatement || '';
  const competitive = rd.competitiveAdvantage || '';
  const faq = rd.faqQuestions || '';
  const additionalServices = rd.additionalServices || '';
  const years = rd.yearsInBusiness || '';

  let reply = '';

  if (lc.match(/price|cost|how much|rate|charge|quote|estimate/)) {
    const pricedServices = Object.keys(rd)
      .filter(k => k.startsWith('price_') && rd[k])
      .map(k => `${k.replace('price_','').replace(/_/g,' ')}: ${rd[k]}`).slice(0,3).join(', ');
    if (pricedServices) {
      reply = `Here are some of our prices: ${pricedServices}. For a full quote, call ${phone} — we offer free estimates!`;
    } else {
      reply = `Pricing at ${biz} depends on the job size and scope. We offer free estimates — call ${phone} and we'll give you an exact quote right away!`;
    }
  } else if (lc.match(/hour|open|close|available|when|schedule|day/)) {
    if (hoursDetail) {
      reply = `Our hours are: ${hoursDetail}. Give us a call at ${phone} to confirm or book an appointment!`;
    } else {
      reply = `Call us at ${phone} to check our current availability — we'd love to schedule you!`;
    }
  } else if (lc.match(/address|location|where|find you|located|direction/)) {
    reply = `We're based in ${city||'your area'} and serve the surrounding region.${rd.targetRadius?' We cover a '+rd.targetRadius+' radius.':''} Call ${phone} to confirm we cover your area!`;
  } else if (lc.match(/book|schedule|appointment|reserve|come out/)) {
    reply = `Ready to book? Call ${phone} and we'll get you scheduled fast.${openDays.length?' We are open '+openDays.slice(0,3).join(', ')+(openDays.length>3?' and more':'')+'.'  :''}`;
  } else if (lc.match(/service|offer|do you|provide|specialize|what can/)) {
    if (serviceList) {
      reply = `At ${biz} we offer: ${serviceList}.${additionalServices?' Plus: '+additionalServices.substring(0,80)+'.':''} Call ${phone} to discuss what you need!`;
    } else {
      reply = `${biz} provides professional ${industry.replace(/_/g,' ')} services in ${city||'your area'}. Call ${phone} to discuss exactly what you need!`;
    }
  } else if (lc.match(/pay|payment|accept|cash|card|credit|venmo|zelle/)) {
    if (payMethods.length) {
      reply = `We accept: ${payMethods.join(', ')}. Easy and flexible! Any other questions?`;
    } else {
      reply = `We accept multiple payment methods including cash and card. Call ${phone} for details!`;
    }
  } else if (lc.match(/qualif|license|insur|certif|experience|trained|professional/)) {
    let qualReply = `${biz} is a professional ${industry.replace(/_/g,' ')} service`;
    if (years) qualReply += ` with ${years}+ years of experience`;
    if (awards) qualReply += `. ${awards}`;
    if (competitive) qualReply += `. ${competitive.substring(0,100)}`;
    qualReply += `. Call ${phone} to learn more!`;
    reply = qualReply;
  } else if (lc.match(/about|story|who are|background|owner|start/)) {
    if (about) {
      reply = about.substring(0,200) + (about.length>200?'...' : '') + ` Give us a call at ${phone}!`;
    } else {
      reply = `${biz} is a locally owned ${industry.replace(/_/g,' ')} business proudly serving ${city||'the local community'}. Call ${phone} to learn more about us!`;
    }
  } else if (lc.match(/special|best|why|better|different|unique/)) {
    if (competitive) {
      reply = competitive.substring(0,200) + (competitive.length>200?'...':'') + ` Call ${phone} to experience the difference!`;
    } else if (mission) {
      reply = mission + ` Call us at ${phone}!`;
    } else {
      reply = `${biz} stands out with reliable, professional service and a commitment to customer satisfaction. Call ${phone} to see for yourself!`;
    }
  } else if (lc.match(/hello|hi|hey|help|start|good morning|good afternoon/)) {
    reply = `Hi there! 👋 Welcome to ${biz}. ${mission||'We\'re here to help!'} Ask me about our services, hours, or pricing — or just call ${phone} for the fastest answer!`;
  } else {
    // Check FAQ data for any relevant match
    if (faq && lc.split(' ').some(word => word.length > 4 && faq.toLowerCase().includes(word))) {
      reply = `Great question! For the most accurate answer, call ${phone} — the team at ${biz} will be happy to help with exactly that.`;
    } else {
      reply = `Thanks for reaching out to ${biz}! For the fastest answer, call ${phone}. We're${openDays.length?' open '+openDays.slice(0,2).join(' and '):' available'} to help!`;
    }
  }

  res.json({ reply });
});

// ── SITE SERVING ─────────────────────────────────────────────────────
app.get('/preview/:siteName', (req, res) => {
  const html = PREVIEW_SITES[req.params.siteName];
  if (!html) return res.status(404).send(notReadyPage());
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

app.get('/site/:siteName', (req, res) => {
  const html = LIVE_SITES[req.params.siteName];
  if (!html) return res.status(404).send(notReadyPage());
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

function notReadyPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Coming Soon</title>
  <style>body{font-family:Georgia,serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .box{text-align:center;padding:60px;}.emoji{font-size:60px;margin-bottom:24px;}h1{font-size:32px;margin-bottom:12px;}
  p{color:#aaa;font-size:16px;}a{color:#00d4aa;}</style></head>
  <body><div class="box"><div class="emoji">⚙️</div>
  <h1>Site Coming Soon</h1><p>This website is being built. Check back shortly.</p>
  <p style="margin-top:16px;">Questions? Call <a href="tel:6039222004">(603) 922-2004</a></p></div></body></html>`;
}

// ── CLIENT DASHBOARD ─────────────────────────────────────────────────
// Returns prefill data so the intake form can pre-populate
app.get('/api/prefill/:slug', (req, res) => {
  const slug = req.params.slug;
  const sub = Object.values(SUBMISSIONS).find(s => s.liveSlug === slug || s.previewSite === slug);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  res.json({ 
    ok: true, 
    id: sub.id,
    businessName: sub.businessName,
    data: sub.rawData 
  });
});

// Serves the client dashboard page
app.get('/client-dashboard/:slug', (req, res) => {
  const slug = req.params.slug;
  const sub = Object.values(SUBMISSIONS).find(s => s.liveSlug === slug || s.previewSite === slug);
  if (!sub) return res.status(404).send('<h2>Dashboard not found.</h2>');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(buildClientDashboard(sub));
});

function buildClientDashboard(sub) {
  const liveUrl = sub.liveUrl || (SITE_BASE_URL + '/preview/' + sub.previewSite);
  const editUrl = SITE_BASE_URL + '/intake.html?update=true&id=' + sub.id + '&slug=' + sub.liveSlug;
  const statusLabel = { review:'Under Review', active:'Live', trial:'Trial', changes_requested:'Changes Requested' };
  const statusColor = { review:'#f59e0b', active:'#10b981', trial:'#6366f1', changes_requested:'#ef4444' };
  const st = sub.status || 'review';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>My Site Dashboard — ${sub.businessName}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'DM Sans',sans-serif;background:#f1f5f9;min-height:100vh;color:#1e293b;}
.header{background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
.header h1{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;}
.header p{font-size:14px;color:rgba(255,255,255,.65);margin-top:4px;}
.header-logo{font-size:13px;color:rgba(255,255,255,.5);}
.container{max-width:860px;margin:0 auto;padding:40px 24px;}
.status-bar{background:#fff;border-radius:16px;padding:24px 28px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;box-shadow:0 2px 8px rgba(0,0,0,.06);}
.status-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:20px;font-size:14px;font-weight:700;background:${statusColor[st]}22;color:${statusColor[st]};border:1.5px solid ${statusColor[st]}55;}
.live-link{font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;word-break:break-all;}
.live-link:hover{text-decoration:underline;}
.card{background:#fff;border-radius:16px;padding:32px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);}
.card h2{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:6px;}
.card p{font-size:14px;color:#64748b;line-height:1.6;margin-bottom:20px;}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 28px;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer;border:none;transition:all .2s;}
.btn-primary{background:#2563eb;color:#fff;}
.btn-primary:hover{background:#1d4ed8;transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,.35);}
.btn-green{background:#10b981;color:#fff;}
.btn-green:hover{background:#059669;transform:translateY(-1px);}
.btn-outline{background:transparent;color:#374151;border:2px solid #e2e8f0;}
.btn-outline:hover{border-color:#94a3b8;}
.btn-row{display:flex;gap:12px;flex-wrap:wrap;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.info-item label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;}
.info-item p{font-size:15px;font-weight:600;color:#1e293b;margin-top:4px;}
.divider{border:none;border-top:1px solid #f1f5f9;margin:20px 0;}
.alert{border-radius:10px;padding:16px 20px;font-size:14px;line-height:1.6;margin-bottom:20px;}
.alert-blue{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;}
@media(max-width:540px){.info-grid{grid-template-columns:1fr;}.btn-row{flex-direction:column;}}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>${sub.businessName}</h1>
    <p>Client Dashboard · ${sub.ownerName}</p>
  </div>
  <div class="header-logo">Powered by TurnkeyAI</div>
</div>

<div class="container">

  <div class="status-bar">
    <div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:8px;">Site Status</div>
      <span class="status-badge">${st === 'active' ? '🟢' : '🟡'} ${statusLabel[st] || st}</span>
    </div>
    ${sub.liveUrl ? `<div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:8px;">Your Live URL</div>
      <a href="${sub.liveUrl}" target="_blank" class="live-link">🔗 ${sub.liveUrl}</a></div>` : 
      `<div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:8px;">Preview URL</div>
      <a href="${SITE_BASE_URL}/preview/${sub.previewSite}" target="_blank" class="live-link">👀 View Preview</a></div>`}
  </div>

  <!-- MAIN ACTION: EDIT SITE -->
  <div class="card">
    <h2>✏️ Update My Website Info</h2>
    <p>Need to change your phone number, hours, services, or anything else on your site? Click below — your current info is already filled in. Just make your changes and hit submit. Your site rebuilds automatically.</p>
    <div class="btn-row">
      <a href="${editUrl}" class="btn btn-primary">✏️ Edit My Site Info</a>
      ${sub.liveUrl ? `<a href="${sub.liveUrl}" target="_blank" class="btn btn-outline">🔗 View My Live Site</a>` : `<a href="${SITE_BASE_URL}/preview/${sub.previewSite}" target="_blank" class="btn btn-outline">👀 View Preview</a>`}
    </div>
  </div>

  <!-- CURRENT INFO SUMMARY -->
  <div class="card">
    <h2>📋 Your Current Info</h2>
    <p style="margin-bottom:16px;">This is what's currently on your website.</p>
    <div class="info-grid">
      <div class="info-item"><label>Business Name</label><p>${sub.businessName}</p></div>
      <div class="info-item"><label>Owner</label><p>${sub.ownerName}</p></div>
      <div class="info-item"><label>Phone</label><p>${sub.phone}</p></div>
      <div class="info-item"><label>Email</label><p>${sub.email}</p></div>
      <div class="info-item"><label>City</label><p>${sub.city}${sub.state ? ', ' + sub.state : ''}</p></div>
      <div class="info-item"><label>Industry</label><p style="text-transform:capitalize;">${(sub.industry||'').replace(/_/g,' ')}</p></div>
    </div>
  </div>

  <!-- NEED SOMETHING BIGGER -->
  <div class="card">
    <h2>🛠️ Need Something Beyond a Quick Edit?</h2>
    <p>If you want a design change, a new page, or anything our edit form doesn't cover, send us a message and we'll handle it.</p>
    <div id="request-form" style="display:none;margin-top:4px;">
      <textarea id="request-text" rows="4" style="width:100%;padding:12px 16px;border:1.5px solid #e2e8f0;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;resize:vertical;outline:none;" placeholder="Describe what you'd like changed or added..."></textarea>
      <div style="margin-top:12px;display:flex;gap:10px;">
        <button class="btn btn-green" onclick="sendRequest()">Send Request</button>
        <button class="btn btn-outline" onclick="document.getElementById('request-form').style.display='none'">Cancel</button>
      </div>
      <div id="request-sent" style="display:none;color:#10b981;font-weight:600;margin-top:12px;">✅ Request sent! We'll be in touch within 24 hours.</div>
    </div>
    <button class="btn btn-outline" id="request-toggle" onclick="document.getElementById('request-form').style.display='block';this.style.display='none';">📝 Send a Request</button>
  </div>

  <div class="alert alert-blue">
    💡 <strong>Tip:</strong> After editing your info, allow up to 5 minutes for your live site to update. Questions? Call us at (603) 922-2004.
  </div>

</div>

<script>
async function sendRequest() {
  const text = document.getElementById('request-text').value.trim();
  if (!text) return;
  try {
    await fetch('${SITE_BASE_URL}/api/client-change-request', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        businessName: '${sub.businessName.replace(/'/g,"\\'")}',
        email: '${sub.email.replace(/'/g,"\\'")}',
        id: '${sub.id}',
        request: text
      })
    });
  } catch(e) {}
  document.getElementById('request-sent').style.display = 'block';
  document.getElementById('request-text').disabled = true;
  document.querySelector('#request-form .btn-green').style.display = 'none';
}
</script>
</body>
</html>`;
}

// ── CLIENT CHANGE REQUEST (from dashboard "bigger request" form) ──────
app.post('/api/client-change-request', async (req, res) => {
  const { businessName, email, id, request } = req.body;
  await notifyAdmin('🛠️ Client Change Request: ' + businessName,
    `<div style="font-family:Arial;max-width:600px;padding:24px;">
    <h2 style="color:#d97706;">Change Request — ${businessName}</h2>
    <p><b>Client:</b> ${businessName} (${email})</p>
    <p><b>Submission ID:</b> ${id}</p>
    <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;">
    <p><b>What they want:</b></p>
    <p style="background:#f8fafc;padding:16px;border-radius:8px;margin-top:8px;">${request}</p>
    <p style="margin-top:16px;"><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Open Admin Dashboard</a></p>
    </div>`);
  res.json({ ok: true });
});

// ── CLIENT SELF-SERVICE UPDATE (called when intake form submits with ?update=true) ──
app.post('/api/client-update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    const sub = SUBMISSIONS[id];
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    
    // Merge updates into existing data
    Object.assign(sub.rawData, updates);
    if (updates.businessName) sub.businessName = updates.businessName;
    if (updates.phone) sub.phone = updates.phone;
    if (updates.ownerName) sub.ownerName = updates.ownerName;
    if (updates.city) sub.city = updates.city;
    if (updates.state) sub.state = updates.state;
    
    // Rebuild the site
    const newHTML = generateSiteHTML(sub.rawData, sub.liveSlug);
    PREVIEW_SITES[sub.previewSite] = newHTML;
    
    // If it was already live, update the live site too
    if (sub.status === 'active' && sub.liveSlug) {
      LIVE_SITES[sub.liveSlug] = newHTML;
    }
    
    sub.status = sub.status === 'active' ? 'active' : 'review';
    
    // Notify George
    await notifyAdmin('✏️ Client Self-Updated: ' + sub.businessName,
      `<div style="font-family:Arial;max-width:600px;padding:24px;">
      <h2 style="color:#2563eb;">Self-Service Update — ${sub.businessName}</h2>
      <p><b>Owner:</b> ${sub.ownerName} · ${sub.email}</p>
      <p><b>Status:</b> ${sub.status === 'active' ? '✅ Site updated live automatically' : '🔄 Updated preview — review and approve'}</p>
      ${sub.status === 'active' ? `<p><b>Live URL:</b> <a href="${sub.liveUrl}">${sub.liveUrl}</a></p>` : `<p><b>Preview:</b> <a href="${SITE_BASE_URL}/preview/${sub.previewSite}">${SITE_BASE_URL}/preview/${sub.previewSite}</a></p>`}
      <p style="margin-top:16px;"><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p>
      </div>`);
    
    // Confirm to client
    if (sub.email) {
      const dashUrl = SITE_BASE_URL + '/client-dashboard/' + sub.liveSlug;
      await sendEmail({ 
        to: sub.email, 
        subject: sub.status === 'active' ? '✅ Your site has been updated — ' + sub.businessName : '👀 Updated preview ready — ' + sub.businessName,
        html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;">Site Updated!</h1></div>
          <div style="padding:28px;background:white;border:1px solid #e2e8f0;">
            <p style="font-size:16px;">Hi ${sub.ownerName}, your changes have been ${sub.status === 'active' ? 'applied to your live site' : 'saved and are under review'}.</p>
            ${sub.status === 'active' ? `<div style="text-align:center;margin:24px 0;">
              <a href="${sub.liveUrl}" style="display:inline-block;padding:14px 32px;background:#10b981;color:white;border-radius:10px;text-decoration:none;font-weight:700;">🔗 View Your Live Site</a>
            </div>` : ''}
            <div style="text-align:center;margin-top:16px;">
              <a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;font-weight:700;">📊 Back to My Dashboard</a>
            </div>
          </div>
          <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">
            TurnkeyAI Services · (603) 922-2004 · airesources89@gmail.com</div>
        </div>`
      });
    }
    
    return res.json({ 
      success: true, 
      liveUpdated: sub.status === 'active',
      previewUrl: SITE_BASE_URL + '/preview/' + sub.previewSite,
      liveUrl: sub.liveUrl || '',
      dashboardUrl: SITE_BASE_URL + '/client-dashboard/' + sub.liveSlug
    });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── REVIEW ACTION ────────────────────────────────────────────────────
app.post('/api/client-review-action', async (req, res) => {
  try {
    const { action, previewSite, id, email, businessName, ownerName, changeType, currentInfo, correctedInfo, additionalNotes } = req.body;
    const sub = id ? SUBMISSIONS[id] : Object.values(SUBMISSIONS).find(s => s.previewSite === previewSite);

    if (action === 'approve') {
      if (sub) {
        sub.status = 'active';
        const slug = sub.liveSlug;
        LIVE_SITES[slug] = PREVIEW_SITES[sub.previewSite];
        sub.liveUrl = SITE_BASE_URL + '/site/' + slug;
        const dashUrl = SITE_BASE_URL + '/client-dashboard/' + slug;
        if (sub.email) {
          await sendEmail({ to: sub.email, subject: '🚀 Your Website is Live! — ' + sub.businessName, html: liveEmail(sub, dashUrl) });
        }
        await notifyAdmin('🚀 SITE WENT LIVE: ' + sub.businessName,
          `<div style="font-family:Arial;max-width:600px;padding:24px;background:#f0fdf4;border-radius:12px;">
          <h2 style="color:#16a34a;">✅ ${sub.businessName} is Live!</h2>
          <p><b>Owner:</b> ${sub.ownerName} | ${sub.email}</p>
          <p><b>Live URL:</b> <a href="${sub.liveUrl}">${sub.liveUrl}</a></p>
          <p><b>Dashboard:</b> <a href="${dashUrl}">${dashUrl}</a></p>
          <div style="background:#fff;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-top:16px;">
            <p style="font-size:14px;font-weight:700;color:#166534;margin-bottom:8px;">Your Admin Dashboard</p>
            <p style="font-size:13px;"><b>URL:</b> <a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html">${SITE_BASE_URL}/turnkeyai-admin-v3.html</a></p>
            <p style="font-size:13px;"><b>Password:</b> <span style="font-family:monospace;background:#f0fdf4;padding:2px 8px;border-radius:4px;border:1px solid #bbf7d0;">${MASTER_ADMIN_PASS}</span></p>
          </div></div>`);
      }
      return res.json({ success: true, action: 'approve', liveUrl: sub ? sub.liveUrl : '' });
    }

    if (action === 'changes') {
      if (sub) sub.status = 'changes_requested';
      await notifyAdmin('✏️ Change Request: ' + businessName,
        `<div style="font-family:Arial;max-width:600px;padding:24px;">
        <h2 style="color:#d97706;">Change Request — ${businessName}</h2>
        <p><b>What to change:</b> ${changeType||'Not specified'}</p>
        <p><b>Current (wrong):</b> ${currentInfo||'—'}</p>
        <p><b>Should be:</b> ${correctedInfo||'—'}</p>
        <p><b>Notes:</b> ${additionalNotes||'None'}</p>
        <p><b>Email:</b> ${email}</p>
        <p><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p></div>`);
      return res.json({ success: true, action: 'changes_received' });
    }

    if (action === 'resend-review') {
      if (sub && sub.email) {
        const rUrl = buildReviewUrl(sub);
        await sendEmail({ to: sub.email, subject: 'Updated Preview Ready — ' + sub.businessName, html: reviewEmail(sub, rUrl, true) });
      }
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── PARTNER ACTION ───────────────────────────────────────────────────
app.post('/api/partner-action', async (req, res) => {
  try {
    const { action, partner } = req.body;
    const p = PARTNERS[partner.id];
    let subject, html;
    if (action === 'approve' || action === 'modify') {
      if (p) { p.status='active'; if (partner.approvedZips) p.approvedZips=partner.approvedZips; }
      subject = 'Welcome to TurnkeyAI — You Are Approved!';
      html = `<div style="font-family:Arial;max-width:600px;padding:32px;">
        <h2 style="color:#10B981;">You Are Approved, ${partner.name}!</h2>
        <p><b>Territory:</b> ${partner.territory}</p>
        ${partner.approvedZips?`<p><b>Approved ZIPs:</b> ${partner.approvedZips}</p>`:''}
        <p><b>License Level:</b> ${(partner.tier||'node').toUpperCase()}</p>
        <p>Next steps: Pay your license fee, your site goes live within 24 hours, then start enrolling clients at $99/month — you keep 60%.</p>
        <p>Questions? Call (603) 922-2004</p><p>— George Dickson, TurnkeyAI Services</p></div>`;
    } else {
      if (p) p.status='declined';
      subject = 'TurnkeyAI Territory Partner Application Update';
      html = `<p>Hi ${partner.name}, thank you for your interest. We have decided not to move forward at this time.<br><br>— George Dickson, TurnkeyAI Services</p>`;
    }
    await sendEmail({ to: partner.email, subject, html, replyTo: ADMIN_EMAIL });
    await notifyAdmin('Partner '+action+': '+partner.name, `<p><b>${partner.name}</b> — ${action} | ${partner.territory}</p>`);
    return res.json({ sent: true });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── INTAKE FORM ──────────────────────────────────────────────────────
app.post('/api/submission-created', async (req, res) => {
  try {
    let data = {}, formName = '';
    const body = req.body;
    if (body && body.payload) { data = body.payload.data || body.payload || {}; formName = body.payload.form_name || data['form-name'] || 'client-intake'; }
    else { data = body || {}; formName = data['form-name'] || data.form_name || 'client-intake'; }

    if (formName === 'territory-partner') {
      const name = ((data.firstName||'')+ ' '+(data.lastName||'')).trim();
      const pid = data.id || ('partner_'+Date.now());
      PARTNERS[pid] = { id:pid, name, email:data.email||'', phone:data.phone||'', territory:data.market||data.territory||'', zipCodes:data.zipCodes||'', tier:data.selectedTier||'node', status:'pending', appliedAt:new Date().toISOString() };
      await notifyAdmin('New Territory Partner: '+name,
        `<div style="font-family:Arial;max-width:600px;padding:24px;"><h2>New Territory Partner</h2>
        <p><b>Name:</b> ${name}</p><p><b>Email:</b> ${data.email||''}</p>
        <p><b>Territory:</b> ${data.market||data.territory||''}</p><p><b>ZIPs:</b> ${data.zipCodes||''}</p>
        <p><b>Tier:</b> ${data.selectedTier||'node'}</p>
        <p><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p></div>`);
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

    const fullData = { ...data, businessName, ownerName, phone, city, state, industry };
    const siteHTML = generateSiteHTML(fullData, previewName);
    PREVIEW_SITES[previewName] = siteHTML;

    SUBMISSIONS[sid] = {
      id:sid, businessName, ownerName, email, phone, city, state, industry,
      operator_ref: operatorRef,
      status: operatorRef ? 'trial' : 'review',
      previewSite: previewName,
      liveSlug: slug,
      liveUrl: '',
      submittedAt: data.submittedAt || new Date().toISOString(),
      rawData: fullData
    };

    const reviewUrl = buildReviewUrl(SUBMISSIONS[sid]);
    SUBMISSIONS[sid].reviewUrl = reviewUrl;

    await notifyAdmin('NEW SUBMISSION: '+businessName,
      `<div style="font-family:Arial;max-width:600px;">
      <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:white;border-radius:12px 12px 0 0;"><h2 style="margin:0;">New Client: ${businessName}</h2></div>
      <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
      <p><b>Owner:</b> ${ownerName}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone}</p>
      <p><b>Location:</b> ${city}${state?', '+state:''}</p><p><b>Industry:</b> ${industry}</p>
      ${operatorRef?`<p><b>Partner Ref:</b> ${operatorRef}</p>`:''}
      <p><a href="${SITE_BASE_URL}/preview/${previewName}" style="display:inline-block;padding:12px 24px;background:#0066FF;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:8px;">Preview Site</a>
      <a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Admin Dashboard</a></p>
      <div style="background:#eff6ff;border:2px solid #2563eb;border-radius:8px;padding:16px;margin-top:16px;">
        <p style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 8px;">🔐 Your Admin Access</p>
        <p style="font-size:13px;margin:0 0 4px;"><b>URL:</b> <a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html">${SITE_BASE_URL}/turnkeyai-admin-v3.html</a></p>
        <p style="font-size:13px;margin:0;"><b>Password:</b> <span style="font-family:monospace;background:#dbeafe;padding:2px 8px;border-radius:4px;">${MASTER_ADMIN_PASS}</span></p>
      </div>
      </div></div>`);

    if (email) {
      await sendEmail({ to: email, subject: 'Your TurnkeyAI Website is Ready to Review — '+businessName, html: reviewEmail(SUBMISSIONS[sid], reviewUrl, false) });
    }
    return res.json({ success:true, businessName, email, reviewUrl, previewUrl: SITE_BASE_URL+'/preview/'+previewName });
  } catch(e) { console.error(e.message); return res.status(500).json({ error: e.message }); }
});

// ── HELPERS ──────────────────────────────────────────────────────────
function buildReviewUrl(sub) {
  return `${SITE_BASE_URL}/client-review.html?site=${sub.previewSite}&id=${sub.id}&biz=${encodeURIComponent(sub.businessName)}&email=${encodeURIComponent(sub.email)}&owner=${encodeURIComponent(sub.ownerName)}`;
}

function reviewEmail(sub, reviewUrl, isUpdate) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:40px 24px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="color:white;margin:0;font-size:28px;">${isUpdate ? 'Updated Preview Ready!' : 'Your Website is Ready!'}</h1></div>
    <div style="padding:32px;background:white;border:1px solid #e2e8f0;">
      <p style="font-size:16px;">Hi ${sub.ownerName}, your AI-powered website for <strong>${sub.businessName}</strong> is ready to review.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${reviewUrl}" style="display:inline-block;padding:16px 40px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:18px;">👀 Preview &amp; Review Your Website</a>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <a href="${reviewUrl}&action=approve" style="display:inline-block;padding:14px 28px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✓ Approve &amp; Go Live</a>
        <a href="${reviewUrl}&action=edit" style="display:inline-block;padding:14px 28px;background:#6366f1;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✏ Edit My Info</a>
        <a href="${reviewUrl}&action=changes" style="display:inline-block;padding:14px 28px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">📝 Request Changes</a>
      </div>
      <p style="color:#92400E;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:16px;font-size:14px;margin-top:24px;">
        If we do not hear from you within 72 hours, we will go ahead and make your site live.</p>
    </div>
    <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">
      TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com</div></div>`;
}

function liveEmail(sub, dashUrl) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#10B981,#059669);padding:40px 24px;text-align:center;border-radius:12px 12px 0 0;">
      <div style="font-size:48px;margin-bottom:8px;">🚀</div>
      <h1 style="color:white;margin:0;font-size:32px;">You're Live!</h1>
      <p style="color:rgba(255,255,255,.85);margin-top:8px;font-size:16px;">${sub.businessName} is now on the internet</p></div>
    <div style="padding:32px;background:white;border:1px solid #e2e8f0;">
      <p style="font-size:16px;">Congratulations, ${sub.ownerName}! Your website is now live and ready for customers to find.</p>
      <div style="background:#f0fdf4;border:2px solid #10B981;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
        <p style="font-size:13px;color:#166534;font-weight:600;margin-bottom:8px;">YOUR LIVE WEBSITE</p>
        <a href="${sub.liveUrl}" style="font-size:20px;color:#059669;font-weight:700;word-break:break-all;">${sub.liveUrl}</a>
        <p style="font-size:12px;color:#6b7280;margin-top:8px;">Share this link on Facebook, Google Business, your email signature</p>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:8px;">📊 Your Client Dashboard</p>
        <p style="font-size:13px;color:#374151;margin-bottom:14px;">Update your hours, phone, services, or anything else — anytime, no password needed.</p>
        <a href="${dashUrl}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">📊 Go to My Dashboard</a>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;font-size:14px;color:#374151;line-height:2;">
        <p style="font-weight:700;margin-bottom:8px;">Next steps:</p>
        <p>• Share your website on Facebook, Instagram, and Google Business</p>
        <p>• Add the link to your email signature and business cards</p>
        <p>• Call us anytime at (603) 922-2004 for help</p>
      </div>
    </div>
    <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">
      TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com</div></div>`;
}

// ── SITE GENERATOR ───────────────────────────────────────────────────
function generateSiteHTML(data, siteName) {
  const biz = data.businessName || 'Your Business';
  const owner = data.ownerName || '';
  const phone = data.phone || '(555) 000-0000';
  const emailAddr = data.email || '';
  const city = data.city || '';
  const state = data.state || '';
  const about = data.aboutUs || ('Welcome to ' + biz + '. We are proud to serve ' + (city||'our community') + ' and the surrounding area with professional, reliable service.');
  // Build a real mission from the data — don't fall back to "Your local experts in restaurant"
  const industryLabel = (data.industry||'service').replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
  const mission = data.missionStatement || data.competitiveAdvantage || ('Serving ' + (city||'our community') + ' with professional ' + industryLabel + ' services. Call for a free estimate.');
  const industry = data.industry || 'cleaning';
  const chatName = data.chatName || 'Chat With Us';
  const awards = data.awards || '';
  const years = data.yearsInBusiness || '';
  // Logo: use submitted base64 data if present
  const logoData = data.logoData || '';
  const logoHTML = logoData
    ? `<img src="${logoData}" alt="${biz} logo" style="max-height:44px;max-width:160px;object-fit:contain;vertical-align:middle;">`
    : `<span class="nav-brand-text">${biz}</span>`;
  // Hero logo display
  const heroLogoHTML = logoData
    ? `<img src="${logoData}" alt="${biz} logo" style="max-height:80px;max-width:240px;object-fit:contain;margin-bottom:20px;filter:drop-shadow(0 2px 12px rgba(0,0,0,.3));">`
    : '';
  // Dashboard slug for footer link
  const liveSlug = siteName ? siteName.replace(/^preview-/,'').replace(/-[a-z0-9]{6,}$/,'') : '';

  const services = [];
  for (const key of Object.keys(data)) {
    if (key.startsWith('svc_') && (data[key]==='on'||data[key]===true||data[key]==='1'||data[key]==='true')) {
      const n = key.replace('svc_','').replace(/_/g,' ');
      services.push({ name: n, price: data['price_'+key.replace('svc_','')] || '' });
    }
  }

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const openDays = days.filter(d => data['day_'+d]);
  const hoursRows = openDays.map(d =>
    `<div class="hour-row"><span class="day">${d.charAt(0).toUpperCase()+d.slice(1)}</span><span class="time">${data['hours_'+d]||'Call for hours'}</span></div>`
  ).join('');

  const payMethods = ['cash','card','check','venmo','cashapp','zelle','paypal','stripe','financing']
    .filter(m => data['pay_'+m]).map(m => m.charAt(0).toUpperCase()+m.slice(1));

  const industryColors = {
    cleaning: { primary: '#1e40af', accent: '#3b82f6', bg: '#eff6ff' },
    restaurant: { primary: '#991b1b', accent: '#ef4444', bg: '#fef2f2' },
    plumbing: { primary: '#1e3a5f', accent: '#2563eb', bg: '#eff6ff' },
    electrical: { primary: '#78350f', accent: '#f59e0b', bg: '#fffbeb' },
    hvac: { primary: '#134e4a', accent: '#14b8a6', bg: '#f0fdfa' },
    landscaping: { primary: '#14532d', accent: '#22c55e', bg: '#f0fdf4' },
    auto_detailing: { primary: '#3b0764', accent: '#a855f7', bg: '#faf5ff' },
    auto_repair: { primary: '#27272a', accent: '#f59e0b', bg: '#fafafa' },
    fitness: { primary: '#7f1d1d', accent: '#ef4444', bg: '#fef2f2' },
    salon: { primary: '#701a75', accent: '#e879f9', bg: '#fdf4ff' },
    pet_services: { primary: '#4c1d95', accent: '#8b5cf6', bg: '#f5f3ff' },
    pressure_washing: { primary: '#1e3a8a', accent: '#60a5fa', bg: '#eff6ff' },
    roofing: { primary: '#422006', accent: '#f97316', bg: '#fff7ed' },
    default: { primary: '#1e293b', accent: '#0066FF', bg: '#f8fafc' }
  };
  const c = industryColors[industry] || industryColors.default;
  const chatEndpoint = SITE_BASE_URL + '/api/chat/' + (siteName || 'site');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${biz}${city?' — '+city:''}${state?', '+state:''}</title>
<meta name="description" content="${about.substring(0,155).replace(/"/g,'&quot;')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--primary:${c.primary};--accent:${c.accent};--bg:${c.bg};}
*{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{font-family:'DM Sans',sans-serif;color:#1a202c;background:#fff;overflow-x:hidden;}
nav{position:sticky;top:0;z-index:100;background:rgba(255,255,255,.97);backdrop-filter:blur(12px);border-bottom:1px solid rgba(0,0,0,.08);padding:0 32px;}
.nav-inner{max-width:1100px;margin:0 auto;height:68px;display:flex;justify-content:space-between;align-items:center;}
.nav-brand{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--primary);text-decoration:none;}
.nav-links{display:flex;gap:28px;align-items:center;}
.nav-links a{font-size:14px;font-weight:600;color:#374151;text-decoration:none;transition:color .2s;}
.nav-links a:hover{color:var(--accent);}
.nav-cta{background:var(--primary);color:#fff !important;padding:10px 22px;border-radius:8px;font-weight:700 !important;}
.nav-cta:hover{background:var(--accent) !important;color:#fff !important;}
@media(max-width:600px){.nav-links{display:none;}}
.hero{position:relative;min-height:88vh;display:flex;align-items:center;overflow:hidden;background:var(--primary);}
.hero-bg{position:absolute;inset:0;background:linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, black) 100%);opacity:.97;}
.hero-pattern{position:absolute;inset:0;background-image:radial-gradient(circle at 20% 50%, var(--accent) 0, transparent 45%), radial-gradient(circle at 80% 20%, rgba(255,255,255,.08) 0, transparent 40%);pointer-events:none;}
.hero-content{position:relative;z-index:2;max-width:1100px;margin:0 auto;padding:80px 32px;}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.9);font-size:13px;font-weight:600;padding:6px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.2);margin-bottom:24px;letter-spacing:.5px;}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(42px,6vw,80px);font-weight:800;color:#fff;line-height:1.05;margin-bottom:20px;max-width:780px;}
.hero p{font-size:clamp(16px,2vw,20px);color:rgba(255,255,255,.8);max-width:560px;line-height:1.7;margin-bottom:40px;}
.hero-actions{display:flex;gap:14px;flex-wrap:wrap;}
.btn-hero-primary{display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:#fff;color:var(--primary);border-radius:10px;font-size:16px;font-weight:700;text-decoration:none;transition:all .2s;box-shadow:0 4px 20px rgba(0,0,0,.2);}
.btn-hero-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3);}
.btn-hero-secondary{display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:transparent;color:#fff;border:2px solid rgba(255,255,255,.4);border-radius:10px;font-size:16px;font-weight:600;text-decoration:none;transition:all .2s;}
.btn-hero-secondary:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.7);}
.hero-stats{display:flex;gap:40px;margin-top:56px;padding-top:40px;border-top:1px solid rgba(255,255,255,.15);}
.stat-item{color:#fff;}
.stat-num{font-family:'Playfair Display',serif;font-size:36px;font-weight:700;color:#fff;}
.stat-label{font-size:13px;color:rgba(255,255,255,.65);margin-top:2px;}
.trust-bar{background:var(--bg);border-bottom:1px solid rgba(0,0,0,.06);padding:20px 32px;}
.trust-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:40px;flex-wrap:wrap;}
.trust-item{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:#374151;}
.trust-icon{font-size:20px;}
.section{padding:96px 32px;}
.container{max-width:1100px;margin:0 auto;}
.section-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--accent);margin-bottom:12px;}
.section-title{font-family:'Playfair Display',serif;font-size:clamp(28px,4vw,44px);font-weight:700;color:#1a202c;line-height:1.2;margin-bottom:20px;}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}
.about-text{font-size:17px;line-height:1.85;color:#4a5568;}
.about-owner{margin-top:20px;display:flex;align-items:center;gap:14px;padding:16px 20px;background:var(--bg);border-radius:12px;}
.owner-avatar{width:48px;height:48px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;}
.about-card{background:var(--primary);border-radius:20px;padding:40px;color:#fff;}
.about-card-num{font-family:'Playfair Display',serif;font-size:56px;font-weight:700;color:var(--accent);line-height:1;}
.about-card-label{font-size:15px;color:rgba(255,255,255,.75);margin-top:6px;}
.about-features{margin-top:32px;display:grid;gap:14px;}
.feature-row{display:flex;align-items:flex-start;gap:12px;}
.feature-check{width:24px;height:24px;background:rgba(255,255,255,.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;margin-top:1px;}
.services-section{background:var(--bg);padding:96px 32px;}
.services-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px;margin-top:48px;}
.service-card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06);transition:all .2s;border:1px solid rgba(0,0,0,.04);}
.service-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.1);}
.service-icon{width:48px;height:48px;background:var(--bg);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px;}
.service-name{font-size:16px;font-weight:700;color:#1a202c;text-transform:capitalize;margin-bottom:6px;}
.service-price{font-size:15px;font-weight:700;color:var(--accent);}
.hours-section{padding:96px 32px;}
.hours-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start;margin-top:48px;}
.hours-list{background:var(--bg);border-radius:16px;padding:28px;}
.hour-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(0,0,0,.06);}
.hour-row:last-child{border-bottom:none;}
.day{font-size:15px;font-weight:600;color:#374151;}
.time{font-size:15px;color:#6b7280;font-weight:500;}
.pay-box{background:var(--primary);color:#fff;border-radius:16px;padding:28px;}
.pay-title{font-size:15px;font-weight:700;margin-bottom:16px;color:rgba(255,255,255,.8);}
.pay-methods{display:flex;flex-wrap:wrap;gap:8px;}
.pay-badge{background:rgba(255,255,255,.15);color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;}
.contact-section{background:var(--primary);padding:96px 32px;}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}
.contact-title{font-family:'Playfair Display',serif;font-size:clamp(32px,4vw,52px);font-weight:700;color:#fff;line-height:1.15;margin-bottom:20px;}
.contact-sub{font-size:17px;color:rgba(255,255,255,.75);margin-bottom:40px;line-height:1.7;}
.contact-items{display:grid;gap:20px;}
.contact-item{display:flex;align-items:center;gap:16px;}
.contact-icon{width:48px;height:48px;background:rgba(255,255,255,.12);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;}
.contact-label{font-size:12px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.8px;font-weight:600;}
.contact-value{font-size:17px;color:#fff;font-weight:600;margin-top:2px;}
.contact-value a{color:#fff;text-decoration:none;}
.contact-cta{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:40px;}
.big-phone{font-family:'Playfair Display',serif;font-size:clamp(24px,3vw,38px);font-weight:700;color:#fff;margin:16px 0;}
.btn-call{display:inline-flex;align-items:center;gap:10px;padding:18px 40px;background:#fff;color:var(--primary);border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;transition:all .2s;margin-top:8px;}
.btn-call:hover{transform:translateY(-2px);}
footer{background:#0f172a;color:#94a3b8;padding:40px 32px;text-align:center;}
footer a{color:#64748b;text-decoration:none;}
.chat-fab{position:fixed;bottom:28px;right:28px;width:60px;height:60px;background:var(--accent);color:#fff;border:none;border-radius:50%;font-size:26px;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.25);z-index:1000;transition:all .2s;display:flex;align-items:center;justify-content:center;}
.chat-fab:hover{transform:scale(1.08);}
.chat-panel{display:none;position:fixed;bottom:100px;right:28px;width:340px;background:#fff;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,.18);z-index:999;overflow:hidden;flex-direction:column;}
.chat-panel.open{display:flex;}
.chat-header{background:var(--primary);color:#fff;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;}
.chat-header-title{font-size:15px;font-weight:700;}
.chat-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0;opacity:.7;}
.chat-close:hover{opacity:1;}
.chat-messages{flex:1;padding:16px;overflow-y:auto;min-height:200px;max-height:320px;display:flex;flex-direction:column;gap:10px;}
.chat-msg{max-width:82%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.5;}
.chat-msg.bot{background:var(--bg);color:#374151;border-bottom-left-radius:4px;align-self:flex-start;}
.chat-msg.user{background:var(--primary);color:#fff;border-bottom-right-radius:4px;align-self:flex-end;}
.chat-msg.typing{color:#9ca3af;font-style:italic;}
.chat-input-row{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #f1f5f9;}
.chat-input{flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:inherit;outline:none;}
.chat-input:focus{border-color:var(--accent);}
.chat-send{background:var(--accent);color:#fff;border:none;border-radius:10px;width:40px;height:40px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.chat-send:hover{opacity:.85;}
.chat-quick{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px;}
.chat-quick button{background:var(--bg);color:var(--primary);border:1px solid rgba(0,0,0,.1);border-radius:20px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;}
.chat-quick button:hover{background:var(--primary);color:#fff;}
@media(max-width:768px){.about-grid,.hours-grid,.contact-grid,.hero-stats{grid-template-columns:1fr;}.hero-stats{gap:24px;}.section,.services-section,.hours-section,.contact-section{padding:64px 20px;}nav{padding:0 20px;}}
</style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="#" class="nav-brand">${logoHTML}</a>
    <div class="nav-links">
      ${services.length?'<a href="#services">Services</a>':''}
      <a href="#about">About</a>
      ${hoursRows?'<a href="#hours">Hours</a>':''}
      <a href="#contact" class="nav-cta">📞 ${phone}</a>
    </div>
  </div>
</nav>
<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-pattern"></div>
  <div class="hero-content">
    ${heroLogoHTML}
    <div class="hero-badge">📍 ${city}${state?', '+state:''} &nbsp;•&nbsp; ${industryLabel}</div>
    <h1>${biz}</h1>
    <p>${mission}</p>
    <div class="hero-actions">
      <a href="tel:${phone}" class="btn-hero-primary">📞 Call Now — Free Estimate</a>
      <a href="#contact" class="btn-hero-secondary">Learn More</a>
    </div>
    ${(years||awards)?`<div class="hero-stats">
      ${years?`<div class="stat-item"><div class="stat-num">${years}+</div><div class="stat-label">Years in Business</div></div>`:''}
      <div class="stat-item"><div class="stat-num">5★</div><div class="stat-label">Customer Rating</div></div>
      ${awards?`<div class="stat-item"><div class="stat-num">🏆</div><div class="stat-label">${awards.substring(0,30)}</div></div>`:`<div class="stat-item"><div class="stat-num">100%</div><div class="stat-label">Satisfaction Guarantee</div></div>`}
    </div>`:'<div class="hero-stats"><div class="stat-item"><div class="stat-num">5★</div><div class="stat-label">Customer Rating</div></div><div class="stat-item"><div class="stat-num">100%</div><div class="stat-label">Satisfaction Guarantee</div></div><div class="stat-item"><div class="stat-num">Free</div><div class="stat-label">Estimates</div></div></div>'}
  </div>
</section>
<div class="trust-bar">
  <div class="trust-inner">
    <div class="trust-item"><span class="trust-icon">✅</span> Licensed &amp; Insured</div>
    <div class="trust-item"><span class="trust-icon">⚡</span> Fast Response</div>
    <div class="trust-item"><span class="trust-icon">💰</span> Free Estimates</div>
    ${awards?`<div class="trust-item"><span class="trust-icon">🏆</span> ${awards}</div>`:''}
    ${payMethods.length?`<div class="trust-item"><span class="trust-icon">💳</span> ${payMethods.slice(0,3).join(' · ')}</div>`:''}
  </div>
</div>
<section class="section" id="about">
  <div class="container">
    <div class="about-grid">
      <div>
        <div class="section-label">Our Story</div>
        <div class="section-title">About ${biz}</div>
        <p class="about-text">${about}</p>
        ${owner?`<div class="about-owner"><div class="owner-avatar">👤</div><div><div style="font-weight:700;font-size:15px;color:#1a202c;">${owner}</div><div style="font-size:13px;color:#6b7280;">Owner &amp; Founder</div></div></div>`:''}
      </div>
      <div class="about-card">
        ${years?`<div class="about-card-num">${years}+</div><div class="about-card-label">Years Serving ${city||'Our Community'}</div>`:`<div class="about-card-num">5★</div><div class="about-card-label">Customer Satisfaction</div>`}
        <div class="about-features">
          <div class="feature-row"><div class="feature-check">✓</div><div style="font-size:15px;color:rgba(255,255,255,.85);">Professional, dependable service</div></div>
          <div class="feature-row"><div class="feature-check">✓</div><div style="font-size:15px;color:rgba(255,255,255,.85);">Locally owned and operated</div></div>
          <div class="feature-row"><div class="feature-check">✓</div><div style="font-size:15px;color:rgba(255,255,255,.85);">Serving ${city||'the local area'} and surroundings</div></div>
          ${awards?`<div class="feature-row"><div class="feature-check">✓</div><div style="font-size:15px;color:rgba(255,255,255,.85);">${awards}</div></div>`:''}
        </div>
      </div>
    </div>
  </div>
</section>
${services.length?`<section class="services-section" id="services"><div class="container"><div class="section-label">What We Offer</div><div class="section-title">Our Services</div><div class="services-grid">${services.map(s=>`<div class="service-card"><div class="service-icon">⚡</div><div class="service-name">${s.name}</div>${s.price?`<div class="service-price">${s.price}</div>`:'<div style="font-size:13px;color:#9ca3af;margin-top:4px;">Contact for pricing</div>'}</div>`).join('')}</div></div></section>`:''}
${hoursRows?`<section class="hours-section" id="hours"><div class="container"><div class="section-label">When We're Open</div><div class="section-title">Business Hours</div><div class="hours-grid"><div class="hours-list">${hoursRows}</div>${payMethods.length?`<div class="pay-box"><div class="pay-title">PAYMENT METHODS ACCEPTED</div><div class="pay-methods">${payMethods.map(m=>`<span class="pay-badge">${m}</span>`).join('')}</div><p style="font-size:14px;color:rgba(255,255,255,.7);margin-top:20px;line-height:1.6;">Need to schedule? Call us at <strong style="color:#fff;">${phone}</strong></p></div>`:`<div class="pay-box"><div class="pay-title">READY TO GET STARTED?</div><div class="big-phone">${phone}</div><a href="tel:${phone}" class="btn-call">📞 Call Now</a></div>`}</div></div></section>`:''}
<section class="contact-section" id="contact"><div class="container"><div class="contact-grid"><div><div class="contact-title">Ready to Get Started?</div><p class="contact-sub">Contact ${biz} today. We're here to help and ready to give you a free estimate.</p><div class="contact-items"><div class="contact-item"><div class="contact-icon">📞</div><div><div class="contact-label">Phone</div><div class="contact-value"><a href="tel:${phone}">${phone}</a></div></div></div>${emailAddr?`<div class="contact-item"><div class="contact-icon">✉️</div><div><div class="contact-label">Email</div><div class="contact-value"><a href="mailto:${emailAddr}">${emailAddr}</a></div></div></div>`:''} ${city?`<div class="contact-item"><div class="contact-icon">📍</div><div><div class="contact-label">Service Area</div><div class="contact-value">${city}${state?', '+state:''} &amp; Surrounding Areas</div></div></div>`:''}</div></div><div class="contact-cta"><p style="font-size:13px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Call Us Directly</p><div class="big-phone">${phone}</div><p style="font-size:14px;color:rgba(255,255,255,.65);margin-bottom:20px;">Free estimates · Fast response · ${city||'Local'} experts</p><a href="tel:${phone}" class="btn-call">📞 Call ${biz}</a></div></div></div></section>
<footer><p>&copy; ${new Date().getFullYear()} ${biz}. All rights reserved.<br><span style="font-size:12px;">Powered by <a href="https://turnkeyaiservices.com">TurnkeyAI Services</a></span></p>
${liveSlug?`<p style="margin-top:8px;font-size:11px;"><a href="${SITE_BASE_URL}/client-dashboard/${liveSlug}" style="color:#64748b;">Site Owner Dashboard</a></p>`:''}
</footer>
<button class="chat-fab" id="chatFab" onclick="toggleChat()" aria-label="Open chat">💬</button>
<div class="chat-panel" id="chatPanel">
  <div class="chat-header"><div><div class="chat-header-title">💬 ${chatName}</div><div style="font-size:12px;opacity:.75;">${biz} · Usually replies instantly</div></div><button class="chat-close" onclick="toggleChat()">×</button></div>
  <div class="chat-messages" id="chatMessages"><div class="chat-msg bot">Hi there! 👋 Welcome to ${biz}. How can I help you today?</div></div>
  <div class="chat-quick" id="chatQuick"><button onclick="sendQuick('What are your hours?')">Hours</button><button onclick="sendQuick('How much does it cost?')">Pricing</button><button onclick="sendQuick('How do I schedule?')">Book Now</button><button onclick="sendQuick('Where are you located?')">Location</button></div>
  <div class="chat-input-row"><input class="chat-input" id="chatInput" type="text" placeholder="Type a message…" onkeydown="if(event.key==='Enter')sendMessage()"><button class="chat-send" onclick="sendMessage()">➤</button></div>
</div>
<script>
const CHAT_API='${chatEndpoint}';
let chatOpen=false;
function toggleChat(){chatOpen=!chatOpen;document.getElementById('chatPanel').classList.toggle('open',chatOpen);document.getElementById('chatFab').textContent=chatOpen?'×':'💬';if(chatOpen)document.getElementById('chatInput').focus();}
function addMsg(text,type){const d=document.createElement('div');d.className='chat-msg '+type;d.textContent=text;const msgs=document.getElementById('chatMessages');msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d;}
async function sendMessage(){const inp=document.getElementById('chatInput');const msg=inp.value.trim();if(!msg)return;inp.value='';document.getElementById('chatQuick').style.display='none';addMsg(msg,'user');const typing=addMsg('Typing…','bot typing');try{const r=await fetch(CHAT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})});const data=await r.json();typing.remove();addMsg(data.reply||'Thanks for reaching out! Call us for the fastest response.','bot');}catch(e){typing.remove();addMsg('Thanks for reaching out! For fastest help call us at ${phone}.','bot');}}
function sendQuick(msg){document.getElementById('chatInput').value=msg;sendMessage();}
</script>
</body></html>`;
}

async function sendEmail({ to, subject, html, replyTo = null }) {
  const msg = { to, from: { email: FROM_EMAIL, name: 'TurnkeyAI Services' }, subject, html };
  if (replyTo) msg.replyTo = replyTo;
  try { await sgMail.send(msg); console.log('[TurnkeyAI] Email →', to); return true; }
  catch (e) { console.error('[TurnkeyAI] SendGrid error:', e.response?.body || e.message); return false; }
}
async function notifyAdmin(subject, html) { return sendEmail({ to: ADMIN_EMAIL, subject, html }); }

app.listen(PORT, () => console.log('[TurnkeyAI] Backend on port', PORT));
