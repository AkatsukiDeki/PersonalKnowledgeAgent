import React from 'react';
import { X, Activity, Dumbbell } from 'lucide-react';
import { WorkoutExercise } from '../../api/kinetics';

interface SegmentInspectionProps {
  segmentId: string;
  segmentName: string;
  muscleKg: number;
  muscleNormPct: number;
  fatKg: number;
  fatNormPct: number;
  relatedExercises: WorkoutExercise[];
  onClose: () => void;
}

export const SegmentInspectionPanel: React.FC<SegmentInspectionProps> = ({
  segmentName,
  muscleKg,
  muscleNormPct,
  fatKg,
  fatNormPct,
  relatedExercises,
  onClose,
}) => {
  const isFatExcess = fatNormPct > 150;

  return (
    <div className="absolute top-4 right-4 w-80 bg-[#050a14]/95 border border-cyan-500/50 rounded-xl p-4 font-mono shadow-[0_0_30px_rgba(6,182,212,0.25)] backdrop-blur-md z-20">
      <div className="flex justify-between items-center border-b border-cyan-950 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs font-bold text-cyan-200 tracking-wider">
            ИНСПЕКЦИЯ // {segmentName.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-cyan-400 p-1 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 text-xs">
        {/* МЫШЕЧНЫЙ ПАКЕТ */}
        <div className="bg-[#020617] border border-slate-800/80 rounded p-2.5">
          <div className="flex justify-between text-slate-400 text-[10px] mb-1">
            <span>СКЕЛЕТНАЯ МУСКУЛАТУРА</span>
            <span className="text-emerald-400 font-bold">{muscleNormPct}% НОРМЫ</span>
          </div>
          <div className="text-base font-bold text-slate-100">{muscleKg} КГ</div>
          <div className="w-full h-1 bg-slate-900 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${Math.min(muscleNormPct, 150) / 1.5}%` }}
            />
          </div>
        </div>

        {/* ЖИРОВОЙ ПАКЕТ */}
        <div className="bg-[#020617] border border-slate-800/80 rounded p-2.5">
          <div className="flex justify-between text-slate-400 text-[10px] mb-1">
            <span>ЛОКАЛЬНАЯ ЖИРОВАЯ МАССА</span>
            <span className={isFatExcess ? 'text-amber-400 font-bold' : 'text-cyan-400 font-bold'}>
              {fatNormPct}% НОРМЫ
            </span>
          </div>
          <div className="text-base font-bold text-slate-100">{fatKg} КГ</div>
          <div className="w-full h-1 bg-slate-900 rounded-full mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${isFatExcess ? 'bg-amber-500' : 'bg-cyan-500'}`}
              style={{ width: `${Math.min(fatNormPct, 400) / 4}%` }}
            />
          </div>
        </div>

        {/* СВЯЗАННЫЕ УПРАЖНЕНИЯ ТЕКУЩЕГО ПРОТОКОЛА */}
        <div className="pt-2 border-t border-slate-800/60">
          <div className="text-[10px] text-slate-400 mb-2 flex items-center gap-1.5">
            <Dumbbell className="w-3.5 h-3.5 text-cyan-400" />
            <span>ПРОТОКОЛ ВОЗДЕЙСТВИЯ НА СЕКТОР:</span>
          </div>
          {relatedExercises.length > 0 ? (
            <div className="space-y-1.5">
              {relatedExercises.map((ex) => (
                <div
                  key={ex.id}
                  className="p-1.5 bg-cyan-950/20 border border-cyan-900/40 rounded text-[11px] text-slate-200 flex justify-between items-center"
                >
                  <span className="truncate pr-2">{ex.exercise_name}</span>
                  <span className="text-[10px] text-cyan-400 shrink-0">
                    {ex.sets}×{ex.reps_or_duration}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 italic p-1">
              Прямая нагрузка в текущем дне не запланирована
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
