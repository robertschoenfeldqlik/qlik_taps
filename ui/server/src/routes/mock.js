const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32) — deterministic data generation
// ---------------------------------------------------------------------------
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRNG(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Test Credentials
// ---------------------------------------------------------------------------
const CREDENTIALS = {
  api_key: { header: 'X-API-Key', value: 'mock-api-key-12345' },
  bearer_token: { value: 'mock-bearer-token-12345' },
  basic_auth: { username: 'mock-user', password: 'mock-pass-12345' },
  oauth2: {
    client_id: 'mock-client-id',
    client_secret: 'mock-client-secret-12345',
    access_token: 'mock-oauth2-access-token-98765',
  },
};

// ---------------------------------------------------------------------------
// Data Templates
// ---------------------------------------------------------------------------
const FIRST_NAMES = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const COMPANIES = ['Acme Corp', 'TechStart Inc', 'Global Systems', 'DataFlow Ltd', 'CloudPeak', 'Nexus Solutions', 'Pinnacle Group', 'Vertex Labs', 'Atlas Digital', 'Summit Analytics', 'Forge Industries', 'Stellar Dynamics', 'Pulse Technologies', 'Orbit Media', 'Prism Software'];
const DOMAINS = ['example.com', 'test.org', 'demo.io', 'sample.net', 'mock.dev'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys', 'Health', 'Automotive'];
const ROLES = ['admin', 'editor', 'viewer', 'analyst', 'manager'];
const EVENT_TYPES = ['page_view', 'click', 'signup', 'purchase', 'logout', 'search', 'share', 'download'];
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randomDate(rng, yearStart = 2023, yearEnd = 2025) {
  const start = new Date(yearStart, 0, 1).getTime();
  const end = new Date(yearEnd, 11, 31).getTime();
  return new Date(start + rng() * (end - start)).toISOString();
}

// ---------------------------------------------------------------------------
// Dataset Generators
// ---------------------------------------------------------------------------
const GENERATORS = {
  contacts(rng, id) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const domain = pick(rng, DOMAINS);
    const created = randomDate(rng, 2023, 2024);
    return {
      id,
      first_name: first,
      last_name: last,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
      phone: `+1${String(Math.floor(rng() * 9000000000) + 1000000000)}`,
      company: pick(rng, COMPANIES),
      created_at: created,
      updated_at: randomDate(rng, 2024, 2025),
    };
  },

  orders(rng, id) {
    const created = randomDate(rng, 2023, 2025);
    return {
      id,
      order_number: `ORD-${String(10000 + id).slice(1)}`,
      customer_id: Math.floor(rng() * 150) + 1,
      total: Math.round(rng() * 50000) / 100,
      currency: pick(rng, CURRENCIES),
      status: pick(rng, ORDER_STATUSES),
      items_count: Math.floor(rng() * 8) + 1,
      created_at: created,
      updated_at: randomDate(rng, 2024, 2025),
    };
  },

  products(rng, id) {
    const category = pick(rng, CATEGORIES);
    return {
      id,
      name: `${category} Item ${id}`,
      sku: `SKU-${String(100000 + id).slice(1)}`,
      price: Math.round(rng() * 99900 + 100) / 100,
      category,
      in_stock: rng() > 0.2,
      description: `High-quality ${category.toLowerCase()} product for everyday use.`,
      created_at: randomDate(rng, 2022, 2024),
      updated_at: randomDate(rng, 2024, 2025),
    };
  },

  events(rng, id) {
    return {
      id,
      event_type: pick(rng, EVENT_TYPES),
      user_id: Math.floor(rng() * 200) + 1,
      properties: {
        source: pick(rng, ['web', 'mobile', 'api']),
        duration_ms: Math.floor(rng() * 30000),
        success: rng() > 0.1,
      },
      timestamp: randomDate(rng, 2024, 2025),
    };
  },

  users(rng, id) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    return {
      id,
      username: `${first.toLowerCase()}${last.toLowerCase()}${id}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${pick(rng, DOMAINS)}`,
      role: pick(rng, ROLES),
      active: rng() > 0.15,
      last_login: randomDate(rng, 2024, 2025),
      created_at: randomDate(rng, 2022, 2024),
    };
  },

  invoices(rng, id) {
    const numItems = Math.floor(rng() * 4) + 1;
    const lineItems = [];
    let total = 0;
    for (let i = 0; i < numItems; i++) {
      const qty = Math.floor(rng() * 5) + 1;
      const unitPrice = Math.round(rng() * 50000 + 500) / 100;
      const lineTotal = Math.round(qty * unitPrice * 100) / 100;
      total += lineTotal;
      lineItems.push({
        description: `${pick(rng, CATEGORIES)} Service - Item ${i + 1}`,
        quantity: qty,
        unit_price: unitPrice,
        total: lineTotal,
      });
    }
    return {
      id,
      invoice_number: `INV-${String(2024000 + id)}`,
      customer_id: Math.floor(rng() * 150) + 1,
      amount: Math.round(total * 100) / 100,
      due_date: randomDate(rng, 2024, 2026),
      status: pick(rng, INVOICE_STATUSES),
      line_items: lineItems,
      created_at: randomDate(rng, 2023, 2025),
      updated_at: randomDate(rng, 2024, 2025),
    };
  },
};

const AVAILABLE_DATASETS = Object.keys(GENERATORS);
const TOTAL_RECORDS = 150;

// ---------------------------------------------------------------------------
// Dataset Cache — generate once per dataset, reuse across requests
// ---------------------------------------------------------------------------
const datasetCache = new Map();

function getDataset(name) {
  if (datasetCache.has(name)) return datasetCache.get(name);
  const gen = GENERATORS[name];
  if (!gen) return null;
  const rng = createSeededRNG(hashString(name));
  const records = [];
  for (let i = 1; i <= TOTAL_RECORDS; i++) {
    records.push(gen(rng, i));
  }
  datasetCache.set(name, records);
  return records;
}

// ---------------------------------------------------------------------------
// Authentication Middleware
// ---------------------------------------------------------------------------
function validateAuth(req, res, next) {
  // Allow skipping auth for testing no-auth configurations
  if (req.query.auth === 'none') return next();

  const authHeader = req.headers.authorization || '';

  // Bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === CREDENTIALS.bearer_token.value || token === CREDENTIALS.oauth2.access_token) {
      return next();
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid bearer token.',
      accepted_credentials: CREDENTIALS,
    });
  }

  // Basic auth
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (user === CREDENTIALS.basic_auth.username && pass === CREDENTIALS.basic_auth.password) {
      return next();
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid basic auth credentials.',
      accepted_credentials: CREDENTIALS,
    });
  }

  // API Key (header)
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) {
    if (apiKeyHeader === CREDENTIALS.api_key.value) return next();
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key.',
      accepted_credentials: CREDENTIALS,
    });
  }

  // API Key (query param)
  if (req.query.api_key) {
    if (req.query.api_key === CREDENTIALS.api_key.value) return next();
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key (query param).',
      accepted_credentials: CREDENTIALS,
    });
  }

  // No credentials provided
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'No authentication provided. Use one of the test credentials below, or add ?auth=none to skip authentication.',
    accepted_credentials: CREDENTIALS,
  });
}

// ---------------------------------------------------------------------------
// Delay Middleware
// ---------------------------------------------------------------------------
function applyDelay(req, res, next) {
  const delay = Math.min(parseInt(req.query.delay) || 0, 5000);
  if (delay > 0) {
    setTimeout(next, delay);
  } else {
    next();
  }
}

// ---------------------------------------------------------------------------
// Pagination Helpers
// ---------------------------------------------------------------------------
function paginatePage(records, req, baseUrl) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(req.query.per_page) || 25, 1), 100);
  const totalPages = Math.ceil(records.length / perPage);
  const start = (page - 1) * perPage;
  const data = records.slice(start, start + perPage);

  return {
    body: {
      data,
      meta: { page, per_page: perPage, total: records.length, total_pages: totalPages },
    },
    headers: {},
  };
}

function paginateOffset(records, req) {
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
  const data = records.slice(offset, offset + limit);

  return {
    body: {
      data,
      meta: { offset, limit, total: records.length },
    },
    headers: {},
  };
}

function paginateCursor(records, req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
  let startIdx = 0;

  if (req.query.cursor) {
    try {
      startIdx = parseInt(Buffer.from(req.query.cursor, 'base64').toString());
      if (isNaN(startIdx) || startIdx < 0) startIdx = 0;
    } catch (e) {
      startIdx = 0;
    }
  }

  const data = records.slice(startIdx, startIdx + limit);
  const nextIdx = startIdx + limit;
  const nextCursor = nextIdx < records.length
    ? Buffer.from(String(nextIdx)).toString('base64')
    : null;

  return {
    body: {
      data,
      meta: { next_cursor: nextCursor, has_more: nextCursor !== null },
    },
    headers: {},
  };
}

function paginateLinkHeader(records, req, baseUrl) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(req.query.per_page) || 25, 1), 100);
  const totalPages = Math.ceil(records.length / perPage);
  const start = (page - 1) * perPage;
  const data = records.slice(start, start + perPage);

  const headers = {};
  const links = [];
  if (page < totalPages) {
    links.push(`<${baseUrl}?pagination=link_header&page=${page + 1}&per_page=${perPage}>; rel="next"`);
  }
  if (page > 1) {
    links.push(`<${baseUrl}?pagination=link_header&page=${page - 1}&per_page=${perPage}>; rel="prev"`);
  }
  links.push(`<${baseUrl}?pagination=link_header&page=${totalPages}&per_page=${perPage}>; rel="last"`);
  if (links.length) headers.Link = links.join(', ');

  return { body: data, headers };
}

function paginateJsonpath(records, req, baseUrl) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(req.query.per_page) || 25, 1), 100);
  const totalPages = Math.ceil(records.length / perPage);
  const start = (page - 1) * perPage;
  const data = records.slice(start, start + perPage);

  const next = page < totalPages
    ? `${baseUrl}?pagination=jsonpath&page=${page + 1}&per_page=${perPage}`
    : null;

  return {
    body: { results: data, next, total: records.length },
    headers: {},
  };
}

function paginateOdata(records, req, baseUrl) {
  const skip = Math.max(parseInt(req.query.$skip) || 0, 0);
  const top = Math.min(Math.max(parseInt(req.query.$top) || 25, 1), 100);
  const data = records.slice(skip, skip + top);
  const nextSkip = skip + top;

  const body = {
    value: data,
    '@odata.count': records.length,
  };

  if (nextSkip < records.length) {
    body['@odata.nextLink'] = `${baseUrl}?pagination=odata&$skip=${nextSkip}&$top=${top}`;
  }

  return { body, headers: {} };
}

const PAGINATORS = {
  page: paginatePage,
  offset: paginateOffset,
  cursor: paginateCursor,
  link_header: paginateLinkHeader,
  jsonpath: paginateJsonpath,
  odata: paginateOdata,
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/mock/ — Server info and available datasets
router.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/api/mock`;
  res.json({
    mock_server: true,
    version: '1.0',
    base_url: baseUrl,
    datasets: AVAILABLE_DATASETS,
    records_per_dataset: TOTAL_RECORDS,
    auth_methods: {
      api_key: { header: 'X-API-Key', value: CREDENTIALS.api_key.value },
      bearer_token: { header: 'Authorization', value: `Bearer ${CREDENTIALS.bearer_token.value}` },
      basic_auth: { username: CREDENTIALS.basic_auth.username, password: CREDENTIALS.basic_auth.password },
      oauth2: {
        token_url: `${baseUrl}/oauth2/token`,
        client_id: CREDENTIALS.oauth2.client_id,
        client_secret: CREDENTIALS.oauth2.client_secret,
        grant_type: 'client_credentials',
      },
    },
    pagination_styles: Object.keys(PAGINATORS),
    query_params: {
      pagination: 'Pagination style: page (default), offset, cursor, link_header, jsonpath, odata',
      delay: 'Simulated latency in ms (0-5000, default: 0)',
      auth: "Set to 'none' to disable auth requirement",
      page: 'Page number (page pagination)',
      per_page: 'Records per page (default: 25, max: 100)',
      offset: 'Record offset (offset pagination)',
      limit: 'Record limit (offset/cursor pagination)',
      cursor: 'Cursor token (cursor pagination)',
      $skip: 'OData skip count',
      $top: 'OData top count',
    },
  });
});

// POST /api/mock/oauth2/token — OAuth2 token exchange
router.post('/oauth2/token', (req, res) => {
  const { client_id, client_secret, grant_type } = req.body || {};

  if (grant_type !== 'client_credentials') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials grant type is supported.',
    });
  }

  if (client_id !== CREDENTIALS.oauth2.client_id || client_secret !== CREDENTIALS.oauth2.client_secret) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client_id or client_secret.',
      hint: `Use client_id="${CREDENTIALS.oauth2.client_id}" and client_secret="${CREDENTIALS.oauth2.client_secret}"`,
    });
  }

  res.json({
    access_token: CREDENTIALS.oauth2.access_token,
    token_type: 'bearer',
    expires_in: 3600,
    scope: 'read',
  });
});

// GET /api/mock/:dataset — Paginated list endpoint
router.get('/:dataset', validateAuth, applyDelay, (req, res) => {
  const { dataset } = req.params;
  const records = getDataset(dataset);

  if (!records) {
    return res.status(404).json({
      error: 'Dataset not found',
      message: `"${dataset}" is not a valid dataset.`,
      available_datasets: AVAILABLE_DATASETS,
    });
  }

  const style = req.query.pagination || 'page';
  const paginator = PAGINATORS[style];

  if (!paginator) {
    return res.status(400).json({
      error: 'Invalid pagination style',
      message: `"${style}" is not supported.`,
      supported_styles: Object.keys(PAGINATORS),
    });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}/api/mock/${dataset}`;
  const result = paginator(records, req, baseUrl);

  // Set any extra headers (e.g., Link for link_header pagination)
  for (const [key, val] of Object.entries(result.headers)) {
    res.set(key, val);
  }

  res.json(result.body);
});

// GET /api/mock/:dataset/:id — Single record detail
router.get('/:dataset/:id', validateAuth, applyDelay, (req, res) => {
  const { dataset, id } = req.params;
  const records = getDataset(dataset);

  if (!records) {
    return res.status(404).json({
      error: 'Dataset not found',
      available_datasets: AVAILABLE_DATASETS,
    });
  }

  const numId = parseInt(id);
  const record = records.find(r => r.id === numId);

  if (!record) {
    return res.status(404).json({
      error: 'Record not found',
      message: `No record with id=${id} in ${dataset}. Valid IDs: 1-${records.length}`,
    });
  }

  res.json(record);
});

module.exports = router;
