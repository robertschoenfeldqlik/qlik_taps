import { useState, useMemo } from 'react';
import { Plug, Shield, Layers, Code } from 'lucide-react';
import ConnectionTab from './ConnectionTab';
import AuthTab from './AuthTab';
import StreamsTab from './StreamsTab';
import DynamicsConnectionTab from './DynamicsConnectionTab';
import DynamicsStreamsTab from './DynamicsStreamsTab';
import JsonPreview from './JsonPreview';

const REST_TABS = [
  { id: 'connection', label: 'Connection', icon: Plug },
  { id: 'auth', label: 'Authentication', icon: Shield },
  { id: 'streams', label: 'Streams', icon: Layers },
  { id: 'preview', label: 'Preview & Export', icon: Code },
];

const DYNAMICS_TABS = [
  { id: 'connection', label: 'Connection & Auth', icon: Plug },
  { id: 'streams', label: 'Streams', icon: Layers },
  { id: 'preview', label: 'Preview & Export', icon: Code },
];

const DEFAULT_CONFIG = {
  api_url: '',
  auth_method: 'no_auth',
  user_agent: '',
  request_timeout: '',
  start_date: '',
  headers: {},
  params: {},
  streams: [],
  // Auth fields
  api_key: '',
  api_key_name: '',
  api_key_location: 'header',
  bearer_token: '',
  username: '',
  password: '',
  oauth2_token_url: '',
  oauth2_client_id: '',
  oauth2_client_secret: '',
  oauth2_grant_type: 'client_credentials',
  oauth2_refresh_token: '',
  oauth2_scope: '',
  oauth2_audience: '',
  oauth2_extra_params: {},
};

const DEFAULT_DYNAMICS_CONFIG = {
  tap_type: 'dynamics365',
  environment_url: '',
  tenant_id: '',
  client_id: '',
  client_secret: '',
  user_agent: 'tap-dynamics365-erp',
  streams: [],
};

function isDynamicsConfig(config) {
  return config?.tap_type === 'dynamics365' ||
    (config?.environment_url && config?.tenant_id);
}

export default function ConfigBuilder({ initialConfig, onSave }) {
  const isDynamics = useMemo(() => isDynamicsConfig(initialConfig), [initialConfig]);

  const [activeTab, setActiveTab] = useState('connection');
  const [config, setConfig] = useState(() => ({
    ...(isDynamics ? DEFAULT_DYNAMICS_CONFIG : DEFAULT_CONFIG),
    ...(initialConfig || {}),
  }));

  const tabs = isDynamics ? DYNAMICS_TABS : REST_TABS;

  const updateConfig = (updates) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const updateStreams = (streams) => {
    setConfig(prev => ({ ...prev, streams }));
  };

  const handleSave = () => {
    if (onSave) onSave(config);
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {tab.id === 'streams' && config.streams.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-brand-100 text-brand-700">
                  {config.streams.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'connection' && (
          isDynamics
            ? <DynamicsConnectionTab config={config} onChange={updateConfig} />
            : <ConnectionTab config={config} onChange={updateConfig} />
        )}
        {activeTab === 'auth' && !isDynamics && (
          <AuthTab config={config} onChange={updateConfig} />
        )}
        {activeTab === 'streams' && (
          isDynamics
            ? <DynamicsStreamsTab streams={config.streams} onChange={updateStreams} />
            : <StreamsTab streams={config.streams} onChange={updateStreams} />
        )}
        {activeTab === 'preview' && (
          <JsonPreview config={config} onSave={handleSave} />
        )}
      </div>
    </div>
  );
}
