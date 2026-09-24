import React, { useState, useEffect } from 'react';
import { PlannerTask, PlannerSprint, TaskStatus, plannerApi } from '../../api/planner';

interface SprintKanbanProps {
  tasks: PlannerTask[];
  sprints: PlannerSprint[];
  onTaskUpdated: () => void;
  onTaskClick: (task: PlannerTask) => void;
  onCreateSprint: () => void;
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'К выполнению' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'done', label: 'Завершено' }
];

export const SprintKanban: React.FC<SprintKanbanProps> = ({ tasks, sprints, onTaskUpdated, onTaskClick, onCreateSprint }) => {
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [isBacklogOpen, setIsBacklogOpen] = useState(true);

  // Auto-select active sprint if none selected
  useEffect(() => {
    if (!selectedSprintId && sprints.length > 0) {
      const active = sprints.find(s => s.is_active);
      if (active) setSelectedSprintId(active.id);
      else setSelectedSprintId(sprints[0].id);
    }
  }, [sprints, selectedSprintId]);

  const handleUpdateTask = async (taskId: string, updates: Partial<PlannerTask>) => {
    try {
      await plannerApi.updateTask(taskId, updates);
      onTaskUpdated();
    } catch (e) {
      console.error('Failed to update task', e);
    }
  };

  const priorityColors = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/50',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    low: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/50'
  };

  const selectedSprint = sprints.find(s => s.id === selectedSprintId);
  const backlogTasks = tasks.filter(t => !t.sprint_id && t.status !== 'done');
  
  const sprintTasks = tasks.filter(t => t.sprint_id === selectedSprintId);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSprintId: string | null, targetStatus: TaskStatus | 'backlog') => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    if (targetStatus === 'backlog') {
      handleUpdateTask(taskId, { sprint_id: null });
    } else {
      handleUpdateTask(taskId, { sprint_id: targetSprintId, status: targetStatus });
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900/50">
      {/* Header Panel */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-4">
          <select 
            className="bg-black/50 border border-white/10 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            value={selectedSprintId || ''}
            onChange={e => setSelectedSprintId(e.target.value)}
          >
            <option value="" disabled>Выберите спринт...</option>
            {sprints.map(s => (
              <option key={s.id} value={s.id}>
                {s.title} {s.is_active ? '(Текущий)' : ''}
              </option>
            ))}
          </select>

          {selectedSprint && (
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(selectedSprint.start_date).toLocaleDateString()} — {new Date(selectedSprint.end_date).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
        
        <button 
          onClick={onCreateSprint}
          className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Новый спринт
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden flex">
        {/* Backlog Column (Collapsible) */}
        <div className={`flex flex-col border-r border-white/10 transition-all duration-300 ${isBacklogOpen ? 'w-[320px] min-w-[320px]' : 'w-[48px] min-w-[48px]'} bg-black/20`}>
          <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/40 h-[52px]">
            {isBacklogOpen && (
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white/80">Бэклог</h3>
                <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/60">{backlogTasks.length}</span>
              </div>
            )}
            <button 
              onClick={() => setIsBacklogOpen(!isBacklogOpen)}
              className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/20 text-white/60 mx-auto"
            >
              {isBacklogOpen ? '«' : '»'}
            </button>
          </div>
          
          {isBacklogOpen && (
            <div 
              className="flex-1 overflow-y-auto p-3 space-y-3"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, null, 'backlog')}
            >
              {backlogTasks.map(task => (
                <div 
                  key={task.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => onTaskClick(task)}
                  className="bg-black/50 border border-white/10 hover:border-white/30 p-3 rounded-lg cursor-pointer transition-colors flex flex-col gap-3 shadow-sm hover:shadow-indigo-500/10"
                >
                  <div className="font-medium text-white/90 text-sm leading-tight">
                    {task.title}
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleUpdateTask(task.id, { sprint_id: selectedSprintId, status: 'todo' }); }}
                      className="w-6 h-6 rounded bg-white/5 hover:bg-indigo-500/40 flex items-center justify-center text-white/60 hover:text-white"
                      title="Добавить в спринт"
                      disabled={!selectedSprintId}
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
              {backlogTasks.length === 0 && (
                <div className="text-center p-4 text-white/30 text-sm border border-dashed border-white/10 rounded-lg">
                  Бэклог пуст. Перетащите сюда задачу, чтобы убрать её из спринта.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sprint Columns */}
        <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
          {!selectedSprintId ? (
            <div className="flex-1 flex items-center justify-center text-white/40">
              Выберите или создайте спринт для планирования
            </div>
          ) : (
            COLUMNS.map(col => {
              const colTasks = sprintTasks.filter(t => t.status === col.id);
              return (
                <div 
                  key={col.id} 
                  className="flex-1 min-w-[300px] flex flex-col bg-black/20 rounded-xl border border-white/5 overflow-hidden"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, selectedSprintId, col.id)}
                >
                  <div className="p-3 bg-black/40 border-b border-white/10 flex justify-between items-center h-[52px]">
                    <h3 className="font-semibold text-white/80">{col.label}</h3>
                    <span className="text-xs bg-white/10 px-2 py-1 rounded-full text-white/60">{colTasks.length}</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {colTasks.map(task => (
                      <div 
                        key={task.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => onTaskClick(task)}
                        className="bg-black/50 border border-white/10 hover:border-white/30 p-3 rounded-lg cursor-pointer transition-colors flex flex-col gap-3 shadow-lg"
                      >
                        <div className="font-medium text-white/90 text-sm leading-tight">
                          {task.title}
                        </div>
                        
                        <div className="flex items-center justify-between mt-auto">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${priorityColors[task.priority]}`}>
                            {task.priority}
                          </span>
                          
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={() => {
                                if (col.id === 'todo') {
                                  handleUpdateTask(task.id, { sprint_id: null });
                                } else if (col.id === 'in_progress') {
                                  handleUpdateTask(task.id, { status: 'todo' });
                                } else {
                                  handleUpdateTask(task.id, { status: 'in_progress' });
                                }
                              }}
                              className="w-6 h-6 rounded bg-white/5 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white"
                            >
                              ←
                            </button>
                            {col.id !== 'done' && (
                              <button 
                                onClick={() => handleUpdateTask(task.id, { status: col.id === 'todo' ? 'in_progress' : 'done' })}
                                className="w-6 h-6 rounded bg-white/5 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white"
                              >
                                →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-center p-4 text-white/30 text-sm border border-dashed border-white/10 rounded-lg">
                        Перетащите задачи сюда
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
