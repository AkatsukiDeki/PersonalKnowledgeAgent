import React, { useState, useEffect } from 'react';
import { UserCheck, Target, Dumbbell, Calendar, X, Save } from 'lucide-react';
import { kineticsApi, AthleteProfileData } from '../../api/kinetics';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export const AthleteProfileModal: React.FC<Props> = ({ isOpen, onClose, onProfileUpdated }) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'goals' | 'experience' | 'schedule'>('personal');
  const [profile, setProfile] = useState<AthleteProfileData>({
    age: 22,
    gender: 'Мужской',
    height_cm: 181,
    target_fat_pct: 15,
    target_weight_kg: 85,
    goals: ['Похудение'],
    lagging_muscles: ['Грудь', 'Спина', 'Ноги'],
    training_experience: 'Средний',
    last_break: 'Более года',
    workout_frequency: 6,
    duration_min: 90,
    preferred_time: '16:30',
    schedule_days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    restrictions: 'Не люблю беговое кардио, планирую больше акцент на fullbody, примерно 6 раз в неделю и буду делить на дом(калестеника) вт и чт и зал по пн ср пт и сб',
    strength_bench: 100,
    strength_squat: 120,
    strength_deadlift: 120,
    pullups_reps: 10,
    mobility_squat: 5,
    mobility_shoulder: 5,
    mobility_bend: 5
  });

  useEffect(() => {
    if (isOpen) {
      kineticsApi.getProfile().then((data) => {
        if (data && data.age) setProfile(data);
      }).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...profile,
        lagging_muscles: Array.isArray(profile.lagging_muscles) 
          ? profile.lagging_muscles 
          : String(profile.lagging_muscles).split(',').map(s => s.trim()).filter(Boolean)
      };
      await kineticsApi.updateProfile(payload);
      if (onProfileUpdated) onProfileUpdated();
      onClose();
    } catch (err) {
      console.error('Ошибка сохранения профиля:', err);
      alert('Ошибка сохранения профиля');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#090d16] border border-cyan-500/40 rounded-xl w-full max-w-2xl font-mono text-slate-200 shadow-[0_0_35px_rgba(6,182,212,0.15)] flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center border-b border-slate-800 p-4 shrink-0">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold tracking-wider text-cyan-300">АНКЕТА АТЛЕТА // ПРОФИЛЬ ОГРАНИЧЕНИЙ</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800/80 bg-[#020617] text-xs shrink-0">
          {[
            { id: 'personal', label: 'Личные данные', icon: UserCheck },
            { id: 'goals', label: 'Цели и мышцы', icon: Target },
            { id: 'experience', label: 'Опыт и сила', icon: Dumbbell },
            { id: 'schedule', label: 'Расписание', icon: Calendar },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 px-2 flex items-center justify-center gap-2 border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs custom-scrollbar">
          {activeTab === 'personal' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">Возраст (лет)</label>
                <input
                  type="number"
                  value={profile.age}
                  onChange={(e) => setProfile({ ...profile, age: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Пол</label>
                <select
                  value={profile.gender}
                  onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                >
                  <option value="Мужской">Мужской</option>
                  <option value="Женский">Женский</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Рост (см)</label>
                <input
                  type="number"
                  value={profile.height_cm}
                  onChange={(e) => setProfile({ ...profile, height_cm: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Целевой процент жира (%)</label>
                <input
                  type="number"
                  value={profile.target_fat_pct}
                  onChange={(e) => setProfile({ ...profile, target_fat_pct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Целевой вес (кг)</label>
                <input
                  type="number"
                  step="0.5"
                  value={profile.target_weight_kg || 85}
                  onChange={(e) => setProfile({ ...profile, target_weight_kg: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'goals' && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 mb-1">Отстающие мышечные группы (через запятую)</label>
                <input
                  type="text"
                  value={profile.lagging_muscles.join(', ')}
                  onChange={(e) => setProfile({ ...profile, lagging_muscles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                  placeholder="Грудь, Спина, Ноги"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Тест подвижности: Присед без веса (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={profile.mobility_squat}
                  onChange={(e) => setProfile({ ...profile, mobility_squat: parseInt(e.target.value) || 5 })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Тест подвижности: Плечи у стены (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={profile.mobility_shoulder}
                  onChange={(e) => setProfile({ ...profile, mobility_shoulder: parseInt(e.target.value) || 5 })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'experience' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Опыт тренировок</label>
                  <input
                    type="text"
                    value={profile.training_experience}
                    onChange={(e) => setProfile({ ...profile, training_experience: e.target.value })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Последний перерыв</label>
                  <input
                    type="text"
                    value={profile.last_break}
                    onChange={(e) => setProfile({ ...profile, last_break: e.target.value })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="border border-slate-800/80 rounded p-3 bg-[#020617]">
                <div className="text-slate-400 font-bold mb-2">Прошлые силовые маркеры:</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">Жим лежа (кг)</label>
                    <input
                      type="number"
                      value={profile.strength_bench}
                      onChange={(e) => setProfile({ ...profile, strength_bench: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#090d16] border border-slate-800 rounded p-1.5 text-slate-200 outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Присед (кг)</label>
                    <input
                      type="number"
                      value={profile.strength_squat}
                      onChange={(e) => setProfile({ ...profile, strength_squat: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#090d16] border border-slate-800 rounded p-1.5 text-slate-200 outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Подтягивания</label>
                    <input
                      type="number"
                      value={profile.pullups_reps}
                      onChange={(e) => setProfile({ ...profile, pullups_reps: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#090d16] border border-slate-800 rounded p-1.5 text-slate-200 outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Чего избегать в программе (Ограничения)</label>
                <textarea
                  rows={3}
                  value={profile.restrictions}
                  onChange={(e) => setProfile({ ...profile, restrictions: e.target.value })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Тренировок в неделю</label>
                  <input
                    type="number"
                    value={profile.workout_frequency}
                    onChange={(e) => setProfile({ ...profile, workout_frequency: parseInt(e.target.value) || 6 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Длительность (мин)</label>
                  <input
                    type="number"
                    value={profile.duration_min}
                    onChange={(e) => setProfile({ ...profile, duration_min: parseInt(e.target.value) || 90 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Удобное время</label>
                <input
                  type="text"
                  value={profile.preferred_time}
                  onChange={(e) => setProfile({ ...profile, preferred_time: e.target.value })}
                  className="w-full bg-[#020617] border border-slate-800 rounded p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-slate-400 hover:bg-slate-800"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30 font-bold shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            >
              <Save className="w-4 h-4" />
              Сохранить профиль
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
