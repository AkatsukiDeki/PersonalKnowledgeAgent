import { fetchApi } from './client';
import { Source, SourceCreate, SourceDetail } from '../types/source';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export const sourcesApi = {
  create: (data: SourceCreate): Promise<Source> => {
    return fetchApi<Source>('/sources/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  upload: async (file: File, domain?: string): Promise<Source> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);
    formData.append('importance', 'normal');
    if (domain) {
      formData.append('domain', domain);
    }

    const res = await fetch(`${BASE_URL}/sources/upload`, {
      method: 'POST',
      body: formData,
      // No Content-Type header — browser sets multipart/form-data boundary automatically
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  list: (params?: { domain?: string; file_type?: string; search?: string }): Promise<Source[]> => {
    const query = new URLSearchParams();
    if (params?.domain) query.append('domain', params.domain);
    if (params?.file_type) query.append('file_type', params.file_type);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString();
    return fetchApi<Source[]>(`/sources/${qs ? '?' + qs : ''}`);
  },

  getDetail: (id: string): Promise<SourceDetail> => {
    return fetchApi<SourceDetail>(`/sources/${id}`);
  },

  update: (id: string, rawContent: string, domain?: string): Promise<Source> => {
    return fetchApi<Source>(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ raw_content: rawContent, domain }),
    });
  },

  delete: (id: string): Promise<void> => {
    return fetchApi(`/sources/${id}`, { method: 'DELETE' });
  },
};

export default sourcesApi;