// ============================================================
// TURNKEYAI SERVICES — MISSED CALL HANDLER
// Handles 'call.missed' events.
// Sends an SMS text-back to the caller and notifies the
// business owner.
// SMS guardrail enforced — never sends to caller via sendSMS
// direct path; uses Twilio messaging API safely.
// ============================================================

'use strict';

const twilio = require('twilio');
const tenantConfigService = require('./tenant-config-service');

// ------------------------------------------------------------
// HANDLE CALL MISSED
// Entry point — called by Event Router for 'call.missed'.
// Returns empty TwiML (no voice response needed).
// ------------------------------------------------------------
async function handleCallMissed(context) {
  const { tenantId, callSid, from, to } = context;

  console.log(`[MissedCallHandler] call.missed — tenant: ${tenantId}, from: ${from}, callSid: ${callSid}`);

  const config = await tenantConfigService.getTenantConfig(tenantId);
  if (!config) {
    console.warn(`[MissedCallHandler] No config for tenant ${tenantId} — cannot send SMS`);
    return '<Response></Response>';
  }

  // Fire both notifications concurrently — errors in either
  // are caught independently so one failure doesn't block the other
  await Promise.allSettled([
    sendCallerTextBack(from, to, config, callSid),
    notifyOwner(from, config, callSid)
  ]);

  return '<Response></Response>';
}

// ------------------------------------------------------------
// SEND CALLER TEXT-BACK
// Sends an SMS to the caller acknowledging the missed call.
// 'from' in this SMS = tenant's Twilio number (the 'to' field
// on the original inbound call).
// ------------------------------------------------------------
async function sendCallerTextBack(callerNumber, tenantTwilioNumber, config, callSid) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const businessName = config.business_name || 'us';
  const message =
    `Hi! Thanks for calling ${businessName}. Sorry we missed you — ` +
    `we're with another customer right now. Reply to this text and we'll get back to you ASAP!`;

  try {
    await client.messages.create({
      to:   callerNumber,
      from: tenantTwilioNumber,  // Tenant's dedicated Twilio number
      body: message
    });
    console.log(`[MissedCallHandler] Text-back sent to ${callerNumber} — callSid: ${callSid}`);
  } catch (err) {
    console.error(`[MissedCallHandler] Failed to send text-back to ${callerNumber}:`, err.message);
  }
}

// ------------------------------------------------------------
// NOTIFY OWNER
// Sends an SMS alert to the business owner.
// ------------------------------------------------------------
async function notifyOwner(callerNumber, config, callSid) {
  if (!config.owner_phone) {
    console.warn(`[MissedCallHandler] No owner_phone for tenant — skipping owner notification`);
    return;
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const message =
    `📞 MISSED CALL ALERT\n` +
    `Business: ${config.business_name}\n` +
    `From: ${callerNumber}\n` +
    `Time: ${new Date().toLocaleString()}\n` +
    `Auto text-back sent. Call them back when you can!`;

  try {
    await client.messages.create({
      to:   config.owner_phone,
      from: process.env.TWILIO_PHONE_NUMBER,  // Platform's main Twilio number
      body: message
    });
    console.log(`[MissedCallHandler] Owner notified at ${config.owner_phone} — callSid: ${callSid}`);
  } catch (err) {
    console.error(`[MissedCallHandler] Failed to notify owner:`, err.message);
  }
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  handleCallMissed
};
