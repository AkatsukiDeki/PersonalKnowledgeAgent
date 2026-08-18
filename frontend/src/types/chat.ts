export interface Citation {
  chunk_id: string;
  source_id: string;
  text_snippet: string;
  score: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: string;
  isStreaming?: boolean;
}

export interface Decision {
  id: string;
  decision: string;
  rationale?: string;
  alternatives?: string[];
  status: string;
  created_at: string;
}

export interface ConversationMemory {
  id: string;
  problem: string;
  context?: string;
  attempts?: string[];
  decision_summary: string;
  outcome?: string;
  importance?: number;
}