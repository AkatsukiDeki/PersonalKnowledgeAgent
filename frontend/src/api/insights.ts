import { fetchApi } from './client';

export interface InsightEvidenceItem {
  id: string;
  type: string;
  text: string;
  domain?: string | null;
  conversation_id?: string | null;
}

export interface InsightEvidenceResponse {
  insight_id: string;
  title: string;
  evidence: InsightEvidenceItem[];
}

export interface Insight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  evidence_links: string[];
  domains_involved: string[];
  importance_score: number;
  created_at: string;
}

export const insightsApi = {
  getInsights: (): Promise<Insight[]> => {
    return fetchApi<Insight[]>('/insights/');
  },
  getInsightEvidence: (insightId: string): Promise<InsightEvidenceResponse> => {
    return fetchApi<InsightEvidenceResponse>(`/insights/${insightId}/evidence`);
  },
  generateInsights: (): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>('/insights/generate', { method: 'POST' });
  }
};
