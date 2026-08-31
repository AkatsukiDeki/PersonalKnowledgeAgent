export type ChatMode = 'fast' | 'vault' | 'learning' | 'reasoning';

export interface LearningContext {
  subject_id?: string;
  topic_id?: string;
  subject_name?: string;
}

export interface Citation {
  chunk_id: string;
  source_id: string;
  text_snippet: string;
  score: number;
}

export interface MessageTelemetry {
  t_emb_ms?: number;
  t_sql_ms?: number;
  ttft_ms?: number;
  total_ms?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: string;
  isStreaming?: boolean;
  image_base64?: string;
  image_mime_type?: string;
  meta_info?: {
    telemetry?: MessageTelemetry;
    [key: string]: any;
  };
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

/* ── Provenance Tree types ── */
export interface ProvenanceNode {
  type: 'decision' | 'claim' | 'source';
  id: string;
  label: string;
  status?: string;       // 'active' | 'superseded'
  weight?: number;       // decision score
  snippet?: string;      // source text snippet
  children?: ProvenanceNode[];
}

/* ── Memory Orbit live context ── */
export interface OrbitContext {
  decisions: Decision[];
  evidences: Citation[];
  insights: { id: string; title: string; domain?: string }[];
}