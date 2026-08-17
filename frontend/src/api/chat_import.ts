import { fetchApi } from './client';

export interface ImportSummary {
  total_conversations: number;
  total_topics: number;
  new_conversations: number;
  updated_conversations: number;
  skipped_conversations: number;
  domains: Record<string, number>;
}

export interface ConversationPreview {
  external_id: string;
  title: string;
  status: string; // "new", "updated", "skipped"
  domain: string;
  topics_count: number;
  messages_count: number;
}

export interface ImportPreviewResponse {
  job_id: string;
  summary: ImportSummary;
  conversations_preview: ConversationPreview[];
}

export const chatImportApi = {
  startImport: async (file: File, provider: string): Promise<{ job_id: string; status: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider', provider);

    return fetchApi('/connectors/chats/import', {
      method: 'POST',
      body: formData,
    });
  },

  getStatus: async (jobId: string): Promise<{ job_id: string; status: string; error_message?: string }> => {
    return fetchApi(`/connectors/chats/import/${jobId}`);
  },

  getPreview: async (jobId: string): Promise<ImportPreviewResponse> => {
    return fetchApi(`/connectors/chats/import/${jobId}/preview`);
  },

  commitImport: async (jobId: string, mode: string, selectedIds?: string[]): Promise<{ status: string }> => {
    return fetchApi(`/connectors/chats/import/${jobId}/commit`, {
      method: 'POST',
      body: JSON.stringify({
        mode,
        selected_external_ids: selectedIds
      })
    });
  }
};
