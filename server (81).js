// ════════════════════════════════════════════════
// ── server.js — TurnkeyAI Platform Orchestrator
// ── This is the main entry point. It sets up Express,
// ── initializes the database, and mounts all route modules.
// ── All business logic lives in lib/ and routes/ folders.
// ════════════════════════════════════════════════
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
// ── Startup validation ──
if (!process.env.ADMIN_KEY) { console.error('[FATAL] ADMIN_KEY env var is not set. Exiting.'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('[FATAL] DATABASE_URL env var is not set. Exiting.'); process.exit(1); }
// ── Rate limiting (general — applied to all routes) ──
const rateLimit = require('express-rate-limit');
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' }
});
app.use(generalLimiter);
// ── Body parsing ──
// Stripe webhook needs raw body BEFORE json parsing
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));
// ── CORS — allow client sites on Cloudflare Pages + custom domains ──
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.turnkeyaiservices.com') ||
    origin === 'https://turnkeyaiservices.com'
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));
// ── Load database and initialize ──
const { initDB, loadClientsFromDB } = require('./lib/db');
// ── Mount route modules ──
// Each module is an Express Router with its own routes
app.use('/', require('./routes/intake'));
app.use('/', require('./routes/client'));
app.use('/', require('./routes/admin'));
app.use('/', require('./routes/booking-chat'));
app.use('/', require('./routes/telephony-webhooks'));
app.use('/', require('./routes/analytics'));
app.use('/', require('./routes/board'));
app.use('/', require('./routes/stripe-webhook'));
app.use('/', require('./routes/territory-partner'));
// ── Static admin page ──
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
// ── Health check ──
app.get('/health', (req, res) => {
  const { clients } = require('./lib/db');
  res.json({ status: 'ok', clients: Object.keys(clients).length, uptime: process.uptime() });
});
// ── Catch-all SPA ──
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Not found');
});
// ── Start ──
const PORT = process.env.PORT || 8080;
initDB()
  .then(() => loadClientsFromDB())
  .then(() => {
    // Initialize blog scheduler
    require('./lib/blog-scheduler');
    
    app.listen(PORT, () => console.log(`[TurnkeyAI] Server running on port ${PORT}`));
  })
  .catch(err => { console.error('[startup error]', err); process.exit(1); });
