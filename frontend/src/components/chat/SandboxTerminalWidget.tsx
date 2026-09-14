import React, { useState } from 'react';
import { Terminal, Code, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface ToolState {
  id: string;
  tool_name: string;
  status: 'running' | 'success' | 'error';
  script?: string;
  stdout?: string;
  stderr?: string;
}

interface Props {
  tool: ToolState;
}

export const SandboxTerminalWidget: React.FC<Props> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (tool.tool_name !== 'python_sandbox') {
    return null;
  }

  const isRunning = tool.status === 'running';
  const isError = tool.status === 'error';
  const isSuccess = tool.status === 'success';

  return (
    <div className="my-2 flex flex-col bg-black/90 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs w-full max-w-full">
      <div 
        className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-zinc-300">
          <Terminal size={14} className="text-emerald-400" />
          <span className="font-semibold tracking-wide uppercase text-[10px]">Python Sandbox</span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 size={14} className="text-indigo-400 animate-spin" />}
          {isSuccess && <CheckCircle2 size={14} className="text-emerald-500" />}
          {isError && <XCircle size={14} className="text-rose-500" />}
          {expanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </div>
      </div>
      
      {expanded && (
        <div className="flex flex-col">
          {tool.script && (
            <div className="p-3 bg-zinc-950/50 border-b border-zinc-800">
              <div className="flex items-center gap-1 mb-1 text-zinc-500">
                <Code size={12} />
                <span className="text-[10px] uppercase">Input Script</span>
              </div>
              <pre className="text-slate-300 overflow-x-auto p-1 whitespace-pre-wrap break-words">
                {tool.script}
              </pre>
            </div>
          )}
          
          <div className="p-3 max-h-64 overflow-y-auto">
            {isRunning && !tool.stdout && !tool.stderr && (
              <span className="text-zinc-500 italic">Executing...</span>
            )}
            {tool.stdout && (
              <div className="text-emerald-400 whitespace-pre-wrap break-words mb-2">
                {tool.stdout}
              </div>
            )}
            {tool.stderr && (
              <div className="text-rose-400 whitespace-pre-wrap break-words">
                {tool.stderr}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
