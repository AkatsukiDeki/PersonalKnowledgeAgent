import React, { useState, useEffect } from 'react';
import { CheckSquare, Square, Clock, Plus, Trash2, BrainCircuit, Play } from 'lucide-react';
import { tasksApi, Task, TaskStatus, TaskPriority, TaskCreate, TaskUpdate } from '../../api/tasks';
import { useFocus } from '../../context/FocusContext';

interface Props {
  subjectId: string;
}

export const SubjectTasks: React.FC<Props> = ({ subjectId }) => {
  const { startFocusWithTask } = useFocus();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    fetchTasks();
  }, [subjectId]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getTasks({ subject_id: subjectId });
      setTasks(data);
    } catch (e) {
      console.error('Failed to fetch tasks', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
    
    // Optimistic UI update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    
    try {
      await tasksApi.updateTask(task.id, { status: newStatus });
    } catch (e) {
      // Revert on failure
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      console.error('Failed to update task status', e);
    }
  };

  const handleDelete = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await tasksApi.deleteTask(taskId);
    } catch (e) {
      console.error('Failed to delete task', e);
      fetchTasks(); // Reload to restore
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const title = newTaskTitle.trim();
    setNewTaskTitle('');

    try {
      const newTask = await tasksApi.createTask({
        title,
        subject_id: subjectId,
        priority: 'medium',
      });
      setTasks(prev => [newTask, ...prev]);
    } catch (e) {
      console.error('Failed to create task', e);
    }
  };

  if (loading) {
    return <div className="p-6 text-zinc-400">Загрузка задач...</div>;
  }

  const todoTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'archived');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const renderTask = (task: Task) => (
    <div key={task.id} className="group flex items-start gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:bg-zinc-800/80 transition-colors">
      <button 
        onClick={() => handleToggleStatus(task)}
        className="mt-0.5 shrink-0 text-zinc-500 hover:text-indigo-400 transition-colors"
      >
        {task.status === 'done' ? (
          <CheckSquare size={18} className="text-emerald-500" />
        ) : (
          <Square size={18} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {task.created_by === 'adaptive_engine' && (
            <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
              <BrainCircuit size={10} />
              Adaptive
            </span>
          )}
          {task.topic_name && (
            <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded truncate max-w-[150px]">
              {task.topic_name}
            </span>
          )}
          {task.status !== 'done' && (
            <button 
              onClick={() => startFocusWithTask(task.id, task.title, 25)}
              className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded transition-colors"
            >
              <Play size={10} className="text-red-400" />
              Фокус
            </button>
          )}
          {task.priority === 'high' && (
            <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">High Priority</span>
          )}
        </div>
      </div>
      <button
        onClick={() => handleDelete(task.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity p-1"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CheckSquare className="text-indigo-400" />
          Задачи предмета
        </h2>
      </div>

      <form onSubmit={handleCreateTask} className="flex gap-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          placeholder="Добавить новую задачу..."
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim()}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 flex items-center gap-2 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Добавить
        </button>
      </form>

      <div className="space-y-6">
        {todoTasks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">В работе ({todoTasks.length})</h3>
            <div className="space-y-2">
              {todoTasks.map(renderTask)}
            </div>
          </div>
        )}

        {doneTasks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Выполнено ({doneTasks.length})</h3>
            <div className="space-y-2">
              {doneTasks.map(renderTask)}
            </div>
          </div>
        )}

        {tasks.length === 0 && (
          <div className="text-center py-10 text-zinc-500">
            Нет активных задач. Запустите адаптивную сессию или создайте задачу вручную.
          </div>
        )}
      </div>
    </div>
  );
};
