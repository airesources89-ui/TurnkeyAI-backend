// ════════════════════════════════════════════════
// ── routes/client.js — Client-facing routes
// ── Future: client analytics view, self-service domain, billing portal
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { clients, pool, saveClient } = require('../lib/db');
const { validate } = require('../lib/helpers');
const { sendEmail, ADMIN_EMAIL, sendMiniMeEmail, sendFreeVideoEmail } = require('../lib/email');
const { runDeploy, redeployLive, deployToCloudflarePages } = require('../lib/deploy');
const { generateSiteHTML } = require('../lib/site-generator');

const BASE_URL    = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const postLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions.' } });

// ── POST /api/client-auth ──
router.post('/api/client-auth', async (req, res) => {
  const { loginId, email, token, password } = req.body;
  if ((!loginId && !email && !token) || !password) return res.status(400).json({ error: 'Missing Login ID or password' });
  let client;
  if (loginId) {
    client = Object.values(clients).find(c => c.dashLoginId && c.dashLoginId.toUpperCase() === loginId.trim().toUpperCase());
  } else if (email) {
    // Legacy fallback — find by email (for any old bookmarks/links)
    client = Object.values(clients).find(c => c.data && c.data.email && c.data.email.toLowerCase() === email.toLowerCase());
  } else {
    client = Object.values(clients).find(c => c.dashToken === token);
  }
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.trim().toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  res.json({
    businessName: client.data.businessName, status: client.status, liveUrl: client.liveUrl,
    data: client.data, miniMeConsent: client.miniMeConsent || false,
    miniMeVideoUrl: client.miniMeVideoFile || null, freeVideoRequested: client.freeVideoRequested || false,
    twilioNumber: client.twilioNumber || null, telephonyEnabled: client.telephonyEnabled || false,
    clientId: client.id, dashToken: client.dashToken, dashLoginId: client.dashLoginId || null
  });
});

// ── POST /api/client-analytics ──
router.post('/api/client-analytics', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing credentials' });
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.trim().toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  try {
    const d = parseInt(req.body.days) || 30;
    const dateFilter = (d > 0 && d < 9999) ? `AND created_at >= NOW() - INTERVAL '${d} days'` : '';
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'pageview') AS pageviews,
        COUNT(*) FILTER (WHERE event_type = 'chat') AS chats,
        COUNT(*) FILTER (WHERE event_type = 'booking') AS bookings,
        COUNT(*) FILTER (WHERE event_type = 'call') AS calls,
        COUNT(*) FILTER (WHERE event_type = 'sms') AS sms
      FROM analytics_events
      WHERE client_id = $1 ${dateFilter}
    `, [client.id]);
    const row = result.rows[0] || {};
    res.json({
      pageviews: parseInt(row.pageviews) || 0,
      chats: parseInt(row.chats) || 0,
      bookings: parseInt(row.bookings) || 0,
      calls: parseInt(row.calls) || 0,
      sms: parseInt(row.sms) || 0,
      days: d
    });
  } catch(err) {
    console.error('[/api/client-analytics]', err);
    res.json({ pageviews: 0, chats: 0, bookings: 0, calls: 0, sms: 0, days: 30 });
  }
});

// ── POST /api/client-update ──
router.post('/api/client-update', async (req, res) => {
  const { token, password, updateType, updateData } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing credentials' });
  const client = Object.values(clients).find(c => c.dashToken === token);
  if (!client) return res.status(404).json({ error: 'Not found' });
  if (client.dashPassword !== password.trim().toUpperCase()) return res.status(401).json({ error: 'Wrong password' });
  try {
    if (updateType === 'change_password') {
      const newPass = (updateData && updateData.newPassword) ? updateData.newPassword.trim() : '';
      if (!newPass || newPass.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      if (newPass.length > 64) return res.status(400).json({ error: 'Password too long.' });
      client.dashPassword = newPass.toUpperCase();
      await saveClient(client);
      return res.json({ success: true, message: 'Password changed successfully. Use your new password next time you log in.' });
    }
    if (updateType === 'change_login_id') {
      const newId = (updateData && updateData.newLoginId) ? updateData.newLoginId.trim().toUpperCase() : '';
      if (!newId || newId.length < 4) return res.status(400).json({ error: 'Login ID must be at least 4 characters.' });
      if (newId.length > 20) return res.status(400).json({ error: 'Login ID too long (max 20 characters).' });
      if (!/^[A-Z0-9\-]+$/.test(newId)) return res.status(400).json({ error: 'Login ID can only contain letters, numbers, and hyphens.' });
      // Check uniqueness
      const taken = Object.values(clients).find(c => c.id !== client.id && c.dashLoginId && c.dashLoginId.toUpperCase() === newId);
      if (taken) return res.status(409).json({ error: 'That Login ID is already taken. Please choose another.' });
      client.dashLoginId = newId;
      await saveClient(client);
      return res.json({ success: true, message: 'Login ID changed successfully. Use your new Login ID next time you log in.', newLoginId: newId });
    }
    if (updateType === 'content_update') {
      const BLOCKED = ['id','dashToken','dashPassword','previewToken','_previewToken'];
      const incoming = updateData || {};
      Object.keys(incoming).forEach(k => { if (!BLOCKED.includes(k)) client.data[k] = incoming[k]; });
      await saveClient(client);
      if (client.status !== 'active' || !client.cfProjectName) {
        return res.json({ success: true, message: 'Your information has been saved. Your site will reflect the changes on next deployment.' });
      }
      try { await redeployLive(client); return res.json({ success: true, message: 'Your site has been updated and redeployed. Changes will be live within 1–2 minutes.' }); }
      catch(deployErr) { console.error('[content_update redeploy]', deployErr.message); return res.status(500).json({ error: 'Your information was saved, but the redeploy failed: ' + deployErr.message + '. Please contact support at (603) 922-2004.' }); }
    }
    if (updateType === 'hours') {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const hours = {};
      days.forEach(d => { hours[d] = { open: !!updateData['day_'+d], hours: updateData['hours_'+d] || '9:00 AM – 5:00 PM' }; });
      client.data.hours = hours;
      await saveClient(client);
      if (client.status === 'active') {
        const projectName = client.cfProjectName || `turnkeyai-${require('../lib/helpers').makeSlug(client.data.businessName)}`;
        const liveHTML = generateSiteHTML(client.data, false, client);
        deployToCloudflarePages(projectName, liveHTML).catch(e => console.error('[hours redeploy]', e.message));
      }
      return res.json({ success: true, message: 'Hours saved and site updating.' });
    }
    if (updateType === 'change_request') {
      await sendEmail({ to: ADMIN_EMAIL, subject: `✏️ Change Request: ${client.data.businessName}`, html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><h2 style="color:#0066FF;">Change Request — ${updateData.requestType || 'General'}</h2><p><strong>Client:</strong> ${client.data.businessName}</p><p><strong>Email:</strong> ${client.data.email}</p><p><strong>Phone:</strong> ${client.data.phone}</p><p><strong>Request:</strong></p><div style="background:#f4f6fa;padding:16px;border-radius:8px;">${updateData.details}</div></div>` });
      return res.json({ success: true, message: 'Request sent! We\'ll handle it within 24–48 hours.' });
    }
    if (updateType === 'request_minime') { await sendMiniMeEmail(client); return res.json({ success: true, message: 'Mini-Me requested! Check your email.' }); }
    if (updateType === 'request_free_video') { client.freeVideoRequested = true; await saveClient(client); await sendFreeVideoEmail(client); return res.json({ success: true, message: 'Check your email for recording instructions!' }); }
    return res.status(400).json({ error: 'Unknown updateType' });
  } catch(err) { console.error('[client-update]', err); res.status(500).json({ error: 'Update failed. Please try again.' }); }
});

// ── GET /api/client-approve/:id ──
router.get('/api/client-approve/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client) return res.status(404).send('Not found');
  if (client.previewToken !== req.query.token) return res.status(403).send('Invalid token');
  if (client.status === 'active') return res.redirect(client.liveUrl);
  try {
    await runDeploy(client);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:white;"><h1 style="color:#00D68F;">🎉 You're LIVE!</h1><p style="font-size:1.2rem;">Your site is now at:</p><a href="${client.liveUrl}" style="font-size:1.5rem;color:#0066FF;">${client.liveUrl}</a><p style="margin-top:20px;color:rgba(255,255,255,.6);">Check your email for your dashboard login.</p></body></html>`);
  } catch(err) { console.error('[client-approve]', err); res.status(500).send('Deployment failed. Please contact us.'); }
});

// ── GET /preview/:token ──
router.get('/preview/:token', (req, res) => {
  const client = Object.values(clients).find(c => c.previewToken === req.params.token);
  if (!client) return res.status(404).send('<h2>Preview not found or expired.</h2>');
  const data = { ...client.data, _previewToken: client.previewToken, id: client.id };
  res.send(generateSiteHTML(data, true, null));
});

// ── GET /api/mini-me-consent/:id ──
router.get('/api/mini-me-consent/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(403).send('Invalid token');
  client.miniMeConsent = true; client.miniMeConsentAt = new Date().toISOString();
  await saveClient(client);
  await sendEmail({ to: ADMIN_EMAIL, subject: `✅ Mini-Me Consent: ${client.data.businessName}`, html: `<p><strong>${client.data.businessName}</strong> (${client.data.ownerName}) has consented to Mini-Me avatar creation.</p>` });
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2 style="color:#00D68F;">✅ Consent recorded!</h2><p>We\'ll begin building your Mini-Me avatar.</p></body></html>');
});

// ── GET /api/mini-me-subscribe/:id ──
router.get('/api/mini-me-subscribe/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client || client.previewToken !== req.query.token) return res.status(403).send('Invalid token');
  client.miniMeSubscribed = true; client.miniMeSubscribedAt = new Date().toISOString();
  await saveClient(client);
  await sendEmail({ to: ADMIN_EMAIL, subject: `💰 Mini-Me Subscription: ${client.data.businessName}`, html: `<p><strong>${client.data.businessName}</strong> subscribed to Mini-Me at $59/mo. Set up recurring billing for ${client.data.email}.</p>` });
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2 style="color:#00D68F;">✅ Subscribed!</h2><p>Your Mini-Me subscription is active at $59/month.</p></body></html>');
});

// ── POST /api/preview-change-request ──
router.post('/api/preview-change-request', async (req, res) => {
  try {
    const { type, clientId, token, changes } = req.body;
    const client = clients[clientId];
    if (!client || client.previewToken !== token) return res.status(403).json({ error: 'Invalid token' });
    await sendEmail({ to: ADMIN_EMAIL, subject: `✏️ ${type === 'major' ? 'Major' : 'Minor'} Change Request: ${client.data.businessName}`, html: `<h2 style="font-family:sans-serif;">Change Request — ${type}</h2><p style="font-family:sans-serif;"><strong>Client:</strong> ${client.data.businessName} (${client.data.email})</p><pre style="background:#f4f6fa;padding:16px;border-radius:8px;overflow:auto;">${JSON.stringify(changes, null, 2)}</pre>` });
    res.json({ success: true });
  } catch(err) { console.error('[change-request]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/video-upload ──
router.post('/api/video-upload', postLimiter, async (req, res) => {
  try {
    const validErr = validate(req.body, [['token','Upload token']]);
    if (validErr) return res.status(400).json({ error: validErr });
    const { token, videoBase64, videoType, uploaderName, uploaderEmail, businessName, fileName, fileSize } = req.body;
    const client = Object.values(clients).find(c => c.previewToken === token);
    if (!client) return res.status(404).json({ error: 'Invalid upload token' });
    if (!videoBase64) return res.status(400).json({ error: 'No video data received' });
    const ext = (fileName || 'video.mp4').split('.').pop().toLowerCase() || 'mp4';
    const videoFile = `video_${videoType||'promo'}_${client.id}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, videoFile), Buffer.from(videoBase64, 'base64'));
    const videoUrl = `${BASE_URL}/uploads/${videoFile}`;
    if (videoType === 'mini_me') { client.miniMeVideoFile = videoFile; client.data.miniMeVideoUrl = videoUrl; }
    else { client.promoVideoFile = videoFile; client.data.promoVideoUrl = videoUrl; }
    client.updatedAt = new Date().toISOString();
    await saveClient(client);
    const typeLabel = videoType === 'mini_me' ? 'Mini-Me AI Avatar Clip' : 'Free 60-Second Promo Video';
    await sendEmail({ to: ADMIN_EMAIL, subject: `🎬 Video Upload Ready: ${businessName||client.data.businessName||'Client'} — ${typeLabel}`, html: `<div style="font-family:sans-serif;max-width:600px;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:20px 28px;border-radius:12px 12px 0 0;"><h2 style="color:#00D68F;margin:0;">🎬 Video Upload Ready</h2></div><div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:140px;">Business</td><td style="padding:8px;">${businessName||client.data.businessName}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Uploader</td><td style="padding:8px;">${uploaderName||'—'}</td></tr><tr><td style="padding:8px;font-weight:700;">Email</td><td style="padding:8px;">${uploaderEmail||client.data.email||'—'}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Video Type</td><td style="padding:8px;">${typeLabel}</td></tr><tr><td style="padding:8px;font-weight:700;">File</td><td style="padding:8px;">${videoFile} (${fileSize||'—'})</td></tr></table><p style="margin-top:16px;"><strong>Action:</strong> Download and process: <a href="${videoUrl}" style="color:#0066FF;">${videoUrl}</a></p></div></div>` });
    if (uploaderEmail || client.data.email) {
      await sendEmail({ to: uploaderEmail || client.data.email, subject: `✅ Video Received — ${businessName||client.data.businessName}`, html: `<h2 style="color:#0066FF;font-family:sans-serif;">We Got Your Video Clip!</h2><p style="font-family:sans-serif;">Hi ${uploaderName||'there'},</p><p style="font-family:sans-serif;">Your ${typeLabel.toLowerCase()} has been received. Production begins within 48 hours.</p><p style="font-family:sans-serif;">Questions? Call <strong>(603) 922-2004</strong></p><p style="font-family:sans-serif;">— TurnkeyAI Services Team</p>` });
    }
    res.json({ success: true, videoUrl });
  } catch(err) { console.error('[/api/video-upload]', err); res.status(500).json({ error: 'Upload failed: ' + err.message }); }
});

// ── POST /api/video-upload-notify (legacy fallback) ──
router.post('/api/video-upload-notify', async (req, res) => {
  try {
    const d = req.body;
    const typeLabel = d.videoType === 'mini_me' ? 'Mini-Me AI Avatar Clip' : d.videoType === 'both' ? 'Promo Video + Mini-Me Clip' : 'Free 60-Second Promo Video';
    await sendEmail({ to: ADMIN_EMAIL, subject: `⚠️ Video Upload Fallback: ${d.businessName||'Unknown'}`, html: `<h2 style="color:#f59e0b;font-family:sans-serif;">Video Upload Fallback</h2><table style="border-collapse:collapse;width:100%;max-width:500px;font-family:sans-serif;"><tr><td style="padding:8px;font-weight:700;">Client</td><td style="padding:8px;">${d.uploaderName||''}</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Business</td><td style="padding:8px;">${d.businessName||''}</td></tr><tr><td style="padding:8px;font-weight:700;">Email</td><td style="padding:8px;">${d.email||''}</td></tr><tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:700;">Video Type</td><td style="padding:8px;">${typeLabel}</td></tr><tr><td style="padding:8px;font-weight:700;">File</td><td style="padding:8px;">${d.fileName||''} (${d.fileSize||''})</td></tr>${d.uploadError?`<tr style="background:#fff8f0;"><td style="padding:8px;font-weight:700;color:#dc2626;">Upload Error</td><td style="padding:8px;color:#dc2626;">${d.uploadError}</td></tr>`:''}</table>` });
    if (d.email) await sendEmail({ to: d.email, subject: `✅ Video Received — ${d.businessName||'Your Business'}`, html: `<h2 style="color:#0066FF;font-family:sans-serif;">We Got Your Video Clip!</h2><p style="font-family:sans-serif;">Hi ${d.uploaderName||'there'}, production begins within 48 hours.</p><p style="font-family:sans-serif;">Questions? Call (603) 922-2004</p>` });
    res.json({ success: true });
  } catch(err) { console.error('[/api/video-upload-notify]', err); res.status(500).json({ error: 'Failed' }); }
});

// ════════════════════════════════════════════════
// ── GET /api/prefill/:id — Return client data for intake form pre-population
// ── Called by intake.html in update mode to fill fields with existing data
// ════════════════════════════════════════════════
router.get('/api/prefill/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
  // Accept either previewToken or dashToken for authentication
  const token = req.query.token;
  if (!token) return res.status(400).json({ success: false, error: 'Missing token' });
  if (client.previewToken !== token && client.dashToken !== token) {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
  res.json({ success: true, data: client.data });
});

// ════════════════════════════════════════════════
// ── POST /api/client-update-intake/:id — Accept full intake re-submission
// ── Called by intake.html in update mode when client submits changed data
// ── Merges into client.data, saves, and redeploys if active
// ════════════════════════════════════════════════
router.post('/api/client-update-intake/:id', async (req, res) => {
  const client = clients[req.params.id];
  if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
  // Accept either previewToken or dashToken for authentication
  const token = req.query.token;
  if (!token) return res.status(400).json({ success: false, error: 'Missing token' });
  if (client.previewToken !== token && client.dashToken !== token) {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
  try {
    const BLOCKED = ['id', 'dashToken', 'dashPassword', 'previewToken', '_previewToken'];
    const incoming = req.body || {};
    Object.keys(incoming).forEach(k => {
      if (!BLOCKED.includes(k)) client.data[k] = incoming[k];
    });
    client.updatedAt = new Date().toISOString();
    await saveClient(client);

    // Notify admin of the update
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🔄 Content Update: ${client.data.businessName || 'Client'} — via Intake Form`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0066FF,#1a1a2e);padding:20px 28px;border-radius:12px 12px 0 0;"><h2 style="color:#00D68F;margin:0;">🔄 Client Content Update</h2></div><div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><p><strong>Business:</strong> ${client.data.businessName || '—'}</p><p><strong>Owner:</strong> ${client.data.ownerName || '—'}</p><p><strong>Email:</strong> ${client.data.email || '—'}</p><p><strong>Status:</strong> ${client.status}</p><p style="font-size:13px;color:#6B7280;">Client updated their info via the intake form. ${client.status === 'active' ? 'Site redeploy was attempted.' : 'Site will update on next deployment.'}</p></div></div>`
    }).catch(e => console.error('[update-intake admin email]', e.message));

    // Redeploy if active
    if (client.status === 'active' && client.cfProjectName) {
      try {
        await redeployLive(client);
        return res.json({ success: true, message: 'Your site has been updated and redeployed.', liveUrl: client.liveUrl });
      } catch(deployErr) {
        console.error('[update-intake redeploy]', deployErr.message);
        return res.json({ success: true, message: 'Your information was saved, but the redeploy failed. Please contact support at (603) 922-2004.', liveUrl: client.liveUrl });
      }
    }
    return res.json({ success: true, message: 'Your information has been saved. Changes will appear on your next deployment.' });
  } catch(err) {
    console.error('[/api/client-update-intake]', err);
    res.status(500).json({ success: false, error: 'Update failed. Please try again or call (603) 922-2004.' });
  }
});

console.log('[module] routes/client.js loaded');
module.exports = router;
