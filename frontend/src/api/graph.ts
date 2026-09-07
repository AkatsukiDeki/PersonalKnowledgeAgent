import { fetchApi } from './client';
import { GraphData } from '../types/graph';

export type { GraphNode, GraphLink, GraphData } from '../types/graph';

export type GraphCopilotAction = 'explain_connections' | 'active_recall' | 'find_blindspots';

export interface GraphCopilotRequest {
  action: GraphCopilotAction;
  node_type?: string;
}

export interface GraphCopilotResponse {
  result_text: string;
}

export interface BridgeClaimItem {
  id: string;
  content: string;
  source_id: string;
  source_title: string;
  domain: string;
  confidence: number;
  is_superseded: boolean;
}

export interface CrossDomainBridgeItem {
  bridge_id: string;
  relation_type: string;
  strength: number;
  evidence_score: number;
  source_claim: BridgeClaimItem;
  target_claim: BridgeClaimItem;
  supporting_snippet: string | null;
}

export interface BridgeContextResponse {
  domain_a: string;
  domain_b: string;
  total_bridges: number;
  top_bridges: CrossDomainBridgeItem[];
  evidence_sufficient: boolean;
}

export interface GalaxyGraphNode {
  id: string;
  name: string;
  type: 'technology' | 'concept' | 'pattern' | 'tool' | 'person' | string;
  description: string;
  size: number;
  connection_count: number;
  created_at: string | null;
}

export interface GalaxyGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: 'depends_on' | 'implements' | 'uses' | 'relates_to' | 'conflicts_with' | string;
  weight: number;
  source_chunk_id: string | null;
  created_at: string | null;
}

export interface GalaxyGraphResponse {
  nodes: GalaxyGraphNode[];
  edges: GalaxyGraphEdge[];
}

export interface GraphEntityRelation {
  id: string;
  relation_type: string;
  weight: number;
  direction: 'incoming' | 'outgoing';
  related_id: string;
  related_name: string;
  related_type: string;
}

export interface GraphEntitySource {
  id: string;
  title: string;
}

export interface GraphEntityDetails {
  id: string;
  name: string;
  type: string;
  description: string;
  created_at: string | null;
  relations: GraphEntityRelation[];
  sources: GraphEntitySource[];
}

export const graphApi = {
  getGraphData: (limit: number = 200, category?: string, includeSuperseded = true): Promise<GraphData> => {
    const params = new URLSearchParams({
      limit: String(limit),
      include_superseded: String(includeSuperseded),
    });
    if (category) {
      params.set('category', category);
    }
    return fetchApi<GraphData>(`/graph/topology?${params.toString()}`);
  },
  getGraphTopology: (
    category?: string,
    limit: number = 200,
    showSuperseded = false,
  ): Promise<GraphData> => {
    return graphApi.getGraphData(limit, category, showSuperseded);
  },
  runCopilotAction: async (
    nodeId: string,
    payload: GraphCopilotRequest
  ): Promise<GraphCopilotResponse> => {
    return fetchApi<GraphCopilotResponse>(`/graph/${nodeId}/copilot-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
  getEntityDetails: async (entityId: string): Promise<GraphEntityDetails> => {
    return fetchApi<GraphEntityDetails>(`/graph/entities/${entityId}`);
  },
  getBridgeContext: async (domainA: string, domainB: string, limit: number = 5): Promise<BridgeContextResponse> => {
    const params = new URLSearchParams({
      domain_a: domainA,
      domain_b: domainB,
      limit: String(limit),
    });
    return fetchApi(`/graph/bridge-context?domain_a=${encodeURIComponent(domainA)}&domain_b=${encodeURIComponent(domainB)}`);
  },

  getGalaxyUniverse: (): Promise<GalaxyGraphResponse> => {
    return fetchApi('/graph/galaxy-universe');
  }
};
