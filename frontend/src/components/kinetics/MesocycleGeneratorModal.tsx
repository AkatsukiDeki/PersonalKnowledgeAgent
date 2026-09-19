import React, { useState } from 'react';
import { X, Calendar, Settings2, Zap } from 'lucide-react';
import { kineticsApi, MesocycleSettingsPayload } from '../../api/kinetics';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS_MAP = [
  { val: 0, label: 'ПН' },
  { val: 1, label: 'ВТ' },
  { val: 2, label: 'СР' },
  { val: 3, label: 'ЧТ' },
  { val: 4, label: 'ПТ' },
  { val: 5, label: 'СБ' },
  { val: 6, label: 'ВС' },
];

export const MesocycleGeneratorModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 2, 4]); // ПН, СР, ПТ по умолчанию
  const [targetSplit, setTargetSplit] = useState('Push/Pull/Legs');
  const [location, setLocation] = useState('Зал');
  const [includeDeload, setIncludeDeload] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter(d => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const handleGenerate = async () => {
    if (daysOfWeek.length === 0) return alert('Выберите хотя бы один день тренировок');
    
    setIsGenerating(true);
    try {
      const payload: MesocycleSettingsPayload = {
        start_date: startDate,
        days_of_week: daysOfWeek,
        target_split: targetSplit,
        location: location,
        include_deload: includeDeload,
        weeks_count: 4,
      };
      await kineticsApi.generateMesocycle(payload);
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Ошибка при генерации мезоцикла');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm font-mono">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-200">СИНТЕЗ МЕЗОЦИКЛА</h2>
          </div>
          <button onClick={onClose} disabled={isGenerating} className="text-slate-500 hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Start Date */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              ДАТА НАЧАЛА (НЕДЕЛЯ 1)
            </label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {/* Days of week */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5" />
              ТРЕНИРОВОЧНЫЕ ДНИ
            </label>
            <div className="flex flex-wrap gap-2">
              {DAYS_MAP.map(day => (
                <button
                  key={day.val}
                  type="button"
                  onClick={() => toggleDay(day.val)}
                  className={`w-10 h-10 rounded border text-xs font-bold transition-colors ${
                    daysOfWeek.includes(day.val) 
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target Split */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400">ЦЕЛЕВОЙ СПЛИТ</label>
            <input 
              type="text"
              value={targetSplit}
              onChange={(e) => setTargetSplit(e.target.value)}
              placeholder="Например: Push/Pull/Legs"
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400">ЛОКАЦИЯ</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocation('Дом')}
                className={`py-2 text-xs font-bold rounded border transition-colors ${
                  location === 'Дом' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                ДОМ
              </button>
              <button
                type="button"
                onClick={() => setLocation('Зал')}
                className={`py-2 text-xs font-bold rounded border transition-colors ${
                  location === 'Зал' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                ЗАЛ
              </button>
            </div>
          </div>

          {/* Deload */}
          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={includeDeload} 
                  onChange={(e) => setIncludeDeload(e.target.checked)} 
                  className="sr-only"
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${includeDeload ? 'bg-cyan-500/50' : 'bg-slate-800'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-slate-200 w-4 h-4 rounded-full transition-transform ${includeDeload ? 'translate-x-4 bg-white' : ''}`}></div>
              </div>
              <div className="text-xs text-slate-300">
                <span className="font-bold text-slate-200 block">Разгрузочная неделя (Deload)</span>
                <span className="text-slate-500">Автоматически снизить RPE до 6 на 4-й неделе</span>
              </div>
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/80">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3 bg-cyan-600 text-white rounded font-bold text-sm hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>СИНТЕЗ (МОЖЕТ ЗАНЯТЬ 30+ СЕК)</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>СГЕНЕРИРОВАТЬ ПЛАН</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
