import { fetchApi } from './client';

export interface SourceChunkSimple {
  id: string;
  chunk_index: number;
  text_content: string;
}

export interface SourceClaimSimple {
  id: string;
  content: string;
  claim_type: string;
  category: string | null;
  confidence: number;
  is_active: boolean;
  superseded_by: string | null;
}

export interface SourceItem {
  id: string;
  title: string;
  content: string | null;
  source_type: string;
  meta_info: Record<string, any>;
  file_type: string | null;
  original_file_path: string | null;
  raw_content: string | null;
  domain: string | null;
  folder: string | null;
  version: number;
  is_deleted: boolean;
  metadata_info: Record<string, any>;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  chunks_count: number;
  claims_count: number;
}

export interface SourceDetail extends SourceItem {
  chunks: SourceChunkSimple[];
  claims: SourceClaimSimple[];
}

export const sourcesApi = {
  getSources: async (params?: {
    domain?: string;
    folder?: string;
    search?: string;
    file_type?: string;
    include_deleted?: boolean;
  }): Promise<SourceItem[]> => {
    const searchParams = new URLSearchParams();
    if (params?.domain) searchParams.append('domain', params.domain);
    if (params?.folder) searchParams.append('folder', params.folder);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.file_type) searchParams.append('file_type', params.file_type);
    if (params?.include_deleted) searchParams.append('include_deleted', 'true');

    const query = searchParams.toString();
    const url = `/sources${query ? `?${query}` : ''}`;
    return fetchApi<SourceItem[]>(url);
  },

  getSourceDetail: async (id: string): Promise<SourceDetail> => {
    return fetchApi<SourceDetail>(`/sources/${id}`);
  },

  uploadFile: async (
    file: File,
    title?: string,
    folder?: string,
    domain?: string,
    importance: string = 'normal'
  ): Promise<SourceItem> => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (folder) formData.append('folder', folder);
    if (domain) formData.append('domain', domain);
    formData.append('importance', importance);

    return fetchApi<SourceItem>('/sources/upload', {
      method: 'POST',
      body: formData,
    });
  },

  uploadUrl: async (
    url: string,
    title?: string,
    folder?: string,
    domain?: string,
    importance: string = 'normal'
  ): Promise<SourceItem> => {
    return fetchApi<SourceItem>('/sources/url', {
      method: 'POST',
      body: JSON.stringify({
        url,
        title,
        folder: folder === '' || folder === 'root' ? null : folder,
        domain,
        importance,
      }),
    });
  },

  createNote: async (data: {
    title: string;
    content: string;
    source_type?: string;
    domain?: string;
    folder?: string;
    meta_info?: Record<string, any>;
  }): Promise<SourceItem> => {
    return fetchApi<SourceItem>('/sources', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateContent: async (
    id: string,
    raw_content: string,
    domain?: string
  ): Promise<SourceItem> => {
    return fetchApi<SourceItem>(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ raw_content, domain }),
    });
  },

  deleteSource: async (id: string): Promise<void> => {
    await fetchApi(`/sources/${id}`, {
      method: 'DELETE',
    });
  },
};
