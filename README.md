# Singer Tap Config Builder

A self-contained Docker platform for building, testing, and running [Singer.io](https://www.singer.io/) taps with a modern web UI. Includes built-in mock APIs, OData v4 support, and multiple target destinations.

![Qlik](https://img.shields.io/badge/Qlik-008936?style=flat&logo=qlik&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Singer.io](https://img.shields.io/badge/Singer.io-4A90D9?style=flat)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)

---

## Features

### Web UI
- **Modern React interface** with Linear/Vercel-inspired aesthetic and Qlik branding
- **Connector Templates** — pre-built configurations for REST API, OData v4, and Dynamics 365
- **Visual Config Builder** — forms for connection, authentication, pagination, streams, and bookmarks
- **Run Taps** — discover schemas and sync records directly from the UI
- **Run History** — view past sync results with record counts, stream details, and logs
- **JSON Preview** — real-time preview of the generated Singer config

### Singer Taps
| Tap | Description |
|-----|-------------|
| `tap-rest-api-generic` | Generic REST API tap supporting any JSON endpoint |
| `tap-dynamics365-erp` | Dynamics 365 Finance & Operations OData v4 tap |

### Target Destinations
| Target | Description |
|--------|-------------|
| **CSV Files** | Write records to CSV files (`/app/output`) |
| **JSON Lines** | Write records to JSONL files (`/app/output`) |
| **Confluent Kafka** | Produce records to Kafka topics (one topic per stream) |

### Mock API Server
Built-in mock endpoints for development and testing — no external services required.

#### Generic REST API (6 datasets)
| Endpoint | Records | Auth |
|----------|---------|------|
| `/api/mock/contacts` | 25 | API Key, Bearer, Basic, OAuth2 |
| `/api/mock/orders` | 25 | API Key, Bearer, Basic, OAuth2 |
| `/api/mock/products` | 25 | API Key, Bearer, Basic, OAuth2 |
| `/api/mock/events` | 25 | API Key, Bearer, Basic, OAuth2 |
| `/api/mock/users` | 25 | API Key, Bearer, Basic, OAuth2 |
| `/api/mock/invoices` | 25 | API Key, Bearer, Basic, OAuth2 |

#### Dynamics 365 OData v4 Mock (21 entity sets)
Full OData v4 compliance with realistic D365 F&O data:

| Category | Entity Sets |
|----------|-------------|
| **Reference Data** | LegalEntities, CustomerGroups, VendorGroups, MainAccounts |
| **Customers & Vendors** | CustomersV3, VendorsV2 |
| **Products & Inventory** | ReleasedProductsV2, InventoryWarehouses, InventoryOnhandEntries |
| **Sales** | SalesOrderHeadersV2, SalesOrderLines |
| **Purchasing** | PurchaseOrderHeadersV2, PurchaseOrderLines |
| **Invoicing** | CustomerInvoiceHeaders/Lines, VendorInvoiceHeaders/Lines |
| **General Ledger** | LedgerJournalHeaders/Lines, GeneralJournalEntries, GeneralJournalAccountEntries |

**OData v4 features:** `$metadata` EDMX, `$filter`, `$select`, `$orderby`, `$top/$skip`, `$count`, `@odata.nextLink` pagination, `cross-company` queries, `Prefer: odata.maxpagesize`

### Auto-Seed Demo Configs
Three demo tap configurations are automatically seeded on first startup:
1. **Mock API (Testing)** — all 6 REST datasets
2. **D365 F&O OData v4 Mock (Testing)** — all 21 entity sets
3. **RandomUser.me REST API** — live external API

### Health Endpoint
```
GET /health        # or /api/health
```
Returns server status, uptime, database health, config count, and target availability.

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Build & Run
```bash
docker build -t singer-tap .
docker run -d -p 9090:9090 --name singer-tap singer-tap
```

### Access
- **Web UI:** [http://localhost:9090](http://localhost:9090)
- **Health Check:** [http://localhost:9090/health](http://localhost:9090/health)
- **API:** `http://localhost:9090/api/`

---

## API Reference

### Configs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/configs` | List all saved tap configurations |
| `POST` | `/api/configs` | Create a new configuration |
| `GET` | `/api/configs/:id` | Get a specific configuration |
| `PUT` | `/api/configs/:id` | Update a configuration |
| `DELETE` | `/api/configs/:id` | Delete a configuration |

### Taps
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/taps/targets` | List available target types |
| `POST` | `/api/taps/discover` | Run schema discovery for a config |
| `POST` | `/api/taps/run` | Run a sync (extract records) |
| `GET` | `/api/taps/runs` | List past run history |
| `GET` | `/api/taps/runs/:id` | Get details of a specific run |
| `GET` | `/api/taps/runs/:id/stream` | Stream live sync output (SSE) |

### Mock API
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/mock/oauth2/token` | D365-style OAuth2 token endpoint |
| `GET` | `/api/mock/data/$metadata` | OData v4 EDMX metadata |
| `GET` | `/api/mock/data/:entitySet` | Query D365 entity set (OData v4) |
| `GET` | `/api/mock/:dataset` | Query REST mock dataset |
| `GET` | `/api/mock-status` | Check if mock API is enabled |

### Authentication (Mock Endpoints)

**REST Mock API:**
```bash
# API Key
curl -H "X-API-Key: mock-api-key-12345" http://localhost:9090/api/mock/contacts

# Bearer Token
curl -H "Authorization: Bearer mock-bearer-token-12345" http://localhost:9090/api/mock/contacts

# Basic Auth
curl -u mock-user:mock-pass-12345 http://localhost:9090/api/mock/contacts

# Skip auth (for testing)
curl http://localhost:9090/api/mock/contacts?auth=none
```

**D365 OData Mock:**
```bash
# 1. Get OAuth2 token
curl -X POST http://localhost:9090/api/mock/oauth2/token \
  -d "grant_type=client_credentials&client_id=mock-d365-client&client_secret=mock-d365-secret-12345"

# 2. Use token for OData queries
curl -H "Authorization: Bearer mock-d365-bearer-token-98765" \
  "http://localhost:9090/api/mock/data/CustomersV3?\$top=10"
```

---

## Project Structure

```
singer-tap/
  Dockerfile                          # Multi-stage build (Python venvs + Node.js)
  ui/
    client/                           # React frontend (Vite)
      src/
        pages/                        # BuilderPage, ConnectorsPage, TapsPage, RunDetailPage
        components/                   # Config builder, layout, shared components
        data/connectorTemplates.js    # Pre-built connector templates
    server/                           # Express.js backend
      src/
        index.js                      # Server entry point, middleware, routes
        routes/
          configs.js                  # CRUD for tap configurations
          taps.js                     # Discover, sync, run history, targets
          mock.js                     # Mock REST + D365 OData v4 endpoints
          github.js                   # GitHub integration
        database/
          init.js                     # SQLite init + migrations
          seed.js                     # Auto-seed demo configs
        crypto.js                     # Config encryption at rest
    shared/
      cleanConfig.js                  # Config sanitization for tap processes
  taps/
    tap-rest-api-generic/             # Generic REST API Singer tap (Python)
    tap-dynamics365-erp/              # D365 F&O OData v4 Singer tap (Python)
    target-confluent-kafka/           # Kafka target connector (Python)
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9090` | Server listen port |
| `NODE_ENV` | `production` | Node environment |
| `MOCK_API_ENABLED` | `true` | Enable/disable mock API endpoints |
| `ALLOWED_ORIGINS` | `http://localhost:{PORT}` | CORS allowed origins (comma-separated) |
| `PYTHONUNBUFFERED` | `1` | Unbuffered Python output for real-time logs |
| `SINGER_LOG_DIR` | `/app/logs` | Directory for Singer tap log files |

---

## Security

- **Helmet.js** HTTP security headers (CSP, HSTS, X-Frame-Options)
- **CORS** restricted to allowed origins
- **Rate limiting** on all API routes (100 req/15min general, 20 req/15min for tap execution)
- **Config encryption** at rest using AES-256 (auto-generated key)
- **Input validation** on all route parameters (UUID format, allowed tap binaries)
- **No exposed internals** in error responses

---

## Tested Sync Results

| Tap | Records | Streams | Status |
|-----|---------|---------|--------|
| D365 F&O OData v4 Mock | 1,050 | 21 | Verified |
| Mock API (REST) | 799 | 7 | Verified |
| RandomUser.me (Live) | 650 | 1 | Verified |
