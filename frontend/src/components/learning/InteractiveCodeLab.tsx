import React, { useState } from 'react';
import { Play, MessageCircle, Terminal, Loader2, Copy, Check, Database } from 'lucide-react';
import clsx from 'clsx';

interface InteractiveCodeLabProps {
  initialCode: string;
  language?: string;
  onAnalyze?: (code: string, stdout: string, stderr: string) => void;
}

export const InteractiveCodeLab: React.FC<InteractiveCodeLabProps> = ({
  initialCode,
  language = 'python',
  onAnalyze,
}) => {
  const [code, setCode] = useState(initialCode);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSql = language === 'sql';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  };

  const handleRun = async () => {
    if (!code.trim() || isRunning) return;
    setIsRunning(true);
    setStdout('');
    setStderr('');
    setExitCode(null);
    setExecutionTime(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = import.meta.env.VITE_PKA_API_KEY;
      if (apiKey) headers['X-API-Key'] = apiKey;

      const response = await fetch(`${baseUrl}/sandbox/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const result = await response.json();
      setStdout(result.stdout || '');
      setStderr(result.stderr || '');
      setExitCode(result.exit_code);
      setExecutionTime(result.execution_time_ms);
    } catch (err: any) {
      setStderr(`Request failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = code.substring(0, start) + '    ' + code.substring(end);
      setCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const hasOutput = stdout || stderr || exitCode !== null;

  const langLabel = isSql ? 'SQL' : 'Python';
  const LangIcon = isSql ? Database : Terminal;
  const langColor = isSql ? 'text-amber-400' : 'text-indigo-400';
  const borderColor = isSql ? 'border-amber-500/30' : 'border-zinc-700';
  const headerBg = isSql ? 'bg-zinc-800/70' : 'bg-zinc-800';
  const rowCount = Math.min(Math.max(code.split('\n').length, 3), 20);

  return (
    <div className={clsx('flex flex-col rounded-lg border bg-zinc-900 overflow-hidden my-3 w-full', borderColor)}>
      {/* Header */}
      <div className={clsx('flex items-center justify-between px-3 py-2 border-b', headerBg, borderColor)}>
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <LangIcon className={clsx('w-4 h-4', langColor)} />
          <span>{langLabel}</span>
          {isSql && (
            <span className="text-zinc-500 font-normal">· скопируй и выполни в своей СУБД</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            title="Скопировать"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium transition-colors"
          >
            {copied ? (
              <><Check className="w-3.5 h-3.5 text-emerald-400" /><span>Скопировано</span></>
            ) : (
              <><Copy className="w-3.5 h-3.5" /><span>Копировать</span></>
            )}
          </button>

          {!isSql && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Запустить
            </button>
          )}
        </div>
      </div>

      {/* Code editor */}
      <div className="p-2 bg-zinc-900">
        <textarea
          value={code}
          onChange={(e) => !isSql && setCode(e.target.value)}
          onKeyDown={!isSql ? handleKeyDown : undefined}
          readOnly={isSql}
          spellCheck={false}
          rows={rowCount}
          className={clsx(
            'w-full bg-zinc-950 font-mono text-sm leading-relaxed p-3 rounded border focus:outline-none resize-y',
            isSql
              ? 'text-amber-200/90 border-amber-500/20 cursor-text'
              : 'text-zinc-300 border-zinc-800 focus:border-indigo-500/50',
          )}
          style={{ tabSize: 4 }}
        />
      </div>

      {/* Output (Python only) */}
      {hasOutput && !isSql && (
        <div className="border-t border-zinc-800 bg-black p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Вывод</span>
            {exitCode !== null && (
              <span
                className={clsx(
                  'text-xs font-mono px-2 py-0.5 rounded',
                  exitCode === 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400',
                )}
              >
                Exit: {exitCode} {executionTime !== null && `(${executionTime.toFixed(0)}ms)`}
              </span>
            )}
          </div>

          <div className="font-mono text-xs whitespace-pre-wrap rounded overflow-x-auto">
            {stdout && <div className="text-zinc-300 mb-1">{stdout}</div>}
            {stderr && <div className="text-rose-400 mb-1">{stderr}</div>}
            {!stdout && !stderr && exitCode === 0 && (
              <div className="text-zinc-500 italic">Выполнено успешно (нет вывода)</div>
            )}
          </div>

          {(stderr || (exitCode !== null && exitCode !== 0)) && onAnalyze && (
            <button
              onClick={() => onAnalyze(code, stdout, stderr)}
              className="mt-3 flex items-center justify-center w-full gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors border border-zinc-700"
            >
              <MessageCircle className="w-4 h-4 text-amber-400" />
              Разобрать с тьютором
            </button>
          )}
        </div>
      )}
    </div>
  );
};

