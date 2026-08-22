import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../../types/chat';
import { Bot, User } from 'lucide-react';
import { ProvenanceTree } from './ProvenanceTree';

interface Props {
  message: Message;
}

export function MessageView({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 my-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Assistant avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-entity-decision/20 border border-entity-decision/30 flex items-center justify-center text-entity-decision shrink-0 mt-1">
          <Bot size={16} />
        </div>
      )}

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-xl text-sm leading-relaxed ${
          isUser
            ? 'bg-white/5 border border-white/10 text-zinc-100 px-4 py-3 rounded-br-sm'
            : 'bg-[#0B0D13]/60 backdrop-blur-sm border border-white/5 text-zinc-200 px-4 py-3 rounded-bl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose-deep-space">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Streaming cursor */}
        {message.isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-entity-claim rounded-sm animate-pulse align-middle" />
        )}

        {/* Provenance Tree — replaces old flat citation list */}
        {!isUser && !message.isStreaming && message.citations && message.citations.length > 0 && (
          <ProvenanceTree citations={message.citations} />
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-surface-high border border-white/[0.06] flex items-center justify-center text-zinc-400 shrink-0 mt-1">
          <User size={16} />
        </div>
      )}
    </div>
  );
}

export default MessageView;