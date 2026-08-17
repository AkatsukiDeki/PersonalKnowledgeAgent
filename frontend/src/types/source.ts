export interface Source {
  id: string;
  title: string;
  content: string;
  source_type: string;
  meta_info: Record<string, any>;

  // Source Manager 2.0 fields
  file_type?: string;
  original_file_path?: string;
  raw_content?: string;
  domain?: string;
  version: number;
  is_deleted: boolean;
  metadata_info: Record<string, any>;

  status: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;

  chunks_count: number;
  claims_count: number;
}

export interface SourceCreate {
  title: string;
  content: string;
  source_type?: string;
  meta_info?: Record<string, any>;
}

export interface SourceDetail extends Source {
  chunks: Array<{
    id: string;
    chunk_index: number;
    text_content: string;
  }>;
  claims: Array<{
    id: string;
    content: string;
    claim_type: string;
    category: string;
    confidence: number;
    is_active: boolean;
    superseded_by: string | null;
  }>;
}