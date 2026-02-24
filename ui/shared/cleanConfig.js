/**
 * Shared config cleaning logic for Singer tap configurations.
 *
 * Used by both the frontend (JsonPreview) and backend (taps route)
 * to strip empty/default values before passing config to the CLI.
 *
 * IMPORTANT: Keep this as the single source of truth.
 * Do NOT duplicate this logic elsewhere.
 */

function cleanDynamicsConfig(config) {
  const clean = {};
  if (config.environment_url) clean.environment_url = config.environment_url;
  if (config.tenant_id) clean.tenant_id = config.tenant_id;
  if (config.client_id) clean.client_id = config.client_id;
  if (config.client_secret) clean.client_secret = config.client_secret;
  if (config.user_agent) clean.user_agent = config.user_agent;
  return clean;
}

function detectTapBinary(configJson) {
  if (configJson.tap_type === 'dynamics365') return 'tap-dynamics365-erp';
  if (configJson.environment_url && configJson.tenant_id) return 'tap-dynamics365-erp';
  return 'tap-rest-api';
}

function cleanConfig(config) {
  if (detectTapBinary(config) === 'tap-dynamics365-erp') {
    return cleanDynamicsConfig(config);
  }

  const clean = {};

  if (config.api_url) clean.api_url = config.api_url;

  const method = config.auth_method || 'no_auth';
  if (method !== 'no_auth') clean.auth_method = method;

  if (method === 'api_key') {
    if (config.api_key) clean.api_key = config.api_key;
    if (config.api_key_name && config.api_key_name !== 'X-API-Key') clean.api_key_name = config.api_key_name;
    if (config.api_key_location && config.api_key_location !== 'header') clean.api_key_location = config.api_key_location;
  }
  if (method === 'bearer_token' && config.bearer_token) clean.bearer_token = config.bearer_token;
  if (method === 'basic') {
    if (config.username) clean.username = config.username;
    if (config.password) clean.password = config.password;
  }
  if (method === 'oauth2') {
    if (config.oauth2_token_url) clean.oauth2_token_url = config.oauth2_token_url;
    if (config.oauth2_client_id) clean.oauth2_client_id = config.oauth2_client_id;
    if (config.oauth2_client_secret) clean.oauth2_client_secret = config.oauth2_client_secret;
    if (config.oauth2_grant_type && config.oauth2_grant_type !== 'client_credentials') {
      clean.oauth2_grant_type = config.oauth2_grant_type;
    }
    if (config.oauth2_refresh_token) clean.oauth2_refresh_token = config.oauth2_refresh_token;
    if (config.oauth2_scope) clean.oauth2_scope = config.oauth2_scope;
    if (config.oauth2_audience) clean.oauth2_audience = config.oauth2_audience;
    if (config.oauth2_extra_params && Object.keys(config.oauth2_extra_params).length) {
      clean.oauth2_extra_params = config.oauth2_extra_params;
    }
  }

  if (config.user_agent && config.user_agent !== 'tap-rest-api/1.0') clean.user_agent = config.user_agent;
  if (config.request_timeout && config.request_timeout !== 300) clean.request_timeout = config.request_timeout;
  if (config.start_date) clean.start_date = config.start_date;

  if (config.headers && Object.keys(config.headers).length) clean.headers = config.headers;
  if (config.params && Object.keys(config.params).length) clean.params = config.params;

  clean.streams = (config.streams || []).map(s => {
    const cs = {};
    if (s.name) cs.name = s.name;
    if (s.path) cs.path = s.path;
    if (s.primary_keys && s.primary_keys.length) cs.primary_keys = s.primary_keys;
    if (s.replication_key) cs.replication_key = s.replication_key;
    if (s.replication_method && s.replication_method !== 'FULL_TABLE') cs.replication_method = s.replication_method;
    if (s.records_path) cs.records_path = s.records_path;
    if (s.pagination_style && s.pagination_style !== 'none') {
      cs.pagination_style = s.pagination_style;
      if (s.pagination_page_size) cs.pagination_page_size = s.pagination_page_size;
      if (s.pagination_page_param) cs.pagination_page_param = s.pagination_page_param;
      if (s.pagination_size_param) cs.pagination_size_param = s.pagination_size_param;
      if (s.pagination_start_page) cs.pagination_start_page = s.pagination_start_page;
      if (s.pagination_total_path) cs.pagination_total_path = s.pagination_total_path;
      if (s.pagination_offset_param) cs.pagination_offset_param = s.pagination_offset_param;
      if (s.pagination_limit_param) cs.pagination_limit_param = s.pagination_limit_param;
      if (s.pagination_cursor_path) cs.pagination_cursor_path = s.pagination_cursor_path;
      if (s.pagination_cursor_param) cs.pagination_cursor_param = s.pagination_cursor_param;
      if (s.pagination_next_path) cs.pagination_next_path = s.pagination_next_path;
      if (s.pagination_next_is_url === false) cs.pagination_next_is_url = false;
    }
    if (s.bookmark_param) cs.bookmark_param = s.bookmark_param;
    if (s.bookmark_filter) cs.bookmark_filter = s.bookmark_filter;
    if (s.bookmark_filter_param) cs.bookmark_filter_param = s.bookmark_filter_param;
    if (s.denest === false) cs.denest = false;
    if (s.params && Object.keys(s.params).length) cs.params = s.params;
    if (s.headers && Object.keys(s.headers).length) cs.headers = s.headers;
    if (s.schema) cs.schema = s.schema;
    return cs;
  });

  return clean;
}

// CommonJS export for server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanConfig, cleanDynamicsConfig, detectTapBinary };
}
