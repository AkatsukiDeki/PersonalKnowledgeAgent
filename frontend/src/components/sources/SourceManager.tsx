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
  completed: { className: 'bg-green-900/30 text-green-400 border-green-800/50', icon: <CheckCircle2 size={10} /> },
  processing: { className: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50', icon: <Clock size={10} /> },
  pending: { className: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50', icon: <Clock size={10} /> },
  failed: { className: 'bg-red-900/30 text-red-400 border-red-800/50', icon: <AlertCircle size={10} /> },
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[85vh]">
          
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2 font-medium text-sm text-zinc-100">
              <Database size={18} className="text-emerald-400" />
              Source & Document Manager
              <button onClick={loadSources} className="ml-2 text-zinc-500 hover:text-zinc-300" title="Refresh">
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="ml-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-md border border-red-500/30 transition-colors flex items-center gap-2"
                >
                  {isBulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Удалить выбранные ({selectedIds.size})
                </button>
              )}
              <button onClick={() => setIsObsidianModalOpen(true)} className="ml-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-md border border-zinc-700 transition-colors flex items-center gap-2">
                <Database size={14} />
                Import Obsidian Vault
              </button>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Dropzone */}
          <div
            className={`mx-5 mt-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center py-6 ${
              isDragOver
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30'
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
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <Loader2 size={16} className="animate-spin" />
                {uploadProgress}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-zinc-500">
                <Upload size={24} />
                <span className="text-xs">Drop files here or click to upload</span>
                <span className="text-[10px] text-zinc-600">Supported: MD, TXT, PDF, DOCX, XLSX, CSV, JSON, PNG, JPG, WEBP, HEIC</span>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by title or content..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
            <select
              value={domainFilter}
              onChange={e => setDomainFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2"
            >
              <option value="">All Domains</option>
              {domains.map(d => <option key={d} value={d!}>{d}</option>)}
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2"
            >
              <option value="">All Types</option>
              {fileTypes.map(t => <option key={t} value={t!}>{t!.toUpperCase()}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            {isLoading && sources.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-zinc-500">
                <Loader2 className="animate-spin mr-2" size={20} /> Loading...
              </div>
            ) : sources.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
                No sources found. Upload your first document!
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] uppercase tracking-wider">
                    <th className="pb-2 font-medium w-8 pl-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-600 bg-zinc-800 checked:bg-indigo-500 focus:ring-0 w-3 h-3 cursor-pointer" 
                        checked={sources.length > 0 && selectedIds.size === sources.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="pb-2 font-medium w-8"></th>
                    <th className="pb-2 font-medium">Title</th>
                    <th className="pb-2 font-medium">Domain</th>
                    <th className="pb-2 font-medium text-center">Chunks</th>
                    <th className="pb-2 font-medium text-center">Claims</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium w-20 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {sources.map(src => {
                    const statusInfo = STATUS_BADGE[src.status] || STATUS_BADGE.pending;
                    return (
                      <tr key={src.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors group ${selectedIds.has(src.id) ? 'bg-indigo-500/10' : ''}`}>
                        <td className="py-2.5 pl-4">
                          <input 
                            type="checkbox" 
                            className="rounded border-zinc-600 bg-zinc-800 checked:bg-indigo-500 focus:ring-0 w-3 h-3 cursor-pointer"
                            checked={selectedIds.has(src.id)}
                            onChange={() => toggleSelect(src.id)}
                          />
                        </td>
                        <td className="py-2.5 pl-2">
                          {FILE_ICONS[src.file_type || ''] || <FileText size={16} className="text-zinc-500" />}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="text-zinc-200 font-medium truncate max-w-[200px]">{src.title}</div>
                          <div className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <span className="uppercase">{src.file_type || src.source_type}</span>
                            <span>• v{src.version}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {src.domain ? (
                            <span className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-full capitalize">
                              {src.domain}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center text-zinc-400">{src.chunks_count}</td>
                        <td className="py-2.5 text-center text-zinc-400">{src.claims_count}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${statusInfo.className}`}>
                            {statusInfo.icon} {src.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-400 text-[10px]">
                          {new Date(src.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingSourceId(src.id)}
                              className="text-zinc-500 hover:text-blue-400 p-1 rounded"
                              title="View / Edit"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(src.id)}
                              disabled={isDeleting === src.id}
                              className="text-zinc-500 hover:text-red-400 p-1 rounded disabled:opacity-50"
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
