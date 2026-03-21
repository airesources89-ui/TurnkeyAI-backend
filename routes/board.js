// ════════════════════════════════════════════════
// ── routes/board.js — Community Message Board API
// ════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool } = require('../lib/db');
const { sendEmail, ADMIN_EMAIL } = require('../lib/email');

// ── Rate limiters ──
const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many posts. Please wait a few minutes.' }
});
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many uploads. Please wait a few minutes.' }
});

// ── Multer for file uploads (memory storage → R2) ──
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Only images (jpg, png, gif, webp) and PDFs are allowed.'));
  }
});

// ── R2 (S3-compatible) client — lazy init ──
let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  });
  return s3Client;
}

// ── Admin token helpers ──
const ADMIN_PASS = process.env.BOARD_ADMIN_PASSWORD;

function makeAdminToken(password) {
  return crypto.createHash('sha256').update(password + '_turnkeyai_board').digest('hex');
}

function isAdmin(req) {
  if (!ADMIN_PASS) return false;
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  return token === makeAdminToken(ADMIN_PASS);
}

// ════════════════════════════════════════════════
// POST /api/board/admin-auth — validate admin password
// ════════════════════════════════════════════════
router.post('/api/board/admin-auth', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASS || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Invalid password.' });
  }
  res.json({ token: makeAdminToken(password) });
});

// ════════════════════════════════════════════════
// GET /api/board/posts — fetch all posts with replies
// ════════════════════════════════════════════════
router.get('/api/board/posts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, parent_id, author_name, directed_to, message,
              attachment_url, attachment_name, is_admin, created_at
       FROM board_posts ORDER BY created_at ASC`
    );
    res.json({ posts: result.rows });
  } catch (err) {
    console.error('[board/posts GET]', err.message);
    res.status(500).json({ error: 'Failed to load posts.' });
  }
});

// ════════════════════════════════════════════════
// POST /api/board/posts — create a post or reply
// ════════════════════════════════════════════════
router.post('/api/board/posts', postLimiter, async (req, res) => {
  try {
    const { parent_id, author_name, author_email, directed_to, message,
            attachment_url, attachment_name, is_admin, hp } = req.body || {};

    // Honeypot check
    if (hp) return res.json({ success: true }); // silent reject

    // Validation
    if (!author_name || !author_name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!author_email || !author_email.trim()) return res.status(400).json({ error: 'Email is required.' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
    if (author_name.trim().length > 100) return res.status(400).json({ error: 'Name too long.' });
    if (author_email.trim().length > 255) return res.status(400).json({ error: 'Email too long.' });
    if (message.trim().length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters).' });

    // If claiming admin, verify token
    const adminVerified = is_admin ? isAdmin(req) : false;

    // If reply, verify parent exists
    if (parent_id) {
      const parentCheck = await pool.query('SELECT id FROM board_posts WHERE id = $1 AND parent_id IS NULL', [parent_id]);
      if (parentCheck.rows.length === 0) return res.status(400).json({ error: 'Parent post not found.' });
    }

    const result = await pool.query(
      `INSERT INTO board_posts (parent_id, author_name, author_email, directed_to, message,
                                attachment_url, attachment_name, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
      [
        parent_id || null,
        author_name.trim(),
        author_email.trim(),
        directed_to || null,
        message.trim(),
        attachment_url || null,
        attachment_name || null,
        adminVerified
      ]
    );

    // Email notification if directed to TurnkeyAI
    if (directed_to === 'TurnkeyAI' && !adminVerified) {
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `💬 Community Board — Direct message from ${author_name.trim()}`,
        html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#f59e0b,#e85d04);padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;font-size:20px;">💬 New Direct Message</h1>
            <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;">Someone sent you a message on the Community Board</p>
          </div>
          <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <p><strong>From:</strong> ${author_name.trim()}</p>
            <p><strong>Email:</strong> <a href="mailto:${author_email.trim()}">${author_email.trim()}</a></p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;white-space:pre-wrap;line-height:1.7;">${message.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            ${attachment_url ? `<p><strong>Attachment:</strong> <a href="${attachment_url}">${attachment_name || 'View file'}</a></p>` : ''}
            <p style="font-size:13px;color:#6B7280;margin-top:20px;">Reply on the <a href="${process.env.BASE_URL || 'https://turnkeyaiservices.com'}/pages/community.html" style="color:#f59e0b;font-weight:700;">Community Board</a></p>
          </div>
        </div>`
      }).catch(e => console.error('[board email]', e.message));
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('[board/posts POST]', err.message);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// ════════════════════════════════════════════════
// DELETE /api/board/posts/:id — admin-only delete
// ════════════════════════════════════════════════
router.delete('/api/board/posts/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID.' });

    // CASCADE on parent_id will delete replies automatically
    const result = await pool.query('DELETE FROM board_posts WHERE id = $1 RETURNING id', [postId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });

    res.json({ success: true });
  } catch (err) {
    console.error('[board/posts DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// ════════════════════════════════════════════════
// POST /api/board/upload — upload attachment to R2
// ════════════════════════════════════════════════
router.post('/api/board/upload', uploadLimiter, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum 5MB.' });
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    // Check R2 config
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID ||
        !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
      console.error('[board/upload] R2 env vars not configured');
      return res.status(500).json({ error: 'File storage not configured.' });
    }

    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const key = `board/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

      const contentTypes = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf'
      };

      await getS3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: contentTypes[ext] || 'application/octet-stream',
      }));

      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
      res.json({ url: publicUrl, name: req.file.originalname });
    } catch (uploadErr) {
      console.error('[board/upload R2]', uploadErr.message);
      res.status(500).json({ error: 'File upload failed.' });
    }
  });
});

console.log('[module] routes/board.js loaded');
module.exports = router;
