/// <reference lib="webworker" />

declare const loadPyodide: any;

let pyodide: any = null;
let initialized = false;
let currentRunId: string | null = null;

self.onmessage = async (event: MessageEvent) => {
  const { id, type, code } = event.data;

  if (type === 'INIT') {
    if (initialized) {
      self.postMessage({ id, type: 'INIT_DONE' });
      return;
    }
    
    try {
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');
      pyodide = await loadPyodide({
        stdout: (text: string) => {
          if (currentRunId) {
            self.postMessage({ id: currentRunId, type: 'STDOUT', text });
          }
        },
        stderr: (text: string) => {
          if (currentRunId) {
            self.postMessage({ id: currentRunId, type: 'STDERR', text });
          }
        },
      });
      initialized = true;
      self.postMessage({ id, type: 'INIT_DONE' });
    } catch (error: any) {
      self.postMessage({ id, type: 'INIT_ERROR', error: error.message });
    }
  }

  if (type === 'RUN') {
    if (!initialized) {
      self.postMessage({ id, type: 'ERROR', error: 'Pyodide is not initialized' });
      return;
    }

    try {
      currentRunId = id;
      await pyodide.runPythonAsync(code);
      self.postMessage({ id, type: 'RUN_DONE' });
    } catch (error: any) {
      self.postMessage({ id, type: 'ERROR', error: error.message });
    } finally {
      currentRunId = null;
    }
  }
};
