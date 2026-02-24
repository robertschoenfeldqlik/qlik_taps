import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { getConfig, createConfig, updateConfig } from '../api/client';
import ConfigBuilder from '../components/config-builder/ConfigBuilder';
import { cleanConfig } from '../components/config-builder/JsonPreview';
import Modal from '../components/shared/Modal';
import Toast from '../components/shared/Toast';

// Minimum interval between save requests (debounce)
const SAVE_DEBOUNCE_MS = 1000;

export default function BuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [configName, setConfigName] = useState('');
  const [configDesc, setConfigDesc] = useState('');
  const [initialConfig, setInitialConfig] = useState(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [pendingConfig, setPendingConfig] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const lastSaveRef = useRef(0);

  // Load existing config for editing
  useEffect(() => {
    if (!isEditing) {
      setInitialConfig({});
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const { data } = await getConfig(id);
        setConfigName(data.name);
        setConfigDesc(data.description || '');
        setInitialConfig(data.config_json);
      } catch (err) {
        console.error('Failed to load config:', err);
        setToast({ visible: true, message: 'Failed to load config', type: 'error' });
        navigate('/taps');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditing, navigate]);

  const doSave = useCallback(async (name, description, configJson) => {
    // Debounce: prevent rapid successive saves
    const now = Date.now();
    if (now - lastSaveRef.current < SAVE_DEBOUNCE_MS) {
      return;
    }
    if (saving) return;

    setSaving(true);
    lastSaveRef.current = now;

    try {
      if (isEditing) {
        await updateConfig(id, { name, description, config_json: configJson });
        setToast({ visible: true, message: 'Config saved', type: 'success' });
      } else {
        const { data } = await createConfig({ name, description, config_json: configJson });
        setToast({ visible: true, message: 'Config created', type: 'success' });
        navigate(`/configs/${data.id}/edit`, { replace: true });
      }
      setSaveModal(false);
    } catch (err) {
      console.error('Failed to save config:', err);
      setToast({ visible: true, message: 'Failed to save config', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [isEditing, id, saving, navigate]);

  const handleSave = useCallback((config) => {
    const cleaned = cleanConfig(config);
    setPendingConfig(cleaned);

    if (isEditing) {
      doSave(configName, configDesc, cleaned);
    } else {
      setSaveModal(true);
    }
  }, [isEditing, configName, configDesc, doSave]);

  const handleModalSave = () => {
    if (!configName.trim()) return;
    doSave(configName.trim(), configDesc.trim(), pendingConfig);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="btn-ghost flex items-center gap-1"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            {isEditing ? (
              <input
                type="text"
                className="text-xl font-bold text-gray-800 bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none px-1 py-0.5 transition-colors"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Config Name"
              />
            ) : (
              <h1 className="text-xl font-bold text-gray-800">New Configuration</h1>
            )}
          </div>
        </div>

        {isEditing && (
          <button
            onClick={() => {
              const event = new CustomEvent('trigger-save');
              window.dispatchEvent(event);
            }}
            className="btn-primary flex items-center gap-2"
            disabled={saving}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Config Builder */}
      {initialConfig !== null && (
        <div className="card p-6">
          <ConfigBuilder
            initialConfig={initialConfig}
            onSave={handleSave}
          />
        </div>
      )}

      {/* Save Modal (for new configs) */}
      <Modal
        isOpen={saveModal}
        onClose={() => setSaveModal(false)}
        title="Save Configuration"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">
              Config Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="My API Config"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="input-label">Description</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Optional description..."
              value={configDesc}
              onChange={(e) => setConfigDesc(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setSaveModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleModalSave}
              className="btn-primary"
              disabled={!configName.trim()}
            >
              Save
            </button>
          </div>
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
