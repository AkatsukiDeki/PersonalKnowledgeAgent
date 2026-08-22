import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../../types/chat';
import { Bot, User, X } from 'lucide-react';
import { ProvenanceTree } from './ProvenanceTree';

interface Props {
  message: Message;
}

export function MessageView({ message }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
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
          <div className="flex flex-col gap-2">
            {message.image_base64 && (
              <>
                <img 
                  src={`data:${message.image_mime_type || 'image/png'};base64,${message.image_base64}`} 
                  alt="Attached image" 
                  onClick={() => setIsExpanded(true)}
                  className="max-w-full max-h-64 object-contain rounded-lg border border-white/10 shadow-md cursor-pointer hover:border-indigo-500/50 transition-colors"
                />
                
                {isExpanded && (
                  <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
                    onClick={() => setIsExpanded(false)}
                  >
                    <button 
                      className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-colors"
                      onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                    >
                      <X size={24} />
                    </button>
                    <img 
                      src={`data:${message.image_mime_type || 'image/png'};base64,${message.image_base64}`} 
                      alt="Expanded attached image" 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </>
            )}
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
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