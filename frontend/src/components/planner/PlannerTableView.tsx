import React, { useState, useEffect } from 'react';
import { Plus, FolderPlus, Calendar, Clock, CheckCircle2, Circle, AlertCircle, X } from 'lucide-react';
import { PlannerDomain, PlannerGoal, PlannerTask, TaskStatus, TaskPriority, PlanningCadence } from '../../api/planner';

interface PlannerTableViewProps {
  domains: PlannerDomain[];
  goals: PlannerGoal[];
  tasks: PlannerTask[];
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => void;
  onCreateTask?: (task: Partial<PlannerTask>) => void;
  onCreateGoal?: (goal: Partial<PlannerGoal>) => void;
  onCreateDomain?: (name: string, color: string) => void;
}

export const PlannerTableView: React.FC<PlannerTableViewProps> = ({
  domains,
  goals,
  tasks,
  onUpdateTaskStatus,
  onCreateTask,
  onCreateGoal,
  onCreateDomain,
}) => {
  const [selectedDomainFilter, setSelectedDomainFilter] = useState('all');
  const [newDomainName, setNewDomainName] = useState('');
  const [isAddingDomain, setIsAddingDomain] = useState(false);

  const [creationMode, setCreationMode] = useState<'task' | 'goal'>('task');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDomainId, setQuickDomainId] = useState(domains.length > 0 ? domains[0].id : '');
  const [quickGoalId, setQuickGoalId] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');

  // Update quickDomainId when domains arrive if not set
  useEffect(() => {
    if (domains.length > 0 && !quickDomainId) {
      setQuickDomainId(domains[0].id);
    }
  }, [domains]);

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim()) return;
    if (onCreateDomain) {
      onCreateDomain(newDomainName.trim(), 'cyan');
    }
    setNewDomainName('');
    setIsAddingDomain(false);
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || !quickDomainId) return;
    
    if (creationMode === 'task') {
      if (onCreateTask) {
        onCreateTask({
          title: quickTitle.trim(),
          domain_id: quickDomainId,
          goal_id: quickGoalId || undefined,
          priority: quickPriority,
          status: 'todo',
        });
      }
    } else {
      if (onCreateGoal) {
        onCreateGoal({
          title: quickTitle.trim(),
          domain_id: quickDomainId,
          parent_goal_id: quickGoalId || undefined,
          level: quickGoalId ? 'semester' : 'vision',
          cadence: 'milestone' as PlanningCadence,
        });
      }
    }
    setQuickTitle('');
  };

  const filteredTasks = selectedDomainFilter === 'all'
    ? tasks
    : tasks.filter(t => t.domain_id === selectedDomainFilter);

  const getDomain = (id: string) => domains.find(d => d.id === id);
  const getGoal = (id?: string | null) => goals.find(g => g.id === id);

  return (
    <div className="flex flex-col h-full bg-[#03060f] p-4 gap-4 custom-scrollbar overflow-hidden">
      {/* Панель фильтров и создание новой сферы */}
      <div className="flex flex-wrap gap-2 items-center pb-2 border-b border-slate-800">
        <button
          onClick={() => setSelectedDomainFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
            selectedDomainFilter === 'all' 
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' 
              : 'text-slate-400 hover:bg-slate-800/50'
          }`}
        >
          Все сферы ({tasks.length})
        </button>

        {domains.map(d => (
          <button
            key={d.id}
            onClick={() => setSelectedDomainFilter(d.id)}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
              selectedDomainFilter === d.id 
                ? `bg-${d.color}-500/20 text-${d.color}-400 border border-${d.color}-500/40` 
                : 'text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            {d.name}
          </button>
        ))}

        {isAddingDomain ? (
          <form onSubmit={handleAddDomain} className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={newDomainName}
              onChange={(e) => setNewDomainName(e.target.value)}
              placeholder="Название..."
              className="bg-black/60 border border-cyan-700/80 rounded px-2 py-1 text-xs outline-none text-slate-100 w-32"
            />
            <button type="submit" className="px-2 py-1 text-xs bg-cyan-600/20 text-cyan-400 rounded hover:bg-cyan-600/40">+</button>
            <button type="button" onClick={() => setIsAddingDomain(false)} className="px-1.5 py-1 text-xs text-slate-400 hover:text-slate-200"><X size={14} /></button>
          </form>
        ) : (
          <button
            onClick={() => setIsAddingDomain(true)}
            className="px-2.5 py-1.5 rounded-lg text-xs text-cyan-400 hover:bg-cyan-950/30 border border-dashed border-cyan-800/60 flex items-center gap-1"
          >
            <Plus size={14} /> Сфера
          </button>
        )}
      </div>

      {/* Быстрое добавление */}
      <form onSubmit={handleQuickAdd} className="flex gap-2 items-center bg-slate-900/40 p-2 rounded-lg border border-slate-800">
        <div className="flex bg-slate-800/50 rounded-md p-0.5">
          <button 
            type="button"
            onClick={() => setCreationMode('task')}
            className={`px-3 py-1 text-xs rounded transition-colors ${creationMode === 'task' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Задача
          </button>
          <button 
            type="button"
            onClick={() => setCreationMode('goal')}
            className={`px-3 py-1 text-xs rounded transition-colors ${creationMode === 'goal' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Цель
          </button>
        </div>
        <Plus size={16} className="text-slate-500 ml-1" />
        <input
          type="text"
          placeholder={creationMode === 'task' ? "Новая задача..." : "Новая цель..."}
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder-slate-600"
        />
        
        <select
          value={quickDomainId}
          onChange={(e) => setQuickDomainId(e.target.value)}
          className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 outline-none w-32"
        >
          {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        
        <select
          value={quickGoalId}
          onChange={(e) => setQuickGoalId(e.target.value)}
          className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 outline-none w-32"
        >
          <option value="">{creationMode === 'task' ? 'Без цели' : 'Без родителя'}</option>
          {goals.filter(g => g.domain_id === quickDomainId && (creationMode === 'task' || !g.parent_goal_id)).map(g => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>

        <select
          value={quickPriority}
          onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
          className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 outline-none w-24"
        >
          <option value="low">Низкий</option>
          <option value="medium">Средний</option>
          <option value="high">Высокий</option>
          <option value="critical">Критич.</option>
        </select>

        <button 
          type="submit"
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 text-xs rounded transition-colors"
        >
          Добавить
        </button>
      </form>

      {/* Таблица */}
      <div className="flex-1 overflow-auto rounded-lg border border-slate-800 custom-scrollbar">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-900/80 text-slate-400 sticky top-0 z-10 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 w-10"></th>
              <th className="p-3 font-medium">Задача</th>
              <th className="p-3 font-medium">Сфера</th>
              <th className="p-3 font-medium">Цель / Спринт</th>
              <th className="p-3 font-medium">Приоритет</th>
              <th className="p-3 font-medium">Дедлайн</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500 italic text-sm">
                  Нет задач в выбранной сфере
                </td>
              </tr>
            ) : (
              filteredTasks.map(task => {
                const domain = getDomain(task.domain_id);
                const goal = getGoal(task.goal_id);
                const isDone = task.status === 'done';

                const priorityColor = {
                  'low': 'text-slate-400 bg-slate-400/10',
                  'medium': 'text-blue-400 bg-blue-400/10',
                  'high': 'text-orange-400 bg-orange-400/10',
                  'critical': 'text-red-400 bg-red-400/10',
                }[task.priority] || 'text-slate-400 bg-slate-400/10';

                return (
                  <tr key={task.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-3">
                      <button 
                        onClick={() => onUpdateTaskStatus && onUpdateTaskStatus(task.id, isDone ? 'todo' : 'done')}
                        className={`transition-colors ${isDone ? 'text-cyan-500' : 'text-slate-500 hover:text-cyan-400'}`}
                      >
                        {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                    </td>
                    <td className={`p-3 font-medium ${isDone ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {task.title}
                    </td>
                    <td className="p-3">
                      {domain ? (
                        <span className={`px-2 py-0.5 rounded text-[11px] bg-${domain.color}-500/10 text-${domain.color}-400 border border-${domain.color}-500/20`}>
                          {domain.name}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">Без сферы</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-400 text-xs">
                      {goal ? goal.title : '—'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${priorityColor}`}>
                        {task.priority === 'low' ? 'Низкий' : task.priority === 'medium' ? 'Средний' : task.priority === 'high' ? 'Высокий' : 'Критич.'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-xs">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('ru-RU') : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
