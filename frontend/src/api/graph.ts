const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const graphApi = {
  getClaimGraph: async (claimId: string) => {
    const res = await fetch(`${API_URL}/graph/claims/${claimId}`);
    if (!res.ok) throw new Error('Failed to fetch graph');
    return res.json();
  },
  getGraphTopology: async (category?: string, limit: number = 300, include_superseded: boolean = false) => {
    const url = new URL(`${API_URL}/graph/topology`);
    url.searchParams.append('limit', limit.toString());
    if (include_superseded) {
      url.searchParams.append('include_superseded', 'true');
    }
    if (category) {
      url.searchParams.append('category', category);
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch topology');
    return res.json();
  }
};
