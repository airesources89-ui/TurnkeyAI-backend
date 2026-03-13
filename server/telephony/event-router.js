// ============================================================
// TURNKEYAI SERVICES — EVENT ROUTER
// Routes TelephonyEvents to the correct handler.
// MVP events dispatched SYNC.
// Phase 2 events dropped gracefully with a log.
// Handler errors are contained — never propagate to Twilio.
// ============================================================

'use strict';

const { createSessionContext, MVP_EVENTS, PHASE2_EVENTS } = require('../shared/types');
const tenantConfigService = require('./handlers/tenant-config-service');

// ------------------------------------------------------------
// ROUTING TABLE
// Maps eventType strings to handler modules.
// Populated at init — see registerHandlers() below.
// ------------------------------------------------------------
const routingTable = new Map();

/**
 * Register handlers against event types.
 * Called once at startup.
 * @param {Object} handlers - { eventType: handlerFn, ... }
 */
function registerHandlers(handlers) {
  for (const [eventType, handlerFn] of Object.entries(handlers)) {
    routingTable.set(eventType, handlerFn);
  }
  console.log(`[EventRouter] Registered handlers for: ${[...routingTable.keys()].join(', ')}`);
}

// ------------------------------------------------------------
// ROUTE
// Main dispatch method — called by the Twilio Adapter.
// Returns TwiML string or empty response.
// ------------------------------------------------------------
async function route(event) {
  const { eventType, callSid, to } = event;

  // Phase 2 events — drop gracefully
  if (PHASE2_EVENTS.includes(eventType)) {
    console.log(`[EventRouter] Phase 2 event dropped gracefully: ${eventType} (${callSid})`);
    return '<Response></Response>';
  }

  // MVP events — must be in routing table
  if (!MVP_EVENTS.includes(eventType)) {
    console.warn(`[EventRouter] Unknown event type: ${eventType} (${callSid})`);
    return '<Response></Response>';
  }

  // Resolve tenant from the 'to' number
  let tenantId;
  try {
    tenantId = await tenantConfigService.getTenantIdByNumber(to);
  } catch (err) {
    console.error(`[EventRouter] Tenant lookup failed for ${to}:`, err.message);
    return '<Response></Response>';
  }

  if (!tenantId) {
    console.warn(`[EventRouter] No tenant found for number: ${to}`);
    return '<Response></Response>';
  }

  // Build SessionContext — metadata explicitly excluded
  const context = createSessionContext(event, tenantId);

  // Dispatch to handler
  const handler = routingTable.get(eventType);
  if (!handler) {
    console.warn(`[EventRouter] No handler registered for: ${eventType}`);
    return '<Response></Response>';
  }

  // Handler errors are contained — never propagate back to Twilio
  try {
    const twiml = await handler(context);
    return twiml || '<Response></Response>';
  } catch (err) {
    console.error(`[EventRouter] Handler error for ${eventType} (${callSid}):`, err.message);
    return '<Response></Response>';
  }
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  registerHandlers,
  route
};
