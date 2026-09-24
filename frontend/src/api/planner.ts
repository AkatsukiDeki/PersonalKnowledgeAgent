const API_BASE = '/api/v1/planner';

export interface PlannerDomain {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon?: string;
  created_at: string;
}

export type PlanningCadence = 'milestone' | 'sprint' | 'flow' | 'cyclic';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'postponed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type GoalLevel = 'vision' | 'milestone' | 'semester' | 'subject' | 'sprint';

export interface PlannerGoal {
  id: string;
  domain_id: string;
  parent_goal_id?: string;       // GBS: родительская цель (иерархия)
  level?: GoalLevel;             // Уровень абстракции
  title: string;
  description?: string;
  cadence: PlanningCadence;
  target_date?: string;
  progress_pct: number;
  is_active: boolean;
  risks?: string;                // Risk & Friction Engine: риски/блокеры
  contingency_plan?: string;     // План Б
  sub_goals?: PlannerGoal[];     // Дочерние цели (рекурсивно)
}

export interface PlannerSprint {
  id: string;
  goal_id: string;
  title: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface PlannerTask {
  id: string;
  domain_id: string;
  goal_id?: string | null;
  sprint_id?: string | null;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_minutes: number;
  actual_minutes: number;
  due_date?: string;
  linked_subject_id?: string;
  linked_workout_plan_id?: string;
}

export interface DailyCockpitResponse {
  date: string;
  cns_fatigue_score: number;
  sleep_hours: number;
  readiness_status: string;
  active_workout?: {
    id: string;
    location: string;
    split_name: string;
    status: string;
  };
  todays_tasks: PlannerTask[];
  active_sprints: PlannerSprint[];
}

export interface ReadinessPayload {
  sleep_hours: number;
  sleep_quality: number; // 1-5
  tapping_count: number;
  mental_clarity: number; // 1-5
  physical_freshness: number; // 1-5
  motivation: number; // 1-5
  is_baseline?: boolean;
}

export interface ReadinessResponse {
  id: string;
  date: string;
  sleep_hours: number;
  sleep_quality: number;
  tapping_count: number;
  mental_clarity: number;
  physical_freshness: number;
  motivation: number;
  sleep_score: number;
  cns_score: number;
  is_baseline: boolean;
}

export const plannerApi = {
  getCalendarView: async (start_date: string, end_date: string) => {
    const res = await fetch(`${API_BASE}/calendar/view?start_date=${start_date}&end_date=${end_date}`);
    if (!res.ok) throw new Error('Failed to fetch calendar');
    return res.json();
  },
  getDomains: async (): Promise<PlannerDomain[]> => {
    const response = await fetch(`${API_BASE}/domains`);
    if (!response.ok) throw new Error('Failed to fetch domains');
    return response.json();
  },

  createDomain: async (data: Omit<PlannerDomain, 'id' | 'user_id' | 'created_at'>): Promise<PlannerDomain> => {
    const response = await fetch(`${API_BASE}/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create domain');
    return response.json();
  },

  getGoals: (domain_id?: string): Promise<PlannerGoal[]> =>
    fetch(`${API_BASE}/goals${domain_id ? `?domain_id=${domain_id}` : ''}`).then(r => r.json()),

  createGoal: (payload: Partial<PlannerGoal>): Promise<PlannerGoal> =>
    fetch(`${API_BASE}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  getSprints: (goalId?: string): Promise<PlannerSprint[]> =>
    fetch(`${API_BASE}/sprints${goalId ? `?goal_id=${goalId}` : ''}`).then(r => r.json()),

  getTasks: (params?: { domain_id?: string; status?: TaskStatus }): Promise<PlannerTask[]> => {
    const q = new URLSearchParams(params as any).toString();
    return fetch(`${API_BASE}/tasks${q ? `?${q}` : ''}`).then(r => r.json());
  },

  createTask: (payload: Partial<PlannerTask>): Promise<PlannerTask> =>
    fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  updateTask: async (taskId: string, updates: Partial<PlannerTask>): Promise<PlannerTask> => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update task');
    return res.json();
  },
  updateTaskStatus: (taskId: string, status: TaskStatus): Promise<PlannerTask> =>
    fetch(`${API_BASE}/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(r => r.json()),

  getDailyCockpit: (): Promise<DailyCockpitResponse> =>
    fetch(`${API_BASE}/daily-cockpit`).then(r => r.json()),

  getTodayReadiness: (): Promise<ReadinessResponse> =>
    fetch(`${API_BASE}/readiness/today`).then(async r => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Failed to fetch readiness');
      return r.json();
    }),

  submitReadiness: (payload: ReadinessPayload): Promise<ReadinessResponse> =>
    fetch(`${API_BASE}/readiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
};
