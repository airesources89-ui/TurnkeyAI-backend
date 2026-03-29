// ════════════════════════════════════════════════
// ── lib/db.js — Database, client storage, initDB
// ════════════════════════════════════════════════
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ── Shared in-memory client cache (exported by reference) ──
const clients = {};

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      data JSONB NOT NULL DEFAULT '{}',
      preview_token TEXT,
      dash_token TEXT,
      dash_password TEXT,
      live_url TEXT,
      cf_project_name TEXT,
      mini_me_consent BOOLEAN DEFAULT FALSE,
      mini_me_consent_at TIMESTAMPTZ,
      mini_me_subscribed BOOLEAN DEFAULT FALSE,
      mini_me_subscribed_at TIMESTAMPTZ,
      mini_me_video_file TEXT,
      promo_video_file TEXT,
      free_video_requested BOOLEAN DEFAULT FALSE,
      logo_file TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Telephony columns (idempotent) ──
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS twilio_number TEXT`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS forwarding_number TEXT`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_hours_json JSONB`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telephony_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ivr_greeting_file TEXT`);

  // ── Login ID column (idempotent) ──
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS dash_login_id VARCHAR(20) UNIQUE`);

  // ── Payment confirmation tracking (idempotent) ──
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`);

  // ── Encrypted registrar credentials (idempotent) ──
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS registrar_username_enc TEXT`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS registrar_password_enc TEXT`);

  // ── Analytics events table (idempotent) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_analytics_client_type_date
    ON analytics_events (client_id, event_type, created_at)
  `);

  // ── Coming Soon features table ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coming_soon_features (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'New Feature',
      rating_sum INTEGER DEFAULT 0,
      total_ratings INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Territory Partner applications table ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS territory_partner_applications (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      company_name TEXT,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,
      website TEXT,
      business_description TEXT,
      tier TEXT NOT NULL,
      industries JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_territory_partner_status
    ON territory_partner_applications (status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_territory_partner_email
    ON territory_partner_applications (email)
  `);

  // ── Partner ID on clients (idempotent) ──
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS partner_id TEXT`);

  // ── Territory columns (idempotent) ──
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_name TEXT`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_type TEXT`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_zips JSONB`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_cities TEXT`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_counties TEXT`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_radius_center TEXT`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_radius_miles INTEGER`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS territory_notes TEXT`);

  // ── Hub credential columns (idempotent) ──
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS hub_login_id VARCHAR(20) UNIQUE`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS hub_password TEXT`);
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS hub_token TEXT`);

  // ── Hub token expiry column (idempotent) ──
  await pool.query(`ALTER TABLE territory_partner_applications ADD COLUMN IF NOT EXISTS hub_token_expires_at TIMESTAMPTZ`);

  // ── Appointments table (idempotent) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      service TEXT,
      appointment_date DATE NOT NULL,
      appointment_time VARCHAR(10) NOT NULL,
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'booked',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_double_book
    ON appointments (client_id, appointment_date, appointment_time)
    WHERE status = 'booked'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_client_date
    ON appointments (client_id, appointment_date)
  `);

  console.log('[DB] Tables ready.');

  // ── Seed coming-soon features (idempotent) ──
  const seedFeatures = [
    ['google_business', 'Google Business Profile Sync', 'Automatically sync your website info to your Google Business Profile. When you update your site, Google updates too.', 'Google Integration', 1],
    ['lead_crm', 'Built-In Lead CRM & Pipeline', 'Every booking request, chat inquiry, and form submission captured in one dashboard. No more lost leads.', 'Lead Management', 2],
    ['review_engine', 'Automated Review Request Engine', 'After every completed job, your customer gets an automatic text or email asking for a Google review.', 'Reputation', 3],
    ['call_summaries', 'AI Call Summaries', 'Every call to your business automatically summarized by AI — who called, what they needed, and what was discussed.', 'AI Phone', 4],
    ['online_estimator', 'Online Estimator', 'Let customers get a ballpark estimate directly from your website by answering a few simple questions about their project.', 'Customer Tools', 5],
    ['domain_auto', 'One-Click Custom Domain Setup', 'Tell us the domain you want and we handle everything — registration, DNS, SSL, email forwarding.', 'Infrastructure', 6],
  ];
  for (const [id, name, description, category, sortOrder] of seedFeatures) {
    await pool.query(
      `INSERT INTO coming_soon_features (id, name, description, category, sort_order) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [id, name, description, category, sortOrder]
    );
  }
  console.log('[DB] Coming-soon features seeded.');
}

async function loadClientsFromDB() {
  const result = await pool.query('SELECT * FROM clients');
  // Clear and reload
  Object.keys(clients).forEach(k => delete clients[k]);
  for (const row of result.rows) { clients[row.id] = rowToClient(row); }
  console.log(`[DB] Loaded ${result.rows.length} clients.`);
}

function rowToClient(row) {
  return {
    id: row.id, status: row.status, data: row.data || {},
    previewToken: row.preview_token, dashToken: row.dash_token,
    dashPassword: row.dash_password, dashLoginId: row.dash_login_id || null,
    liveUrl: row.live_url,
    cfProjectName: row.cf_project_name,
    miniMeConsent: row.mini_me_consent,
    miniMeConsentAt: row.mini_me_consent_at ? row.mini_me_consent_at.toISOString() : null,
    miniMeSubscribed: row.mini_me_subscribed,
    miniMeSubscribedAt: row.mini_me_subscribed_at ? row.mini_me_subscribed_at.toISOString() : null,
    miniMeVideoFile: row.mini_me_video_file, promoVideoFile: row.promo_video_file,
    freeVideoRequested: row.free_video_requested, logoFile: row.logo_file,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    // ── Telephony fields ──
    twilioNumber: row.twilio_number || null,
    forwardingNumber: row.forwarding_number || null,
    businessHoursJson: row.business_hours_json || null,
    telephonyEnabled: row.telephony_enabled || false,
    ivrGreetingFile: row.ivr_greeting_file || null,
    // ── Payment tracking ──
    paymentConfirmed: row.payment_confirmed || false,
    paymentConfirmedAt: row.payment_confirmed_at ? row.payment_confirmed_at.toISOString() : null,
    // ── Encrypted credentials ──
    registrarUsernameEnc: row.registrar_username_enc || null,
    registrarPasswordEnc: row.registrar_password_enc || null,
  };
}

async function saveClient(client) {
  clients[client.id] = client;
  try {
    await pool.query(`
      INSERT INTO clients (
        id,status,data,preview_token,dash_token,dash_password,dash_login_id,
        live_url,cf_project_name,mini_me_consent,mini_me_consent_at,
        mini_me_subscribed,mini_me_subscribed_at,mini_me_video_file,
        promo_video_file,free_video_requested,logo_file,approved_at,
        twilio_number,forwarding_number,business_hours_json,telephony_enabled,
        ivr_greeting_file,
        payment_confirmed,payment_confirmed_at,
        registrar_username_enc,registrar_password_enc,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW())
      ON CONFLICT (id) DO UPDATE SET
        status=EXCLUDED.status, data=EXCLUDED.data,
        preview_token=EXCLUDED.preview_token, dash_token=EXCLUDED.dash_token,
        dash_password=EXCLUDED.dash_password, dash_login_id=EXCLUDED.dash_login_id,
        live_url=EXCLUDED.live_url,
        cf_project_name=EXCLUDED.cf_project_name,
        mini_me_consent=EXCLUDED.mini_me_consent,
        mini_me_consent_at=EXCLUDED.mini_me_consent_at,
        mini_me_subscribed=EXCLUDED.mini_me_subscribed,
        mini_me_subscribed_at=EXCLUDED.mini_me_subscribed_at,
        mini_me_video_file=EXCLUDED.mini_me_video_file,
        promo_video_file=EXCLUDED.promo_video_file,
        free_video_requested=EXCLUDED.free_video_requested,
        logo_file=EXCLUDED.logo_file, approved_at=EXCLUDED.approved_at,
        twilio_number=EXCLUDED.twilio_number,
        forwarding_number=EXCLUDED.forwarding_number,
        business_hours_json=EXCLUDED.business_hours_json,
        telephony_enabled=EXCLUDED.telephony_enabled,
        ivr_greeting_file=EXCLUDED.ivr_greeting_file,
        payment_confirmed=EXCLUDED.payment_confirmed,
        payment_confirmed_at=EXCLUDED.payment_confirmed_at,
        registrar_username_enc=EXCLUDED.registrar_username_enc,
        registrar_password_enc=EXCLUDED.registrar_password_enc,
        updated_at=NOW()
    `, [
      client.id, client.status, JSON.stringify(client.data),
      client.previewToken, client.dashToken, client.dashPassword,
      client.dashLoginId || null,
      client.liveUrl, client.cfProjectName,
      client.miniMeConsent || false, client.miniMeConsentAt || null,
      client.miniMeSubscribed || false, client.miniMeSubscribedAt || null,
      client.miniMeVideoFile || null, client.promoVideoFile || null,
      client.freeVideoRequested || false, client.logoFile || null,
      client.approvedAt || null,
      client.twilioNumber || null,
      client.forwardingNumber || null,
      client.businessHoursJson ? JSON.stringify(client.businessHoursJson) : null,
      client.telephonyEnabled || false,
      client.ivrGreetingFile || null,
      client.paymentConfirmed || false,
      client.paymentConfirmedAt || null,
      client.registrarUsernameEnc || null,
      client.registrarPasswordEnc || null,
    ]);
  } catch(e) { console.error('[saveClient]', e.message); }
}

// ══════════════════════════════════════════════════════════════
// ── Territory Partner Helper Functions
// ══════════════════════════════════════════════════════════════

async function createTerritoryPartnerApplication(data) {
  const result = await pool.query(`
    INSERT INTO territory_partner_applications (
      full_name, email, company_name, phone, address, city, state, zip,
      website, business_description, tier, industries,
      territory_name, territory_type, territory_zips,
      territory_cities, territory_counties,
      territory_radius_center, territory_radius_miles, territory_notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15,
      $16, $17,
      $18, $19, $20
    )
    RETURNING *
  `, [
    data.fullName,
    data.email,
    data.companyName || null,
    data.phone,
    data.address,
    data.city,
    data.state,
    data.zip,
    data.website || null,
    data.businessDescription || null,
    data.tier,
    JSON.stringify(data.industries),
    data.territoryName || null,
    data.territoryType || null,
    data.territoryZips ? JSON.stringify(data.territoryZips) : null,
    data.territoryCities || null,
    data.territoryCounties || null,
    data.territoryRadiusCenter || null,
    data.territoryRadiusMiles || null,
    data.territoryNotes || null,
  ]);
  return result.rows[0];
}

async function getAllTerritoryPartnerApplications() {
  const result = await pool.query(`
    SELECT * FROM territory_partner_applications
    ORDER BY created_at DESC
  `);
  return result.rows;
}

async function getTerritoryPartnerApplicationById(id) {
  const result = await pool.query(`
    SELECT * FROM territory_partner_applications WHERE id = $1
  `, [id]);
  return result.rows[0] || null;
}

async function approveTerritoryPartnerApplication(id) {
  const result = await pool.query(`
    UPDATE territory_partner_applications
    SET status = 'approved', approved_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id]);
  return result.rows[0] || null;
}

async function rejectTerritoryPartnerApplication(id) {
  const result = await pool.query(`
    UPDATE territory_partner_applications
    SET status = 'rejected'
    WHERE id = $1
    RETURNING *
  `, [id]);
  return result.rows[0] || null;
}

// ── Hub Partner Functions ──

async function savePartnerCredentials(id, hubLoginId, hubPassword, hubToken) {
  const result = await pool.query(`
    UPDATE territory_partner_applications
    SET hub_login_id = $1,
        hub_password = $2,
        hub_token = $3,
        hub_token_expires_at = NOW() + INTERVAL '24 hours'
    WHERE id = $4
    RETURNING *
  `, [hubLoginId, hubPassword, hubToken, id]);
  return result.rows[0] || null;
}

async function refreshPartnerToken(id) {
  const crypto = require('crypto');
  const newToken = crypto.randomBytes(36).toString('hex');
  const result = await pool.query(`
    UPDATE territory_partner_applications
    SET hub_token = $1,
        hub_token_expires_at = NOW() + INTERVAL '24 hours'
    WHERE id = $2 AND status = 'approved'
    RETURNING *
  `, [newToken, id]);
  return result.rows[0] || null;
}

async function resetPartnerPassword(email, hashedPassword) {
  const result = await pool.query(`
    UPDATE territory_partner_applications
    SET hub_password = $1
    WHERE LOWER(email) = LOWER($2) AND status = 'approved'
    RETURNING *
  `, [hashedPassword, email]);
  return result.rows[0] || null;
}

async function changePartnerPassword(id, hashedPassword) {
  const result = await pool.query(`
    UPDATE territory_partner_applications
    SET hub_password = $1
    WHERE id = $2 AND status = 'approved'
    RETURNING *
  `, [hashedPassword, id]);
  return result.rows[0] || null;
}

async function getPartnerByLoginId(loginId) {
  const result = await pool.query(`
    SELECT * FROM territory_partner_applications
    WHERE hub_login_id = $1 AND status = 'approved'
  `, [loginId]);
  return result.rows[0] || null;
}

async function getPartnerByEmail(email) {
  const result = await pool.query(`
    SELECT * FROM territory_partner_applications
    WHERE email = $1 AND status = 'approved'
  `, [email.toLowerCase().trim()]);
  return result.rows[0] || null;
}

async function getPartnerByHubToken(token) {
  const result = await pool.query(`
    SELECT * FROM territory_partner_applications
    WHERE hub_token = $1
      AND status = 'approved'
      AND hub_token_expires_at > NOW()
  `, [token]);
  return result.rows[0] || null;
}

async function getClientsByPartnerId(partnerId) {
  const result = await pool.query(`
    SELECT * FROM clients
    WHERE data->>'partnerId' = $1 OR partner_id = $1
    ORDER BY created_at DESC
  `, [String(partnerId)]);
  return result.rows;
}

console.log('[module] lib/db.js loaded');

module.exports = {
  pool,
  clients,
  initDB,
  loadClientsFromDB,
  rowToClient,
  saveClient,
  // Territory Partner functions
  createTerritoryPartnerApplication,
  getAllTerritoryPartnerApplications,
  getTerritoryPartnerApplicationById,
  approveTerritoryPartnerApplication,
  rejectTerritoryPartnerApplication,
  // Hub Partner functions
  savePartnerCredentials,
  refreshPartnerToken,
  resetPartnerPassword,
  changePartnerPassword,
  getPartnerByLoginId,
  getPartnerByEmail,
  getPartnerByHubToken,
  getClientsByPartnerId,
};
