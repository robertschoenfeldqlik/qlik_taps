import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Square, Clock, Hash, Layers, AlertTriangle,
  CheckCircle, XCircle, Loader, Play, Timer, Table, ChevronDown, ChevronRight,
} from 'lucide-react';
import { getTapRun, stopTapRun, getRunStreamUrl } from '../api/client';
import Toast from '../components/shared/Toast';

function StatusBadge({ status }) {
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
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full border ${style}`}>
      <Icon size={14} className={status === 'running' || status === 'discovering' ? 'animate-spin' : ''} />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.floor((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function classifyLine(line) {
  if (line.startsWith('[stderr]')) return 'stderr';
  try {
    const msg = JSON.parse(line);
    if (msg.type === 'RECORD') return 'record';
    if (msg.type === 'SCHEMA') return 'schema';
    if (msg.type === 'STATE') return 'state';
  } catch (e) { /* not JSON */ }
  return 'default';
}

const LINE_COLORS = {
  record: 'text-green-400',
  schema: 'text-blue-400',
  state: 'text-yellow-400',
  stderr: 'text-red-400',
  default: 'text-gray-300',
};

function truncateValue(val, maxLen = 60) {
  if (val === null || val === undefined) return '—';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function DataSamplePanel({ sampleRecords }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedStreams, setExpandedStreams] = useState({});

  // Parse sample_records — could be a string (from DB) or object (from SSE)
  const samples = typeof sampleRecords === 'string'
    ? (() => { try { return JSON.parse(sampleRecords); } catch { return null; } })()
    : sampleRecords;

  if (!samples || typeof samples !== 'object') return null;

  const streamNames = Object.keys(samples).filter(k => samples[k]?.length > 0);
  if (streamNames.length === 0) return null;

  const totalRecords = streamNames.reduce((sum, k) => sum + samples[k].length, 0);

  const toggleStream = (name) => {
    setExpandedStreams(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-brand-600 transition-colors"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Table size={16} />
        Data Sample
        <span className="text-xs font-normal text-gray-400">
          ({totalRecords} records across {streamNames.length} {streamNames.length === 1 ? 'stream' : 'streams'})
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {streamNames.map(streamName => {
            const records = samples[streamName];
            const columns = records.length > 0 ? Object.keys(records[0]) : [];
            const isStreamExpanded = expandedStreams[streamName] !== false; // default open

            return (
              <div key={streamName} className="card overflow-hidden">
                <button
                  onClick={() => toggleStream(streamName)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isStreamExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-sm font-medium text-gray-800 font-mono">{streamName}</span>
                    <span className="text-xs text-gray-400">{records.length} records, {columns.length} fields</span>
                  </div>
                </button>

                {isStreamExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-3 py-2 text-left text-gray-500 font-medium w-8">#</th>
                          {columns.map(col => (
                            <th key={col} className="px-3 py-2 text-left text-gray-500 font-medium font-mono whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50/50">
                            <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                            {columns.map(col => (
                              <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs truncate" title={String(record[col] ?? '')}>
                                {truncateValue(record[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RunDetailPage() {
  const { id: runId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const streamToken = location.state?.streamToken;
  const logContainerRef = useRef(null);
  const [run, setRun] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [durationTick, setDurationTick] = useState(0);

  // Live duration ticker when running
  useEffect(() => {
    if (run && ['running', 'discovering', 'pending'].includes(run.status)) {
      const timer = setInterval(() => setDurationTick(t => t + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [run?.status]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logLines, autoScroll]);

  // Load initial data + establish SSE
  useEffect(() => {
    let eventSource = null;

    const loadAndConnect = async () => {
      try {
        const { data } = await getTapRun(runId);
        setRun(data);
        if (data.output_log) {
          setLogLines(data.output_log.split('\n').filter(Boolean));
        }
        setLoading(false);

        // Only connect SSE if the run might still be active
        const isTerminal = ['completed', 'failed', 'stopped'].includes(data.status);
        if (!isTerminal) {
          connectSSE(streamToken);
        }
      } catch (err) {
        console.error('Failed to load run:', err);
        setToast({ visible: true, message: 'Failed to load run details', type: 'error' });
        setLoading(false);
      }
    };

    const connectSSE = (streamToken) => {
      const sseUrl = streamToken
        ? `${getRunStreamUrl(runId)}?token=${encodeURIComponent(streamToken)}`
        : getRunStreamUrl(runId);
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'log') {
            setLogLines(prev => [...prev, data.line]);
          } else if (data.type === 'status') {
            setRun(prev => prev ? { ...prev, ...data } : prev);
          } else if (data.type === 'complete') {
            setRun(prev => prev ? { ...prev, ...data } : prev);
            if (eventSource) eventSource.close();
          } else if (data.type === 'error') {
            setRun(prev => prev
              ? { ...prev, status: 'failed', error_message: data.message }
              : prev
            );
            if (eventSource) eventSource.close();
          } else if (data.type === 'log_history') {
            setLogLines(data.log.split('\n').filter(Boolean));
          }
        } catch (e) {
          // Ignore unparseable SSE data
        }
      };

      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
      };
    };

    loadAndConnect();

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [runId]);

  const handleStop = async () => {
    try {
      await stopTapRun(runId);
      setRun(prev => prev ? { ...prev, status: 'stopped', completed_at: new Date().toISOString() } : prev);
      setToast({ visible: true, message: 'Run stopped', type: 'success' });
    } catch (err) {
      setToast({ visible: true, message: 'Failed to stop run', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader size={32} className="animate-spin text-brand-600" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Run not found.</p>
        <button onClick={() => navigate('/taps')} className="btn-secondary mt-4">
          Back to Taps
        </button>
      </div>
    );
  }

  const isRunning = ['running', 'discovering', 'pending'].includes(run.status);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/taps')}
            className="btn-ghost p-2"
            title="Back to Taps"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {run.config_name}
              <span className="text-gray-400 font-normal ml-2">— {run.mode}</span>
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{run.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          {isRunning && (
            <button
              onClick={handleStop}
              className="btn-danger flex items-center gap-1.5"
            >
              <Square size={14} /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Timer size={14} /> Duration
          </div>
          <p className="text-lg font-semibold text-gray-800">
            {formatDuration(run.started_at, run.completed_at)}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Hash size={14} /> Records Synced
          </div>
          <p className="text-lg font-semibold text-gray-800">
            {(run.records_synced || 0).toLocaleString()}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Layers size={14} /> Streams
          </div>
          <p className="text-lg font-semibold text-gray-800">
            {run.streams_discovered || 0}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Play size={14} /> Mode
          </div>
          <p className="text-lg font-semibold text-gray-800 capitalize">
            {run.mode}
          </p>
        </div>
      </div>

      {/* Data sample panel */}
      {run.sample_records && <DataSamplePanel sampleRecords={run.sample_records} />}

      {/* Error panel */}
      {run.error_message && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-700 mb-1">Error</h4>
              <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">
                {run.error_message}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Log viewer */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-600">Output Log</h3>
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
        <div
          ref={logContainerRef}
          className="bg-gray-900 rounded-lg p-4 overflow-y-auto font-mono text-xs leading-relaxed"
          style={{ maxHeight: '55vh' }}
        >
          {logLines.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              {isRunning ? 'Waiting for output...' : 'No output recorded.'}
            </div>
          ) : (
            logLines.map((line, idx) => {
              const lineType = classifyLine(line);
              return (
                <div key={idx} className={`flex ${LINE_COLORS[lineType]}`}>
                  <span className="text-gray-600 select-none w-12 text-right pr-3 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="whitespace-pre-wrap break-all">{line}</span>
                </div>
              );
            })
          )}
          {isRunning && (
            <div className="text-yellow-500 mt-1 flex items-center gap-2">
              <Loader size={12} className="animate-spin" />
              Tap is running...
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> RECORD
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> SCHEMA
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> STATE
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> stderr
        </span>
      </div>

      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
