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
const { sendEmail } = require('../lib/email');

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

    // Send approval email — non-blocking, failure does not affect response
    try {
      const tierNames = {
        starter: 'Starter ($99/mo)',
        professional: 'Professional ($199/mo)',
        enterprise: 'Enterprise ($199/mo)',
        unlimited: 'Unlimited ($199/mo)'
      };
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
            <p>Congratulations — your Territory Partner application has been <strong>approved</strong>. You are now an official TurnkeyAI Territory Partner.</p>
            <div style="background:#f0fff4;border:2px solid #10b981;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#065f46;">📋 Your Partnership Details</h3>
              <p style="margin:0 0 8px;"><strong>Territory:</strong> ${application.territory_name || '—'}</p>
              <p style="margin:0 0 8px;"><strong>Tier:</strong> ${tierNames[application.tier] || application.tier}</p>
              <p style="margin:0 0 8px;"><strong>Revenue Split:</strong> 60/40 — you keep 60% of every client you bring in</p>
              <p style="margin:0;"><strong>Approved:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <div style="background:#f0f9ff;border:2px solid #3b82f6;border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#1e40af;">📋 Next Steps</h3>
              <ol style="padding-left:20px;line-height:2.4;font-size:14px;color:#374151;">
                <li>Our team will reach out within 1–2 business days with your Hub login credentials</li>
                <li>You will receive onboarding materials and training resources</li>
                <li>Once set up, you can start signing clients in your territory immediately</li>
                <li>Stripe Connect will be configured to automatically split revenue on every payment</li>
              </ol>
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

module.exports = router;
