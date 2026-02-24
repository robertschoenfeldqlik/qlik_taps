import { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', isVisible, onClose }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const config = {
    success: { border: 'border-l-green-500', icon: CheckCircle, iconColor: 'text-green-500' },
    error: { border: 'border-l-red-500', icon: AlertCircle, iconColor: 'text-red-500' },
    info: { border: 'border-l-brand-500', icon: Info, iconColor: 'text-brand-500' },
  };

  const { border, icon: Icon, iconColor } = config[type] || config.success;

  return (
    <div className="fixed top-4 right-4 z-[100] animate-slide-in">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 border-l-4 ${border} bg-white shadow-elevated backdrop-blur-sm`}>
        <Icon size={18} className={iconColor} />
        <span className="text-sm font-medium text-gray-700">{message}</span>
        <button onClick={onClose} className="ml-2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
