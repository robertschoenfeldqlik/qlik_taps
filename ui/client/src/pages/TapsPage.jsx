import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Search, Compass, History, Edit3,
  CheckCircle, XCircle, Clock, Loader, Square,
  Plug, Layers, Database, ChevronDown, ChevronUp,
  Copy, Download, Trash2, FileArchive,
} from 'lucide-react';
import {
  getConfigs, discoverTap, runTap, getTapRuns,
  deleteConfig, duplicateConfig, getExportUrl, importZip,
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border bg-gray-50 text-gray-400 border-gray-200">
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${style}`}>
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

  const handleRun = async (configId, catalogJson) => {
    try {
      const options = catalogJson ? { catalog_json: catalogJson } : {};
      const { data } = await runTap(configId, options);
      navigate(`/taps/runs/${data.id}`, { state: { streamToken: data.stream_token } });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start run';
      setToast({ visible: true, message: msg, type: 'error' });
    }
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

  // --- Config management handlers (from DashboardPage) ---

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
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Play size={28} className="text-brand-600" />
            Run Taps
          </h1>
          <p className="text-sm text-gray-500 mt-1">
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
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
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
              <div key={config.id} className="card hover:shadow-md transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    {/* Left: tap info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 mb-1 truncate">
                        {config.name}
                      </h3>
                      {config.description && (
                        <p className="text-xs text-gray-400 mb-2 truncate">{config.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-2">
                        <span className="flex items-center gap-1 font-mono truncate max-w-xs">
                          <Plug size={12} />
                          {config.api_url || '(no URL)'}
                        </span>
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                          {AUTH_LABELS[config.auth_method] || config.auth_method}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers size={12} /> {config.stream_count} stream{config.stream_count !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Last run status */}
                      <div className="flex items-center gap-2 text-xs">
                        <StatusBadge status={lastRun?.status} />
                        {lastRun && (
                          <span className="text-gray-400">
                            {timeAgo(lastRun.completed_at || lastRun.started_at)}
                            {lastRun.records_synced > 0 && ` \u00B7 ${lastRun.records_synced.toLocaleString()} records`}
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
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Run History</h4>
                      {configRuns.length === 0 ? (
                        <p className="text-xs text-gray-400">No runs yet for this tap.</p>
                      ) : (
                        <div className="space-y-1">
                          {configRuns.slice(0, 10).map(run => (
                            <div
                              key={run.id}
                              onClick={() => navigate(`/taps/runs/${run.id}`)}
                              className="flex items-center justify-between p-2 rounded hover:bg-gray-50 cursor-pointer text-xs"
                            >
                              <div className="flex items-center gap-3">
                                <StatusBadge status={run.status} />
                                <span className="text-gray-500">{run.mode}</span>
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
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Stream Name</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Replication</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Key</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Properties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {discoveryModal.catalog.streams.map((stream, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{stream.stream || stream.tap_stream_id}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${
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
            <div className="flex justify-end gap-3 mt-4 pt-3 border-t">
              <button onClick={() => setDiscoveryModal(null)} className="btn-secondary">
                Close
              </button>
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
              <pre className="mt-4 text-left bg-gray-50 p-4 rounded text-xs overflow-auto max-h-60">
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
