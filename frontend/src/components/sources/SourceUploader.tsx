import React, { useState, useEffect, useMemo, useRef } from 'react';
import { sourcesApi } from '../../api/sources';
import { chatImportApi, ImportPreviewResponse } from '../../api/chat_import';
import { X, UploadCloud, CheckCircle2, MessageSquare, AlertCircle, Clock, FileText, Upload, Loader2 } from 'lucide-react';
import { DomainInput } from './DomainInput';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SourceUploader({ isOpen, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<'files' | 'manual' | 'chats'>('files');
  
  // Domains
  const [existingDomains, setExistingDomains] = useState<string[]>([]);
  
  // Batch Files State
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual State
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState(() => localStorage.getItem('pka_last_domain') || '');
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState('note');
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Chats State
  const [chatProvider, setChatProvider] = useState<'chatgpt' | 'claude' | 'gemini'>('chatgpt');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'idle' | 'processing' | 'preview' | 'ingesting' | 'completed' | 'failed'>('idle');
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      sourcesApi.list().then((data) => {
        const uniqueDomains = Array.from(
          new Set(
            data
              .map((s: any) => s.domain?.trim())
              .filter((d: any): d is string => Boolean(d))
          )
        ).sort((a, b) => a.localeCompare(b));
        setExistingDomains(uniqueDomains);
      }).catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (jobId && (jobStatus === 'processing' || jobStatus === 'ingesting')) {
      interval = setInterval(async () => {
        try {
          const res = await chatImportApi.getStatus(jobId);
          if (res.status === 'preview' && jobStatus === 'processing') {
            const preview = await chatImportApi.getPreview(jobId);
            setPreviewData(preview);
            setJobStatus('preview');
          } else if (res.status === 'completed') {
            setJobStatus('completed');
            setTimeout(() => {
              handleClose();
            }, 2000);
          } else if (res.status === 'failed') {
            setJobStatus('failed');
            setChatError(res.error_message || 'Import failed');
          }
        } catch (e) {
          // Keep polling
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  if (!isOpen) return null;

  const handleClose = () => {
    setActiveTab('files');
    setTitle('');
    setDomain(localStorage.getItem('pka_last_domain') || '');
    setContent('');
    setJobId(null);
    setJobStatus('idle');
    setPreviewData(null);
    setSelectedFile(null);
    setChatError(null);
    setBatchFiles([]);
    setBatchProgress(null);
    setBatchError(null);
    onClose();
    if (jobStatus === 'completed' && onSuccess) {
      onSuccess();
    }
  };

  const handleBatchSubmit = async () => {
    if (batchFiles.length === 0) return;
    setIsBatchUploading(true);
    setBatchError(null);
    try {
      const finalDomain = domain.trim();
      let count = 0;
      for (const f of batchFiles) {
        setBatchProgress(`Uploading ${count + 1} of ${batchFiles.length}: ${f.name}`);
        if (f.type.startsWith('audio/') || f.type.startsWith('video/') || f.name.endsWith('.m4a') || f.name.endsWith('.mp3')) {
          await sourcesApi.uploadMedia(f, 'speech', undefined, mediaType || undefined);
        } else {
          await sourcesApi.upload(f, finalDomain || undefined, '');
        }
        count++;
      }

      if (finalDomain) {
        localStorage.setItem('pka_last_domain', finalDomain);
      } else {
        localStorage.removeItem('pka_last_domain');
      }

      setBatchProgress(null);
      setIsBatchUploading(false);
      handleClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setBatchError(err.message || 'Error uploading files');
      setIsBatchUploading(false);
      setBatchProgress(null);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsManualLoading(true);
    setManualError(null);

    try {
      const finalDomain = domain.trim();
      await sourcesApi.create({
        title: title.trim(),
        domain: finalDomain || undefined,
        content: content.trim(),
        source_type: sourceType,
        meta_info: { added_via: 'web_ui' },
      });

      if (finalDomain) {
        localStorage.setItem('pka_last_domain', finalDomain);
      } else {
        localStorage.removeItem('pka_last_domain');
      }

      setIsManualLoading(false);
      handleClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setManualError(err.message || 'Error creating source');
      setIsManualLoading(false);
    }
  };

  const handleChatImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setJobStatus('processing');
    setChatError(null);

    try {
      const res = await chatImportApi.startImport(selectedFile, chatProvider);
      setJobId(res.job_id);
    } catch (err: any) {
      setChatError(err.message || 'Failed to start import');
      setJobStatus('idle');
    }
  };

  const handleCommit = async () => {
    if (!jobId) return;
    setJobStatus('ingesting');
    try {
      await chatImportApi.commitImport(jobId, 'FULL');
    } catch (err: any) {
      setChatError(err.message || 'Failed to commit import');
      setJobStatus('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 font-medium text-sm text-zinc-100">
            <UploadCloud size={18} className="text-emerald-400" />
            Add Knowledge Source
          </div>
          <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {jobStatus === 'idle' && (
          <div className="flex border-b border-zinc-800 bg-zinc-950/50 shrink-0 px-2 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'files' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              <FileText size={14} /> Batch Files
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'manual' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              Manual Import
            </button>
            <button
              onClick={() => setActiveTab('chats')}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'chats' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              <MessageSquare size={14} /> Import AI Chats
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {activeTab === 'files' && jobStatus === 'idle' && (
            <div className="p-5 flex flex-col gap-4">
              {batchError && (
                <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs px-3 py-2 rounded">
                  {batchError}
                </div>
              )}
              
              <div
                className="border-2 border-dashed border-zinc-700/50 hover:border-indigo-500/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-zinc-950/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-500/10'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/10'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/10');
                  if (e.dataTransfer.files) {
                    setBatchFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                  }
                }}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setBatchFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
                <Upload size={32} className="text-zinc-500 mb-3" />
                <p className="text-sm text-zinc-300 font-medium">Click to select or drag & drop files here</p>
                <p className="text-xs text-zinc-500 mt-1">PDF, TXT, MD, MP3, MP4, DOCX, etc.</p>
              </div>

              {batchFiles.length > 0 && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <div className="text-xs font-medium text-zinc-400 mb-2 border-b border-zinc-800 pb-2 flex justify-between">
                    <span>Selected Files ({batchFiles.length})</span>
                    <button 
                      onClick={() => setBatchFiles([])}
                      className="text-red-400 hover:text-red-300"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {batchFiles.map((file, idx) => (
                      <div key={idx} className="text-xs text-zinc-300 truncate flex items-center justify-between group">
                        <span>{file.name}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setBatchFiles(prev => prev.filter((_, i) => i !== idx)); }}
                          className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Тип медиа (опционально)</label>
                  <select
                    value={mediaType}
                    onChange={(e) => setMediaType(e.target.value)}
                    disabled={isBatchUploading}
                    className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">Авто (по расширению)</option>
                    <option value="voice_note">🎙️ Голосовая заметка</option>
                    <option value="audio">🎧 Аудио / Подкаст</option>
                    <option value="video">🎬 Видео</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Домен (опционально)</label>
                  <DomainInput
                    value={domain}
                    onChange={setDomain}
                    suggestions={existingDomains}
                    disabled={isBatchUploading}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
                <button type="button" onClick={handleClose} disabled={isBatchUploading} className="px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 rounded-lg">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBatchSubmit}
                  disabled={isBatchUploading || batchFiles.length === 0}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isBatchUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                  Upload All ({batchFiles.length})
                </button>
              </div>

              {batchProgress && (
                <div className="mt-2 text-xs text-indigo-400 font-mono text-center">
                  {batchProgress}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manual' && jobStatus === 'idle' && (
            <form onSubmit={handleManualSubmit} className="p-5 flex flex-col gap-4">
              {manualError && (
                <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs px-3 py-2 rounded">
                  {manualError}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. System Architecture Design"
                  disabled={isManualLoading}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Домен / Категория (опционально)</label>
                <DomainInput
                  value={domain}
                  onChange={setDomain}
                  suggestions={existingDomains}
                  disabled={isManualLoading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Source Type</label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  disabled={isManualLoading}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="note">Note</option>
                  <option value="document">Document</option>
                  <option value="code">Code</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Content</label>
                <textarea
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter source content here..."
                  disabled={isManualLoading}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:outline-hidden focus:border-emerald-500 resize-none font-mono text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button type="button" onClick={handleClose} disabled={isManualLoading} className="px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isManualLoading || !title.trim() || !content.trim()} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 text-xs font-medium rounded-lg">
                  {isManualLoading ? 'Saving...' : 'Add Source'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'chats' && (
            <div className="p-5 flex flex-col gap-4">
              {chatError && (
                <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs px-3 py-2 rounded flex items-center gap-2">
                  <AlertCircle size={14} /> {chatError}
                </div>
              )}

              {jobStatus === 'idle' && (
                <form onSubmit={handleChatImport} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-2">Provider</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['chatgpt', 'claude', 'gemini'] as const).map(p => (
                        <div
                          key={p}
                          onClick={() => setChatProvider(p)}
                          className={`cursor-pointer border rounded-lg p-3 text-center transition-colors \${chatProvider === p ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-zinc-950 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                          <span className="capitalize">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Export File (ZIP or JSON)</label>
                    <input
                      type="file"
                      accept=".zip,.json"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-zinc-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-xs file:font-semibold
                        file:bg-zinc-800 file:text-zinc-300
                        hover:file:bg-zinc-700 cursor-pointer border border-zinc-700 rounded-lg p-1 bg-zinc-950"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button type="button" onClick={handleClose} className="px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 rounded-lg">
                      Cancel
                    </button>
                    <button type="submit" disabled={!selectedFile} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 text-xs font-medium rounded-lg">
                      Analyze Archive
                    </button>
                  </div>
                </form>
              )}

              {(jobStatus === 'processing' || jobStatus === 'ingesting') && (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                  <Clock className="animate-spin mb-4 text-blue-500" size={32} />
                  <h3 className="text-sm font-medium text-zinc-200">
                    {jobStatus === 'processing' ? 'Parsing & Segmenting Chats...' : 'Ingesting into Vector DB...'}
                  </h3>
                  <p className="text-xs mt-2">This might take a while depending on archive size.</p>
                </div>
              )}

              {jobStatus === 'completed' && (
                <div className="flex flex-col items-center justify-center py-12 text-emerald-400">
                  <CheckCircle2 size={48} className="mb-4" />
                  <h3 className="text-lg font-medium">Import Completed!</h3>
                  <p className="text-xs text-zinc-400 mt-2">You can now search these chats.</p>
                </div>
              )}

              {jobStatus === 'preview' && previewData && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-zinc-100">{previewData.summary.total_conversations}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">Total Convs</div>
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">{previewData.summary.new_conversations}</div>
                      <div className="text-[10px] text-emerald-600 uppercase tracking-wider mt-1">New</div>
                    </div>
                    <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{previewData.summary.updated_conversations}</div>
                      <div className="text-[10px] text-blue-600 uppercase tracking-wider mt-1">Updated</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-zinc-500">{previewData.summary.skipped_conversations}</div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">Skipped (Dups)</div>
                    </div>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col max-h-64">
                    <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs font-semibold text-zinc-300">
                      Conversations Preview
                    </div>
                    <div className="overflow-y-auto p-2 flex flex-col gap-2">
                      {previewData.conversations_preview.map((conv, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 rounded bg-zinc-900/50 border border-zinc-800/50 text-sm">
                          <div className="truncate flex-1 text-zinc-300 pr-4">{conv.title}</div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-zinc-500">{conv.topics_count} topics</span>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded \${
                              conv.status === 'new' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' :
                              conv.status === 'updated' ? 'bg-blue-950 text-blue-400 border border-blue-800/50' :
                              'bg-zinc-800 text-zinc-500'
                            }`}>
                              {conv.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
                    <button onClick={handleClose} className="px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleCommit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 text-sm font-bold rounded-lg shadow-lg transition-colors">
                      Commit Import
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SourceUploader;