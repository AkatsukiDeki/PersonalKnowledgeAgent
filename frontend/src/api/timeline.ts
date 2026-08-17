import { fetchApi } from './client';

export interface TimelineEvent {
  id: string;
  event_type: string; // decision_change, tool_replacement, strategy_shift
  old_claim_id?: string;
  new_claim_id: string;
  source_id?: string;
  title: string;
  description: string;
  domain?: string;
  timestamp: string;
}

export const timelineApi = {
  getTimelineEvents: (domain?: string, limit: number = 50): Promise<TimelineEvent[]> => {
    let url = `/timeline/?limit=${limit}`;
    if (domain) {
      url += `&domain=${encodeURIComponent(domain)}`;
    }
    return fetchApi<TimelineEvent[]>(url);
  },

  rebuildTimeline: (): Promise<{ status: string }> => {
    return fetchApi<{ status: string }>('/timeline/rebuild', { method: 'POST' });
  }
};
