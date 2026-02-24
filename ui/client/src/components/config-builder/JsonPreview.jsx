import { useState } from 'react';
import { Copy, Download, Check, Save } from 'lucide-react';
import { cleanConfig } from '../../../../shared/cleanConfig.js';

export default function JsonPreview({ config, onSave }) {
  const [copied, setCopied] = useState(false);

  const cleanedConfig = cleanConfig(config);
  const jsonString = JSON.stringify(cleanedConfig, null, 2);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = jsonString;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'config.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button onClick={copyToClipboard} className="btn-secondary flex items-center gap-2">
          {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button onClick={downloadJson} className="btn-secondary flex items-center gap-2">
          <Download size={16} /> Download config.json
        </button>
        {onSave && (
          <button onClick={onSave} className="btn-primary flex items-center gap-2">
            <Save size={16} /> Save to Library
          </button>
        )}
      </div>

      {/* JSON Preview */}
      <div className="relative">
        <pre className="bg-slate-900 text-green-400 rounded-xl p-4 overflow-auto max-h-[600px] text-sm font-mono leading-relaxed">
          {jsonString}
        </pre>
      </div>

      {/* Quick Stats */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>Auth: {cleanedConfig.auth_method || 'no_auth'}</span>
        <span>Streams: {cleanedConfig.streams?.length || 0}</span>
        <span>Size: {new Blob([jsonString]).size} bytes</span>
      </div>
    </div>
  );
}

export { cleanConfig };
