// ============================================================
// TURNKEYAI SERVICES — CALL ROUTER
// Handles 'call.initiated' events.
// Resolves intercept mode and returns appropriate TwiML.
// ============================================================

'use strict';

const tenantConfigService = require('./tenant-config-service');
const interceptResolver   = require('./intercept-resolver');
const twilioAdapter       = require('../twilio-adapter');

// ------------------------------------------------------------
// HANDLE CALL INITIATED
// Entry point — called by Event Router for 'call.initiated'.
// Returns TwiML string.
// ------------------------------------------------------------
async function handleCallInitiated(context) {
  const { tenantId, callSid, from } = context;

  console.log(`[CallRouter] call.initiated — tenant: ${tenantId}, callSid: ${callSid}`);

  // Resolve intercept mode
  const mode = await interceptResolver.resolveMode(tenantId);
  console.log(`[CallRouter] Intercept mode: ${mode} — tenant: ${tenantId}`);

  switch (mode) {
    case interceptResolver.INTERCEPT_MODES.FORWARD:
      return handleForward(tenantId, context);

    case interceptResolver.INTERCEPT_MODES.INTERCEPT:
      return handleIntercept(tenantId, context);

    case interceptResolver.INTERCEPT_MODES.AFTER_HOURS:
      return handleAfterHours(tenantId, context);

    default:
      console.warn(`[CallRouter] Unhandled mode '${mode}' — falling back`);
      return twilioAdapter.buildFallbackTwiML();
  }
}

// ------------------------------------------------------------
// FORWARD MODE
// Ring-forward to the owner's phone number.
// ------------------------------------------------------------
async function handleForward(tenantId, context) {
  const config = await tenantConfigService.getTenantConfig(tenantId);

  if (!config || !config.forward_to_number) {
    console.warn(`[CallRouter] No forward_to_number for tenant ${tenantId} — using fallback`);
    return twilioAdapter.buildFallbackTwiML();
  }

  console.log(`[CallRouter] Forwarding call to ${config.forward_to_number}`);
  return twilioAdapter.buildRingForwardTwiML(config.forward_to_number);
}

// ------------------------------------------------------------
// INTERCEPT MODE
// TurnkeyAI answers the call (Phase 2: media stream + AI).
// For MVP: ring-forward with intercept flag logged.
// ------------------------------------------------------------
async function handleIntercept(tenantId, context) {
  // Phase 2 will connect to AI media stream
  // MVP: forward to owner with a log note
  console.log(`[CallRouter] Intercept mode — Phase 2 handler not yet built. Forwarding. tenant: ${tenantId}`);
  return handleForward(tenantId, context);
}

// ------------------------------------------------------------
// AFTER HOURS MODE
// Hang up and trigger missed call handler via event.
// The missed-call-handler will send the SMS text-back.
// ------------------------------------------------------------
async function handleAfterHours(tenantId, context) {
  console.log(`[CallRouter] After-hours call — hanging up and triggering missed call. tenant: ${tenantId}`);
  // Hang up immediately — missed-call-handler will fire on
  // the subsequent 'call.missed' status callback from Twilio
  return twilioAdapter.buildHangupTwiML();
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  handleCallInitiated
};
