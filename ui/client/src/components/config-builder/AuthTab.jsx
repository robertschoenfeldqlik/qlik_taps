import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import KeyValueEditor from './KeyValueEditor';

function SecretInput({ value, onChange, placeholder, label, required }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="input-label">{label} {required && <span className="text-red-500">*</span>}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          className="input-field pr-10"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
          aria-label={visible ? 'Hide value' : 'Show value'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

const AUTH_METHODS = [
  { value: 'no_auth', label: 'No Authentication' },
  { value: 'api_key', label: 'API Key' },
  { value: 'bearer_token', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth (Username/Password)' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

export default function AuthTab({ config, onChange }) {
  const method = config.auth_method || 'no_auth';

  const update = (field, value) => {
    onChange({ ...config, [field]: value });
  };

  // OAuth2 extra params as key-value pairs
  const extraParamPairs = Object.entries(config.oauth2_extra_params || {}).map(([key, value]) => ({ key, value }));
  const setExtraParams = (pairs) => {
    const obj = {};
    pairs.forEach(p => { if (p.key) obj[p.key] = p.value; });
    update('oauth2_extra_params', obj);
  };

  return (
    <div className="space-y-6">
      {/* Auth Method Selector */}
      <div>
        <label className="input-label">Authentication Method</label>
        <select
          className="input-field"
          value={method}
          onChange={(e) => update('auth_method', e.target.value)}
        >
          {AUTH_METHODS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Method-specific fields */}
      {method === 'no_auth' && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
          No authentication required. Requests will be sent without credentials.
        </div>
      )}

      {method === 'api_key' && (
        <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border border-blue-100">
          <h3 className="section-title text-blue-800">API Key Configuration</h3>
          <SecretInput
            label="API Key"
            required
            placeholder="your-api-key-here"
            value={config.api_key || ''}
            onChange={(e) => update('api_key', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Key Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="X-API-Key"
                value={config.api_key_name || ''}
                onChange={(e) => update('api_key_name', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Header or param name (default: X-API-Key)</p>
            </div>
            <div>
              <label className="input-label">Location</label>
              <select
                className="input-field"
                value={config.api_key_location || 'header'}
                onChange={(e) => update('api_key_location', e.target.value)}
              >
                <option value="header">Header</option>
                <option value="param">Query Parameter</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {method === 'bearer_token' && (
        <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border border-blue-100">
          <h3 className="section-title text-blue-800">Bearer Token</h3>
          <div>
            <SecretInput
              label="Token"
              required
              placeholder="your-bearer-token"
              value={config.bearer_token || ''}
              onChange={(e) => update('bearer_token', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Sent as: Authorization: Bearer &lt;token&gt;</p>
          </div>
        </div>
      )}

      {method === 'basic' && (
        <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border border-blue-100">
          <h3 className="section-title text-blue-800">Basic Authentication</h3>
          <div>
            <label className="input-label">Username <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="input-field"
              placeholder="your-username"
              value={config.username || ''}
              onChange={(e) => update('username', e.target.value)}
            />
          </div>
          <div>
            <label className="input-label">Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              className="input-field"
              placeholder="your-password"
              value={config.password || ''}
              onChange={(e) => update('password', e.target.value)}
            />
          </div>
        </div>
      )}

      {method === 'oauth2' && (
        <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border border-blue-100">
          <h3 className="section-title text-blue-800">OAuth 2.0 Configuration</h3>

          <div>
            <label className="input-label">Token URL <span className="text-red-500">*</span></label>
            <input
              type="url"
              className="input-field"
              placeholder="https://auth.example.com/oauth2/token"
              value={config.oauth2_token_url || ''}
              onChange={(e) => update('oauth2_token_url', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Client ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input-field"
                placeholder="your-client-id"
                value={config.oauth2_client_id || ''}
                onChange={(e) => update('oauth2_client_id', e.target.value)}
              />
            </div>
            <div>
              <label className="input-label">Client Secret <span className="text-red-500">*</span></label>
              <input
                type="password"
                className="input-field"
                placeholder="your-client-secret"
                value={config.oauth2_client_secret || ''}
                onChange={(e) => update('oauth2_client_secret', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="input-label">Grant Type</label>
            <select
              className="input-field"
              value={config.oauth2_grant_type || 'client_credentials'}
              onChange={(e) => update('oauth2_grant_type', e.target.value)}
            >
              <option value="client_credentials">Client Credentials</option>
              <option value="refresh_token">Refresh Token</option>
            </select>
          </div>

          {config.oauth2_grant_type === 'refresh_token' && (
            <div>
              <label className="input-label">Refresh Token <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input-field"
                placeholder="your-refresh-token"
                value={config.oauth2_refresh_token || ''}
                onChange={(e) => update('oauth2_refresh_token', e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Scope</label>
              <input
                type="text"
                className="input-field"
                placeholder="read:data write:data"
                value={config.oauth2_scope || ''}
                onChange={(e) => update('oauth2_scope', e.target.value)}
              />
            </div>
            <div>
              <label className="input-label">Audience</label>
              <input
                type="text"
                className="input-field"
                placeholder="https://api.example.com"
                value={config.oauth2_audience || ''}
                onChange={(e) => update('oauth2_audience', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">For Auth0 and similar providers</p>
            </div>
          </div>

          <KeyValueEditor
            label="Extra Token Parameters"
            pairs={extraParamPairs}
            onChange={setExtraParams}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        </div>
      )}
    </div>
  );
}
