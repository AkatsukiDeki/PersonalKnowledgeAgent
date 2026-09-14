import { fetchApi } from './client';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  source_id?: string;
  subject_id?: string;
  topic_name?: string;
  due_date?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  priority?: TaskPriority;
  source_id?: string;
  subject_id?: string;
  topic_name?: string;
  due_date?: string;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
}

export const tasksApi = {
  getTasks: async (params?: {
    subject_id?: string;
    source_id?: string;
    status?: TaskStatus;
  }): Promise<Task[]> => {
    const query = new URLSearchParams();
    if (params?.subject_id) query.append('subject_id', params.subject_id);
    if (params?.source_id) query.append('source_id', params.source_id);
    if (params?.status) query.append('status', params.status);
    
    const qStr = query.toString();
    return await fetchApi<Task[]>(`/tasks${qStr ? '?' + qStr : ''}`);
  },

  createTask: async (data: TaskCreate): Promise<Task> => {
    return await fetchApi<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTask: async (taskId: string, data: TaskUpdate): Promise<Task> => {
    return await fetchApi<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteTask: async (taskId: string): Promise<void> => {
    await fetchApi<void>(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },

  syncTasksFromSource: async (sourceId: string): Promise<{ synced: number }> => {
    return await fetchApi<{ synced: number }>(`/tasks/sync-from-source/${sourceId}`, {
      method: 'POST',
    });
  },
};
export interface FocusContextResponse {
  task_title: string;
  topic_name: string | null;
  context_snippets: string[];
}

export const getFocusContext = (taskId: string): Promise<FocusContextResponse> => {
  return fetchApi('/tasks/' + taskId + '/focus-context', { method: 'GET' });
};
