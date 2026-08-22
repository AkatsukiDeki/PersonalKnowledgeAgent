const API_BASE = 'http://localhost:8000/api/v1';

export interface UserProfile {
  id: string;
  role: string;
  stack: string[];
  invariants: string;
  learning_style: string;
  projects?: string;
  is_seeded: boolean;
}

export const profileApi = {
  getProfile: async (): Promise<UserProfile | null> => {
    const res = await fetch(`${API_BASE}/profile/`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  },

  seedProfile: async (data: Omit<UserProfile, 'id' | 'is_seeded'>): Promise<any> => {
    const res = await fetch(`${API_BASE}/profile/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to save profile');
    return res.json();
  }
};
