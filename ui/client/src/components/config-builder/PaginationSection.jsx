const PAGINATION_STYLES = [
  { value: 'none', label: 'None (Single Request)' },
  { value: 'page', label: 'Page Number' },
  { value: 'offset', label: 'Offset / Limit' },
  { value: 'cursor', label: 'Cursor / Token' },
  { value: 'link_header', label: 'Link Header (RFC 5988)' },
  { value: 'jsonpath', label: 'JSONPath Next Page' },
  { value: 'odata', label: 'OData (@odata.nextLink)' },
];

export default function PaginationSection({ stream, onUpdate }) {
  const style = stream.pagination_style || 'none';

  const set = (field, value) => {
    onUpdate({ ...stream, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="input-label">Pagination Style</label>
        <select
          className="input-field"
          value={style}
          onChange={(e) => set('pagination_style', e.target.value)}
        >
          {PAGINATION_STYLES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Page Number fields */}
      {style === 'page' && (
        <div className="space-y-3 bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label text-xs">Page Param Name</label>
              <input
                type="text"
                className="input-field text-sm"
                placeholder="page"
                value={stream.pagination_page_param || ''}
                onChange={(e) => set('pagination_page_param', e.target.value)}
              />
            </div>
            <div>
              <label className="input-label text-xs">Size Param Name</label>
              <input
                type="text"
                className="input-field text-sm"
                placeholder="per_page"
                value={stream.pagination_size_param || ''}
                onChange={(e) => set('pagination_size_param', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label text-xs">Page Size</label>
              <input
                type="number"
                className="input-field text-sm"
                placeholder="100"
                value={stream.pagination_page_size || ''}
                onChange={(e) => set('pagination_page_size', e.target.value ? parseInt(e.target.value) : '')}
              />
            </div>
            <div>
              <label className="input-label text-xs">Start Page</label>
              <input
                type="number"
                className="input-field text-sm"
                placeholder="1"
                value={stream.pagination_start_page || ''}
                onChange={(e) => set('pagination_start_page', e.target.value ? parseInt(e.target.value) : '')}
              />
            </div>
          </div>
          <div>
            <label className="input-label text-xs">Total Count JSONPath</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="$.meta.total (optional)"
              value={stream.pagination_total_path || ''}
              onChange={(e) => set('pagination_total_path', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Offset fields */}
      {style === 'offset' && (
        <div className="space-y-3 bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label text-xs">Offset Param Name</label>
              <input
                type="text"
                className="input-field text-sm"
                placeholder="offset"
                value={stream.pagination_offset_param || ''}
                onChange={(e) => set('pagination_offset_param', e.target.value)}
              />
            </div>
            <div>
              <label className="input-label text-xs">Limit Param Name</label>
              <input
                type="text"
                className="input-field text-sm"
                placeholder="limit"
                value={stream.pagination_limit_param || ''}
                onChange={(e) => set('pagination_limit_param', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="input-label text-xs">Page Size</label>
            <input
              type="number"
              className="input-field text-sm"
              placeholder="100"
              value={stream.pagination_page_size || ''}
              onChange={(e) => set('pagination_page_size', e.target.value ? parseInt(e.target.value) : '')}
            />
          </div>
        </div>
      )}

      {/* Cursor fields */}
      {style === 'cursor' && (
        <div className="space-y-3 bg-gray-50 rounded-lg p-3">
          <div>
            <label className="input-label text-xs">Cursor JSONPath</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="$.meta.next_cursor"
              value={stream.pagination_cursor_path || ''}
              onChange={(e) => set('pagination_cursor_path', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">JSONPath to the next cursor value in the response</p>
          </div>
          <div>
            <label className="input-label text-xs">Cursor Param Name</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="cursor"
              value={stream.pagination_cursor_param || ''}
              onChange={(e) => set('pagination_cursor_param', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Link Header - no extra fields */}
      {style === 'link_header' && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
          Follows the <code className="bg-gray-200 px-1 rounded">rel="next"</code> link from the response Link header. Common with GitHub, GitLab, and similar APIs.
        </div>
      )}

      {/* JSONPath Next */}
      {style === 'jsonpath' && (
        <div className="space-y-3 bg-gray-50 rounded-lg p-3">
          <div>
            <label className="input-label text-xs">Next Page JSONPath</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="$.paging.next"
              value={stream.pagination_next_path || ''}
              onChange={(e) => set('pagination_next_path', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                checked={stream.pagination_next_is_url !== false}
                onChange={(e) => set('pagination_next_is_url', e.target.checked)}
              />
              Value is a full URL
            </label>
          </div>
          {stream.pagination_next_is_url === false && (
            <div>
              <label className="input-label text-xs">Cursor Param Name</label>
              <input
                type="text"
                className="input-field text-sm"
                placeholder="cursor"
                value={stream.pagination_cursor_param || ''}
                onChange={(e) => set('pagination_cursor_param', e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* OData - no extra fields */}
      {style === 'odata' && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
          Follows <code className="bg-gray-200 px-1 rounded">@odata.nextLink</code> in the response body. Used with Microsoft, SAP, and OData-compliant APIs.
        </div>
      )}
    </div>
  );
}
