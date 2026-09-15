import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, Code2, AlertTriangle } from 'lucide-react';
import PyodideWorker from '../../workers/pyodide.worker.ts?worker';

// Global singleton for Pyodide worker
class PyodideManager {
  private static instance: PyodideManager;
  private worker: Worker | null = null;
  private isInitializing = false;
  private isReady = false;
  private initPromise: Promise<void> | null = null;

  // Track run handlers
  private runHandlers: Map<string, {
    onStdout: (text: string) => void;
    onStderr: (text: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  }> = new Map();

  private constructor() {}

  static getInstance() {
    if (!PyodideManager.instance) {
      PyodideManager.instance = new PyodideManager();
    }
    return PyodideManager.instance;
  }

  async init(): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.isInitializing = true;
    this.worker = new PyodideWorker();
    
    this.initPromise = new Promise((resolve, reject) => {
      const id = 'init';
      const handler = (e: MessageEvent) => {
        if (e.data.id === id) {
          if (e.data.type === 'INIT_DONE') {
            this.isReady = true;
            this.isInitializing = false;
            this.worker?.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'INIT_ERROR') {
            this.isInitializing = false;
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        }
      };
      
      this.worker?.addEventListener('message', handler);
      
      // We need a persistent listener for runs
      this.worker?.addEventListener('message', this.handleWorkerMessage.bind(this));
      
      this.worker?.postMessage({ id, type: 'INIT' });
    });

    return this.initPromise;
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { id, type, text, error } = e.data;
    const handler = this.runHandlers.get(id);
    if (!handler) return;

    if (type === 'STDOUT') {
      handler.onStdout(text);
    } else if (type === 'STDERR') {
      handler.onStderr(text);
    } else if (type === 'RUN_DONE') {
      handler.onDone();
      this.runHandlers.delete(id);
    } else if (type === 'ERROR') {
      handler.onError(error);
      this.runHandlers.delete(id);
    }
  }

  async runCode(
    code: string, 
    handlers: {
      onStdout: (text: string) => void;
      onStderr: (text: string) => void;
    }
  ): Promise<void> {
    if (!this.isReady) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(7);
      
      this.runHandlers.set(id, {
        onStdout: handlers.onStdout,
        onStderr: handlers.onStderr,
        onDone: resolve,
        onError: (err) => reject(new Error(err)),
      });

      this.worker?.postMessage({ id, type: 'RUN', code });
    });
  }
}

interface CodeSandboxProps {
  code: string;
}

export function CodeSandbox({ code }: CodeSandboxProps) {
  const [status, setStatus] = useState<'idle' | 'initializing' | 'running' | 'success' | 'error'>('idle');
  const [output, setOutput] = useState<{ type: 'stdout' | 'stderr', text: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRun = async () => {
    setOutput([]);
    setErrorMsg(null);
    setStatus('initializing');

    try {
      const manager = PyodideManager.getInstance();
      
      // Force status update during long load
      setTimeout(() => {
        if (status === 'initializing') {
          // Status keeps showing initializing
        }
      }, 100);

      await manager.init();
      
      setStatus('running');

      await manager.runCode(code, {
        onStdout: (text) => setOutput((prev) => [...prev, { type: 'stdout', text }]),
        onStderr: (text) => setOutput((prev) => [...prev, { type: 'stderr', text }]),
      });

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
          <span className="text-xs font-mono text-white/70">python</span>
        </div>
        
        <button
          onClick={handleRun}
          disabled={status === 'initializing' || status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors disabled:opacity-50 text-xs font-medium"
        >
          {(status === 'initializing' || status === 'running') ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {status === 'initializing' ? 'Loading Runtime...' : 'Running...'}
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
        <div className="border-t border-white/10 bg-black/60 p-4 font-mono text-xs">
          <div className="text-white/40 mb-2 select-none uppercase tracking-widest text-[10px]">Terminal Output</div>
          
          <div className="space-y-1">
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
