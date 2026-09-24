import React, { useEffect, useState } from 'react';
import { DailyCockpitResponse, PlannerTask, PlannerDomain, plannerApi } from '../../api/planner';
import { TimelineGrid } from './TimelineGrid';
import { RRule } from 'rrule';
import { startOfDay, endOfDay } from 'date-fns';

interface DailyTimelineProps {
  cockpit: DailyCockpitResponse | null;
  domains: PlannerDomain[];
  onTaskClick: (task: PlannerTask) => void;
}

export const DailyTimeline: React.FC<DailyTimelineProps> = ({ cockpit, domains, onTaskClick }) => {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const today = new Date();
        const start = startOfDay(today).toISOString();
        const end = endOfDay(today).toISOString();
        const data = await plannerApi.getCalendarView(start, end);
        
        let expandedEvents: any[] = [];
        data.events.forEach((ev: any) => {
          if (ev.recurrence_rule) {
            try {
              const rule = RRule.fromString(ev.recurrence_rule);
              // Set dtstart to today for calculation if needed, or rely on rule
              // For simplicity, just add the base event if it lands today
              const instances = rule.between(startOfDay(today), endOfDay(today), true);
              instances.forEach(date => {
                const duration = new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime();
                expandedEvents.push({
                  ...ev,
                  id: `${ev.id}-${date.getTime()}`,
                  startTime: date,
                  endTime: new Date(date.getTime() + duration)
                });
              });
            } catch (e) {
              console.error("RRule parse error", e);
            }
          } else {
            expandedEvents.push({
              ...ev,
              startTime: new Date(ev.start_time),
              endTime: new Date(ev.end_time)
            });
          }
        });
        
        setEvents(expandedEvents);
      } catch (e) {
        console.error("Failed to fetch calendar", e);
      }
    };
    fetchEvents();
  }, []);

  if (!cockpit) {
    return <div className="flex items-center justify-center h-full text-white/50">Загрузка данных дня...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col gap-6 p-4">
      {/* System Status Banner */}
      <div className="bg-gradient-to-r from-neutral-900 to-black border border-white/10 rounded-xl p-5 flex items-center justify-between shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white/90">Интеграционный дашборд</h2>
          <p className="text-sm text-white/50 mt-1">{new Date(cockpit.date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-black/40 rounded-lg p-3 border border-white/5 flex flex-col items-center">
            <span className="text-xs text-white/50 uppercase tracking-wider">ЦНС</span>
            <span className={`text-xl font-bold ${cockpit.cns_fatigue_score > 7 ? 'text-red-400' : 'text-emerald-400'}`}>
              {cockpit.cns_fatigue_score}/10
            </span>
          </div>
          <div className="bg-black/40 rounded-lg p-3 border border-white/5 flex flex-col items-center">
            <span className="text-xs text-white/50 uppercase tracking-wider">Сон</span>
            <span className="text-xl font-bold text-blue-400">{cockpit.sleep_hours}h</span>
          </div>
        </div>
      </div>

      {/* Main Timeline Split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        
        {/* Kinetics Section */}
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col">
          <h3 className="font-semibold text-emerald-400 border-b border-white/10 pb-2 mb-3">Кинетика</h3>
          {cockpit.active_workout ? (
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4">
              <div className="text-xs text-emerald-400/70 uppercase mb-1">Тренировка ({cockpit.active_workout.location})</div>
              <div className="font-medium text-white/90">{cockpit.active_workout.split_name}</div>
              <div className="mt-4 pt-3 border-t border-emerald-500/20 text-xs text-white/60">
                Статус: {cockpit.active_workout.status === 'planned' ? 'Запланировано' : cockpit.active_workout.status}
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/40 italic text-center py-6">День восстановления</div>
          )}
        </div>

        {/* Tasks Timeline */}
        <div className="lg:col-span-2 bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col overflow-hidden">
          <TimelineGrid events={events} />
        </div>

      </div>
    </div>
  );
};
