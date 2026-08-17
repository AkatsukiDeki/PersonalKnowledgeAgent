import React, { useEffect, useState } from 'react';
import { timelineApi, TimelineEvent } from '../api/timeline';
import { Clock, RefreshCw, GitMerge, AlertCircle, Wrench, Shield, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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
      // wait a bit for background task
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
        return { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', icon: <Wrench size={18} /> };
      case 'decision_change':
        return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: <GitMerge size={18} /> };
      case 'strategy_shift':
        return { color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', icon: <Shield size={18} /> };
      default:
        return { color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', icon: <AlertCircle size={18} /> };
    }
  };

  const toggleDesc = (id: string) => {
    setExpandedDesc(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      <div className="p-6 pb-4 border-b border-zinc-800 bg-zinc-900/30 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Clock className="text-emerald-400" size={24} /> 
            Хроника решений (Timeline 2.0)
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Эволюция знаний, смена инструментов и архитектурные сдвиги во времени.
          </p>
        </div>
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-zinc-700"
        >
          <RefreshCw size={16} className={rebuilding ? "animate-spin" : ""} />
          {rebuilding ? 'Анализ...' : 'Синхронизировать'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 lg:px-12 xl:px-24">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 gap-3">
            <RefreshCw className="animate-spin" /> Загрузка событий...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <Clock size={48} className="mb-4 opacity-20" />
            <p>Нет зафиксированных изменений.</p>
            <p className="text-sm mt-1">Эволюция начинается после изменения ранее принятых решений.</p>
          </div>
        ) : (
          <div className="relative before:absolute before:inset-y-0 before:left-[39px] before:w-[2px] before:bg-zinc-800 pl-4 py-4">
            {events.map((ev, i) => {
              const style = getEventStyle(ev.event_type);
              const isExpanded = expandedDesc[ev.id];
              const dateObj = new Date(ev.timestamp);
              
              // Show month/year header if it's the first or month changed
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
                      <div className="absolute left-0 w-10 border-t border-zinc-700" />
                      <div className="ml-14 px-3 py-1 bg-zinc-800/80 text-zinc-300 text-xs font-bold uppercase tracking-widest rounded-md border border-zinc-700 shadow-sm">
                        {format(dateObj, 'LLLL yyyy', { locale: ru })}
                      </div>
                    </div>
                  )}

                  <div className="relative mb-10 group">
                    {/* Node Dot */}
                    <div className={`absolute left-0 top-1 w-10 h-10 rounded-full bg-zinc-900 border-2 ${style.border} flex items-center justify-center z-10 shadow-lg shadow-zinc-950/50`}>
                      <div className={`${style.color}`}>
                        {style.icon}
                      </div>
                    </div>
                    
                    <div className="ml-16">
                      <div className="flex flex-col mb-1">
                        <span className="text-xs text-zinc-500 font-mono">
                          {format(dateObj, 'dd MMM, HH:mm', { locale: ru })}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <h3 className="text-zinc-100 font-semibold text-lg">{ev.title}</h3>
                          {ev.domain && (
                            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] uppercase font-bold tracking-wider">
                              {ev.domain}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mt-3 shadow-md hover:border-zinc-700 transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                           <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${style.bg} ${style.color} ${style.border}`}>
                             {ev.event_type.replace('_', ' ')}
                           </span>
                        </div>
                        
                        <p className={`text-zinc-300 text-sm leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {ev.description}
                        </p>
                        
                        <button 
                          onClick={() => toggleDesc(ev.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mt-2 font-medium transition-colors"
                        >
                          {isExpanded ? 'Свернуть' : 'Читать полностью'}
                          <ChevronDown size={14} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
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
