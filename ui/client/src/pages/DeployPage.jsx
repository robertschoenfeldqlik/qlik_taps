import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Upload, KeyRound, CheckCircle, Rocket,
  FileArchive, Eye, EyeOff, Plug, Layers, Shield,
  Download, ChevronDown, ChevronUp, AlertCircle, Edit3,
} from 'lucide-react';
import { exportPackage, previewPackage, importPackage } from '../api/client';
import Toast from '../components/shared/Toast';

const AUTH_LABELS = {
  no_auth: 'No Auth',
  api_key: 'API Key',
  bearer_token: 'Bearer Token',
  basic: 'Basic Auth',
  oauth2: 'OAuth 2.0',
  oauth2_azure: 'Azure AD OAuth',
};

const STEPS = [
  { label: 'Upload', icon: Upload },
  { label: 'Credentials', icon: KeyRound },
  { label: 'Done', icon: CheckCircle },
];

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = idx === currentStep;
        const isComplete = idx < currentStep;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                isComplete ? 'bg-green-500 text-white' :
                isActive ? 'bg-brand-600 text-white shadow-md' :
                'bg-gray-100 text-gray-400'
              }`}>
                {isComplete ? <CheckCircle size={20} /> : <Icon size={20} />}
              </div>
              <span className={`text-xs mt-1.5 font-medium ${
                isActive ? 'text-brand-700' : isComplete ? 'text-green-600' : 'text-gray-400'
              }`}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-20 h-0.5 mx-3 mb-5 transition-colors duration-300 ${
                idx < currentStep ? 'bg-green-400' : 'bg-gray-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SecretInput({ field, label, value, onChange }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}...`}
          className="input-field pr-10 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

function ConfigCard({ config, secrets, onSecretChange }) {
  const [expanded, setExpanded] = useState(true);
  const allFilled = config.required_secrets.length === 0 ||
    config.required_secrets.every(s => secrets[s.field]?.length > 0);

  return (
    <div className={`card border transition-all duration-200 ${
      allFilled ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {allFilled ? (
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle size={16} className="text-green-600" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <KeyRound size={16} className="text-amber-600" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{config.name}</h3>
              {config.description && (
                <p className="text-xs text-gray-400 truncate">{config.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <span className="badge bg-gray-50 text-gray-600 font-mono text-[10px] truncate max-w-[200px]">
              <Plug size={10} />
              {config.api_url || '(no URL)'}
            </span>
            <span className="badge bg-blue-50 text-blue-700 text-[10px]">
              {AUTH_LABELS[config.auth_method] || config.auth_method}
            </span>
            <span className="badge bg-purple-50 text-purple-700 text-[10px]">
              <Layers size={10} /> {config.stream_count}
            </span>
            {config.required_secrets.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="btn-ghost p-1"
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
        </div>

        {expanded && config.required_secrets.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 animate-fade-in">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <Shield size={12} /> Required Credentials
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config.required_secrets.map(secret => (
                <SecretInput
                  key={secret.field}
                  field={secret.field}
                  label={secret.label}
                  value={secrets[secret.field] || ''}
                  onChange={onSecretChange}
                />
              ))}
            </div>
          </div>
        )}

        {config.required_secrets.length === 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
            <Shield size={12} /> No credentials required (public API)
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeployPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [exporting, setExporting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Parsed from uploaded zip
  const [manifest, setManifest] = useState(null);
  const [zipFile, setZipFile] = useState(null);

  // Map of configFile -> { field: value }
  const [secrets, setSecrets] = useState({});

  // Import results
  const [results, setResults] = useState(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      const { data } = await exportPackage();
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'deployment-package.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ visible: true, message: 'Deployment package downloaded', type: 'success' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to export package';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const parseZip = useCallback(async (file) => {
    try {
      const { data: manifestJson } = await previewPackage(file);
      setManifest(manifestJson);
      setZipFile(file);

      // Initialize secrets map
      const initial = {};
      for (const config of manifestJson.configs) {
        initial[config.config_file] = {};
      }
      setSecrets(initial);
      setStep(1);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to parse zip file';
      setToast({ visible: true, message: msg, type: 'error' });
    }
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) parseZip(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      parseZip(file);
    } else {
      setToast({ visible: true, message: 'Please drop a .zip file', type: 'error' });
    }
  };

  const handleSecretChange = (configFile, field, value) => {
    setSecrets(prev => ({
      ...prev,
      [configFile]: { ...prev[configFile], [field]: value },
    }));
  };

  const handleDeploy = async () => {
    if (!zipFile || !manifest) return;
    try {
      setDeploying(true);
      const { data } = await importPackage(zipFile, secrets);
      setResults(data);
      setStep(2);
      setToast({ visible: true, message: data.message, type: 'success' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Deployment failed';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setDeploying(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setManifest(null);
    setZipFile(null);
    setSecrets({});
    setResults(null);
  };

  const allSecretsProvided = manifest?.configs.every(c =>
    c.required_secrets.length === 0 ||
    c.required_secrets.every(s => secrets[c.config_file]?.[s.field]?.length > 0)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-header flex items-center gap-2.5">
            <Package size={28} className="text-brand-600" />
            Deploy
          </h1>
          <p className="page-subtitle">
            Export configs as a portable package or import one with credentials
          </p>
        </div>
      </div>

      {/* Export Section */}
      <div className="card border-brand-200 bg-gradient-to-r from-brand-50/50 to-white mb-8 animate-fade-in">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                <Download size={20} className="text-brand-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 tracking-tight">Export Deployment Package</h3>
                <p className="text-xs text-gray-500">
                  Download all configs as a portable zip — secrets are stripped for safe sharing
                </p>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Exporting...
                </>
              ) : (
                <>
                  <Package size={16} /> Export Package
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Import Section */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Rocket size={20} className="text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Import & Deploy</h2>
        </div>

        <StepIndicator currentStep={step} />

        {/* Step 0: Upload */}
        {step === 0 && (
          <div className="animate-fade-in">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                dragOver
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
              }`}
            >
              <FileArchive size={48} className={`mx-auto mb-4 ${dragOver ? 'text-brand-500' : 'text-gray-300'}`} />
              <h3 className="text-lg font-medium text-gray-600 mb-1">
                Drop deployment package here
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                or click to browse for a <code className="text-brand-600">.zip</code> file
              </p>
              <span className="btn-secondary inline-flex items-center gap-2">
                <Upload size={16} /> Choose File
              </span>
            </div>
          </div>
        )}

        {/* Step 1: Credentials */}
        {step === 1 && manifest && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-600">
                  <strong>{manifest.configs.length}</strong> config{manifest.configs.length !== 1 ? 's' : ''} found in package.
                  Enter credentials for each connection below.
                </p>
                {manifest.exported_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Exported {new Date(manifest.exported_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button onClick={handleReset} className="btn-ghost text-sm">
                Cancel
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {manifest.configs.map(config => (
                <ConfigCard
                  key={config.config_file}
                  config={config}
                  secrets={secrets[config.config_file] || {}}
                  onSecretChange={(field, value) =>
                    handleSecretChange(config.config_file, field, value)
                  }
                />
              ))}
            </div>

            {!allSecretsProvided && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-4">
                <AlertCircle size={16} />
                Some credentials are missing. You can still deploy, but those taps won't be able to connect until you add them later.
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button onClick={handleReset} className="btn-secondary">
                Back
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="btn-primary flex items-center gap-2"
              >
                {deploying ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket size={16} /> Deploy {manifest.configs.length} Config{manifest.configs.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Done */}
        {step === 2 && results && (
          <div className="animate-fade-in text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Deployment Complete
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Successfully imported <strong>{results.imported}</strong> config{results.imported !== 1 ? 's' : ''}.
            </p>

            {results.configs && results.configs.length > 0 && (
              <div className="max-w-md mx-auto mb-6 space-y-2">
                {results.configs.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-green-500" />
                      <span className="text-sm font-medium text-gray-700">{c.name}</span>
                    </div>
                    <button
                      onClick={() => navigate(`/configs/${c.id}/edit`)}
                      className="btn-ghost text-xs flex items-center gap-1"
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button onClick={handleReset} className="btn-secondary">
                Deploy Another
              </button>
              <button
                onClick={() => navigate('/taps')}
                className="btn-primary flex items-center gap-2"
              >
                <Rocket size={16} /> Go to Run Taps
              </button>
            </div>
          </div>
        )}
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
