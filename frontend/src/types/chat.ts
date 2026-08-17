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