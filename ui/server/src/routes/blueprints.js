const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDb } = require('../database/init');
const {
  anonymizeHttpMeta,
  groupEndpoints,
  extractAuthExchanges,
} = require('../anonymize');

const router = express.Router();

// UUID validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// POST /api/blueprints — Create a blueprint from a tap run's HTTP metadata
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { run_id, name, description } = req.body;

    if (!run_id || !UUID_RE.test(run_id)) {
      return res.status(400).json({ error: 'Valid run_id is required' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    const db = await getDb();

    // Load the run's http_metadata
    const stmt = db.prepare('SELECT config_name, http_metadata FROM tap_runs WHERE id = ?');
    stmt.bind([run_id]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Run not found' });
    }
    const row = stmt.getAsObject();
    stmt.free();

    if (!row.http_metadata) {
      return res.status(400).json({ error: 'Run has no HTTP metadata captured' });
    }

    let rawMeta;
    try {
      rawMeta = JSON.parse(row.http_metadata);
    } catch {
      return res.status(400).json({ error: 'Could not parse run HTTP metadata' });
    }

    if (!Array.isArray(rawMeta) || rawMeta.length === 0) {
      return res.status(400).json({ error: 'Run has no HTTP metadata entries' });
    }

    // Anonymize the metadata
    const anonymized = anonymizeHttpMeta(rawMeta);

    // Group into deduplicated endpoints
    const endpoints = groupEndpoints(anonymized);

    // Extract auth exchange info
    const authExchanges = extractAuthExchanges(anonymized);

    // Detect API base URL from the first non-auth request
    const firstDataRequest = rawMeta.find(m => !m.is_auth_exchange);
    let apiBaseUrl = '';
    if (firstDataRequest && firstDataRequest.request && firstDataRequest.request.url) {
      try {
        const url = new URL(firstDataRequest.request.url);
        apiBaseUrl = `${url.protocol}//${url.host}`;
      } catch { /* ignore */ }
    }

    // Detect auth method from auth exchanges
    let authMethod = 'no_auth';
    if (authExchanges.length > 0) {
      authMethod = 'oauth2'; // auth exchanges imply OAuth2
    } else {
      // Check if any request had Authorization or API key headers
      const firstReq = rawMeta[0]?.request?.headers || {};
      if (firstReq.Authorization || firstReq.authorization) {
        const authVal = firstReq.Authorization || firstReq.authorization || '';
        if (authVal.startsWith('Bearer ')) authMethod = 'bearer_token';
        else if (authVal.startsWith('Basic ')) authMethod = 'basic';
      } else if (firstReq['X-API-Key'] || firstReq['x-api-key']) {
        authMethod = 'api_key';
      }
    }

    const id = uuidv4();
    const blueprintData = {
      endpoints,
      auth_exchanges: authExchanges,
      total_requests_captured: rawMeta.length,
    };

    db.run(
      `INSERT INTO mock_blueprints (id, name, description, source_run_id, source_config_name, api_base_url, auth_method, endpoints)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name.trim(),
        (description || '').trim(),
        run_id,
        row.config_name || '',
        apiBaseUrl,
        authMethod,
        JSON.stringify(blueprintData),
      ]
    );
    saveDb();

    res.status(201).json({
      id,
      name: name.trim(),
      description: (description || '').trim(),
      source_run_id: run_id,
      source_config_name: row.config_name || '',
      api_base_url: apiBaseUrl,
      auth_method: authMethod,
      endpoint_count: endpoints.length,
      total_requests_captured: rawMeta.length,
      message: `Blueprint created with ${endpoints.length} endpoint(s) from ${rawMeta.length} captured request(s).`,
    });
  } catch (err) {
    console.error('Error creating blueprint:', err);
    res.status(500).json({ error: 'Failed to create blueprint' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/blueprints — List all blueprints
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, name, description, source_run_id, source_config_name,
             api_base_url, auth_method, endpoints, active, created_at
      FROM mock_blueprints
      ORDER BY created_at DESC
    `);

    if (!results.length || results[0].values.length === 0) {
      return res.json([]);
    }

    const cols = results[0].columns;
    const blueprints = results[0].values.map(row => {
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });

      // Parse endpoints JSON to get count
      let endpointCount = 0;
      try {
        const data = JSON.parse(obj.endpoints);
        endpointCount = (data.endpoints || []).length;
      } catch { /* ignore */ }

      obj.endpoint_count = endpointCount;
      // Don't send full endpoints in list view
      delete obj.endpoints;
      return obj;
    });

    res.json(blueprints);
  } catch (err) {
    console.error('Error listing blueprints:', err);
    res.status(500).json({ error: 'Failed to list blueprints' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/blueprints/:id — Get full blueprint detail
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid blueprint ID format' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM mock_blueprints WHERE id = ?');
    stmt.bind([req.params.id]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Blueprint not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    // Parse endpoints JSON
    let endpoints = null;
    try { endpoints = JSON.parse(row.endpoints); } catch { endpoints = row.endpoints; }

    res.json({
      id: row.id,
      name: row.name,
      description: row.description || '',
      source_run_id: row.source_run_id || '',
      source_config_name: row.source_config_name || '',
      api_base_url: row.api_base_url || '',
      auth_method: row.auth_method || 'no_auth',
      endpoints,
      active: row.active === 1,
      created_at: row.created_at,
    });
  } catch (err) {
    console.error('Error getting blueprint:', err);
    res.status(500).json({ error: 'Failed to get blueprint' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/blueprints/:id — Delete a blueprint
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid blueprint ID format' });
    }

    const db = await getDb();

    // Check if exists
    const stmt = db.prepare('SELECT id FROM mock_blueprints WHERE id = ?');
    stmt.bind([req.params.id]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Blueprint not found' });
    }
    stmt.free();

    db.run('DELETE FROM mock_blueprints WHERE id = ?', [req.params.id]);
    saveDb();

    res.json({ message: 'Blueprint deleted' });
  } catch (err) {
    console.error('Error deleting blueprint:', err);
    res.status(500).json({ error: 'Failed to delete blueprint' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/blueprints/:id/activate — Activate a blueprint for mock serving
// ---------------------------------------------------------------------------
router.post('/:id/activate', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid blueprint ID format' });
    }

    const db = await getDb();

    const stmt = db.prepare('SELECT id FROM mock_blueprints WHERE id = ?');
    stmt.bind([req.params.id]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Blueprint not found' });
    }
    stmt.free();

    db.run('UPDATE mock_blueprints SET active = 1 WHERE id = ?', [req.params.id]);
    saveDb();

    res.json({ message: 'Blueprint activated', active: true });
  } catch (err) {
    console.error('Error activating blueprint:', err);
    res.status(500).json({ error: 'Failed to activate blueprint' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/blueprints/:id/deactivate — Deactivate a blueprint
// ---------------------------------------------------------------------------
router.post('/:id/deactivate', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid blueprint ID format' });
    }

    const db = await getDb();

    const stmt = db.prepare('SELECT id FROM mock_blueprints WHERE id = ?');
    stmt.bind([req.params.id]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Blueprint not found' });
    }
    stmt.free();

    db.run('UPDATE mock_blueprints SET active = 0 WHERE id = ?', [req.params.id]);
    saveDb();

    res.json({ message: 'Blueprint deactivated', active: false });
  } catch (err) {
    console.error('Error deactivating blueprint:', err);
    res.status(500).json({ error: 'Failed to deactivate blueprint' });
  }
});

module.exports = router;
