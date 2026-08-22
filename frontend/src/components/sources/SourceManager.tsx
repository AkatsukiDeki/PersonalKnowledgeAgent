import React, { useEffect, useState, useRef, useCallback } from 'react';
import { sourcesApi, SourceItem } from '../../api/sources';
import { Source } from '../../types/source';
import { DocumentEditorModal } from './DocumentEditorModal';
import { ObsidianImportModal } from '../connectors/ObsidianImportModal';
import {
  X, Database, Trash2, Loader2, RefreshCw, Upload, Search,
  FileText, FileSpreadsheet, FileType, FileCode, FileJson,
  CheckCircle2, AlertCircle, Clock, Eye, RotateCcw, Image
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  md: <FileText size={16} className="text-blue-400" />,
  txt: <FileText size={16} className="text-slate-400" />,
  pdf: <FileType size={16} className="text-red-400" />,
  docx: <FileCode size={16} className="text-sky-400" />,
  xlsx: <FileSpreadsheet size={16} className="text-emerald-400" />,
  csv: <FileSpreadsheet size={16} className="text-lime-400" />,
  json: <FileJson size={16} className="text-amber-400" />,
  png: <Image size={16} className="text-purple-400" />,
  jpg: <Image size={16} className="text-purple-400" />,
  jpeg: <Image size={16} className="text-purple-400" />,
  webp: <Image size={16} className="text-purple-400" />,
  heic: <Image size={16} className="text-purple-400" />,
};

const STATUS_BADGE: Record<string, { className: string; icon: React.ReactNode }> = {
  completed: { className: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400', icon: <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> },
  processing: { className: 'bg-amber-950/40 border-amber-500/30 text-amber-400 animate-pulse', icon: <div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> },
  pending: { className: 'bg-amber-950/40 border-amber-500/30 text-amber-400 animate-pulse', icon: <div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> },
  failed: { className: 'bg-red-950/40 border-red-500/30 text-red-400', icon: <div className="w-1.5 h-1.5 rounded-full bg-red-400" /> },
};

const ACCEPTED_EXTENSIONS = '.md,.txt,.pdf,.docx,.xlsx,.csv,.json,.png,.jpg,.jpeg,.webp,.heic';

export function SourceManager({ isOpen, onClose }: Props) {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor/Connectors
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [isObsidianModalOpen, setIsObsidianModalOpen] = useState(false);

  const loadSources = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await sourcesApi.list({
        domain: domainFilter || undefined,
        file_type: typeFilter || undefined,
        search: searchQuery || undefined,
      });
      setSources(data);
    } catch (err) {
      console.error('Error loading sources:', err);
    } finally {
      setIsLoading(false);
    }
  }, [domainFilter, typeFilter, searchQuery]);

  useEffect(() => {
    if (isOpen) loadSources();
  }, [isOpen, loadSources]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) loadSources();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Upload handlers ──
  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < fileArray.length; i++) {
        const f = fileArray[i];
        setUploadProgress(`Uploading ${i + 1}/${fileArray.length}: ${f.name}`);
        await sourcesApi.upload(f);
      }
      setUploadProgress(null);
      await loadSources();
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    if (!confirm('Удалить этот источник? (Soft delete — факты будут деактивированы)')) return;
    setIsDeleting(id);
    try {
      await sourcesApi.delete(id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadSources();
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || isBulkDeleting) return;
    if (!confirm(`Удалить ${selectedIds.size} выбранных источников? (Soft delete)`)) return;
    setIsBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await sourcesApi.delete(id);
      }
      setSelectedIds(new Set());
      await loadSources();
    } catch (err: any) {
      alert(`Bulk delete error: ${err.message}`);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(sources.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  const domains = [...new Set(sources.map(s => s.domain).filter(Boolean))].sort();
  const fileTypes = [...new Set(sources.map(s => s.file_type).filter(Boolean))].sort();

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-[#0a0a0f]/95 backdrop-blur-xl border border-indigo-500/20 shadow-[0_0_50px_rgba(99,102,241,0.08)] rounded-xl w-full max-w-5xl flex flex-col max-h-[85vh] relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-500/20 shrink-0 bg-white/[0.02]">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-indigo-400">
              <Database size={16} />
              Source & Document Manager
              <button onClick={loadSources} className="ml-2 text-zinc-500 hover:text-indigo-400 transition-colors" title="Refresh">
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setIsObsidianModalOpen(true)} className="ml-auto bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-md border border-indigo-500/20 transition-all flex items-center gap-2">
                <Database size={14} />
                Import Obsidian Vault
              </button>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-indigo-400 transition-colors p-1">
              <X size={18} />
            </button>
          </div>

          {/* Dropzone */}
          <div
            className={`mx-5 mt-4 rounded-xl border border-dashed transition-all cursor-pointer flex items-center justify-center py-6 ${
              isDragOver
                ? 'border-indigo-400 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                : 'border-zinc-700/50 hover:border-indigo-500/30 bg-black/20'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              multiple
              className="hidden"
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
            {uploading ? (
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono">
                <Loader2 size={16} className="animate-spin" />
                {uploadProgress}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-500">
                <Upload size={20} className={isDragOver ? "text-indigo-400" : ""} />
                <span className="text-[11px] font-mono tracking-wide text-zinc-400">DROP FILES HERE OR CLICK TO UPLOAD</span>
                <span className="text-[9px] font-mono text-zinc-600">MD, TXT, PDF, DOCX, XLSX, CSV, JSON, PNG, JPG, WEBP, HEIC</span>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by title or content..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-zinc-800 text-zinc-300 text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-indigo-500/50 focus:bg-black/60 transition-colors font-mono"
              />
            </div>
            <select
              value={domainFilter}
              onChange={e => setDomainFilter(e.target.value)}
              className="bg-black/40 border border-zinc-800 text-zinc-400 text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-indigo-500/50"
            >
              <option value="">ALL DOMAINS</option>
              {domains.map(d => <option key={d} value={d!}>{d?.toUpperCase()}</option>)}
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-black/40 border border-zinc-800 text-zinc-400 text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-indigo-500/50"
            >
              <option value="">ALL TYPES</option>
              {fileTypes.map(t => <option key={t} value={t!}>{t!.toUpperCase()}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto px-5 pb-4 relative">
            {isLoading && sources.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-indigo-500/50 font-mono text-xs">
                <Loader2 className="animate-spin mr-2" size={16} /> INDEXING_SOURCES...
              </div>
            ) : sources.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-zinc-600 font-mono text-[10px]">
                NO SOURCES FOUND
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/50 text-zinc-600 text-[10px] uppercase tracking-widest font-mono">
                    <th className="pb-3 font-medium w-8 pl-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-700 bg-black/40 checked:bg-indigo-600/80 checked:border-indigo-400 focus:ring-0 w-3.5 h-3.5 cursor-pointer appearance-none transition-all relative after:content-[''] after:absolute after:hidden checked:after:block after:left-1 after:top-[1px] after:w-1.5 after:h-2.5 after:border-r-[2px] after:border-b-[2px] after:border-white after:rotate-45" 
                        checked={sources.length > 0 && selectedIds.size === sources.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="pb-3 font-medium w-8"></th>
                    <th className="pb-3 font-medium">Title</th>
                    <th className="pb-3 font-medium">Domain</th>
                    <th className="pb-3 font-medium text-center">Chunks</th>
                    <th className="pb-3 font-medium text-center">Claims</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium w-20 text-right"></th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {sources.map(src => {
                    const statusInfo = STATUS_BADGE[src.status] || STATUS_BADGE.pending;
                    const isSelected = selectedIds.has(src.id);
                    return (
                      <tr key={src.id} className={`border-b border-zinc-900/50 hover:bg-white/[0.02] transition-colors group ${isSelected ? 'bg-indigo-500/5' : ''}`}>
                        <td className="py-3 pl-4">
                          <input 
                            type="checkbox" 
                            className={`rounded border-zinc-700 bg-black/40 checked:bg-indigo-600/80 checked:border-indigo-400 focus:ring-0 w-3.5 h-3.5 cursor-pointer appearance-none transition-all relative after:content-[''] after:absolute after:hidden checked:after:block after:left-1 after:top-[1px] after:w-1.5 after:h-2.5 after:border-r-[2px] after:border-b-[2px] after:border-white after:rotate-45 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            checked={isSelected}
                            onChange={() => toggleSelect(src.id)}
                          />
                        </td>
                        <td className="py-3 pl-2 opacity-70 group-hover:opacity-100 transition-opacity">
                          {FILE_ICONS[src.file_type || ''] || <FileText size={16} className="text-zinc-500" />}
                        </td>
                        <td className="py-3 pr-4">
                          <div className={`font-medium truncate max-w-[200px] ${isSelected ? 'text-indigo-200' : 'text-zinc-300'}`}>{src.title}</div>
                          <div className="text-[10px] text-zinc-600 flex items-center gap-2 mt-1 font-mono uppercase tracking-wider">
                            <span>{src.file_type || src.source_type}</span>
                            <span>VER {src.version}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          {src.domain ? (
                            <span className="bg-white/[0.03] text-zinc-400 text-[9px] font-mono tracking-widest px-2 py-1 rounded-sm uppercase border border-white/5">
                              {src.domain}
                            </span>
                          ) : (
                            <span className="text-zinc-700 text-[10px] font-mono">—</span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-[10px] font-mono text-indigo-400/70">{src.chunks_count}</span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-[10px] font-mono text-cyan-400/70">{src.claims_count}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider px-2.5 py-0.5 rounded border ${statusInfo.className}`}>
                            {statusInfo.icon} {src.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-zinc-500 text-[10px] font-mono">
                          {new Date(src.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all">
                            <button
                              onClick={() => setEditingSourceId(src.id)}
                              className="text-zinc-500 hover:text-indigo-400 p-1.5 rounded bg-black/40 hover:bg-indigo-500/10 transition-colors"
                              title="View / Edit"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(src.id)}
                              disabled={isDeleting === src.id}
                              className="text-zinc-500 hover:text-red-400 p-1.5 rounded bg-black/40 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              {isDeleting === src.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Floating Action Bar */}
          {selectedIds.size > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0f0f13]/90 backdrop-blur-md border border-indigo-500/30 shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-full px-4 py-2 flex items-center gap-4 animate-in slide-in-from-bottom-8">
              <span className="text-[11px] font-mono tracking-widest text-indigo-300">
                SELECTED: {selectedIds.size}
              </span>
              <div className="w-px h-4 bg-zinc-800"></div>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="text-[11px] font-mono tracking-widest text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
              >
                {isBulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                DELETE
              </button>
              <div className="w-px h-4 bg-zinc-800"></div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] font-mono tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {editingSourceId && (
        <DocumentEditorModal
          sourceId={editingSourceId}
          onClose={() => setEditingSourceId(null)}
          onSaved={loadSources}
        />
      )}

      {/* Obsidian Import Modal */}
      <ObsidianImportModal
        isOpen={isObsidianModalOpen}
        onClose={() => setIsObsidianModalOpen(false)}
        onComplete={() => {
          setIsObsidianModalOpen(false);
          loadSources();
        }}
      />
    </>
  );
}

export default SourceManager;
