// ════════════════════════════════════════════════
// ── lib/email.js — Email (Resend) and SMS (Twilio) sending
// ════════════════════════════════════════════════
const RESEND_API_KEY     = process.env.RESEND_API_KEY;
const ADMIN_EMAIL        = 'turnkeyaiservices@gmail.com';
const BASE_URL           = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE       = process.env.TWILIO_PHONE;

// ── Email via Resend ──
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) { console.warn('[email] No RESEND_API_KEY'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'TurnkeyAI Services <turnkeyaiservices@gmail.com>',
      to: [to],
      subject,
      html
    })
  });
  const d = await res.json();
  if (!res.ok) console.error('[Resend error]', d);
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
        <p style="margin-top:32px;">Questions? Call <strong>(228) 231-9891</strong></p>
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
        <p style="margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ── Send credentials email (client goes live) ──
async function sendCredentialsEmail(client) {
  const loginId = client.dashLoginId || '(check with support)';
  const dashUrl = `${BASE_URL}/pages/client-dashboard.html?loginId=${encodeURIComponent(loginId)}`;
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
          <p style="margin:0 0 8px;"><strong>Dashboard:</strong><br><a href="${dashUrl}" style="color:#0066FF;word-break:break-all;">${dashUrl}</a></p>
          <p style="margin:8px 0 0;"><strong>Login ID:</strong></p>
          <div style="background:#e0f2fe;color:#0066FF;font-size:24px;font-weight:700;letter-spacing:4px;text-align:center;padding:12px;border-radius:8px;margin-top:4px;font-family:monospace;">${loginId}</div>
          <p style="margin:16px 0 0;"><strong>Password:</strong></p>
          <div style="background:#1a1a2e;color:#00D68F;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;border-radius:8px;margin-top:8px;">${client.dashPassword}</div>
        </div>
        <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(228) 231-9891</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ════════════════════════════════════════════════
// ── DNS / Domain Email Templates
// ════════════════════════════════════════════════

function getRegistrarInstructions(registrar) {
  const registrarMap = {
    'godaddy': { name: 'GoDaddy', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in to your GoDaddy account at <a href="https://www.godaddy.com" style="color:#0066FF;">godaddy.com</a></li><li>Click <strong>My Products</strong> in the top menu</li><li>Find your domain and click <strong>DNS</strong></li><li>Look for an existing <strong>A record</strong> with name <strong>@</strong> — edit or add it</li><li>Look for an existing <strong>CNAME record</strong> with name <strong>www</strong> — edit or add it</li><li>Click <strong>Save</strong> — changes can take up to 24-48 hours</li></ol>` },
    'namecheap': { name: 'Namecheap', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in at <a href="https://www.namecheap.com" style="color:#0066FF;">namecheap.com</a></li><li>Go to <strong>Domain List</strong> in the left sidebar</li><li>Click <strong>Manage</strong> next to your domain</li><li>Click the <strong>Advanced DNS</strong> tab</li><li>Edit existing records or click <strong>Add New Record</strong></li><li>Click the green checkmark to save each one</li></ol>` },
    'google_domains': { name: 'Google Domains / Squarespace Domains', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in at <a href="https://domains.squarespace.com" style="color:#0066FF;">domains.squarespace.com</a></li><li>Click on your domain name</li><li>Click <strong>DNS</strong> then <strong>DNS Settings</strong></li><li>Scroll to <strong>Custom Records</strong></li><li>Add or edit the records listed below</li><li>Click <strong>Save</strong></li></ol>` },
    'squarespace': { name: 'Squarespace', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in at <a href="https://domains.squarespace.com" style="color:#0066FF;">domains.squarespace.com</a></li><li>Click on your domain</li><li>Go to <strong>DNS</strong> &gt; <strong>DNS Settings</strong></li><li>Add or edit the records listed below</li><li>Click <strong>Save</strong></li></ol>` },
    'wix': { name: 'Wix', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in at <a href="https://www.wix.com" style="color:#0066FF;">wix.com</a></li><li>Go to <strong>Account Settings</strong> &gt; <strong>Domains</strong></li><li>Click the three-dot menu next to your domain and choose <strong>Manage DNS Records</strong></li><li>Edit or add the records listed below</li><li>Click <strong>Save</strong></li></ol>` },
    'network_solutions': { name: 'Network Solutions', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in at <a href="https://www.networksolutions.com" style="color:#0066FF;">networksolutions.com</a></li><li>Go to <strong>Account Manager</strong> &gt; <strong>My Domain Names</strong></li><li>Click your domain, then <strong>Manage</strong> &gt; <strong>Change Where Domain Points</strong> &gt; <strong>Advanced DNS</strong></li><li>Edit or add the records listed below</li><li>Click <strong>Save Changes</strong></li></ol>` }
  };
  return registrarMap[registrar] || { name: 'your domain registrar', steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;"><li>Log in to the company where you registered your domain</li><li>Find the <strong>DNS</strong> or <strong>Domain Settings</strong> section</li><li>Make the changes listed below</li><li>Save your changes — allow 24-48 hours for propagation</li></ol>` };
}

async function sendDnsSelfDirectedEmail(client) {
  const d = client.data; if (!d.email) return;
  const registrar = getRegistrarInstructions(d.domainRegistrar);
  const domain = d.existingDomain || '(your domain)';
  const emailWarning = (d.hasEmailOnDomain === 'yes' || d.hasEmailOnDomain === 'not_sure_email')
    ? `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:10px;padding:18px;margin:20px 0;"><p style="font-weight:700;color:#dc2626;margin:0 0 8px;">⚠️ Important: You Have Email on This Domain</p><p style="font-size:14px;color:#7f1d1d;margin:0;line-height:1.7;">Do <strong>NOT</strong> delete or change any MX records — those control your email. Only change the A record and CNAME record as described below.</p></div>` : '';
  await sendEmail({ to: d.email, subject: `🌐 DNS Setup Instructions for ${domain} — ${d.businessName}`, html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:24px;">🌐 DNS Setup Instructions</h1><p style="color:rgba(255,255,255,.85);margin:8px 0 0;">For <strong>${domain}</strong> — ${d.businessName}</p></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Here's exactly what you need to do to point <strong>${domain}</strong> to your new TurnkeyAI website.</p>${emailWarning}<div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 16px;color:#0066FF;">Step-by-Step: ${registrar.name}</h3>${registrar.steps}</div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 12px;color:#065f46;">📋 The DNS Records</h3><p style="font-size:14px;color:#374151;margin:0;line-height:1.7;">We'll send the exact values once your site is approved and ready to go live.</p></div><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendDnsHandsFreeEmail(client) {
  const d = client.data; if (!d.email) return;
  const domain = d.existingDomain || '(your domain)';
  const emailWarning = (d.hasEmailOnDomain === 'yes' || d.hasEmailOnDomain === 'not_sure_email')
    ? `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px;margin:20px 0;"><p style="font-weight:700;color:#065f46;margin:0 0 8px;">✅ Your Email Will Be Protected</p><p style="font-size:14px;color:#065f46;margin:0;line-height:1.7;">We will <strong>not</strong> touch your MX records — your email will continue working exactly as it does now.</p></div>` : '';
  await sendEmail({ to: d.email, subject: `🔧 Almost There — One Quick Step to Connect Your Domain — ${d.businessName}`, html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;"><h1 style="color:#00D68F;margin:0;font-size:24px;">🔧 Almost Hands-Free</h1><p style="color:rgba(255,255,255,.85);margin:8px 0 0;">One quick step to connect <strong>${domain}</strong></p></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>There is <strong>one step only you can do</strong> — updating the nameservers at your domain registrar.</p><div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 16px;color:#0066FF;">📋 What You Need to Do</h3><ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;"><li>Log in to <strong>${(d.domainRegistrar || 'your registrar').replace(/_/g,' ')}</strong></li><li>Find the <strong>Nameservers</strong> setting for <strong>${domain}</strong></li><li>Change the nameservers to the two values below</li><li>Save — typically takes 1–4 hours to take effect</li></ol></div><div style="background:#1a1a2e;border-radius:12px;padding:24px;margin:24px 0;text-align:center;"><p style="color:rgba(255,255,255,.7);font-size:13px;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px;">Your New Nameservers</p><div style="background:#0066FF;color:white;font-family:monospace;font-size:18px;font-weight:700;padding:12px 20px;border-radius:8px;margin-bottom:10px;">vera.ns.cloudflare.com</div><div style="background:#0066FF;color:white;font-family:monospace;font-size:18px;font-weight:700;padding:12px 20px;border-radius:8px;">walt.ns.cloudflare.com</div></div>${emailWarning}<p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendDomainRegistrationEmail(client) {
  const d = client.data; if (!d.email) return;
  const preferred = d.preferredDomains || d.suggestedDomain || '(we\'ll find the perfect one)';
  await sendEmail({ to: d.email, subject: `🆕 We're Registering Your Domain — ${d.businessName}`, html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;"><div style="background:linear-gradient(135deg,#6366f1,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:24px;">🆕 Your New Domain</h1><p style="color:rgba(255,255,255,.85);margin:8px 0 0;">We're setting up a web address for ${d.businessName}</p></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Since you don't have a domain yet, we'll register one for you. Here's what you told us you'd like:</p><div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 12px;color:#4f46e5;">🌐 Your Domain Preferences</h3><p style="font-size:15px;color:#374151;margin:0;white-space:pre-line;line-height:2;">${preferred}</p></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px;margin:20px 0;"><p style="font-weight:700;color:#065f46;margin:0 0 8px;">✅ You Own Your Domain</p><p style="font-size:14px;color:#065f46;margin:0;line-height:1.7;">Any domain we register belongs to you. If you ever cancel, we transfer it to you at no cost.</p></div><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendProfessionalEmailSetupEmail(client) {
  const d = client.data; if (!d.email) return;
  const domain = d.existingDomain || d.preferredDomains || '(your new domain)';
  await sendEmail({ to: d.email, subject: `📧 Professional Email Setup — ${d.businessName}`, html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:28px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:24px;">📧 Professional Email Coming Soon</h1></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>You requested a <strong>professional email address</strong> on your domain. We'll set that up once your domain is confirmed and send you login credentials in a separate email.</p><p><strong>You don't need to do anything right now.</strong></p><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendContentUpdateEmail(client, redeployed) {
  const d = client.data; if (!d.email) return;
  const loginId = client.dashLoginId || '(check with support)';
  const dashUrl = `${BASE_URL}/pages/client-dashboard.html?loginId=${encodeURIComponent(loginId)}`;
  const statusMsg = redeployed
    ? `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:20px;margin:24px 0;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 8px;font-size:16px;">✅ Your site is rebuilding now</p><a href="${client.liveUrl || '#'}" style="font-size:16px;font-weight:700;color:#0066FF;text-decoration:underline;display:block;margin-top:8px;">${client.liveUrl || 'your site URL'}</a></div>`
    : `<div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;margin:24px 0;text-align:center;"><p style="font-weight:700;color:#1e40af;margin:0 0 8px;font-size:16px;">💾 Your information has been saved</p></div>`;
  await sendEmail({ to: d.email, subject: `✅ Website Updated — ${d.businessName}`, html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:24px;">✅ Your Website Has Been Updated</h1></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Your website content has been successfully updated.</p>${statusMsg}<div style="text-align:center;margin:20px 0;"><a href="${dashUrl}" style="background:#0066FF;color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">📋 Open My Dashboard</a></div><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendPhoneSystemReadyEmail(client) {
  const d = client.data; if (!d.email) return;
  const phoneDisplay = client.twilioNumber ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : '(your new number)';
  const forwardDisplay = client.forwardingNumber ? client.forwardingNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : d.phone || '(your cell)';
  await sendEmail({ to: d.email, subject: `📞 Your Business Phone System is Ready — ${d.businessName}`, html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#6366f1,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:24px;">📞 Your Phone System is Live</h1></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Your dedicated business phone number is ready to use.</p><div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:12px;padding:28px;margin:24px 0;text-align:center;"><p style="font-size:13px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Your Business Phone Number</p><div style="font-size:32px;font-weight:700;color:#0066FF;letter-spacing:3px;font-family:monospace;">${phoneDisplay}</div></div><p style="font-size:14px;color:#374151;">Calls forward to your phone at <strong>${forwardDisplay}</strong>. Missed calls trigger an automatic text-back.</p><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendPaymentConfirmationEmail(client) {
  const d = client.data; if (!d.email) return;
  const plan = d.selectedPlan || d.plan || d.tier || d.packageType || 'your plan';
  const planDisplay = { 'website_only':'Website Only ($99/mo)', 'website_blog':'Website + Blog ($129/mo)', 'website_blog_social':'Website + Blog + Social ($159/mo)', 'full_package':'Full Package ($218/mo)', 'mini_me':'Mini-Me Digital Twin ($59/mo)', 'social_setup':'Social Media Setup ($99 one-time)' }[plan] || plan;
  let nextStepsSection = '';
  if (client.status === 'active' && client.liveUrl && client.dashPassword) {
    const loginId = client.dashLoginId || '(check with support)';
    const dashUrl = `${BASE_URL}/pages/client-dashboard.html?loginId=${encodeURIComponent(loginId)}`;
    nextStepsSection = `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 8px;font-size:18px;">✅ Your Website is Already LIVE!</p><a href="${client.liveUrl}" style="font-size:18px;font-weight:700;color:#0066FF;text-decoration:underline;display:block;margin-top:8px;">${client.liveUrl}</a></div><div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 16px;color:#0066FF;">📋 Your Client Dashboard</h3><p><strong>Login ID:</strong></p><div style="background:#e0f2fe;color:#0066FF;font-size:20px;font-weight:700;letter-spacing:3px;text-align:center;padding:10px;border-radius:8px;margin-top:4px;font-family:monospace;">${loginId}</div><p style="margin:16px 0 0;"><strong>Password:</strong></p><div style="background:#1a1a2e;color:#00D68F;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;padding:14px;border-radius:8px;margin-top:8px;font-family:monospace;">${client.dashPassword}</div></div>`;
  } else {
    nextStepsSection = `<div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 16px;color:#0066FF;">📋 What Happens Next</h3><ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;"><li>We're building your custom website right now</li><li>Within <strong>24-48 hours</strong>, you'll receive a preview link</li><li>Review and approve — then we make it live</li><li>You'll receive your dashboard login and live URL</li></ol></div>`;
  }
  await sendEmail({ to: d.email, subject: `🎉 Payment Confirmed — Welcome to TurnkeyAI! — ${d.businessName || 'Your Business'}`, html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#00D68F,#0066FF);padding:32px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:28px;">🎉 Welcome to TurnkeyAI!</h1></div><div style="padding:32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Your payment has been confirmed and we're excited to get started.</p><div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:12px;padding:20px;margin:24px 0;"><h3 style="margin:0 0 12px;color:#374151;">📦 Your Plan</h3><p style="font-size:16px;font-weight:700;color:#0066FF;margin:0;">${planDisplay}</p></div>${nextStepsSection}<p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(228) 231-9891</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>` });
}

async function sendBlogPostNotificationEmail(postTitle, postUrl) {
  await sendEmail({ to: ADMIN_EMAIL, subject: `📝 New Blog Post Published: ${postTitle}`, html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:#00D68F;margin:0;font-size:24px;">📝 Blog Post Published</h1></div><div style="padding:28px;"><p>A new blog post has been automatically published.</p><p><strong>Title:</strong> ${postTitle}</p><p><strong>URL:</strong><br><a href="${postUrl}" style="color:#0066FF;word-break:break-all;">${postUrl}</a></p></div></div>` });
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
  sendDnsSelfDirectedEmail,
  sendDnsHandsFreeEmail,
  sendDomainRegistrationEmail,
  sendProfessionalEmailSetupEmail,
  sendContentUpdateEmail,
  sendPhoneSystemReadyEmail,
  sendPaymentConfirmationEmail,
  sendBlogPostNotificationEmail,
};
