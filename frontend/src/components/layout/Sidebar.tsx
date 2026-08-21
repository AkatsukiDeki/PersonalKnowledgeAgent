import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Database,
  Clock,
  Sparkles,
  ShieldAlert,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { conflictsApi } from '../../api/conflicts';

export type ViewType = 'chat' | 'insights' | 'universe' | 'conflicts' | 'timeline';

interface Props {
  onOpenUploader: () => void;
  onOpenManager: () => void;
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: ViewType;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
  badge?: number;
}

export function Sidebar({
  onOpenUploader,
  onOpenManager,
  activeView,
  onChangeView,
  collapsed,
  onToggleCollapse,
}: Props) {
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const conflicts = await conflictsApi.getConflicts('unresolved');
        setUnresolvedCount(conflicts.length);
      } catch (e) {
        // ignore
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    window.addEventListener('conflictsUpdated', fetchCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener('conflictsUpdated', fetchCount);
    };
  }, []);

  const navItems: NavItem[] = [
    { id: 'chat', icon: <MessageSquare size={16} strokeWidth={1.5} />, label: 'Диалог', activeColor: 'text-indigo-400' },
    { id: 'insights', icon: <Sparkles size={16} strokeWidth={1.5} />, label: 'Инсайты', activeColor: 'text-fuchsia-400' },
    { id: 'universe', icon: <Globe size={16} strokeWidth={1.5} />, label: 'Вселенная памяти', activeColor: 'text-indigo-400' },
    { id: 'conflicts', icon: <ShieldAlert size={16} strokeWidth={1.5} />, label: 'Противоречия', activeColor: 'text-amber-400', badge: unresolvedCount },
    { id: 'timeline', icon: <Clock size={16} strokeWidth={1.5} />, label: 'Таймлайн', activeColor: 'text-emerald-400' },
  ];

  return (
    <aside
      className={`bg-[#0a0a0a]/70 backdrop-blur-xl border-r border-white/5 flex flex-col justify-between shrink-0 transition-all duration-200 ease-in-out overflow-hidden text-slate-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="flex flex-col h-full">
        {/* Collapse toggle */}
        <div className={`flex items-center h-14 px-3 border-b border-white/5 bg-white/[0.02] ${collapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
            title={collapsed ? 'Развернуть' : 'Свернуть'}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.5} /> : <PanelLeftClose size={16} strokeWidth={1.5} />}
          </button>
        </div>

        {/* Add source button */}
        <div className={`p-3 ${collapsed ? 'flex justify-center px-2' : ''}`}>
          <button
            onClick={onOpenUploader}
            className={`flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-xs font-medium transition-all shadow-lg shadow-indigo-500/20 ${
              collapsed ? 'w-10 h-10 px-0' : 'w-full px-3'
            }`}
            title="Добавить источник"
          >
            <Plus size={16} strokeWidth={1.5} />
            {!collapsed && <span>Добавить источник</span>}
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-2 flex flex-col gap-1 px-3 flex-1">
          {!collapsed && (
            <div className="px-3 pb-2 pt-1 text-[10px] font-mono text-white/30 uppercase tracking-widest">
              Память агента
            </div>
          )}

          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={`relative flex items-center gap-3 rounded-xl text-xs font-medium w-full text-left transition-all duration-150 ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? `bg-white/[0.08] text-white shadow-sm border border-white/5`
                    : 'text-white/50 hover:text-white/90 hover:bg-white/[0.04]'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <span className={isActive ? item.activeColor : 'text-white/40'}>{item.icon}</span>
                {!collapsed && <span className="truncate font-light">{item.label}</span>}
                {!collapsed && item.badge && item.badge > 0 ? (
                  <span className="ml-auto bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                    {item.badge}
                  </span>
                ) : null}
                {collapsed && item.badge && item.badge > 0 ? (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                ) : null}
              </button>
            );
          })}

          {/* Sources button (opens modal) */}
          <button
            onClick={onOpenManager}
            className={`flex items-center gap-3 rounded-xl text-xs font-medium w-full text-left transition-all duration-150 text-white/50 hover:text-white/90 hover:bg-white/[0.04] mt-1 ${
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            }`}
            title={collapsed ? 'Источники памяти' : undefined}
          >
            <Database size={16} strokeWidth={1.5} className="text-white/40" />
            {!collapsed && <span className="truncate font-light">Источники памяти</span>}
          </button>
        </nav>

        {/* Status indicator */}
        <div className="p-3 border-t border-white/5 bg-black/40">
          <div
            className={`flex items-center gap-2.5 px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl text-white/40 text-[10px] font-mono ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <div className="relative flex items-center justify-center w-2 h-2 shrink-0">
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            </div>
            {!collapsed && <span className="truncate tracking-wider">pgvector · active</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;