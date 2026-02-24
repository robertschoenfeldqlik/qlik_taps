/**
 * Credential encryption at rest using AES-256-GCM.
 *
 * Encrypts sensitive config fields (API keys, tokens, passwords) before
 * they are stored in SQLite, and decrypts them on retrieval.
 *
 * Key management:
 *   - Reads from ENCRYPTION_KEY env var (hex-encoded 32-byte key)
 *   - Falls back to auto-generated key persisted at DATA_DIR/.encryption-key
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

// Fields that contain credentials and must be encrypted
const SENSITIVE_FIELDS = new Set([
  'api_key',
  'bearer_token',
  'password',
  'client_secret',
  'oauth2_client_secret',
  'oauth2_refresh_token',
]);

let _encryptionKey = null;

/**
 * Get or initialize the 32-byte encryption key.
 */
function getEncryptionKey() {
  if (_encryptionKey) return _encryptionKey;

  // Prefer env var
  if (process.env.ENCRYPTION_KEY) {
    const envKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (envKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    _encryptionKey = envKey;
    return _encryptionKey;
  }

  // Auto-generate and persist
  const dataDir = path.join(__dirname, '..', 'data');
  const keyPath = path.join(dataDir, '.encryption-key');

  if (fs.existsSync(keyPath)) {
    _encryptionKey = Buffer.from(fs.readFileSync(keyPath, 'utf-8').trim(), 'hex');
    if (_encryptionKey.length !== 32) {
      throw new Error('Persisted encryption key is invalid. Delete .encryption-key and restart.');
    }
    return _encryptionKey;
  }

  // Generate new key
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  _encryptionKey = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, _encryptionKey.toString('hex'), { mode: 0o600 });
  console.log('Generated new encryption key at', keyPath);
  return _encryptionKey;
}

/**
 * Encrypt a plaintext string.
 * Returns "enc:<base64(iv + ciphertext + authTag)>"
 */
function encryptValue(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext; // already encrypted

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + encrypted + authTag
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return ENCRYPTED_PREFIX + packed.toString('base64');
}

/**
 * Decrypt an encrypted string.
 * Input: "enc:<base64(iv + ciphertext + authTag)>"
 */
function decryptValue(encrypted) {
  if (!encrypted || typeof encrypted !== 'string') return encrypted;
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) return encrypted; // not encrypted

  const key = getEncryptionKey();
  const packed = Buffer.from(encrypted.slice(ENCRYPTED_PREFIX.length), 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Encrypt sensitive fields in a config JSON object (shallow — top-level fields only).
 * Returns a new object with sensitive values encrypted.
 */
function encryptConfig(configJson) {
  if (!configJson || typeof configJson !== 'object') return configJson;

  const result = { ...configJson };
  for (const field of SENSITIVE_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = encryptValue(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt sensitive fields in a config JSON object.
 * Returns a new object with sensitive values decrypted.
 */
function decryptConfig(configJson) {
  if (!configJson || typeof configJson !== 'object') return configJson;

  const result = { ...configJson };
  for (const field of SENSITIVE_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = decryptValue(result[field]);
    }
  }
  return result;
}

/**
 * Check if a config has any unencrypted sensitive fields.
 */
function hasUnencryptedSecrets(configJson) {
  if (!configJson || typeof configJson !== 'object') return false;
  for (const field of SENSITIVE_FIELDS) {
    if (configJson[field] && typeof configJson[field] === 'string' && !configJson[field].startsWith(ENCRYPTED_PREFIX)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  encryptValue,
  decryptValue,
  encryptConfig,
  decryptConfig,
  hasUnencryptedSecrets,
  getEncryptionKey,
  SENSITIVE_FIELDS,
};
