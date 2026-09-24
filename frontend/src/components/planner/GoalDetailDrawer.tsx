import React, { useState, useEffect } from 'react';
import {
  X,
  Target,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  Save,
  Layers,
  GitBranch,
  Pencil,
} from 'lucide-react';
import { PlannerGoal, PlannerTask, PlannerSprint, PlannerDomain } from '../../api/planner';

interface GoalDetailDrawerProps {
  goalId: string | null;
  isOpen: boolean;
  onClose: () => void;
  goals: PlannerGoal[];
  domains: PlannerDomain[];
  tasks: PlannerTask[];
  sprints: PlannerSprint[];
  onGoalUpdated: () => void;
  onOpenCreateModal: (
    type: 'goal' | 'task' | 'sprint',
    defaultDomainId?: string,
    defaultGoalId?: string
  ) => void;
  onToggleTaskStatus: (taskId: string, currentStatus: string) => void;
}

const LEVEL_LABELS: Record<string, string> = {
  vision: '🌟 Миссия',
  milestone: '🏁 Веха',
  semester: '📅 Семестр',
  subject: '📚 Предмет',
  sprint: '⚡ Спринт',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-cyan-400',
  high: 'text-amber-400',
  critical: 'text-rose-400',
};

export const GoalDetailDrawer: React.FC<GoalDetailDrawerProps> = ({
  goalId,
  isOpen,
  onClose,
  goals,
  domains,
  tasks,
  sprints,
  onGoalUpdated,
  onOpenCreateModal,
  onToggleTaskStatus,
}) => {
  const [currentGoal, setCurrentGoal] = useState<PlannerGoal | null>(null);
  const [isEditingRisks, setIsEditingRisks] = useState(false);
  const [risksText, setRisksText] = useState('');
  const [contingencyText, setContingencyText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (goalId) {
      const g = goals.find((item) => item.id === goalId) || null;
      setCurrentGoal(g);
      if (g) {
        setRisksText(g.risks || '');
        setContingencyText(g.contingency_plan || '');
      }
      setIsEditingRisks(false);
    }
  }, [goalId, goals]);

  // Построение цепочки предков «Зачем?»
  const buildAncestors = (goal: PlannerGoal): PlannerGoal[] => {
    const chain: PlannerGoal[] = [];
    let curr: PlannerGoal | undefined = goal;
    const visited = new Set<string>();
    while (curr && curr.parent_goal_id) {
      if (visited.has(curr.id)) break; // защита от зацикливания
      visited.add(curr.id);
      const parent = goals.find((g) => g.id === curr!.parent_goal_id);
      if (parent) {
        chain.unshift(parent);
        curr = parent;
      } else break;
    }
    return chain;
  };

  const handleSaveRisks = async () => {
    if (!currentGoal) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/planner/goals/${currentGoal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          risks: risksText || null,
          contingency_plan: contingencyText || null,
        }),
      });
      if (res.ok) {
        setIsEditingRisks(false);
        onGoalUpdated();
      }
    } catch (err) {
      console.error('Ошибка сохранения рисков:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // После проверки isOpen — безопасно обращаемся к currentGoal
  const goal = currentGoal;
  if (!goal) {
    return (
      <div className="fixed inset-y-0 right-0 w-[480px] bg-[#0a0f1c] border-l border-slate-800 z-50 flex items-center justify-center text-slate-500 text-sm">
        Цель не найдена
      </div>
    );
  }

  const ancestors = buildAncestors(goal);
  const domain = domains.find((d) => d.id === goal.domain_id);
  const subGoals = goals.filter((g) => g.parent_goal_id === goal.id);
  const goalTasks = tasks.filter((t) => t.goal_id === goal.id);
  const goalTasksDone = goalTasks.filter((t) => t.status === 'done');
  const goalSprints = sprints.filter((s) => s.goal_id === goal.id);

  const progressPct = goal.progress_pct ?? (
    goalTasks.length > 0
      ? Math.round((goalTasksDone.length / goalTasks.length) * 100)
      : 0
  );

  const domainColor = domain?.color || 'cyan';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 w-[520px] max-w-[95vw] bg-[#070b14] border-l border-slate-800/80 z-50 flex flex-col shadow-2xl overflow-hidden animate-slide-in-right">

        {/* ── HEADER ── */}
        <div className={`p-5 border-b border-slate-800/60 bg-${domainColor}-950/20`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Breadcrumbs «Зачем?» */}
              {ancestors.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {ancestors.map((a, idx) => (
                    <React.Fragment key={a.id}>
                      <span className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer transition-colors truncate max-w-[100px]">
                        {a.title}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Goal title */}
              <h2 className="text-base font-bold text-white leading-tight">{goal.title}</h2>

              {/* Meta tags */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {goal.level && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    {LEVEL_LABELS[goal.level] || goal.level}
                  </span>
                )}
                {domain && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full bg-${domainColor}-950 text-${domainColor}-400 border border-${domainColor}-800`}>
                    {domain.name}
                  </span>
                )}
                {goal.target_date && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(goal.target_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Прогресс</span>
              <span className="font-mono text-white">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full bg-${domainColor}-500 rounded-full transition-all duration-500`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {goalTasks.length > 0 && (
              <p className="text-[10px] text-slate-600 mt-1">
                {goalTasksDone.length} / {goalTasks.length} задач выполнено
              </p>
            )}
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">

          {/* Description */}
          {goal.description && (
            <p className="text-sm text-slate-400 leading-relaxed">{goal.description}</p>
          )}

          {/* ── RISK & FRICTION ENGINE ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Риски и план Б
              </h3>
              {!isEditingRisks && (
                <button
                  onClick={() => setIsEditingRisks(true)}
                  className="text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Редактировать
                </button>
              )}
            </div>

            {isEditingRisks ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-amber-600 uppercase block mb-1">
                    ⚠ Узкие места / Блокеры
                  </label>
                  <textarea
                    value={risksText}
                    onChange={(e) => setRisksText(e.target.value)}
                    rows={3}
                    placeholder="Например: преп принимает только по четвергам, очередь 30 чел..."
                    className="w-full bg-amber-950/20 border border-amber-800/50 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-amber-600 resize-none placeholder-slate-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-emerald-600 uppercase block mb-1">
                    🛡 План Б / Запасной сценарий
                  </label>
                  <textarea
                    value={contingencyText}
                    onChange={(e) => setContingencyText(e.target.value)}
                    rows={2}
                    placeholder="Например: если не успею очно — запишусь на индивидуальную защиту..."
                    className="w-full bg-emerald-950/20 border border-emerald-800/50 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-emerald-600 resize-none placeholder-slate-600"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setIsEditingRisks(false);
                      setRisksText(goal.risks || '');
                      setContingencyText(goal.contingency_plan || '');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSaveRisks}
                    disabled={isSaving}
                    className="px-4 py-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-700/50 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    {isSaving ? 'Сохраняю...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {goal.risks ? (
                  <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg">
                    <p className="text-[10px] text-amber-600 uppercase font-semibold mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Узкие места
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">{goal.risks}</p>
                  </div>
                ) : null}
                {goal.contingency_plan ? (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg">
                    <p className="text-[10px] text-emerald-600 uppercase font-semibold mb-1 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      План Б
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">{goal.contingency_plan}</p>
                  </div>
                ) : null}
                {!goal.risks && !goal.contingency_plan && (
                  <button
                    onClick={() => setIsEditingRisks(true)}
                    className="w-full p-3 border border-dashed border-slate-800 rounded-lg text-xs text-slate-600 hover:text-slate-400 hover:border-slate-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Добавить риски и план Б
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── SUB-GOALS (Декомпозиция) ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-500" />
                Декомпозиция ({subGoals.length})
              </h3>
              <button
                onClick={() => onOpenCreateModal('goal', goal.domain_id, goal.id)}
                className="text-[10px] text-slate-600 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Добавить подцель
              </button>
            </div>

            {subGoals.length > 0 ? (
              <div className="space-y-2">
                {subGoals.map((sub) => {
                  const subProgress = sub.progress_pct ?? 0;
                  return (
                    <div
                      key={sub.id}
                      className="p-3 bg-slate-900/40 border border-slate-800/50 rounded-lg hover:border-slate-700 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{sub.title}</p>
                          {sub.level && (
                            <span className="text-[9px] text-slate-600">{LEVEL_LABELS[sub.level] || sub.level}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">{subProgress}%</span>
                      </div>
                      <div className="mt-2 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-600 rounded-full"
                          style={{ width: `${subProgress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 border border-dashed border-slate-800 rounded-lg text-center">
                <GitBranch className="w-4 h-4 text-slate-700 mx-auto mb-1" />
                <p className="text-xs text-slate-600">Цель ещё не декомпозирована</p>
              </div>
            )}
          </div>

          {/* ── SPRINTS ── */}
          {goalSprints.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-purple-400" />
                Спринты ({goalSprints.length})
              </h3>
              <div className="space-y-2">
                {goalSprints.map((sprint) => (
                  <div
                    key={sprint.id}
                    className={`p-3 rounded-lg border ${
                      sprint.is_active
                        ? 'bg-purple-950/20 border-purple-800/40'
                        : 'bg-slate-900/30 border-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-200">{sprint.title}</p>
                      {sprint.is_active && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-700/50">
                          Активен
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {new Date(sprint.start_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      {' — '}
                      {new Date(sprint.end_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TASKS ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Задачи ({goalTasksDone.length}/{goalTasks.length})
              </h3>
              <button
                onClick={() => onOpenCreateModal('task', goal.domain_id, goal.id)}
                className="text-[10px] text-slate-600 hover:text-emerald-400 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Добавить задачу
              </button>
            </div>

            {goalTasks.length > 0 ? (
              <div className="space-y-1.5">
                {goalTasks.map((task) => {
                  const isDone = task.status === 'done';
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-800/30 transition-colors group"
                    >
                      <button
                        onClick={() => onToggleTaskStatus(task.id, task.status)}
                        className="shrink-0 transition-colors"
                      >
                        {isDone
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <Circle className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs truncate ${isDone ? 'line-through text-slate-600' : 'text-slate-200'}`}>
                          {task.title}
                        </p>
                        {task.estimated_minutes > 0 && (
                          <p className="text-[9px] text-slate-600">{task.estimated_minutes} мин</p>
                        )}
                      </div>
                      <span className={`text-[9px] shrink-0 ${PRIORITY_COLORS[task.priority] || 'text-slate-500'}`}>
                        {task.priority}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 border border-dashed border-slate-800 rounded-lg text-center">
                <p className="text-xs text-slate-600">Нет задач для этой цели</p>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="p-4 border-t border-slate-800/60 flex gap-2">
          <button
            onClick={() => onOpenCreateModal('task', goal.domain_id, goal.id)}
            className="flex-1 py-2 text-xs text-slate-400 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Задача
          </button>
          <button
            onClick={() => onOpenCreateModal('sprint', goal.domain_id, goal.id)}
            className="flex-1 py-2 text-xs text-slate-400 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Спринт
          </button>
          <button
            onClick={() => onOpenCreateModal('goal', goal.domain_id, goal.id)}
            className="flex-1 py-2 text-xs text-slate-400 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-cyan-400 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Подцель
          </button>
        </div>
      </div>
    </>
  );
};
