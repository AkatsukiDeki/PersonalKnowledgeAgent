import React, { useState, useEffect, useRef } from 'react';
import { WorkoutExercise, WorkoutSet, kineticsApi } from '../../api/kinetics';

interface ExerciseSetTableProps {
  exercise: WorkoutExercise;
  onSetUpdated: (updatedSet: WorkoutSet) => void;
  onStartTimer?: (seconds: number) => void;
}

export const ExerciseSetTable: React.FC<ExerciseSetTableProps> = ({ exercise, onSetUpdated, onStartTimer }) => {
  const setsCount = exercise.sets || 3;
  const targetReps = exercise.reps_or_duration || '10-12';
  
  const getDefaultSets = () => Array.from({ length: setsCount }, (_, i) => ({
      id: `tmp-${i}`, // временный id
      set_number: i + 1,
      set_type: 'N',
      weight_kg: 0,
      reps: 0,
      is_completed: false,
    } as unknown as WorkoutSet));

  const [sets, setSets] = useState<WorkoutSet[]>(
    (exercise.workout_sets && exercise.workout_sets.length > 0) ? exercise.workout_sets : getDefaultSets()
  );

  useEffect(() => {
    setSets((exercise.workout_sets && exercise.workout_sets.length > 0) ? exercise.workout_sets : getDefaultSets());
  }, [exercise.workout_sets]);

  const handleUpdate = async (setId: string, updates: Partial<WorkoutSet>) => {
    try {
      if (setId.startsWith('tmp-')) {
        const created = await kineticsApi.createWorkoutSet(exercise.id, updates);
        setSets(prev => prev.map(s => s.id === setId ? { ...s, ...created } : s));
        onSetUpdated(created);
      } else {
        setSets(prev => prev.map(s => s.id === setId ? { ...s, ...updates } : s));
        const updated = await kineticsApi.updateWorkoutSet(setId, updates);
        onSetUpdated(updated);
      }
    } catch (e) {
      console.error('Failed to update/create set', e);
    }
  };



  // Sort sets by set_number
  const sortedSets = [...sets].sort((a, b) => a.set_number - b.set_number);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/40">
      <div className="grid grid-cols-12 gap-2 bg-slate-900/60 px-3 py-1.5 text-[10px] font-mono text-slate-400">
        <span className="col-span-1 text-center">СЕТ</span>
        <span className="col-span-4 text-center">ПРЕДЫДУЩИЙ</span>
        <span className="col-span-3 text-center">КГ</span>
        <span className="col-span-3 text-center">ПОВТ</span>
        <span className="col-span-1 text-center">✓</span>
      </div>

      <div className="divide-y divide-slate-800/40">
        {sortedSets.map((s, idx) => (
          <SetRow key={s.id} set={s} onUpdate={(updates) => handleUpdate(s.id, updates)} onStartTimer={onStartTimer} />
        ))}
      </div>
    </div>
  );
};

const SetRow: React.FC<{ set: WorkoutSet, onUpdate: (u: Partial<WorkoutSet>) => void, onStartTimer?: (seconds: number) => void }> = ({ set, onUpdate, onStartTimer }) => {
  const [localWeight, setLocalWeight] = useState(set.weight_kg?.toString() || '');
  const [localReps, setLocalReps] = useState(set.reps?.toString() || '');
  const isDirty = useRef(false);

  useEffect(() => {
    if (!isDirty.current) {
      setLocalWeight(set.weight_kg?.toString() || '');
      setLocalReps(set.reps?.toString() || '');
    }
  }, [set.weight_kg, set.reps]);

  const handleBlur = () => {
    isDirty.current = false;
    const w = parseFloat(localWeight) || 0;
    const r = parseInt(localReps, 10) || 0;
    
    if (w !== set.weight_kg || r !== set.reps) {
      onUpdate({ weight_kg: w, reps: r });
    }
  };

  const handleToggle = () => {
    const w = parseFloat(localWeight) || 0;
    const r = parseInt(localReps, 10) || 0;
    const willComplete = !set.is_completed;
    onUpdate({ weight_kg: w, reps: r, is_completed: willComplete });
    
    // Trigger timer only when completing the set
    if (willComplete && onStartTimer) {
      let seconds = 90; // N
      if (set.set_type === 'W') seconds = 60;
      else if (set.set_type === 'F' || set.set_type === 'D') seconds = 150;
      onStartTimer(seconds);
    }
  };

  return (
    <div
      className={`grid grid-cols-12 items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        set.is_completed ? 'bg-emerald-950/15' : 'hover:bg-slate-900/30'
      }`}
    >
      <div className="col-span-1 flex justify-center">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
            set.set_type === 'W'
              ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
              : set.set_type === 'F'
              ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
              : 'bg-slate-800 text-slate-300'
          }`}
        >
          {set.set_type === 'N' ? set.set_number : set.set_type}
        </span>
      </div>

      <div className="col-span-4 text-center font-mono text-slate-500 text-[10px]">
        {set.previous_weight_kg ? `${set.previous_weight_kg} кг × ${set.previous_reps}` : '—'}
      </div>

      <div className="col-span-3">
        <input
          type="number"
          step="0.5"
          value={localWeight}
          onChange={e => { isDirty.current = true; setLocalWeight(e.target.value); }}
          onBlur={handleBlur}
          placeholder="0"
          className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-center font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div className="col-span-3">
        <input
          type="number"
          value={localReps}
          onChange={e => { isDirty.current = true; setLocalReps(e.target.value); }}
          onBlur={handleBlur}
          placeholder="0"
          className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-center font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div className="col-span-1 flex justify-center">
        <button
          onClick={handleToggle}
          className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
            set.is_completed
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
              : 'border-slate-700 bg-slate-900 hover:border-slate-500'
          }`}
        >
          {set.is_completed ? '✓' : ''}
        </button>
      </div>
    </div>
  );
};
