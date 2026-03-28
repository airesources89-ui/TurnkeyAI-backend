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
} = require('../lib/db');

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

// Approve application
router.post('/api/territory-partner/approve/:id', requireAdmin, async (req, res) => {
  try {
    const application = await approveTerritoryPartnerApplication(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({
      success: true,
      message: 'Application approved',
      application
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

module.exports = router;
