import { Plus, Trash2 } from 'lucide-react';

export default function KeyValueEditor({ label, pairs, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
  const addRow = () => {
    onChange([...pairs, { key: '', value: '' }]);
  };

  const removeRow = (index) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    const updated = pairs.map((pair, i) =>
      i === index ? { ...pair, [field]: value } : pair
    );
    onChange(updated);
  };

  return (
    <div>
      {label && <label className="input-label">{label}</label>}
      <div className="space-y-2">
        {pairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              className="input-field flex-1"
              placeholder={keyPlaceholder}
              value={pair.key}
              onChange={(e) => updateRow(index, 'key', e.target.value)}
            />
            <input
              type="text"
              className="input-field flex-1"
              placeholder={valuePlaceholder}
              value={pair.value}
              onChange={(e) => updateRow(index, 'value', e.target.value)}
            />
            <button
              onClick={() => removeRow(index)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium py-1"
        >
          <Plus size={16} /> Add {label ? label.replace(/s$/, '') : 'Row'}
        </button>
      </div>
    </div>
  );
}
