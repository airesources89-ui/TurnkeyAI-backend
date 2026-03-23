// ════════════════════════════════════════════════
// ── lib/helpers.js — Shared utility functions
// ════════════════════════════════════════════════
const crypto = require('crypto');
const { clients } = require('./db');
function makeToken()    { return crypto.randomBytes(16).toString('hex'); }
function makePassword() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function makeSlug(n) {
  return (n||'client').toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim()
    .replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,40).replace(/-$/,'');
}
// ── Input validation ──
function validate(body, required) {
  for (const [field, label] of required) {
    const val = (body[field] || '').toString().trim();
    if (!val) return `Missing required field: ${label}`;
    if (val.length > 2000) return `Field too long: ${label}`;
  }
  const email = body.email || body.uploaderEmail || '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address';
  return null;
}
// ── MRR calculation ──
function calculateMRR() {
  const active = Object.values(clients).filter(c => c.status === 'active');
  let total = 0;
  for (const c of active) {
    let base = 99;
    const plan = (c.data.selectedPlan || c.data.plan || c.data.tier || c.data.packageType || '').toLowerCase();
    if (plan === 'full_package' || plan === '218') base = 218;
    else if (plan === 'website_blog_social' || plan.includes('social') || plan.includes('full') || plan === '159') base = 159;
    else if (plan === 'website_blog' || plan.includes('blog') || plan === '129') base = 129;
    else if (plan === 'website_only') base = 99;
    if (base === 99 && c.data.wants_social === 'yes') base = 159;
    else if (base === 99 && c.data.wants_blog === 'yes') base = 129;
    if (c.miniMeSubscribed) base += 59;
    total += base;
  }
  return { total, activeCount: active.length, perClient: active.length ? Math.round(total / active.length) : 0 };
}
// ── Find client ID by business name (for analytics matching) ──
function findClientIdByBusinessName(bizName) {
  if (!bizName) return null;
  const lower = bizName.toLowerCase().trim();
  const match = Object.values(clients).find(c =>
    (c.data.businessName || '').toLowerCase().trim() === lower
  );
  return match ? match.id : null;
}
console.log('[module] lib/helpers.js loaded');
module.exports = {
  makeToken,
  makePassword,
  makeSlug,
  validate,
  calculateMRR,
  findClientIdByBusinessName,
};
