const crypto = require('crypto');

// AES-256-GCM configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

// Retrieve secret key from environment or fallback key (32 bytes = 256 bits)
const getSecretKey = () => {
  const envKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'kinetoscope_super_secret_pii_encryption_key_2026_32b';
  return crypto.createHash('sha256').update(envKey).digest();
};

/**
 * Encrypt a plain text string using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} Formatted cipher string: enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
const encrypt = (text) => {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('enc:')) return trimmed; // Already encrypted or empty

  try {
    const key = getSecretKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(trimmed, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    return `enc:${ivHex}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[Encryption Service] Encryption failed:', err.message);
    return trimmed;
  }
};

/**
 * Decrypt an encrypted string using AES-256-GCM
 * @param {string} cipherText - Encrypted string starting with enc:
 * @returns {string} Decrypted plain text
 */
const decrypt = (cipherText) => {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;
  const trimmed = cipherText.trim();
  if (!trimmed.startsWith('enc:')) return trimmed; // Not encrypted

  try {
    const parts = trimmed.split(':');
    if (parts.length !== 4) return trimmed;

    const [, ivHex, authTagHex, encryptedHex] = parts;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('[Encryption Service] Decryption failed:', err.message);
    return cipherText;
  }
};

/**
 * Utility to mask sensitive strings for UI rendering
 * @param {string} str - Raw string
 * @param {number} visibleEndChars - Number of unmasked trailing characters
 * @returns {string} Masked string (e.g. •••• •••• 4829)
 */
const maskField = (str, visibleEndChars = 4) => {
  if (!str) return '—';
  const val = String(str).trim();
  if (val.length <= visibleEndChars) return val;
  const maskedLength = val.length - visibleEndChars;
  const maskedPrefix = '•'.repeat(Math.min(maskedLength, 8));
  const visibleSuffix = val.slice(-visibleEndChars);
  return `${maskedPrefix} ${visibleSuffix}`;
};

module.exports = {
  encrypt,
  decrypt,
  maskField,
};
