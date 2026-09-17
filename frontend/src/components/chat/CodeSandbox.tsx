import React, { useState } from 'react';
import { Play, Loader2, Code2, AlertTriangle } from 'lucide-react';

interface CodeSandboxProps {
  code: string;
  language?: string;
}

export function CodeSandbox({ code, language = 'python' }: CodeSandboxProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [output, setOutput] = useState<{ type: 'stdout' | 'stderr', text: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRun = async () => {
    setOutput([]);
    setErrorMsg(null);
    setStatus('running');

    // Отсекаем артефакты генерации модели
    const cleanCode = code
      .replace(/\*\*Результат выполнения[\s\S]*?\*\*/gi, '')
      .trim();

    try {
      const res = await fetch('/api/v1/sandbox/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: language,
          code: cleanCode
        })
      });

      if (!res.ok) {
        throw new Error(`Execution error: ${res.statusText}`);
      }

      const data = await res.json();
      
      const newOutput = [];
      if (data.stdout) {
        newOutput.push({ type: 'stdout' as const, text: data.stdout });
      }
      if (data.stderr) {
        newOutput.push({ type: 'stderr' as const, text: data.stderr });
      }
      
      setOutput(newOutput);
      
      if (data.exit_code !== 0 && !data.stderr) {
         setErrorMsg(`Process exited with code ${data.exit_code}`);
      }
      
      setStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unknown error occurred');
      setStatus('error');
    }
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/10 bg-[#0d0d12]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-indigo-400" />
          <span className="text-xs font-mono text-white/70">{language}</span>
        </div>
        
        <button
          onClick={handleRun}
          disabled={status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors disabled:opacity-50 text-xs font-medium"
        >
          {status === 'running' ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play size={12} />
              Run
            </>
          )}
        </button>
      </div>
      
      {/* Code Area */}
      <div className="p-4 overflow-x-auto text-sm font-mono text-white/80 bg-black/20">
        <pre><code>{code}</code></pre>
      </div>

      {/* Terminal Output Area */}
      {(output.length > 0 || errorMsg) && (
        <div className="border-t border-white/10 bg-black/60 p-4 font-mono text-xs overflow-x-auto">
          <div className="text-white/40 mb-2 select-none uppercase tracking-widest text-[10px]">Terminal Output</div>
          
          <div className="space-y-1 whitespace-pre-wrap">
            {output.map((line, idx) => (
              <div 
                key={idx} 
                className={line.type === 'stderr' ? 'text-rose-400' : 'text-emerald-300'}
              >
                {line.text}
              </div>
            ))}
          </div>

          {errorMsg && (
            <div className="mt-3 flex items-start gap-2 text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/20">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div className="whitespace-pre-wrap">{errorMsg}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
