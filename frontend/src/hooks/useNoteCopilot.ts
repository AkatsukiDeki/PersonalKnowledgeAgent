import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useNoteCopilot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (
    text: string,
    payload: {
      scope: any;
      topic_id: string;
      roadmap_payload: any;
    }
  ) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1') + '/learning/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          message: text,
          history: messages,
        }),
      });

      if (!res.ok) throw new Error('Copilot stream error');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.replace('data:', '').trim();
            try {
              const eventData = JSON.parse(jsonStr);
              if (eventData.type === 'content') {
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  const updated = [...prev];
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: updated[lastIdx].content + eventData.delta,
                  };
                  return updated;
                });
              }
            } catch (e) {
              console.error('Failed to parse SSE', jsonStr);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const lastIdx = prev.length - 1;
        const updated = [...prev];
        updated[lastIdx] = {
          ...updated[lastIdx],
          content: 'Ошибка связи с наставником.',
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
