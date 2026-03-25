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
        <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(603) 922-2004</strong></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ════════════════════════════════════════════════
// ── DNS / Domain Email Templates
// ════════════════════════════════════════════════

// ── Registrar-specific DNS instructions ──
function getRegistrarInstructions(registrar) {
  const registrarMap = {
    'godaddy': {
      name: 'GoDaddy',
      steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
        <li>Log in to your GoDaddy account at <a href="https://www.godaddy.com" style="color:#0066FF;">godaddy.com</a></li>
        <li>Click <strong>My Products</strong> in the top menu</li>
        <li>Find your domain and click <strong>DNS</strong> (or "Manage DNS")</li>
        <li>You'll see a list of DNS records — this is where you'll make the changes below</li>
        <li>Look for an existing <strong>A record</strong> with name <strong>@</strong> — click the pencil icon to edit it, or add a new one</li>
        <li>Look for an existing <strong>CNAME record</strong> with name <strong>www</strong> — edit or add it</li>
        <li>After making changes, click <strong>Save</strong> — changes can take up to 24-48 hours to go live worldwide</li>
      </ol>`
    },
    'namecheap': {
      name: 'Namecheap',
      steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
        <li>Log in to your Namecheap account at <a href="https://www.namecheap.com" style="color:#0066FF;">namecheap.com</a></li>
        <li>Go to <strong>Domain List</strong> in the left sidebar</li>
        <li>Click <strong>Manage</strong> next to your domain</li>
        <li>Click the <strong>Advanced DNS</strong> tab</li>
        <li>You'll see your DNS records listed — edit existing ones or click <strong>Add New Record</strong></li>
        <li>Make the changes listed below, then click the green checkmark to save each one</li>
        <li>Changes can take up to 24-48 hours to go live worldwide</li>
      </ol>`
    },
    'google_domains': {
      name: 'Google Domains / Squarespace Domains',
      steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
        <li>Google Domains has been moved to Squarespace — log in at <a href="https://domains.squarespace.com" style="color:#0066FF;">domains.squarespace.com</a></li>
        <li>Click on your domain name</li>
        <li>In the left menu, click <strong>DNS</strong> then <strong>DNS Settings</strong></li>
        <li>Scroll to <strong>Custom Records</strong></li>
        <li>Add or edit the records listed below</li>
        <li>Click <strong>Save</strong> — changes can take up to 24-48 hours to go live</li>
      </ol>`
    },
    'squarespace': {
      name: 'Squarespace',
      steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
        <li>Log in at <a href="https://domains.squarespace.com" style="color:#0066FF;">domains.squarespace.com</a></li>
        <li>Click on your domain name</li>
        <li>Go to <strong>DNS</strong> &gt; <strong>DNS Settings</strong></li>
        <li>Scroll to <strong>Custom Records</strong></li>
        <li>Add or edit the records listed below</li>
        <li>Click <strong>Save</strong> — changes can take up to 24-48 hours</li>
      </ol>`
    },
    'wix': {
      name: 'Wix',
      steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
        <li>Log in to your Wix account at <a href="https://www.wix.com" style="color:#0066FF;">wix.com</a></li>
        <li>Go to your <strong>Account Settings</strong> &gt; <strong>Domains</strong></li>
        <li>Click the <strong>three-dot menu</strong> next to your domain and choose <strong>Manage DNS Records</strong></li>
        <li>You'll see your DNS records — edit or add the records listed below</li>
        <li>Click <strong>Save</strong> — changes can take up to 24-48 hours</li>
      </ol>`
    },
    'network_solutions': {
      name: 'Network Solutions',
      steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
        <li>Log in at <a href="https://www.networksolutions.com" style="color:#0066FF;">networksolutions.com</a></li>
        <li>Go to <strong>Account Manager</strong> &gt; <strong>My Domain Names</strong></li>
        <li>Click your domain, then <strong>Manage</strong> &gt; <strong>Change Where Domain Points</strong></li>
        <li>Select <strong>Advanced DNS</strong></li>
        <li>Edit or add the records listed below</li>
        <li>Click <strong>Save Changes</strong> — allow 24-48 hours for propagation</li>
      </ol>`
    }
  };
  return registrarMap[registrar] || {
    name: 'your domain registrar',
    steps: `<ol style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">
      <li>Log in to the company where you registered your domain</li>
      <li>Find the <strong>DNS</strong> or <strong>Domain Settings</strong> section</li>
      <li>Look for where you can add or edit <strong>DNS records</strong></li>
      <li>Make the changes listed below</li>
      <li>Save your changes — allow 24-48 hours for propagation</li>
    </ol>`
  };
}

// ── DNS Self-Directed Instruction Email ──
async function sendDnsSelfDirectedEmail(client) {
  const d = client.data;
  if (!d.email) return;
  const registrar = getRegistrarInstructions(d.domainRegistrar);
  const domain = d.existingDomain || '(your domain)';
  const emailWarning = (d.hasEmailOnDomain === 'yes' || d.hasEmailOnDomain === 'not_sure_email')
    ? `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:10px;padding:18px;margin:20px 0;">
        <p style="font-weight:700;color:#dc2626;margin:0 0 8px;">⚠️ Important: You Have Email on This Domain</p>
        <p style="font-size:14px;color:#7f1d1d;margin:0;line-height:1.7;">You told us you have email addresses on <strong>${domain}</strong>${d.emailsToPreserve ? ' (' + d.emailsToPreserve + ')' : ''}. When making DNS changes, <strong>do NOT delete or change any MX records</strong> — those control your email. Only change the A record and CNAME record as described below. If you're unsure, call us first at <strong>(603) 922-2004</strong> and we'll walk you through it.</p>
      </div>`
    : '';
  await sendEmail({
    to: d.email,
    subject: `🌐 DNS Setup Instructions for ${domain} — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">🌐 DNS Setup Instructions</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">For <strong>${domain}</strong> — ${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You chose to handle your own DNS setup — no problem! Here's exactly what you need to do to point <strong>${domain}</strong> to your new TurnkeyAI website.</p>
        <p style="font-size:14px;color:#6B7280;"><strong>Don't worry</strong> — this is simpler than it sounds. Most people finish it in under 5 minutes.</p>
        ${emailWarning}
        <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#0066FF;">Step-by-Step: ${registrar.name}</h3>
          ${registrar.steps}
        </div>
        <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 12px;color:#065f46;">📋 The DNS Records You'll Need</h3>
          <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.7;">We'll send you the <strong>exact DNS records</strong> (the specific values to enter) once your website preview is approved and your site is ready to go live. That way the records will be specific to your site.</p>
          <p style="font-size:14px;color:#374151;margin:0;line-height:1.7;">For now, you don't need to change anything — just know where to find your DNS settings so you're ready when the time comes.</p>
        </div>
        <div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:10px;padding:18px;margin:20px 0;">
          <p style="font-weight:700;color:#92400e;margin:0 0 8px;">🤔 Changed Your Mind?</p>
          <p style="font-size:14px;color:#92400e;margin:0;line-height:1.7;">If this feels complicated, no worries — just reply to this email or call us at <strong>(603) 922-2004</strong> and we'll switch you to Hands-Free setup. We'll handle everything for you.</p>
        </div>
        <p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ── DNS Hands-Free Confirmation Email ──
async function sendDnsHandsFreeEmail(client) {
  const d = client.data;
  if (!d.email) return;
  const domain = d.existingDomain || '(your domain)';
  const emailWarning = (d.hasEmailOnDomain === 'yes' || d.hasEmailOnDomain === 'not_sure_email')
    ? `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px;margin:20px 0;">
        <p style="font-weight:700;color:#065f46;margin:0 0 8px;">✅ Your Email Will Be Protected</p>
        <p style="font-size:14px;color:#065f46;margin:0;line-height:1.7;">You told us you have email addresses on this domain${d.emailsToPreserve ? ' (' + d.emailsToPreserve + ')' : ''}. We will <strong>not</strong> touch your MX records — your email will continue working exactly as it does now.</p>
      </div>`
    : '';
  await sendEmail({
    to: d.email,
    subject: `🔧 We've Got Your DNS Setup Covered — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#00D68F;margin:0;font-size:24px;">🔧 We'll Handle Your DNS</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">Hands-free setup for <strong>${domain}</strong></p>
      </div>
      <div style="padding:28px 32px;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Thanks for choosing the <strong>Hands-Free</strong> option for your DNS setup. We've received your registrar credentials and will take it from here.</p>
        <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#0066FF;">📋 What Happens Next</h3>
          <ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;">
            <li>We review and approve your website preview</li>
            <li>Once approved, we log into your domain registrar and update your DNS records</li>
            <li>Your domain <strong>${domain}</strong> will point to your new TurnkeyAI website</li>
            <li>DNS changes typically take 1–24 hours to fully propagate</li>
            <li>We'll email you once everything is live</li>
          </ol>
        </div>
        ${emailWarning}
        <div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:10px;padding:18px;margin:20px 0;">
          <p style="font-weight:700;color:#374151;margin:0 0 8px;">🔒 Your Credentials Are Secure</p>
          <p style="font-size:14px;color:#6B7280;margin:0;line-height:1.7;">Your registrar login information will only be used for DNS configuration. We will not modify any other settings on your account. Once DNS setup is complete, we recommend changing your registrar password for added security.</p>
        </div>
        <p><strong>You don't need to do anything else.</strong> We'll keep you updated by email as we complete each step.</p>
        <p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ── Domain Registration Notification Email ──
async function sendDomainRegistrationEmail(client) {
  const d = client.data;
  if (!d.email) return;
  const preferred = d.preferredDomains || d.suggestedDomain || '(we\'ll find the perfect one)';
  await sendEmail({
    to: d.email,
    subject: `🆕 We're Registering Your Domain — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#6366f1,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">🆕 Your New Domain</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">We're setting up a web address for ${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Since you don't have a domain yet, we'll register one for you. Here's what you told us you'd like:</p>
        <div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 12px;color:#4f46e5;">🌐 Your Domain Preferences</h3>
          <p style="font-size:15px;color:#374151;margin:0;white-space:pre-line;line-height:2;">${preferred}</p>
        </div>
        <div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#374151;">📋 What Happens Next</h3>
          <ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;">
            <li>We check availability of your preferred domain names</li>
            <li>We register the best available option (one-time $20 domain fee)</li>
            <li>We point the domain to your new TurnkeyAI website</li>
            <li>You'll get an email confirming which domain was registered</li>
          </ol>
        </div>
        <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px;margin:20px 0;">
          <p style="font-weight:700;color:#065f46;margin:0 0 8px;">✅ You Own Your Domain</p>
          <p style="font-size:14px;color:#065f46;margin:0;line-height:1.7;">Any domain we register on your behalf belongs to you. If you ever cancel your TurnkeyAI service, we will transfer the domain to you at no cost within 30 days of a written request.</p>
        </div>
        ${d.wantsProfessionalEmail === 'yes' ? '<p style="font-size:14px;color:#374151;">You also requested a <strong>professional email address</strong> — we\'ll set that up once your domain is registered and send you separate login details.</p>' : ''}
        <p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ── Professional Email Setup Confirmation Email ──
async function sendProfessionalEmailSetupEmail(client) {
  const d = client.data;
  if (!d.email) return;
  const domain = d.existingDomain || d.preferredDomains || '(your new domain)';
  await sendEmail({
    to: d.email,
    subject: `📧 Professional Email Setup — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">📧 Professional Email Coming Soon</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">A professional email address for ${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You requested a <strong>professional email address</strong> on your domain — something like <strong>${d.ownerName ? d.ownerName.split(' ')[0].toLowerCase() : 'info'}@${typeof domain === 'string' && domain.includes('.') ? domain.split('\n')[0].trim() : 'yourbusiness.com'}</strong>.</p>
        <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#0066FF;">📋 What Happens Next</h3>
          <ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;">
            <li>We set up your domain (if it's being registered) or verify your existing domain</li>
            <li>We configure professional email hosting on your domain</li>
            <li>We create your email address and send you your login credentials in a separate email</li>
            <li>You'll be able to send and receive email from your professional address</li>
          </ol>
        </div>
        <div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:10px;padding:18px;margin:20px 0;">
          <p style="font-weight:700;color:#374151;margin:0 0 8px;">📱 Works Everywhere</p>
          <p style="font-size:14px;color:#6B7280;margin:0;line-height:1.7;">Your professional email will work with Gmail, Outlook, Apple Mail, and your phone's built-in email app. We'll send setup instructions for your preferred device.</p>
        </div>
        <p><strong>You don't need to do anything right now.</strong> We'll handle the entire setup and send you everything you need once it's ready.</p>
        <p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ════════════════════════════════════════════════
// ── Content Update / Phone System Email Templates
// ════════════════════════════════════════════════

// ── Content Update Confirmation Email ──
async function sendContentUpdateEmail(client, redeployed) {
  const d = client.data;
  if (!d.email) return;
  const loginId = client.dashLoginId || '(check with support)';
  const dashUrl = `${BASE_URL}/pages/client-dashboard.html?loginId=${encodeURIComponent(loginId)}`;
  const statusMsg = redeployed
    ? `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:20px;margin:24px 0;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0 0 8px;font-size:16px;">✅ Your site is rebuilding now</p><p style="font-size:14px;color:#065f46;margin:0;">Changes will be live within 1–2 minutes at:</p><a href="${client.liveUrl || '#'}" style="font-size:16px;font-weight:700;color:#0066FF;text-decoration:underline;display:block;margin-top:8px;">${client.liveUrl || 'your site URL'}</a></div>`
    : `<div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;margin:24px 0;text-align:center;"><p style="font-weight:700;color:#1e40af;margin:0 0 8px;font-size:16px;">💾 Your information has been saved</p><p style="font-size:14px;color:#1e40af;margin:0;">Your changes will appear on your site when it's next deployed.</p></div>`;
  await sendEmail({
    to: d.email,
    subject: `✅ Website Updated — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:24px;">✅ Your Website Has Been Updated</h1><p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Your website content has been successfully updated.</p>${statusMsg}<div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:10px;padding:18px;margin:20px 0;"><p style="font-size:14px;color:#374151;margin:0 0 8px;"><strong>Want to make more changes?</strong></p><p style="font-size:14px;color:#6B7280;margin:0;line-height:1.7;">Log into your dashboard anytime to update your information, hours, services, or anything else on your site.</p><div style="margin-top:12px;text-align:center;"><a href="${dashUrl}" style="background:#0066FF;color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">📋 Open My Dashboard</a></div></div><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>`
  });
}

// ── Phone System Ready Email ──
async function sendPhoneSystemReadyEmail(client) {
  const d = client.data;
  if (!d.email) return;
  const phoneDisplay = client.twilioNumber
    ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : '(your new number)';
  const forwardDisplay = client.forwardingNumber
    ? client.forwardingNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : d.phone || '(your cell)';
  const features = [];
  if (d.addon_after_hours === 'yes' || d.ivrOptIn === 'yes') features.push('<li><strong>After-Hours AI:</strong> When you\'re closed, callers get a professional voicemail greeting and an automatic text message letting them know you\'ll call back.</li>');
  if (d.addon_missed_call === 'yes' || d.ivrOptIn === 'yes') features.push('<li><strong>Missed Call Text-Back:</strong> If you miss a call during business hours, the caller automatically gets a text: "We missed your call — we\'ll get right back to you."</li>');
  features.push('<li><strong>Call Forwarding:</strong> All calls to your business number ring your personal phone at ' + forwardDisplay + '.</li>');
  features.push('<li><strong>Call Recording:</strong> Calls are recorded and transcribed so you never miss a detail.</li>');
  features.push('<li><strong>AI Text Assistant:</strong> Customers can text your business number and get instant AI-powered responses 24/7.</li>');
  await sendEmail({
    to: d.email,
    subject: `📞 Your Business Phone System is Ready — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#6366f1,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:24px;">📞 Your Phone System is Live</h1><p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName} — professional phone line activated</p></div><div style="padding:28px 32px;"><p>Hi ${d.ownerName || 'there'},</p><p>Your dedicated business phone number has been set up and is ready to use.</p><div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:12px;padding:28px;margin:24px 0;text-align:center;"><p style="font-size:13px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Your Business Phone Number</p><div style="font-size:32px;font-weight:700;color:#0066FF;letter-spacing:3px;font-family:monospace;">${phoneDisplay}</div><p style="font-size:13px;color:#6B7280;margin-top:12px;">Put this number on your business cards, website, and advertising.</p></div><div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:12px;padding:24px;margin:24px 0;"><h3 style="margin:0 0 16px;color:#374151;">🎯 What Your Phone System Does</h3><ul style="padding-left:20px;line-height:2.2;font-size:14px;color:#374151;">${features.join('')}</ul></div><div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:10px;padding:18px;margin:20px 0;"><p style="font-weight:700;color:#92400e;margin:0 0 8px;">📱 How It Works</p><p style="font-size:14px;color:#92400e;margin:0;line-height:1.7;">When someone calls <strong>${phoneDisplay}</strong>, they'll hear a professional greeting and IVR menu. Calls forward directly to your phone at <strong>${forwardDisplay}</strong>. You answer just like any normal call — the caller never knows the difference.</p></div><p style="font-size:14px;color:#6B7280;margin-top:24px;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p>— The TurnkeyAI Services Team</p></div></div>`
  });
}

// ── Payment Confirmation / Welcome Email ──
async function sendPaymentConfirmationEmail(client) {
  const d = client.data;
  if (!d.email) return;
  
  const plan = d.selectedPlan || d.plan || d.tier || d.packageType || 'your plan';
  const planDisplay = {
    'website_only': 'Website Only ($99/mo)',
    'website_blog': 'Website + Blog ($129/mo)',
    'website_blog_social': 'Website + Blog + Social ($159/mo)',
    'full_package': 'Full Package ($218/mo)',
    'mini_me': 'Mini-Me Digital Twin ($59/mo)',
    'social_setup': 'Social Media Setup ($99 one-time)'
  }[plan] || plan;

  let nextStepsSection = '';
  let dashboardSection = '';

  if (client.status === 'active' && client.liveUrl && client.dashPassword) {
    const loginId = client.dashLoginId || '(check with support)';
    const dashUrl = `${BASE_URL}/pages/client-dashboard.html?loginId=${encodeURIComponent(loginId)}`;
    const phoneDisplay = client.twilioNumber
      ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
      : null;
    const phoneSection = phoneDisplay
      ? `<div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
          <p style="font-size:13px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Your Business Phone Line</p>
          <div style="font-size:26px;font-weight:700;color:#0066FF;letter-spacing:2px;font-family:monospace;">${phoneDisplay}</div>
        </div>`
      : '';

    nextStepsSection = `<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
      <p style="font-weight:700;color:#065f46;margin:0 0 8px;font-size:18px;">✅ Your Website is Already LIVE!</p>
      <a href="${client.liveUrl}" style="font-size:18px;font-weight:700;color:#0066FF;text-decoration:underline;display:block;margin-top:8px;">${client.liveUrl}</a>
    </div>${phoneSection}`;

    dashboardSection = `<div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
      <h3 style="margin:0 0 16px;color:#0066FF;">📋 Your Client Dashboard</h3>
      <p style="margin:0 0 8px;"><strong>Dashboard:</strong><br><a href="${dashUrl}" style="color:#0066FF;word-break:break-all;">${dashUrl}</a></p>
      <p style="margin:8px 0 0;"><strong>Login ID:</strong></p>
      <div style="background:#e0f2fe;color:#0066FF;font-size:20px;font-weight:700;letter-spacing:3px;text-align:center;padding:10px;border-radius:8px;margin-top:4px;font-family:monospace;">${loginId}</div>
      <p style="margin:16px 0 0;"><strong>Password:</strong></p>
      <div style="background:#1a1a2e;color:#00D68F;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;padding:14px;border-radius:8px;margin-top:8px;font-family:monospace;">${client.dashPassword}</div>
    </div>`;
  } else {
    nextStepsSection = `<div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:24px;margin:24px 0;">
      <h3 style="margin:0 0 16px;color:#0066FF;">📋 What Happens Next</h3>
      <ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;">
        <li>We're building your custom website right now</li>
        <li>Within <strong>24-48 hours</strong>, you'll receive an email with a preview link</li>
        <li>Review your site and request any changes</li>
        <li>Once approved, we'll make your site live on the internet</li>
        <li>You'll receive your dashboard login credentials and live URL</li>
      </ol>
    </div>`;
  }

  await sendEmail({
    to: d.email,
    subject: `🎉 Payment Confirmed — Welcome to TurnkeyAI! — ${d.businessName || 'Your Business'}`,
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#00D68F,#0066FF);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:28px;">🎉 Welcome to TurnkeyAI!</h1>
        <p style="color:rgba(255,255,255,.95);margin:8px 0 0;font-size:16px;">Payment confirmed — your website is on the way</p>
      </div>
      <div style="padding:32px;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Thank you for choosing TurnkeyAI Services! Your payment has been confirmed and we're excited to get started.</p>
        <div style="background:#f8fafc;border:2px solid #e5e7eb;border-radius:12px;padding:20px;margin:24px 0;">
          <h3 style="margin:0 0 12px;color:#374151;">📦 Your Plan</h3>
          <p style="font-size:16px;font-weight:700;color:#0066FF;margin:0;">${planDisplay}</p>
        </div>
        ${nextStepsSection}
        ${dashboardSection}
        <div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:10px;padding:18px;margin:24px 0;">
          <p style="font-weight:700;color:#92400e;margin:0 0 8px;">💬 Questions? We're Here to Help</p>
          <p style="font-size:14px;color:#92400e;margin:0;line-height:1.7;">Call us anytime at <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p>
        </div>
        <p style="margin-top:32px;">Welcome aboard!</p>
        <p>— The TurnkeyAI Services Team</p>
      </div>
    </div>`
  });
}

// ════════════════════════════════════════════════
// ── Blog Post Notification Email (Admin-Facing)
// ════════════════════════════════════════════════

async function sendBlogPostNotificationEmail(postTitle, postUrl) {
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `📝 New Blog Post Published: ${postTitle}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#00D68F;margin:0;font-size:24px;">📝 Blog Post Published</h1>
      </div>
      <div style="padding:28px;">
        <p>A new blog post has been automatically published to Facebook.</p>
        <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 12px;color:#0066FF;">Post Details</h3>
          <p style="margin:0;"><strong>Title:</strong> ${postTitle}</p>
          <p style="margin:8px 0 0;"><strong>URL:</strong><br><a href="${postUrl}" style="color:#0066FF;word-break:break-all;">${postUrl}</a></p>
        </div>
        <p style="font-size:14px;color:#6B7280;">This is an automated notification from the TurnkeyAI blog scheduler.</p>
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
  sendDnsSelfDirectedEmail,
  sendDnsHandsFreeEmail,
  sendDomainRegistrationEmail,
  sendProfessionalEmailSetupEmail,
  sendContentUpdateEmail,
  sendPhoneSystemReadyEmail,
  sendPaymentConfirmationEmail,
  sendBlogPostNotificationEmail,
};
