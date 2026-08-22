import { fetchApi } from './client';
import { SourceItem } from './sources';

export interface SubjectItem {
  id: string;
  title: string;
  description?: string;
  color_theme?: string;
  mastery_score?: number;
  sources_count?: number;
  created_at: string;
  updated_at: string;
}

export type Subject = SubjectItem;

export interface SubjectDetail extends SubjectItem {
  sources: SourceItem[];
  roadmap?: any;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  hint?: string;
}

export interface PracticeParams {
  node_id?: string | null;
  topic_title?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard' | 'exam';
  count?: number;
}

export interface SubjectStatsData {
  timeframe: string;
  since_date: string | null;
  mastery_score: number;
  is_mastered: boolean;
  total_sessions: number;
  avg_score: number;
  current_streak: number;
  quiz_count: number;
  flashcard_count: number;
  exam_count: number;
  activity_map: Record<string, number>;
  weak_spots: Array<{ concept: string; count: number }>;
  recent_sessions: Array<{
    id: string;
    session_type: string;
    topic_name: string;
    score: number;
    created_at: string;
  }>;
}

export const subjectsApi = {
  getSubjects: async (): Promise<SubjectItem[]> => {
    return fetchApi<SubjectItem[]>('/subjects');
  },

  getSubject: async (id: string): Promise<SubjectDetail> => {
    return fetchApi<SubjectDetail>(`/subjects/${id}`);
  },

  getSubjectSources: async (subjectId: string): Promise<SourceItem[]> => {
    const subject = await fetchApi<SubjectDetail>(`/subjects/${subjectId}`);
    return subject.sources || [];
  },

  createSubject: async (data: {
    title: string;
    description?: string;
    icon?: string;
    color_theme?: string;
  }): Promise<{ id: string; title: string; is_mastered: boolean }> => {
    return fetchApi<{ id: string; title: string; is_mastered: boolean }>('/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateSubject: async (
    id: string,
    data: {
      title?: string;
      description?: string;
      icon?: string;
      color_theme?: string;
      is_mastered?: boolean;
    }
  ): Promise<{ status: string; id: string }> => {
    return fetchApi<{ status: string; id: string }>(`/subjects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteSubject: async (id: string): Promise<{ status: string; id: string }> => {
    return fetchApi<{ status: string; id: string }>(`/subjects/${id}`, {
      method: 'DELETE',
    });
  },

  attachSource: async (subjectId: string, sourceId: string): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>(`/subjects/${subjectId}/sources/${sourceId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  detachSource: async (subjectId: string, sourceId: string): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>(`/subjects/${subjectId}/sources/${sourceId}`, {
      method: 'DELETE',
    });
  },

  getStats: async (subjectId: string, timeframe: '7d' | '30d' | 'season_3m' | 'all' = 'season_3m'): Promise<SubjectStatsData> => {
    const res = await fetch(`/api/v1/subjects/${subjectId}/stats?timeframe=${timeframe}`);
    if (!res.ok) throw new Error('Failed to load stats');
    return res.json();
  },

  getRoadmap: async (subjectId: string): Promise<any> => {
    const subject = await fetchApi<SubjectDetail>(`/subjects/${subjectId}`);
    return subject.roadmap || null;
  },

  generateRoadmap: async (subjectId: string): Promise<{ status: string; roadmap: any }> => {
    return fetchApi<{ status: string; roadmap: any }>(`/subjects/${subjectId}/roadmap/generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  updateNodeStatus: async (
    subjectId: string,
    nodeId: string,
    status: 'not_started' | 'in_progress' | 'completed'
  ): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>(`/subjects/${subjectId}/roadmap/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  generateQuiz: async (
    subjectId: string,
    params?: PracticeParams
  ): Promise<{ questions: QuizQuestion[] }> => {
    return fetchApi<{ questions: QuizQuestion[] }>(`/subjects/${subjectId}/quiz/generate`, {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  },

  generateFlashcards: async (
    subjectId: string,
    params?: PracticeParams
  ): Promise<{ flashcards: FlashcardItem[] }> => {
    return fetchApi<{ flashcards: FlashcardItem[] }>(`/subjects/${subjectId}/flashcards/generate`, {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  },

  generateExam: async (subjectId: string): Promise<{ questions: QuizQuestion[] }> => {
    return fetchApi<{ questions: QuizQuestion[] }>(`/subjects/${subjectId}/exam/generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  recordSession: async (payload: {
    subject_id?: string | null;
    session_type: 'quiz' | 'flashcard' | 'exam';
    topic_name: string;
    score: number;
    failed_concepts?: string[];
  }): Promise<{ status: string; session_id: string }> => {
    return fetchApi<{ status: string; session_id: string }>('/subjects/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getTutorHistory: async (subjectId: string): Promise<{ messages: { role: string; content: string }[] }> => {
    return fetchApi<{ messages: { role: string; content: string }[] }>(`/subjects/${subjectId}/tutor/messages`);
  },

  sendTutorMessage: async (
    subjectId: string,
    message: string,
    topicContext?: string
  ): Promise<{ reply: string }> => {
    return fetchApi<{ reply: string }>(`/subjects/${subjectId}/tutor/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, topic_context: topicContext }),
    });
  },

  resetTutorChat: async (subjectId: string): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>(`/subjects/${subjectId}/tutor/messages`, {
      method: 'DELETE',
    });
  },

  reviewFlashcard: async (subjectId: string, cardId: string, quality: number): Promise<{ status: string; next_due: string }> => {
    return fetchApi<{ status: string; next_due: string }>(`/subjects/${subjectId}/flashcards/${cardId}/review`, {
      method: 'POST',
      body: JSON.stringify({ quality }),
    });
  },

  getWeakSpotsReport: async (subjectId: string): Promise<{ markdown: string }> => {
    return fetchApi<{ markdown: string }>(`/subjects/${subjectId}/reports/weak-spots`);
  },
};