// ════════════════════════════════════════════════
// ── lib/crypto-helpers.js — AES-256-GCM encrypt/decrypt
// ── Used to encrypt sensitive intake fields (registrar credentials)
// ── before storing in the database.
// ════════════════════════════════════════════════
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX   = process.env.ENCRYPTION_KEY || '';

// Validate key at module load — warn loudly if missing or wrong length
if (!KEY_HEX) {
  console.warn('[crypto-helpers] WARNING: ENCRYPTION_KEY env var is not set. Credential encryption is disabled.');
} else if (KEY_HEX.length !== 64) {
  console.error('[crypto-helpers] FATAL: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got:', KEY_HEX.length);
}

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) return null;
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex-encoded).
 * Returns null if ENCRYPTION_KEY is not set or invalid.
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  if (!key) {
    console.warn('[crypto-helpers] Encryption skipped — ENCRYPTION_KEY not configured.');
    return null;
  }
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypt a value produced by encrypt().
 * Returns the original plaintext string, or null on failure.
 */
function decrypt(encryptedValue) {
  if (!encryptedValue) return null;
  const key = getKey();
  if (!key) {
    console.warn('[crypto-helpers] Decryption skipped — ENCRYPTION_KEY not configured.');
    return null;
  }
  try {
    const [ivHex, authTagHex, ciphertextHex] = encryptedValue.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) return null;
    const iv       = Buffer.from(ivHex, 'hex');
    const authTag  = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    console.error('[crypto-helpers] Decryption failed:', e.message);
    return null;
  }
}

console.log('[module] lib/crypto-helpers.js loaded');

module.exports = { encrypt, decrypt };
