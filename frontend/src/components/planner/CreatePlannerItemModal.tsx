import React, { useState, useEffect } from 'react';
import { X, Check, Target, Zap, CheckSquare, Calendar, Clock, BookOpen, Activity } from 'lucide-react';
import { plannerApi, PlannerDomain, PlanningCadence, TaskPriority, PlannerGoal, PlannerSprint } from '../../api/planner';

interface CreatePlannerItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: 'goal' | 'task' | 'sprint';
  defaultDomain?: string;
  defaultGoalId?: string;
  domains: PlannerDomain[];
}

export const CreatePlannerItemModal: React.FC<CreatePlannerItemModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultType = 'task',
  defaultDomain,
  defaultGoalId,
  domains,
}) => {
  const [activeType, setActiveType] = useState<'task' | 'sprint' | 'goal'>(defaultType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Списки для связок
  const [goals, setGoals] = useState<PlannerGoal[]>([]);
  const [sprints, setSprints] = useState<PlannerSprint[]>([]);

  const [isCreatingDomain, setIsCreatingDomain] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  
  // Set defaults if domains load later
  useEffect(() => {
    if (domains.length > 0 && !taskDomain) setTaskDomain(domains[0].id);
    if (domains.length > 0 && !goalDomain) setGoalDomain(domains[0].id);
  }, [domains]);

  const handleCreateDomain = async () => {
    if (!newDomainName.trim()) return;
    try {
      const newDomain = await plannerApi.createDomain({
        name: newDomainName,
        color: 'blue'
      });
      setTaskDomain(newDomain.id);
      setGoalDomain(newDomain.id);
      setIsCreatingDomain(false);
      setNewDomainName('');
      // We should ideally reload domains, but we'll let onSuccess handle it or the user close/reopen for now,
      // actually let's just trigger onSuccess so it reloads in background.
      onSuccess();
    } catch (e) {
      console.error(e);
    }
  };

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDomain, setTaskDomain] = useState<string>(defaultDomain || (domains.length > 0 ? domains[0].id : ''));
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskGoalId, setTaskGoalId] = useState<string>(defaultGoalId || '');
  const [taskSprintId, setTaskSprintId] = useState<string>('');
  const [taskEstMinutes, setTaskEstMinutes] = useState<number>(45);
  const [taskDueDate, setTaskDueDate] = useState<string>('');

  // Sprint Form State
  const [sprintTitle, setSprintTitle] = useState('');
  const [sprintGoalId, setSprintGoalId] = useState<string>(defaultGoalId || '');
  const [sprintStartDate, setSprintStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [sprintEndDate, setSprintEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });

  // Goal Form State
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDomain, setGoalDomain] = useState<string>(defaultDomain || (domains.length > 0 ? domains[0].id : ''));
  const [goalParentId, setGoalParentId] = useState<string>(defaultGoalId || '');
  const [goalCadence, setGoalCadence] = useState<PlanningCadence>('sprint');
  const [goalTargetDate, setGoalTargetDate] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setActiveType(defaultType);
      setTaskDomain(defaultDomain || (domains.length > 0 ? domains[0].id : ''));
      setGoalDomain(defaultDomain || (domains.length > 0 ? domains[0].id : ''));
      setTaskGoalId(defaultGoalId || '');
      setSprintGoalId(defaultGoalId || '');
      setGoalParentId(defaultGoalId || '');
      plannerApi.getGoals().then(setGoals).catch(console.error);
      plannerApi.getSprints().then(setSprints).catch(console.error);
    }
  }, [isOpen, defaultType, defaultDomain, defaultGoalId, domains]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (activeType === 'task') {
        await plannerApi.createTask({
          title: taskTitle,
          description: taskDescription || undefined,
          domain_id: taskDomain,
          priority: taskPriority,
          goal_id: taskGoalId || undefined,
          sprint_id: taskSprintId || undefined,
          estimated_minutes: Number(taskEstMinutes),
          due_date: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
        });
      } else if (activeType === 'sprint') {
        if (!sprintGoalId) {
          alert('Спринт должен быть привязан к глобальной цели');
          setIsSubmitting(false);
          return;
        }
        // Вызов API создания спринта
        await fetch('/api/v1/planner/sprints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: sprintTitle,
            goal_id: sprintGoalId,
            start_date: sprintStartDate,
            end_date: sprintEndDate,
          }),
        });
      } else if (activeType === 'goal') {
        await plannerApi.createGoal({
          title: goalTitle,
          description: goalDescription || undefined,
          domain_id: goalDomain,
          cadence: goalCadence,
          target_date: goalTargetDate || undefined,
          parent_goal_id: goalParentId || undefined,
          level: goalParentId ? 'semester' : 'vision',
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Ошибка сохранения:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-mono">
      <div className="bg-[#090d16] border border-cyan-900/80 rounded-2xl w-full max-w-lg shadow-[0_0_40px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col">
        {/* Хедер модалки */}
        <div className="flex items-center justify-between p-4 border-b border-cyan-950 bg-[#030712]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveType('task')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeType === 'task'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" /> ЗАДАЧА
            </button>
            <button
              type="button"
              onClick={() => setActiveType('sprint')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeType === 'sprint'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> СПРИНТ
            </button>
            <button
              type="button"
              onClick={() => setActiveType('goal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeType === 'goal'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3.5 h-3.5" /> ЦЕЛЬ
            </button>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-rose-400 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs text-slate-300">
          {activeType === 'task' && (
            <>
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Название задачи</label>
                <input
                  required
                  type="text"
                  placeholder="Например: Сдать лабу №3 по криптографии"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Сфера (Домен)</label>
                  <div className="flex gap-2">
                  {isCreatingDomain ? (
                    <div className="flex-1 flex gap-2">
                      <input 
                        type="text" 
                        value={newDomainName}
                        onChange={(e) => setNewDomainName(e.target.value)}
                        placeholder="Название новой сферы..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-purple-500/50"
                      />
                      <button type="button" onClick={handleCreateDomain} className="px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors">OK</button>
                      <button type="button" onClick={() => setIsCreatingDomain(false)} className="px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"><X size={16}/></button>
                    </div>
                  ) : (
                    <>
                      <select 
                        value={taskDomain}
                        onChange={(e) => setTaskDomain(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-purple-500/50 appearance-none"
                      >
                        {domains.map(d => (
                          <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>
                        ))}
                      </select>
                      <button 
                        type="button" 
                        onClick={() => setIsCreatingDomain(true)}
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white transition-colors flex items-center justify-center"
                        title="Новая сфера"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Приоритет</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-300 outline-none focus:border-cyan-500"
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                    <option value="critical">Критический</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Привязка к цели</label>
                  <select
                    value={taskGoalId}
                    onChange={(e) => setTaskGoalId(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-300 outline-none focus:border-cyan-500"
                  >
                    <option value="">Без цели</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Спринт курса/учебы</label>
                  <select
                    value={taskSprintId}
                    onChange={(e) => setTaskSprintId(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-300 outline-none focus:border-cyan-500"
                  >
                    <option value="">Вне спринта (Flow)</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Оценка времени (минут)</label>
                  <input
                    type="number"
                    step="15"
                    value={taskEstMinutes}
                    onChange={(e) => setTaskEstMinutes(Number(e.target.value))}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Дедлайн (дата и время)</label>
                  <input
                    type="datetime-local"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </>
          )}

          {activeType === 'sprint' && (
            <>
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Название спринта</label>
                <input
                  required
                  type="text"
                  placeholder="Например: Спринт 2: Архитектура микросервисов"
                  value={sprintTitle}
                  onChange={(e) => setSprintTitle(e.target.value)}
                  className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Глобальная цель курса / вуза</label>
                <select
                  required
                  value={sprintGoalId}
                  onChange={(e) => setSprintGoalId(e.target.value)}
                  className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-300 outline-none focus:border-purple-500"
                >
                  <option value="">Выберите цель...</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>[{(domains.find(d => d.id === g.domain_id)?.name || '').toUpperCase()}] {g.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Дата старта</label>
                  <input
                    type="date"
                    required
                    value={sprintStartDate}
                    onChange={(e) => setSprintStartDate(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Дата окончания (2 недели)</label>
                  <input
                    type="date"
                    required
                    value={sprintEndDate}
                    onChange={(e) => setSprintEndDate(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </>
          )}

          {activeType === 'goal' && (
            <>
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Название цели</label>
                <input
                  required
                  type="text"
                  placeholder="Например: Закрыть 7 семестр на отлично"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Сфера</label>
                  <div className="flex gap-2">
                  {isCreatingDomain ? (
                    <div className="flex-1 flex gap-2">
                      <input 
                        type="text" 
                        value={newDomainName}
                        onChange={(e) => setNewDomainName(e.target.value)}
                        placeholder="Название новой сферы..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-purple-500/50"
                      />
                      <button type="button" onClick={handleCreateDomain} className="px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors">OK</button>
                      <button type="button" onClick={() => setIsCreatingDomain(false)} className="px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"><X size={16}/></button>
                    </div>
                  ) : (
                    <>
                      <select 
                        value={goalDomain}
                        onChange={(e) => setGoalDomain(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-purple-500/50 appearance-none"
                      >
                        {domains.map(d => (
                          <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>
                        ))}
                      </select>
                      <button 
                        type="button" 
                        onClick={() => setIsCreatingDomain(true)}
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white transition-colors flex items-center justify-center"
                        title="Новая сфера"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Тип планирования (Cadence)</label>
                  <select
                    value={goalCadence}
                    onChange={(e) => setGoalCadence(e.target.value as PlanningCadence)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-300 outline-none focus:border-amber-500"
                  >
                    <option value="milestone">Вехи (Семестр / Вуз)</option>
                    <option value="sprint">Спринты (Курсы)</option>
                    <option value="flow">Канбан-поток (Домашние проекты)</option>
                    <option value="cyclic">Циклический (Спорт)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Родительская цель (опционально)</label>
                  <select
                    value={goalParentId}
                    onChange={(e) => setGoalParentId(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-300 outline-none focus:border-amber-500"
                  >
                    <option value="">Без родителя</option>
                    {goals.filter(g => g.domain_id === goalDomain && !g.parent_goal_id).map((g) => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase block mb-1">Финальный дедлайн цели</label>
                  <input
                    type="date"
                    value={goalTargetDate}
                    onChange={(e) => setGoalTargetDate(e.target.value)}
                    className="w-full bg-[#030712] border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 mt-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {isSubmitting ? 'Сохранение...' : 'Создать элемент'}
          </button>
        </form>
      </div>
    </div>
  );
};
