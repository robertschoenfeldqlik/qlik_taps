import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Upload, CheckCircle, Rocket,
  FileArchive, Plug, Layers, Download, Edit3, KeyRound,
} from 'lucide-react';
import { exportPackage, importPackage } from '../api/client';
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

export default function DeployPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  const handleImport = async (file) => {
    try {
      setImporting(true);
      const { data } = await importPackage(file);
      setResults(data);
      setStep(1);
      setToast({ visible: true, message: data.message, type: 'success' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to import package';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      handleImport(file);
    } else {
      setToast({ visible: true, message: 'Please drop a .zip file', type: 'error' });
    }
  };

  const handleReset = () => {
    setStep(0);
    setResults(null);
  };

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
            Export configs as a portable package or import one to deploy locally
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
                  Download all configs as a portable zip — credentials are never included
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
              onClick={() => !importing && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
                importing ? 'border-brand-300 bg-brand-50/50' :
                dragOver
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              {importing ? (
                <>
                  <div className="animate-spin w-10 h-10 border-3 border-brand-600 border-t-transparent rounded-full mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-1">Importing...</h3>
                  <p className="text-sm text-gray-400">Creating configs from package</p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Done */}
        {step === 1 && results && (
          <div className="animate-fade-in text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Import Complete
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              Successfully imported <strong>{results.imported}</strong> config{results.imported !== 1 ? 's' : ''}.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-sm text-amber-600 mb-6">
              <KeyRound size={14} />
              Edit each config to add your credentials before running.
            </div>

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
                      className="btn-ghost text-xs flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
                    >
                      <KeyRound size={12} /> Add Credentials
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button onClick={handleReset} className="btn-secondary">
                Import Another
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
