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
const SITE_BASE_URL = 'https://turnkeyaiservices.pages.dev';
const PORT = process.env.PORT || 3000;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'TurnkeyAI Backend Running', time: new Date().toISOString() });
});

// ── SERVE INTAKE FORM ─────────────────────────────────────────────────────
app.get('/intake', (req, res) => {
  res.redirect('https://turnkeyaiservices.pages.dev/turnkeyai-intake-form.html');
});

app.get('/form', (req, res) => {
  res.sendFile(__dirname + '/public/turnkeyai-intake-form.html');
});

// ── SEND EMAIL HELPER ─────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo = null }) {
  const msg = {
    to,
    from: { email: FROM_EMAIL, name: 'TurnkeyAI Services' },
    subject,
    html
  };
  if (replyTo) msg.replyTo = replyTo;
  try {
    await sgMail.send(msg);
    console.log('[TurnkeyAI] Email sent to', to);
    return true;
  } catch (e) {
    console.error('[TurnkeyAI] SendGrid error:', e.response?.body || e.message);
    return false;
  }
}

async function notifyAdmin(subject, html) {
  return sendEmail({ to: ADMIN_EMAIL, subject, html });
}

// ── SUBMISSION CREATED ─────────────────────────────────────────────────────
app.post('/api/submission-created', async (req, res) => {
  try {
    let data = {};
    let formName = '';

    const body = req.body;
    if (body && body.payload) {
      data = body.payload.data || body.payload || {};
      formName = body.payload.form_name || data['form-name'] || 'client-intake';
    } else {
      data = body || {};
      formName = data['form-name'] || data.form_name || 'client-intake';
    }

    console.log('[TurnkeyAI] Submission received, form:', formName);
    console.log('[TurnkeyAI] Email field:', data.email || data.Email || 'NOT FOUND');

    // Territory partner
    if (formName === 'territory-partner') {
      const name = ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
      await notifyAdmin(`New Territory Partner Application: ${name}`, `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:24px;color:white;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">New Territory Partner Application</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${data.email || ''}</p>
            <p><strong>Phone:</strong> ${data.phone || ''}</p>
            <p><strong>Market:</strong> ${data.market || data.territory || ''}</p>
            <p><strong>ZIP Codes:</strong> ${data.zipCodes || ''}</p>
            <p><strong>Industries:</strong> ${data.selectedIndustries || data.industry || ''}</p>
            <p><strong>Tier:</strong> ${data.selectedTier || ''}</p>
          </div>
        </div>`);
      return res.json({ handled: true, type: 'territory-partner' });
    }

    if (formName !== 'client-intake') {
      return res.json({ skipped: true, formName });
    }

    // Parse client intake data
    function ue(s) { return s ? s.replace(/\\'/g, "'").replace(/\\"/g, '"') : s; }
    const businessName = ue(data.businessName || data['Business Name'] || data.business_name || 'New Business');
    const ownerName = ue(data.ownerName || data['Owner Name'] || data.owner_name || 'Client');
    const email = data.email || data.Email || '';
    const phone = data.phone || data.Phone || '';
    const area = data.serviceArea || data.service_area || data.city || '';
    const location = [data.city, data.state].filter(Boolean).join(', ') || area;
    const payments = data.payments || data.paymentMethods || 'Cash, Credit Card';

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dh = [];
    days.forEach(d => {
      const v = data['hours_' + d] || data[d + '_hours'];
      if (v && v.toLowerCase() !== 'closed') dh.push(d.slice(0, 1).toUpperCase() + d.slice(1, 2) + ': ' + v);
    });
    const hours = dh.length > 0 ? dh.join(' | ') : (data.hours || 'Mon-Fri 8AM-6PM');

    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30);
    const siteName = data.siteName || (slug + '-' + Date.now().toString(36));
    const previewName = 'preview-' + siteName;
    const reviewUrl = `${SITE_BASE_URL}/client-review.html?site=${previewName}&biz=${encodeURIComponent(businessName)}&email=${encodeURIComponent(email)}&final=${encodeURIComponent(siteName)}`;

    console.log('[TurnkeyAI] Business:', businessName, '| Email:', email);

    // ── SEND ADMIN EMAIL ──
    await notifyAdmin(`📥 NEW SUBMISSION: ${businessName}`, `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:white;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">👀 New Client Submission</h2>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Business:</strong> ${businessName}</p>
          <p><strong>Owner:</strong> ${ownerName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Area:</strong> ${area}</p>
          <p><strong>Review URL:</strong> <a href="${reviewUrl}">${reviewUrl}</a></p>
          <p><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Open Admin Dashboard →</a></p>
        </div>
      </div>`);

    // ── SEND CLIENT EMAIL ──
    if (email) {
      await sendEmail({
        to: email,
        subject: `👀 Your Website is Ready to Review — ${businessName}`,
        html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:40px 24px;text-align:center;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;">Your Website is Ready! 🎉</h1>
          </div>
          <div style="padding:32px;background:white;border:1px solid #e2e8f0;">
            <p>Hi ${ownerName}, your AI-powered website for <strong>${businessName}</strong> is ready to review.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="https://${previewName}.pages.dev" style="display:inline-block;padding:16px 40px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:18px;">👀 Preview Your Website</a>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${reviewUrl}" style="display:inline-block;padding:14px 36px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin-right:8px;">✅ Approve & Go Live</a>
              <a href="${reviewUrl}&action=changes" style="display:inline-block;padding:14px 36px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✏️ Request Changes</a>
            </div>
            <p style="color:#92400E;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:16px;font-size:14px;">If we don't hear from you within 72 hours, we'll go ahead and make your site live.</p>
          </div>
          <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">
            TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com
          </div>
        </div>`
      });
      console.log('[TurnkeyAI] Client email sent to', email);
    } else {
      console.warn('[TurnkeyAI] No email address in submission - cannot send client email');
    }

    return res.json({ success: true, businessName, email, reviewUrl });

  } catch (e) {
    console.error('[TurnkeyAI] Submission error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── CLIENT REVIEW ACTION ───────────────────────────────────────────────────
app.post('/api/client-review-action', async (req, res) => {
  try {
    const { action, previewSite, finalSite, email, businessName, ownerName, changeType, currentInfo, correctedInfo, additionalNotes } = req.body;

    if (action === 'approve') {
      await notifyAdmin(`✅ CLIENT APPROVED: ${businessName}`, `
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Preview:</strong> <a href="https://${previewSite}.pages.dev">https://${previewSite}.pages.dev</a></p>
        <p><strong>Action needed:</strong> Deploy the live site manually from Cloudflare Pages.</p>`);
      return res.json({ success: true, action: 'approve' });

    } else if (action === 'changes') {
      await notifyAdmin(`✏️ Change Request: ${businessName}`, `
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Change type:</strong> ${changeType || ''}</p>
        <p><strong>Current:</strong> ${currentInfo || ''}</p>
        <p><strong>Should be:</strong> ${correctedInfo || ''}</p>
        <p><strong>Notes:</strong> ${additionalNotes || 'None'}</p>`);
      return res.json({ success: true, action: 'changes_received' });

    } else if (action === 'resend-review') {
      if (email) {
        const reviewUrl = `${SITE_BASE_URL}/client-review.html?site=${previewSite}&biz=${encodeURIComponent(businessName)}&email=${encodeURIComponent(email)}&final=${encodeURIComponent(finalSite)}`;
        await sendEmail({
          to: email,
          subject: `🔄 Updated Preview: ${businessName}`,
          html: `
            <p>Hi ${ownerName || 'there'}, your updated preview is ready.</p>
            <p><a href="https://${previewSite}.pages.dev" style="display:inline-block;padding:12px 24px;background:#0066FF;color:white;border-radius:8px;text-decoration:none;">👀 Preview</a></p>
            <p><a href="${reviewUrl}" style="display:inline-block;padding:12px 24px;background:#10B981;color:white;border-radius:8px;text-decoration:none;">✅ Approve</a></p>`
        });
      }
      return res.json({ success: true, action: 'review_resent' });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (e) {
    console.error('[TurnkeyAI] Review action error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── PARTNER ACTION ─────────────────────────────────────────────────────────
app.post('/api/partner-action', async (req, res) => {
  try {
    const { action, partner } = req.body;
    let subject, html;

    if (action === 'approve') {
      subject = "🎉 Welcome to TurnkeyAI — You're Approved!";
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px;">
        <h2>🎉 You're Approved, ${partner.name}!</h2>
        <p><strong>Territory:</strong> ${partner.territory}</p>
        <p><strong>License Level:</strong> ${partner.tier}</p>
        <p>Next steps: Pay your license fee, your site goes live in 24 hours, then start selling at $99/month per client (you keep 60%).</p>
        <p>Questions? Call (603) 922-2004</p>
      </div>`;
    } else if (action === 'decline') {
      subject = 'TurnkeyAI Territory Partner Application Update';
      html = `<p>Hi ${partner.name}, thank you for your interest. We've decided not to move forward at this time.<br><br>— George Dickson, TurnkeyAI Services</p>`;
    } else {
      subject = '🎉 TurnkeyAI — Approved with Modifications';
      html = `<p>Hi ${partner.name}, your application was approved with modifications. Approved ZIPs: ${partner.approvedZips || '-'}. Contact us to confirm. (603) 922-2004</p>`;
    }

    await sendEmail({ to: partner.email, subject, html, replyTo: ADMIN_EMAIL });
    await notifyAdmin(`✅ Partner ${action}: ${partner.name}`, `<p>${partner.name} — ${action} | Territory: ${partner.territory}</p>`);
    return res.json({ sent: true });

  } catch (e) {
    console.error('[TurnkeyAI] Partner action error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── START SERVER ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TurnkeyAI] Backend running on port ${PORT}`);
});
