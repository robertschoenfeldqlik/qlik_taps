import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Search, Compass, History, Edit3,
  CheckCircle, XCircle, Clock, Loader, Square,
  Plug, Layers, Database, ChevronDown, ChevronUp,
  Copy, Download, Trash2, FileArchive, Server, ExternalLink,
  ChevronRight, Beaker, Send, Settings, ArrowRight,
} from 'lucide-react';
import {
  getConfigs, discoverTap, runTap, getTapRuns,
  deleteConfig, duplicateConfig, getExportUrl, importZip,
  getMockStatus, getMockInfo, getTargets,
} from '../api/client';
import Modal from '../components/shared/Modal';
import Toast from '../components/shared/Toast';

const AUTH_LABELS = {
  no_auth: 'No Auth',
  api_key: 'API Key',
  bearer_token: 'Bearer Token',
  basic: 'Basic Auth',
  oauth2: 'OAuth 2.0',
  oauth2_azure: 'Azure AD OAuth',
};

function StatusBadge({ status }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border bg-gray-50 text-gray-400 border-gray-200">
        <Clock size={12} /> Never run
      </span>
    );
  }
  const styles = {
    completed: 'bg-green-50 text-green-700 border-green-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    running: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    discovering: 'bg-blue-50 text-blue-700 border-blue-200',
    stopped: 'bg-gray-50 text-gray-600 border-gray-200',
    pending: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  const icons = {
    completed: CheckCircle,
    failed: XCircle,
    running: Loader,
    discovering: Loader,
    stopped: Square,
    pending: Clock,
  };
  const Icon = icons[status] || Clock;
  const style = styles[status] || styles.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border ${style}`}>
      <Icon size={12} className={status === 'running' || status === 'discovering' ? 'animate-spin' : ''} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Mock API Info Banner ─────────────────────────────────────────── */
function MockApiBanner({ mockInfo }) {
  const [expanded, setExpanded] = useState(false);

  if (!mockInfo) return null;

  return (
    <div className="card border-brand-200 bg-gradient-to-r from-brand-50/50 to-white mb-6 animate-fade-in">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
              <Beaker size={18} className="text-brand-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 tracking-tight text-sm">Mock API Server</h3>
              <p className="text-xs text-gray-500">
                Built-in test server with {mockInfo.datasets?.length || 6} datasets — no real API credentials needed
              </p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost flex items-center gap-1 text-xs"
          >
            {expanded ? 'Hide' : 'Show'} Details
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-brand-100 animate-fade-in space-y-4">
            {/* Base URL */}
            <div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Base URL</span>
              <code className="block mt-1 text-sm font-mono text-brand-700 bg-brand-50 px-3 py-1.5 rounded-md">
                {mockInfo.base_url || `${window.location.origin}/api/mock`}
              </code>
            </div>

            {/* Datasets */}
            <div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Available Datasets</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(mockInfo.datasets || ['contacts', 'orders', 'products', 'events', 'users', 'invoices']).map(ds => (
                  <span key={ds} className="badge bg-gray-50 text-gray-600">{ds}</span>
                ))}
              </div>
            </div>

            {/* Auth Methods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Test Credentials</span>
                <div className="mt-1.5 text-xs space-y-1 font-mono text-gray-600">
                  <div><span className="text-gray-400">API Key:</span> mock-api-key-12345</div>
                  <div><span className="text-gray-400">Bearer:</span> mock-bearer-token-12345</div>
                  <div><span className="text-gray-400">Basic:</span> mock-user / mock-pass-12345</div>
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Pagination Styles</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['page', 'offset', 'cursor', 'link_header', 'jsonpath', 'odata'].map(p => (
                    <span key={p} className="badge bg-purple-50 text-purple-600">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TapsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [configs, setConfigs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [discovering, setDiscovering] = useState(null); // config id being discovered
  const [discoveryModal, setDiscoveryModal] = useState(null); // { configName, catalog }
  const [runHistory, setRunHistory] = useState({}); // configId -> most recent run
  const [expandedRuns, setExpandedRuns] = useState(null); // configId showing run history
  const [configRuns, setConfigRuns] = useState([]); // runs for expanded config
  const [deleteModal, setDeleteModal] = useState(null); // config to delete
  const [importing, setImporting] = useState(false);
  const [mockInfo, setMockInfo] = useState(null);

  // Target state
  const [targets, setTargets] = useState([]);
  const [targetModal, setTargetModal] = useState(null); // { configId, catalogJson? }
  const [selectedTarget, setSelectedTarget] = useState('');
  const [targetConfig, setTargetConfig] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [configsRes, runsRes] = await Promise.all([
        getConfigs(),
        getTapRuns(),
      ]);
      setConfigs(configsRes.data);

      // Build map of configId -> most recent run
      const runMap = {};
      for (const run of runsRes.data) {
        if (!runMap[run.config_id] || run.started_at > runMap[run.config_id].started_at) {
          runMap[run.config_id] = run;
        }
      }
      setRunHistory(runMap);
    } catch (err) {
      console.error('Failed to load data:', err);
      setToast({ visible: true, message: 'Failed to load data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load mock API status & available targets
  useEffect(() => {
    getMockStatus()
      .then(({ data }) => {
        if (data.enabled) {
          getMockInfo()
            .then(({ data: info }) => setMockInfo(info))
            .catch(() => setMockInfo({ enabled: true }));
        }
      })
      .catch(() => {}); // Mock API not available

    getTargets()
      .then(({ data }) => setTargets(data))
      .catch(() => {}); // targets endpoint not available
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDiscover = async (configId) => {
    try {
      setDiscovering(configId);
      const { data } = await discoverTap(configId);
      const configName = configs.find(c => c.id === configId)?.name || 'Unknown';
      setDiscoveryModal({
        configId,
        configName,
        catalog: data.catalog,
        streamsDiscovered: data.streams_discovered,
      });
      loadData(); // refresh run history
    } catch (err) {
      const msg = err.response?.data?.error || 'Discovery failed';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setDiscovering(null);
    }
  };

  const handleRun = async (configId, catalogJson, targetType, targetCfg) => {
    try {
      const options = catalogJson ? { catalog_json: catalogJson } : {};
      if (targetType) {
        options.target_type = targetType;
        options.target_config = typeof targetCfg === 'string' ? JSON.parse(targetCfg) : targetCfg;
      }
      const { data } = await runTap(configId, options);
      navigate(`/taps/runs/${data.id}`, { state: { streamToken: data.stream_token } });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start run';
      setToast({ visible: true, message: msg, type: 'error' });
    }
  };

  const openTargetModal = (configId, catalogJson) => {
    setTargetModal({ configId, catalogJson });
    setSelectedTarget('');
    setTargetConfig('');
  };

  const handleRunWithTarget = () => {
    if (!targetModal || !selectedTarget) return;
    handleRun(targetModal.configId, targetModal.catalogJson, selectedTarget, targetConfig);
    setTargetModal(null);
  };

  const handleViewRuns = async (configId) => {
    if (expandedRuns === configId) {
      setExpandedRuns(null);
      setConfigRuns([]);
      return;
    }
    try {
      const { data } = await getTapRuns(configId);
      setConfigRuns(data);
      setExpandedRuns(configId);
    } catch (err) {
      setToast({ visible: true, message: 'Failed to load run history', type: 'error' });
    }
  };

  // --- Config management handlers ---

  const handleDelete = async () => {
    if (!deleteModal) return;
    try {
      await deleteConfig(deleteModal.id);
      setDeleteModal(null);
      setToast({ visible: true, message: 'Config deleted', type: 'success' });
      loadData();
    } catch (err) {
      setToast({ visible: true, message: 'Failed to delete config', type: 'error' });
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await duplicateConfig(id);
      setToast({ visible: true, message: 'Config duplicated', type: 'success' });
      loadData();
    } catch (err) {
      setToast({ visible: true, message: 'Failed to duplicate config', type: 'error' });
    }
  };

  const handleZipImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const { data } = await importZip(file);
      setToast({
        visible: true,
        message: `Imported ${data.imported} config(s) from zip`,
        type: 'success',
      });
      loadData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to import zip';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = configs.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.api_url || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-header flex items-center gap-2.5">
            <Play size={28} className="text-brand-600" />
            Run Taps
          </h1>
          <p className="page-subtitle">
            Execute tap discovery and sync from saved configurations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Zip Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleZipImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="btn-secondary flex items-center gap-2"
          >
            <FileArchive size={16} />
            {importing ? 'Importing...' : 'Import Tap (.zip)'}
          </button>
        </div>
      </div>

      {/* Mock API Banner */}
      <MockApiBanner mockInfo={mockInfo} />

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input-field pl-10"
          placeholder="Search taps by name or URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tap Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center animate-fade-in-up">
          <Database size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">
            {search ? 'No matching taps' : 'No taps configured'}
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            {search
              ? 'Try a different search term.'
              : 'Create a tap configuration first from the Connectors page.'}
          </p>
          {!search && (
            <button
              onClick={() => navigate('/')}
              className="btn-primary"
            >
              Browse Connectors
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(config => {
            const lastRun = runHistory[config.id];
            const isExpanded = expandedRuns === config.id;

            return (
              <div key={config.id} className="card hover:shadow-card transition-all duration-200 animate-fade-in-up">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    {/* Left: tap info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 tracking-tight mb-1 truncate">
                        {config.name}
                      </h3>
                      {config.description && (
                        <p className="text-xs text-gray-400 mb-2 truncate">{config.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                        <span className="badge bg-gray-50 text-gray-600 font-mono truncate max-w-xs">
                          <Plug size={10} />
                          {config.api_url || '(no URL)'}
                        </span>
                        <span className="badge bg-blue-50 text-blue-700">
                          {AUTH_LABELS[config.auth_method] || config.auth_method}
                        </span>
                        <span className="badge bg-purple-50 text-purple-700">
                          <Layers size={10} /> {config.stream_count} stream{config.stream_count !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Last run status */}
                      <div className="flex items-center gap-2 text-xs">
                        <StatusBadge status={lastRun?.status} />
                        {lastRun && (
                          <span className="text-gray-400">
                            {timeAgo(lastRun.completed_at || lastRun.started_at)}
                            {lastRun.records_synced > 0 && ` · ${lastRun.records_synced.toLocaleString()} records`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => handleDiscover(config.id)}
                        disabled={discovering === config.id}
                        className="btn-secondary flex items-center gap-1.5 text-sm"
                        title="Discover streams"
                      >
                        {discovering === config.id
                          ? <Loader size={14} className="animate-spin" />
                          : <Compass size={14} />
                        }
                        Discover
                      </button>
                      <button
                        onClick={() => handleRun(config.id)}
                        className="btn-primary flex items-center gap-1.5 text-sm"
                        title="Run sync"
                      >
                        <Play size={14} /> Run
                      </button>
                      {targets.length > 0 && (
                        <button
                          onClick={() => openTargetModal(config.id)}
                          className="btn-secondary flex items-center gap-1.5 text-sm border-brand-200 text-brand-700 hover:bg-brand-50"
                          title="Run with target"
                        >
                          <Send size={14} /> Target
                        </button>
                      )}
                      <button
                        onClick={() => handleViewRuns(config.id)}
                        className="btn-ghost flex items-center gap-1.5 text-sm"
                        title="View run history"
                      >
                        <History size={14} />
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button
                        onClick={() => navigate(`/configs/${config.id}/edit`)}
                        className="btn-ghost flex items-center gap-1 text-sm"
                        title="Edit config"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(config.id)}
                        className="btn-ghost flex items-center gap-1 text-sm"
                        title="Clone config"
                      >
                        <Copy size={14} />
                      </button>
                      <a
                        href={getExportUrl(config.id)}
                        className="btn-ghost flex items-center gap-1 text-sm"
                        title="Export config"
                        download
                      >
                        <Download size={14} />
                      </a>
                      <button
                        onClick={() => setDeleteModal(config)}
                        className="btn-ghost text-red-500 hover:bg-red-50 flex items-center gap-1 text-sm"
                        title="Delete config"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded run history */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
                      <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <ChevronRight size={12} /> Run History
                      </h4>
                      {configRuns.length === 0 ? (
                        <p className="text-xs text-gray-400">No runs yet for this tap.</p>
                      ) : (
                        <div className="space-y-1">
                          {configRuns.slice(0, 10).map(run => (
                            <div
                              key={run.id}
                              onClick={() => navigate(`/taps/runs/${run.id}`)}
                              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs transition-colors duration-150"
                            >
                              <div className="flex items-center gap-3">
                                <StatusBadge status={run.status} />
                                <span className="text-gray-500 font-medium">{run.mode}</span>
                              </div>
                              <div className="flex items-center gap-4 text-gray-400">
                                {run.records_synced > 0 && (
                                  <span>{run.records_synced.toLocaleString()} records</span>
                                )}
                                {run.streams_discovered > 0 && (
                                  <span>{run.streams_discovered} streams</span>
                                )}
                                <span>{timeAgo(run.started_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Discovery Modal */}
      <Modal
        isOpen={!!discoveryModal}
        onClose={() => setDiscoveryModal(null)}
        title={`Discovered Streams — ${discoveryModal?.configName || ''}`}
        size="lg"
      >
        {discoveryModal?.catalog?.streams ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Found {discoveryModal.catalog.streams.length} stream{discoveryModal.catalog.streams.length !== 1 ? 's' : ''}.
            </p>
            <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Stream Name</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Replication</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Key</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Properties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {discoveryModal.catalog.streams.map((stream, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs">{stream.stream || stream.tap_stream_id}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`badge ${
                          stream.replication_method === 'INCREMENTAL'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {stream.replication_method || 'FULL_TABLE'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {(stream.key_properties || []).join(', ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-right text-gray-500">
                        {stream.schema?.properties ? Object.keys(stream.schema.properties).length : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-100">
              <button onClick={() => setDiscoveryModal(null)} className="btn-secondary">
                Close
              </button>
              {targets.length > 0 && (
                <button
                  onClick={() => {
                    openTargetModal(discoveryModal.configId, discoveryModal.catalog);
                    setDiscoveryModal(null);
                  }}
                  className="btn-secondary flex items-center gap-2 border-brand-200 text-brand-700 hover:bg-brand-50"
                >
                  <Send size={16} /> Run with Target
                </button>
              )}
              <button
                onClick={() => {
                  handleRun(discoveryModal.configId, discoveryModal.catalog);
                  setDiscoveryModal(null);
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Play size={16} /> Run Sync
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p>No stream data available.</p>
            {discoveryModal?.catalog?.raw && (
              <pre className="mt-4 text-left bg-gray-50 p-4 rounded-lg text-xs overflow-auto max-h-60 border border-gray-100">
                {typeof discoveryModal.catalog.raw === 'string'
                  ? discoveryModal.catalog.raw
                  : JSON.stringify(discoveryModal.catalog, null, 2)}
              </pre>
            )}
            <button onClick={() => setDiscoveryModal(null)} className="btn-secondary mt-4">
              Close
            </button>
          </div>
        )}
      </Modal>

      {/* Target Selection Modal */}
      <Modal
        isOpen={!!targetModal}
        onClose={() => setTargetModal(null)}
        title="Run with Target"
        size="lg"
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Select a target to pipe Singer output to. Records will be sent to the target in real time.
          </p>

          {/* Target cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {targets.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTarget(t.id);
                  setTargetConfig(JSON.stringify(t.default_config, null, 2));
                }}
                className={`p-4 rounded-xl border-2 text-left transition-all duration-150 ${
                  selectedTarget === t.id
                    ? 'border-brand-500 bg-brand-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="font-semibold text-sm text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>

          {/* Target config editor */}
          {selectedTarget && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Target Configuration
                </label>
                <button
                  onClick={() => {
                    const target = targets.find(t => t.id === selectedTarget);
                    if (target) setTargetConfig(JSON.stringify(target.default_config, null, 2));
                  }}
                  className="text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                >
                  Reset to defaults
                </button>
              </div>
              <textarea
                value={targetConfig}
                onChange={(e) => setTargetConfig(e.target.value)}
                rows={8}
                className="input-field font-mono text-xs w-full"
                spellCheck={false}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {selectedTarget && (
                <>
                  <ArrowRight size={12} />
                  <span>tap → <strong className="text-gray-600">{targets.find(t => t.id === selectedTarget)?.name}</strong></span>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setTargetModal(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleRunWithTarget}
                disabled={!selectedTarget}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} /> <Send size={14} /> Run with Target
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Config" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{deleteModal?.name}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteModal(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete</button>
        </div>
      </Modal>

      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
