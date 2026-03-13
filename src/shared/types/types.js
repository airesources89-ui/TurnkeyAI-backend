// ============================================================
// TURNKEYAI SERVICES — SHARED TYPES
// Core data contracts for the telephony pipeline.
// TelephonyEvent: emitted by Adapter (immutable)
// SessionContext: built by Event Router, passed downstream
// ============================================================

'use strict';

// ------------------------------------------------------------
// TELEPHONY EVENT
// Emitted by the Twilio Adapter on every inbound webhook.
// Frozen — no downstream code may mutate this object.
// ------------------------------------------------------------

/**
 * @typedef {Object} TelephonyEvent
 * @property {string} callSid       - Twilio CallSid (unique per call)
 * @property {string} from          - Caller's phone number (E.164)
 * @property {string} to            - Called number / tenant's Twilio number (E.164)
 * @property {string} direction     - 'inbound' | 'outbound'
 * @property {string} eventType     - 'call.initiated' | 'call.ringing' | 'call.answered' |
 *                                    'call.completed' | 'call.missed' | 'sms.received'
 * @property {number} timestamp     - Unix ms timestamp of event receipt
 * @property {Object} rawWebhook    - Original Twilio webhook payload (frozen)
 */

/**
 * Factory — builds and freezes a TelephonyEvent.
 * @param {Object} params
 * @returns {TelephonyEvent}
 */
function createTelephonyEvent({ callSid, from, to, direction, eventType, rawWebhook }) {
  if (!callSid) throw new Error('TelephonyEvent requires callSid');
  if (!from)    throw new Error('TelephonyEvent requires from');
  if (!to)      throw new Error('TelephonyEvent requires to');
  if (!eventType) throw new Error('TelephonyEvent requires eventType');

  return Object.freeze({
    callSid,
    from,
    to,
    direction: direction || 'inbound',
    eventType,
    timestamp: Date.now(),
    rawWebhook: Object.freeze({ ...rawWebhook })
  });
}

// ------------------------------------------------------------
// SESSION CONTEXT
// Built by the Event Router and passed to all handlers.
// Contains only what handlers need — raw webhook metadata
// is explicitly excluded.
// ------------------------------------------------------------

/**
 * @typedef {Object} SessionContext
 * @property {string} tenantId      - Internal tenant/client ID (from DB lookup on `to` number)
 * @property {string} callSid       - Twilio CallSid
 * @property {string} direction     - 'inbound' | 'outbound'
 * @property {string} eventType     - mirrors TelephonyEvent.eventType
 * @property {number} timestamp     - mirrors TelephonyEvent.timestamp
 * @property {string} from          - Caller number (E.164)
 * @property {string} to            - Tenant Twilio number (E.164)
 */

/**
 * Factory — builds a SessionContext from a TelephonyEvent + resolved tenantId.
 * Metadata fields from rawWebhook are explicitly NOT forwarded.
 * @param {TelephonyEvent} event
 * @param {string} tenantId
 * @returns {SessionContext}
 */
function createSessionContext(event, tenantId) {
  if (!event)    throw new Error('SessionContext requires a TelephonyEvent');
  if (!tenantId) throw new Error('SessionContext requires tenantId');

  // Explicit whitelist — rawWebhook and any other metadata never flow through
  return {
    tenantId,
    callSid:   event.callSid,
    direction: event.direction,
    eventType: event.eventType,
    timestamp: event.timestamp,
    from:      event.from,
    to:        event.to
  };
}

// ------------------------------------------------------------
// EVENT TYPE CONSTANTS
// ------------------------------------------------------------

const EVENT_TYPES = Object.freeze({
  CALL_INITIATED:  'call.initiated',
  CALL_RINGING:    'call.ringing',
  CALL_ANSWERED:   'call.answered',
  CALL_COMPLETED:  'call.completed',
  CALL_MISSED:     'call.missed',
  SMS_RECEIVED:    'sms.received'
});

// MVP events — dispatched synchronously by Event Router
const MVP_EVENTS = Object.freeze([
  EVENT_TYPES.CALL_INITIATED,
  EVENT_TYPES.CALL_MISSED,
  EVENT_TYPES.SMS_RECEIVED
]);

// Phase 2 events — dropped gracefully with log (not yet handled)
const PHASE2_EVENTS = Object.freeze([
  EVENT_TYPES.CALL_RINGING,
  EVENT_TYPES.CALL_ANSWERED,
  EVENT_TYPES.CALL_COMPLETED
]);

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  createTelephonyEvent,
  createSessionContext,
  EVENT_TYPES,
  MVP_EVENTS,
  PHASE2_EVENTS
};
