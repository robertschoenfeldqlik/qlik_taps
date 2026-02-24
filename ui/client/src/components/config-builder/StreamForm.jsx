import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, GripVertical } from 'lucide-react';
import PaginationSection from './PaginationSection';
import BookmarkSection from './BookmarkSection';
import KeyValueEditor from './KeyValueEditor';

export default function StreamForm({ stream, index, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  const [showSchema, setShowSchema] = useState(false);

  const set = (field, value) => {
    onUpdate(index, { ...stream, [field]: value });
  };

  // Convert per-stream headers/params to key-value pairs
  const headerPairs = Object.entries(stream.headers || {}).map(([key, value]) => ({ key, value }));
  const paramPairs = Object.entries(stream.params || {}).map(([key, value]) => ({ key, value }));

  const setHeaders = (pairs) => {
    const obj = {};
    pairs.forEach(p => { if (p.key) obj[p.key] = p.value; });
    set('headers', obj);
  };

  const setParams = (pairs) => {
    const obj = {};
    pairs.forEach(p => { if (p.key) obj[p.key] = p.value; });
    set('params', obj);
  };

  // Primary keys as comma-separated string
  const primaryKeysStr = (stream.primary_keys || []).join(', ');
  const setPrimaryKeys = (str) => {
    const keys = str.split(',').map(k => k.trim()).filter(Boolean);
    set('primary_keys', keys);
  };

  return (
    <div className="card overflow-hidden">
      {/* Stream Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <GripVertical size={16} className="text-gray-400" />
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <div className="flex-1">
          <span className="font-medium text-gray-800">
            {stream.name || `Stream ${index + 1}`}
          </span>
          {stream.path && (
            <span className="ml-2 text-xs text-gray-400 font-mono">{stream.path}</span>
          )}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
          {stream.replication_method === 'INCREMENTAL' ? 'Incremental' : 'Full Table'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Remove stream"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Stream Body */}
      {expanded && (
        <div className="p-4 space-y-6">
          {/* Basic Info */}
          <div>
            <h4 className="section-title">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">
                  Stream Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="users"
                  value={stream.name || ''}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">
                  Endpoint Path <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="/v1/users"
                  value={stream.path || ''}
                  onChange={(e) => set('path', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="input-label">Primary Keys</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="id (comma-separated)"
                  value={primaryKeysStr}
                  onChange={(e) => setPrimaryKeys(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Records JSONPath</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="$.data (auto-detect if empty)"
                  value={stream.records_path || ''}
                  onChange={(e) => set('records_path', e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={stream.denest !== false}
                  onChange={(e) => set('denest', e.target.checked)}
                />
                Enable denesting (flatten nested objects, split arrays into child tables)
              </label>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Replication / Bookmarks */}
          <div>
            <h4 className="section-title">Replication & Bookmarks</h4>
            <BookmarkSection stream={stream} onUpdate={(updated) => onUpdate(index, updated)} />
          </div>

          <hr className="border-gray-200" />

          {/* Pagination */}
          <div>
            <h4 className="section-title">Pagination</h4>
            <PaginationSection stream={stream} onUpdate={(updated) => onUpdate(index, updated)} />
          </div>

          <hr className="border-gray-200" />

          {/* Per-Stream Params & Headers */}
          <div>
            <h4 className="section-title">Stream-Specific Parameters</h4>
            <div className="space-y-4">
              <KeyValueEditor
                label="URL Parameters"
                pairs={paramPairs}
                onChange={setParams}
                keyPlaceholder="Param Name"
                valuePlaceholder="Param Value"
              />
              <KeyValueEditor
                label="HTTP Headers"
                pairs={headerPairs}
                onChange={setHeaders}
                keyPlaceholder="Header Name"
                valuePlaceholder="Header Value"
              />
            </div>
          </div>

          {/* Optional Static Schema */}
          <div>
            <button
              onClick={() => setShowSchema(!showSchema)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              {showSchema ? 'Hide' : 'Show'} Static Schema (Advanced)
            </button>
            {showSchema && (
              <div className="mt-2">
                <label className="input-label text-xs">JSON Schema Override</label>
                <textarea
                  className="input-field font-mono text-xs"
                  rows={8}
                  placeholder='{"type": "object", "properties": {"id": {"type": "integer"}}}'
                  value={stream.schema ? JSON.stringify(stream.schema, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
                      set('schema', parsed);
                    } catch {
                      // Allow invalid JSON while typing
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-1">
                  If provided, skips auto-inference. Must be valid JSON Schema.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
