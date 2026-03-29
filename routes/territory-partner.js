// ════════════════════════════════════════════════
// ── routes/territory-partner.js
// ── Territory Partner application management
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const {
  pool,
  createTerritoryPartnerApplication,
  getAllTerritoryPartnerApplications,
  getTerritoryPartnerApplicationById,
  approveTerritoryPartnerApplication,
  rejectTerritoryPartnerApplication,
  savePartnerCredentials,
  getPartnerByLoginId,
  getPartnerByEmail,
  getPartnerByHubToken,
  getClientsByPartnerId,
} = require('../lib/db');
const { sendEmail } = require('../lib/email');
const path = require('path');

// ── Admin authentication middleware ──
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ════════════════════════════════════════════════
// ── PUBLIC ROUTES
// ════════════════════════════════════════════════

// Submit Territory Partner application
router.post('/api/territory-partner/submit', async (req, res) => {
  try {
    const {
      fullName, email, tier, industries,
      territoryType, territoryName,
      territoryZips, territoryCities, territoryCounties,
      territoryRadiusCenter, territoryRadiusMiles,
      territoryNotes
    } = req.body;

    // ── Core field validation ──
    if (!fullName || !email || !tier || !industries || !Array.isArray(industries)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── Tier limits ──
    const tierLimits = {
      'starter': 5,
      'professional': 15,
      'enterprise': 30,
      'unlimited': 67
    };

    const limit = tierLimits[tier];
    if (!limit) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    if (industries.length > limit) {
      return res.status(400).json({ error: `Tier ${tier} allows up to ${limit} industries` });
    }

    // ── Territory validation ──
    if (!territoryType) {
      return res.status(400).json({ error: 'Territory type is required' });
    }

    const validTerritoryTypes = ['zip', 'city', 'county', 'radius'];
    if (!validTerritoryTypes.includes(territoryType)) {
      return res.status(400).json({ error: 'Invalid territory type' });
    }

    if (territoryType === 'zip') {
      if (!territoryZips || !Array.isArray(territoryZips) || territoryZips.length === 0) {
        return res.status(400).json({ error: 'At least one ZIP code is required for ZIP territory type' });
      }
      if (territoryZips.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 ZIP codes allowed' });
      }
      const invalidZips = territoryZips.filter(z => !/^\d{5}$/.test(z));
      if (invalidZips.length > 0) {
        return res.status(400).json({ error: `Invalid ZIP codes: ${invalidZips.join(', ')}` });
      }

      // ── ZIP conflict check against approved partners ──
      const conflictResult = await pool.query(`
        SELECT id, full_name, territory_zips
        FROM territory_partner_applications
        WHERE status = 'approved'
          AND territory_type = 'zip'
          AND territory_zips IS NOT NULL
      `);
      const claimedZips = new Set();
      for (const row of conflictResult.rows) {
        const zips = Array.isArray(row.territory_zips) ? row.territory_zips : [];
        zips.forEach(z => claimedZips.add(z));
      }
      const conflicts = territoryZips.filter(z => claimedZips.has(z));
      if (conflicts.length > 0) {
        return res.status(409).json({
          error: 'Territory conflict',
          message: `The following ZIP codes are already claimed: ${conflicts.join(', ')}. Please adjust your territory selection.`,
          conflictingZips: conflicts
        });
      }
    }

    if (territoryType === 'city') {
      if (!territoryCities || !territoryCities.trim()) {
        return res.status(400).json({ error: 'City/State is required for City territory type' });
      }
    }

    if (territoryType === 'county') {
      if (!territoryCounties || !territoryCounties.trim()) {
        return res.status(400).json({ error: 'County is required for County territory type' });
      }
    }

    if (territoryType === 'radius') {
      if (!territoryRadiusCenter || !territoryRadiusCenter.trim()) {
        return res.status(400).json({ error: 'Center point is required for Radius territory type' });
      }
      if (!territoryRadiusMiles || isNaN(territoryRadiusMiles) || territoryRadiusMiles <= 0) {
        return res.status(400).json({ error: 'A valid radius in miles is required' });
      }
    }

    // ── Create application — pass full req.body ──
    const application = await createTerritoryPartnerApplication(req.body);

    res.json({
      success: true,
      message: 'Application submitted successfully',
      applicationId: application.id
    });

  } catch (error) {
    console.error('[territory-partner submit error]', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// ════════════════════════════════════════════════
// ── ADMIN ROUTES (require authentication)
// ════════════════════════════════════════════════

// Get all applications
router.get('/api/territory-partner/applications', requireAdmin, async (req, res) => {
  try {
    const applications = await getAllTerritoryPartnerApplications();
    res.json({ applications });
  } catch (error) {
    console.error('[territory-partner applications error]', error);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

// Get single application by ID
router.get('/api/territory-partner/applications/:id', requireAdmin, async (req, res) => {
  try {
    const application = await getTerritoryPartnerApplicationById(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ application });
  } catch (error) {
    console.error('[territory-partner application error]', error);
    res.status(500).json({ error: 'Failed to load application' });
  }
});

// ── Credential generators (cryptographically secure) ──
const crypto = require('crypto');

function generateHubLoginId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let id = 'TK-HUB-';
  for (let i = 0; i < 6; i++) id += chars[bytes[i] % chars.length];
  return id;
}

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  const bytes = crypto.randomBytes(12);
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

function generateToken() {
  return crypto.randomBytes(36).toString('hex');
}

// Approve application
router.post('/api/territory-partner/approve/:id', requireAdmin, async (req, res) => {
  try {
    const application = await approveTerritoryPartnerApplication(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Generate Hub credentials
    const hubLoginId  = generateHubLoginId();
    const hubPassword = generatePassword();
    const hubToken    = generateToken();
    await savePartnerCredentials(application.id, hubLoginId, hubPassword, hubToken);

    const BASE_URL = process.env.BASE_URL || 'https://turnkeyaiservices.com';
    const hubDashUrl   = `${BASE_URL}/pages/hub-dashboard.html?loginId=${encodeURIComponent(hubLoginId)}`;
    const hubIntakeUrl = `${BASE_URL}/hub/${application.id}`;

    const tierNames = {
      starter: 'Starter ($99/mo)', professional: 'Professional ($199/mo)',
      enterprise: 'Enterprise ($199/mo)', unlimited: 'Unlimited ($199/mo)'
    };

    // Send approval + credentials email
    try {
      await sendEmail({
        to: application.email,
        subject: `🎉 Welcome to TurnkeyAI Territory Partners — You're Approved!`,
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:28px;">🎉 You're Approved!</h1>
            <p style="color:rgba(255,255,255,.9);margin:8px 0 0;font-size:16px;">Welcome to the TurnkeyAI Territory Partner Network</p>
          </div>
          <div style="padding:32px;">
            <p>Hi ${application.full_name},</p>
            <p>Your Territory Partner application has been <strong>approved</strong>. Your Hub is live and ready to go.</p>
            <div style="background:#f0fff4;border:2px solid #10b981;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#065f46;">📋 Your Partnership Details</h3>
              <p style="margin:0 0 8px;"><strong>Territory:</strong> ${application.territory_name || '—'}</p>
              <p style="margin:0 0 8px;"><strong>Tier:</strong> ${tierNames[application.tier] || application.tier}</p>
              <p style="margin:0 0 8px;"><strong>Revenue Split:</strong> You keep 60% of every client payment</p>
              <p style="margin:0;"><strong>Approved:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <div style="background:#f0f9ff;border:2px solid #3b82f6;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#1e40af;">🔐 Your Hub Dashboard Login</h3>
              <p style="margin:0 0 8px;"><strong>Dashboard URL:</strong><br><a href="${hubDashUrl}" style="color:#3b82f6;word-break:break-all;">${hubDashUrl}</a></p>
              <p style="margin:8px 0 0;"><strong>Email:</strong> ${application.email}</p>
              <p style="margin:16px 0 0;"><strong>Password:</strong></p>
              <div style="background:#080d1a;color:#f59e0b;font-size:24px;font-weight:700;letter-spacing:6px;text-align:center;padding:14px;border-radius:8px;margin-top:8px;font-family:monospace;">${hubPassword}</div>
              <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">Log in with your email address and the password above.</p>
            </div>
            <div style="background:#fff8ed;border:2px solid #f59e0b;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 12px;color:#92400e;">🌐 Your Client Signup Page</h3>
              <p style="font-size:14px;color:#92400e;margin:0 0 12px;">Share this URL with local businesses in your territory. When they sign up, they are automatically attributed to you and your 60% activates on their subscription.</p>
              <a href="${hubIntakeUrl}" style="display:block;text-align:center;background:#f59e0b;color:#080d1a;padding:12px 24px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;">${hubIntakeUrl}</a>
            </div>
            <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#f59e0b;">turnkeyaiservices@gmail.com</a></p>
            <p>— The TurnkeyAI Services Team</p>
          </div>
        </div>`
      });
    } catch (emailErr) {
      console.error('[territory-partner approve email error]', emailErr.message);
    }

    res.json({
      success: true,
      message: 'Application approved',
      application,
      hubLoginId,
      hubDashUrl,
      hubIntakeUrl
    });
  } catch (error) {
    console.error('[territory-partner approve error]', error);
    res.status(500).json({ error: 'Failed to approve application' });
  }
});

// Reject application
router.post('/api/territory-partner/reject/:id', requireAdmin, async (req, res) => {
  try {
    const application = await rejectTerritoryPartnerApplication(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Send rejection email — non-blocking, failure does not affect response
    try {
      await sendEmail({
        to: application.email,
        subject: `Your TurnkeyAI Territory Partner Application — Update`,
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0A1128,#1a2844);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
            <h1 style="color:#f59e0b;margin:0;font-size:26px;">TurnkeyAI Territory Partners</h1>
            <p style="color:rgba(255,255,255,.8);margin:8px 0 0;">Application Status Update</p>
          </div>
          <div style="padding:32px;">
            <p>Hi ${application.full_name},</p>
            <p>Thank you for your interest in becoming a TurnkeyAI Territory Partner. After reviewing your application, we are not able to move forward at this time.</p>
            <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:24px 0;">
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">This may be due to territory availability, tier fit, or timing. TurnkeyAI is growing quickly and new opportunities open regularly. We encourage you to reapply in the future or contact us directly to discuss alternative options.</p>
            </div>
            <p style="font-size:14px;color:#6B7280;">Questions? Call <strong>(603) 922-2004</strong> or email <a href="mailto:turnkeyaiservices@gmail.com" style="color:#f59e0b;">turnkeyaiservices@gmail.com</a></p>
            <p>— The TurnkeyAI Services Team</p>
          </div>
        </div>`
      });
    } catch (emailErr) {
      console.error('[territory-partner reject email error]', emailErr.message);
    }

    res.json({
      success: true,
      message: 'Application rejected',
      application
    });
  } catch (error) {
    console.error('[territory-partner reject error]', error);
    res.status(500).json({ error: 'Failed to reject application' });
  }
});

console.log('[module] routes/territory-partner.js loaded');

// ════════════════════════════════════════════════
// ── HUB PUBLIC & API ROUTES
// ════════════════════════════════════════════════

// Serve Hub intake page with partner ID
router.get('/hub/:partnerId', async (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'hub-intake.html'));
});

// Hub authentication — email + password
router.post('/api/hub/auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const partner = await getPartnerByEmail(email);
    if (!partner || partner.hub_password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({
      success: true,
      token: partner.hub_token,
      partner: {
        id: partner.id,
        name: partner.full_name,
        email: partner.email,
        tier: partner.tier,
        territory_name: partner.territory_name,
        territory_type: partner.territory_type,
        territory_zips: partner.territory_zips,
        territory_cities: partner.territory_cities,
        territory_counties: partner.territory_counties,
        territory_radius_center: partner.territory_radius_center,
        territory_radius_miles: partner.territory_radius_miles,
        industries: partner.industries,
        approved_at: partner.approved_at
      }
    });
  } catch (error) {
    console.error('[hub auth error]', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Hub dashboard data
router.get('/api/hub/dashboard', async (req, res) => {
  try {
    const token = req.headers['x-hub-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerByHubToken(token);
    if (!partner) return res.status(401).json({ error: 'Invalid or expired token' });

    const clients = await getClientsByPartnerId(partner.id);

    // Calculate partner MRR (60% of client subscriptions)
    const planPrices = { 'website-only':99,'website_only':99,'Website Only':99,'website-blog':129,'website_blog':129,'Website + Blog':129,'website-blog-social':159,'Website + Blog + Social':159,'full-package':218,'Full Package':218 };
    const totalMRR = clients.reduce((s, c) => {
      const plan = c.data?.selectedPlan || c.data?.plan || '';
      return s + (planPrices[plan] || 0);
    }, 0);
    const partnerMRR = Math.round(totalMRR * 0.6);

    res.json({
      partner: {
        id: partner.id,
        name: partner.full_name,
        email: partner.email,
        tier: partner.tier,
        territory_name: partner.territory_name,
        territory_type: partner.territory_type,
        territory_zips: partner.territory_zips,
        territory_cities: partner.territory_cities,
        territory_counties: partner.territory_counties,
        territory_radius_center: partner.territory_radius_center,
        territory_radius_miles: partner.territory_radius_miles,
        industries: partner.industries,
        approved_at: partner.approved_at,
        hub_login_id: partner.hub_login_id
      },
      clients,
      totalMRR,
      partnerMRR
    });
  } catch (error) {
    console.error('[hub dashboard error]', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
