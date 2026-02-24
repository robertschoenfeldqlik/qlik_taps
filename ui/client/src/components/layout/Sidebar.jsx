import { NavLink } from 'react-router-dom';
import { Database, Settings, Play, Plug } from 'lucide-react';

const navLinks = [
  { to: '/', icon: Plug, label: 'Connectors' },
  { to: '/taps', icon: Play, label: 'Run Taps' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Database size={22} className="text-brand-400" />
          <span className="text-gray-100">Tap Builder</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Singer REST API Config</p>
      </div>
      <nav className="flex-1 py-3">
        <p className="px-4 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Navigation
        </p>
        {navLinks.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Settings size={12} />
          tap-rest-api v1.0
        </div>
      </div>
    </aside>
  );
}
