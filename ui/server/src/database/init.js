const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'configs.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      config_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tap_runs (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      config_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      mode TEXT DEFAULT 'discover',
      started_at TEXT,
      completed_at TEXT,
      records_synced INTEGER DEFAULT 0,
      streams_discovered INTEGER DEFAULT 0,
      catalog_json TEXT,
      output_log TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      state_json TEXT DEFAULT ''
    )
  `);

  // Migrations: add columns that may not exist in older databases
  try {
    db.run(`ALTER TABLE tap_runs ADD COLUMN sample_records TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }

  try {
    db.run(`ALTER TABLE tap_runs ADD COLUMN target_type TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }

  try {
    db.run(`ALTER TABLE tap_runs ADD COLUMN target_config TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }

  // Encrypt any existing plaintext credentials
  migrateEncryptConfigs();

  // Seed default Run Tap configs (mock API, D365 mock, RandomUser.me)
  // Only inserts when the configs table is empty (fresh container).
  const { seedDefaultConfigs } = require('./seed');
  seedDefaultConfigs(db, saveDb);

  saveDb();
  return db;
}

/**
 * One-time migration: encrypt sensitive fields in existing configs.
 * Safe to run multiple times — already-encrypted values are skipped.
 */
function migrateEncryptConfigs() {
  try {
    const { encryptConfig, hasUnencryptedSecrets } = require('../crypto');
    const results = db.exec('SELECT id, config_json FROM configs');
    if (!results.length) return;

    let migrated = 0;
    for (const row of results[0].values) {
      const [id, rawJson] = row;
      try {
        const configJson = JSON.parse(rawJson);
        if (hasUnencryptedSecrets(configJson)) {
          const encrypted = encryptConfig(configJson);
          db.run('UPDATE configs SET config_json = ? WHERE id = ?', [JSON.stringify(encrypted), id]);
          migrated++;
        }
      } catch (e) { /* skip unparseable rows */ }
    }
    if (migrated > 0) {
      console.log(`Encrypted credentials in ${migrated} existing config(s)`);
    }
  } catch (e) {
    console.error('Encryption migration error:', e.message);
  }
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

module.exports = { getDb, saveDb };
