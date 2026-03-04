/**
 * Anonymization module for HTTP metadata.
 *
 * Walks JSON value trees and replaces leaf values with type placeholders
 * while preserving the structure (field names, nesting, array shapes).
 * Used to create "blueprints" from captured HTTP metadata that can drive
 * dynamic mock API data generation.
 */

// ---------------------------------------------------------------------------
// Headers that are safe to keep as-is (not secrets or PII)
// ---------------------------------------------------------------------------
const SAFE_HEADERS = new Set([
  'content-type',
  'accept',
  'cache-control',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
  'link',
  'x-total-count',
  'x-page',
  'x-per-page',
  'x-request-id',
  'content-length',
  'transfer-encoding',
  'connection',
  'vary',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
]);

// ---------------------------------------------------------------------------
// Value anonymization — detect type patterns and replace with placeholders
// ---------------------------------------------------------------------------

/**
 * Anonymize a single value by detecting its type/pattern and returning
 * a placeholder string like {{string}}, {{email}}, {{date}}, etc.
 *
 * For objects and arrays, recurses to anonymize nested values.
 */
function anonymizeValue(val) {
  if (val === null || val === undefined) return null;

  if (typeof val === 'boolean') return '{{boolean}}';

  if (typeof val === 'number') {
    return Number.isInteger(val) ? '{{integer}}' : '{{float}}';
  }

  if (typeof val === 'string') {
    // Detect common patterns
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return '{{datetime}}';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return '{{date}}';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return '{{uuid}}';
    if (/^https?:\/\//.test(val)) return '{{url}}';
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) return '{{email}}';
    if (/^\+?\d[\d\s\-()]{6,}$/.test(val)) return '{{phone}}';
    if (/^\d+\.\d+\.\d+\.\d+$/.test(val)) return '{{ip_address}}';
    if (/^\d+$/.test(val)) return '{{numeric_string}}';
    if (val.length > 100) return '{{long_string}}';
    return '{{string}}';
  }

  if (Array.isArray(val)) {
    // Anonymize using the first element as the representative schema
    if (val.length === 0) return [];
    return [anonymizeValue(val[0])];
  }

  if (typeof val === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = anonymizeValue(v);
    }
    return result;
  }

  return '{{unknown}}';
}

// ---------------------------------------------------------------------------
// Header anonymization — keep header names, mask secret values
// ---------------------------------------------------------------------------

/**
 * Anonymize HTTP headers: keep safe header values as-is,
 * replace sensitive header values with '***'.
 */
function anonymizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const result = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (SAFE_HEADERS.has(lower)) {
      result[k] = v;
    } else {
      result[k] = '***';
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pagination detection — identify pagination patterns from response data
// ---------------------------------------------------------------------------

/**
 * Detect pagination style from a response's headers and body.
 */
function detectPagination(response) {
  const headers = response.headers || {};
  const bodyStr = response.body_preview || '';

  // Check for Link header (RFC 5988)
  if (headers.link || headers.Link) {
    return { style: 'link_header', description: 'RFC 5988 Link header pagination' };
  }

  // Try to parse body for common pagination patterns
  let body = null;
  try { body = JSON.parse(bodyStr); } catch { /* not JSON */ }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    // next URL style (HubSpot, generic REST)
    if (body.next || body.paging?.next?.link || body['@odata.nextLink']) {
      if (body['@odata.nextLink']) {
        return { style: 'odata_next_link', description: 'OData @odata.nextLink pagination' };
      }
      return { style: 'next_url', description: 'Next URL pagination' };
    }

    // Offset/limit style
    if (('offset' in body || 'skip' in body) && ('limit' in body || 'top' in body || 'count' in body)) {
      return { style: 'offset_limit', description: 'Offset/limit pagination' };
    }

    // Page number style
    if ('page' in body && ('total_pages' in body || 'totalPages' in body || 'pages' in body)) {
      return { style: 'page_number', description: 'Page number pagination' };
    }

    // Cursor/token style
    if (body.cursor || body.next_cursor || body.continuation_token || body.nextPageToken) {
      return { style: 'cursor', description: 'Cursor/token pagination' };
    }
  }

  return { style: 'none', description: 'No pagination detected' };
}

// ---------------------------------------------------------------------------
// Truncated JSON repair — body_preview is capped at 2000 chars
// ---------------------------------------------------------------------------

/**
 * Try to parse and anonymize a potentially truncated JSON body.
 * Strategies:
 *   1. Direct parse (works if body fits within limit)
 *   2. Truncate array contents and close brackets
 *   3. Extract top-level keys from partial JSON
 */
function parseAndAnonymizeBody(bodyStr) {
  if (!bodyStr || typeof bodyStr !== 'string') return null;

  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(bodyStr);
    return anonymizeValue(parsed);
  } catch { /* truncated */ }

  // Strategy 2: Find first complete object in a top-level array using bracket counting
  // Handles nested objects like {"results":[{"name":{"first":"Joe","last":"Smith"},...},...
  if (bodyStr.startsWith('{')) {
    // Find the opening bracket of the first array value
    const arrayStart = bodyStr.indexOf('[');
    if (arrayStart > 0) {
      const prefix = bodyStr.substring(0, arrayStart + 1); // e.g., {"results":[
      const rest = bodyStr.substring(arrayStart + 1).trimStart();

      if (rest.startsWith('{')) {
        // Use bracket counting to find the end of the first complete object
        let depth = 0;
        let inString = false;
        let escaped = false;
        let firstObjEnd = -1;

        for (let i = 0; i < rest.length; i++) {
          const ch = rest[i];
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;

          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              firstObjEnd = i;
              break;
            }
          }
        }

        if (firstObjEnd > 0) {
          const firstItem = rest.substring(0, firstObjEnd + 1);
          const repaired = `${prefix}${firstItem}]}`;
          try {
            const parsed = JSON.parse(repaired);
            return anonymizeValue(parsed);
          } catch { /* still broken */ }
        }
      }
    }

    // Fallback: try closing at the deepest sensible point
    let openBraces = 0, openBrackets = 0;
    for (const ch of bodyStr) {
      if (ch === '{') openBraces++;
      if (ch === '}') openBraces--;
      if (ch === '[') openBrackets++;
      if (ch === ']') openBrackets--;
    }
    let suffix = '';
    for (let i = 0; i < openBrackets; i++) suffix += ']';
    for (let i = 0; i < openBraces; i++) suffix += '}';
    if (suffix) {
      const lastComma = bodyStr.lastIndexOf(',');
      let trimmed = bodyStr;
      if (lastComma > bodyStr.length / 2) {
        trimmed = bodyStr.substring(0, lastComma);
      }
      try {
        const parsed = JSON.parse(trimmed + suffix);
        return anonymizeValue(parsed);
      } catch { /* still broken */ }
    }
  }

  // Strategy 3: Extract top-level keys from partial JSON
  // Only looks at keys at the root level (depth 0) to avoid flattening nested structures
  if (bodyStr.startsWith('{')) {
    // Find keys at root depth using bracket counting
    const rootKeys = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let i = 1; // skip opening {

    while (i < Math.min(bodyStr.length, 1000)) {
      const ch = bodyStr[i];
      if (escaped) { escaped = false; i++; continue; }
      if (ch === '\\') { escaped = true; i++; continue; }
      if (ch === '"' && !inString) {
        // Check if we're at root depth (depth === 0)
        if (depth === 0) {
          // This might be a key — find the closing quote
          const keyEnd = bodyStr.indexOf('"', i + 1);
          if (keyEnd > i) {
            const possibleKey = bodyStr.substring(i + 1, keyEnd);
            // Check if followed by ':'
            const afterKey = bodyStr.substring(keyEnd + 1).trimStart();
            if (afterKey[0] === ':') {
              const valueStart = afterKey.substring(1).trimStart();
              if (valueStart.startsWith('[')) {
                // This is an array — try to extract the first item's schema
                const arrIdx = bodyStr.indexOf('[', keyEnd);
                const arrContent = bodyStr.substring(arrIdx + 1).trimStart();
                if (arrContent.startsWith('{')) {
                  // Array of objects — try to parse first complete object
                  let d = 0, inS = false, esc = false, end = -1;
                  for (let j = 0; j < arrContent.length; j++) {
                    const c = arrContent[j];
                    if (esc) { esc = false; continue; }
                    if (c === '\\') { esc = true; continue; }
                    if (c === '"') { inS = !inS; continue; }
                    if (inS) continue;
                    if (c === '{') d++;
                    else if (c === '}') { d--; if (d === 0) { end = j; break; } }
                  }
                  if (end > 0) {
                    try {
                      const firstObj = JSON.parse(arrContent.substring(0, end + 1));
                      rootKeys.push({ key: possibleKey, value: [anonymizeValue(firstObj)] });
                    } catch {
                      rootKeys.push({ key: possibleKey, value: ['{{unknown}}'] });
                    }
                  } else {
                    rootKeys.push({ key: possibleKey, value: ['{{unknown}}'] });
                  }
                } else {
                  rootKeys.push({ key: possibleKey, value: ['{{unknown}}'] });
                }
              } else if (valueStart.startsWith('{')) {
                rootKeys.push({ key: possibleKey, value: '{{object}}' });
              } else if (valueStart.startsWith('"')) {
                // Try to extract and anonymize the string value
                const strEnd = valueStart.indexOf('"', 1);
                if (strEnd > 0) {
                  const strVal = valueStart.substring(1, strEnd);
                  rootKeys.push({ key: possibleKey, value: anonymizeValue(strVal) });
                } else {
                  rootKeys.push({ key: possibleKey, value: '{{string}}' });
                }
              } else if (/^\d/.test(valueStart)) {
                rootKeys.push({ key: possibleKey, value: '{{integer}}' });
              } else if (valueStart.startsWith('true') || valueStart.startsWith('false')) {
                rootKeys.push({ key: possibleKey, value: '{{boolean}}' });
              } else if (valueStart.startsWith('null')) {
                rootKeys.push({ key: possibleKey, value: null });
              } else {
                rootKeys.push({ key: possibleKey, value: '{{unknown}}' });
              }
              // Skip past the key to avoid re-processing
              i = keyEnd + 1;
              continue;
            }
          }
        }
        inString = true;
        i++;
        continue;
      }
      if (ch === '"' && inString) { inString = false; i++; continue; }
      if (!inString) {
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') depth--;
      }
      i++;
    }

    if (rootKeys.length > 0) {
      const schema = {};
      for (const { key, value } of rootKeys) {
        schema[key] = value;
      }
      return schema;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Full HTTP metadata anonymization
// ---------------------------------------------------------------------------

/**
 * Anonymize an array of HTTP metadata entries captured during a tap run.
 * Returns an array of endpoint descriptors with anonymized schemas.
 */
function anonymizeHttpMeta(metaArray) {
  if (!Array.isArray(metaArray)) return [];

  return metaArray.map(m => {
    const request = m.request || {};
    const response = m.response || {};

    // Parse response body for schema extraction
    // body_preview may be truncated (2000 char limit), so try repair strategies
    let bodySchema = null;
    if (response.body_preview) {
      bodySchema = parseAndAnonymizeBody(response.body_preview);
    }

    return {
      timestamp: m.timestamp,
      elapsed_ms: m.elapsed_ms || 0,
      is_auth_exchange: m.is_auth_exchange || false,
      request: {
        method: request.method || 'GET',
        url_pattern: (request.url || '').replace(/[?].*/, ''), // strip query params
        headers: anonymizeHeaders(request.headers),
      },
      response: {
        status_code: response.status_code,
        content_type: response.content_type || '',
        headers: anonymizeHeaders(response.headers),
        body_size: response.body_size || 0,
        body_schema: bodySchema,
        pagination: detectPagination(response),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Endpoint grouping — deduplicate repeated calls to the same URL pattern
// ---------------------------------------------------------------------------

/**
 * Group anonymized metadata entries by URL pattern and method.
 * Returns a deduplicated array of endpoint descriptors suitable for blueprints.
 */
function groupEndpoints(anonymizedMeta) {
  const groups = new Map();

  for (const entry of anonymizedMeta) {
    // Skip auth exchanges — they're tracked separately
    if (entry.is_auth_exchange) continue;

    const key = `${entry.request.method} ${entry.request.url_pattern}`;

    if (!groups.has(key)) {
      groups.set(key, {
        method: entry.request.method,
        url_pattern: entry.request.url_pattern,
        response_schema: entry.response.body_schema,
        pagination_style: entry.response.pagination.style,
        status_code: entry.response.status_code,
        content_type: entry.response.content_type,
        call_count: 1,
        avg_response_time_ms: entry.elapsed_ms,
      });
    } else {
      const existing = groups.get(key);
      existing.call_count++;
      // Running average of response time
      existing.avg_response_time_ms = Math.round(
        (existing.avg_response_time_ms * (existing.call_count - 1) + entry.elapsed_ms) / existing.call_count
      );
    }
  }

  return Array.from(groups.values());
}

/**
 * Extract auth exchange metadata from anonymized entries.
 */
function extractAuthExchanges(anonymizedMeta) {
  return anonymizedMeta
    .filter(e => e.is_auth_exchange)
    .map(e => ({
      method: e.request.method,
      url_pattern: e.request.url_pattern,
      status_code: e.response.status_code,
      content_type: e.response.content_type,
      response_schema: e.response.body_schema,
    }));
}

module.exports = {
  anonymizeValue,
  anonymizeHeaders,
  anonymizeHttpMeta,
  detectPagination,
  groupEndpoints,
  extractAuthExchanges,
};
