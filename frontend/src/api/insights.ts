import { fetchApi } from './client';

export interface InsightEvidenceItem {
  claim_id: string;
  claim_text: string;
  kind: string;
  confidence: number;
  chunk_text: string;
  source_title: string;
  source_importance: string;
}

export interface InsightEvidenceResponse {
  pattern_id: string;
  title: string;
  evidence: InsightEvidenceItem[];
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  pattern_type: string;
  confidence: number;
  importance: number;
  domains: string[];
  evidence_summary: string;
  evidence_claim_ids: string[];
  status: string;
  created_at: string;
}

export const insightsApi = {
  getPendingInsights: (): Promise<Insight[]> => {
    return fetchApi<Insight[]>('/insights/pending');
  },
  acceptInsight: (patternId: string): Promise<Insight> => {
    return fetchApi<Insight>(`/insights/${patternId}/accept`, { method: 'POST' });
  },
  dismissInsight: (patternId: string): Promise<Insight> => {
    return fetchApi<Insight>(`/insights/${patternId}/dismiss`, { method: 'POST' });
  },
  getInsightEvidence: (patternId: string): Promise<InsightEvidenceResponse> => {
    return fetchApi<InsightEvidenceResponse>(`/insights/${patternId}/evidence`);
  },
  generateInsights: (): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>('/insights/generate', { method: 'POST' });
  }
};
