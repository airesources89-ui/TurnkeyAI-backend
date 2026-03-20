// ════════════════════════════════════════════════
// ── routes/admin.js — Admin dashboard API routes
// ── Future: bulk operations, export, scheduling, permissions
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { clients, pool, saveClient } = require('../lib/db');
const { calculateMRR } = require('../lib/helpers');
const { sendEmail, ADMIN_EMAIL } = require('../lib/email');
const { runDeploy, redeployLive, deployToCloudflarePages } = require('../lib/deploy');
const { generateSiteHTML } = require('../lib/site-generator');

const ADMIN_KEY      = process.env.ADMIN_KEY;
const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;

// ── GET /api/admin/clients ──
router.get('/api/admin/clients', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const mrrSummary = calculateMRR();
  const clientList = Object.values(clients).map(c => ({
    id: c.id, businessName: c.data.businessName, ownerName: c.data.ownerName,
    email: c.data.email, phone: c.data.phone, industry: c.data.industry,
    city: c.data.city, status: c.status, liveUrl: c.liveUrl,
    createdAt: c.createdAt, previewToken: c.previewToken,
    dashPassword: c.dashPassword, approvedAt: c.approvedAt,
    wantsMiniMe: c.data.wants_mini_me || c.data.wantsMiniMe,
    miniMeConsent: c.miniMeConsent, miniMeConsentAt: c.miniMeConsentAt,
    miniMeSubscribed: c.miniMeSubscribed,
    miniMeVideoFile: c.miniMeVideoFile || null, promoVideoFile: c.promoVideoFile || null,
    wantsFreeVideo: c.freeVideoRequested,
    wantsAfterHours: c.data.addon_after_hours, wantsMissedCall: c.data.addon_missed_call,
    twilioNumber: c.twilioNumber || null, forwardingNumber: c.forwardingNumber || null,
    telephonyEnabled: c.telephonyEnabled || false,
    domainStatus: {
      hasDomain: c.data.hasDomain || null, existingDomain: c.data.existingDomain || null,
      domainRegistrar: c.data.domainRegistrar || null, keepExistingEmail: c.data.keepExistingEmail || null,
      suggestedDomain: c.data.suggestedDomain || null, cfProjectName: c.cfProjectName || null,
      needsDnsAction: (c.data.hasDomain === 'yes' || c.data.hasDomain === 'no') && c.status !== 'active',
      emailProvider: c.data.emailProvider || null, emailsToPreserve: c.data.emailsToPreserve || null,
      dnsSetupPreference: c.data.dnsSetupPreference || null,
      hasRegistrarCredentials: !!(c.data.registrarUsername),
      wantsProfessionalEmail: c.data.wantsProfessionalEmail || null
    },
    state: c.data.state || null, missionStatement: c.data.missionStatement || null,
    aboutUs: c.data.aboutUs || null, plan: c.data.plan || c.data.tier || c.data.packageType || null
  }));
  res.json({ mrr: mrrSummary, clients: clientList });
});

// ── GET /api/approve/:id ──
router.get('/api/approve/:id', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('Unauthorized');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('Client not found');
  if (client.status === 'active') return res.send(`<h2>${client.data.businessName} is already live at <a href="${client.liveUrl}">${client.liveUrl}</a></h2>`);
  try {
    await runDeploy(client);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h1 style="color:#00D68F;">✅ ${client.data.businessName} is LIVE!</h1><p><a href="${client.liveUrl}" target="_blank">${client.liveUrl}</a></p><p>Dashboard password: <strong>${client.dashPassword}</strong></p></body></html>`);
  } catch(err) { console.error('[approve]', err); res.status(500).send('Deploy failed: ' + err.message); }
});

// ── GET /api/redeploy/:id ──
router.get('/api/redeploy/:id', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).send('Unauthorized');
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('Client not found');
  if (!client.data.businessName) return res.status(400).send('Client has no businessName — cannot deploy.');
  client.status = 'pending';
  try {
    await runDeploy(client);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:white;"><h1 style="color:#00D68F;">✅ ${client.data.businessName} Re-Deployed!</h1><p>Live at: <a href="${client.liveUrl}" style="color:#0066FF;">${client.liveUrl}</a></p><p>New dashboard password: <strong>${client.dashPassword}</strong></p></body></html>`);
  } catch(err) { client.status = 'active'; console.error('[redeploy]', err); res.status(500).send('Re-deploy failed: ' + err.message); }
});

// ── POST /api/admin/set-status ──
router.post('/api/admin/set-status', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { clientId, newStatus } = req.body;
  if (!clientId || !newStatus) return res.status(400).json({ error: 'clientId and newStatus required' });
  if (!['active', 'suspended', 'pending'].includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const oldStatus = client.status;
  client.status = newStatus;
  if (newStatus === 'suspended') {
    client.telephonyEnabled = false;
    if (client.cfProjectName && CF_ACCOUNT_ID && CF_API_TOKEN) {
      try {
        const placeholderHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${client.data.businessName||'Site'} — Temporarily Unavailable</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0f1117;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}.wrap{max-width:480px}h1{font-size:2rem;margin-bottom:1rem}p{color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:1.5rem}a{color:#0066FF;text-decoration:none;font-weight:700}</style></head><body><div class="wrap"><h1>🔒 Temporarily Unavailable</h1><p>This website is temporarily offline. If you need to reach the business, please try again later.</p><p style="font-size:13px;color:rgba(255,255,255,.3);">Powered by <a href="https://turnkeyaiservices.com">TurnkeyAI Services</a></p></div></body></html>`;
        await deployToCloudflarePages(client.cfProjectName, placeholderHTML);
      } catch (e) { console.error('[set-status] Placeholder deploy failed:', e.message); }
    }
  } else if (newStatus === 'active' && oldStatus === 'suspended') {
    if (client.twilioNumber) client.telephonyEnabled = true;
    if (client.cfProjectName) { try { await redeployLive(client); } catch (e) { console.error('[set-status] Redeploy failed:', e.message); } }
  }
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
  await sendEmail({ to: ADMIN_EMAIL, subject: `🔄 Status Change: ${client.data.businessName} — ${oldStatus} → ${newStatus}`, html: `<p><strong>${client.data.businessName}</strong> status changed from <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.</p>` }).catch(() => {});
  res.json({ success: true, oldStatus, newStatus });
});

// ── POST /api/admin/update-client ──
router.post('/api/admin/update-client', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { clientId, fields, redeploy } = req.body;
  if (!clientId || !fields) return res.status(400).json({ error: 'clientId and fields required' });
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const BLOCKED = ['id','dashToken','dashPassword','previewToken','_previewToken'];
  let changed = 0;
  Object.keys(fields).forEach(k => { if (!BLOCKED.includes(k) && fields[k] !== undefined) { client.data[k] = fields[k]; changed++; } });
  client.updatedAt = new Date().toISOString();
  await saveClient(client);
  let redeployed = false;
  if (redeploy && client.status === 'active' && client.cfProjectName) {
    try { await redeployLive(client); redeployed = true; }
    catch (e) { console.error('[admin/update-client] Redeploy failed:', e.message); return res.json({ success: true, changed, redeployed: false, redeployError: e.message }); }
  }
  res.json({ success: true, changed, redeployed });
});

// ── POST /api/admin/bind-domain ──
router.post('/api/admin/bind-domain', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { clientId, customDomain } = req.body;
  if (!clientId || !customDomain) return res.status(400).json({ error: 'clientId and customDomain are required' });
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!client.cfProjectName) return res.status(400).json({ error: 'Client has no CF Pages project yet — deploy first' });
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return res.status(500).json({ error: 'CF credentials not configured' });
  try {
    const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${client.cfProjectName}/domains`, { method: 'POST', headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: customDomain.replace(/^https?:\/\//,'').trim() }) });
    const cfData = await cfRes.json();
    if (!cfRes.ok) return res.status(502).json({ error: 'CF API error', details: cfData.errors });
    client.data.customDomain = customDomain;
    client.liveUrl = `https://${customDomain.replace(/^https?:\/\//,'').trim()}`;
    client.updatedAt = new Date().toISOString();
    await saveClient(client);
    res.json({ success: true, customDomain, liveUrl: client.liveUrl });
  } catch(err) { console.error('[bind-domain]', err.message); res.status(500).json({ error: 'Bind domain failed: ' + err.message }); }
});

// ── GET /api/admin/telephony-status ──
router.get('/api/admin/telephony-status', (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const telephonyClients = Object.values(clients).map(c => ({
    id: c.id, businessName: c.data.businessName || '(unnamed)', status: c.status,
    twilioNumber: c.twilioNumber || null, forwardingNumber: c.forwardingNumber || null,
    telephonyEnabled: c.telephonyEnabled || false, businessHoursJson: c.businessHoursJson || null,
  })).filter(c => c.twilioNumber || c.telephonyEnabled);
  res.json({ totalProvisioned: telephonyClients.length, clients: telephonyClients });
});

// ── GET /api/coming-soon ──
router.get('/api/coming-soon', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coming_soon_features ORDER BY sort_order ASC, created_at ASC');
    res.json({ features: result.rows.map(r => ({ id: r.id, name: r.name, description: r.description, category: r.category, ratingSum: r.rating_sum, totalRatings: r.total_ratings })) });
  } catch(err) { console.error('[coming-soon GET]', err); res.status(500).json({ features: [] }); }
});

// ── POST /api/coming-soon ──
router.post('/api/coming-soon', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { action, id, name, description, category } = req.body;
  try {
    if (action === 'add') { await pool.query('INSERT INTO coming_soon_features (id, name, description, category) VALUES ($1,$2,$3,$4)', ['feat_' + Date.now(), name, description, category || 'New Feature']); }
    else if (action === 'edit') { await pool.query('UPDATE coming_soon_features SET name=$1, description=$2, category=$3 WHERE id=$4', [name, description, category || 'New Feature', id]); }
    else if (action === 'delete') { await pool.query('DELETE FROM coming_soon_features WHERE id=$1', [id]); }
    const result = await pool.query('SELECT * FROM coming_soon_features ORDER BY sort_order ASC, created_at ASC');
    res.json({ features: result.rows.map(r => ({ id: r.id, name: r.name, description: r.description, category: r.category, ratingSum: r.rating_sum, totalRatings: r.total_ratings })) });
  } catch(err) { console.error('[coming-soon POST]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/coming-soon/rate ──
const postLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions.' } });
router.post('/api/coming-soon/rate', postLimiter, async (req, res) => {
  const { featureId, rating } = req.body;
  if (!featureId || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid' });
  try {
    await pool.query('UPDATE coming_soon_features SET rating_sum = rating_sum + $1, total_ratings = total_ratings + 1 WHERE id = $2', [Math.round(rating), featureId]);
    res.json({ success: true });
  } catch(err) { console.error('[coming-soon/rate]', err); res.status(500).json({ error: 'Failed' }); }
});

console.log('[module] routes/admin.js loaded');
module.exports = router;
