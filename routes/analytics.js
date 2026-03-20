// ════════════════════════════════════════════════
// ── routes/analytics.js — Analytics tracking and reporting
// ── Future: conversion funnels, retention, CSV export,
// ── scheduled email reports, per-page breakdowns
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { clients } = require('../lib/db');
const { logAnalyticsEvent, getAnalytics } = require('../lib/analytics');

const ADMIN_KEY = process.env.ADMIN_KEY;

// ── Generous rate limiter for public pageview endpoint ──
const pageviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 500,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Rate limited.' }
});

// ── POST /api/track/pageview — Public analytics tracking endpoint ──
router.post('/api/track/pageview', pageviewLimiter, async (req, res) => {
  try {
    const { clientId, page, referrer } = req.body;
    if (!clientId) return res.status(400).json({ ok: false });
    if (clientId !== 'turnkeyai_marketing' && !clients[clientId]) {
      return res.status(400).json({ ok: false });
    }
    logAnalyticsEvent(clientId, 'pageview', page || null, { referrer: referrer || null });
    res.json({ ok: true });
  } catch(err) { res.json({ ok: true }); }
});

// ── GET /api/admin/analytics — Aggregated per-client analytics ──
router.get('/api/admin/analytics', async (req, res) => {
  const adminKey = req.query.adminKey || req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const days = parseInt(req.query.days) || 30;
  try {
    const rows = await getAnalytics(days);
    const analytics = rows.map(row => {
      const client = clients[row.client_id];
      return {
        clientId: row.client_id,
        businessName: row.client_id === 'turnkeyai_marketing'
          ? 'TurnkeyAI Website'
          : (client ? client.data.businessName : row.client_id),
        pageviews: parseInt(row.pageviews) || 0,
        chats: parseInt(row.chats) || 0,
        bookings: parseInt(row.bookings) || 0,
        calls: parseInt(row.calls) || 0,
        sms: parseInt(row.sms) || 0,
      };
    });
    res.json({ analytics, days });
  } catch(err) {
    console.error('[/api/admin/analytics]', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

console.log('[module] routes/analytics.js loaded');
module.exports = router;
