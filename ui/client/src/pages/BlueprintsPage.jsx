import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Fingerprint, ToggleLeft, ToggleRight, Trash2,
  Globe, Lock, ExternalLink, Clock, Server,
  ChevronDown, ChevronRight, Layers, Zap,
} from 'lucide-react';
import {
  getBlueprints, deleteBlueprint, activateBlueprint, deactivateBlueprint,
} from '../api/client';
import Toast from '../components/shared/Toast';

const AUTH_LABELS = {
  no_auth: 'No Auth',
  api_key: 'API Key',
  bearer_token: 'Bearer Token',
  basic: 'Basic Auth',
  oauth2: 'OAuth 2.0',
  oauth2_azure: 'Azure AD OAuth',
};

function BlueprintCard({ blueprint, onToggle, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = blueprint.active === 1;

  return (
    <div className={`card overflow-hidden transition-all ${
      isActive ? 'border-green-200 bg-gradient-to-r from-green-50/30 to-white' : ''
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isActive ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <Fingerprint size={20} className={isActive ? 'text-green-600' : 'text-gray-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 truncate">{blueprint.name}</h3>
                {isActive && (
                  <span className="badge bg-green-50 text-green-700 border-green-200 text-[10px]">Active</span>
                )}
              </div>
              {blueprint.description && (
                <p className="text-xs text-gray-500 mb-1.5 truncate">{blueprint.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Globe size={11} />
                  {blueprint.api_base_url || 'Unknown API'}
                </span>
                <span className="flex items-center gap-1">
                  <Lock size={11} />
                  {AUTH_LABELS[blueprint.auth_method] || blueprint.auth_method}
                </span>
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  {blueprint.endpoint_count} endpoint{blueprint.endpoint_count !== 1 ? 's' : ''}
                </span>
                {blueprint.source_config_name && (
                  <span className="flex items-center gap-1">
                    <Server size={11} />
                    {blueprint.source_config_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              onClick={() => onToggle(blueprint.id, isActive)}
              className={`p-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-green-600 hover:bg-green-50'
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
              title={isActive ? 'Deactivate' : 'Activate'}
            >
              {isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            </button>
            <button
              onClick={() => onDelete(blueprint.id, blueprint.name)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Mock URL info — shown when active */}
        {isActive && (
          <div className="mt-3 p-2.5 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2 text-xs">
              <Zap size={12} className="text-green-600" />
              <span className="text-green-700 font-medium">Mock endpoints active</span>
            </div>
            <p className="text-[11px] text-green-600 mt-1 font-mono">
              /api/mock/blueprint/{blueprint.id}/0, /1, ...
            </p>
          </div>
        )}
      </div>

      {/* Timestamp footer */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Clock size={11} />
          Created {new Date(blueprint.created_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
          })}
        </div>
      </div>
    </div>
  );
}

export default function BlueprintsPage() {
  const navigate = useNavigate();
  const [blueprints, setBlueprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const loadBlueprints = async () => {
    try {
      setLoading(true);
      const { data } = await getBlueprints();
      setBlueprints(data);
    } catch (err) {
      setToast({ visible: true, message: 'Failed to load blueprints', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlueprints();
  }, []);

  const handleToggle = async (id, isActive) => {
    try {
      if (isActive) {
        await deactivateBlueprint(id);
        setToast({ visible: true, message: 'Blueprint deactivated', type: 'success' });
      } else {
        await activateBlueprint(id);
        setToast({ visible: true, message: 'Blueprint activated — mock endpoints are live', type: 'success' });
      }
      loadBlueprints();
    } catch (err) {
      setToast({ visible: true, message: 'Failed to toggle blueprint', type: 'error' });
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete blueprint "${name}"? This cannot be undone.`)) return;
    try {
      await deleteBlueprint(id);
      setToast({ visible: true, message: 'Blueprint deleted', type: 'success' });
      loadBlueprints();
    } catch (err) {
      setToast({ visible: true, message: 'Failed to delete blueprint', type: 'error' });
    }
  };

  const activeCount = blueprints.filter(b => b.active === 1).length;

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="page-header flex items-center gap-2.5">
          <Fingerprint size={28} className="text-brand-600" />
          Mock Blueprints
        </h1>
        <p className="page-subtitle">
          API blueprints captured from tap runs — activate to serve dynamic mock data
        </p>
      </div>

      {/* Stats bar */}
      {blueprints.length > 0 && (
        <div className="flex items-center gap-4 mb-6 text-sm text-gray-500">
          <span>{blueprints.length} blueprint{blueprints.length !== 1 ? 's' : ''}</span>
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-green-600">
              <Zap size={14} /> {activeCount} active
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading blueprints...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && blueprints.length === 0 && (
        <div className="card p-12 text-center">
          <Fingerprint size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No Blueprints Yet</h3>
          <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">
            Run a tap against a real API, then click "Generate Mock Dataset" on the run detail page
            to capture the API structure as a reusable mock blueprint.
          </p>
          <button
            onClick={() => navigate('/taps')}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Globe size={16} /> Go to Run Taps
          </button>
        </div>
      )}

      {/* Blueprint list */}
      {!loading && blueprints.length > 0 && (
        <div className="space-y-3">
          {blueprints.map(bp => (
            <BlueprintCard
              key={bp.id}
              blueprint={bp}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
