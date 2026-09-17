import { fetchApi } from './client';

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  source_id: string;
  sequence_num: number;
}

export interface Playlist {
  id: string;
  title: string;
  description: string | null;
  last_played_item_id: string | null;
  items: PlaylistItem[];
}

export const playlistsApi = {
  list: () => fetchApi<Playlist[]>('/playlists/'),
  
  get: (id: string) => fetchApi<Playlist>(`/playlists/${id}`),
  
  create: (data: { title: string; description?: string }) => 
    fetchApi<Playlist>('/playlists/', { method: 'POST', body: JSON.stringify(data) }),
    
  update: (id: string, data: { title?: string; description?: string; last_played_item_id?: string | null }) => 
    fetchApi<Playlist>(`/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    
  delete: (id: string) => fetchApi(`/playlists/${id}`, { method: 'DELETE' }),
  
  addItem: (playlistId: string, data: { source_id: string; sequence_num?: number }) => 
    fetchApi<PlaylistItem>(`/playlists/${playlistId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    
  removeItem: (playlistId: string, itemId: string) => 
    fetchApi(`/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' }),
    
  reorderItems: (playlistId: string, itemIds: string[]) => 
    fetchApi(`/playlists/${playlistId}/reorder`, { method: 'PUT', body: JSON.stringify({ item_ids: itemIds }) }),
};
