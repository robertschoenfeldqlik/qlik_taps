import { useState } from 'react';
import {
  Globe, ChevronDown, ChevronRight, Clock, ArrowRight,
  Lock, Unlock, Copy, CheckCircle, Fingerprint,
} from 'lucide-react';

const METHOD_COLORS = {
  GET: 'bg-green-50 text-green-700 border-green-200',
  POST: 'bg-blue-50 text-blue-700 border-blue-200',
  PUT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  PATCH: 'bg-orange-50 text-orange-700 border-orange-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_COLORS = {
  2: 'text-green-600',
  3: 'text-yellow-600',
  4: 'text-red-500',
  5: 'text-red-700',
};

function getStatusColor(code) {
  const group = Math.floor(code / 100);
  return STATUS_COLORS[group] || 'text-gray-500';
}

function formatUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function formatMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function HeadersTable({ headers }) {
  if (!headers || typeof headers !== 'object') return null;
  const entries = Object.entries(headers);
  if (entries.length === 0) return null;

  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([key, val]) => (
          <tr key={key} className="border-b border-gray-100">
            <td className="py-1 pr-3 font-mono font-medium text-gray-500 whitespace-nowrap align-top">{key}</td>
            <td className="py-1 font-mono text-gray-700 break-all">
              {val === '***' ? (
                <span className="text-gray-400 italic">{'<masked>'}</span>
              ) : (
                String(val)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function JsonPreview({ data, label }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;

  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const lines = jsonStr.split('\n');
  const isLong = lines.length > 8;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-brand-600 hover:text-brand-700"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <pre className={`text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700 ${
        !expanded && isLong ? 'max-h-32' : ''
      } overflow-y-auto`}>
        {jsonStr}
      </pre>
    </div>
  );
}

function TraceEntry({ entry, index }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('request');

  const method = entry.request?.method || 'GET';
  const url = entry.request?.url || '';
  const statusCode = entry.response?.status_code || 0;
  const elapsed = entry.elapsed_ms || 0;
  const isAuth = entry.is_auth_exchange;
  const contentType = entry.response?.content_type || '';

  // Try to parse body_preview as JSON for display
  let bodyPreview = null;
  if (entry.response?.body_preview) {
    try {
      bodyPreview = JSON.parse(entry.response.body_preview);
    } catch {
      bodyPreview = entry.response.body_preview;
    }
  }

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      expanded ? 'border-brand-200 shadow-sm' : 'border-gray-200 hover:border-gray-300'
    } ${isAuth ? 'border-l-4 border-l-amber-400' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-400 text-xs font-mono w-6 text-right shrink-0">
          {index + 1}
        </span>

        {isAuth && (
          <Lock size={13} className="text-amber-500 shrink-0" title="Auth exchange" />
        )}

        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded border shrink-0 ${
          METHOD_COLORS[method] || 'bg-gray-50 text-gray-600 border-gray-200'
        }`}>
          {method}
        </span>

        <span className="flex-1 text-xs font-mono text-gray-700 truncate" title={url}>
          {formatUrl(url)}
        </span>

        <span className={`text-xs font-bold shrink-0 ${getStatusColor(statusCode)}`}>
          {statusCode}
        </span>

        <span className="text-xs text-gray-400 shrink-0 w-16 text-right">
          {formatMs(elapsed)}
        </span>

        {expanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 animate-fade-in">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-4">
            {['request', 'response', 'body'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeTab === 'request' && (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 block mb-1">URL</span>
                  <p className="text-xs font-mono text-gray-700 bg-gray-50 rounded px-3 py-2 break-all">
                    {url}
                  </p>
                </div>
                {entry.request?.headers && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 block mb-1">Request Headers</span>
                    <div className="bg-gray-50 rounded p-3">
                      <HeadersTable headers={entry.request.headers} />
                    </div>
                  </div>
                )}
                {entry.request?.body_params && (
                  <JsonPreview data={entry.request.body_params} label="Request Body" />
                )}
              </div>
            )}

            {activeTab === 'response' && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs font-medium text-gray-500 block">Status</span>
                    <span className={`text-lg font-bold ${getStatusColor(statusCode)}`}>{statusCode}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 block">Content-Type</span>
                    <span className="text-xs font-mono text-gray-700">{contentType || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 block">Size</span>
                    <span className="text-xs text-gray-700">
                      {entry.response?.body_size
                        ? `${(entry.response.body_size / 1024).toFixed(1)} KB`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 block">Time</span>
                    <span className="text-xs text-gray-700">{formatMs(elapsed)}</span>
                  </div>
                </div>
                {entry.response?.headers && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 block mb-1">Response Headers</span>
                    <div className="bg-gray-50 rounded p-3">
                      <HeadersTable headers={entry.response.headers} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'body' && (
              <div className="space-y-3">
                {bodyPreview ? (
                  <JsonPreview
                    data={typeof bodyPreview === 'object' ? bodyPreview : bodyPreview}
                    label="Response Body Preview"
                  />
                ) : (
                  <p className="text-xs text-gray-400 italic">No body preview available</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HttpTracePanel({ httpMetadata, runId, configName, onBlueprintCreated }) {
  const [expanded, setExpanded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blueprintName, setBlueprintName] = useState('');
  const [blueprintDesc, setBlueprintDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  const metadata = typeof httpMetadata === 'string'
    ? (() => { try { return JSON.parse(httpMetadata); } catch { return null; } })()
    : httpMetadata;

  if (!metadata || !Array.isArray(metadata) || metadata.length === 0) return null;

  const authCount = metadata.filter(m => m.is_auth_exchange).length;
  const dataCount = metadata.length - authCount;

  const handleCreateBlueprint = async () => {
    if (!blueprintName.trim()) return;
    setCreating(true);
    try {
      const { createBlueprint } = await import('../../api/client');
      const { data } = await createBlueprint({
        run_id: runId,
        name: blueprintName.trim(),
        description: blueprintDesc.trim(),
      });
      setCreateResult(data);
      if (onBlueprintCreated) onBlueprintCreated(data);
    } catch (err) {
      setCreateResult({ error: err.response?.data?.error || 'Failed to create blueprint' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-brand-600 transition-colors"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Globe size={16} />
        HTTP Trace
        <span className="text-xs font-normal text-gray-400">
          ({metadata.length} request{metadata.length !== 1 ? 's' : ''}
          {authCount > 0 ? `, ${authCount} auth` : ''})
        </span>
      </button>

      {expanded && (
        <div className="mt-3 animate-fade-in">
          {/* Summary bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Globe size={12} /> {dataCount} data requests
              </span>
              {authCount > 0 && (
                <span className="flex items-center gap-1">
                  <Lock size={12} className="text-amber-500" /> {authCount} auth exchanges
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setBlueprintName(configName ? `${configName} Blueprint` : 'New Blueprint');
                setBlueprintDesc('');
                setCreateResult(null);
                setShowCreateModal(true);
              }}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Fingerprint size={14} /> Generate Mock Dataset
            </button>
          </div>

          {/* Trace entries */}
          <div className="space-y-1.5">
            {metadata.map((entry, idx) => (
              <TraceEntry key={idx} entry={entry} index={idx} />
            ))}
          </div>

          {/* Create Blueprint Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
                {!createResult ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <Fingerprint size={20} className="text-brand-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Generate Mock Dataset</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      Create a mock blueprint from the captured HTTP metadata. The blueprint anonymizes
                      payload values while preserving the API structure for mock data generation.
                    </p>
                    <div className="space-y-3 mb-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Blueprint Name</label>
                        <input
                          type="text"
                          value={blueprintName}
                          onChange={e => setBlueprintName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          placeholder="e.g., HubSpot Contacts API"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                        <textarea
                          value={blueprintDesc}
                          onChange={e => setBlueprintDesc(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                          placeholder="Captured from test run against..."
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                      <button
                        onClick={handleCreateBlueprint}
                        disabled={creating || !blueprintName.trim()}
                        className="btn-primary flex items-center gap-2"
                      >
                        {creating ? (
                          <>
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Fingerprint size={14} /> Create Blueprint
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : createResult.error ? (
                  <>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                        <span className="text-red-500 text-xl">✕</span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Error</h3>
                      <p className="text-sm text-red-600 mb-4">{createResult.error}</p>
                      <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle size={24} className="text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Blueprint Created</h3>
                      <p className="text-sm text-gray-500 mb-4">{createResult.message}</p>
                      <div className="bg-gray-50 rounded-lg p-3 text-left text-xs space-y-1 mb-4">
                        <div><span className="text-gray-500">Endpoints:</span> <strong>{createResult.endpoint_count}</strong></div>
                        <div><span className="text-gray-500">Requests captured:</span> <strong>{createResult.total_requests_captured}</strong></div>
                        <div><span className="text-gray-500">Auth method:</span> <strong>{createResult.auth_method}</strong></div>
                      </div>
                      <button onClick={() => setShowCreateModal(false)} className="btn-primary">Done</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
