const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const { getDb, saveDb } = require('../database/init');
const { encryptConfig, decryptConfig } = require('../crypto');

const router = express.Router();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val);
}

function validateConfigName(name) {
  if (!name || typeof name !== 'string') return 'name is required';
  if (name.length > 200) return 'name must be 200 characters or fewer';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'name must not contain control characters';
  return null;
}

function validateConfigJson(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return 'config_json must be a JSON object';
  }
  // Dynamics 365 configs use tap_type + environment_url
  const isDynamics = cfg.tap_type === 'dynamics365' || (cfg.environment_url && cfg.tenant_id);
  if (!isDynamics && typeof cfg.api_url !== 'string') {
    return 'config_json.api_url is required (string)';
  }
  return null;
}

// Multer setup for zip file uploads (in-memory) — reduced to 10MB
const MAX_ZIP_SIZE = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100;
const MAX_ENTRY_SIZE = 1 * 1024 * 1024; // 1MB per file inside zip

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
    }
  },
});

// ---------------------------------------------------------------------------
// GET /api/configs — List all saved configs (summary, no secrets)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, name, description, config_json, created_at, updated_at
      FROM configs
      ORDER BY updated_at DESC
    `);

    if (!results.length) {
      return res.json([]);
    }

    const configs = results[0].values.map(row => {
      let configJson;
      try { configJson = JSON.parse(row[3]); } catch { configJson = {}; }
      // Decrypt so we can read non-secret metadata (api_url, auth_method, etc.)
      configJson = decryptConfig(configJson);
      const isDynamics = configJson.tap_type === 'dynamics365' || (configJson.environment_url && configJson.tenant_id);
      return {
        id: row[0],
        name: row[1],
        description: row[2],
        api_url: isDynamics ? (configJson.environment_url || '') : (configJson.api_url || ''),
        auth_method: isDynamics ? 'oauth2_azure' : (configJson.auth_method || 'no_auth'),
        tap_type: isDynamics ? 'dynamics365' : 'rest_api',
        stream_count: (configJson.streams || []).length,
        created_at: row[4],
        updated_at: row[5],
      };
    });

    res.json(configs);
  } catch (err) {
    console.error('Error listing configs:', err);
    res.status(500).json({ error: 'Failed to list configs' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/configs/:id — Get a single config (decrypted)
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid config ID format' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM configs WHERE id = ?');
    stmt.bind([req.params.id]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Config not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      config_json: decryptConfig(JSON.parse(row.config_json)),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (err) {
    console.error('Error getting config:', err);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/configs — Create a new config
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { name, description, config_json } = req.body;

    const nameErr = validateConfigName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const cfgErr = validateConfigJson(config_json);
    if (cfgErr) return res.status(400).json({ error: cfgErr });

    const id = uuidv4();
    const db = await getDb();

    // Encrypt sensitive fields before storage
    const encrypted = encryptConfig(config_json);

    db.run(
      `INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)`,
      [id, name, description || '', JSON.stringify(encrypted)]
    );

    saveDb();

    res.status(201).json({
      id,
      name,
      description: description || '',
      config_json,
      message: 'Config created successfully',
    });
  } catch (err) {
    console.error('Error creating config:', err);
    res.status(500).json({ error: 'Failed to create config' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/configs/:id — Update an existing config
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid config ID format' });
    }

    const { name, description, config_json } = req.body;

    const nameErr = validateConfigName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const cfgErr = validateConfigJson(config_json);
    if (cfgErr) return res.status(400).json({ error: cfgErr });

    const db = await getDb();

    const checkStmt = db.prepare('SELECT id FROM configs WHERE id = ?');
    checkStmt.bind([req.params.id]);
    const exists = checkStmt.step();
    checkStmt.free();
    if (!exists) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const encrypted = encryptConfig(config_json);

    db.run(
      `UPDATE configs SET name = ?, description = ?, config_json = ?, updated_at = datetime('now') WHERE id = ?`,
      [name, description || '', JSON.stringify(encrypted), req.params.id]
    );

    saveDb();

    res.json({
      id: req.params.id,
      name,
      description: description || '',
      config_json,
      message: 'Config updated successfully',
    });
  } catch (err) {
    console.error('Error updating config:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/configs/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid config ID format' });
    }

    const db = await getDb();

    const checkStmt = db.prepare('SELECT id FROM configs WHERE id = ?');
    checkStmt.bind([req.params.id]);
    const exists = checkStmt.step();
    checkStmt.free();
    if (!exists) {
      return res.status(404).json({ error: 'Config not found' });
    }

    db.run(`DELETE FROM configs WHERE id = ?`, [req.params.id]);
    saveDb();

    res.json({ message: 'Config deleted successfully' });
  } catch (err) {
    console.error('Error deleting config:', err);
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/configs/:id/duplicate
// ---------------------------------------------------------------------------
router.post('/:id/duplicate', async (req, res) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid config ID format' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM configs WHERE id = ?');
    stmt.bind([req.params.id]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Config not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    const newId = uuidv4();
    const newName = `Copy of ${row.name}`;

    // config_json is already encrypted in DB — just copy it as-is
    db.run(
      `INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)`,
      [newId, newName, row.description, row.config_json]
    );

    saveDb();

    res.status(201).json({
      id: newId,
      name: newName,
      description: row.description,
      config_json: decryptConfig(JSON.parse(row.config_json)),
      message: 'Config duplicated successfully',
    });
  } catch (err) {
    console.error('Error duplicating config:', err);
    res.status(500).json({ error: 'Failed to duplicate config' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/configs/:id/export — Download config as JSON (decrypted)
// ---------------------------------------------------------------------------
router.get('/:id/export', async (req, res) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid config ID format' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT name, config_json FROM configs WHERE id = ?');
    stmt.bind([req.params.id]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Config not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    const filename = `${row.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_config.json`;
    const configJson = decryptConfig(JSON.parse(row.config_json));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(configJson, null, 2));
  } catch (err) {
    console.error('Error exporting config:', err);
    res.status(500).json({ error: 'Failed to export config' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/configs/import-zip — Import tap config(s) from a zip file
// ---------------------------------------------------------------------------
router.post('/import-zip', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No zip file provided' });
    }

    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    // Guard against zip bombs
    if (zipEntries.length > MAX_ZIP_ENTRIES) {
      return res.status(400).json({ error: `Zip contains too many files (max ${MAX_ZIP_ENTRIES})` });
    }

    const jsonFiles = [];
    let tapName = '';
    let tapDescription = '';
    const schemaFiles = {};

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      // Skip files that are too large (zip bomb guard)
      if (entry.header.size > MAX_ENTRY_SIZE) continue;

      const name = entry.entryName;
      const basename = path.basename(name).toLowerCase();

      // Look for setup.py to extract tap name
      if (basename === 'setup.py' || basename === 'setup.cfg') {
        try {
          const content = entry.getData().toString('utf-8');
          const nameMatch = content.match(/name\s*[=:]\s*["']([^"']+)["']/);
          if (nameMatch) tapName = nameMatch[1];
          const descMatch = content.match(/description\s*[=:]\s*["']([^"']+)["']/);
          if (descMatch) tapDescription = descMatch[1];
        } catch (e) { /* ignore */ }
      }

      if (basename === 'pyproject.toml') {
        try {
          const content = entry.getData().toString('utf-8');
          const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
          if (nameMatch && !tapName) tapName = nameMatch[1];
        } catch (e) { /* ignore */ }
      }

      // Collect schema JSON files
      if (name.includes('/schemas/') && basename.endsWith('.json')) {
        try {
          const content = JSON.parse(entry.getData().toString('utf-8'));
          const schemaName = path.basename(name, '.json');
          schemaFiles[schemaName] = content;
        } catch (e) { /* ignore */ }
      }

      // Collect potential config JSON files
      if (basename.endsWith('.json') && !name.includes('/schemas/') && !name.includes('node_modules')) {
        try {
          const content = JSON.parse(entry.getData().toString('utf-8'));
          jsonFiles.push({ path: name, basename, content });
        } catch (e) { /* ignore parse errors */ }
      }
    }

    // Prioritize config files
    const priorityOrder = ['config.json', 'config.sample.json', 'tap_config.json'];
    jsonFiles.sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.basename);
      const bIdx = priorityOrder.indexOf(b.basename);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      const aHasConfig = a.basename.includes('config');
      const bHasConfig = b.basename.includes('config');
      if (aHasConfig && !bHasConfig) return -1;
      if (!aHasConfig && bHasConfig) return 1;
      return 0;
    });

    // Find valid tap configs
    const validConfigs = jsonFiles.filter(f => {
      const c = f.content;
      return (
        (c.api_url && c.streams) ||
        (c.url && typeof c.url === 'string') ||
        (c.api_url && typeof c.api_url === 'string') ||
        (c.streams && Array.isArray(c.streams))
      );
    });

    if (validConfigs.length === 0) {
      if (Object.keys(schemaFiles).length > 0) {
        let streamsConfig = [];
        for (const entry of zipEntries) {
          if (entry.entryName.includes('streams.') && !entry.isDirectory) {
            try {
              const content = entry.getData().toString('utf-8');
              const streamMatches = [...content.matchAll(/"([^"]+)":\s*\{[^}]*"entity_set_name":\s*"([^"]+)"/g)];
              for (const match of streamMatches) {
                streamsConfig.push({
                  name: match[1],
                  path: `/${match[2]}`,
                  primary_keys: [],
                  replication_method: 'FULL_TABLE',
                  pagination_style: 'none',
                });
              }
            } catch (e) { /* ignore */ }
          }
        }

        if (streamsConfig.length === 0) {
          for (const [schemaName, schema] of Object.entries(schemaFiles)) {
            streamsConfig.push({
              name: schemaName,
              path: `/${schemaName}`,
              primary_keys: [],
              replication_method: 'FULL_TABLE',
              pagination_style: 'none',
              schema: schema,
            });
          }
        }

        const builtConfig = { api_url: '', auth_method: 'no_auth', streams: streamsConfig };

        const id = uuidv4();
        const name = tapName || `Imported from ${req.file.originalname}`;
        const db = await getDb();

        db.run(
          `INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)`,
          [id, name, tapDescription || `Imported from zip with ${Object.keys(schemaFiles).length} schemas`, JSON.stringify(encryptConfig(builtConfig))]
        );
        saveDb();

        return res.status(201).json({
          imported: 1,
          configs: [{ id, name }],
          message: `Built config from ${streamsConfig.length} schemas in zip`,
        });
      }

      return res.status(400).json({
        error: 'No valid tap config found in zip. Expected a JSON file with api_url and streams fields.',
      });
    }

    // Import all valid configs
    const db = await getDb();
    const imported = [];

    for (const configFile of validConfigs) {
      const id = uuidv4();
      const name = tapName || path.basename(configFile.path, '.json');
      const description = tapDescription || `Imported from ${req.file.originalname}`;

      let configJson = configFile.content;

      if (configJson.url && !configJson.api_url) {
        configJson.api_url = configJson.url;
        delete configJson.url;
      }

      if (!configJson.streams) configJson.streams = [];
      if (typeof configJson.streams === 'string') {
        configJson.streams = configJson.streams.split(',').map(s => ({
          name: s.trim(),
          path: `/${s.trim()}`,
          primary_keys: [],
          replication_method: 'FULL_TABLE',
          pagination_style: 'none',
        }));
      }

      db.run(
        `INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)`,
        [id, name, description, JSON.stringify(encryptConfig(configJson))]
      );

      imported.push({ id, name });
    }

    saveDb();

    res.status(201).json({
      imported: imported.length,
      configs: imported,
      message: `Successfully imported ${imported.length} config(s)`,
    });
  } catch (err) {
    console.error('Error importing zip:', err);
    res.status(500).json({ error: 'Failed to import zip file' });
  }
});

module.exports = router;
