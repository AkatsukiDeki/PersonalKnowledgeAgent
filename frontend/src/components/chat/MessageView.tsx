import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../../types/chat';
import { Bot, User, Bookmark } from 'lucide-react';

interface Props {
  message: Message;
}

export function MessageView({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm">
          <Bot size={18} />
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-none shadow-md'
            : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-none'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="space-y-2 [&>p]:mb-1.5 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&>li]:mb-0.5 [&>strong]:font-semibold [&>strong]:text-emerald-400">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {message.isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
        )}

        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-700/60 flex flex-col gap-1.5">
            <div className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Bookmark size={12} /> Источники из памяти:
            </div>
            {message.citations.map((cite, idx) => (
              <div
                key={idx}
                className="bg-zinc-900/70 p-2 rounded text-xs text-zinc-300 border border-zinc-700/40"
              >
                <div className="font-mono text-[10px] text-emerald-400 mb-0.5">
                  RRF Score: {cite.score.toFixed(4)}
                </div>
                <div>{cite.text_snippet}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center text-white shrink-0 shadow-sm">
          <User size={18} />
        </div>
      )}
    </div>
  );
}

export default MessageView;