import { fetchApi } from './client';

export interface MessageOut {
  id: string;
  role: string;
  content: string;
  model: string | null;
  created_at: string;
}

export interface ConversationDetailOut {
  id: string;
  title: string;
  domain: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  summary: string | null;
  active_decisions: string[];
  open_questions: string[];
  messages: MessageOut[];
}

export interface ConversationOut {
  id: string;
  title: string;
  domain: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const conversationsApi = {
  createConversation: async (title: string = "Новый диалог", domain: string | null = null): Promise<ConversationOut> => {
    return fetchApi<ConversationOut>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, domain })
    });
  },
  
  getConversations: async (): Promise<ConversationOut[]> => {
    return fetchApi<ConversationOut[]>('/conversations');
  },
  
  getConversationDetail: async (id: string): Promise<ConversationDetailOut> => {
    return fetchApi<ConversationDetailOut>(`/conversations/${id}`);
  },

  updateConversation: async (id: string, updates: { title?: string; domain?: string; status?: string }): Promise<void> => {
    await fetchApi(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  deleteConversation: async (id: string): Promise<void> => {
    await fetchApi(`/conversations/${id}`, {
      method: 'DELETE'
    });
  }
};
