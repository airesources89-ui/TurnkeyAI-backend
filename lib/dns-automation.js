// ════════════════════════════════════════════════
// ── lib/dns-automation.js — Cloudflare DNS automation
// ── Called at intake submission for hands-free DNS clients.
// ── Creates a Cloudflare zone for the client's domain and
// ── sets A / CNAME records pointing to Railway.
// ── ALL failures are non-fatal — intake completes regardless.
// ════════════════════════════════════════════════

const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const DNS_A_RECORD_IP = process.env.DNS_A_RECORD_IP; // Railway static IP, e.g. "1.2.3.4"
const RAILWAY_CNAME   = process.env.RAILWAY_CNAME || 'turnkeyai-backend-production.up.railway.app';

const CF_BASE = 'https://api.cloudflare.com/client/v4';

// ── Internal helper: Cloudflare API request ──
async function cfRequest(method, path, body) {
  if (!CF_API_TOKEN) {
    console.warn('[dns-automation] CF_API_TOKEN not set — skipping');
    return null;
  }
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${CF_BASE}${path}`, opts);
  const data = await res.json();
  if (!data.success) {
    // Log errors but do not throw — caller decides how to handle
    console.warn(`[dns-automation] CF API ${method} ${path} errors:`, JSON.stringify(data.errors));
  }
  return data;
}

// ── Step 1: Create or retrieve a Cloudflare zone for the domain ──
async function createOrGetZone(domain) {
  // Try to create the zone
  const createResult = await cfRequest('POST', '/zones', {
    name: domain,
    account: { id: CF_ACCOUNT_ID },
    jump_start: false,
  });
  if (!createResult) return null;

  if (createResult.success) {
    console.log(`[dns-automation] Zone created for ${domain}: ${createResult.result.id}`);
    return createResult.result.id;
  }

  // If zone already exists (code 1061), retrieve it
  const alreadyExists = (createResult.errors || []).some(e => e.code === 1061);
  if (alreadyExists) {
    const listResult = await cfRequest('GET', `/zones?name=${encodeURIComponent(domain)}&account.id=${CF_ACCOUNT_ID}`);
    if (listResult && listResult.success && listResult.result.length > 0) {
      const zoneId = listResult.result[0].id;
      console.log(`[dns-automation] Zone already exists for ${domain}: ${zoneId}`);
      return zoneId;
    }
  }

  console.warn(`[dns-automation] Could not create or retrieve zone for ${domain}`);
  return null;
}

// ── Step 2: Add A record (@) and CNAME (www) to zone ──
async function addDnsRecords(zoneId, domain) {
  const records = [];

  if (DNS_A_RECORD_IP) {
    // Use static IP if provided
    records.push({ type: 'A',     name: domain, content: DNS_A_RECORD_IP, ttl: 1, proxied: true });
    records.push({ type: 'CNAME', name: 'www',  content: domain,          ttl: 1, proxied: true });
  } else {
    // Fall back to CNAME-only pointing to Railway hostname
    // Use '@' for zone apex — Cloudflare handles CNAME flattening automatically
    records.push({ type: 'CNAME', name: '@',   content: RAILWAY_CNAME, ttl: 1, proxied: true });
    records.push({ type: 'CNAME', name: 'www', content: RAILWAY_CNAME, ttl: 1, proxied: true });
  }

  const results = [];
  for (const record of records) {
    const result = await cfRequest('POST', `/zones/${zoneId}/dns_records`, record);
    results.push({ record: record.name, success: result ? result.success : false });
  }
  return results;
}

// ── Main export: trigger full Cloudflare DNS setup for a domain ──
// Returns { success: bool, zoneId: string|null, records: array, error: string|null }
async function triggerCloudflareDnsSetup(domain) {
  if (!domain) {
    console.warn('[dns-automation] No domain provided — skipping');
    return { success: false, zoneId: null, records: [], error: 'No domain provided' };
  }

  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    console.warn('[dns-automation] Missing CF_API_TOKEN or CF_ACCOUNT_ID — DNS automation skipped');
    return { success: false, zoneId: null, records: [], error: 'Missing Cloudflare credentials' };
  }

  // Normalize domain: strip protocol, trailing slashes, www prefix
  const normalizedDomain = domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();

  if (!normalizedDomain || !normalizedDomain.includes('.')) {
    console.warn(`[dns-automation] Invalid domain after normalization: "${normalizedDomain}"`);
    return { success: false, zoneId: null, records: [], error: 'Invalid domain format' };
  }

  try {
    const zoneId = await createOrGetZone(normalizedDomain);
    if (!zoneId) {
      return { success: false, zoneId: null, records: [], error: 'Zone creation failed' };
    }

    const records = await addDnsRecords(zoneId, normalizedDomain);
    const allOk = records.every(r => r.success);

    console.log(`[dns-automation] Setup complete for ${normalizedDomain} — zone: ${zoneId}, records:`, records);
    return { success: allOk, zoneId, records, error: null };

  } catch (err) {
    console.error('[dns-automation] Unexpected error:', err.message);
    return { success: false, zoneId: null, records: [], error: err.message };
  }
}

console.log('[module] lib/dns-automation.js loaded');

module.exports = { triggerCloudflareDnsSetup };
