import { fetchApi } from "./client";

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export interface QuizOption {
  text: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
  explanation: string;
}

export interface LearningRequest {
  source_id?: string;
  topic?: string;
  count?: number;
  language?: string;
}

export const learningApi = {
  generateFlashcards: async (req: LearningRequest): Promise<Flashcard[]> => {
    const res = await fetch(`${API_BASE}/learning/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if (!res.ok) throw new Error("Failed to generate flashcards");
    const data = await res.json();
    return data.cards;
  },
  
  generateQuiz: async (req: LearningRequest): Promise<QuizQuestion[]> => {
    const res = await fetch(`${API_BASE}/learning/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if (!res.ok) throw new Error("Failed to generate quiz");
    const data = await res.json();
    return data.questions;
  },

  generateRoadmap: async (req: GenerateRoadmapRequest): Promise<AdaptiveRoadmapPayload> => {
    return fetchApi<AdaptiveRoadmapPayload>("/learning/roadmap", {
      method: "POST",
      body: JSON.stringify(req)
    });
  },
  
  generateStudyNote: async (req: GenerateStudyNoteRequest): Promise<StudyNoteResponse> => {
    return fetchApi<StudyNoteResponse>("/learning/generate-note", {
      method: "POST",
      body: JSON.stringify(req)
    });
  }
};

export interface LearningScope {
  source_ids: string[];
  domains: string[];
  folder?: string | null;
  recursive: boolean;
}

export interface RoadmapEvidence {
  source_id: string;
  source_name: string;
  claim_ids: string[];
  chunk_ids: string[];
}

export interface RoadmapSubtopic {
  id: string;
  title: string;
  summary: string;
  key_takeaways: string[];
  evidence: RoadmapEvidence[];
}

export interface RoadmapModule {
  id: string;
  title: string;
  level: "fundamentals" | "core" | "advanced" | "troubleshooting";
  description: string;
  topics: RoadmapSubtopic[];
}

export interface AdaptiveRoadmapPayload {
  title: string;
  target_role?: string | null;
  overview: string;
  modules: RoadmapModule[];
}

export interface GenerateRoadmapRequest {
  scope: LearningScope;
  target_role?: string;
  target_goal?: string;
  preferred_depth?: number;
}

export interface StudyCitation {
  marker: number;
  source_id: string;
  chunk_id: string;
  source_name: string;
}

export interface GenerateStudyNoteRequest {
  roadmap_payload: AdaptiveRoadmapPayload;
  module_id: string;
  topic_id: string;
  scope: LearningScope;
}

export interface StudyNoteResponse {
  title: string;
  markdown: string;
  key_insights: string[];
  citations: StudyCitation[];
  insufficient_evidence: boolean;
  evidence_warning?: string | null;
}
