const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const claimsApi = {
  listBySource: async (sourceId: string) => {
    const res = await fetch(`${API_URL}/claims?source_id=${sourceId}`);
    if (!res.ok) throw new Error('Failed to fetch claims');
    return res.json();
  },
};
