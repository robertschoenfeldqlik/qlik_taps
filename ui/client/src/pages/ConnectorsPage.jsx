import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, ExternalLink, Layers, Shield, Plug,
  ChevronRight, ArrowRight,
} from 'lucide-react';
import { createConfig } from '../api/client';
import CONNECTOR_TEMPLATES, { getConnectorsByCategory } from '../data/connectorTemplates';
import Toast from '../components/shared/Toast';

const AUTH_LABELS = {
  no_auth: 'No Auth',
  api_key: 'API Key',
  bearer_token: 'Bearer Token',
  basic: 'Basic Auth',
  oauth2: 'OAuth 2.0',
};

const CATEGORY_ORDER = [
  'ERP & Finance',
  'CRM & Marketing',
  'Payments & Commerce',
  'DevOps & Engineering',
  'Analytics & Data',
  'Communication',
  'Support & Ticketing',
  'Cloud & Infrastructure',
  'SaaS & Productivity',
  'Custom',
];

export default function ConnectorsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [creating, setCreating] = useState(null); // id of connector being created
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const byCategory = useMemo(() => getConnectorsByCategory(), []);

  // Filtered list
  const filtered = useMemo(() => {
    let results = CONNECTOR_TEMPLATES;

    if (selectedCategory !== 'All') {
      results = results.filter((c) => c.category === selectedCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }

    return results;
  }, [search, selectedCategory]);

  // Group filtered results by category
  const groupedFiltered = useMemo(() => {
    const groups = {};
    for (const c of filtered) {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    }
    // Sort categories by defined order
    return CATEGORY_ORDER
      .filter((cat) => groups[cat])
      .map((cat) => ({ category: cat, connectors: groups[cat] }));
  }, [filtered]);

  const allCategories = useMemo(
    () => ['All', ...CATEGORY_ORDER.filter((cat) => byCategory[cat])],
    [byCategory]
  );

  const handleUseConnector = async (connector) => {
    try {
      setCreating(connector.id);

      // Deep-clone the template config
      const configJson = JSON.parse(JSON.stringify(connector.config));

      const { data } = await createConfig({
        name: connector.name,
        description: connector.description,
        config_json: configJson,
      });

      setToast({
        visible: true,
        message: `${connector.name} connector created! Redirecting to editor...`,
        type: 'success',
      });

      // Navigate to the editor so the user can fill in credentials
      setTimeout(() => {
        navigate(`/configs/${data.id}/edit`);
      }, 600);
    } catch (err) {
      console.error('Failed to create connector config:', err);
      setToast({
        visible: true,
        message: 'Failed to create connector config',
        type: 'error',
      });
    } finally {
      setCreating(null);
    }
  };

  const handleBuildFromScratch = async () => {
    try {
      setCreating('scratch');
      const { data } = await createConfig({
        name: 'Untitled Config',
        description: '',
        config_json: {},
      });
      navigate(`/configs/${data.id}/edit`);
    } catch (err) {
      console.error('Failed to create blank config:', err);
      setToast({
        visible: true,
        message: 'Failed to create config',
        type: 'error',
      });
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Plug size={28} className="text-brand-600" />
            Connectors
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Pre-built REST API connector templates — pick one and start syncing in minutes
          </p>
        </div>
        <button
          onClick={handleBuildFromScratch}
          disabled={creating === 'scratch'}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> Build from Scratch
        </button>
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input-field pl-10"
            placeholder="Search connectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                selectedCategory === cat
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {cat}
              {cat !== 'All' && byCategory[cat] && (
                <span className="ml-1 opacity-75">({byCategory[cat].length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Plug size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">No connectors found</h3>
          <p className="text-sm text-gray-400">
            Try a different search term or category, or{' '}
            <button
              onClick={handleBuildFromScratch}
              className="text-brand-600 hover:underline"
            >
              build a custom config
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedFiltered.map(({ category, connectors }) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ChevronRight size={14} />
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {connectors.map((connector) => (
                  <div
                    key={connector.id}
                    className="card hover:shadow-md transition-all hover:border-brand-200 group"
                  >
                    <div className="p-4">
                      {/* Logo + Name */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" role="img" aria-label={connector.name}>
                            {connector.logo}
                          </span>
                          <div>
                            <h3 className="font-semibold text-gray-800">{connector.name}</h3>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                              {connector.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Meta badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-3 mt-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                          <Shield size={10} />
                          {connector.config.tap_type === 'dynamics365'
                            ? 'OAuth 2.0 (Azure AD)'
                            : (AUTH_LABELS[connector.config.auth_method] || connector.config.auth_method)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                          <Layers size={10} />
                          {connector.config.streams.length} stream{connector.config.streams.length !== 1 ? 's' : ''}
                        </span>
                        {connector.tap_binary && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded font-mono">
                            {connector.tap_binary}
                          </span>
                        )}
                        {connector.docsUrl && (
                          <a
                            href={connector.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 rounded hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={10} /> Docs
                          </a>
                        )}
                      </div>

                      {/* Stream names */}
                      <div className="text-xs text-gray-400 mb-3">
                        <span className="font-medium text-gray-500">Streams: </span>
                        {connector.config.streams
                          .map((s) => (typeof s === 'string' ? s : s.name))
                          .slice(0, 8)
                          .join(', ')}
                        {connector.config.streams.length > 8 && ` +${connector.config.streams.length - 8} more`}
                      </div>

                      {/* Use button */}
                      <button
                        onClick={() => handleUseConnector(connector)}
                        disabled={creating === connector.id}
                        className="w-full btn-primary flex items-center justify-center gap-2 text-sm group-hover:bg-brand-700 transition-colors"
                      >
                        {creating === connector.id ? (
                          <>
                            <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <ArrowRight size={14} />
                            Use This Connector
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </div>
  );
}
