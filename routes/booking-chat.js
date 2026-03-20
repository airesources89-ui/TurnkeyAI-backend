// ════════════════════════════════════════════════
// ── routes/booking-chat.js — Booking leads, AI chat, Stripe webhook
// ── Future: CRM pipeline, lead scoring, chat history storage
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { clients, pool, saveClient } = require('../lib/db');
const { sendEmail, sendSMS, ADMIN_EMAIL } = require('../lib/email');
const { findClientIdByBusinessName } = require('../lib/helpers');
const { logAnalyticsEvent } = require('../lib/analytics');

const CF_AI_TOKEN    = process.env.CF_AI_TOKEN;
const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions. Please wait a few minutes and try again.' }
});

// ── POST /api/booking-lead ──
router.post('/api/booking-lead', postLimiter, async (req, res) => {
  try {
    if (!req.body.phone && !req.body.email) return res.status(400).json({ error: 'Phone or email is required' });
    const d = req.body;
    const customerName = [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Potential Customer';
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📅 New Booking Request: ${d.businessName || 'Website Visitor'} — ${d.service || 'General Inquiry'}`,
      html: `<div style="font-family:sans-serif;max-width:600px;"><div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:20px 28px;border-radius:12px 12px 0 0;"><h2 style="color:white;margin:0;">📅 New Booking Request</h2></div><div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;font-weight:700;width:140px;color:#374151;">Customer</td><td style="padding:8px;">${customerName}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Phone</td><td style="padding:8px;"><a href="tel:${(d.phone||'').replace(/\D/g,'')}">${d.phone||'Not provided'}</a></td></tr><tr><td style="padding:8px;font-weight:700;color:#374151;">Email</td><td style="padding:8px;">${d.email||'Not provided'}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Service</td><td style="padding:8px;">${d.service||'Not specified'}</td></tr><tr><td style="padding:8px;font-weight:700;color:#374151;">Date Pref.</td><td style="padding:8px;">${d.preferredDate||'Flexible'} ${d.preferredTime||''}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Notes</td><td style="padding:8px;">${d.notes||'—'}</td></tr><tr><td style="padding:8px;font-weight:700;color:#374151;">Source</td><td style="padding:8px;">${d.businessName||''} website — ${d.city||''}</td></tr></table></div></div>`
    });
    if (d.phone) {
      await sendSMS(d.phone, `Hi ${d.firstName||'there'}! ${d.businessName||'We'} received your appointment request. We'll confirm your ${d.preferredDate||'appointment'} shortly. Questions? Call ${d.businessPhone||'us'}.`).catch(()=>{});
    }
    // ── Analytics: log booking lead event ──
    const bookingClientId = findClientIdByBusinessName(d.businessName);
    logAnalyticsEvent(bookingClientId || d.businessName || 'unknown', 'booking', null, { service: d.service || null, customerName: customerName || null, phone: d.phone || null });
    res.json({ success: true });
  } catch(err) { console.error('[/api/booking-lead]', err); res.status(500).json({ error: 'Failed' }); }
});

// ── POST /api/chat ──
router.post('/api/chat', postLimiter, async (req, res) => {
  try {
    if (!req.body.message || req.body.message.length > 1000) return res.status(400).json({ reply: 'Invalid message.' });
    const { message, history, system, businessName } = req.body;
    if (!CF_AI_TOKEN || !CF_ACCOUNT_ID) {
      return res.json({ reply: `Thanks for reaching out to ${businessName||'us'}! Please call us directly for immediate assistance.` });
    }
    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => messages.push({ role: h.role, content: h.content }));
    }
    messages.push({ role: 'user', content: message });
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${CF_AI_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: system || `You are a helpful assistant for ${businessName||'this business'}.` }, ...messages] }) }
    );
    const cfData = await cfRes.json();
    const reply = cfData?.result?.response || `Thanks for your question! Please call us directly for the best assistance.`;
    // ── Analytics: log chat event ──
    const chatClientId = findClientIdByBusinessName(businessName);
    logAnalyticsEvent(chatClientId || businessName || 'unknown', 'chat', null, { businessName: businessName || null });
    res.json({ reply });
  } catch(err) { console.error('[/api/chat]', err); res.json({ reply: 'Sorry, I had trouble with that. Please call us directly.' }); }
});

// ── Stripe webhook ──
router.post('/api/stripe-webhook', async (req, res) => {
  let event;
  try {
    event = STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body);
  } catch(err) { console.error('[stripe webhook]', err.message); return res.status(400).send('Webhook error'); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const clientId = session.metadata?.clientId;
    if (clientId && clients[clientId]) {
      clients[clientId].miniMeSubscribed = true;
      clients[clientId].miniMeSubscribedAt = new Date().toISOString();
      await saveClient(clients[clientId]);
      await sendEmail({ to: ADMIN_EMAIL, subject: `💰 Stripe Payment: ${clients[clientId].data.businessName}`, html: `<p>Payment confirmed for ${clients[clientId].data.businessName}. Mini-Me activated.</p>` });
    }
  }
  res.json({ received: true });
});

console.log('[module] routes/booking-chat.js loaded');
module.exports = router;
