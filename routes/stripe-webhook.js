// ════════════════════════════════════════════════
// ── routes/stripe-webhook.js — Stripe webhook handler
// ── Handles checkout.session.completed events
// ── Sends payment confirmation / welcome email
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { clients, saveClient } = require('../lib/db');
const { sendPaymentConfirmationEmail, sendEmail, ADMIN_EMAIL } = require('../lib/email');

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Import stripe package for signature verification
let stripe;
try {
  stripe = require('stripe')(STRIPE_SECRET_KEY);
} catch (err) {
  console.error('[stripe-webhook] Stripe package not installed. Run: npm install stripe --save');
}

// ── POST /api/stripe-webhook ──
router.post('/api/stripe-webhook', async (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set in env vars');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!stripe) {
    console.error('[stripe-webhook] Stripe package not available');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  // Verify webhook signature
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).send(\`Webhook signature verification failed: \${err.message}\`);
  }

  console.log('[stripe-webhook] Received event:', event.type, 'ID:', event.id);

  // Only handle checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    console.log('[stripe-webhook] Ignoring event type:', event.type);
    return res.json({ received: true, ignored: true });
  }

  const session = event.data.object;

  // Extract client identifier from metadata or customer email
  const clientId = session.metadata?.clientId;
  const customerEmail = session.customer_email || session.customer_details?.email;

  console.log('[stripe-webhook] Looking for client — ID:', clientId, 'Email:', customerEmail);

  // Look up client
  let client = null;
  if (clientId && clients[clientId]) {
    client = clients[clientId];
  } else if (customerEmail) {
    // Fallback: find by email
    client = Object.values(clients).find(c => c.data.email === customerEmail);
  }

  if (!client) {
    console.error('[stripe-webhook] Client not found — ID:', clientId, 'Email:', customerEmail);
    // Send admin notification
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: '⚠️ Stripe Payment Received — Client Not Found',
      html: \`<p><strong>Stripe checkout completed but client not found in database.</strong></p>
        <p><strong>Session ID:</strong> \${session.id}</p>
        <p><strong>Customer Email:</strong> \${customerEmail || '(none)'}</p>
        <p><strong>Metadata Client ID:</strong> \${clientId || '(none)'}</p>
        <p><strong>Amount:</strong> $\${(session.amount_total / 100).toFixed(2)}</p>
        <p>This customer paid but we don't have a matching client record. They may have paid before completing intake.</p>\`
    }).catch(err => console.error('[stripe-webhook] Admin notification failed:', err.message));
    
    // Return 200 OK anyway — don't block Stripe
    return res.json({ received: true, clientNotFound: true });
  }

  console.log('[stripe-webhook] Found client:', client.id, client.data.businessName || '(unnamed)');

  // Check if welcome email already sent (idempotency)
  if (client.paymentConfirmed) {
    console.log('[stripe-webhook] Payment already confirmed for client:', client.id, '— skipping duplicate email');
    return res.json({ received: true, alreadyConfirmed: true });
  }

  // Send welcome email
  try {
    await sendPaymentConfirmationEmail(client);
    console.log('[stripe-webhook] Welcome email sent to:', client.data.email);

    // Mark payment confirmed
    client.paymentConfirmed = true;
    client.paymentConfirmedAt = new Date().toISOString();
    await saveClient(client);

    // Send admin notification
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: \`💰 Payment Confirmed: \${client.data.businessName || client.data.email}\`,
      html: \`<p><strong>\${client.data.businessName || '(unnamed)'}</strong> payment confirmed via Stripe.</p>
        <p><strong>Client ID:</strong> \${client.id}</p>
        <p><strong>Email:</strong> \${client.data.email}</p>
        <p><strong>Plan:</strong> \${client.data.selectedPlan || client.data.plan || '(unknown)'}</p>
        <p><strong>Amount:</strong> $\${(session.amount_total / 100).toFixed(2)}</p>
        <p><strong>Status:</strong> \${client.status}</p>
        <p>Welcome email sent automatically.</p>\`
    }).catch(err => console.error('[stripe-webhook] Admin notification failed:', err.message));

    res.json({ received: true, emailSent: true });
  } catch (err) {
    console.error('[stripe-webhook] Error sending welcome email:', err.message);
    // Don't block webhook — return 200 OK anyway
    res.json({ received: true, emailError: err.message });
  }
});

console.log('[module] routes/stripe-webhook.js loaded');
module.exports = router;
