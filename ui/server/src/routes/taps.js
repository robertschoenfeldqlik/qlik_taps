const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getDb, saveDb } = require('../database/init');
const { decryptConfig } = require('../crypto');
const crypto = require('crypto');

// Dynamic import for ESM shared module (works in CJS since Node 12+)
let sharedCleanConfig, sharedDetectTapBinary;
const sharedReady = import('../../../shared/cleanConfig.js').then(mod => {
  sharedCleanConfig = mod.cleanConfig;
  sharedDetectTapBinary = mod.detectTapBinary;
});

const router = express.Router();

// In-memory map of active child processes: runId -> { process, clients[], configId, status, logBuffer }
const activeRuns = new Map();

// Run-scoped tokens for SSE authentication: runId -> token
const runTokens = new Map();

// Temp directory — use app-owned dir instead of world-readable /tmp
const TMP_DIR = path.join(__dirname, '..', '..', '..', 'state', 'runs');

// UUID validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maximum runtime for a tap process (10 minutes)
const MAX_PROCESS_TIMEOUT_MS = 10 * 60 * 1000;

// Minimal environment for child processes — never pass full process.env
function buildSafeEnv() {
  return {
    PATH: process.env.PATH || '',
    PYTHONUNBUFFERED: '1',
    HOME: process.env.HOME || '/home/appuser',
    LANG: process.env.LANG || 'C.UTF-8',
  };
}

// Max lines to persist in output_log column
const MAX_LOG_LINES = 2000;

// Max sample records to keep per stream for data preview
const MAX_SAMPLE_PER_STREAM = 5;

// Whitelist of allowed tap binary names
const ALLOWED_TAPS = new Set(['tap-rest-api', 'tap-dynamics365-erp']);

// Whitelist of allowed target binary names
const ALLOWED_TARGETS = new Set(['target-csv', 'target-jsonl', 'target-confluent-kafka']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect which tap binary to use based on the config contents.
 * Delegates to shared module — single source of truth.
 */
async function detectTapBinary(configJson) {
  await sharedReady;
  return sharedDetectTapBinary(configJson);
}

/**
 * Clean config for CLI consumption.
 * Delegates to shared module — single source of truth.
 */
async function cleanConfig(config) {
  await sharedReady;
  return sharedCleanConfig(config);
}

/** Load config from DB or accept inline JSON. */
async function resolveConfig(body) {
  if (body.config_id) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM configs WHERE id = ?');
    stmt.bind([body.config_id]);
    if (!stmt.step()) {
      stmt.free();
      return { error: 'Config not found' };
    }
    const row = stmt.getAsObject();
    stmt.free();
    return {
      configId: row.id,
      configName: row.name,
      configJson: decryptConfig(JSON.parse(row.config_json)),
    };
  }
  if (body.config_json) {
    return {
      configId: body.config_id || 'inline',
      configName: body.config_name || 'Inline Config',
      configJson: body.config_json,
    };
  }
  return { error: 'config_id or config_json is required' };
}

/** Write cleaned config JSON to a temp file and return the path. */
async function writeTempConfig(runId, configJson) {
  fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
  const configPath = path.join(TMP_DIR, `config_${runId}.json`);
  const cleaned = await cleanConfig(configJson);
  fs.writeFileSync(configPath, JSON.stringify(cleaned, null, 2), { mode: 0o600 });
  return configPath;
}

/**
 * Auto-select all streams in a Singer catalog.
 * Sets metadata `selected: true` at the top-level breadcrumb for each stream
 * so the tap knows which streams to sync.
 */
function autoSelectAllStreams(catalog) {
  if (!catalog || !Array.isArray(catalog.streams)) return catalog;

  for (const stream of catalog.streams) {
    if (!Array.isArray(stream.metadata)) {
      // If no metadata array, create one with selected=true
      stream.metadata = [{ breadcrumb: [], metadata: { selected: true } }];
      continue;
    }

    // Find the top-level metadata entry (empty breadcrumb)
    let topLevel = stream.metadata.find(
      m => Array.isArray(m.breadcrumb) && m.breadcrumb.length === 0
    );
    if (topLevel) {
      topLevel.metadata = topLevel.metadata || {};
      topLevel.metadata.selected = true;
    } else {
      // Add a top-level entry
      stream.metadata.unshift({ breadcrumb: [], metadata: { selected: true } });
    }
  }
  return catalog;
}

/** Write catalog JSON to a temp file and return the path. */
function writeTempCatalog(runId, catalogJson) {
  fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
  const catalogPath = path.join(TMP_DIR, `catalog_${runId}.json`);
  fs.writeFileSync(catalogPath, JSON.stringify(catalogJson, null, 2), { mode: 0o600 });
  return catalogPath;
}

/** Write target config JSON to a temp file and return the path. */
function writeTempTargetConfig(runId, targetConfig) {
  fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
  const configPath = path.join(TMP_DIR, `target_config_${runId}.json`);
  fs.writeFileSync(configPath, JSON.stringify(targetConfig, null, 2), { mode: 0o600 });
  return configPath;
}

/** Remove temp files for a given run. */
function cleanupTempFiles(runId) {
  const names = [`config_${runId}.json`, `catalog_${runId}.json`, `target_config_${runId}.json`];
  for (const name of names) {
    try { fs.unlinkSync(path.join(TMP_DIR, name)); } catch (e) { /* ignore */ }
  }
}

// Whitelist of columns allowed in updateRun to prevent SQL injection via key names
const ALLOWED_RUN_COLUMNS = new Set([
  'status', 'completed_at', 'records_synced', 'streams_discovered',
  'catalog_json', 'output_log', 'error_message', 'state_json', 'sample_records',
  'target_type', 'target_config',
]);

/** Update a tap_run row in the database. */
async function updateRun(runId, updates) {
  const db = await getDb();
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_RUN_COLUMNS.has(key)) continue; // skip unknown columns
    setClauses.push(`${key} = ?`);
    values.push(typeof value === 'object' ? JSON.stringify(value) : value);
  }
  if (setClauses.length === 0) return;
  values.push(runId);
  db.run(`UPDATE tap_runs SET ${setClauses.join(', ')} WHERE id = ?`, values);
  saveDb();
}

/** Send an SSE event to all clients watching a specific run. */
function broadcastToClients(runId, eventData) {
  const run = activeRuns.get(runId);
  if (!run || !run.clients.length) return;
  const msg = `data: ${JSON.stringify(eventData)}\n\n`;
  run.clients = run.clients.filter(res => {
    try {
      res.write(msg);
      return true;
    } catch (e) {
      return false; // client disconnected
    }
  });
}

// ---------------------------------------------------------------------------
// POST /api/taps/discover — Run tap discovery and return catalog
// ---------------------------------------------------------------------------
router.post('/discover', async (req, res) => {
  try {
    if (req.body.config_id && !UUID_RE.test(req.body.config_id)) {
      return res.status(400).json({ error: 'Invalid config_id format' });
    }

    const resolved = await resolveConfig(req.body);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const runId = uuidv4();
    const { configId, configName, configJson } = resolved;

    // Create run record
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO tap_runs (id, config_id, config_name, status, mode, started_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, configId, configName, 'discovering', 'discover', now]
    );
    saveDb();

    // Write config to temp file
    const configPath = await writeTempConfig(runId, configJson);

    // Detect which tap binary to use based on config contents
    const tapBinary = await detectTapBinary(configJson);
    if (!ALLOWED_TAPS.has(tapBinary)) {
      return res.status(400).json({ error: `Invalid tap binary: ${tapBinary}` });
    }

    // Spawn <tap-binary> --config <path> --discover
    const args = ['--config', configPath, '--discover'];
    const tapProcess = spawn(tapBinary, args, {
      env: buildSafeEnv(),
    });

    let stdout = '';
    let stderr = '';

    // Process timeout — kill if it runs too long
    const discoverTimeout = setTimeout(() => {
      try { tapProcess.kill(); } catch (e) { /* ignore */ }
      stderr += '\n[TIMEOUT] Discovery exceeded maximum runtime and was terminated.';
    }, MAX_PROCESS_TIMEOUT_MS);

    tapProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    tapProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    tapProcess.on('error', async (err) => {
      clearTimeout(discoverTimeout);
      await updateRun(runId, {
        status: 'failed',
        error_message: err.code === 'ENOENT'
          ? `${tapBinary} command not found. Ensure the Python tap is installed and in PATH.`
          : err.message,
        completed_at: new Date().toISOString(),
        output_log: stderr,
      });
      cleanupTempFiles(runId);

      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start tap process', details: err.message });
      }
    });

    tapProcess.on('close', async (code) => {
      clearTimeout(discoverTimeout);
      cleanupTempFiles(runId);

      if (code === 0) {
        // Parse the catalog from stdout
        let catalog = null;
        let streamsCount = 0;
        try {
          catalog = JSON.parse(stdout);
          streamsCount = (catalog.streams || []).length;
        } catch (e) {
          catalog = { raw: stdout };
        }

        await updateRun(runId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          catalog_json: JSON.stringify(catalog),
          streams_discovered: streamsCount,
          output_log: stderr,
        });

        if (!res.headersSent) {
          res.json({
            id: runId,
            status: 'completed',
            config_id: configId,
            config_name: configName,
            streams_discovered: streamsCount,
            catalog,
          });
        }
      } else {
        await updateRun(runId, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: stderr || `Process exited with code ${code}`,
          output_log: stderr,
        });

        if (!res.headersSent) {
          res.status(500).json({
            id: runId,
            status: 'failed',
            error: stderr || `Discovery failed with exit code ${code}`,
          });
        }
      }
    });
  } catch (err) {
    console.error('Error in discover:', err);
    res.status(500).json({ error: 'Failed to run discovery' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/taps/run — Start a tap sync (returns runId, streams output via SSE)
// ---------------------------------------------------------------------------
router.post('/run', async (req, res) => {
  try {
    if (req.body.config_id && !UUID_RE.test(req.body.config_id)) {
      return res.status(400).json({ error: 'Invalid config_id format' });
    }

    const resolved = await resolveConfig(req.body);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const { configId, configName, configJson } = resolved;

    // Check for concurrent run
    for (const [, run] of activeRuns) {
      if (run.configId === configId && ['running', 'discovering'].includes(run.status)) {
        return res.status(409).json({
          error: 'A run is already active for this config',
          active_run_id: run.runId,
        });
      }
    }

    const runId = uuidv4();
    const now = new Date().toISOString();

    // Create run record
    const db = await getDb();
    db.run(
      `INSERT INTO tap_runs (id, config_id, config_name, status, mode, started_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, configId, configName, 'running', 'sync', now]
    );
    saveDb();

    // Generate a run-scoped token for SSE authentication
    const runToken = crypto.randomBytes(24).toString('hex');
    runTokens.set(runId, runToken);

    // Return runId and token immediately so the client can connect SSE
    res.status(201).json({ id: runId, status: 'running', stream_token: runToken });

    // --- Background: spawn the tap process ---
    const configPath = await writeTempConfig(runId, configJson);
    const tapBinary = await detectTapBinary(configJson);
    if (!ALLOWED_TAPS.has(tapBinary)) {
      return res.status(400).json({ error: `Invalid tap binary: ${tapBinary}` });
    }

    const args = ['--config', configPath];

    // If a catalog was provided (from a previous discover), use it
    if (req.body.catalog_json) {
      // Auto-select all streams so the tap knows which to sync
      const selectedCatalog = autoSelectAllStreams(req.body.catalog_json);
      const catalogPath = writeTempCatalog(runId, selectedCatalog);
      args.push('--catalog', catalogPath);
    }
    // If no catalog provided, the tap will auto-discover then sync

    const tapProcess = spawn(tapBinary, args, {
      env: buildSafeEnv(),
    });

    // --- Optional: spawn target process and pipe tap -> target ---
    let targetProcess = null;
    const targetType = req.body.target_type || '';
    const targetConfig = req.body.target_config || null;

    if (targetType && ALLOWED_TARGETS.has(targetType) && targetConfig) {
      const targetConfigPath = writeTempTargetConfig(runId, targetConfig);
      targetProcess = spawn(targetType, ['--config', targetConfigPath], {
        env: buildSafeEnv(),
      });

      // Log target stderr
      targetProcess.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const tagged = `[target] ${line}`;
          if (runState) {
            runState.logBuffer.push(tagged);
            broadcastToClients(runId, { type: 'log', line: tagged });
          }
        }
      });

      targetProcess.on('error', (err) => {
        const msg = `Target error: ${err.message}`;
        if (runState) {
          runState.logBuffer.push(`[target] ${msg}`);
          broadcastToClients(runId, { type: 'log', line: `[target] ${msg}` });
        }
      });

      // Update DB with target info
      updateRun(runId, {
        target_type: targetType,
        target_config: JSON.stringify(targetConfig),
      });
    }

    // Track active run
    const runState = {
      runId,
      configId,
      status: 'running',
      process: tapProcess,
      targetProcess,
      clients: [],
      logBuffer: [],
      recordCount: 0,
      streamCount: 0,
      lastState: '',
      sampleRecords: {},
    };
    activeRuns.set(runId, runState);

    // Process timeout — kill if it runs too long
    const processTimeout = setTimeout(() => {
      try { tapProcess.kill(); } catch (e) { /* ignore */ }
      runState.logBuffer.push('[TIMEOUT] Sync exceeded maximum runtime and was terminated.');
      broadcastToClients(runId, { type: 'log', line: '[TIMEOUT] Sync exceeded maximum runtime and was terminated.' });
    }, MAX_PROCESS_TIMEOUT_MS);

    // --- Parse stdout line-by-line for Singer messages ---
    let stdoutPartial = '';

    tapProcess.stdout.on('data', (chunk) => {
      // Forward raw bytes to target process if piping
      if (targetProcess && targetProcess.stdin && !targetProcess.stdin.destroyed) {
        try { targetProcess.stdin.write(chunk); } catch (e) { /* ignore */ }
      }

      stdoutPartial += chunk.toString();
      const lines = stdoutPartial.split('\n');
      // Keep the last partial line
      stdoutPartial = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;

        // Try to parse Singer messages
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'RECORD') {
            runState.recordCount++;
            // Capture first N sample records per stream for data preview
            const stream = msg.stream || 'unknown';
            if (!runState.sampleRecords[stream]) runState.sampleRecords[stream] = [];
            if (runState.sampleRecords[stream].length < MAX_SAMPLE_PER_STREAM) {
              runState.sampleRecords[stream].push(msg.record);
            }
          }
          if (msg.type === 'SCHEMA') runState.streamCount++;
          if (msg.type === 'STATE') runState.lastState = line;
        } catch (e) { /* not JSON — just a log line */ }

        // Buffer for DB persistence
        runState.logBuffer.push(line);
        if (runState.logBuffer.length > MAX_LOG_LINES) {
          runState.logBuffer = runState.logBuffer.slice(-MAX_LOG_LINES);
        }

        // Broadcast to SSE clients
        broadcastToClients(runId, { type: 'log', line });
      }
    });

    // --- Capture stderr ---
    let stderrPartial = '';

    tapProcess.stderr.on('data', (chunk) => {
      stderrPartial += chunk.toString();
      const lines = stderrPartial.split('\n');
      stderrPartial = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        runState.logBuffer.push(`[stderr] ${line}`);
        if (runState.logBuffer.length > MAX_LOG_LINES) {
          runState.logBuffer = runState.logBuffer.slice(-MAX_LOG_LINES);
        }
        broadcastToClients(runId, { type: 'log', line: `[stderr] ${line}` });
      }
    });

    // --- Periodic status broadcast ---
    const statusInterval = setInterval(() => {
      if (activeRuns.has(runId)) {
        broadcastToClients(runId, {
          type: 'status',
          status: 'running',
          records_synced: runState.recordCount,
          streams_discovered: runState.streamCount,
          sample_records: runState.sampleRecords,
        });
      }
    }, 2000);

    // --- Handle process errors ---
    tapProcess.on('error', async (err) => {
      clearTimeout(processTimeout);
      clearInterval(statusInterval);
      const errorMsg = err.code === 'ENOENT'
        ? `${tapBinary} command not found. Ensure the Python tap is installed and in PATH.`
        : err.message;

      await updateRun(runId, {
        status: 'failed',
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
        records_synced: runState.recordCount,
        streams_discovered: runState.streamCount,
        output_log: runState.logBuffer.join('\n'),
        state_json: runState.lastState,
        sample_records: JSON.stringify(runState.sampleRecords),
      });

      broadcastToClients(runId, { type: 'error', message: errorMsg });
      broadcastToClients(runId, { type: 'complete', status: 'failed', sample_records: runState.sampleRecords });
      activeRuns.delete(runId);
      runTokens.delete(runId);
      cleanupTempFiles(runId);
    });

    // --- Handle process close ---
    tapProcess.on('close', async (code) => {
      clearTimeout(processTimeout);
      clearInterval(statusInterval);

      // Close the target's stdin so it can finish processing
      if (targetProcess && targetProcess.stdin && !targetProcess.stdin.destroyed) {
        try { targetProcess.stdin.end(); } catch (e) { /* ignore */ }
      }

      // Flush any remaining partial data
      if (stdoutPartial.trim()) {
        try {
          const msg = JSON.parse(stdoutPartial);
          if (msg.type === 'RECORD') {
            runState.recordCount++;
            const stream = msg.stream || 'unknown';
            if (!runState.sampleRecords[stream]) runState.sampleRecords[stream] = [];
            if (runState.sampleRecords[stream].length < MAX_SAMPLE_PER_STREAM) {
              runState.sampleRecords[stream].push(msg.record);
            }
          }
          if (msg.type === 'SCHEMA') runState.streamCount++;
          if (msg.type === 'STATE') runState.lastState = stdoutPartial;
        } catch (e) { /* ignore */ }
        runState.logBuffer.push(stdoutPartial);
        broadcastToClients(runId, { type: 'log', line: stdoutPartial });
      }
      if (stderrPartial.trim()) {
        runState.logBuffer.push(`[stderr] ${stderrPartial}`);
        broadcastToClients(runId, { type: 'log', line: `[stderr] ${stderrPartial}` });
      }

      const finalStatus = code === 0 ? 'completed' : 'failed';
      const errorMessage = code !== 0 ? `Process exited with code ${code}` : '';

      await updateRun(runId, {
        status: finalStatus,
        completed_at: new Date().toISOString(),
        records_synced: runState.recordCount,
        streams_discovered: runState.streamCount,
        output_log: runState.logBuffer.join('\n'),
        error_message: errorMessage,
        state_json: runState.lastState,
        sample_records: JSON.stringify(runState.sampleRecords),
      });

      broadcastToClients(runId, {
        type: 'complete',
        status: finalStatus,
        records_synced: runState.recordCount,
        streams_discovered: runState.streamCount,
        error_message: errorMessage,
        sample_records: runState.sampleRecords,
      });

      activeRuns.delete(runId);
      runTokens.delete(runId);
      cleanupTempFiles(runId);
    });
  } catch (err) {
    console.error('Error starting run:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start tap run' });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/taps/runs/:id/stream — SSE endpoint for real-time log streaming
// ---------------------------------------------------------------------------
router.get('/runs/:id/stream', async (req, res) => {
  const runId = req.params.id;
  if (!UUID_RE.test(runId)) {
    return res.status(400).json({ error: 'Invalid run ID format' });
  }

  // Validate run-scoped token to prevent unauthorized SSE access
  const expectedToken = runTokens.get(runId);
  const providedToken = req.query.token;
  if (expectedToken && providedToken !== expectedToken) {
    return res.status(403).json({ error: 'Invalid or missing stream token' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial run state
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM tap_runs WHERE id = ?');
    stmt.bind([runId]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      res.write(`data: ${JSON.stringify({
        type: 'status',
        status: row.status,
        records_synced: row.records_synced,
        streams_discovered: row.streams_discovered,
      })}\n\n`);

      // Send existing log history
      if (row.output_log) {
        res.write(`data: ${JSON.stringify({
          type: 'log_history',
          log: row.output_log,
        })}\n\n`);
      }

      // If the run is already terminal, close immediately
      if (['completed', 'failed', 'stopped'].includes(row.status)) {
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          status: row.status,
          records_synced: row.records_synced,
          streams_discovered: row.streams_discovered,
          error_message: row.error_message || '',
        })}\n\n`);
        stmt.free();
        res.end();
        return;
      }
    }
    stmt.free();
  } catch (err) {
    console.error('Error loading run for SSE:', err);
  }

  // Register this client for live broadcasts
  const run = activeRuns.get(runId);
  if (run) {
    run.clients.push(res);
  }

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    if (run) {
      run.clients = run.clients.filter(c => c !== res);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/taps/runs — List all runs (optional ?config_id= filter)
// ---------------------------------------------------------------------------
router.get('/runs', async (req, res) => {
  try {
    const db = await getDb();
    let sql = `SELECT id, config_id, config_name, status, mode, started_at, completed_at,
               records_synced, streams_discovered, error_message
               FROM tap_runs ORDER BY started_at DESC`;
    const params = [];

    if (req.query.config_id) {
      sql = `SELECT id, config_id, config_name, status, mode, started_at, completed_at,
             records_synced, streams_discovered, error_message
             FROM tap_runs WHERE config_id = ? ORDER BY started_at DESC`;
      params.push(req.query.config_id);
    }

    let results;
    if (params.length) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      results = rows;
    } else {
      const raw = db.exec(sql);
      if (!raw.length) {
        return res.json([]);
      }
      const cols = raw[0].columns;
      results = raw[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Error listing runs:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/taps/runs/:id — Get full detail for a single run
// ---------------------------------------------------------------------------
router.get('/runs/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid run ID format' });
    }
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM tap_runs WHERE id = ?');
    stmt.bind([req.params.id]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Run not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    // Parse catalog_json if present
    let catalog = null;
    if (row.catalog_json) {
      try { catalog = JSON.parse(row.catalog_json); } catch (e) { catalog = row.catalog_json; }
    }

    // Parse sample_records if present
    let sampleRecords = null;
    if (row.sample_records) {
      try { sampleRecords = JSON.parse(row.sample_records); } catch (e) { sampleRecords = null; }
    }

    res.json({
      id: row.id,
      config_id: row.config_id,
      config_name: row.config_name,
      status: row.status,
      mode: row.mode,
      started_at: row.started_at,
      completed_at: row.completed_at,
      records_synced: row.records_synced,
      streams_discovered: row.streams_discovered,
      catalog,
      output_log: row.output_log || '',
      error_message: row.error_message || '',
      state_json: row.state_json || '',
      sample_records: sampleRecords,
      target_type: row.target_type || '',
      target_config: row.target_config || '',
    });
  } catch (err) {
    console.error('Error getting run:', err);
    res.status(500).json({ error: 'Failed to get run details' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/taps/runs/:id/stop — Stop a running tap process
// ---------------------------------------------------------------------------
router.post('/runs/:id/stop', async (req, res) => {
  const runId = req.params.id;
  if (!UUID_RE.test(runId)) {
    return res.status(400).json({ error: 'Invalid run ID format' });
  }
  const run = activeRuns.get(runId);

  if (!run || !run.process) {
    return res.status(404).json({ error: 'No active process found for this run' });
  }

  try {
    // Kill the process (works on both Unix and Windows)
    run.process.kill();
  } catch (e) {
    // If kill fails, try taskkill on Windows
    try {
      spawn('taskkill', ['/pid', String(run.process.pid), '/T', '/F'], { shell: true });
    } catch (e2) { /* ignore */ }
  }

  await updateRun(runId, {
    status: 'stopped',
    completed_at: new Date().toISOString(),
    records_synced: run.recordCount || 0,
    streams_discovered: run.streamCount || 0,
    output_log: (run.logBuffer || []).join('\n'),
    state_json: run.lastState || '',
    sample_records: JSON.stringify(run.sampleRecords || {}),
  });

  broadcastToClients(runId, { type: 'complete', status: 'stopped' });

  activeRuns.delete(runId);
  runTokens.delete(runId);
  cleanupTempFiles(runId);

  res.json({ message: 'Run stopped', id: runId });
});

// ---------------------------------------------------------------------------
// GET /api/taps/targets — List available target types
// ---------------------------------------------------------------------------
router.get('/targets', (req, res) => {
  res.json([
    {
      id: 'target-csv',
      name: 'CSV Files',
      description: 'Write records to CSV files in /app/output',
      icon: '📄',
      default_config: { destination_path: '/app/output', delimiter: ',' },
    },
    {
      id: 'target-jsonl',
      name: 'JSON Lines',
      description: 'Write records to JSONL files in /app/output',
      icon: '📋',
      default_config: { destination_path: '/app/output', do_timestamp_file: false },
    },
    {
      id: 'target-confluent-kafka',
      name: 'Confluent Kafka',
      description: 'Produce records to Kafka topics (one topic per stream)',
      icon: '📡',
      default_config: {
        bootstrap_servers: 'kafka:29092',
        topic_prefix: 'singer-',
        flush_interval: 1000,
        compression_type: 'gzip',
        security_protocol: 'PLAINTEXT',
      },
    },
  ]);
});

// ---------------------------------------------------------------------------
// Process cleanup on server shutdown
// ---------------------------------------------------------------------------
const cleanup = () => {
  for (const [runId, run] of activeRuns) {
    if (run.process) {
      try { run.process.kill(); } catch (e) { /* ignore */ }
    }
    cleanupTempFiles(runId);
  }
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = router;
