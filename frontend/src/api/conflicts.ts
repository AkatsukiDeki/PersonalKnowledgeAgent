import { fetchApi } from './client';

export interface ClaimInfo {
  id: string;
  content: string;
  claim_type: string;
  category: string;
  confidence: number;
  is_active: boolean;
  source_title?: string;
  source_domain?: string;
}

export interface ConflictResponse {
  id: string;
  status: string;
  resolution_summary?: string;
  created_at: string;
  claim_a: ClaimInfo;
  claim_b: ClaimInfo;
}

export interface EditClaimRequest {
  claim_id: string;
  new_content: string;
}

export interface ResolveConflictRequest {
  strategy: 'supersede' | 'coexist' | 'edit';
  winner_claim_id?: string;
  edited_claims?: EditClaimRequest[];
  resolution_notes?: string;
}

export const conflictsApi = {
  getConflicts: (status?: string): Promise<ConflictResponse[]> => {
    const url = status ? `/conflicts/?status_filter=${status}` : '/conflicts/';
    return fetchApi<ConflictResponse[]>(url);
  },
  
  getUnresolvedCount: async (): Promise<number> => {
    const conflicts = await fetchApi<ConflictResponse[]>('/conflicts/?status_filter=unresolved');
    return conflicts.length;
  },
  
  resolveConflict: (conflictId: string, payload: ResolveConflictRequest): Promise<ConflictResponse> => {
    return fetchApi<ConflictResponse>(`/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
};
