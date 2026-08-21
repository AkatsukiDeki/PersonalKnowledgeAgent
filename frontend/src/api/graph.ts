import { fetchApi } from './client';
import { GraphData } from '../types/graph';

export type { GraphNode, GraphLink, GraphData } from '../types/graph';

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
};
