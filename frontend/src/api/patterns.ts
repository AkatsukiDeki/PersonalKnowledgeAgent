import { fetchApi } from './client';

export interface Pattern {
  id: string;
  title: string;
  description: string;
  pattern_type: 'behavioral' | 'cognitive' | 'productivity' | 'architectural';
  domains: string[];
  confidence: number;
  evidence_summary: string;
  evidence_claim_ids: string[];
  meta_info: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export const patternsApi = {
  getPatterns: async (limit: number = 50, offset: number = 0): Promise<Pattern[]> => {
    return await fetchApi<Pattern[]>(`/patterns?limit=${limit}&offset=${offset}`);
  },

  discoverPatterns: async (): Promise<Pattern[]> => {
    return await fetchApi<Pattern[]>('/patterns/discover', { method: 'POST' });
  }
};
