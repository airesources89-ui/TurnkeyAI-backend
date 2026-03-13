// ============================================================
// TURNKEYAI SERVICES — TWILIO ADAPTER
// Implements all 8 interface contract methods.
// Single responsibility: receive Twilio webhooks, validate,
// deduplicate, classify, and emit TelephonyEvents.
// Never sends SMS to the caller directly.
// ============================================================

'use strict';

const twilio = require('twilio');
const { createTelephonyEvent, EVENT_TYPES } = require('../shared/types');

// ------------------------------------------------------------
// IDEMPOTENCY CACHE
// Prevents duplicate processing of the same CallSid.
// Simple in-memory LRU — good enough for MVP.
// ------------------------------------------------------------
const IDEMPOTENCY_CACHE = new Map();
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCached(callSid) {
  const entry = IDEMPOTENCY_CACHE.get(callSid);
  if (!entry) return false;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    IDEMPOTENCY_CACHE.delete(callSid);
    return false;
  }
  return true;
}

function cacheCallSid(callSid) {
  if (IDEMPOTENCY_CACHE.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry
    const firstKey = IDEMPOTENCY_CACHE.keys().next().value;
    IDEMPOTENCY_CACHE.delete(firstKey);
  }
  IDEMPOTENCY_CACHE.set(callSid, { ts: Date.now() });
}

// ------------------------------------------------------------
// 1. WEBHOOK SIGNATURE VALIDATION
// Validates that the request genuinely came from Twilio.
// ------------------------------------------------------------
function validateSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) throw new Error('TWILIO_AUTH_TOKEN not set');

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) return false;

  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  return twilio.validateRequest(authToken, twilioSignature, url, req.body);
}

// ------------------------------------------------------------
// 2. EVENT TYPE DETERMINATION
// Maps Twilio webhook fields to our internal event types.
// ------------------------------------------------------------
function determineEventType(body) {
  const callStatus = (body.CallStatus || '').toLowerCase();
  const smsSid = body.SmsSid || body.MessageSid;

  if (smsSid) return EVENT_TYPES.SMS_RECEIVED;

  switch (callStatus) {
    case 'ringing':    return EVENT_TYPES.CALL_RINGING;
    case 'in-progress': return EVENT_TYPES.CALL_ANSWERED;
    case 'completed':  return EVENT_TYPES.CALL_COMPLETED;
    case 'no-answer':
    case 'busy':
    case 'failed':     return EVENT_TYPES.CALL_MISSED;
    default:           return EVENT_TYPES.CALL_INITIATED;
  }
}

// ------------------------------------------------------------
// 3. RING-FORWARD TWIML
// Returns TwiML to forward a call to the business owner.
// ------------------------------------------------------------
function buildRingForwardTwiML(forwardTo) {
  const twiml = new twilio.twiml.VoiceResponse();
  const dial = twiml.dial({ timeout: 20, action: '/telephony/webhook/status' });
  dial.number(forwardTo);
  return twiml.toString();
}

// ------------------------------------------------------------
// 4. MEDIA STREAM TWIML
// Returns TwiML to connect call to a media stream (Phase 2).
// ------------------------------------------------------------
function buildMediaStreamTwiML(streamUrl) {
  const twiml = new twilio.twiml.VoiceResponse();
  const start = twiml.start();
  start.stream({ url: streamUrl });
  twiml.say('Please hold while we connect you.');
  return twiml.toString();
}

// ------------------------------------------------------------
// 5. FALLBACK MESSAGE TWIML
// Returns TwiML with a generic fallback voice message.
// ------------------------------------------------------------
function buildFallbackTwiML() {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    { voice: 'Polly.Joanna' },
    'Thank you for calling. We are unable to take your call right now. Please try again later.'
  );
  twiml.hangup();
  return twiml.toString();
}

// ------------------------------------------------------------
// 6. HANGUP TWIML
// Returns TwiML that immediately hangs up.
// ------------------------------------------------------------
function buildHangupTwiML() {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.hangup();
  return twiml.toString();
}

// ------------------------------------------------------------
// 7. SMS GUARDRAIL
// Sends an SMS — but NEVER to the caller (from number).
// Throws if destination === event.from.
// ------------------------------------------------------------
async function sendSMS({ to, from, body, event }) {
  if (event && to === event.from) {
    throw new Error('SMS guardrail violation: cannot send SMS to caller');
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  return client.messages.create({ to, from, body });
}

// ------------------------------------------------------------
// 8. MAIN WEBHOOK HANDLER
// Entry point — validates, deduplicates, builds TelephonyEvent,
// then hands off to the Event Router.
// ------------------------------------------------------------
async function handleWebhook(req, res, eventRouter) {
  // Validate signature
  if (!validateSignature(req)) {
    console.warn('[TwilioAdapter] Invalid signature — rejected');
    return res.status(403).send('Forbidden');
  }

  const body = req.body;
  const callSid = body.CallSid || body.SmsSid || body.MessageSid;

  if (!callSid) {
    console.warn('[TwilioAdapter] No CallSid/SmsSid — rejected');
    return res.status(400).send('Bad Request');
  }

  // Idempotency check
  if (isCached(callSid)) {
    console.log(`[TwilioAdapter] Duplicate webhook for ${callSid} — ignored`);
    return res.status(200).send('<Response></Response>');
  }
  cacheCallSid(callSid);

  // Build TelephonyEvent
  let event;
  try {
    event = createTelephonyEvent({
      callSid,
      from:       body.From || body.from,
      to:         body.To   || body.to,
      direction:  (body.Direction || 'inbound').toLowerCase(),
      eventType:  determineEventType(body),
      rawWebhook: body
    });
  } catch (err) {
    console.error('[TwilioAdapter] Failed to build TelephonyEvent:', err.message);
    return res.status(400).send('Bad Request');
  }

  // Hand off to Event Router — response TwiML comes back
  try {
    const twiml = await eventRouter.route(event);
    res.type('text/xml').send(twiml || '<Response></Response>');
  } catch (err) {
    console.error('[TwilioAdapter] Event Router error:', err.message);
    // Never let errors propagate back to Twilio with a 5xx
    res.type('text/xml').send(buildFallbackTwiML());
  }
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  handleWebhook,
  validateSignature,
  determineEventType,
  buildRingForwardTwiML,
  buildMediaStreamTwiML,
  buildFallbackTwiML,
  buildHangupTwiML,
  sendSMS
};
