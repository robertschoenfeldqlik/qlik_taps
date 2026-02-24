export default function BookmarkSection({ stream, onUpdate }) {
  const method = stream.replication_method || 'FULL_TABLE';

  const set = (field, value) => {
    onUpdate({ ...stream, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="input-label">Replication Method</label>
        <select
          className="input-field"
          value={method}
          onChange={(e) => set('replication_method', e.target.value)}
        >
          <option value="FULL_TABLE">Full Table (re-sync all records every run)</option>
          <option value="INCREMENTAL">Incremental (only new/updated records)</option>
        </select>
      </div>

      {method === 'INCREMENTAL' && (
        <div className="space-y-3 bg-amber-50/50 rounded-lg p-3 border border-amber-100">
          <div>
            <label className="input-label text-xs">
              Replication Key <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="updated_at"
              value={stream.replication_key || ''}
              onChange={(e) => set('replication_key', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Field name with a timestamp or sequence value that increases with updates
            </p>
          </div>

          <div>
            <label className="input-label text-xs">Bookmark URL Param</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="updated_since (defaults to replication key name)"
              value={stream.bookmark_param || ''}
              onChange={(e) => set('bookmark_param', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              URL parameter name to pass the bookmark value to the API
            </p>
          </div>

          <div>
            <label className="input-label text-xs">Bookmark Filter Template</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="$filter=modifiedDate ge {bookmark}"
              value={stream.bookmark_filter || ''}
              onChange={(e) => set('bookmark_filter', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Use <code className="bg-gray-200 px-1 rounded text-xs">{'{bookmark}'}</code> as placeholder for the saved value
            </p>
          </div>

          <div>
            <label className="input-label text-xs">Filter Param Name</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="$filter"
              value={stream.bookmark_filter_param || ''}
              onChange={(e) => set('bookmark_filter_param', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              URL parameter name to put the rendered filter into
            </p>
          </div>
        </div>
      )}

      {method === 'FULL_TABLE' && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
          All records will be fetched on every sync run. No bookmark tracking.
        </div>
      )}
    </div>
  );
}
