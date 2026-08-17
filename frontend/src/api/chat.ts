import { Citation } from '../types/chat';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export async function streamChat(
  query: string,
  history: { role: string; content: string }[],
  onStatus: (status: string) => void,
  onCitations: (citations: Citation[]) => void,
  onToken: (token: string) => void,
  onError: (error: string) => void,
  onDone: () => void
) {
  try {
    const response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, history }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream available');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;

        const lines = eventBlock.split('\n');
        let eventType = '';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.replace('event: ', '').trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.replace('data: ', '').trim();
          }
        }

        if (eventType === 'query_rewrite') {
          const payload = JSON.parse(dataStr);
          if (payload.original !== payload.condensed) {
            onStatus(`Уточнение запроса: ${payload.condensed}`);
          } else {
            onStatus('Анализ запроса...');
          }
        } else if (eventType === 'retrieval') {
          onStatus('Поиск в базе знаний...');
        } else if (eventType === 'citations') {
          onStatus('Генерация ответа...');
          const citations: Citation[] = JSON.parse(dataStr);
          onCitations(citations);
        } else if (eventType === 'message') {
          onStatus(''); // Очищаем статус
          const payload = JSON.parse(dataStr);
          onToken(payload.text || '');
        } else if (eventType === 'error') {
          const payload = JSON.parse(dataStr);
          onError(payload.error || 'Unknown error');
        } else if (eventType === 'done') {
          onStatus('');
          onDone();
        }
      }
    }
  } catch (err: any) {
    onError(err.message || 'Stream error');
  }
}