import { Citation, ChatMode, LearningContext } from '../types/chat';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export async function streamChat(
  query: string,
  history: { role: string; content: string }[],
  conversation_id: string | null,
  attached_source_ids: string[],
  onConversationCreated: (id: string) => void,
  onStatus: (status: string) => void,
  onCitations: (citations: Citation[]) => void,
  onToken: (token: string) => void,
  onToolStart: (tool: any) => void,
  onToolResult: (result: any) => void,
  onError: (error: string) => void,
  onDone: () => void,
  onTelemetry: (telemetry: any) => void,
  chat_mode: ChatMode = 'vault',
  learning_context?: LearningContext,
  mode: string = 'assistant',
  image_base64?: string,
  image_mime_type?: string,
  signal?: AbortSignal
) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = import.meta.env.VITE_PKA_API_KEY;
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        query, 
        history, 
        conversation_id, 
        attached_source_ids, 
        chat_mode,
        learning_context,
        mode, 
        image_base64, 
        image_mime_type 
      }),
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

        if (eventType === 'metadata') {
          const payload = JSON.parse(dataStr);
          const out = payload.output || payload;
          if (out.conversation_id) {
            onConversationCreated(out.conversation_id);
          }
        } else if (eventType === 'query_rewrite') {
          const payload = JSON.parse(dataStr);
          const out = payload.output || payload;
          if (out.original !== out.condensed) {
            onStatus(`Уточнение запроса: ${out.condensed}`);
          } else {
            onStatus('Анализ запроса...');
          }
        } else if (eventType === 'retrieval') {
          onStatus('Поиск в базе знаний...');
        } else if (eventType === 'citations') {
          onStatus('Генерация ответа...');
          const payload = JSON.parse(dataStr);
          const citations: Citation[] = payload.output || payload;
          onCitations(citations);
        } else if (eventType === 'message' || eventType === 'token') {
          onStatus(''); // Очищаем статус
          const payload = JSON.parse(dataStr);
          onToken(payload.text_chunk || payload.text || '');
        } else if (eventType === 'tool_start') {
          const payload = JSON.parse(dataStr);
          const out = payload.output || payload;
          if (out.tool_name === 'python_sandbox') {
             onStatus('✨ LLM запускает Python-скрипт...');
          }
          onToolStart(out);
        } else if (eventType === 'tool_result') {
          const payload = JSON.parse(dataStr);
          const out = payload.output || payload;
          if (out.tool_name === 'python_sandbox') {
             onStatus(out.status === 'success' ? '✅ Скрипт выполнен' : '❌ Ошибка выполнения скрипта');
             setTimeout(() => onStatus(''), 2000);
          }
          onToolResult(out);
        } else if (eventType === 'telemetry') {
          const payload = JSON.parse(dataStr);
          onTelemetry(payload.output || payload);
        } else if (eventType === 'error') {
          const payload = JSON.parse(dataStr);
          onError(payload.error || 'Unknown error');
          return;
        } else if (eventType === 'done') {
          onStatus('');
          onDone();
          return;
        }
      }
    }
    
    // Fallback if stream ends without 'done' event
    onStatus('');
    onDone();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.info('Chat stream aborted by client.');
      onDone();
      return;
    }
    onError(err.message || 'Stream error');
  }
}