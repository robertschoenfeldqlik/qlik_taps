import { useState } from 'react';
import { Eye, EyeOff, Globe, Shield } from 'lucide-react';

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

export default function DynamicsConnectionTab({ config, onChange }) {
  const update = (field, value) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Globe size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Microsoft Dynamics 365 Finance & Operations</p>
          <p className="text-blue-600">
            Connect to your D365 F&O environment using Azure AD OAuth 2.0 client credentials.
            You&apos;ll need an Azure AD app registration with access to your D365 environment.
          </p>
        </div>
      </div>

      {/* Environment URL */}
      <div>
        <label className="input-label">
          Environment URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          className="input-field"
          placeholder="https://mycompany.operations.dynamics.com"
          value={config.environment_url || ''}
          onChange={(e) => update('environment_url', e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">
          Your Dynamics 365 F&O environment URL (e.g., https://mycompany.operations.dynamics.com)
        </p>
      </div>

      {/* Separator */}
      <hr className="border-gray-200" />

      {/* Azure AD Section */}
      <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border border-blue-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <Shield size={16} />
          Azure AD Authentication (OAuth 2.0 Client Credentials)
        </h3>

        <div>
          <label className="input-label">
            Tenant ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={config.tenant_id || ''}
            onChange={(e) => update('tenant_id', e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Azure AD tenant ID (Directory ID) from Azure Portal
          </p>
        </div>

        <div>
          <label className="input-label">
            Client ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={config.client_id || ''}
            onChange={(e) => update('client_id', e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Application (client) ID from your Azure AD app registration
          </p>
        </div>

        <SecretInput
          label="Client Secret"
          required
          placeholder="your-client-secret"
          value={config.client_secret || ''}
          onChange={(e) => update('client_secret', e.target.value)}
        />
        <p className="text-xs text-gray-400 -mt-2">
          Client secret from your Azure AD app registration
        </p>
      </div>

      {/* User Agent */}
      <div>
        <label className="input-label">User Agent</label>
        <input
          type="text"
          className="input-field"
          placeholder="tap-dynamics365-erp"
          value={config.user_agent || ''}
          onChange={(e) => update('user_agent', e.target.value)}
        />
      </div>
    </div>
  );
}
