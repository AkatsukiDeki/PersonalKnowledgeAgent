import React, { useMemo } from 'react';
import { format, addMinutes, differenceInMinutes, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';

interface TimelineEvent {
    id: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    eventType: 'university' | 'gym' | 'sprint_block' | 'task_deadline' | 'custom';
}

interface TimelineGridProps {
    events: TimelineEvent[];
    onSlotClick?: (time: Date) => void;
    onEventClick?: (event: TimelineEvent) => void;
}

const EVENT_COLORS = {
    university: 'bg-indigo-100 border-indigo-500 text-indigo-700',
    gym: 'bg-emerald-100 border-emerald-500 text-emerald-700',
    sprint_block: 'bg-purple-100 border-purple-500 text-purple-700',
    task_deadline: 'bg-rose-100 border-rose-500 text-rose-700',
    custom: 'bg-gray-100 border-gray-500 text-gray-700',
};

export const TimelineGrid: React.FC<TimelineGridProps> = ({
    events,
    onSlotClick,
    onEventClick
}) => {
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 07:00 to 23:00

    const getEventStyle = (startTime: Date, endTime: Date) => {
        const start = startOfDay(startTime);
        const dayStart = addMinutes(start, 7 * 60); // 07:00
        const startOffsetMinutes = differenceInMinutes(startTime, dayStart);
        const durationMinutes = differenceInMinutes(endTime, startTime);
        
        // Grid height for 16 hours is 100%
        const totalMinutes = 16 * 60; // 960
        
        const top = Math.max(0, (startOffsetMinutes / totalMinutes) * 100);
        const height = (durationMinutes / totalMinutes) * 100;

        return {
            top: `${top}%`,
            height: `${height}%`,
        };
    };

    return (
        <div className="relative flex flex-col h-[800px] overflow-y-auto bg-white rounded-lg shadow-sm border border-slate-200">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 p-2 text-center text-sm font-medium text-slate-600">
                Расписание дня
            </div>

            {/* Grid Container */}
            <div className="relative flex-1 min-h-[960px]">
                {/* Background Grid Lines */}
                {HOURS.map((hour, idx) => (
                    <div 
                        key={hour} 
                        className="absolute w-full border-t border-slate-100 flex items-start"
                        style={{ top: `${(idx / 16) * 100}%` }}
                    >
                        <span className="w-16 text-xs text-slate-400 font-mono text-right pr-2 -mt-2">
                            {hour.toString().padStart(2, '0')}:00
                        </span>
                        <div 
                            className="flex-1 h-full min-h-[60px] cursor-pointer hover:bg-slate-50/50"
                            onClick={() => {
                                const t = startOfDay(new Date());
                                t.setHours(hour);
                                onSlotClick?.(t);
                            }}
                        />
                    </div>
                ))}

                {/* Events Layer */}
                <div className="absolute top-0 bottom-0 left-16 right-4">
                    {events.map((event) => {
                        const style = getEventStyle(event.startTime, event.endTime);
                        return (
                            <div
                                key={event.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEventClick?.(event);
                                }}
                                className={`absolute left-0 right-0 ml-1 rounded border-l-4 p-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow overflow-hidden ${EVENT_COLORS[event.eventType]}`}
                                style={style}
                            >
                                <div className="text-xs font-semibold truncate">{event.title}</div>
                                <div className="text-[10px] opacity-75 mt-0.5 truncate">
                                    {format(event.startTime, 'HH:mm')} - {format(event.endTime, 'HH:mm')}
                                </div>
                                {event.description && (
                                    <div className="text-[10px] mt-1 line-clamp-2 leading-tight">
                                        {event.description}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
