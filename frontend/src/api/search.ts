import { fetchApi } from './client';

export interface SearchResult {
  chunk_id: string;
  source_id: string;
  text_content: string;
  similarity?: number;
  rrf_score?: number;
  claim_id?: string | null;
}

export const searchApi = {
  query: (query: string, limit = 8): Promise<{ results: SearchResult[] }> => {
    const params = new URLSearchParams({
      query: query.trim(),
      limit: String(limit),
    });
    return fetchApi<{ results: SearchResult[] }>(`/search?${params.toString()}`);
  },
};
