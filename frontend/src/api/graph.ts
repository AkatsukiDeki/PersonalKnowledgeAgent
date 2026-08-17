import { fetchApi } from './client';

export interface GraphNode {
  id: string;
  label: string;
  group: 'claim' | 'entity';
  category: string;
  val: number;
  is_active?: boolean;
  confidence?: number;
  created_at?: string;
  source_id?: string;
  chunk_id?: string;
  superseded_by?: string;
  aliases?: string[];
  content?: string;
  kind?: string;
  domain?: string;
  memory_score?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  color?: string;
  confidence?: number;
  evidence_summary?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export const graphApi = {
  getGraphData: (limit: number = 200, category?: string): Promise<GraphData> => {
    let url = `/graph/topology?limit=${limit}&include_superseded=true`;
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }
    return fetchApi<GraphData>(url);
  },
  getGraphTopology: (category?: string, limit: number = 200, showSuperseded?: boolean): Promise<GraphData> => {
    return graphApi.getGraphData(limit, category);
  }
};
