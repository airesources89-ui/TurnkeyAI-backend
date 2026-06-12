// ════════════════════════════════════════════════
// ── lib/email.js — Email (SendGrid) and SMS (Twilio)
// ── Deploy to: Railway → GitHub → lib/email.js
// ── Env var required: SENDGRID_API_KEY (replaces BREVO_API_KEY)
// ════════════════════════════════════════════════
const SENDGRID_API_KEY   = process.env.SENDGRID_API_KEY;
const ADMIN_EMAIL        = 'turnkeyaiservices@gmail.com';
const BASE_URL           = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE       = process.env.TWILIO_PHONE;

// ── Email via SendGrid ──
async function sendEmail({ to, subject, html }) {
  if (!SENDGRID_API_KEY) { console.warn('[email] No SENDGRID_API_KEY'); return; }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'turnkeyaiservices@gmail.com', name: 'TurnkeyAI Services' },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[SendGrid error]', res.status, errText);
    }
  } catch (e) {
    console.error('[sendEmail exception]', e.message);
  }
}

// ── SMS via Twilio ──
async function sendSMS(to, body) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
    console.warn('[Twilio] Missing credentials — SMS skipped'); return;
  }
  const cleaned = to.replace(/\D/g, '');
  const e164 = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
  try {
    const params = new URLSearchParams({ To: e164, From: TWILIO_PHONE, Body: body });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      }
    );
    const d = await res.json();
    if (!res.ok) console.error('[Twilio error]', d);
    return d;
  } catch (e) {
    console.error('[sendSMS exception]', e.message);
  }
}

// ════════════════════════════════════════════════
// EMAIL TEMPLATE FUNCTIONS
// All templates below are unchanged — only sendEmail() above changed
// ════════════════════════════════════════════════

async function sendWelcomeEmail(client) {
  const d = client.data;
  await sendEmail({
    to: d.email,
    subject: `🎉 Welcome to TurnkeyAI — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">Welcome to TurnkeyAI Services!</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">Your AI-powered website is being built</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Thank you for choosing TurnkeyAI Services. We have received your information for <strong>${d.businessName}</strong> and your website is being built now.</p>
        <p>You will receive another email within 24 hours with your preview link.</p>
        <p>Questions? Call or text us at <strong>(603) 922-2004</strong> or reply to this email.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; <a href="https://turnkeyaiservices.com" style="color:#0066FF;">turnkeyaiservices.com</a> &nbsp;|&nbsp; (603) 922-2004</p>
      </div>
    </div>`
  });
}

async function sendAdminNotification(client) {
  const d = client.data;
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `🆕 New Intake — ${d.businessName || 'Unknown'} (${d.industry || 'N/A'})`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">New TurnkeyAI Intake Submission</h1>
      </div>
      <div style="padding:24px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6B7280;width:40%;">Business</td><td style="padding:6px 0;font-weight:600;">${d.businessName || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Owner</td><td style="padding:6px 0;">${d.ownerName || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Email</td><td style="padding:6px 0;"><a href="mailto:${d.email}">${d.email || 'N/A'}</a></td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Phone</td><td style="padding:6px 0;">${d.phone || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Industry</td><td style="padding:6px 0;">${d.industry || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">City</td><td style="padding:6px 0;">${d.city || 'N/A'}, ${d.state || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Plan</td><td style="padding:6px 0;">${d.selectedPlan || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Domain</td><td style="padding:6px 0;">${d.domainName || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Client ID</td><td style="padding:6px 0;font-family:monospace;">${client.id}</td></tr>
        </table>
        <div style="margin-top:20px;">
          <a href="${BASE_URL}/admin" style="background:#0066FF;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View in Admin Dashboard →</a>
        </div>
      </div>
    </div>`
  });
}

async function sendPreviewEmail(client) {
  const d = client.data;
  if (!d.email || !client.previewUrl) return;
  await sendEmail({
    to: d.email,
    subject: `👀 Your TurnkeyAI Preview is Ready — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">Your Website Preview is Ready!</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Great news — your TurnkeyAI website preview is ready to view!</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${client.previewUrl}" style="background:#0066FF;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">View My Website Preview →</a>
        </div>
        <p style="font-size:14px;color:#6B7280;">Review your site and let us know if you would like any changes before we go live. Reply to this email or call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; <a href="https://turnkeyaiservices.com" style="color:#0066FF;">turnkeyaiservices.com</a> &nbsp;|&nbsp; (603) 922-2004</p>
      </div>
    </div>`
  });
}

async function sendApprovalEmail(client) {
  const d = client.data;
  if (!d.email) return;
  await sendEmail({
    to: d.email,
    subject: `✅ Your TurnkeyAI Website is Live — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#00D68F,#065f46);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">Your Website is Live! 🎉</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Your TurnkeyAI website is officially live and open for business!</p>
        ${client.liveUrl ? `<div style="text-align:center;margin:28px 0;"><a href="${client.liveUrl}" style="background:#00D68F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Visit My Live Website →</a></div>` : ''}
        <p style="font-size:14px;">Your dashboard password: <strong style="font-family:monospace;">${client.dashPassword || 'Check your welcome email'}</strong></p>
        <p style="font-size:14px;color:#6B7280;">Bookmark your site and share it with your customers. Questions? Call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; <a href="https://turnkeyaiservices.com" style="color:#0066FF;">turnkeyaiservices.com</a> &nbsp;|&nbsp; (603) 922-2004</p>
      </div>
    </div>`
  });
}

async function sendDnsSelfDirectedEmail(client) {
  const d = client.data;
  if (!d.email) return;
  const domain = d.domainName || 'your domain';
  await sendEmail({
    to: d.email,
    subject: `🌐 DNS Setup Instructions for ${domain} — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">🌐 DNS Setup Instructions</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">For ${domain} — ${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You chose to handle your own DNS setup. We will send you the exact records to enter once your preview is approved. In the meantime, log into your domain registrar and locate the DNS settings panel.</p>
        <p>If you need help, call us at <strong>(603) 922-2004</strong> and we will walk you through it step by step.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; (603) 922-2004 &nbsp;|&nbsp; turnkeyaiservices@gmail.com</p>
      </div>
    </div>`
  });
}

async function sendDnsHandsFreeEmail(client) {
  const d = client.data;
  if (!d.email) return;
  await sendEmail({
    to: d.email,
    subject: `✅ Hands-Free DNS — We Will Handle It — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">We Will Handle Your DNS Setup</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You selected our hands-free DNS option — we will take care of pointing your domain to your new website once it is approved. No action is needed from you.</p>
        <p>We will contact you if we need anything. Questions? Call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; (603) 922-2004 &nbsp;|&nbsp; turnkeyaiservices@gmail.com</p>
      </div>
    </div>`
  });
}

async function sendDomainRegistrationEmail(client) {
  const d = client.data;
  if (!d.email) return;
  await sendEmail({
    to: d.email,
    subject: `🌐 Domain Registration — Next Steps — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">Domain Registration — Next Steps</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You indicated you need a new domain name. We will help you select and register one as part of your onboarding. We will be in touch shortly to confirm the domain name before registering.</p>
        <p>Questions? Call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; (603) 922-2004 &nbsp;|&nbsp; turnkeyaiservices@gmail.com</p>
      </div>
    </div>`
  });
}

async function sendProfessionalEmailSetupEmail(client) {
  const d = client.data;
  if (!d.email) return;
  await sendEmail({
    to: d.email,
    subject: `📧 Professional Email Setup — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">Professional Email Setup</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You requested professional email setup (e.g. <strong>you@yourbusiness.com</strong>). We will configure this as part of your site build and send you login instructions once it is ready.</p>
        <p>Questions? Call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; (603) 922-2004 &nbsp;|&nbsp; turnkeyaiservices@gmail.com</p>
      </div>
    </div>`
  });
}

async function sendMiniMeEmail(client) {
  const d = client.data;
  if (!d.email) return;
  await sendEmail({
    to: d.email,
    subject: `🎬 Mini-Me Video — Next Steps — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">🎬 Your Mini-Me Video</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>You selected our Mini-Me AI video feature — a personalized welcome video featuring your likeness greeting visitors to your site.</p>
        <p>We will reach out shortly with a short script for your approval. Once approved, your video will be ready within 1-2 hours and added to your site automatically.</p>
        <p>Questions? Call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; (603) 922-2004 &nbsp;|&nbsp; turnkeyaiservices@gmail.com</p>
      </div>
    </div>`
  });
}

async function sendFreeVideoEmail(client) {
  const d = client.data;
  if (!d.email) return;
  await sendEmail({
    to: d.email,
    subject: `🎬 Your Free Welcome Video — ${d.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">🎬 Your Free Welcome Video</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">${d.businessName}</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${d.ownerName || 'there'},</p>
        <p>Your plan includes a free 60-second welcome video for your website. We will send you a script to review shortly. Once approved, the video will be live on your site within a couple of hours.</p>
        <p>Questions? Call <strong>(603) 922-2004</strong>.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; (603) 922-2004 &nbsp;|&nbsp; turnkeyaiservices@gmail.com</p>
      </div>
    </div>`
  });
}

async function sendPartnerApprovalEmail(partner) {
  if (!partner.email) return;
  await sendEmail({
    to: partner.email,
    subject: `🎉 Welcome — You Are Approved as a TurnkeyAI Partner!`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">Welcome, Partner! 🎉</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;">TurnkeyAI Territory Partner Program</p>
      </div>
      <div style="padding:28px 32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi ${partner.full_name || 'there'},</p>
        <p>Congratulations — your TurnkeyAI Partner application has been approved!</p>
        <p><strong>Your Hub Dashboard:</strong> <a href="https://turnkeyaiservices.com/pages/hub-dashboard.html">turnkeyaiservices.com/pages/hub-dashboard.html</a></p>
        <p><strong>Login ID:</strong> ${partner.hub_login_id || 'See your credentials email'}</p>
        <p><strong>Password:</strong> ${partner.hub_password || 'See your credentials email'}</p>
        <p>From your dashboard you can view your territory, track your clients, and access your referral signup link.</p>
        <p>Questions? Call or text <strong>(603) 922-2004</strong> or reply to this email.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#6B7280;">TurnkeyAI Services &nbsp;|&nbsp; <a href="https://turnkeyaiservices.com" style="color:#0066FF;">turnkeyaiservices.com</a> &nbsp;|&nbsp; (603) 922-2004</p>
      </div>
    </div>`
  });
}

module.exports = {
  sendEmail,
  sendSMS,
  sendWelcomeEmail,
  sendAdminNotification,
  sendPreviewEmail,
  sendApprovalEmail,
  sendDnsSelfDirectedEmail,
  sendDnsHandsFreeEmail,
  sendDomainRegistrationEmail,
  sendProfessionalEmailSetupEmail,
  sendMiniMeEmail,
  sendFreeVideoEmail,
  sendPartnerApprovalEmail,
};
