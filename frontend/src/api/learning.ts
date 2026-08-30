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
  }
};
