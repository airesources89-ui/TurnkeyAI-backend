// ════════════════════════════════════════════════
// ── routes/territory-partner.js
// ── Territory Partner application management
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const {
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
    const { fullName, email, tier, industries } = req.body;
    
    // Validation
    if (!fullName || !email || !tier || !industries || !Array.isArray(industries)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Tier limits
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
    
    // Create application
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
