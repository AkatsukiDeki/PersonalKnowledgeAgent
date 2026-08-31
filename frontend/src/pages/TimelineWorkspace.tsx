import React, { useEffect, useState } from 'react';
import { timelineApi, TimelineEvent } from '../api/timeline';
import { Clock, RefreshCw, GitMerge, AlertCircle, Wrench, Shield, ChevronDown, HelpCircle, FileText, ArrowRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export function TimelineWorkspace() {
  const { t } = useLanguage();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await timelineApi.getTimelineEvents();
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await timelineApi.rebuildTimeline();
      setTimeout(fetchEvents, 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setRebuilding(false);
    }
  };

  const getEventStyle = (type: string) => {
    switch (type) {
      case 'tool_replacement':
        return { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', icon: <Wrench size={16} strokeWidth={1.5} /> };
      case 'decision_change':
        return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: <GitMerge size={16} strokeWidth={1.5} /> };
      case 'strategy_shift':
        return { color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', icon: <Shield size={16} strokeWidth={1.5} /> };
      default:
        return { color: 'text-white/50', bg: 'bg-white/5', border: 'border-white/10', icon: <AlertCircle size={16} strokeWidth={1.5} /> };
    }
  };

  const toggleDesc = (id: string) => {
    setExpandedDesc(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Нативные форматтеры на базе Intl (без внешних либ)
  const formatMonthYear = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date);
    } catch {
      return '';
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col text-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 sm:pb-6 mb-6 sm:mb-8 border-b border-white/5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2.5">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
            {t('timeline.title')}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {t('timeline.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium text-xs transition-all border border-white/10 shadow-sm"
          >
            <RefreshCw size={15} strokeWidth={1.5} className={rebuilding ? "animate-spin" : ""} />
            {rebuilding ? t('timeline.syncing') : t('timeline.sync')}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mx-6 mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex gap-3 text-indigo-200">
        <HelpCircle className="shrink-0 mt-0.5 text-indigo-400" size={18} />
        <p className="text-sm font-light">
          {t('timeline.infoBox')}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 lg:px-12 xl:px-24">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/40 gap-3 font-mono text-xs">
            <RefreshCw className="animate-spin text-emerald-400" size={16} /> Загрузка событий...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/40">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Clock size={22} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-light text-white/80">Нет зафиксированных изменений.</p>
            <p className="text-xs font-light text-white/40 mt-1">Эволюция начинается после изменения ранее принятых решений.</p>
          </div>
        ) : (
          <div className="relative before:absolute before:inset-y-0 before:left-[36px] before:w-[1px] before:bg-white/10 pl-4 py-4 overflow-x-hidden">
            {events.map((ev, i) => {
              const style = getEventStyle(ev.event_type);
              const isExpanded = expandedDesc[ev.id];
              const dateObj = new Date(ev.timestamp);

              let showMonthHeader = false;
              if (i === 0) {
                showMonthHeader = true;
              } else {
                const prevDateObj = new Date(events[i-1].timestamp);
                if (dateObj.getMonth() !== prevDateObj.getMonth() || dateObj.getFullYear() !== prevDateObj.getFullYear()) {
                  showMonthHeader = true;
                }
              }

              return (
                <React.Fragment key={ev.id}>
                  {showMonthHeader && (
                    <div className="relative mb-8 mt-2 first:mt-0 flex items-center">
                      <div className="absolute left-0 w-8 sm:w-10 border-t border-white/10" />
                      <div className="ml-12 sm:ml-14 px-2 sm:px-3 py-1 bg-white/[0.04] text-white/80 text-[10px] font-mono tracking-widest uppercase rounded-lg border border-white/10 shadow-sm backdrop-blur-md">
                        {formatMonthYear(ev.timestamp)}
                      </div>
                    </div>
                  )}

                  <div className="relative mb-10 group">
                    {/* Node Dot */}
                    <div className={`absolute left-0 top-1 w-10 h-10 rounded-xl bg-[#0a0a0a] border ${style.border} flex items-center justify-center z-10 shadow-lg shadow-black/50`}>
                      <div className={`${style.color}`}>
                        {style.icon}
                      </div>
                    </div>

                    <div className="ml-14 sm:ml-16">
                      <div className="flex flex-col mb-1">
                        <span className="text-[10px] font-mono text-white/40">
                          {formatDateTime(ev.timestamp)}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                          <h3 className="text-white/95 font-medium text-base tracking-tight">{ev.title}</h3>
                          {ev.domain && (
                            <span className="px-2 py-0.5 bg-white/5 text-white/60 rounded-md text-[10px] font-mono uppercase tracking-wider border border-white/5">
                              {ev.domain}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 mt-3 hover:bg-white/[0.05] transition-all shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                           <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border ${style.bg} ${style.color} ${style.border}`}>
                             {ev.event_type.replace('_', ' ')}
                           </span>
                        </div>

                        <p className={`text-white/70 text-xs font-light leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {ev.description}
                        </p>

                        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider">Основано на:</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {ev.old_claim_id && (
                              <button className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs text-white/60 transition-colors">
                                <FileText size={12} /> Предыдущий подход
                              </button>
                            )}
                            <ArrowRight size={12} className="text-white/20" />
                            {ev.new_claim_id && (
                              <button className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 rounded border border-indigo-500/20 text-xs text-indigo-300 transition-colors">
                                <FileText size={12} /> Новый подход
                              </button>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => toggleDesc(ev.id)}
                          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 mt-3 font-mono transition-colors"
                        >
                          {isExpanded ? 'Свернуть' : 'Читать полностью'}
                          <ChevronDown size={13} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}