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
  GraduationCap,
  Headphones
} from 'lucide-react';
import { conflictsApi } from '../../api/conflicts';
import { useLanguage } from '../../context/LanguageContext';

export type ViewType = 'chat' | 'insights' | 'universe' | 'graph' | 'conflicts' | 'timeline' | 'learning' | 'transcripts';

interface Props {
  onOpenUploader: () => void;
  onOpenManager: () => void;
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  isOpen: boolean;
  onClose: () => void;
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
  isOpen,
  onClose,
}: Props) {
  const { t } = useLanguage();
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
    { id: 'chat', icon: <MessageSquare size={16} strokeWidth={1.5} />, label: t('nav.dialogs'), activeColor: 'text-indigo-400' },
    { id: 'insights', icon: <Sparkles size={16} strokeWidth={1.5} />, label: t('nav.insights'), activeColor: 'text-fuchsia-400' },
    { id: 'transcripts', icon: <Headphones size={16} strokeWidth={1.5} />, label: 'Расшифровки', activeColor: 'text-indigo-400' },
    { id: 'universe', icon: <Globe size={16} strokeWidth={1.5} />, label: t('nav.universe'), activeColor: 'text-indigo-400' },
    { id: 'conflicts', icon: <ShieldAlert size={16} strokeWidth={1.5} />, label: t('nav.contradictions'), activeColor: 'text-amber-400', badge: unresolvedCount },
    { id: 'timeline', icon: <Clock size={16} strokeWidth={1.5} />, label: t('nav.timeline'), activeColor: 'text-emerald-400' },
    { id: 'learning', icon: <GraduationCap size={16} strokeWidth={1.5} />, label: t('nav.learning'), activeColor: 'text-indigo-400' },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}
      
      <aside
        className={`fixed top-0 left-0 h-full bg-[#0a0a0a]/90 backdrop-blur-xl border-r border-white/5 flex flex-col justify-between shrink-0 transition-transform duration-300 ease-out z-50 text-slate-200 w-56 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header & Close button */}
          <div className="flex items-center h-14 px-3 border-b border-white/5 bg-white/[0.02] justify-between">
            <span className="font-mono text-[11px] tracking-[0.2em] text-white/80 uppercase ml-2">
              Navigation
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
              title="Закрыть"
            >
              <PanelLeftClose size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Add source button */}
          <div className="p-3">
            <button
              onClick={() => {
                onClose();
                onOpenUploader();
              }}
              className="flex items-center justify-center gap-2 w-full px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-xs font-medium transition-all shadow-lg shadow-indigo-500/20"
              title={t('nav.addSource')}
            >
              <Plus size={16} strokeWidth={1.5} />
              <span>{t('nav.addSource')}</span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="mt-2 flex flex-col gap-1 px-3 flex-1">
            <div className="px-3 pb-2 pt-1 text-[10px] font-mono text-white/30 uppercase tracking-widest">
              {t('nav.agentMemory')}
            </div>

            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onChangeView(item.id)}
                  className={`relative flex items-center gap-3 rounded-xl text-xs font-medium w-full text-left transition-all duration-150 px-3 py-2.5 ${
                    isActive
                      ? `bg-white/[0.08] text-white shadow-sm border border-white/5`
                      : 'text-white/50 hover:text-white/90 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={isActive ? item.activeColor : 'text-white/40'}>{item.icon}</span>
                  <span className="truncate font-light">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="ml-auto bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {/* Sources button (opens modal) */}
            <button
              onClick={() => {
                onClose();
                onOpenManager();
              }}
              className="flex items-center gap-3 rounded-xl text-xs font-medium w-full text-left transition-all duration-150 text-white/50 hover:text-white/90 hover:bg-white/[0.04] mt-1 px-3 py-2.5"
            >
              <Database size={16} strokeWidth={1.5} className="text-white/40" />
              <span className="truncate font-light">{t('nav.sources')}</span>
            </button>
          </nav>

          {/* Status indicator */}
          <div className="p-3 border-t border-white/5 bg-black/40">
            <div className="flex items-center gap-2.5 px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl text-white/40 text-[10px] font-mono">
              <div className="relative flex items-center justify-center w-2 h-2 shrink-0">
                <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              </div>
              <span className="truncate tracking-wider">pgvector · active</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;