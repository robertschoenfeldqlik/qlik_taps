import { useState, useEffect } from 'react';
import { Beaker } from 'lucide-react';
import KeyValueEditor from './KeyValueEditor';
import { getMockStatus } from '../../api/client';

export default function ConnectionTab({ config, onChange }) {
  const [mockAvailable, setMockAvailable] = useState(false);

  useEffect(() => {
    getMockStatus()
      .then(({ data }) => setMockAvailable(data.enabled))
      .catch(() => setMockAvailable(false));
  }, []);

  const update = (field, value) => {
    onChange({ ...config, [field]: value });
  };

  const fillMockApi = () => {
    onChange({
      ...config,
      api_url: `${window.location.origin}/api/mock`,
      auth_method: 'api_key',
      api_key: 'mock-api-key-12345',
      api_key_name: 'X-API-Key',
      api_key_location: 'header',
    });
  };

  // Convert headers object to/from key-value pairs
  const headerPairs = Object.entries(config.headers || {}).map(([key, value]) => ({ key, value }));
  const paramPairs = Object.entries(config.params || {}).map(([key, value]) => ({ key, value }));

  const setHeaders = (pairs) => {
    const obj = {};
    pairs.forEach(p => { if (p.key) obj[p.key] = p.value; });
    update('headers', obj);
  };

  const setParams = (pairs) => {
    const obj = {};
    pairs.forEach(p => { if (p.key) obj[p.key] = p.value; });
    update('params', obj);
  };

  return (
    <div className="space-y-6">
      {/* API URL */}
      <div>
        <label className="input-label">
          API Base URL <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            className="input-field flex-1"
            placeholder="https://api.example.com/v1"
            value={config.api_url || ''}
            onChange={(e) => update('api_url', e.target.value)}
          />
          {mockAvailable && (
            <button
              onClick={fillMockApi}
              className="btn-secondary flex items-center gap-1.5 text-xs shrink-0"
              title="Auto-fill with built-in Mock API server URL and credentials"
            >
              <Beaker size={14} />
              Use Mock API
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">The base URL for all API requests. Stream paths are appended to this.</p>
      </div>

      {/* User Agent */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="input-label">User Agent</label>
          <input
            type="text"
            className="input-field"
            placeholder="tap-rest-api/1.0"
            value={config.user_agent || ''}
            onChange={(e) => update('user_agent', e.target.value)}
          />
        </div>
        <div>
          <label className="input-label">Request Timeout (seconds)</label>
          <input
            type="number"
            className="input-field"
            placeholder="300"
            value={config.request_timeout || ''}
            onChange={(e) => update('request_timeout', e.target.value ? parseInt(e.target.value) : '')}
          />
        </div>
      </div>

      {/* Start Date */}
      <div>
        <label className="input-label">Start Date</label>
        <input
          type="datetime-local"
          className="input-field"
          value={config.start_date ? config.start_date.replace('Z', '').slice(0, 16) : ''}
          onChange={(e) => update('start_date', e.target.value ? e.target.value + ':00Z' : '')}
        />
        <p className="text-xs text-gray-400 mt-1">Default start date for incremental streams (ISO 8601).</p>
      </div>

      {/* Separator */}
      <div className="divider" />

      {/* Global Headers */}
      <KeyValueEditor
        label="Global Headers"
        pairs={headerPairs.length ? headerPairs : []}
        onChange={setHeaders}
        keyPlaceholder="Header Name"
        valuePlaceholder="Header Value"
      />

      {/* Global URL Parameters */}
      <KeyValueEditor
        label="Global URL Parameters"
        pairs={paramPairs.length ? paramPairs : []}
        onChange={setParams}
        keyPlaceholder="Param Name"
        valuePlaceholder="Param Value"
      />
    </div>
  );
}
