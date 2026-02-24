import { NavLink } from 'react-router-dom';
import { Database, Settings, Play, Plug } from 'lucide-react';

const navLinks = [
  { to: '/', icon: Plug, label: 'Connectors' },
  { to: '/taps', icon: Play, label: 'Run Taps' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white flex flex-col shrink-0 border-r border-slate-800/50">
      <div className="p-5 border-b border-slate-800/50">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2.5">
          <span className="bg-brand-500/15 rounded-lg p-1.5">
            <Database size={18} className="text-brand-400" />
          </span>
          <span className="text-gray-100">Tap Builder</span>
        </h1>
        <p className="text-[11px] text-slate-500 mt-1.5 ml-[38px]">Singer REST API Config</p>
      </div>
      <nav className="flex-1 py-4 px-2">
        <p className="px-3 pb-2 text-[11px] font-semibold text-slate-600 uppercase tracking-widest">
          Navigation
        </p>
        <div className="space-y-1">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-brand-400" />
                  )}
                  <Icon size={18} />
                  <span className="font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="border-t border-slate-800/50 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <Settings size={12} />
          tap-rest-api v1.0
        </div>
      </div>
    </aside>
  );
}
