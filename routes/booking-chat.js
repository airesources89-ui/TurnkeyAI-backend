// ════════════════════════════════════════════════
// ── routes/booking-chat.js — Booking leads, AI chat, Stripe webhook, Appointments
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

// ══════════════════════════════════════
// ── APPOINTMENTS: Parse business hours into 1-hour slots ──
// ══════════════════════════════════════

// Parse "8:00 AM – 5:00 PM" into { openHour: 8, closeHour: 17 }
function parseHoursRange(hoursStr) {
  if (!hoursStr || typeof hoursStr !== 'string') return null;
  // Match patterns like "8:00 AM – 5:00 PM", "8 AM - 5 PM", "8:00AM-5:00PM"
  const match = hoursStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[\u2013\u2014\-–—]+\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return null;
  let openH = parseInt(match[1]);
  const openAmPm = match[3].toUpperCase();
  let closeH = parseInt(match[4]);
  const closeAmPm = match[6].toUpperCase();
  // Convert to 24-hour
  if (openAmPm === 'PM' && openH !== 12) openH += 12;
  if (openAmPm === 'AM' && openH === 12) openH = 0;
  if (closeAmPm === 'PM' && closeH !== 12) closeH += 12;
  if (closeAmPm === 'AM' && closeH === 12) closeH = 0;
  if (closeH <= openH) return null; // invalid range
  return { openHour: openH, closeHour: closeH };
}

// Generate 1-hour slot labels from open to close (last slot = closeHour - 1)
function generateSlots(openHour, closeHour) {
  const slots = [];
  for (let h = openHour; h < closeHour; h++) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    slots.push(`${displayH}:00 ${ampm}`);
  }
  return slots;
}

// Get day name from a date string "YYYY-MM-DD"
function getDayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
}

// ── GET /api/appointments/available/:clientId ──
router.get('/api/appointments/available/:clientId', async (req, res) => {
  try {
    const client = clients[req.params.clientId];
    if (!client) return res.status(404).json({ error: 'Business not found' });

    const dateStr = req.query.date; // "YYYY-MM-DD"
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // Don't allow dates in the past
    const today = new Date();
    today.setHours(0,0,0,0);
    const requested = new Date(dateStr + 'T12:00:00');
    if (requested < today) {
      return res.json({ date: dateStr, closed: false, slots: [] });
    }

    // Determine day of week and check if business is open
    const dayName = getDayName(dateStr);
    const data = client.data || {};

    // Check if the business is open on this day
    const dayOpen = data['day_' + dayName];
    if (!dayOpen) {
      return res.json({ date: dateStr, closed: true, dayName: dayName, slots: [] });
    }

    // Parse hours for this day
    const hoursStr = data['hours_' + dayName] || '';
    const parsed = parseHoursRange(hoursStr);
    if (!parsed) {
      // Fallback: default 9 AM – 5 PM
      parsed_default = { openHour: 9, closeHour: 17 };
      var allSlots = generateSlots(parsed_default.openHour, parsed_default.closeHour);
    } else {
      var allSlots = generateSlots(parsed.openHour, parsed.closeHour);
    }

    // Query existing bookings for this client + date
    const result = await pool.query(
      `SELECT appointment_time FROM appointments WHERE client_id = $1 AND appointment_date = $2 AND status = 'booked'`,
      [client.id, dateStr]
    );
    const bookedTimes = new Set(result.rows.map(r => r.appointment_time));

    // If today, filter out slots that have already passed
    const now = new Date();
    const isToday = dateStr === now.toISOString().split('T')[0];

    const slots = allSlots.map(time => {
      let available = !bookedTimes.has(time);
      // If today, check if slot time has passed
      if (available && isToday) {
        const slotMatch = time.match(/^(\d{1,2}):00\s*(AM|PM)$/i);
        if (slotMatch) {
          let slotH = parseInt(slotMatch[1]);
          const slotAmPm = slotMatch[2].toUpperCase();
          if (slotAmPm === 'PM' && slotH !== 12) slotH += 12;
          if (slotAmPm === 'AM' && slotH === 12) slotH = 0;
          if (slotH <= now.getHours()) available = false;
        }
      }
      return { time, available };
    });

    res.json({ date: dateStr, closed: false, dayName, slots });
  } catch(err) {
    console.error('[/api/appointments/available]', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// ── POST /api/appointments/book ──
router.post('/api/appointments/book', postLimiter, async (req, res) => {
  try {
    const { clientId, date, time, firstName, lastName, phone, email, service, notes } = req.body;
    if (!clientId || !date || !time) return res.status(400).json({ error: 'Missing required fields (clientId, date, time)' });
    if (!phone && !email) return res.status(400).json({ error: 'Phone or email is required' });

    const client = clients[clientId];
    if (!client) return res.status(404).json({ error: 'Business not found' });

    const customerName = [firstName, lastName].filter(Boolean).join(' ') || 'Customer';

    // Insert with unique constraint — prevents double booking
    try {
      await pool.query(
        `INSERT INTO appointments (client_id, customer_name, customer_phone, customer_email, service, appointment_date, appointment_time, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'booked')`,
        [client.id, customerName, phone || null, email || null, service || null, date, time, notes || null]
      );
    } catch(dbErr) {
      // Unique constraint violation = double booking
      if (dbErr.code === '23505') {
        return res.status(409).json({ error: 'This time slot was just booked by someone else. Please select a different time.' });
      }
      throw dbErr;
    }

    // Format date for display
    const dateObj = new Date(date + 'T12:00:00');
    const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const bizName = client.data.businessName || 'Your Business';
    const bizPhone = client.data.phone || '';
    const bizEmail = client.data.email || '';

    // ── Email to business owner ──
    await sendEmail({
      to: bizEmail || ADMIN_EMAIL,
      subject: `📅 New Appointment Booked: ${customerName} — ${displayDate} at ${time}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:20px 28px;border-radius:12px 12px 0 0;">
          <h2 style="color:white;margin:0;">📅 New Appointment Booked</h2>
          <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px;">${bizName}</p>
        </div>
        <div style="padding:24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <div style="background:#f0fff4;border:2px solid #00D68F;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#065f46;">${displayDate}</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#0066FF;">${time}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:700;width:140px;color:#374151;border-bottom:1px solid #e5e7eb;">Customer</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${customerName}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Phone</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;"><a href="tel:${(phone||'').replace(/\D/g,'')}">${phone||'Not provided'}</a></td></tr>
            <tr><td style="padding:8px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Email</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${email||'Not provided'}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Service</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${service||'Not specified'}</td></tr>
            ${notes?`<tr><td style="padding:8px;font-weight:700;color:#374151;">Notes</td><td style="padding:8px;">${notes}</td></tr>`:''}
          </table>
        </div>
      </div>`
    }).catch(e => console.error('[appointment email to biz]', e.message));

    // ── Also notify admin ──
    if (bizEmail && bizEmail !== ADMIN_EMAIL) {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `📅 Appointment: ${bizName} — ${customerName} — ${displayDate} ${time}`,
        html: `<p><strong>${bizName}</strong>: ${customerName} booked ${displayDate} at ${time}. Service: ${service||'—'}. Phone: ${phone||'—'}. Email: ${email||'—'}.</p>`
      }).catch(() => {});
    }

    // ── Confirmation email to customer ──
    if (email) {
      await sendEmail({
        to: email,
        subject: `✅ Appointment Confirmed — ${bizName} — ${displayDate} at ${time}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#00D68F,#00b377);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">✅ You're Booked!</h1>
          </div>
          <div style="padding:28px 32px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <p style="font-size:16px;margin:0 0 20px;">Hi ${firstName||'there'},</p>
            <div style="background:#f0f9ff;border:2px solid #0066FF;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
              <p style="margin:0;font-size:14px;color:#1e40af;font-weight:600;">${bizName}</p>
              <p style="margin:8px 0 4px;font-size:18px;font-weight:700;color:#0a1628;">${displayDate}</p>
              <p style="margin:0;font-size:28px;font-weight:800;color:#0066FF;">${time}</p>
              ${service?`<p style="margin:8px 0 0;font-size:14px;color:#64748b;">Service: ${service}</p>`:''}
            </div>
            <p style="font-size:14px;color:#374151;line-height:1.7;">We'll see you then! If you need to make changes, please contact us:</p>
            ${bizPhone?`<p style="font-size:14px;margin:4px 0;"><strong>Phone:</strong> <a href="tel:${bizPhone.replace(/\D/g,'')}" style="color:#0066FF;">${bizPhone}</a></p>`:''}
            ${bizEmail?`<p style="font-size:14px;margin:4px 0;"><strong>Email:</strong> <a href="mailto:${bizEmail}" style="color:#0066FF;">${bizEmail}</a></p>`:''}
            <p style="font-size:13px;color:#94a3b8;margin-top:20px;">Powered by <a href="https://turnkeyaiservices.com" style="color:#0066FF;text-decoration:none;">TurnkeyAI Services</a></p>
          </div>
        </div>`
      }).catch(e => console.error('[appointment confirmation email]', e.message));
    }

    // ── SMS confirmation to customer ──
    if (phone) {
      await sendSMS(phone, `Hi ${firstName||'there'}! Your appointment with ${bizName} is confirmed for ${displayDate} at ${time}. Questions? Call ${bizPhone||'us'}.`).catch(() => {});
    }

    // ── Analytics event ──
    logAnalyticsEvent(client.id, 'booking', null, { service: service || null, customerName, date, time });

    res.json({ success: true, message: 'Appointment booked!' });
  } catch(err) {
    console.error('[/api/appointments/book]', err);
    res.status(500).json({ error: 'Booking failed. Please try again or call the business directly.' });
  }
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
