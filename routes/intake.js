// ════════════════════════════════════════════════
// ── routes/intake.js — Client intake/onboarding
// ── Future: multi-step intake, file uploads, instant preview
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { clients, saveClient } = require('../lib/db');
const { makeToken, validate } = require('../lib/helpers');
const { sendEmail, ADMIN_EMAIL, sendMiniMeEmail, sendFreeVideoEmail, sendDnsSelfDirectedEmail, sendDnsHandsFreeEmail, sendDomainRegistrationEmail, sendProfessionalEmailSetupEmail } = require('../lib/email');
const { generateSiteHTML } = require('../lib/site-generator');
const { encrypt } = require('../lib/crypto-helpers');
const { triggerCloudflareDnsSetup } = require('../lib/dns-automation');

const BASE_URL    = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const ADMIN_KEY   = process.env.ADMIN_KEY;
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions. Please wait a few minutes and try again.' }
});

// ── AI Assist rate limiter — separate, more generous ──
const aiAssistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a few minutes and try again.' }
});

// ── Generate unique Login ID (TK-XXXXXX) ──
function generateLoginId() {
  const crypto = require('crypto');
  return 'TK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

// ── Shared intake handler ──
async function handleIntakeSubmission(data, res) {
  const id = data.id || ('client_' + Date.now());
  const previewToken = makeToken();
  const dashLoginId = generateLoginId();
  clients[id] = {
    id, status: 'pending', data: { ...data, id }, previewToken,
    dashLoginId,
    dashToken: null, dashPassword: null, liveUrl: null, cfProjectName: null,
    miniMeConsent: null, miniMeConsentAt: null,
    miniMeSubscribed: false,
    freeVideoRequested: data.wants_free_video === 'yes' || data.wantsFreeVideo === 'yes',
    twilioNumber: null, forwardingNumber: null, businessHoursJson: null, telephonyEnabled: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };

  // ── Encrypt registrar credentials before storing ──
  // Remove plaintext from both the client.data payload AND the raw data reference
  // so credentials never appear in the DB, in-memory cache, or admin email
  if (clients[id].data.registrarUsername) {
    clients[id].registrarUsernameEnc = encrypt(clients[id].data.registrarUsername);
    delete clients[id].data.registrarUsername;
    delete data.registrarUsername;
  }
  if (clients[id].data.registrarPassword) {
    clients[id].registrarPasswordEnc = encrypt(clients[id].data.registrarPassword);
    delete clients[id].data.registrarPassword;
    delete data.registrarPassword;
  }

  await saveClient(clients[id]);

  if (data.logoBase64 && data.logoFileName) {
    try {
      const ext = (data.logoFileName.split('.').pop() || 'png').toLowerCase();
      const logoFile = `logo_${id}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, logoFile), Buffer.from(data.logoBase64, 'base64'));
      clients[id].logoFile = logoFile;
      clients[id].data.logoUrl = `${BASE_URL}/uploads/${logoFile}`;
      delete clients[id].data.logoBase64;
      await saveClient(clients[id]);
    } catch(e) { console.error('[logo save]', e.message); }
  }

  if ((data.paymentMethod || '').toLowerCase() === 'partner') {
    const partnerPreviewUrl = `${BASE_URL}/preview/${previewToken}`;
    if (data.email) {
      await sendEmail({
        to: data.email,
        subject: `🎉 Your website preview is ready — ${data.businessName || 'Your Business'}`,
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${data.ownerName||'there'} — your preview is ready.</p></div><div style="padding:32px;"><div style="text-align:center;margin-bottom:24px;"><a href="${partnerPreviewUrl}" style="background:#0066FF;color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;display:inline-block;">👁️ View My Website Preview</a></div><div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center;"><p style="font-size:14px;color:#1e40af;margin:0;"><strong>Your Login ID:</strong> <span style="font-family:monospace;font-size:18px;letter-spacing:2px;color:#0066FF;">${dashLoginId}</span></p><p style="font-size:12px;color:#6B7280;margin:8px 0 0;">Save this — you'll need it to log into your dashboard.</p></div><p style="font-size:14px;color:#6B7280;">Questions? Email <a href="mailto:turnkeyaiservices@gmail.com">turnkeyaiservices@gmail.com</a></p></div></div>`
      }).catch(e => console.error('[partner preview email]', e.message));
    }
    res.json({ success: true, id, preview: partnerPreviewUrl, partner: true });
    (async () => {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `🤝 Partner Submission: ${data.businessName || 'New Client'} — Preview Ready`,
        html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🤝 Partner Bypass Submission</h1><p style="color:rgba(255,255,255,.8);margin:8px 0 0;">${data.businessName || ''} — preview sent to client</p></div><div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><p><strong>Business:</strong> ${data.businessName || '—'}</p><p><strong>Owner:</strong> ${data.ownerName || '—'}</p><p><strong>Email:</strong> ${data.email || '—'}</p><p><strong>Phone:</strong> ${data.phone || '—'}</p><p><strong>Industry:</strong> ${data.industry || '—'}</p><p><strong>City:</strong> ${data.city || '—'}</p><p><strong>Login ID:</strong> ${dashLoginId}</p><p style="margin-top:20px;"><a href="${partnerPreviewUrl}" style="background:#0066FF;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">👁️ View Preview</a></p></div></div>`
      }).catch(e => console.error('[partner admin email]', e.message));
      if (data.wants_mini_me === 'yes' || data.wantsMiniMe === 'yes') {
        sendMiniMeEmail(clients[id]).catch(()=>{});
      } else if (data.wants_free_video === 'yes' || data.wantsFreeVideo === 'yes') {
        sendFreeVideoEmail(clients[id]).catch(()=>{});
      }
      // ── DNS / Domain emails (partner path) ──
      fireDnsDomainEmails(clients[id]).catch(e => console.error('[dns/domain emails]', e.message));
      // ── Cloudflare DNS automation (partner path) ──
      triggerDnsAutomation(clients[id]);
    })();
    return;
  }

  const previewUrl = `${BASE_URL}/preview/${previewToken}`;
  const approveUrl = `${BASE_URL}/api/approve/${id}?adminKey=${ADMIN_KEY}`;
  const d = data;
  const row = (label, val) => val ? `<tr><td style="padding:9px 14px;font-weight:600;color:#374151;background:#f9fafb;width:170px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${val}</td></tr>` : '';
  const tableWrap = rows => `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">${rows}</table>`;
  const h2 = txt => `<h2 style="color:#0066FF;font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${txt}</h2>`;
  const servicesList = Object.keys(d).filter(k => k.startsWith('service_') && d[k]==='on').map(k => { const n=k.replace('service_',''); return `${n.replace(/_/g,' ')}${d['price_'+n]?' — '+d['price_'+n]:''}`; });
  const days2 = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hoursLines = days2.filter(dy => d['day_'+dy]).map(dy => `<li>${dy.charAt(0).toUpperCase()+dy.slice(1)}: ${d['hours_'+dy]||'Open'}</li>`);
  const domainBlock = d.hasDomain === 'yes'
    ? `<div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#92400e;margin:0 0 10px;">🌐 DNS SETUP NEEDED — Customer Has Domain</p><p style="margin:0 0 6px;font-size:14px;"><strong>Domain:</strong> ${d.existingDomain||'(not provided)'}</p><p style="margin:0 0 6px;font-size:14px;"><strong>Registrar:</strong> ${(d.domainRegistrar||'unknown').replace(/_/g,' ')}</p><p style="margin:0 0 6px;font-size:14px;"><strong>Keep email?</strong> ${d.keepExistingEmail==='yes'?'✅ YES — do NOT change MX records':'❌ No'}</p>${d.emailProvider?`<p style="margin:0 0 6px;font-size:14px;"><strong>Email Provider:</strong> ${d.emailProvider}</p>`:''}${d.emailsToPreserve?`<p style="margin:0 0 6px;font-size:14px;"><strong>Emails to Preserve:</strong> ${d.emailsToPreserve}</p>`:''}${d.dnsSetupPreference?`<p style="margin:0 0 6px;font-size:14px;"><strong>Setup Preference:</strong> ${d.dnsSetupPreference==='hands_free'?'🔧 Hands-Free (TurnkeyAI handles everything)':'📋 Self-Directed (client does it with our instructions)'}</p>`:''}${d.registrarUsername?`<p style="margin:0 0 6px;font-size:14px;"><strong>Registrar Credentials:</strong> ✅ Provided (username: ${d.registrarUsername})</p>`:''}${d.wantsProfessionalEmail?`<p style="margin:0;font-size:14px;"><strong>Wants Professional Email?</strong> ${d.wantsProfessionalEmail==='yes'?'✅ YES':'❌ No'}</p>`:''}</div>`
    : d.hasDomain === 'no'
    ? `<div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#3730a3;margin:0 0 10px;">🆕 DOMAIN REGISTRATION NEEDED</p><p style="margin:0 0 6px;font-size:14px;"><strong>Suggested:</strong> ${d.suggestedDomain||'(ask client)'}</p><p style="margin:0 0 6px;font-size:14px;"><strong>Action:</strong> Register on Namecheap → Cloudflare DNS → Zoho email → Point to Railway.</p>${d.wantsProfessionalEmail?`<p style="margin:0;font-size:14px;"><strong>Wants Professional Email?</strong> ${d.wantsProfessionalEmail==='yes'?'✅ YES':'❌ No'}</p>`:''}</div>`
    : '';
  const addons = [];
  if (d.wants_mini_me==='yes'||d.wantsMiniMe==='yes') addons.push('🤖 Mini-Me AI Avatar ($59/mo)');
  if ((d.wants_free_video==='yes'||d.wantsFreeVideo==='yes')&&d.wants_mini_me!=='yes') addons.push('🎬 Free 60-Second Promo Video');
  if (d.addon_after_hours==='yes'||d.wantsAfterHours==='yes') addons.push('📞 After Hours Answering');
  if (d.addon_missed_call==='yes'||d.wantsMissedCall==='yes') addons.push('📱 Missed Call Text Return');
  const payMethodsStr = ['cash','card','check','venmo','cashapp','zelle'].filter(p=>d['pay_'+p]).join(', ');

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `🆕 New Client: ${d.businessName||'Unknown'} — ${d.city||''}, ${d.state||''} — ${(d.industry||'').replace(/_/g,' ')}`,
    html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:24px 32px;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;font-size:22px;">🆕 New Client Submission</h1><p style="color:rgba(255,255,255,0.82);margin:6px 0 0;font-size:14px;">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p></div><div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;"><div style="background:#e0f2fe;border:2px solid #0066FF;border-radius:10px;padding:14px 18px;margin-bottom:22px;"><p style="margin:0;font-size:14px;"><strong>🔑 Client Login ID:</strong> <span style="font-family:monospace;font-size:16px;letter-spacing:2px;color:#0066FF;">${dashLoginId}</span></p></div>${domainBlock}${h2('Business Information')}${tableWrap(`${row('Business Name',d.businessName)}${row('Owner',d.ownerName)}${row('Industry',(d.industry||'').replace(/_/g,' '))}${row('Phone',d.phone)}${row('Email',d.email)}${row('Address',[d.address,d.city||d.location,d.state,d.zip].filter(Boolean).join(', '))}${row('Years in Business',d.yearsInBusiness)}`)}${servicesList.length?`${h2('Services & Pricing')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${servicesList.map(s=>'<li>'+s+'</li>').join('')}</ul>`:''}${hoursLines.length?`${h2('Business Hours')}<ul style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 14px 14px 30px;margin:0 0 22px;line-height:1.9;">${hoursLines.join('')}</ul>`:''}${h2('About the Business')}${tableWrap(`${row('Business Story',d.aboutUs)}${row('Mission',d.missionStatement)}${row('Awards',d.awards)}`)}${h2('Other')}${tableWrap(`${row('Competitive Advantage',d.competitiveAdvantage)}${row('Payment Methods',payMethodsStr)}${row('Color Preference',d.colorPreference)}${row('Referral Source',d.referralSource)}`)}${addons.length?`<div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:18px 22px;margin-bottom:22px;"><p style="font-weight:700;color:#065f46;margin:0 0 10px;">🎯 Add-Ons Selected</p><ul style="margin:0;padding-left:20px;line-height:2;">${addons.map(a=>'<li><strong>'+a+'</strong></li>').join('')}</ul></div>`:''}<div style="border-top:1px solid #e5e7eb;padding-top:22px;display:flex;gap:12px;flex-wrap:wrap;"><a href="${approveUrl}" style="background:linear-gradient(135deg,#00D68F,#00b377);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">✅ Approve & Go Live</a><a href="${previewUrl}" style="background:#0066FF;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;">👁️ Preview Site</a></div></div></div>`
  });

  if (d.email) {
    const clientAddons = [];
    if (d.wants_mini_me==='yes'||d.wantsMiniMe==='yes') clientAddons.push('<li>🤖 <strong>Mini-Me AI Avatar</strong> — separate email with details on the way</li>');
    else if (d.wants_free_video==='yes'||d.wantsFreeVideo==='yes') clientAddons.push('<li>🎬 <strong>Free 60-Second Promo Video</strong> — separate email with details on the way</li>');
    if (d.addon_after_hours==='yes') clientAddons.push('<li>📞 <strong>After Hours Answering</strong> — activated when site goes live</li>');
    if (d.addon_missed_call==='yes') clientAddons.push('<li>📱 <strong>Missed Call Text Return</strong> — activated when site goes live</li>');
    await sendEmail({
      to: d.email,
      subject: `🎉 Your website preview is ready — ${d.businessName||'Your Business'}`,
      html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:32px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:white;margin:0;font-size:28px;">We Got It! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:10px 0 0;">Hi ${d.ownerName||'there'} — your website preview is ready.</p></div><div style="padding:32px;"><p style="font-size:16px;line-height:1.75;margin:0 0 24px;">We've built a preview of your new <strong>${d.businessName||'business'}</strong> website.</p><div style="text-align:center;margin:0 0 28px;"><a href="${previewUrl}" style="background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:20px 44px;border-radius:12px;text-decoration:none;font-weight:700;font-size:18px;display:inline-block;">👁️ View My Website Preview</a></div><div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center;"><p style="font-size:14px;color:#1e40af;margin:0 0 8px;"><strong>Your Login ID:</strong></p><div style="font-family:monospace;font-size:24px;font-weight:700;letter-spacing:4px;color:#0066FF;">${dashLoginId}</div><p style="font-size:12px;color:#6B7280;margin:8px 0 0;">Save this — you'll need it to log into your dashboard when your site goes live.</p></div><div style="background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;"><p style="font-weight:700;color:#065f46;margin:0;font-size:15px;">Review your preview — the approve button is inside the preview page.</p></div>${clientAddons.length?`<ul style="margin:0 0 20px;padding-left:20px;line-height:2.2;font-size:14px;">${clientAddons.join('')}</ul>`:''}<p style="font-size:14px;color:#6B7280;margin:0 0 6px;">Have a logo or photos? Email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p><p style="font-size:14px;color:#6B7280;">Questions? Email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#0066FF;">turnkeyaiservices@gmail.com</a></p></div></div>`
    });
    if (d.wants_mini_me==='yes'||d.wantsMiniMe==='yes') {
      sendMiniMeEmail(clients[id]).catch(e => console.error('[miniMe email]', e.message));
    } else if (d.wants_free_video==='yes'||d.wantsFreeVideo==='yes') {
      sendFreeVideoEmail(clients[id]).catch(e => console.error('[video email]', e.message));
    }
    // ── DNS / Domain emails (standard path) ──
    fireDnsDomainEmails(clients[id]).catch(e => console.error('[dns/domain emails]', e.message));
    // ── Cloudflare DNS automation (standard path) ──
    triggerDnsAutomation(clients[id]);
  }

  res.json({ success: true, id, preview: previewUrl });
}

// ── Fire DNS / domain-related emails based on intake data ──
async function fireDnsDomainEmails(client) {
  const d = client.data;
  if (!d.email) return;

  // Self-directed DNS instructions
  if (d.dnsApproach === 'self_directed') {
    await sendDnsSelfDirectedEmail(client).catch(e => console.error('[dns self-directed email]', e.message));
  }

  // Hands-free DNS confirmation
  if (d.dnsApproach === 'hands_free') {
    await sendDnsHandsFreeEmail(client).catch(e => console.error('[dns hands-free email]', e.message));
  }

  // New domain registration
  if (d.domainStatus === 'no') {
    await sendDomainRegistrationEmail(client).catch(e => console.error('[domain registration email]', e.message));
  }

  // Professional email setup
  if (d.wantsProfessionalEmail === 'yes') {
    await sendProfessionalEmailSetupEmail(client).catch(e => console.error('[professional email setup]', e.message));
  }
}

// ── Trigger Cloudflare DNS automation for hands-free clients ──
// Non-fatal: runs in background, never blocks the intake response
function triggerDnsAutomation(client) {
  const d = client.data;
  const isHandsFree = d.dnsSetupPreference === 'hands_free' || d.dnsApproach === 'hands_free';
  const domain = d.existingDomain;
  if (!isHandsFree || !domain) return;

  triggerCloudflareDnsSetup(domain)
    .then(result => {
      if (result.success) {
        console.log(`[dns-automation] ✅ DNS configured for ${domain} — zone: ${result.zoneId}`);
      } else {
        console.warn(`[dns-automation] ⚠️ DNS setup incomplete for ${domain}: ${result.error}`);
      }
    })
    .catch(err => console.error('[dns-automation] Unexpected error for', domain, err.message));
}

// ── POST /api/submission-created ──
router.post('/api/submission-created', postLimiter, async (req, res) => {
  try {
    const validErr = validate(req.body, [['businessName','Business Name'],['email','Email'],['phone','Phone']]);
    if (validErr) return res.status(400).json({ error: validErr });
    await handleIntakeSubmission(req.body, res);
  } catch(err) { console.error('[/api/submission-created]', err); res.status(500).json({ error: 'Submission failed' }); }
});

// ── POST /api/intake (legacy) ──
router.post('/api/intake', postLimiter, async (req, res) => {
  try {
    const validErr = validate(req.body, [['businessName','Business Name'],['email','Email']]);
    if (validErr) return res.status(400).json({ error: validErr });
    await handleIntakeSubmission(req.body, res);
  } catch(err) { console.error('[/api/intake]', err); res.status(500).json({ error: 'Failed' }); }
});

// ════════════════════════════════════════════════
// ── POST /api/ai-assist
// ── AI-powered content drafting for intake form fields.
// ── Calls OpenAI gpt-4o-mini server-side — key never exposed to browser.
// ── Rate limited independently from intake submissions.
// ════════════════════════════════════════════════
router.post('/api/ai-assist', aiAssistLimiter, async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ ok: false, error: 'AI assist is not configured.' });
    }

    const { section, bullets, businessName, industry, city, state, services } = req.body;

    if (!section) {
      return res.status(400).json({ ok: false, error: 'Missing section parameter.' });
    }

    // ── Build section-specific prompt ──
    const industryLabel = (industry || 'local service business').replace(/_/g, ' ');
    const locationStr   = [city, state].filter(Boolean).join(', ') || 'your area';
    const bizName       = businessName || 'this business';
    const bulletText    = (bullets || '').trim();
    const serviceList   = (services || '').trim();

    let systemPrompt = '';
    let userPrompt   = '';

    if (section === 'aboutUs') {
      systemPrompt = `You write About Us sections for small business websites. Write in a warm, professional tone. Be specific — use the details provided. Write 2–3 paragraphs. Do not use placeholder text. Do not mention TurnkeyAI. Return plain text only, no markdown.`;
      userPrompt   = `Write an About Us section for ${bizName}, a ${industryLabel} business in ${locationStr}.${bulletText ? '\n\nDetails provided by the owner:\n' + bulletText : ''}\n\nMake it feel personal and trustworthy. Emphasize local roots, experience, and reliability.`;

    } else if (section === 'competitiveAdvantage') {
      systemPrompt = `You write competitive advantage copy for small business websites. Write 3–4 short, punchy advantage statements — each 1–2 sentences. Be specific, not generic. No bullet symbols. Separate each with a line break. Return plain text only.`;
      userPrompt   = `Write competitive advantage statements for ${bizName}, a ${industryLabel} in ${locationStr}.${bulletText ? '\n\nOwner notes:\n' + bulletText : ''}\n\nFocus on what makes them different and why customers should choose them.`;

    } else if (section === 'ownerBackground') {
      systemPrompt = `You write owner bio copy for small business websites. Write 2–3 sentences in third person. Make it credible and human. Return plain text only, no markdown.`;
      userPrompt   = `Write an owner background paragraph for the owner of ${bizName}, a ${industryLabel} in ${locationStr}.${bulletText ? '\n\nOwner details:\n' + bulletText : ''}\n\nTone: professional but approachable.`;

    } else if (section === 'tagline') {
      systemPrompt = `You write taglines and mission statements for small businesses. Return exactly 3 options, numbered 1. 2. 3. Each should be one sentence or phrase, under 12 words. Be specific to the industry and location. Return plain text only.`;
      userPrompt   = `Write 3 tagline options for ${bizName}, a ${industryLabel} in ${locationStr}.${bulletText ? '\n\nOwner notes:\n' + bulletText : ''}\n\nMake them memorable, specific, and honest.`;

    } else if (section === 'faq') {
      // ── FIXED: explicit format, no preamble, no numbering, no markdown ──
      systemPrompt = `You generate FAQ question-and-answer pairs for small business websites. Your entire response must contain ONLY the Q&A pairs — no introduction, no explanation, no preamble, no closing statement, no numbering, no markdown, no extra text of any kind. Begin your response immediately with Q: on the very first line. Use this exact format for every pair:\nQ: [question text]\nA: [answer text]\n\nLeave one blank line between each pair. Do not deviate from this format under any circumstances.`;
      userPrompt   = `Generate exactly 10 unique FAQ pairs for ${bizName}, a ${industryLabel} business in ${locationStr}.${serviceList ? '\n\nServices offered: ' + serviceList : ''}${bulletText ? '\n\nAdditional context: ' + bulletText : ''}\n\nRules:\n- Every question must cover a completely different topic\n- Do NOT ask about hours, location, address, or phone number — those are already on the website\n- Focus on: payment methods, warranty/guarantee, what to expect on first visit, service area, emergency availability, licensing and insurance, free estimates, cancellation policy, job duration, insurance claims, pet/child safety, unique policies\n- All answers must sound like they come from the business owner — conversational and specific\n- Begin your response immediately with Q: — no introduction or preamble of any kind`;

    } else {
      return res.status(400).json({ ok: false, error: 'Unknown section: ' + section });
    }

    // ── FAQ needs more tokens to generate all 10 pairs ──
    const maxTokens = section === 'faq' ? 2000 : 800;

    // ── Call OpenAI using native fetch (Node 18+) ──
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   }
        ]
      })
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('[ai-assist] OpenAI error', openaiRes.status, errBody);
      return res.status(502).json({ ok: false, error: 'AI service error. Please try again.' });
    }

    const openaiData = await openaiRes.json();
    const text = (openaiData.choices?.[0]?.message?.content || '').trim();

    if (!text) {
      return res.status(502).json({ ok: false, error: 'AI returned an empty response. Please try again.' });
    }

    res.json({ ok: true, text });

  } catch (err) {
    console.error('[/api/ai-assist]', err);
    res.status(500).json({ ok: false, error: 'AI assist failed. Please try again.' });
  }
});

console.log('[module] routes/intake.js loaded');
module.exports = router;
