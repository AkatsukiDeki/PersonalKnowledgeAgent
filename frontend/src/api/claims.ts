import { fetchApi } from './client';

export interface ClaimItem {
  id: string;
  content: string;
  claim_type?: 'insight' | 'fact' | 'decision' | string;
  source_id?: string;
  conversation_id?: string;
  is_active: boolean;
  superseded_by?: string | null;
  created_at: string;
  updated_at: string;
}

export const claimsApi = {
  getClaims: async (): Promise<ClaimItem[]> => {
    return fetchApi<ClaimItem[]>('/claims');
  },
  listBySource: async (sourceId: string): Promise<ClaimItem[]> => {
    return fetchApi<ClaimItem[]>(`/claims?source_id=${sourceId}`);
  },
  update: async (claimId: string, payload: Partial<ClaimItem>): Promise<ClaimItem> => {
    return fetchApi<ClaimItem>(`/claims/${claimId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
