const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const { getDb, saveDb } = require('../database/init');
const { encryptConfig, decryptConfig, SENSITIVE_FIELDS } = require('../crypto');

const router = express.Router();

// Multer setup for zip uploads (in-memory, 10MB max)
const MAX_ZIP_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.zip');
  },
});

// Human-readable labels for secret fields
const SECRET_LABELS = {
  api_key: 'API Key',
  bearer_token: 'Bearer Token',
  password: 'Password',
  client_secret: 'Client Secret',
  oauth2_client_secret: 'OAuth2 Client Secret',
  oauth2_refresh_token: 'OAuth2 Refresh Token',
};

/**
 * Detect which sensitive fields are actually used in a config
 * by checking for non-empty values.
 */
function detectRequiredSecrets(configJson) {
  const secrets = [];
  for (const field of SENSITIVE_FIELDS) {
    if (configJson[field] && typeof configJson[field] === 'string' && configJson[field].length > 0) {
      secrets.push({
        field,
        label: SECRET_LABELS[field] || field,
      });
    }
  }
  return secrets;
}

/**
 * Strip sensitive field values from a config (set to empty string).
 */
function stripSecrets(configJson) {
  const cleaned = { ...configJson };
  for (const field of SENSITIVE_FIELDS) {
    if (cleaned[field] && typeof cleaned[field] === 'string') {
      cleaned[field] = '';
    }
  }
  return cleaned;
}

/**
 * Sanitize a config name into a safe filename.
 */
function toFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().slice(0, 80);
}

// ---------------------------------------------------------------------------
// POST /api/deploy/export-package — Export all configs as a deployment zip
// ---------------------------------------------------------------------------
router.post('/export-package', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, name, description, config_json
      FROM configs
      ORDER BY name ASC
    `);

    if (!results.length || results[0].values.length === 0) {
      return res.status(400).json({ error: 'No configs to export' });
    }

    const zip = new AdmZip();
    const manifest = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      app_version: 'tap-builder-1.0',
      configs: [],
    };

    const usedFilenames = new Set();

    for (const row of results[0].values) {
      const [id, name, description, configJsonStr] = row;
      let configJson;
      try { configJson = JSON.parse(configJsonStr); } catch { continue; }

      // Decrypt to read actual values
      configJson = decryptConfig(configJson);

      const isDynamics = configJson.tap_type === 'dynamics365' ||
        (configJson.environment_url && configJson.tenant_id);

      // Detect which secrets this config uses
      const requiredSecrets = detectRequiredSecrets(configJson);

      // Strip secrets from the config for the zip
      const sanitized = stripSecrets(configJson);

      // Generate unique filename
      let filename = toFilename(name) + '.json';
      let counter = 1;
      while (usedFilenames.has(filename)) {
        filename = toFilename(name) + `_${counter++}.json`;
      }
      usedFilenames.add(filename);

      // Add config file to zip
      zip.addFile(
        `configs/${filename}`,
        Buffer.from(JSON.stringify(sanitized, null, 2), 'utf-8')
      );

      // Add to manifest
      manifest.configs.push({
        name,
        description: description || '',
        tap_type: isDynamics ? 'dynamics365' : 'rest_api',
        auth_method: isDynamics ? 'oauth2_azure' : (configJson.auth_method || 'no_auth'),
        api_url: isDynamics ? (configJson.environment_url || '') : (configJson.api_url || ''),
        stream_count: (configJson.streams || []).length,
        required_secrets: requiredSecrets,
        config_file: filename,
      });
    }

    // Add manifest to zip
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

    const zipBuffer = zip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="deployment-package.zip"');
    res.send(zipBuffer);
  } catch (err) {
    console.error('Error exporting package:', err);
    res.status(500).json({ error: 'Failed to export deployment package' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/deploy/preview-package — Parse zip and return manifest (no import)
// ---------------------------------------------------------------------------
router.post('/preview-package', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No zip file provided' });
    }

    const zip = new AdmZip(req.file.buffer);
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      return res.status(400).json({
        error: 'Invalid deployment package: missing manifest.json',
      });
    }

    let manifest;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'Invalid manifest.json' });
    }

    if (!manifest.configs || !Array.isArray(manifest.configs)) {
      return res.status(400).json({ error: 'manifest.json missing configs array' });
    }

    res.json(manifest);
  } catch (err) {
    console.error('Error previewing package:', err);
    res.status(500).json({ error: 'Failed to read deployment package' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/deploy/import-package — Import a deployment package with secrets
// ---------------------------------------------------------------------------
router.post('/import-package', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No zip file provided' });
    }

    // Parse secrets from the request body
    let secrets = {};
    if (req.body.secrets) {
      try {
        secrets = JSON.parse(req.body.secrets);
      } catch {
        return res.status(400).json({ error: 'Invalid secrets JSON' });
      }
    }

    const zip = new AdmZip(req.file.buffer);

    // Read manifest
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      return res.status(400).json({
        error: 'Invalid deployment package: missing manifest.json',
      });
    }

    let manifest;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'Invalid manifest.json' });
    }

    if (!manifest.configs || !Array.isArray(manifest.configs)) {
      return res.status(400).json({ error: 'manifest.json missing configs array' });
    }

    const db = await getDb();
    const imported = [];

    for (const entry of manifest.configs) {
      const configEntry = zip.getEntry(`configs/${entry.config_file}`);
      if (!configEntry) continue;

      let configJson;
      try {
        configJson = JSON.parse(configEntry.getData().toString('utf-8'));
      } catch { continue; }

      // Merge in user-provided secrets
      const configSecrets = secrets[entry.config_file] || {};
      for (const [field, value] of Object.entries(configSecrets)) {
        if (SENSITIVE_FIELDS.has(field) && value) {
          configJson[field] = value;
        }
      }

      // Validate the config
      const isDynamics = configJson.tap_type === 'dynamics365' ||
        (configJson.environment_url && configJson.tenant_id);
      if (!isDynamics && !configJson.api_url) continue;

      const id = uuidv4();
      const encrypted = encryptConfig(configJson);

      db.run(
        `INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)`,
        [id, entry.name, entry.description || '', JSON.stringify(encrypted)]
      );

      imported.push({ id, name: entry.name });
    }

    saveDb();

    res.status(201).json({
      imported: imported.length,
      configs: imported,
      message: `Successfully deployed ${imported.length} config(s)`,
    });
  } catch (err) {
    console.error('Error importing package:', err);
    res.status(500).json({ error: 'Failed to import deployment package' });
  }
});

module.exports = router;
