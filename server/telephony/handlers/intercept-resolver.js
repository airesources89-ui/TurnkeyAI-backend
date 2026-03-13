// ============================================================
// TURNKEYAI SERVICES — INTERCEPT MODE RESOLVER
// Determines which intercept mode is active for a tenant
// at the time of an inbound call.
// Modes: 'forward' | 'intercept' | 'after_hours'
// ============================================================

'use strict';

const tenantConfigService = require('./tenant-config-service');

// ------------------------------------------------------------
// INTERCEPT MODE CONSTANTS
// ------------------------------------------------------------
const INTERCEPT_MODES = Object.freeze({
  FORWARD:     'forward',      // Ring-forward to owner phone
  INTERCEPT:   'intercept',    // TurnkeyAI answers, handles call
  AFTER_HOURS: 'after_hours'   // After-hours handling (SMS + voicemail)
});

// ------------------------------------------------------------
// BUSINESS HOURS CHECK
// Returns true if current time falls within tenant's
// configured business hours.
// business_hours expected format:
// { monday: { open: '09:00', close: '17:00', closed: false }, ... }
// ------------------------------------------------------------
function isWithinBusinessHours(businessHours) {
  if (!businessHours) return true; // Default: always open

  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[now.getDay()];
  const dayConfig = businessHours[dayName];

  if (!dayConfig || dayConfig.closed) return false;

  const [openH, openM]   = (dayConfig.open  || '09:00').split(':').map(Number);
  const [closeH, closeM] = (dayConfig.close || '17:00').split(':').map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes    = openH  * 60 + openM;
  const closeMinutes   = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// ------------------------------------------------------------
// RESOLVE MODE
// Returns the active intercept mode for a given tenant.
// After-hours overrides all other modes if enabled and
// current time is outside business hours.
// ------------------------------------------------------------
async function resolveMode(tenantId) {
  const config = await tenantConfigService.getTenantConfig(tenantId);

  if (!config) {
    console.warn(`[InterceptResolver] No config for tenant ${tenantId} — defaulting to forward`);
    return INTERCEPT_MODES.FORWARD;
  }

  // After-hours check takes priority
  if (config.after_hours_enabled) {
    const withinHours = isWithinBusinessHours(config.business_hours);
    if (!withinHours) {
      return INTERCEPT_MODES.AFTER_HOURS;
    }
  }

  // Fall through to configured intercept mode
  const mode = config.intercept_mode || INTERCEPT_MODES.FORWARD;

  if (!Object.values(INTERCEPT_MODES).includes(mode)) {
    console.warn(`[InterceptResolver] Unknown intercept_mode '${mode}' for tenant ${tenantId} — defaulting to forward`);
    return INTERCEPT_MODES.FORWARD;
  }

  return mode;
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  resolveMode,
  isWithinBusinessHours,
  INTERCEPT_MODES
};
