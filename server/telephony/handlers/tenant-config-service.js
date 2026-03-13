// ============================================================
// TURNKEYAI SERVICES — TENANT CONFIG SERVICE
// Resolves tenant configuration from the database.
// Single source of truth for all tenant lookups.
// One Twilio number = one tenant.
// ============================================================

'use strict';

const { Pool } = require('pg');

// ------------------------------------------------------------
// DB CONNECTION
// Reuses the existing DATABASE_URL environment variable.
// ------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ------------------------------------------------------------
// SIMPLE IN-MEMORY CACHE
// Reduces DB hits for repeated lookups on the same number.
// TTL: 5 minutes.
// ------------------------------------------------------------
const configCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = configCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    configCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value) {
  configCache.set(key, { value, ts: Date.now() });
}

// ------------------------------------------------------------
// GET TENANT ID BY TWILIO NUMBER
// Looks up the client record by their assigned Twilio number.
// Returns tenantId (string) or null if not found.
// ------------------------------------------------------------
async function getTenantIdByNumber(twilioNumber) {
  if (!twilioNumber) return null;

  const cached = getCached(twilioNumber);
  if (cached) return cached;

  const result = await pool.query(
    'SELECT id FROM clients WHERE twilio_number = $1 AND status != $2 LIMIT 1',
    [twilioNumber, 'cancelled']
  );

  if (result.rows.length === 0) return null;

  const tenantId = String(result.rows[0].id);
  setCache(twilioNumber, tenantId);
  return tenantId;
}

// ------------------------------------------------------------
// GET TENANT CONFIG
// Returns full tenant config needed by handlers.
// Includes: business name, owner phone, owner email,
// intercept mode, after-hours settings.
// ------------------------------------------------------------
async function getTenantConfig(tenantId) {
  if (!tenantId) return null;

  const cacheKey = `config:${tenantId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await pool.query(
    `SELECT
       id,
       business_name,
       owner_phone,
       owner_email,
       twilio_number,
       intercept_mode,
       forward_to_number,
       after_hours_enabled,
       business_hours,
       status
     FROM clients
     WHERE id = $1
     LIMIT 1`,
    [tenantId]
  );

  if (result.rows.length === 0) return null;

  const config = result.rows[0];
  setCache(cacheKey, config);
  return config;
}

// ------------------------------------------------------------
// INVALIDATE CACHE
// Called when a tenant's config is updated.
// ------------------------------------------------------------
function invalidateCache(tenantId, twilioNumber) {
  if (tenantId)     configCache.delete(`config:${tenantId}`);
  if (twilioNumber) configCache.delete(twilioNumber);
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  getTenantIdByNumber,
  getTenantConfig,
  invalidateCache
};
