const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── SENDGRID HELPER ────────────────────────────────────────────────────────
async function sendEmail(to, subject, htmlContent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('[Email] No RESEND_API_KEY — skipping'); return; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TurnkeyAI Services <noreply@turnkeyaiservices.com>',
        to: [to],
        subject: subject,
        html: htmlContent
      })
    });
    if (res.ok) { console.log('[Email] Sent to ' + to); }
    else { console.error('[Email] Error:', await res.text()); }
  } catch (e) { console.error('[Email] Fetch error:', e.message); }
}

// ─── BUSINESS INTAKE ─────────────────────────────────────────────────────────
app.post('/api/intake', async (req, res) => {
  try {
    const d = req.body;
    const businessName = d.businessName || d.name || 'Unknown Business';
    const ownerName    = d.ownerName || d.contactName || 'Unknown';
    const email        = d.email || '';
    const phone        = d.phone || '';
    const businessType = d.businessType || d.industry || '';

    await sendEmail('turnkeyaiservices@gmail.com',
      '🚀 New Business Intake: ' + businessName,
      `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">New Business Site Request</h2>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Business:</strong> ${businessName}</p>
          <p><strong>Owner:</strong> ${ownerName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Type:</strong> ${businessType}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border:1px solid #e2e8f0;margin:16px 0;">
          <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;">${JSON.stringify(d, null, 2)}</pre>
        </div>
      </div>`
    );

    if (email) {
      await sendEmail(email, 'We received your request — ' + businessName,
        `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">Your site is on its way!</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p>Hi ${ownerName},</p>
            <p>We received your request for <strong>${businessName}</strong>. Your preview will be ready within 24 hours.</p>
            <p>Questions? Call <strong>(603) 922-2004</strong> or reply to this email.</p>
            <p>— The TurnkeyAI Team</p>
          </div>
        </div>`
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[Intake]', e.message);
    res.status(500).json({ success: false });
  }
});

// ─── TERRITORY PARTNER ───────────────────────────────────────────────────────
app.post('/api/territory-partner', async (req, res) => {
  try {
    const d = req.body;
    const name  = ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || d.contactName || 'Unknown';
    const email = d.email || '';

    await sendEmail('turnkeyaiservices@gmail.com',
      '🤝 New Territory Partner Application: ' + name,
      `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">New Territory Partner Application</h2>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${d.phone || ''}</p>
          <p><strong>Territory:</strong> ${d.territory || d.market || ''}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border:1px solid #e2e8f0;margin:16px 0;">
          <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;">${JSON.stringify(d, null, 2)}</pre>
        </div>
      </div>`
    );

    if (email) {
      await sendEmail(email, 'Your Territory Partner Application — TurnkeyAI',
        `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">Application Received!</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p>Hi ${name},</p>
            <p>We received your Territory Partner application and will be in touch within 24 hours.</p>
            <p>Questions? Call <strong>(603) 922-2004</strong> or reply to this email.</p>
            <p>— George Dickson, TurnkeyAI Services</p>
          </div>
        </div>`
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[Territory]', e.message);
    res.status(500).json({ success: false });
  }
});

// ─── FAMILY / PERSONAL INTAKE ────────────────────────────────────────────────
app.post('/api/family-intake', async (req, res) => {
  try {
    const d = req.body;
    const siteType    = d.siteType    || 'Personal Site';
    const familyName  = d.familyName  || d.shopName || d.siteName || 'Unknown';
    const contactName = d.contactName || d.ownerName || 'Unknown';
    const email       = d.email || '';
    const phone       = d.phone || '';
    const plan        = d.plan  || '$29/month';

    await sendEmail('turnkeyaiservices@gmail.com',
      '🌳 New Personal Site Request: ' + familyName,
      `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#6b2fa0,#4a1a7a);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">New TurnkeyAI Personal Site Request</h2>
          <p style="margin:8px 0 0;opacity:.8;">Type: ${siteType}</p>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Site / Family Name:</strong> ${familyName}</p>
          <p><strong>Contact:</strong> ${contactName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Plan:</strong> ${plan}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border:1px solid #e2e8f0;margin:16px 0;">
          <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;">${JSON.stringify(d, null, 2)}</pre>
        </div>
      </div>`
    );

    if (email) {
      await sendEmail(email, 'Your site is being built — TurnkeyAI Personal',
        `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#6b2fa0,#4a1a7a);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">Your site is on its way! ✨</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p>Hi ${contactName},</p>
            <p>We received your request for <strong>${familyName}</strong>. Your preview will be ready within 24 hours and sent to this email.</p>
            <p>You'll review everything before we go live — no surprises.</p>
            <p>Questions? Call <strong>(603) 922-2004</strong> or reply here.</p>
            <p>— George Dickson<br>TurnkeyAI Services · Bay St. Louis, Mississippi</p>
          </div>
        </div>`
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[FamilyIntake]', e.message);
    res.status(500).json({ success: false });
  }
});

// ─── CRAFTER STORE INTAKE ────────────────────────────────────────────────────
app.post('/api/crafter-intake', async (req, res) => {
  try {
    const d = req.body;
    const shopName  = d.shopName  || 'Unknown Shop';
    const ownerName = d.ownerName || d.contactName || 'Unknown';
    const email     = d.email     || '';
    const craftType = d.craftType || d.craftTypeOther || '';

    await sendEmail('turnkeyaiservices@gmail.com',
      '🧶 New Crafter Store Request: ' + shopName,
      `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#b84c2a,#8b3520);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">New Crafter Store Request</h2>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Shop Name:</strong> ${shopName}</p>
          <p><strong>Owner:</strong> ${ownerName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Craft Type:</strong> ${craftType}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border:1px solid #e2e8f0;margin:16px 0;">
          <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;">${JSON.stringify(d, null, 2)}</pre>
        </div>
      </div>`
    );

    if (email) {
      await sendEmail(email, 'Your crafter store is being built — TurnkeyAI',
        `<div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#b84c2a,#8b3520);padding:24px;color:#fff;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">Your shop is on its way! 🧶</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p>Hi ${ownerName},</p>
            <p>We received your request for <strong>${shopName}</strong>. Your store preview will be ready within 24 hours.</p>
            <p>Questions? Call <strong>(603) 922-2004</strong> or reply to this email.</p>
            <p>— The TurnkeyAI Team</p>
          </div>
        </div>`
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[CrafterIntake]', e.message);
    res.status(500).json({ success: false });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'TurnkeyAI Services', timestamp: new Date().toISOString() });
});

// ─── CATCH-ALL → index.html ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('🚀 TurnkeyAI Services running on port ' + PORT);
});

// ─── CHAT API (Cloudflare AI) ────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, context } = req.body;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiToken || !accountId) return res.json({ reply: "Chat is temporarily unavailable. Please call (603) 922-2004." });

    // Build messages array with system context
    const cfMessages = [
      { role: 'system', content: context || 'You are a helpful assistant for TurnkeyAI Services.' },
      ...(messages || [])
    ];

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: cfMessages, max_tokens: 300 })
      }
    );

    const data = await response.json();
    const reply = data.result?.response || "I'm not sure about that. Please call (603) 922-2004.";
    res.json({ reply });
  } catch (e) {
    console.error('[Chat]', e.message);
    res.json({ reply: "I'm having trouble right now. Please call (603) 922-2004." });
  }
});
