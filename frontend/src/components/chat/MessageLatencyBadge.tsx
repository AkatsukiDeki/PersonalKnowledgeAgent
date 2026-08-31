import React, { useState } from 'react';
import { MessageTelemetry } from '../../types/chat';

interface Props {
  telemetry?: MessageTelemetry;
}

export const MessageLatencyBadge: React.FC<Props> = ({ telemetry }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!telemetry || !telemetry.total_ms) {
    return null;
  }

  const totalSec = (telemetry.total_ms / 1000).toFixed(2);
  const ttftMs = telemetry.ttft_ms ?? 0;

  return (
    <div className="relative inline-block mt-2 text-xs select-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors border border-zinc-800"
        title="Нажмите для детализации задержки"
      >
        <span>⏱️</span>
        <span className="font-mono">{totalSec}s</span>
        <span className="text-zinc-600">|</span>
        <span className="font-mono text-zinc-500">TTFT: {ttftMs}ms</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1.5 w-56 p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-20 space-y-1.5 font-mono text-[11px] animate-in fade-in zoom-in-95">
          <div className="flex justify-between text-zinc-500 pb-1 border-b border-zinc-800">
            <span>Этап</span>
            <span>Длительность</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Embedding:</span>
            <span className="font-semibold text-zinc-200">{telemetry.t_emb_ms ?? 0} ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">DB / Hybrid:</span>
            <span className="font-semibold text-zinc-200">{telemetry.t_sql_ms ?? 0} ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">TTFT:</span>
            <span className="font-semibold text-indigo-400">{telemetry.ttft_ms ?? 0} ms</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-zinc-800">
            <span className="text-zinc-300 font-semibold">Всего:</span>
            <span className="font-bold text-zinc-100">{telemetry.total_ms} ms</span>
          </div>
        </div>
      )}
    </div>
  );
};
