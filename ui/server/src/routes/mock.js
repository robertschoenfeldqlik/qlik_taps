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

// D365 mock credentials (separate for Azure AD simulation)
const D365_CREDENTIALS = {
  tenant_id: 'mock-tenant-id',
  client_id: 'mock-d365-client',
  client_secret: 'mock-d365-secret-12345',
  access_token: 'mock-d365-bearer-token-98765',
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
// REST API Dataset Generators
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
// D365 OData Entity Set Generators
// ---------------------------------------------------------------------------
const DATA_AREAS = ['USMF', 'USRT', 'DAT'];
const D365_PRODUCT_NAMES = ['Widget A', 'Gadget Pro', 'Component X', 'Assembly Kit', 'Raw Material', 'Service Pack', 'Module Z', 'Sensor Unit', 'Control Board', 'Power Supply'];
const D365_CURRENCIES = ['USD', 'EUR', 'GBP'];
const D365_STATUSES = ['Active', 'OnHold', 'Closed'];
const D365_JOURNAL_TYPES = ['Daily', 'VendInvoiceRegister', 'Payment', 'Allocation', 'Approval'];
const D365_ACCOUNT_TYPES = ['Revenue', 'Expense', 'Asset', 'Liability', 'Equity'];

const D365_GENERATORS = {
  LegalEntities(rng, id) {
    const area = DATA_AREAS[id % DATA_AREAS.length];
    return {
      DataArea: area,
      Name: `${pick(rng, COMPANIES)} - ${area}`,
      LegalEntityId: area,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      AddressCountryRegionId: 'US',
    };
  },
  CustomerGroups(rng, id) {
    return {
      CustomerGroupId: `CG${String(100 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      Description: `Customer Group ${id}`,
      PaymentTermId: `Net${pick(rng, ['30', '60', '90'])}`,
    };
  },
  VendorGroups(rng, id) {
    return {
      VendorGroupId: `VG${String(100 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      Description: `Vendor Group ${id}`,
      PaymentTermId: `Net${pick(rng, ['30', '45', '60'])}`,
    };
  },
  MainAccounts(rng, id) {
    return {
      MainAccountId: `${String(100000 + id * 10)}`,
      ChartOfAccounts: 'COA',
      Name: `${pick(rng, D365_ACCOUNT_TYPES)} Account ${id}`,
      MainAccountCategory: pick(rng, D365_ACCOUNT_TYPES),
      DebitCreditDefault: rng() > 0.5 ? 'Debit' : 'Credit',
    };
  },
  CustomersV3(rng, id) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    return {
      CustomerAccount: `CUST${String(10000 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      Name: `${first} ${last}`,
      CustomerGroupId: `CG${String(100 + (id % 20)).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      SalesTaxGroup: pick(rng, ['TAXABLE', 'EXEMPT', 'REDUCED']),
      AddressStreet: `${Math.floor(rng() * 999) + 1} ${pick(rng, ['Main', 'Oak', 'Elm', 'Park', 'Commerce'])} St`,
      AddressCity: pick(rng, ['New York', 'Chicago', 'Dallas', 'Seattle', 'Atlanta', 'Denver']),
      AddressState: pick(rng, ['NY', 'IL', 'TX', 'WA', 'GA', 'CO']),
      AddressZipCode: String(10000 + Math.floor(rng() * 90000)),
    };
  },
  VendorsV2(rng, id) {
    return {
      VendorAccountNumber: `VEND${String(10000 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      VendorName: pick(rng, COMPANIES),
      VendorGroupId: `VG${String(100 + (id % 15)).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      PaymentTermId: `Net${pick(rng, ['30', '45', '60', '90'])}`,
    };
  },
  ReleasedProductsV2(rng, id) {
    return {
      ItemNumber: `ITEM${String(10000 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${id}`,
      ProductType: pick(rng, ['Item', 'Service']),
      ProductSubtype: pick(rng, ['Product', 'ProductMaster']),
      SalesCurrencyCode: pick(rng, D365_CURRENCIES),
      SalesPrice: Math.round(rng() * 50000 + 100) / 100,
    };
  },
  InventoryWarehouses(rng, id) {
    return {
      WarehouseId: `WH${String(10 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      WarehouseName: `Warehouse ${pick(rng, ['Main', 'Central', 'East', 'West', 'North', 'South'])} ${id}`,
      WarehouseType: pick(rng, ['Default', 'Transit', 'Quarantine']),
    };
  },
  InventoryOnhandEntries(rng, id) {
    return {
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      InventorySiteId: `SITE${Math.floor(id / 10) + 1}`,
      WarehouseId: `WH${String(10 + (id % 8)).slice(1)}`,
      AvailableQuantity: Math.floor(rng() * 10000),
      OnOrderQuantity: Math.floor(rng() * 500),
      ReservedQuantity: Math.floor(rng() * 200),
    };
  },
  SalesOrderHeadersV2(rng, id) {
    return {
      SalesOrderNumber: `SO${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      CustomerAccount: `CUST${String(10000 + (id % 50) + 1).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      SalesOrderStatus: pick(rng, ['Open', 'Confirmed', 'Picked', 'Invoiced', 'Cancelled']),
      OrderCreatedDate: randomDate(rng, 2023, 2025),
      ModifiedDateTime: randomDate(rng, 2024, 2025),
      TotalAmount: Math.round(rng() * 100000 + 100) / 100,
    };
  },
  SalesOrderLines(rng, id) {
    return {
      SalesOrderNumber: `SO${String(100000 + Math.floor(id / 3) + 1)}`,
      SalesOrderLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      Quantity: Math.floor(rng() * 100) + 1,
      SalesPrice: Math.round(rng() * 10000 + 10) / 100,
      LineAmount: Math.round(rng() * 50000 + 50) / 100,
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  PurchaseOrderHeadersV2(rng, id) {
    return {
      PurchaseOrderNumber: `PO${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      VendorAccountNumber: `VEND${String(10000 + (id % 30) + 1).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      PurchaseOrderStatus: pick(rng, ['Draft', 'Confirmed', 'Received', 'Invoiced']),
      OrderCreatedDate: randomDate(rng, 2023, 2025),
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  PurchaseOrderLines(rng, id) {
    return {
      PurchaseOrderNumber: `PO${String(100000 + Math.floor(id / 3) + 1)}`,
      PurchaseOrderLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      Quantity: Math.floor(rng() * 200) + 1,
      PurchasePrice: Math.round(rng() * 5000 + 5) / 100,
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  CustomerInvoiceHeaders(rng, id) {
    return {
      InvoiceId: `CI${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      CustomerAccount: `CUST${String(10000 + (id % 50) + 1).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      InvoiceAmount: Math.round(rng() * 80000 + 100) / 100,
      InvoiceDate: randomDate(rng, 2023, 2025),
      SalesOrderNumber: `SO${String(100000 + (id % 80) + 1)}`,
    };
  },
  CustomerInvoiceLines(rng, id) {
    return {
      InvoiceId: `CI${String(100000 + Math.floor(id / 3) + 1)}`,
      InvoiceLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      Quantity: Math.floor(rng() * 50) + 1,
      LineAmount: Math.round(rng() * 20000 + 10) / 100,
      InvoiceDate: randomDate(rng, 2023, 2025),
    };
  },
  VendorInvoiceHeaders(rng, id) {
    return {
      HeaderReference: `VI${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      VendorAccountNumber: `VEND${String(10000 + (id % 30) + 1).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      InvoiceAmount: Math.round(rng() * 60000 + 50) / 100,
      InvoiceDate: randomDate(rng, 2023, 2025),
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  VendorInvoiceLines(rng, id) {
    return {
      HeaderReference: `VI${String(100000 + Math.floor(id / 3) + 1)}`,
      InvoiceLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      Quantity: Math.floor(rng() * 100) + 1,
      LineAmount: Math.round(rng() * 15000 + 10) / 100,
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  LedgerJournalHeaders(rng, id) {
    return {
      JournalBatchNumber: `JRN${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      JournalName: `${pick(rng, D365_JOURNAL_TYPES)}Journal`,
      Description: `${pick(rng, D365_JOURNAL_TYPES)} journal entry ${id}`,
      PostedDate: randomDate(rng, 2023, 2025),
    };
  },
  LedgerJournalLines(rng, id) {
    return {
      JournalBatchNumber: `JRN${String(100000 + Math.floor(id / 4) + 1)}`,
      LineNumber: (id % 4) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      MainAccountId: `${String(100000 + (id % 30) * 10)}`,
      DebitAmount: rng() > 0.5 ? Math.round(rng() * 50000) / 100 : 0,
      CreditAmount: rng() > 0.5 ? Math.round(rng() * 50000) / 100 : 0,
      CurrencyCode: pick(rng, D365_CURRENCIES),
    };
  },
  GeneralJournalEntries(rng, id) {
    return {
      JournalNumber: `GJ${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      PostingDate: randomDate(rng, 2023, 2025),
      DocumentDate: randomDate(rng, 2023, 2025),
      DocumentNumber: `DOC${String(200000 + id)}`,
      JournalCategory: pick(rng, D365_JOURNAL_TYPES),
      LedgerEntryAmount: Math.round(rng() * 100000 - 50000) / 100,
    };
  },
  GeneralJournalAccountEntries(rng, id) {
    return {
      GeneralJournalAccountEntryRecId: id,
      MainAccountId: `${String(100000 + (id % 30) * 10)}`,
      PostingDate: randomDate(rng, 2023, 2025),
      TransactionCurrencyAmount: Math.round(rng() * 80000 - 40000) / 100,
      TransactionCurrencyCode: pick(rng, D365_CURRENCIES),
      AccountingCurrencyAmount: Math.round(rng() * 80000 - 40000) / 100,
      PostingType: pick(rng, ['Revenue', 'Expense', 'Balance']),
    };
  },
};

const D365_ENTITY_SETS = Object.keys(D365_GENERATORS);
const D365_RECORDS_PER_ENTITY = 50;

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

const d365Cache = new Map();

function getD365Dataset(entitySetName) {
  if (d365Cache.has(entitySetName)) return d365Cache.get(entitySetName);
  const gen = D365_GENERATORS[entitySetName];
  if (!gen) return null;
  const rng = createSeededRNG(hashString('d365_' + entitySetName));
  const records = [];
  for (let i = 1; i <= D365_RECORDS_PER_ENTITY; i++) {
    records.push(gen(rng, i));
  }
  d365Cache.set(entitySetName, records);
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
    if (token === CREDENTIALS.bearer_token.value ||
        token === CREDENTIALS.oauth2.access_token ||
        token === D365_CREDENTIALS.access_token) {
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

// D365-specific auth middleware (Bearer token only, matching Azure AD flow)
function validateD365Auth(req, res, next) {
  if (req.query.auth === 'none') return next();

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === D365_CREDENTIALS.access_token ||
        token === CREDENTIALS.oauth2.access_token ||
        token === CREDENTIALS.bearer_token.value) {
      return next();
    }
  }

  return res.status(401).json({
    error: {
      code: 'Unauthorized',
      message: 'Bearer token is missing or invalid. Obtain a token from the OAuth2 endpoint first.',
    },
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
// REST API Pagination Helpers
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
// Routes — REST API Mock
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
    d365_entity_sets: D365_ENTITY_SETS,
    d365_records_per_entity: D365_RECORDS_PER_ENTITY,
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
    d365_auth: {
      oauth_token_url: `${baseUrl}/oauth2/token`,
      tenant_id: D365_CREDENTIALS.tenant_id,
      client_id: D365_CREDENTIALS.client_id,
      client_secret: D365_CREDENTIALS.client_secret,
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

// POST /api/mock/oauth2/token — OAuth2 token exchange (works for both REST and D365)
router.post('/oauth2/token', (req, res) => {
  const { client_id, client_secret, grant_type } = req.body || {};

  if (grant_type !== 'client_credentials') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials grant type is supported.',
    });
  }

  // Accept both REST and D365 credentials
  if ((client_id === CREDENTIALS.oauth2.client_id && client_secret === CREDENTIALS.oauth2.client_secret) ||
      (client_id === D365_CREDENTIALS.client_id && client_secret === D365_CREDENTIALS.client_secret)) {
    const token = client_id === D365_CREDENTIALS.client_id
      ? D365_CREDENTIALS.access_token
      : CREDENTIALS.oauth2.access_token;
    return res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: req.body.scope || 'read',
    });
  }

  return res.status(401).json({
    error: 'invalid_client',
    error_description: 'Invalid client_id or client_secret.',
    hint: `For REST: client_id="${CREDENTIALS.oauth2.client_id}", client_secret="${CREDENTIALS.oauth2.client_secret}". For D365: client_id="${D365_CREDENTIALS.client_id}", client_secret="${D365_CREDENTIALS.client_secret}"`,
  });
});

// ---------------------------------------------------------------------------
// Routes — D365 OData Mock (under /api/mock/data)
// ---------------------------------------------------------------------------

// GET /api/mock/data — OData service document (entity set listing)
router.get('/data', validateD365Auth, applyDelay, (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/api/mock/data`;
  res.json({
    '@odata.context': `${baseUrl}/$metadata`,
    value: D365_ENTITY_SETS.map(name => ({
      name,
      kind: 'EntitySet',
      url: name,
    })),
  });
});

// GET /api/mock/data/:entitySet — OData entity set with @odata.nextLink pagination
router.get('/data/:entitySet', validateD365Auth, applyDelay, (req, res) => {
  const { entitySet } = req.params;
  const records = getD365Dataset(entitySet);

  if (!records) {
    return res.status(404).json({
      error: {
        code: 'EntitySetNotFound',
        message: `Entity set "${entitySet}" not found.`,
        available: D365_ENTITY_SETS,
      },
    });
  }

  // Apply OData $filter if present (simple string contains check for mock purposes)
  let filtered = records;
  if (req.query.$filter) {
    // Basic support: field ge 'value' or field eq 'value'
    const filterMatch = req.query.$filter.match(/(\w+)\s+(ge|gt|eq)\s+'?([^']*)'?/i);
    if (filterMatch) {
      const [, field, op, value] = filterMatch;
      filtered = records.filter(r => {
        const val = r[field];
        if (!val) return true; // include records without the field
        if (op === 'ge') return String(val) >= value;
        if (op === 'gt') return String(val) > value;
        if (op === 'eq') return String(val) === value;
        return true;
      });
    }
  }

  // Apply OData $orderby if present
  if (req.query.$orderby) {
    const [field, dir] = req.query.$orderby.split(/\s+/);
    const mult = (dir || '').toLowerCase() === 'desc' ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      if (a[field] < b[field]) return -1 * mult;
      if (a[field] > b[field]) return 1 * mult;
      return 0;
    });
  }

  // OData pagination via $skip/$top or Prefer: odata.maxpagesize
  const prefer = req.headers.prefer || '';
  const maxPageMatch = prefer.match(/odata\.maxpagesize=(\d+)/);
  const defaultTop = maxPageMatch ? parseInt(maxPageMatch[1]) : 25;

  const skip = Math.max(parseInt(req.query.$skip) || 0, 0);
  const top = Math.min(parseInt(req.query.$top) || defaultTop, 10000);
  const page = filtered.slice(skip, skip + top);
  const nextSkip = skip + top;

  const baseUrl = `${req.protocol}://${req.get('host')}/api/mock/data/${entitySet}`;
  const body = {
    '@odata.context': `${baseUrl}/$metadata#${entitySet}`,
    value: page,
  };

  // Add cross-company param back if present
  const crossCompany = req.query['cross-company'] === 'true' ? '&cross-company=true' : '';

  if (nextSkip < filtered.length) {
    body['@odata.nextLink'] = `${baseUrl}?$skip=${nextSkip}&$top=${top}${crossCompany}`;
  }

  // Include OData headers
  res.set('OData-Version', '4.0');
  res.set('Content-Type', 'application/json; odata.metadata=minimal');
  res.json(body);
});

// ---------------------------------------------------------------------------
// Routes — REST API Datasets
// ---------------------------------------------------------------------------

// GET /api/mock/:dataset — Paginated list endpoint
router.get('/:dataset', validateAuth, applyDelay, (req, res) => {
  const { dataset } = req.params;

  // Skip if it matches a D365 entity set name (handled above)
  if (dataset === 'data') return;

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

  // Skip if dataset is 'data' (D365 routes handle /data/:entitySet)
  if (dataset === 'data') return;

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
