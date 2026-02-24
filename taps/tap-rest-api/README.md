# tap-rest-api

A [Singer](https://www.singer.io/) tap that connects to **any REST API endpoint**, automatically infers JSON schemas, denests nested objects/arrays into flat tables, and supports flexible authentication.

## Features

| Feature | Description |
|---------|-------------|
| **Any REST Endpoint** | Point at any URL -- no code changes needed |
| **Auto Schema Inference** | Samples API responses and builds JSON Schema automatically |
| **Denesting Engine** | Flattens nested objects (`address.city` -> `address__city`) and splits nested arrays into child tables |
| **5 Auth Methods** | `no_auth`, `api_key`, `bearer_token`, `basic`, `oauth2` (client credentials + refresh token) |
| **7 Pagination Styles** | `none`, `page`, `offset`, `cursor`, `link_header`, `jsonpath`, `odata` |
| **JSONPath Extraction** | Use JSONPath to locate records in any response structure |
| **URL Parameters** | Global and per-stream query parameters |
| **Custom Headers** | Global and per-stream HTTP headers |
| **Incremental Sync** | Bookmark-based incremental replication |
| **Retry & Backoff** | Automatic retry with exponential backoff for 429/5xx errors |

---

## Installation

```bash
pip install -e .
```

Or install dependencies manually:

```bash
pip install singer-python requests backoff python-dateutil requests-oauthlib jsonpath-ng
```

---

## Quick Start

### 1. Create a config file

```json
{
    "api_url": "https://jsonplaceholder.typicode.com",
    "auth_method": "no_auth",
    "streams": [
        {
            "name": "posts",
            "path": "/posts",
            "primary_keys": ["id"],
            "replication_method": "FULL_TABLE",
            "pagination_style": "none"
        }
    ]
}
```

### 2. Run Discovery

```bash
tap-rest-api --config config.json --discover > catalog.json
```

### 3. Run Sync

```bash
tap-rest-api --config config.json --catalog catalog.json
```

### 4. Pipe to a Target

```bash
tap-rest-api --config config.json --catalog catalog.json | target-csv
tap-rest-api --config config.json --catalog catalog.json | target-jsonl
tap-rest-api --config config.json --catalog catalog.json --state state.json | target-postgres
```

---

## Configuration Reference

### Top-Level Config

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `api_url` | Yes | | Base URL for the API |
| `auth_method` | No | `no_auth` | Authentication method (see below) |
| `streams` | Yes | | Array of stream definitions |
| `headers` | No | `{}` | Global HTTP headers applied to all requests |
| `params` | No | `{}` | Global URL parameters applied to all requests |
| `user_agent` | No | `tap-rest-api/1.0` | User-Agent header value |
| `request_timeout` | No | `300` | Request timeout in seconds |
| `start_date` | No | | Default start date for incremental streams (ISO 8601) |

---

### Authentication Methods

#### `no_auth` - No Authentication
```json
{ "auth_method": "no_auth" }
```

#### `api_key` - API Key (Header or Query Param)
```json
{
    "auth_method": "api_key",
    "api_key": "your-key-here",
    "api_key_name": "X-API-Key",
    "api_key_location": "header"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `api_key` | (required) | The API key value |
| `api_key_name` | `X-API-Key` | Header name or param name |
| `api_key_location` | `header` | `header` or `param` |

#### `bearer_token` - Bearer Token
```json
{
    "auth_method": "bearer_token",
    "bearer_token": "your-token-here"
}
```

#### `basic` - HTTP Basic Auth
```json
{
    "auth_method": "basic",
    "username": "your-username",
    "password": "your-password"
}
```

#### `oauth2` - OAuth 2.0

**Client Credentials:**
```json
{
    "auth_method": "oauth2",
    "oauth2_token_url": "https://auth.example.com/token",
    "oauth2_client_id": "your-client-id",
    "oauth2_client_secret": "your-client-secret",
    "oauth2_grant_type": "client_credentials",
    "oauth2_scope": "read:data"
}
```

**Refresh Token:**
```json
{
    "auth_method": "oauth2",
    "oauth2_token_url": "https://oauth2.googleapis.com/token",
    "oauth2_client_id": "your-client-id",
    "oauth2_client_secret": "your-client-secret",
    "oauth2_grant_type": "refresh_token",
    "oauth2_refresh_token": "your-refresh-token"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `oauth2_token_url` | (required) | Token endpoint URL |
| `oauth2_client_id` | (required) | OAuth client ID |
| `oauth2_client_secret` | (required) | OAuth client secret |
| `oauth2_grant_type` | `client_credentials` | `client_credentials` or `refresh_token` |
| `oauth2_refresh_token` | | Required for refresh_token grant |
| `oauth2_scope` | | OAuth scope(s) |
| `oauth2_audience` | | Audience (Auth0, etc.) |
| `oauth2_extra_params` | `{}` | Extra params for token request |

---

### Stream Configuration

Each entry in the `streams` array defines one API endpoint to extract data from.

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `name` | Yes | | Stream name (becomes the table name) |
| `path` | Yes | | API endpoint path (appended to `api_url`) |
| `primary_keys` | No | `[]` | Array of field names forming the primary key |
| `replication_key` | No | | Field name for incremental bookmarks |
| `replication_method` | No | `FULL_TABLE` | `FULL_TABLE` or `INCREMENTAL` |
| `records_path` | No | auto-detect | JSONPath to locate records in response |
| `params` | No | `{}` | Per-stream URL parameters |
| `headers` | No | `{}` | Per-stream HTTP headers |
| `pagination_style` | No | `none` | Pagination strategy (see below) |
| `schema` | No | auto-infer | Static JSON Schema (skips inference) |
| `denest` | No | `true` | Enable/disable denesting |
| `bookmark_param` | No | replication_key | URL param name for passing bookmark value |
| `bookmark_filter` | No | | Template for filter: `"$filter=modified ge {bookmark}"` |
| `bookmark_filter_param` | No | | URL param to put the rendered filter into |

---

### Pagination Styles

#### `none` - Single Request
No pagination. Use for endpoints that return all data at once.

#### `page` - Page Number
```json
{
    "pagination_style": "page",
    "pagination_page_param": "page",
    "pagination_size_param": "per_page",
    "pagination_page_size": 100,
    "pagination_start_page": 1
}
```

#### `offset` - Offset/Limit
```json
{
    "pagination_style": "offset",
    "pagination_offset_param": "offset",
    "pagination_limit_param": "limit",
    "pagination_page_size": 100
}
```

#### `cursor` - Cursor/Token
```json
{
    "pagination_style": "cursor",
    "pagination_cursor_path": "$.meta.next_cursor",
    "pagination_cursor_param": "cursor"
}
```

#### `link_header` - RFC 5988 Link Header
```json
{ "pagination_style": "link_header" }
```
Follows the `rel="next"` link from the `Link` response header (GitHub, etc.).

#### `jsonpath` - JSONPath Next Page
```json
{
    "pagination_style": "jsonpath",
    "pagination_next_path": "$.paging.next",
    "pagination_next_is_url": true
}
```

#### `odata` - OData nextLink
```json
{ "pagination_style": "odata" }
```
Follows `@odata.nextLink` in the response body (Microsoft APIs, SAP, etc.).

---

### JSONPath Record Extraction

Use `records_path` to tell the tap where to find records in the response:

| Response Shape | `records_path` |
|---------------|----------------|
| `[{...}, {...}]` | (not needed -- auto-detected) |
| `{"data": [{...}]}` | `$.data` |
| `{"results": [{...}]}` | `$.results` |
| `{"value": [{...}]}` | `$.value` |
| `{"response": {"items": [{...}]}}` | `$.response.items` |
| `{"hits": {"hits": [{...}]}}` | `$.hits.hits` |

---

## Denesting Engine

The tap automatically handles nested JSON by:

### 1. Flattening Nested Objects
Nested objects are flattened using `__` (double underscore) as separator:

```
Input:  {"user": {"name": "John", "address": {"city": "NYC"}}}
Output: {"user__name": "John", "user__address__city": "NYC"}
```

### 2. Splitting Nested Arrays into Child Tables
Arrays of objects become separate child streams:

```
Parent stream "orders":
  {"id": 1, "total": 100}

Child stream "orders__line_items":
  {"_sdc_source_key_id": 1, "_sdc_sequence": 0, "sku": "ABC", "qty": 2}
  {"_sdc_source_key_id": 1, "_sdc_sequence": 1, "sku": "DEF", "qty": 1}
```

### 3. Serializing Scalar Arrays
Arrays of primitives are JSON-serialized as strings:

```
Input:  {"tags": ["premium", "active"]}
Output: {"tags": "[\"premium\", \"active\"]"}
```

Set `"denest": false` on a stream to disable denesting.

---

## Incremental Replication

For incremental streams, the tap tracks a bookmark value and passes it
to the API on subsequent runs:

```json
{
    "name": "orders",
    "replication_key": "updated_at",
    "replication_method": "INCREMENTAL",
    "bookmark_param": "updated_since"
}
```

On first run: `GET /orders`
On subsequent runs: `GET /orders?updated_since=2024-01-15T10:30:00Z`

The tap writes state after each sync:
```json
{
    "bookmarks": {
        "orders": {
            "updated_at": "2024-01-15T10:30:00Z"
        }
    }
}
```

Pass state on next run:
```bash
tap-rest-api --config config.json --catalog catalog.json --state state.json
```

---

## Project Structure

```
tap-rest-api/
  tap_rest_api/
    __init__.py           # Entry point, main() function
    auth.py               # 5 authentication handlers
    client.py             # HTTP client with retry & backoff
    pagination.py         # 7 pagination strategies
    record_extractor.py   # JSONPath & auto-detect record extraction
    schema_inference.py   # Auto schema inference + denesting engine
    discover.py           # Discovery mode (builds catalog)
    sync.py               # Sync mode (extracts & outputs data)
  examples/
    config_no_auth_public_api.json
    config_api_key.json
    config_bearer_token.json
    config_basic_auth.json
    config_oauth2_client_credentials.json
    config_oauth2_refresh_token.json
  config.sample.json
  setup.py
  README.md
```

---

## Examples

See the `examples/` directory for ready-to-use configurations:

- **Public API** (no auth) - JSONPlaceholder
- **API Key** - Weather API
- **Bearer Token** - GitHub API
- **Basic Auth** - Jira API
- **OAuth2 Client Credentials** - Microsoft/Azure APIs
- **OAuth2 Refresh Token** - Google APIs

---

## License

Apache 2.0
