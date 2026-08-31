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

export interface TaskPayload {
  title?: string | null;
  description?: string | null;
  context_quote?: string | null;
}

export interface ContextActionRequest {
  action: 'explain' | 'summarize' | 'create_task';
  selected_text: string;
  surrounding_context?: string;
}

export interface ContextActionResponse {
  result_text?: string | null;
  task_payload?: TaskPayload | null;
}

// Folder tree types
export interface FolderTreeNode {
  count: number;
  children: Record<string, FolderTreeNode>;
}

export interface FolderTreeResponse {
  children: Record<string, FolderTreeNode>;
}

export const sourcesApi = {
  getSources: async (params?: {
    domain?: string;
    folder?: string;
    recursive?: boolean;
    search?: string;
    file_type?: string;
    include_deleted?: boolean;
  }): Promise<SourceItem[]> => {
    const searchParams = new URLSearchParams();
    if (params?.domain) searchParams.append('domain', params.domain);
    if (params?.folder) searchParams.append('folder', params.folder);
    if (params?.recursive) searchParams.append('recursive', 'true');
    if (params?.search) searchParams.append('search', params.search);
    if (params?.file_type) searchParams.append('file_type', params.file_type);
    if (params?.include_deleted) searchParams.append('include_deleted', 'true');

    const query = searchParams.toString();
    const url = `/sources${query ? `?${query}` : ''}`;
    return fetchApi<SourceItem[]>(url);
  },

  list: async (params?: any): Promise<SourceItem[]> => {
    return sourcesApi.getSources(params);
  },

  getSourceDetail: async (id: string): Promise<SourceDetail> => {
    return fetchApi<SourceDetail>(`/sources/${id}`);
  },
  getDetail: async (id: string): Promise<SourceDetail> => {
    return sourcesApi.getSourceDetail(id);
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
    if (domain && domain.trim()) formData.append('domain', domain.trim());
    formData.append('importance', importance);

    return fetchApi<SourceItem>('/sources/upload', {
      method: 'POST',
      body: formData,
    });
  },
  upload: async (file: File, domain?: string, folder?: string): Promise<SourceItem> => {
    return sourcesApi.uploadFile(file, undefined, folder, domain, 'normal');
  },

  uploadMedia: async (file: File, profile: string = 'speech', subject_id?: string): Promise<SourceItem> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('profile', profile);
    if (subject_id) formData.append('subject_id', subject_id);

    return fetchApi<SourceItem>('/media/upload', {
      method: 'POST',
      body: formData,
    });
  },

  retranscribe: async (sourceId: string, options?: { language?: string; initial_prompt?: string }): Promise<any> => {
    return fetchApi(`/media/${sourceId}/retranscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
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
  create: async (payload: { title: string; content: string; domain?: string; folder?: string; source_type?: string; meta_info?: Record<string, any> }): Promise<SourceItem> => {
    return sourcesApi.createNote({
      title: payload.title,
      content: payload.content,
      domain: payload.domain,
      folder: payload.folder,
      source_type: payload.source_type || 'note',
      meta_info: payload.meta_info
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

  update: async (id: string, content: string, domain?: string): Promise<SourceItem> => {
    return sourcesApi.updateContent(id, content, domain);
  },

  deleteSource: async (id: string): Promise<void> => {
    await fetchApi(`/sources/${id}`, {
      method: 'DELETE',
    });
  },
  delete: async (id: string): Promise<void> => {
    return sourcesApi.deleteSource(id);
  },

  aiFixText: async (sourceId: string, text: string): Promise<{ fixed_text: string }> => {
    return fetchApi<{ fixed_text: string }>(`/sources/${sourceId}/ai-fix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
  },

  runContextAction: async (
    sourceId: string,
    payload: ContextActionRequest
  ): Promise<ContextActionResponse> => {
    return fetchApi<ContextActionResponse>(`/sources/${sourceId}/context-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  // ── Folder management ──────────────────────────────────────────────────────

  getFolderTree: async (): Promise<FolderTreeResponse> => {
    return fetchApi<FolderTreeResponse>('/sources/folders/tree');
  },

  moveSource: async (sourceId: string, folder: string | null): Promise<SourceItem> => {
    return fetchApi<SourceItem>(`/sources/${sourceId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
  },

  deleteFolder: async (folderPath: string): Promise<void> => {
    await fetchApi(`/sources/folders/${encodeURIComponent(folderPath)}`, {
      method: 'DELETE',
    });
  },

  renameFolder: async (oldPath: string, newPath: string): Promise<{ status: string; renamed_count: number }> => {
    return fetchApi<{ status: string; renamed_count: number }>('/sources/folders/rename', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    });
  },
};
