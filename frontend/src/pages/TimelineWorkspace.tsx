import React, { useEffect, useState } from 'react';
import { timelineApi, TimelineEvent } from '../api/timeline';
import { Clock, RefreshCw, GitMerge, AlertCircle, Wrench, Shield, ChevronDown } from 'lucide-react';

export function TimelineWorkspace() {
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
    <div className="h-full flex flex-col bg-transparent text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-white/5 bg-[#0a0a0a]/50 backdrop-blur-md flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-light tracking-tight text-white/95 flex items-center gap-3">
            <Clock className="text-emerald-400" size={20} strokeWidth={1.5} />
            Хроника решений (Timeline 2.0)
          </h1>
          <p className="text-xs text-white/50 font-light mt-1">
            Эволюция знаний, смена инструментов и архитектурные сдвиги во времени.
          </p>
        </div>
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium text-xs transition-all border border-white/10 shadow-sm"
        >
          <RefreshCw size={15} strokeWidth={1.5} className={rebuilding ? "animate-spin" : ""} />
          {rebuilding ? 'Анализ...' : 'Синхронизировать'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 lg:px-12 xl:px-24 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
          <div className="relative before:absolute before:inset-y-0 before:left-[39px] before:w-[1px] before:bg-white/10 pl-4 py-4">
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
                      <div className="absolute left-0 w-10 border-t border-white/10" />
                      <div className="ml-14 px-3 py-1 bg-white/[0.04] text-white/80 text-[10px] font-mono tracking-widest uppercase rounded-lg border border-white/10 shadow-sm backdrop-blur-md">
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

                    <div className="ml-16">
                      <div className="flex flex-col mb-1">
                        <span className="text-[10px] font-mono text-white/40">
                          {formatDateTime(ev.timestamp)}
                        </span>
                        <div className="flex items-center gap-3 mt-1">
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