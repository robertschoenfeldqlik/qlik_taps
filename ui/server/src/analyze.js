/**
 * analyze.js — Stream Configuration Analysis Engine
 *
 * Takes grouped HTTP endpoint metadata (from anonymize.js → groupEndpoints())
 * and derives suggested tap stream configurations for the generic REST connector.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path segments to filter out when deriving stream names */
const NOISE_SEGMENTS = new Set(['api', 'v1', 'v2', 'v3', 'v4', 'v5', 'rest', 'public', 'external']);

/** Generic last segments that should be combined with the previous segment */
const GENERIC_SEGMENTS = new Set(['list', 'search', 'query', 'all', 'index', 'get', 'fetch']);

/** Well-known array field names in API responses (priority order) */
const KNOWN_RECORDS_FIELDS = [
  'results', 'data', 'items', 'records', 'value', 'entries',
  'rows', 'objects', 'list', 'content', 'hits', 'documents',
  'response', 'payload',
];

/** Pagination style mapping: blueprint detection → tap config value */
const PAGINATION_MAP = {
  'none':             'none',
  'page_number':      'page',
  'offset_limit':     'offset',
  'cursor':           'cursor',
  'link_header':      'link_header',
  'next_url':         'jsonpath',
  'odata_next_link':  'odata',
};

/** Replication key name patterns (priority order) */
const REPLICATION_KEY_PATTERNS = [
  'updated_at', 'modified_at', 'modified_date', 'updated_date',
  'last_modified', 'changed_at', 'last_updated',
  'updatedat', 'modifiedat', 'lastmodified', 'changedat',
];

// ---------------------------------------------------------------------------
// Stream Name Derivation
// ---------------------------------------------------------------------------

/**
 * Derive a stream name from a URL pattern.
 * e.g., "https://api.example.com/v3/objects/contacts" → "contacts"
 */
function deriveStreamName(urlPattern, apiBaseUrl) {
  let pathname;
  try {
    const url = new URL(urlPattern);
    const base = apiBaseUrl ? new URL(apiBaseUrl) : null;
    pathname = url.pathname;
    // Strip base path prefix
    if (base && base.pathname !== '/' && pathname.startsWith(base.pathname)) {
      pathname = pathname.slice(base.pathname.length);
    }
  } catch {
    pathname = urlPattern.replace(/^https?:\/\/[^/]+/, '');
  }

  const segments = pathname.split('/').filter(Boolean);
  const meaningful = segments.filter(s => !NOISE_SEGMENTS.has(s.toLowerCase()));

  if (meaningful.length === 0) {
    // Fall back to last raw segment or 'stream'
    const last = segments[segments.length - 1];
    return last ? last.toLowerCase().replace(/[^a-z0-9_]/g, '_') : 'stream';
  }

  const last = meaningful[meaningful.length - 1];

  // If last segment is generic, combine with previous
  if (GENERIC_SEGMENTS.has(last.toLowerCase()) && meaningful.length > 1) {
    return `${meaningful[meaningful.length - 2]}_${last}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
  }

  return last.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// ---------------------------------------------------------------------------
// Path Derivation
// ---------------------------------------------------------------------------

/**
 * Get relative path from the API base URL.
 * e.g., "https://api.example.com/v1/users" with base "https://api.example.com"
 *       → "/v1/users"
 */
function derivePath(urlPattern, apiBaseUrl) {
  try {
    const url = new URL(urlPattern);
    const base = apiBaseUrl ? new URL(apiBaseUrl) : null;
    let path = url.pathname;
    if (base && base.pathname !== '/' && path.startsWith(base.pathname)) {
      path = path.slice(base.pathname.length);
    }
    if (!path.startsWith('/')) path = '/' + path;
    return path;
  } catch {
    return urlPattern;
  }
}

// ---------------------------------------------------------------------------
// Records Path Detection
// ---------------------------------------------------------------------------

/**
 * Find the JSONPath to the records array in a response schema.
 * Looks for top-level keys whose value is an array of objects.
 */
function detectRecordsPath(schema) {
  if (!schema || typeof schema !== 'object') return '';
  if (Array.isArray(schema)) return '$[*]';

  // Find all top-level fields that are arrays of objects
  const arrayFields = [];
  for (const [key, val] of Object.entries(schema)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
      arrayFields.push(key);
    }
  }

  if (arrayFields.length === 0) return '';
  if (arrayFields.length === 1) return `$.${arrayFields[0]}[*]`;

  // Prefer known records field names
  for (const known of KNOWN_RECORDS_FIELDS) {
    if (arrayFields.includes(known)) return `$.${known}[*]`;
  }

  return `$.${arrayFields[0]}[*]`;
}

// ---------------------------------------------------------------------------
// Key Flattening (matches tap's __ denesting convention)
// ---------------------------------------------------------------------------

/**
 * Flatten nested object keys with __ separator.
 * { name: { first: '{{string}}' } } → [{ key: 'name__first', type: '{{string}}' }]
 */
function flattenKeys(obj, prefix) {
  const result = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}__${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      result.push(...flattenKeys(v, fullKey));
    } else {
      result.push({ key: fullKey, type: v });
    }
  }
  return result;
}

/**
 * Navigate schema to get the record object template inside the records array.
 */
function getRecordObject(schema, recordsPath) {
  if (!recordsPath || !schema) return schema;
  // Parse paths like $.results[*] or $[*]
  const match = recordsPath.match(/^\$\.?([a-zA-Z0-9_]+)?\[\*\]$/);
  if (!match) return schema;
  const field = match[1];
  if (!field) return Array.isArray(schema) ? schema[0] : schema;
  const arr = schema[field];
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : schema;
}

// ---------------------------------------------------------------------------
// Primary Key Guessing
// ---------------------------------------------------------------------------

/**
 * Guess primary key fields from a record schema.
 * Looks for id, uuid, _id, pk fields with appropriate types.
 */
function guessPrimaryKeys(schema, recordsPath) {
  const record = getRecordObject(schema, recordsPath);
  if (!record || typeof record !== 'object') return [];

  const flattened = flattenKeys(record, '');
  const candidates = [];

  for (const { key, type } of flattened) {
    const lower = key.toLowerCase();
    // Exact primary key names (highest priority)
    if (['id', 'uuid', '_id', 'pk'].includes(lower)) {
      candidates.push({ key, priority: 1 });
    }
    // Nested ID fields (e.g., login__uuid)
    else if (lower.endsWith('__id') || lower.endsWith('__uuid') || lower.endsWith('__pk')) {
      candidates.push({ key, priority: 2 });
    }
    // Fields containing 'id' with uuid/integer type
    else if (
      lower.includes('id') &&
      (type === '{{uuid}}' || type === '{{integer}}' || type === '{{numeric_string}}')
    ) {
      candidates.push({ key, priority: 3 });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.slice(0, 2).map(c => c.key);
}

// ---------------------------------------------------------------------------
// Pagination Mapping
// ---------------------------------------------------------------------------

/**
 * Map blueprint pagination style to tap config pagination style.
 */
function mapPaginationStyle(blueprintStyle) {
  return PAGINATION_MAP[blueprintStyle] || 'none';
}

/**
 * Return sensible default pagination parameters for a given style.
 */
function inferPaginationDefaults(mappedStyle, schema) {
  const defaults = {};
  switch (mappedStyle) {
    case 'page':
      defaults.pagination_page_param = 'page';
      defaults.pagination_size_param = 'per_page';
      defaults.pagination_page_size = 100;
      defaults.pagination_start_page = 1;
      break;
    case 'offset':
      defaults.pagination_offset_param = 'offset';
      defaults.pagination_limit_param = 'limit';
      defaults.pagination_page_size = 100;
      break;
    case 'cursor':
      defaults.pagination_cursor_param = 'cursor';
      defaults.pagination_cursor_path = detectCursorPath(schema);
      break;
    case 'jsonpath':
      defaults.pagination_next_path = detectNextUrlPath(schema);
      defaults.pagination_next_is_url = true;
      break;
    // link_header and odata need no extra config
  }
  return defaults;
}

/**
 * Try to detect the JSONPath to a cursor/token in the response schema.
 */
function detectCursorPath(schema) {
  if (!schema || typeof schema !== 'object') return '';
  const candidates = ['next_cursor', 'cursor', 'nextPageToken', 'continuation_token', 'after'];
  for (const key of candidates) {
    if (key in schema) return `$.${key}`;
  }
  // Check nested paging objects
  if (schema.paging && typeof schema.paging === 'object') {
    if (schema.paging.next !== undefined) return '$.paging.next';
    if (schema.paging.cursors !== undefined) return '$.paging.cursors.after';
  }
  if (schema.meta && typeof schema.meta === 'object') {
    if ('next_cursor' in schema.meta) return '$.meta.next_cursor';
    if ('cursor' in schema.meta) return '$.meta.cursor';
  }
  return '';
}

/**
 * Try to detect the JSONPath to a next-page URL in the response schema.
 */
function detectNextUrlPath(schema) {
  if (!schema || typeof schema !== 'object') return '';
  if ('next' in schema) return '$.next';
  if (schema.paging?.next?.link !== undefined) return '$.paging.next.link';
  if (schema.paging?.next !== undefined) return '$.paging.next';
  if (schema.links?.next !== undefined) return '$.links.next';
  return '';
}

// ---------------------------------------------------------------------------
// Replication Key Detection
// ---------------------------------------------------------------------------

/**
 * Detect a replication key (datetime field suitable for incremental sync)
 * from a record schema.
 */
function detectReplicationKey(recordSchema) {
  if (!recordSchema || typeof recordSchema !== 'object') return null;
  const flattened = flattenKeys(recordSchema, '');
  const dateFields = flattened.filter(
    f => f.type === '{{datetime}}' || f.type === '{{date}}'
  );
  if (dateFields.length === 0) return null;

  // Check for known replication key name patterns
  for (const pattern of REPLICATION_KEY_PATTERNS) {
    const match = dateFields.find(f => f.key.toLowerCase().includes(pattern));
    if (match) return match.key;
  }

  // Fallback: any datetime field with update/modify in the name
  const updateField = dateFields.find(f => /updat|modif|chang/i.test(f.key));
  if (updateField) return updateField.key;

  return null;
}

// ---------------------------------------------------------------------------
// Main Export: analyzeEndpoints
// ---------------------------------------------------------------------------

/**
 * Analyze grouped HTTP endpoints and return suggested stream configurations.
 *
 * @param {Array} endpoints - Grouped endpoints from anonymize.js groupEndpoints()
 * @param {string} apiBaseUrl - Detected API base URL (e.g., "https://api.example.com")
 * @returns {Array} Suggested stream configs ready for config_json.streams
 */
function analyzeEndpoints(endpoints, apiBaseUrl) {
  const usedNames = new Set();

  const streams = endpoints
    // Only analyze successful GET endpoints (data retrieval)
    .filter(ep => ep.method === 'GET' && ep.status_code >= 200 && ep.status_code < 300)
    .map(ep => {
      // Derive stream name with deduplication
      let name = deriveStreamName(ep.url_pattern, apiBaseUrl);
      if (usedNames.has(name)) {
        let suffix = 2;
        while (usedNames.has(`${name}_${suffix}`)) suffix++;
        name = `${name}_${suffix}`;
      }
      usedNames.add(name);

      const path = derivePath(ep.url_pattern, apiBaseUrl);
      const recordsPath = detectRecordsPath(ep.response_schema);
      const primaryKeys = guessPrimaryKeys(ep.response_schema, recordsPath);
      const paginationStyle = mapPaginationStyle(ep.pagination_style);
      const paginationDefaults = inferPaginationDefaults(paginationStyle, ep.response_schema);
      const recordObj = getRecordObject(ep.response_schema, recordsPath);
      const replicationKey = detectReplicationKey(recordObj);

      // Count fields in the record schema for the review UI
      const fieldCount = recordObj && typeof recordObj === 'object'
        ? flattenKeys(recordObj, '').length
        : 0;

      return {
        // Stream config fields (saved into config_json.streams[])
        name,
        path,
        primary_keys: primaryKeys,
        records_path: recordsPath,
        replication_method: replicationKey ? 'INCREMENTAL' : 'FULL_TABLE',
        replication_key: replicationKey || '',
        denest: true,
        pagination_style: paginationStyle,
        ...paginationDefaults,
        params: {},
        headers: {},

        // Metadata for the review UI (stripped before saving)
        _meta: {
          source_url: ep.url_pattern,
          call_count: ep.call_count,
          avg_response_time_ms: ep.avg_response_time_ms,
          detected_pagination: ep.pagination_style,
          field_count: fieldCount,
          content_type: ep.content_type,
        },
      };
    });

  return streams;
}

module.exports = {
  analyzeEndpoints,
  deriveStreamName,
  derivePath,
  detectRecordsPath,
  guessPrimaryKeys,
  mapPaginationStyle,
  flattenKeys,
  getRecordObject,
};
