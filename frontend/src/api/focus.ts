import { fetchApi } from './client';

export interface FocusSessionStart {
  session_type: string;
  target_duration_min: number;
  subject_id?: string;
  task_name?: string;
}

export interface FocusSessionStartResponse {
  session_id: string;
  started_at: string;
}

export interface FocusSessionFinish {
  session_id: string;
  actual_duration_sec: number;
  completed: boolean;
  interrupted: boolean;
  session_notes?: string;
}

export interface FocusSessionFinishResponse {
  status: string;
  created_source_id: string | null;
}

export interface SubjectStat {
  subject_name: string | null;
  seconds: number;
}

export interface FocusStats {
  total_focus_seconds: number;
  completed_sessions_count: number;
  interrupted_sessions_count: number;
  by_subject: SubjectStat[];
}

export const focusApi = {
  startSession: async (data: FocusSessionStart): Promise<FocusSessionStartResponse> => {
    return fetchApi<FocusSessionStartResponse>('/focus/start', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  finishSession: async (data: FocusSessionFinish): Promise<FocusSessionFinishResponse> => {
    return fetchApi<FocusSessionFinishResponse>('/focus/finish', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getTodayStats: async (): Promise<FocusStats> => {
    return fetchApi<FocusStats>('/focus/stats/today');
  }
};
