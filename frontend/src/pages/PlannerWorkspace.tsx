import React, { useState, useEffect } from 'react';
import { plannerApi, DailyCockpitResponse, PlannerGoal, PlannerTask, PlannerSprint } from '../api/planner';
import { PlannerDomain } from '../api/planner';
import { DomainMatrix } from '../components/planner/DomainMatrix';
import { DailyTimeline } from '../components/planner/DailyTimeline';
import { SprintKanban } from '../components/planner/SprintKanban';
import { PlannerTableView } from '../components/planner/PlannerTableView';
import { CreatePlannerItemModal } from '../components/planner/CreatePlannerItemModal';
import { GoalDetailDrawer } from '../components/planner/GoalDetailDrawer';
import { ReadinessCheckModal } from '../components/planner/ReadinessCheckModal';
import { ReadinessResponse } from '../api/planner';
import { AlertProvider } from '../components/planner/AlertProvider';
import FocusStudio from '../components/focus/FocusStudio';

type PlannerTab = 'matrix' | 'timeline' | 'kanban' | 'table';

interface PlannerWorkspaceProps {
  onClose?: () => void;
}

export const PlannerWorkspace: React.FC<PlannerWorkspaceProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<PlannerTab>('table');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'goal' | 'task' | 'sprint'>('task');
  const [createModalDefaultDomainId, setCreateModalDefaultDomainId] = useState<string | undefined>();
  const [createModalDefaultGoalId, setCreateModalDefaultGoalId] = useState<string | undefined>();
  const [cockpit, setCockpit] = useState<DailyCockpitResponse | null>(null);
  const [goals, setGoals] = useState<PlannerGoal[]>([]);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [sprints, setSprints] = useState<PlannerSprint[]>([]);
  const [domains, setDomains] = useState<PlannerDomain[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);

  const [isFocusStudioOpen, setIsFocusStudioOpen] = useState(false);
  const [currentFocusTask, setCurrentFocusTask] = useState<PlannerTask | null>(null);

  const openGoalDrawer = (goalId: string) => {
    setSelectedGoalId(goalId);
    setIsDrawerOpen(true);
  };

  const openCreateModal = (type: 'goal' | 'task' | 'sprint', domainId?: string, goalId?: string) => {
    setCreateModalType(type);
    setCreateModalDefaultDomainId(domainId);
    setCreateModalDefaultGoalId(goalId);
    setIsCreateModalOpen(true);
  };

  const loadData = async () => {
    try {
      const [cockpitData, goalsData, tasksData, domainsData, sprintsData, readinessData] = await Promise.all([
        plannerApi.getDailyCockpit(),
        plannerApi.getGoals(),
        plannerApi.getTasks(),
        plannerApi.getDomains(),
        plannerApi.getSprints(),
        plannerApi.getTodayReadiness(),
      ]);
      setCockpit(cockpitData);
      setGoals(goalsData);
      setTasks(tasksData);
      setDomains(domainsData);
      setSprints(sprintsData);
      setReadiness(readinessData);
    } catch (e) {
      console.error('Failed to load planner data', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <AlertProvider userId="dev-user-id">
    <div className="absolute inset-0 z-50 bg-neutral-950 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Focus Studio</h1>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex bg-white/5 rounded-lg p-1">
          <button 
            onClick={() => setActiveTab('table')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'table' ? 'bg-white/10 text-white font-medium shadow' : 'text-white/50 hover:text-white/80'}`}
          >
            Дашборд
          </button>
          <button 
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'timeline' ? 'bg-white/10 text-white font-medium shadow' : 'text-white/50 hover:text-white/80'}`}
          >
            Расписание
          </button>
          <button 
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'matrix' ? 'bg-white/10 text-white font-medium shadow' : 'text-white/50 hover:text-white/80'}`}
          >
            Матрица
          </button>
          <button 
            onClick={() => setActiveTab('kanban')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'kanban' ? 'bg-white/10 text-white font-medium shadow' : 'text-white/50 hover:text-white/80'}`}
          >
            Спринты
          </button>
        </div>

        <div className="flex items-center gap-3">
          {readiness ? (
            <button 
              onClick={() => setIsReadinessModalOpen(true)}
              className="flex flex-col items-end px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5"
            >
              <div className="text-xs text-white/50 uppercase tracking-wide">CNS Score</div>
              <div className={`text-sm font-bold ${readiness.cns_score >= 8 ? 'text-emerald-400' : readiness.cns_score >= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
                {readiness.cns_score.toFixed(1)} / 10
              </div>
            </button>
          ) : (
            <button 
              onClick={() => setIsReadinessModalOpen(true)}
              className="px-4 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 text-sm font-medium rounded-lg transition-all animate-pulse"
            >
              Пройти утренний чек
            </button>
          )}

          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
          >
            + Создать
          </button>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0">
          {activeTab === 'table' && (
            <PlannerTableView 
              domains={domains} 
              goals={goals} 
              tasks={tasks}
              onCreateDomain={async (name, color) => {
                await plannerApi.createDomain({ name, color, icon: 'folder' });
                loadData();
              }}
              onCreateTask={async (task) => {
                await plannerApi.createTask(task);
                loadData();
              }}
              onCreateGoal={async (goal) => {
                await plannerApi.createGoal(goal);
                loadData();
              }}
              onUpdateTaskStatus={async (taskId, status) => {
                await plannerApi.updateTaskStatus(taskId, status);
                loadData();
              }}
            />
          )}
          {activeTab === 'timeline' && <DailyTimeline cockpit={cockpit} domains={domains} onTaskClick={(t) => {
            setCurrentFocusTask(t);
            setIsFocusStudioOpen(true);
          }} />}
          {activeTab === 'matrix' && <DomainMatrix goals={goals} domains={domains} onCreateGoal={(domainId) => openCreateModal('goal', domainId)} onGoalClick={(g) => openGoalDrawer(g.id)} />}
          {activeTab === 'kanban' && <SprintKanban tasks={tasks} sprints={sprints} onTaskUpdated={loadData} onTaskClick={(t) => {
            setCurrentFocusTask(t);
            setIsFocusStudioOpen(true);
          }} onCreateSprint={() => openCreateModal('sprint')} />}
        </div>
      </main>

      <GoalDetailDrawer
        goalId={selectedGoalId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        goals={goals}
        domains={domains}
        tasks={tasks}
        sprints={sprints}
        onGoalUpdated={loadData}
        onOpenCreateModal={openCreateModal}
        onToggleTaskStatus={async (taskId, currentStatus) => {
          const next = currentStatus === 'done' ? 'todo' : 'done';
          await plannerApi.updateTaskStatus(taskId, next);
          loadData();
        }}
      />

      <CreatePlannerItemModal 
        domains={domains}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        defaultType={createModalType}
        defaultDomain={createModalDefaultDomainId}
        defaultGoalId={createModalDefaultGoalId}
        onSuccess={() => {
          loadData();
        }}
      />

      <ReadinessCheckModal
        isOpen={isReadinessModalOpen}
        onClose={() => setIsReadinessModalOpen(false)}
        isRetest={!!readiness}
        onSuccess={(r) => setReadiness(r)}
      />

      {isFocusStudioOpen && (
        <FocusStudio
          activeTask={currentFocusTask}
          cnsScore={readiness?.cns_score}
          onCompleteSession={async (taskId, minutes) => {
            try {
              const task = tasks.find(t => t.id === taskId);
              const isDone = task ? (task.actual_minutes || 0) + minutes >= (task.estimated_minutes || 0) : false;
              
              await fetch(`/api/v1/planner/tasks/${taskId}/log-time`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  minutes: Math.max(1, Math.round(minutes)),
                  mark_as_done: isDone
                }),
              });
              loadData();
            } catch (error) {
              console.error('Не удалось сохранить фактическое время сессии:', error);
            }
          }}
          onExit={() => {
            setIsFocusStudioOpen(false);
            setCurrentFocusTask(null);
          }}
        />
      )}
    </div>
    </AlertProvider>
  );
};
