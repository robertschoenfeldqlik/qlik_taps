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

// Generator properties match the exact D365 tap schemas (additionalProperties: false)
// See: taps/tap-dynamics365-erp/tap_dynamics365_erp/schemas/*.json
const D365_GENERATORS = {
  // ---- Reference / Master Data ----
  LegalEntities(rng, id) {
    const area = DATA_AREAS[id % DATA_AREAS.length];
    return {
      DataArea: area,
      Name: `${pick(rng, COMPANIES)} - ${area}`,
      LegalEntityId: area,
      PartyNumber: `PARTY${String(10000 + id).slice(1)}`,
      AddressCountryRegionId: 'US',
      AddressCity: pick(rng, ['New York', 'Chicago', 'Dallas', 'Seattle']),
      AddressStreet: `${Math.floor(rng() * 999) + 1} Corporate Blvd`,
      AddressZipCode: String(10000 + Math.floor(rng() * 90000)),
      AddressState: pick(rng, ['NY', 'IL', 'TX', 'WA']),
      CurrencyCode: pick(rng, D365_CURRENCIES),
      FiscalCalendarId: 'Fiscal',
      ChartOfAccountsId: 'COA',
      IsFrenchPublicSector: false,
    };
  },
  CustomerGroups(rng, id) {
    return {
      CustomerGroupId: `CG${String(100 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      Description: `Customer Group ${id}`,
      DefaultDimensionDisplayValue: `DEPT-${Math.floor(rng() * 50) + 1}`,
      PaymentTermId: `Net${pick(rng, ['30', '60', '90'])}`,
      TaxGroupId: pick(rng, ['TAXABLE', 'EXEMPT']),
      ClearingPeriodPaymentTermName: '',
      WriteOffReason: '',
      IsSalesTaxIncludedInPrice: 'No',
    };
  },
  VendorGroups(rng, id) {
    return {
      VendorGroupId: `VG${String(100 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      Description: `Vendor Group ${id}`,
      DefaultDimensionDisplayValue: `CC-${Math.floor(rng() * 30) + 1}`,
      PaymentTermId: `Net${pick(rng, ['30', '45', '60'])}`,
      TaxGroupId: pick(rng, ['TAXABLE', 'EXEMPT']),
      ClearingPeriodPaymentTermName: '',
    };
  },
  MainAccounts(rng, id) {
    const acctType = pick(rng, D365_ACCOUNT_TYPES);
    return {
      MainAccountId: `${String(100000 + id * 10)}`,
      ChartOfAccounts: 'COA',
      Name: `${acctType} Account ${id}`,
      MainAccountCategory: acctType,
      DebitCreditDefault: rng() > 0.5 ? 'Debit' : 'Credit',
      Type: acctType,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      IsBalanceSheetAccount: acctType === 'Asset' || acctType === 'Liability',
      ClosingAccountId: '',
      IsSuspended: false,
      DoNotAllowManualEntry: false,
      DefaultDimensionDisplayValue: '',
    };
  },

  // ---- Customers & Vendors ----
  CustomersV3(rng, id) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const area = pick(rng, DATA_AREAS);
    return {
      CustomerAccount: `CUST${String(10000 + id).slice(1)}`,
      dataAreaId: area,
      CustomerGroupId: `CG${String(100 + (id % 20)).slice(1)}`,
      OrganizationName: `${pick(rng, COMPANIES)}`,
      PersonFirstName: first,
      PersonLastName: last,
      PartyNumber: `PARTY${String(20000 + id).slice(1)}`,
      PartyType: pick(rng, ['Organization', 'Person']),
      CurrencyCode: pick(rng, D365_CURRENCIES),
      PaymentTermsName: `Net${pick(rng, ['30', '60', '90'])}`,
      PaymentMethod: pick(rng, ['CHECK', 'WIRE', 'ACH']),
      CreditLimit: Math.round(rng() * 500000) / 100,
      CreditRating: pick(rng, ['Excellent', 'Good', 'Average', 'Poor']),
      SalesTaxGroup: pick(rng, ['TAXABLE', 'EXEMPT', 'REDUCED']),
      DefaultDimensionDisplayValue: `BU-${Math.floor(rng() * 20) + 1}`,
      SalesSegmentId: `SEG${Math.floor(rng() * 5) + 1}`,
      SalesDistrictId: `DIST${Math.floor(rng() * 10) + 1}`,
      InvoiceAccount: `CUST${String(10000 + (id % 30) + 1).slice(1)}`,
      PrimaryContactEmail: `${first.toLowerCase()}.${last.toLowerCase()}@${pick(rng, DOMAINS)}`,
      PrimaryContactPhone: `+1${String(Math.floor(rng() * 9000000000) + 1000000000)}`,
      PrimaryContactURL: '',
      AddressDescription: 'Primary',
      AddressCity: pick(rng, ['New York', 'Chicago', 'Dallas', 'Seattle', 'Atlanta', 'Denver']),
      AddressState: pick(rng, ['NY', 'IL', 'TX', 'WA', 'GA', 'CO']),
      AddressZipCode: String(10000 + Math.floor(rng() * 90000)),
      AddressCountryRegionId: 'US',
      AddressStreet: `${Math.floor(rng() * 999) + 1} ${pick(rng, ['Main', 'Oak', 'Elm', 'Park', 'Commerce'])} St`,
      IsSalesTaxIncludedInPrice: 'No',
      OnHoldStatus: pick(rng, ['No', 'Invoice', 'All', 'Payment']),
      IsOneTimeCustomer: 'No',
    };
  },
  VendorsV2(rng, id) {
    return {
      VendorAccountNumber: `VEND${String(10000 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      VendorGroupId: `VG${String(100 + (id % 15)).slice(1)}`,
      VendorOrganizationName: pick(rng, COMPANIES),
      VendorPartyNumber: `PARTY${String(30000 + id).slice(1)}`,
      VendorPartyType: 'Organization',
      DefaultPaymentTermsName: `Net${pick(rng, ['30', '45', '60', '90'])}`,
      PaymentMethodName: pick(rng, ['CHECK', 'WIRE', 'ACH']),
      CurrencyCode: pick(rng, D365_CURRENCIES),
      SalesTaxGroupCode: pick(rng, ['TAXABLE', 'EXEMPT']),
      DefaultDimensionDisplayValue: `CC-${Math.floor(rng() * 30) + 1}`,
      PrimaryContactEmail: `ap@${pick(rng, DOMAINS)}`,
      PrimaryContactPhone: `+1${String(Math.floor(rng() * 9000000000) + 1000000000)}`,
      PrimaryContactURL: '',
      AddressDescription: 'Primary',
      AddressCity: pick(rng, ['New York', 'Chicago', 'Dallas', 'Seattle']),
      AddressState: pick(rng, ['NY', 'IL', 'TX', 'WA']),
      AddressZipCode: String(10000 + Math.floor(rng() * 90000)),
      AddressCountryRegionId: 'US',
      AddressStreet: `${Math.floor(rng() * 999) + 1} Industrial Ave`,
      OnHoldStatus: 'No',
      IsOnHold: 'No',
      DUNSNumber: String(Math.floor(rng() * 900000000) + 100000000),
    };
  },

  // ---- Products & Inventory ----
  ReleasedProductsV2(rng, id) {
    const pType = pick(rng, ['Item', 'Service']);
    return {
      ItemNumber: `ITEM${String(10000 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      ProductNumber: `PROD${String(10000 + id).slice(1)}`,
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${id}`,
      SearchName: `${pick(rng, D365_PRODUCT_NAMES)} ${id}`.toUpperCase(),
      ProductType: pType,
      ProductSubType: pick(rng, ['Product', 'ProductMaster']),
      ItemModelGroupId: pick(rng, ['FIFO', 'STD', 'AVG']),
      ItemGroupId: `IG${Math.floor(rng() * 10) + 1}`,
      StorageDimensionGroupName: pick(rng, ['SiteWH', 'Site']),
      TrackingDimensionGroupName: pick(rng, ['None', 'Batch', 'Serial']),
      InventoryUnitSymbol: pick(rng, ['ea', 'pcs', 'kg', 'box']),
      SalesUnitSymbol: pick(rng, ['ea', 'pcs', 'kg', 'box']),
      PurchaseUnitSymbol: pick(rng, ['ea', 'pcs', 'kg', 'box']),
      SalesPrice: Math.round(rng() * 50000 + 100) / 100,
      PurchasePrice: Math.round(rng() * 30000 + 50) / 100,
      CostPrice: Math.round(rng() * 20000 + 25) / 100,
      SalesTaxItemGroupId: pick(rng, ['FULL', 'REDUCED', 'EXEMPT']),
      PurchaseTaxItemGroupId: pick(rng, ['FULL', 'REDUCED', 'EXEMPT']),
      DefaultOrderType: pick(rng, ['Sales', 'Purchase', 'Inventory']),
      IsSalesWithdrawnFromMarket: 'No',
      IsPurchaseStopped: 'No',
      IsStockedProduct: pType === 'Item' ? 'Yes' : 'No',
    };
  },
  InventoryWarehouses(rng, id) {
    const siteId = `SITE${Math.floor(id / 3) + 1}`;
    return {
      WarehouseId: `WH${String(10 + id).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      WarehouseName: `Warehouse ${pick(rng, ['Main', 'Central', 'East', 'West', 'North', 'South'])} ${id}`,
      InventorySiteId: siteId,
      OperationalSiteName: `Site ${siteId}`,
      AddressCity: pick(rng, ['New York', 'Chicago', 'Dallas', 'Seattle']),
      AddressState: pick(rng, ['NY', 'IL', 'TX', 'WA']),
      AddressZipCode: String(10000 + Math.floor(rng() * 90000)),
      AddressCountryRegionId: 'US',
      AddressStreet: `${Math.floor(rng() * 999) + 1} Warehouse Rd`,
      IsWMSEnabled: rng() > 0.5 ? 'Yes' : 'No',
      IsPrimaryAddressAssigned: 'Yes',
    };
  },
  InventoryOnhandEntries(rng, id) {
    const avail = Math.floor(rng() * 10000);
    const onOrder = Math.floor(rng() * 500);
    const reserved = Math.floor(rng() * Math.min(200, avail));
    return {
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      InventorySiteId: `SITE${Math.floor(id / 10) + 1}`,
      WarehouseId: `WH${String(10 + (id % 8)).slice(1)}`,
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${(id % 50) + 1}`,
      AvailableOnHandQuantity: avail - reserved,
      OnHandQuantity: avail,
      OnOrderQuantity: onOrder,
      OrderedQuantity: Math.floor(rng() * 300),
      ReservedOnHandQuantity: reserved,
      ReservedOrderedQuantity: Math.floor(rng() * 50),
      TotalAvailableQuantity: avail - reserved + onOrder,
      UnitOfMeasure: pick(rng, ['ea', 'pcs', 'kg']),
    };
  },

  // ---- Sales Orders ----
  SalesOrderHeadersV2(rng, id) {
    const area = pick(rng, DATA_AREAS);
    const custId = `CUST${String(10000 + (id % 50) + 1).slice(1)}`;
    return {
      SalesOrderNumber: `SO${String(100000 + id)}`,
      dataAreaId: area,
      SalesOrderStatus: pick(rng, ['Open', 'Confirmed', 'Picked', 'PartiallyDelivered', 'Invoiced', 'Cancelled']),
      SalesOrderName: `Sales Order ${id}`,
      OrderingCustomerAccountNumber: custId,
      InvoiceCustomerAccountNumber: custId,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      TotalDiscountAmount: Math.round(rng() * 5000) / 100,
      TotalChargeAmount: Math.round(rng() * 2000) / 100,
      TotalTaxAmount: Math.round(rng() * 8000) / 100,
      TotalInvoicedAmount: Math.round(rng() * 100000 + 100) / 100,
      OrderCreatedDateTime: randomDate(rng, 2023, 2025),
      RequestedShippingDate: randomDate(rng, 2024, 2025),
      ConfirmedShippingDate: rng() > 0.3 ? randomDate(rng, 2024, 2025) : null,
      RequestedReceiptDate: randomDate(rng, 2024, 2025),
      ConfirmedReceiptDate: rng() > 0.5 ? randomDate(rng, 2024, 2025) : null,
      DeliveryTermsCode: pick(rng, ['FOB', 'CIF', 'EXW', 'DDP']),
      DeliveryModeCode: pick(rng, ['GROUND', 'AIR', 'SEA', 'RAIL']),
      PaymentTermsName: `Net${pick(rng, ['30', '60', '90'])}`,
      SalesOrderPoolId: '',
      DefaultDimensionDisplayValue: `BU-${Math.floor(rng() * 10) + 1}`,
      DeliveryAddressCity: pick(rng, ['New York', 'Chicago', 'Dallas', 'Seattle']),
      DeliveryAddressState: pick(rng, ['NY', 'IL', 'TX', 'WA']),
      DeliveryAddressZipCode: String(10000 + Math.floor(rng() * 90000)),
      DeliveryAddressCountryRegionId: 'US',
      DeliveryAddressStreet: `${Math.floor(rng() * 999) + 1} Delivery Ln`,
      SalesOrderPromisingMethod: pick(rng, ['None', 'ATP', 'CTP']),
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  SalesOrderLines(rng, id) {
    const soNum = `SO${String(100000 + Math.floor(id / 3) + 1)}`;
    const lineNum = (id % 3) + 1;
    const qty = Math.floor(rng() * 100) + 1;
    const price = Math.round(rng() * 10000 + 10) / 100;
    return {
      SalesOrderNumber: soNum,
      SalesOrderLineNumber: lineNum,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${(id % 50) + 1}`,
      OrderedSalesQuantity: qty,
      SalesUnitSymbol: pick(rng, ['ea', 'pcs', 'kg']),
      SalesPrice: price,
      LineAmount: Math.round(qty * price * 100) / 100,
      LineDiscountAmount: Math.round(rng() * 500) / 100,
      LineDiscountPercentage: Math.round(rng() * 2000) / 100,
      SalesTaxAmount: Math.round(qty * price * 0.08 * 100) / 100,
      ShippingSiteId: `SITE${Math.floor(rng() * 3) + 1}`,
      ShippingWarehouseId: `WH${String(10 + Math.floor(rng() * 5)).slice(1)}`,
      DeliveryAddressCity: pick(rng, ['New York', 'Chicago', 'Dallas']),
      DeliveryAddressCountryRegionId: 'US',
      RequestedShippingDate: randomDate(rng, 2024, 2025),
      ConfirmedShippingDate: rng() > 0.3 ? randomDate(rng, 2024, 2025) : null,
      SalesOrderLineStatus: pick(rng, ['Open', 'Delivered', 'Invoiced', 'Cancelled']),
      DefaultDimensionDisplayValue: '',
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },

  // ---- Purchase Orders ----
  PurchaseOrderHeadersV2(rng, id) {
    return {
      PurchaseOrderNumber: `PO${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      PurchaseOrderStatus: pick(rng, ['Draft', 'Confirmed', 'Received', 'Invoiced']),
      PurchaseOrderName: `Purchase Order ${id}`,
      OrderVendorAccountNumber: `VEND${String(10000 + (id % 30) + 1).slice(1)}`,
      InvoiceVendorAccountNumber: `VEND${String(10000 + (id % 30) + 1).slice(1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      TotalDiscountAmount: Math.round(rng() * 3000) / 100,
      TotalChargeAmount: Math.round(rng() * 1500) / 100,
      TotalTaxAmount: Math.round(rng() * 6000) / 100,
      OrderCreatedDateTime: randomDate(rng, 2023, 2025),
      RequestedDeliveryDate: randomDate(rng, 2024, 2025),
      ConfirmedDeliveryDate: rng() > 0.4 ? randomDate(rng, 2024, 2025) : null,
      DeliveryTermsCode: pick(rng, ['FOB', 'CIF', 'EXW']),
      DeliveryModeCode: pick(rng, ['GROUND', 'AIR', 'SEA']),
      PaymentTermsName: `Net${pick(rng, ['30', '45', '60'])}`,
      DefaultDimensionDisplayValue: `CC-${Math.floor(rng() * 20) + 1}`,
      DeliveryAddressCity: pick(rng, ['New York', 'Chicago', 'Dallas']),
      DeliveryAddressState: pick(rng, ['NY', 'IL', 'TX']),
      DeliveryAddressCountryRegionId: 'US',
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  PurchaseOrderLines(rng, id) {
    const qty = Math.floor(rng() * 200) + 1;
    const price = Math.round(rng() * 5000 + 5) / 100;
    return {
      PurchaseOrderNumber: `PO${String(100000 + Math.floor(id / 3) + 1)}`,
      PurchaseOrderLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${(id % 50) + 1}`,
      PurchaseQuantity: qty,
      PurchaseUnitSymbol: pick(rng, ['ea', 'pcs', 'kg']),
      PurchasePrice: price,
      LineAmount: Math.round(qty * price * 100) / 100,
      LineDiscountAmount: Math.round(rng() * 200) / 100,
      LineDiscountPercentage: Math.round(rng() * 1000) / 100,
      PurchaseOrderLineStatus: pick(rng, ['Open', 'Received', 'Invoiced']),
      ReceivingSiteId: `SITE${Math.floor(rng() * 3) + 1}`,
      ReceivingWarehouseId: `WH${String(10 + Math.floor(rng() * 5)).slice(1)}`,
      RequestedDeliveryDate: randomDate(rng, 2024, 2025),
      ConfirmedDeliveryDate: rng() > 0.4 ? randomDate(rng, 2024, 2025) : null,
      DefaultDimensionDisplayValue: '',
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },

  // ---- Customer Invoices ----
  CustomerInvoiceHeaders(rng, id) {
    return {
      InvoiceId: `CI${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      InvoiceDate: randomDate(rng, 2023, 2025),
      InvoiceCustomerAccountNumber: `CUST${String(10000 + (id % 50) + 1).slice(1)}`,
      SalesOrderNumber: `SO${String(100000 + (id % 80) + 1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      InvoiceAmount: Math.round(rng() * 80000 + 100) / 100,
      TotalTaxAmount: Math.round(rng() * 6000) / 100,
      TotalDiscountAmount: Math.round(rng() * 3000) / 100,
      TotalChargeAmount: Math.round(rng() * 1000) / 100,
      DueDate: randomDate(rng, 2024, 2026),
      PaymentTermsName: `Net${pick(rng, ['30', '60', '90'])}`,
      DeliveryTermsCode: pick(rng, ['FOB', 'CIF']),
      DeliveryModeCode: pick(rng, ['GROUND', 'AIR']),
      InvoiceAddressCity: pick(rng, ['New York', 'Chicago', 'Dallas']),
      InvoiceAddressState: pick(rng, ['NY', 'IL', 'TX']),
      InvoiceAddressZipCode: String(10000 + Math.floor(rng() * 90000)),
      InvoiceAddressCountryRegionId: 'US',
      DefaultDimensionDisplayValue: '',
    };
  },
  CustomerInvoiceLines(rng, id) {
    const qty = Math.floor(rng() * 50) + 1;
    const price = Math.round(rng() * 5000 + 10) / 100;
    return {
      InvoiceId: `CI${String(100000 + Math.floor(id / 3) + 1)}`,
      InvoiceLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${(id % 50) + 1}`,
      InvoicedQuantity: qty,
      SalesUnitSymbol: pick(rng, ['ea', 'pcs', 'kg']),
      SalesPrice: price,
      LineAmount: Math.round(qty * price * 100) / 100,
      LineDiscountAmount: Math.round(rng() * 200) / 100,
      SalesTaxAmount: Math.round(qty * price * 0.08 * 100) / 100,
      SalesOrderNumber: `SO${String(100000 + (Math.floor(id / 3) % 80) + 1)}`,
      SalesOrderLineNumber: (id % 3) + 1,
      DefaultDimensionDisplayValue: '',
    };
  },

  // ---- Vendor Invoices ----
  VendorInvoiceHeaders(rng, id) {
    return {
      HeaderReference: `VI${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      InvoiceNumber: `VINV${String(200000 + id)}`,
      InvoiceDate: randomDate(rng, 2023, 2025),
      VendorAccountNumber: `VEND${String(10000 + (id % 30) + 1).slice(1)}`,
      VendorName: pick(rng, COMPANIES),
      PurchaseOrderNumber: `PO${String(100000 + (id % 60) + 1)}`,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      InvoiceTotalAmount: Math.round(rng() * 60000 + 50) / 100,
      TotalTaxAmount: Math.round(rng() * 5000) / 100,
      TotalChargeAmount: Math.round(rng() * 1000) / 100,
      DueDate: randomDate(rng, 2024, 2026),
      PaymentTermsName: `Net${pick(rng, ['30', '45', '60'])}`,
      ApprovalStatus: pick(rng, ['Draft', 'Approved', 'Rejected', 'InReview']),
      DefaultDimensionDisplayValue: '',
      ModifiedDateTime: randomDate(rng, 2024, 2025),
    };
  },
  VendorInvoiceLines(rng, id) {
    const qty = Math.floor(rng() * 100) + 1;
    const price = Math.round(rng() * 3000 + 5) / 100;
    return {
      HeaderReference: `VI${String(100000 + Math.floor(id / 3) + 1)}`,
      InvoiceLineNumber: (id % 3) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      ItemNumber: `ITEM${String(10000 + (id % 50) + 1).slice(1)}`,
      ProductName: `${pick(rng, D365_PRODUCT_NAMES)} ${(id % 50) + 1}`,
      ReceiveQuantity: qty,
      PurchaseUnitSymbol: pick(rng, ['ea', 'pcs', 'kg']),
      PurchasePrice: price,
      LineAmount: Math.round(qty * price * 100) / 100,
      PurchaseOrderNumber: `PO${String(100000 + (Math.floor(id / 3) % 60) + 1)}`,
      PurchaseOrderLineNumber: (id % 3) + 1,
      DefaultDimensionDisplayValue: '',
    };
  },

  // ---- General Ledger ----
  LedgerJournalHeaders(rng, id) {
    const jType = pick(rng, D365_JOURNAL_TYPES);
    return {
      JournalBatchNumber: `JRN${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      JournalName: `${jType}Journal`,
      Description: `${jType} journal entry ${id}`,
      JournalType: jType,
      PostedDateTime: randomDate(rng, 2023, 2025),
      IsPosted: rng() > 0.3 ? 'Yes' : 'No',
      CurrentVoucherNumber: `V${String(300000 + id)}`,
      DefaultDimensionDisplayValue: '',
    };
  },
  LedgerJournalLines(rng, id) {
    const mainAcct = `${String(100000 + (id % 30) * 10)}`;
    return {
      JournalBatchNumber: `JRN${String(100000 + Math.floor(id / 4) + 1)}`,
      LineNumber: (id % 4) + 1,
      dataAreaId: pick(rng, DATA_AREAS),
      AccountDisplayValue: `${mainAcct}-DEPT-${Math.floor(rng() * 10) + 1}`,
      OffsetAccountDisplayValue: `${String(100000 + ((id + 15) % 30) * 10)}-DEPT-${Math.floor(rng() * 10) + 1}`,
      AccountType: pick(rng, ['Ledger', 'Customer', 'Vendor', 'Bank']),
      OffsetAccountType: 'Ledger',
      DebitAmount: rng() > 0.5 ? Math.round(rng() * 50000) / 100 : 0,
      CreditAmount: rng() > 0.5 ? Math.round(rng() * 50000) / 100 : 0,
      CurrencyCode: pick(rng, D365_CURRENCIES),
      TransactionDate: randomDate(rng, 2023, 2025),
      Voucher: `V${String(300000 + Math.floor(id / 4) + 1)}`,
      Description: `Journal line ${id}`,
      DocumentNumber: `DOC${String(400000 + id)}`,
      DefaultDimensionDisplayValue: '',
    };
  },
  GeneralJournalEntries(rng, id) {
    return {
      JournalNumber: `GJ${String(100000 + id)}`,
      dataAreaId: pick(rng, DATA_AREAS),
      JournalEntryId: `JE${String(500000 + id)}`,
      PostingDate: randomDate(rng, 2023, 2025),
      DocumentDate: randomDate(rng, 2023, 2025),
      DocumentNumber: `DOC${String(200000 + id)}`,
      FiscalCalendarYear: String(2023 + Math.floor(rng() * 3)),
      FiscalCalendarPeriod: String(Math.floor(rng() * 12) + 1),
      LedgerName: 'General',
      CreatedDateTime: randomDate(rng, 2023, 2025),
      PostingType: pick(rng, ['Revenue', 'Expense', 'Balance', 'InterCompany']),
      SubledgerVoucher: `SV${String(600000 + id)}`,
    };
  },
  GeneralJournalAccountEntries(rng, id) {
    const amt = Math.round(rng() * 80000 - 40000) / 100;
    const isCredit = amt < 0;
    return {
      GeneralJournalAccountEntryRecId: id,
      JournalNumber: `GJ${String(100000 + Math.floor(id / 3) + 1)}`,
      MainAccountId: `${String(100000 + (id % 30) * 10)}`,
      MainAccountName: `${pick(rng, D365_ACCOUNT_TYPES)} Account ${(id % 30) + 1}`,
      AccountingCurrencyAmount: Math.abs(amt),
      ReportingCurrencyAmount: Math.round(Math.abs(amt) * (0.9 + rng() * 0.2) * 100) / 100,
      TransactionCurrencyAmount: Math.abs(amt),
      TransactionCurrencyCode: pick(rng, D365_CURRENCIES),
      IsCredit: isCredit ? 'Yes' : 'No',
      PostingDate: randomDate(rng, 2023, 2025),
      DocumentDate: randomDate(rng, 2023, 2025),
      DocumentNumber: `DOC${String(200000 + Math.floor(id / 3) + 1)}`,
      Description: `Account entry ${id}`,
      PostingType: pick(rng, ['Revenue', 'Expense', 'Balance']),
      LedgerDimensionDisplayValue: `${String(100000 + (id % 30) * 10)}-BU-${Math.floor(rng() * 10) + 1}`,
      DefaultDimensionDisplayValue: '',
      dataAreaId: pick(rng, DATA_AREAS),
    };
  },
};

const D365_ENTITY_SETS = Object.keys(D365_GENERATORS);
const D365_RECORDS_PER_ENTITY = 50;

// ---------------------------------------------------------------------------
// D365 Entity Set Property Definitions (for $metadata generation)
// ---------------------------------------------------------------------------
function inferEdmType(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Edm.Int64' : 'Edm.Decimal';
  }
  if (typeof value === 'boolean') return 'Edm.Boolean';
  if (typeof value === 'string') {
    // ISO date-like strings
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'Edm.DateTimeOffset';
    return 'Edm.String';
  }
  return 'Edm.String';
}

/** Build EDMX $metadata XML from generator sample records. */
function buildMetadataXml(baseUrl) {
  const namespace = 'Microsoft.Dynamics.DataEntities';
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">',
    '  <edmx:DataServices>',
    `    <Schema Namespace="${namespace}" xmlns="http://docs.oasis-open.org/odata/ns/edm">`,
  ];

  // Generate EntityType definitions
  for (const entitySetName of D365_ENTITY_SETS) {
    const gen = D365_GENERATORS[entitySetName];
    const rng = createSeededRNG(hashString('meta_' + entitySetName));
    const sample = gen(rng, 1);
    const props = Object.keys(sample);

    lines.push(`      <EntityType Name="${entitySetName}">`);
    // First property as key (simplified)
    lines.push(`        <Key>`);
    lines.push(`          <PropertyRef Name="${props[0]}"/>`);
    lines.push(`        </Key>`);

    for (const prop of props) {
      const edmType = inferEdmType(sample[prop]);
      lines.push(`        <Property Name="${prop}" Type="${edmType}"/>`);
    }
    lines.push(`      </EntityType>`);
  }

  // EntityContainer
  lines.push(`      <EntityContainer Name="DataServiceContainer">`);
  for (const entitySetName of D365_ENTITY_SETS) {
    lines.push(`        <EntitySet Name="${entitySetName}" EntityType="${namespace}.${entitySetName}"/>`);
  }
  lines.push(`      </EntityContainer>`);

  lines.push('    </Schema>');
  lines.push('  </edmx:DataServices>');
  lines.push('</edmx:Edmx>');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// OData $filter Parser (matches Microsoft D365 F&O spec)
// Supports: eq, ne, gt, ge, lt, le, and, or, contains()
// ---------------------------------------------------------------------------
function parseODataFilter(filterStr, records) {
  if (!filterStr || !filterStr.trim()) return records;

  // Split on ' and ' / ' or ' (respecting OData precedence)
  // For simplicity, we handle the common patterns the tap uses
  const conditions = [];
  const connectors = [];

  // Split by ' and ' and ' or '
  const parts = filterStr.split(/\s+(and|or)\s+/i);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      conditions.push(parts[i].trim());
    } else {
      connectors.push(parts[i].toLowerCase());
    }
  }

  function evaluateCondition(record, condition) {
    // contains(field, 'value') — D365 wildcard filter
    const containsMatch = condition.match(/contains\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)/i);
    if (containsMatch) {
      const [, field, value] = containsMatch;
      const fieldVal = String(record[field] || '').toLowerCase();
      return fieldVal.includes(value.toLowerCase());
    }

    // field eq '*value*' — D365 wildcard via eq with asterisks
    const wildcardMatch = condition.match(/(\w+)\s+eq\s+'?\*([^*']*)\*'?/i);
    if (wildcardMatch) {
      const [, field, value] = wildcardMatch;
      const fieldVal = String(record[field] || '').toLowerCase();
      return fieldVal.includes(value.toLowerCase());
    }

    // Standard comparison: field op value
    const compMatch = condition.match(/(\w+)\s+(eq|ne|gt|ge|lt|le)\s+'?([^']*)'?/i);
    if (!compMatch) return true; // unknown filter, include record

    const [, field, op, value] = compMatch;
    const fieldVal = record[field];
    if (fieldVal === undefined || fieldVal === null) {
      // Records without the field: include for ge/le/eq comparisons, exclude for gt/lt
      return op === 'ge' || op === 'le' || op === 'ne';
    }

    const strFieldVal = String(fieldVal);
    const strValue = value.replace(/^'|'$/g, ''); // strip quotes

    switch (op.toLowerCase()) {
      case 'eq': return strFieldVal === strValue;
      case 'ne': return strFieldVal !== strValue;
      case 'ge': return strFieldVal >= strValue;
      case 'gt': return strFieldVal > strValue;
      case 'le': return strFieldVal <= strValue;
      case 'lt': return strFieldVal < strValue;
      default: return true;
    }
  }

  return records.filter(record => {
    if (conditions.length === 0) return true;

    let result = evaluateCondition(record, conditions[0]);
    for (let i = 0; i < connectors.length; i++) {
      const nextResult = evaluateCondition(record, conditions[i + 1]);
      if (connectors[i] === 'and') {
        result = result && nextResult;
      } else {
        result = result || nextResult;
      }
    }
    return result;
  });
}

/** Apply $select to a set of records, returning only requested properties. */
function applyODataSelect(records, selectStr) {
  if (!selectStr) return records;
  const fields = selectStr.split(',').map(f => f.trim()).filter(Boolean);
  if (fields.length === 0) return records;
  return records.map(record => {
    const selected = {};
    for (const f of fields) {
      if (f in record) selected[f] = record[f];
    }
    return selected;
  });
}

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
// Error format matches Microsoft D365 F&O: { error: { code, message, innererror? } }
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

  res.set('OData-Version', '4.0');
  res.set('Content-Type', 'application/json; odata.metadata=minimal');
  return res.status(401).json({
    error: {
      code: '',
      message: 'Bearer token is missing or invalid. Obtain a token via POST to the OAuth2 token endpoint using client_credentials grant.',
      innererror: {
        message: 'Authorization header must contain a valid Bearer token.',
        type: 'Microsoft.Dynamics.Platform.Integration.Framework.AuthorizationException',
        stacktrace: '',
      },
    },
  });
}

// Standard D365 OData headers middleware
function setODataHeaders(req, res, next) {
  res.set('OData-Version', '4.0');
  res.set('Content-Type', 'application/json; odata.metadata=minimal; charset=utf-8');
  next();
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
      grant_type: 'client_credentials',
      scope: 'https://mock.dynamics.com/.default',
    },
    d365_odata: {
      service_root: `${baseUrl}/data`,
      metadata_url: `${baseUrl}/data/$metadata`,
      entity_sets_url: `${baseUrl}/data`,
      supported_query_options: ['$filter', '$select', '$orderby', '$top', '$skip', '$count', '$expand'],
      filter_operators: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'and', 'or', 'contains()'],
      max_page_size: 10000,
      cross_company: 'Append ?cross-company=true to query across all data areas',
      single_entity: '/data/EntitySet(\'key\') — Single entity by key',
      headers: {
        'OData-Version': '4.0',
        'Accept': 'application/json',
        'Prefer': 'odata.maxpagesize=10000',
        'Authorization': 'Bearer <access_token>',
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

// POST /api/mock/oauth2/token — OAuth2 token exchange (works for both REST and D365)
// Matches Azure AD v2.0 token endpoint format:
//   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
// Body: application/x-www-form-urlencoded
//   grant_type=client_credentials&client_id=...&client_secret=...&scope=...
router.post('/oauth2/token', (req, res) => {
  const { client_id, client_secret, grant_type, scope } = req.body || {};

  if (grant_type !== 'client_credentials') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: `The provided value for the input parameter 'grant_type' is not valid. Expected value: client_credentials.`,
      error_codes: [70003],
      timestamp: new Date().toISOString(),
      trace_id: 'mock-trace-' + Date.now(),
      correlation_id: 'mock-correlation-' + Date.now(),
    });
  }

  // Accept both REST and D365 credentials
  if ((client_id === CREDENTIALS.oauth2.client_id && client_secret === CREDENTIALS.oauth2.client_secret) ||
      (client_id === D365_CREDENTIALS.client_id && client_secret === D365_CREDENTIALS.client_secret)) {
    const token = client_id === D365_CREDENTIALS.client_id
      ? D365_CREDENTIALS.access_token
      : CREDENTIALS.oauth2.access_token;
    // Azure AD v2.0 response format
    return res.json({
      token_type: 'Bearer',
      expires_in: 3600,
      ext_expires_in: 3600,
      access_token: token,
    });
  }

  // Azure AD error format
  return res.status(401).json({
    error: 'invalid_client',
    error_description: `AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID.`,
    error_codes: [7000215],
    timestamp: new Date().toISOString(),
    trace_id: 'mock-trace-' + Date.now(),
    correlation_id: 'mock-correlation-' + Date.now(),
    error_uri: 'https://login.microsoftonline.com/error?code=7000215',
    hint: `For REST: client_id="${CREDENTIALS.oauth2.client_id}", client_secret="${CREDENTIALS.oauth2.client_secret}". For D365: client_id="${D365_CREDENTIALS.client_id}", client_secret="${D365_CREDENTIALS.client_secret}"`,
  });
});

// ---------------------------------------------------------------------------
// Routes — D365 OData Mock (under /api/mock/data)
// Fully compliant with Microsoft D365 F&O OData v4 spec:
//   - /data              → Service document
//   - /data/$metadata    → EDMX metadata XML
//   - /data/:entitySet   → Entity collection with $filter, $select, $orderby,
//                          $top, $skip, $count, cross-company, @odata.nextLink
//   - /data/:entitySet(key) → Single entity by key
// See: https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/odata
// ---------------------------------------------------------------------------

// GET /api/mock/data/$metadata — OData EDMX metadata document (XML)
// Express decodes %24 → $, so the :entitySet route would catch it.
// Use a middleware-style match that handles both literal $ and the URL-decoded form.
router.get('/data/:segment', (req, res, next) => {
  if (req.params.segment !== '$metadata') return next();
  // $metadata endpoint — skip to handler below
  return validateD365Auth(req, res, () => {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/mock/data`;
    const xml = buildMetadataXml(baseUrl);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('OData-Version', '4.0');
    res.send(xml);
  });
});

// GET /api/mock/data — OData service document (entity set listing)
// Per OData v4 spec, service root returns JSON list of entity sets
router.get('/data', validateD365Auth, setODataHeaders, applyDelay, (req, res) => {
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

// GET /api/mock/data/:entitySet — OData entity collection
// Supports: $filter, $select, $orderby, $top, $skip, $count,
//           cross-company=true, Prefer: odata.maxpagesize
router.get('/data/:entitySet', validateD365Auth, setODataHeaders, applyDelay, (req, res) => {
  const { entitySet } = req.params;

  // Handle single-entity key addressing: EntitySet('key') or EntitySet(key)
  const keyMatch = entitySet.match(/^(\w+)\((?:'([^']*)'|(\d+))\)$/);
  if (keyMatch) {
    const realEntitySet = keyMatch[1];
    const keyValue = keyMatch[2] || keyMatch[3];
    const records = getD365Dataset(realEntitySet);
    if (!records) {
      return res.status(404).json({
        error: {
          code: 'EntitySetNotFound',
          message: `The resource '${realEntitySet}' does not exist.`,
          innererror: { type: 'Microsoft.Dynamics.Platform.Integration.Framework.ResourceNotFoundException' },
        },
      });
    }
    // Find record by first property (key)
    const props = Object.keys(records[0] || {});
    const record = records.find(r => String(r[props[0]]) === keyValue);
    if (!record) {
      return res.status(404).json({
        error: {
          code: 'ResourceNotFound',
          message: `No entity with key '${keyValue}' found in ${realEntitySet}.`,
        },
      });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}/api/mock/data`;
    return res.json({
      '@odata.context': `${baseUrl}/$metadata#${realEntitySet}/$entity`,
      ...record,
    });
  }

  const records = getD365Dataset(entitySet);
  if (!records) {
    return res.status(404).json({
      error: {
        code: '',
        message: `An error has occurred. The entity '${entitySet}' was not found in the EntityContainer.`,
        innererror: {
          message: `An error has occurred. The entity '${entitySet}' was not found in the EntityContainer.`,
          type: 'Microsoft.OData.ODataException',
          stacktrace: '',
        },
      },
    });
  }

  // Apply OData $filter (supports eq, ne, ge, gt, le, lt, and, or, contains)
  let filtered = parseODataFilter(req.query.$filter, records);

  // Apply OData $orderby
  if (req.query.$orderby) {
    const orderParts = req.query.$orderby.split(',');
    filtered = [...filtered].sort((a, b) => {
      for (const part of orderParts) {
        const [field, dir] = part.trim().split(/\s+/);
        const mult = (dir || '').toLowerCase() === 'desc' ? -1 : 1;
        if (a[field] < b[field]) return -1 * mult;
        if (a[field] > b[field]) return 1 * mult;
      }
      return 0;
    });
  }

  // OData $count — include count in response
  const includeCount = req.query.$count === 'true';

  // OData pagination via $skip/$top or Prefer: odata.maxpagesize
  // D365 max page size is 10,000 per Microsoft spec
  const prefer = req.headers.prefer || '';
  const maxPageMatch = prefer.match(/odata\.maxpagesize=(\d+)/i);
  const defaultTop = maxPageMatch ? Math.min(parseInt(maxPageMatch[1]), 10000) : 25;

  const skip = Math.max(parseInt(req.query.$skip) || 0, 0);
  const top = Math.min(parseInt(req.query.$top) || defaultTop, 10000);
  const page = filtered.slice(skip, skip + top);
  const nextSkip = skip + top;

  // Apply $select (limit returned properties)
  const selectedPage = applyODataSelect(page, req.query.$select);

  const baseUrl = `${req.protocol}://${req.get('host')}/api/mock/data`;
  const body = {
    '@odata.context': `${baseUrl}/$metadata#${entitySet}`,
  };

  // Add @odata.count if requested
  if (includeCount) {
    body['@odata.count'] = filtered.length;
  }

  body.value = selectedPage;

  // Build @odata.nextLink preserving all query params
  if (nextSkip < filtered.length) {
    const nextParams = new URLSearchParams();
    nextParams.set('$skip', String(nextSkip));
    nextParams.set('$top', String(top));
    if (req.query['cross-company'] === 'true') nextParams.set('cross-company', 'true');
    if (req.query.$filter) nextParams.set('$filter', req.query.$filter);
    if (req.query.$orderby) nextParams.set('$orderby', req.query.$orderby);
    if (req.query.$select) nextParams.set('$select', req.query.$select);
    if (req.query.$count) nextParams.set('$count', req.query.$count);
    body['@odata.nextLink'] = `${baseUrl}/${entitySet}?${nextParams.toString()}`;
  }

  // Set Preference-Applied header (per OData spec)
  if (maxPageMatch) {
    res.set('Preference-Applied', `odata.maxpagesize=${top}`);
  }

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
