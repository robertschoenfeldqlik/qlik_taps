# Release Notes — v0.3.0

**Date:** 2026-02-24

---

## Qlik-Branded UI & Dynamics 365 Mock Testing & Target Piping

### UI / Branding

- **Qlik brand theme**: Rebranded the entire UI to match Qlik.com's visual identity
  - Primary Green (`#008936`), Teal (`#006580`), Navy (`#194270`) color palette
  - Sidebar uses Qlik navy gradient with green accent borders
  - Updated glow effects, focus rings, and interactive states across all components
  - Subtitle updated to "Qlik Singer REST API"

### Dynamics 365 Finance & Operations — Mock API

- **20 D365 OData entity sets** added to the built-in mock API server:
  - `LegalEntities`, `CustomersV3`, `VendorsV2`, `SalesOrderHeadersV2`, `SalesOrderLines`, `PurchaseOrderHeadersV2`, `PurchaseOrderLines`, `ProductsV2`, `ReleasedProductsV2`, `InventOnhandEntities`, `MainAccounts`, `GeneralJournalAccountEntries`, `BudgetRegisterEntries`, `EmployeesV2`, `PositionsV2`, `VendorInvoiceHeadersV2`, `VendorInvoiceLinesV2`, `FreeTextInvoiceHeadersV2`, `PaymentTerms`, `Warehouses`
- **OData v4 compliance**: Supports `$filter`, `$orderby`, `$skip`, `$top`, `@odata.nextLink` pagination, `Prefer: odata.maxpagesize`, `cross-company` parameter, and standard OData response envelope with `@odata.context`
- **Azure AD-compatible OAuth2**: Mock token endpoint accepts D365 client credentials (`mock-d365-client` / `mock-d365-secret-12345`) and returns Bearer tokens
- **D365 tap `oauth_token_url` support**: The Dynamics 365 tap client now accepts a custom `oauth_token_url` config parameter, enabling seamless testing against the mock server without needing real Azure AD credentials
- **D365 mock connector template**: One-click "Dynamics 365 F&O — Mock Test" template pre-configured with all 20 entity streams

### Target Tap Architecture

- **Singer target piping**: Tap output (`stdout`) is now piped directly to a target process (`stdin`) in real time during sync runs
  - The existing Singer message parser continues to operate for the UI's live monitoring
  - Target `stderr` is captured and displayed in the log viewer with `[target]` tags (cyan-highlighted)
- **`/api/taps/targets` endpoint**: Lists available target types with their default configurations
- **Target UI in TapsPage**: New "Target" button on each tap card opens a target selection modal
  - Visual target picker cards (CSV, JSON Lines, Confluent Kafka)
  - Inline JSON config editor with "Reset to defaults" option
  - Tap → Target pipeline indicator
  - Also accessible from the Discovery modal's "Run with Target" button
- **RunDetailPage target info**: Shows target type badge and pipeline indicator when a run uses a target

### Confluent Kafka Target

- **`target-confluent-kafka`** — New Singer target that produces records to Apache Kafka:
  - One topic per Singer stream (configurable prefix)
  - Supports SASL/SSL authentication and gzip/snappy/lz4 compression
  - Configurable flush intervals and message key extraction from `key_properties`
  - Performance logging (records/sec throughput)
  - STATE message passthrough for bookmark tracking
- **Docker Compose Kafka services**: Added `kafka` and `kafka-ui` services under the `kafka` profile
  - Confluent Platform Kafka 7.7.0 in KRaft mode (no ZooKeeper dependency)
  - Kafka UI on port 8080 for topic inspection
  - Start with: `docker compose --profile kafka up -d`

### Database Schema

- Added `target_type` and `target_config` columns to `tap_runs` table (auto-migrated via ALTER TABLE)

### Files Changed

| File | Change |
|------|--------|
| `tailwind.config.js` | Qlik green/navy brand tokens |
| `Sidebar.jsx` | Qlik navy gradient sidebar |
| `TapsPage.jsx` | Target selection modal + "Run with Target" flow |
| `RunDetailPage.jsx` | Target info panel + `[target]` log classification |
| `client.js` | `getTargets()` API function |
| `connectorTemplates.js` | D365 mock + mock-api templates |
| `mock.js` | 20 D365 OData entity sets, Azure AD OAuth mock |
| `taps.js` | Target piping, `/api/taps/targets` endpoint |
| `client.py` (D365 tap) | Custom `oauth_token_url` support |
| `database/init.js` | `target_type`, `target_config` columns |
| `Dockerfile` | Install `target-confluent-kafka` |
| `docker-compose.yml` | Kafka + Kafka UI services |
| `target-confluent-kafka/` | New Singer target package |

---

*Built with Singer.io protocol — Extract data from any REST API or Dynamics 365 F&O and load to CSV, JSONL, or Kafka.*
