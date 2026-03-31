// ════════════════════════════════════════════════
// ── routes/coming-soon.js — Coming Soon feature ratings + lead capture
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { pool, saveComingSoonLead } = require('../lib/db');
const { sendEmail, ADMIN_EMAIL } = require('../lib/email');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Rate limited.' }
});

// ── POST /api/coming-soon/rate — per-star click ──
router.post('/api/coming-soon/rate', rateLimiter, async (req, res) => {
  try {
    const { featureId, rating } = req.body;
    if (!featureId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false });
    }
    await pool.query(
      `UPDATE coming_soon_features
       SET rating_sum = rating_sum + $1, total_ratings = total_ratings + 1
       WHERE id = $2`,
      [Math.round(rating), featureId]
    );
    res.json({ ok: true });
  } catch(err) {
    console.error('[coming-soon/rate]', err.message);
    res.json({ ok: true });
  }
});

// ── POST /api/coming-soon/submit — email capture + full rating set ──
router.post('/api/coming-soon/submit', rateLimiter, async (req, res) => {
  try {
    const { email, ratings } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, error: 'Email is required.' });
    }
    const emailClean = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }

    const ratingsClean = {};
    if (ratings && typeof ratings === 'object') {
      for (const [key, val] of Object.entries(ratings)) {
        const n = parseInt(val);
        if (n >= 1 && n <= 5) ratingsClean[key] = n;
      }
    }
    if (Object.keys(ratingsClean).length === 0) {
      return res.status(400).json({ ok: false, error: 'Please rate at least one feature.' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    const saved = await saveComingSoonLead(emailClean, ratingsClean, ip);

    if (!saved) {
      return res.json({ ok: true, duplicate: true });
    }

    const topFeatureId = Object.entries(ratingsClean).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const featureRow = topFeatureId
      ? await pool.query('SELECT name FROM coming_soon_features WHERE id = $1', [topFeatureId])
      : null;
    const topFeatureName = featureRow?.rows[0]?.name || 'your top feature';

    sendEmail({
      to: ADMIN_EMAIL,
      subject: `🎯 Coming Soon Lead — ${emailClean}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#f59e0b,#e85d04);padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:20px;">🎯 New Coming Soon Lead</h1>
          <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;">Someone claimed their free first year</p>
        </div>
        <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p><strong>Email:</strong> <a href="mailto:${emailClean}">${emailClean}</a></p>
          <p><strong>Top-rated feature:</strong> ${topFeatureName}</p>
          <p><strong>Ratings submitted:</strong></p>
          <ul style="margin:8px 0 16px 20px;line-height:1.8;">
            ${Object.entries(ratingsClean).map(([k, v]) => `<li>${k}: ${'★'.repeat(v)}${'☆'.repeat(5-v)}</li>`).join('')}
          </ul>
          <p style="font-size:13px;color:#6B7280;margin-top:20px;">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
        </div>
      </div>`
    }).catch(e => console.error('[coming-soon email to admin]', e.message));

    res.json({ ok: true });
  } catch(err) {
    console.error('[coming-soon/submit]', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

console.log('[module] routes/coming-soon.js loaded');
module.exports = router;
