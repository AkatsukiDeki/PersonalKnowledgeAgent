import { fetchApi } from './client';

export interface MessageOut {
  id: string;
  role: string;
  content: string;
  model: string | null;
  created_at: string;
  image_base64?: string | null;
  image_mime_type?: string | null;
}

export interface ConversationDetailOut {
  id: string;
  title: string;
  domain: string | null;
  status: string;
  is_pinned: boolean;
  folder: string | null;
  created_at: string;
  updated_at: string;
  summary?: string | null;
  active_decisions?: string[];
  open_questions?: string[];
  memory: any;
  decisions: any[];
  messages: MessageOut[];
}

export interface ConversationOut {
  id: string;
  title: string;
  domain: string | null;
  status: string;
  is_pinned: boolean;
  folder: string | null;
  created_at: string;
  updated_at: string;
}

export const conversationsApi = {
  createConversation: async (
    title: string = "Новый диалог",
    domain: string | null = null,
    folder: string | null = null,
    subject_id: string | null = null
  ): Promise<ConversationOut> => {
    return fetchApi<ConversationOut>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        title,
        domain,
        folder: folder === "" || folder === "root" ? null : folder,
        subject_id
      }),
    });
  },

  getConversations: async (params?: { folder?: string; status?: string }): Promise<ConversationOut[]> => {
    const searchParams = new URLSearchParams();
    if (params?.folder) searchParams.append('folder', params.folder);
    if (params?.status) searchParams.append('status', params.status);

    const query = searchParams.toString();
    const url = `/conversations${query ? `?${query}` : ''}`;
    return fetchApi<ConversationOut[]>(url);
  },

  getConversationDetail: async (id: string): Promise<ConversationDetailOut> => {
    return fetchApi<ConversationDetailOut>(`/conversations/${id}`);
  },

  updateConversation: async (
    id: string,
    updates: {
      title?: string;
      domain?: string | null;
      status?: string;
      is_pinned?: boolean;
      folder?: string | null;
    }
  ): Promise<ConversationOut> => {
    const payload = {
      ...updates,
      folder: updates.folder === "" || updates.folder === "root" || updates.folder === "none" ? null : updates.folder,
    };

    return fetchApi<ConversationOut>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteConversation: async (id: string): Promise<{ status: string; id: string }> => {
    return fetchApi<{ status: string; id: string }>(`/conversations/${id}`, {
      method: 'DELETE',
    });
  },
};