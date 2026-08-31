import { useState } from 'react';

export interface Citation {
  marker: number;
  source_id: string;
  chunk_id: string;
  source_name?: string;
}

export function useStudyNoteStream() {
  const [markdown, setMarkdown] = useState<string>("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generateNoteStream = async (url: string, payload: any) => {
    setIsLoading(true);
    setMarkdown("");
    setCitations([]);
    setError(null);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ${token}` if needed
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is missing reader");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const jsonStr = trimmed.replace("data:", "").trim();
            try {
              const eventData = JSON.parse(jsonStr);

              if (eventData.type === "content") {
                setMarkdown((prev) => prev + eventData.delta);
              } else if (eventData.type === "metadata") {
                setCitations(eventData.citations || []);
              } else if (eventData.type === "error") {
                setError(eventData.message);
              }
            } catch (e) {
              console.error("Failed to parse SSE JSON chunk:", jsonStr);
            }
          }
        }
      }
      
      return true;
    } catch (err: any) {
      setError(err.message || "Unknown streaming error");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { generateNoteStream, markdown, citations, isLoading, error };
}
