import { useState } from 'react';
import {
  Wand2, CheckCircle, Globe, Layers, Clock, Key,
  ChevronDown, ChevronRight, Database, ArrowRight,
  AlertCircle, X,
} from 'lucide-react';
import { createConfig } from '../../api/client';

const PAGINATION_LABELS = {
  none: 'None',
  page: 'Page Number',
  offset: 'Offset / Limit',
  cursor: 'Cursor',
  link_header: 'Link Header',
  jsonpath: 'Next URL (JSON)',
  odata: 'OData',
};

export default function StreamAnalysisModal({
  isOpen,
  onClose,
  analysisResult,
  onConfigCreated,
  sourceConfigName,
}) {
  const streams = analysisResult?.streams || [];

  const [selected, setSelected] = useState(() => streams.map(() => true));
  const [names, setNames] = useState(() => streams.map(s => s.name));
  const [expanded, setExpanded] = useState(() => streams.map(() => false));
  const [configName, setConfigName] = useState(
    sourceConfigName
      ? `${sourceConfigName} (Auto-Configured)`
      : 'Auto-Configured API'
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen || !analysisResult) return null;

  const { api_base_url, auth_method, endpoints_analyzed, total_requests } = analysisResult;
  const selectedCount = selected.filter(Boolean).length;

  const toggleStream = (i) =>
    setSelected(prev => prev.map((v, idx) => (idx === i ? !v : v)));

  const toggleExpand = (i) =>
    setExpanded(prev => prev.map((v, idx) => (idx === i ? !v : v)));

  const updateName = (i, val) =>
    setNames(prev => prev.map((n, idx) => (idx === i ? val : n)));

  const handleCreate = async () => {
    if (selectedCount === 0) return;
    setSaving(true);
    try {
      const finalStreams = streams
        .map((s, i) => ({ ...s, name: names[i] || s.name, _selected: selected[i] }))
        .filter(s => s._selected)
        .map(({ _meta, _selected, ...streamConfig }) => streamConfig);

      const configJson = {
        api_url: api_base_url,
        auth_method: auth_method || 'no_auth',
        user_agent: 'tap-rest-api/1.0 (+singer-tap-builder)',
        headers: {},
        params: {},
        streams: finalStreams,
      };

      const { data } = await createConfig({
        name: configName.trim(),
        description: `Auto-configured from ${endpoints_analyzed} API endpoint(s) — ${total_requests} requests analyzed`,
        config_json: configJson,
      });

      setResult({ success: true, configId: data.id, configName: data.name });
      if (onConfigCreated) onConfigCreated(data);
    } catch (err) {
      setResult({
        error: err.response?.data?.error || err.message || 'Failed to create config',
      });
    } finally {
      setSaving(false);
    }
  };

  // --- Success state ---
  if (result?.success) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center animate-fade-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Config Created</h3>
          <p className="text-sm text-gray-500 mb-6">
            <span className="font-medium text-gray-700">{result.configName}</span>
            {' '}has been created with {selectedCount} stream{selectedCount !== 1 ? 's' : ''}.
            Open it in the config editor to review and fine-tune.
          </p>
          <button onClick={onClose} className="btn-primary px-6 py-2">
            Done
          </button>
        </div>
      </div>
    );
  }

  // --- Main modal ---
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Auto-Configure Streams</h2>
              <p className="text-xs text-gray-500">
                {endpoints_analyzed} endpoint{endpoints_analyzed !== 1 ? 's' : ''} analyzed from {total_requests} HTTP requests
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* API info bar */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <Globe size={14} />
              <span className="font-mono text-xs">{api_base_url || 'Unknown'}</span>
            </div>
            {auth_method && auth_method !== 'no_auth' && (
              <div className="flex items-center gap-1 text-amber-600">
                <Key size={13} />
                <span className="text-xs">{auth_method}</span>
              </div>
            )}
          </div>

          {/* Config name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Config Name</label>
            <input
              type="text"
              value={configName}
              onChange={e => setConfigName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
              placeholder="Name for the new config"
            />
          </div>

          {/* Stream list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Suggested Streams ({selectedCount} of {streams.length} selected)
              </label>
              <button
                onClick={() => setSelected(prev => prev.map(() => !prev.every(Boolean)))}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {selected.every(Boolean) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="space-y-2">
              {streams.map((stream, i) => (
                <StreamRow
                  key={i}
                  stream={stream}
                  index={i}
                  isSelected={selected[i]}
                  isExpanded={expanded[i]}
                  name={names[i]}
                  onToggle={() => toggleStream(i)}
                  onExpand={() => toggleExpand(i)}
                  onNameChange={(val) => updateName(i, val)}
                />
              ))}
            </div>

            {streams.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No data endpoints detected</p>
                <p className="text-xs mt-1">Only GET requests with successful responses are analyzed</p>
              </div>
            )}
          </div>

          {/* Error */}
          {result?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {result.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Streams will be created with the generic REST connector
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || selectedCount === 0 || !configName.trim()}
              className="btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                <>
                  <Database size={15} />
                  Create Config ({selectedCount} stream{selectedCount !== 1 ? 's' : ''})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StreamRow — individual stream row in the review list
// ---------------------------------------------------------------------------

function StreamRow({ stream, index, isSelected, isExpanded, name, onToggle, onExpand, onNameChange }) {
  const { path, primary_keys, records_path, pagination_style, replication_method, replication_key, _meta } = stream;

  return (
    <div className={`border rounded-lg transition-colors ${isSelected ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-gray-50/50 opacity-60'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Checkbox */}
        <label className="flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500/20"
          />
        </label>

        {/* Name input */}
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          className="w-28 px-2 py-1 border border-gray-200 rounded text-sm font-medium bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
          placeholder="stream_name"
        />

        {/* Path */}
        <span className="font-mono text-xs text-gray-500 truncate flex-1" title={path}>
          {path}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {pagination_style !== 'none' && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
              {PAGINATION_LABELS[pagination_style] || pagination_style}
            </span>
          )}
          {primary_keys.length > 0 && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium" title={`PK: ${primary_keys.join(', ')}`}>
              <Key size={10} className="inline mr-0.5" />
              {primary_keys.length}
            </span>
          )}
          {replication_method === 'INCREMENTAL' && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium" title={`Replication key: ${replication_key}`}>
              <Clock size={10} className="inline mr-0.5" />
              Incr
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button onClick={onExpand} className="text-gray-400 hover:text-gray-600 shrink-0">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <DetailRow label="Records Path" value={records_path || '(auto-detect)'} />
            <DetailRow label="Primary Keys" value={primary_keys.join(', ') || '(none detected)'} />
            <DetailRow label="Pagination" value={PAGINATION_LABELS[pagination_style] || pagination_style} />
            <DetailRow label="Replication" value={replication_method} />
            {replication_key && <DetailRow label="Replication Key" value={replication_key} />}
            {pagination_style === 'page' && (
              <>
                <DetailRow label="Page Param" value={stream.pagination_page_param || 'page'} />
                <DetailRow label="Page Size" value={String(stream.pagination_page_size || 100)} />
              </>
            )}
            {pagination_style === 'offset' && (
              <>
                <DetailRow label="Offset Param" value={stream.pagination_offset_param || 'offset'} />
                <DetailRow label="Limit Param" value={stream.pagination_limit_param || 'limit'} />
              </>
            )}
            {pagination_style === 'cursor' && stream.pagination_cursor_path && (
              <DetailRow label="Cursor Path" value={stream.pagination_cursor_path} />
            )}
          </div>

          {/* Meta info */}
          {_meta && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-400">
              <span title="Source URL">
                <Globe size={11} className="inline mr-1" />
                {_meta.source_url}
              </span>
              <span>
                <Layers size={11} className="inline mr-1" />
                {_meta.field_count} fields
              </span>
              <span>
                <ArrowRight size={11} className="inline mr-1" />
                {_meta.call_count}x calls
              </span>
              <span>
                <Clock size={11} className="inline mr-1" />
                {Math.round(_meta.avg_response_time_ms)}ms avg
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-400 w-24 shrink-0">{label}</span>
      <span className="font-mono text-gray-700 truncate">{value}</span>
    </div>
  );
}
