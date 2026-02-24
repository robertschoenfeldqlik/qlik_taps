import { Plus, Layers } from 'lucide-react';
import StreamForm from './StreamForm';

const DEFAULT_STREAM = {
  name: '',
  path: '',
  primary_keys: [],
  replication_method: 'FULL_TABLE',
  replication_key: '',
  records_path: '',
  pagination_style: 'none',
  denest: true,
  params: {},
  headers: {},
};

export default function StreamsTab({ streams, onChange }) {
  const addStream = () => {
    onChange([...streams, { ...DEFAULT_STREAM }]);
  };

  const updateStream = (index, updated) => {
    const newStreams = streams.map((s, i) => (i === index ? updated : s));
    onChange(newStreams);
  };

  const removeStream = (index) => {
    if (window.confirm(`Remove stream "${streams[index].name || `Stream ${index + 1}`}"?`)) {
      onChange(streams.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Layers size={16} />
          {streams.length} stream{streams.length !== 1 ? 's' : ''} configured
        </div>
        <button onClick={addStream} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Stream
        </button>
      </div>

      {streams.length === 0 ? (
        <div className="card p-12 text-center">
          <Layers size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">No streams configured</h3>
          <p className="text-sm text-gray-400 mb-4">
            Each stream maps to one API endpoint. Add a stream to define what data to extract.
          </p>
          <button onClick={addStream} className="btn-primary">
            <Plus size={16} className="inline mr-1" /> Add Your First Stream
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {streams.map((stream, index) => (
            <StreamForm
              key={index}
              stream={stream}
              index={index}
              onUpdate={updateStream}
              onRemove={removeStream}
            />
          ))}
        </div>
      )}
    </div>
  );
}
