/**
 * Seed default Run Tap configurations on startup.
 *
 * Inserts the three demo tap configs if the configs table is empty,
 * so they survive Docker container restarts without a persistent volume.
 *
 * To add or update seed configs, edit the SEED_CONFIGS array below.
 */

const { v4: uuidv4 } = require('uuid');

const SEED_CONFIGS = [
  // ── 1. Generic REST — Mock API (Testing) ────────────────────────────
  {
    name: 'Mock API (Testing)',
    description:
      'Built-in test server \u2014 6 datasets with different pagination styles. No real credentials needed.',
    config_json: {
      api_url: 'http://localhost:9090/api/mock',
      auth_method: 'api_key',
      api_key: 'mock-api-key-12345',
      api_key_name: 'X-API-Key',
      api_key_location: 'header',
      user_agent: 'tap-rest-api/1.0 (+mock)',
      headers: {},
      params: {},
      streams: [
        {
          name: 'contacts',
          path: '/contacts',
          primary_keys: ['id'],
          records_path: '$.data[*]',
          replication_method: 'FULL_TABLE',
          denest: true,
          pagination_style: 'page',
          pagination_page_param: 'page',
          pagination_size_param: 'per_page',
          pagination_page_size: 25,
          pagination_start_page: 1,
          params: {},
          headers: {},
        },
        {
          name: 'orders',
          path: '/orders',
          primary_keys: ['id'],
          records_path: '$.data[*]',
          replication_method: 'INCREMENTAL',
          replication_key: 'updated_at',
          denest: true,
          pagination_style: 'offset',
          pagination_offset_param: 'offset',
          pagination_limit_param: 'limit',
          pagination_page_size: 25,
          params: {},
          headers: {},
        },
        {
          name: 'products',
          path: '/products',
          primary_keys: ['id'],
          records_path: '$.data[*]',
          replication_method: 'FULL_TABLE',
          denest: true,
          pagination_style: 'cursor',
          pagination_cursor_path: '$.meta.next_cursor',
          pagination_cursor_param: 'cursor',
          params: { limit: '25' },
          headers: {},
        },
        {
          name: 'events',
          path: '/events',
          primary_keys: ['id'],
          records_path: '$.results[*]',
          replication_method: 'FULL_TABLE',
          denest: true,
          pagination_style: 'jsonpath',
          pagination_next_path: '$.next',
          pagination_next_is_url: true,
          params: { limit: '25', pagination: 'jsonpath' },
          headers: {},
        },
        {
          name: 'users',
          path: '/users',
          primary_keys: ['id'],
          records_path: '$.data[*]',
          replication_method: 'FULL_TABLE',
          denest: true,
          pagination_style: 'page',
          pagination_page_param: 'page',
          pagination_size_param: 'per_page',
          pagination_page_size: 25,
          pagination_start_page: 1,
          params: {},
          headers: {},
        },
        {
          name: 'invoices',
          path: '/invoices',
          primary_keys: ['id'],
          records_path: '$.value[*]',
          replication_method: 'FULL_TABLE',
          denest: true,
          pagination_style: 'odata',
          params: { pagination: 'odata' },
          headers: {},
        },
      ],
    },
  },

  // ── 2. D365 F&O OData v4 Mock (Testing) ─────────────────────────────
  {
    name: 'D365 F&O OData v4 Mock (Testing)',
    description:
      'Test Dynamics 365 Finance & Operations OData v4 tap against the built-in mock server \u2014 $metadata, $filter, cross-company, @odata.nextLink pagination \u2014 no Azure AD credentials needed.',
    config_json: {
      tap_type: 'dynamics365',
      environment_url: 'http://localhost:9090/api/mock',
      tenant_id: 'mock-tenant-id',
      client_id: 'mock-d365-client',
      client_secret: 'mock-d365-secret-12345',
      oauth_token_url: 'http://localhost:9090/api/mock/oauth2/token',
      user_agent: 'tap-dynamics365-erp/mock',
      streams: [
        'legal_entities',
        'customer_groups',
        'vendor_groups',
        'main_accounts',
        'customers',
        'vendors',
        'released_products',
        'inventory_warehouses',
        'inventory_onhand',
        'sales_order_headers',
        'sales_order_lines',
        'purchase_order_headers',
        'purchase_order_lines',
        'customer_invoice_headers',
        'customer_invoice_lines',
        'vendor_invoice_headers',
        'vendor_invoice_lines',
        'ledger_journal_headers',
        'ledger_journal_lines',
        'general_journal_entries',
        'general_journal_account_entries',
      ],
    },
  },

  // ── 3. RandomUser.me \u2014 REST API ────────────────────────────────────
  {
    name: 'RandomUser.me \u2014 REST API',
    description: 'Random user data from randomuser.me public API',
    config_json: {
      api_url: 'https://randomuser.me/api',
      auth_method: 'no_auth',
      user_agent: 'tap-rest-api/singer',
      streams: [
        {
          name: 'users',
          path: '/',
          primary_keys: ['login__uuid'],
          records_path: 'results',
          replication_method: 'FULL_TABLE',
          params: { results: '50', seed: 'singer-tap-demo' },
          pagination_style: 'page',
          pagination_page_size: 50,
          pagination_page_param: 'page',
          pagination_start_page: 1,
        },
      ],
    },
  },
];

/**
 * Seed default configs into the database if the table is empty.
 * Called once during server startup after DB init.
 */
function seedDefaultConfigs(db, saveDb) {
  try {
    const result = db.exec('SELECT COUNT(*) as cnt FROM configs');
    const count = result.length ? result[0].values[0][0] : 0;

    if (count > 0) {
      // Configs already exist — don't overwrite user changes
      return;
    }

    let { encryptConfig } = {};
    try {
      ({ encryptConfig } = require('../crypto'));
    } catch (e) {
      // Encryption module not available — store plaintext
      encryptConfig = (c) => c;
    }

    let seeded = 0;
    for (const seed of SEED_CONFIGS) {
      const id = uuidv4();
      const encrypted = encryptConfig(seed.config_json);
      db.run(
        'INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)',
        [id, seed.name, seed.description, JSON.stringify(encrypted)]
      );
      seeded++;
    }

    saveDb();
    console.log(`Seeded ${seeded} default tap config(s)`);
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

module.exports = { seedDefaultConfigs, SEED_CONFIGS };
