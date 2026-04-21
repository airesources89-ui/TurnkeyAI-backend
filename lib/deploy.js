// ════════════════════════════════════════════════
// ── lib/deploy.js — Cloudflare Pages deployment
// ── Future: add rollback support, deployment history,
// ── staging vs production, multi-page deploys
// ════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { saveClient } = require('./db');
const { makeToken, makePassword, makeSlug } = require('./helpers');
const { sendEmail, ADMIN_EMAIL, sendCredentialsEmail, sendMiniMeEmail, sendFreeVideoEmail, sendPhoneSystemReadyEmail } = require('./email');
const { provisionTwilioNumber } = require('./telephony');
const { generateSiteHTML } = require('./site-generator');

const BASE_URL       = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;

// ── Deploy to Cloudflare Pages ──
// content: string (single index.html) OR object { index:'...', pricing:'...', ... }
async function deployToCloudflarePages(projectName, content) {
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
    await new Promise(r => setTimeout(r, 3000));
  }
  const { execSync } = require('child_process');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tkai-'));
  try {
    // Write files: string = single index.html, object = multiple pages
    if (typeof content === 'string') {
      fs.writeFileSync(path.join(tmpDir, 'index.html'), content, 'utf8');
    } else {
      Object.keys(content).forEach(name => {
        const filename = name === 'index' ? 'index.html' : name + '.html';
        fs.writeFileSync(path.join(tmpDir, filename), content[name], 'utf8');
      });
    }
    // ── Auto-generate sitemap.xml and robots.txt for every deployment ──
    const siteBaseUrl = `https://${projectName}.pages.dev`;
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteBaseUrl}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
  <url><loc>${siteBaseUrl}/pricing.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${siteBaseUrl}/scheduling.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${siteBaseUrl}/messaging.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>`;
    const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${siteBaseUrl}/sitemap.xml`;
    fs.writeFileSync(path.join(tmpDir, 'sitemap.xml'), sitemapXml, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'robots.txt'), robotsTxt, 'utf8');
    const cmd = `npx wrangler@3 pages deploy "${tmpDir}" --project-name="${projectName}" --branch=main --commit-dirty=true`;
    try {
      execSync(cmd, {
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: CF_API_TOKEN },
        stdio: 'pipe',
        timeout: 60000
      });
    } catch(err) {
      const detail = err.stderr ? err.stderr.toString() : err.message;
      throw new Error('Wrangler deploy failed: ' + detail);
    }
    return { url: `https://${projectName}.pages.dev` };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
  }
}

// ── Ping Google Indexing API after first deployment ──
// Non-fatal: logs result but never throws. Skipped if env var absent.
async function pingGoogleIndexing(url) {
  try {
    const saKeyRaw = process.env.GOOGLE_INDEXING_SA_KEY;
    if (!saKeyRaw) {
      console.log('[Google Indexing] GOOGLE_INDEXING_SA_KEY not set — skipping ping.');
      return;
    }
    const serviceAccount = JSON.parse(Buffer.from(saKeyRaw, 'base64').toString('utf8'));
    const crypto = require('crypto');

    // ── Build JWT for Google OAuth2 ──
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/indexing',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');
    const jwt = `${signingInput}.${signature}`;

    // ── Exchange JWT for access token ──
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.warn('[Google Indexing] Failed to get access token:', JSON.stringify(tokenData));
      return;
    }

    // ── Submit URL to Google Indexing API ──
    const indexRes = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.access_token}`
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' })
    });
    const indexData = await indexRes.json();
    if (indexRes.ok) {
      console.log(`[Google Indexing] ✅ Pinged successfully: ${url}`);
    } else {
      console.warn(`[Google Indexing] ⚠️ Ping failed for ${url}:`, JSON.stringify(indexData));
    }
  } catch (err) {
    console.warn('[Google Indexing] Unexpected error — ping skipped:', err.message);
  }
}

// ── Run deploy (first-time: generates tokens, sends credentials email) ──
async function runDeploy(client) {
  const dashToken   = makeToken();
  const dashPassword= makePassword();
  const projectName = `turnkeyai-${makeSlug(client.data.businessName)}`;
  const sitePages   = generateSiteHTML(client.data, false, client);
  const deployment  = await deployToCloudflarePages(projectName, sitePages);
  client.status       = 'active';
  client.dashToken    = dashToken;
  client.dashPassword = dashPassword;
  client.liveUrl      = deployment.url || `https://${projectName}.pages.dev`;
  client.cfProjectName= projectName;
  client.approvedAt   = new Date().toISOString();
  client.updatedAt    = new Date().toISOString();
  await saveClient(client);
  // ── Ping Google Indexing API (fire-and-forget — never blocks deploy) ──
  pingGoogleIndexing(client.liveUrl).catch(err => console.warn('[Google Indexing] ping error:', err.message));
  await sendCredentialsEmail(client);
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `✅ LIVE: ${client.data.businessName}`,
    html: `<p><strong>${client.data.businessName}</strong> is live at <a href="${client.liveUrl}">${client.liveUrl}</a></p><p>Dashboard password: <strong>${client.dashPassword}</strong></p><p>${client.data.ownerName} — ${client.data.email} — ${client.data.phone}</p>`
  });
  if (client.data.addon_after_hours === 'yes' || client.data.addon_missed_call === 'yes') {
    const phoneD = client.data;
    const phoneServices = [];
    if (phoneD.addon_after_hours === 'yes') phoneServices.push('After-Hours AI Answering ✅');
    if (phoneD.addon_missed_call === 'yes') phoneServices.push('Missed Call Text-Back ✅');
    const phoneDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const phoneHoursLines = phoneDays.filter(dy => phoneD['day_' + dy]).map(dy => '<li>' + dy.charAt(0).toUpperCase() + dy.slice(1) + ': ' + (phoneD['hours_' + dy] || 'Open') + '</li>').join('');
    const phoneServiceList = Object.keys(phoneD).filter(k => k.startsWith('service_') && phoneD[k] === 'on').map(k => '<li>' + k.replace('service_','').replace(/_/g,' ') + '</li>').join('');
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📞 Phone Services Needed: ${phoneD.businessName}`,
      html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;"><div style="background:linear-gradient(135deg,#6366f1,#1a1a2e);padding:24px 28px;border-radius:12px 12px 0 0;"><h2 style="color:#c4b5fd;margin:0;">📞 Phone Services — Provisioning Required</h2><p style="color:rgba(255,255,255,.7);margin:8px 0 0;font-size:14px;">${phoneD.businessName}</p></div><div style="padding:24px 28px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><table style="width:100%;border-collapse:collapse;margin-bottom:20px;"><tr><td style="padding:8px;font-weight:700;width:160px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Business</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${phoneD.businessName || '—'}</td></tr><tr><td style="padding:8px;font-weight:700;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Owner</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${phoneD.ownerName || '—'}</td></tr><tr><td style="padding:8px;font-weight:700;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Email</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${phoneD.email || '—'}</td></tr><tr><td style="padding:8px;font-weight:700;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Phone (forwarding)</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${phoneD.phone || '—'}</td></tr><tr><td style="padding:8px;font-weight:700;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Industry</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${(phoneD.industry || '—').replace(/_/g,' ')}</td></tr><tr><td style="padding:8px;font-weight:700;background:#f9fafb;border-bottom:1px solid #e5e7eb;">City/State</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${phoneD.city || ''}${phoneD.state ? ', ' + phoneD.state : ''}</td></tr></table><div style="background:#f0f0ff;border:2px solid #6366f1;border-radius:10px;padding:16px;margin-bottom:16px;"><p style="font-weight:700;color:#3730a3;margin:0 0 8px;">Services Requested:</p><ul style="margin:0;padding-left:20px;line-height:2;">${phoneServices.map(s => '<li><strong>' + s + '</strong></li>').join('')}</ul></div>${phoneHoursLines ? '<div style="margin-bottom:16px;"><p style="font-weight:700;margin:0 0 8px;">Business Hours:</p><ul style="margin:0;padding-left:20px;line-height:2;">' + phoneHoursLines + '</ul></div>' : ''}${phoneServiceList ? '<div style="margin-bottom:16px;"><p style="font-weight:700;margin:0 0 8px;">Services Offered:</p><ul style="margin:0;padding-left:20px;line-height:1.8;font-size:14px;color:#374151;">' + phoneServiceList + '</ul></div>' : ''}<div style="border-top:2px solid #e5e7eb;padding-top:16px;margin-top:8px;"><p style="font-weight:700;color:#0066FF;margin:0 0 6px;">Action Required:</p><p style="margin:0;font-size:14px;color:#374151;">Provision a Twilio number in area code matching <strong>${phoneD.phone || 'client phone'}</strong>, configure forwarding, and activate selected services.</p></div></div></div>`
    }).catch(()=>{});
  }

  // ── Telephony: auto-provision after successful deploy ──
  try {
    if (client.data.phone) {
      console.log(`[Telephony] Provisioning number for ${client.data.businessName}...`);
      await provisionTwilioNumber(client);
      if (client.twilioNumber) {
        console.log(`[Telephony] Re-deploying site with Twilio number for ${client.data.businessName}...`);
        const updatedPages = generateSiteHTML(client.data, false, client);
        await deployToCloudflarePages(client.cfProjectName, updatedPages);
        // ── Send phone system ready email to client ──
        sendPhoneSystemReadyEmail(client).catch(e => console.error('[phone system email]', e.message));
      }
    }
  } catch (telErr) {
    console.error('[Telephony] Provisioning failed (deploy still succeeded):', telErr.message);
  }

  return client;
}

// ── Redeploy live site only (no token/password reset, no credentials email) ──
async function redeployLive(client) {
  if (!client.cfProjectName) throw new Error('No CF project name — site has not been deployed yet.');
  const sitePages = generateSiteHTML(client.data, false, client);
  await deployToCloudflarePages(client.cfProjectName, sitePages);
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
}

console.log('[module] lib/deploy.js loaded');

module.exports = {
  deployToCloudflarePages,
  runDeploy,
  redeployLive,
};
