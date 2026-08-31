import React, { useState, useEffect } from 'react';
import { Headphones, Search, Plus, Loader2, PlayCircle, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { SourceItem, sourcesApi } from '../api/sources';
import { DocumentEditorModal } from '../components/sources/DocumentEditorModal';
import { SourceUploader } from '../components/sources/SourceUploader';
import { useLanguage } from '../context/LanguageContext';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={14} className="text-emerald-400" />,
  processing: <Loader2 size={14} className="text-amber-400 animate-spin" />,
  pending: <Loader2 size={14} className="text-amber-400 animate-spin" />,
  error: <AlertCircle size={14} className="text-red-400" />
};

export function TranscriptsWorkspace() {
  const { t } = useLanguage();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [inspectSourceId, setInspectSourceId] = useState<string | null>(null);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);

  const loadSources = async () => {
    try {
      const data = await sourcesApi.list({ search: searchQuery || undefined });
      setSources(data.filter(s => s.source_type === 'audio' || s.source_type === 'video'));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, [searchQuery]);
  
  // Polling for processing sources
  useEffect(() => {
    const hasProcessing = sources.some(s => s.status === 'processing' || s.status === 'pending');
    if (!hasProcessing) return;
    const interval = setInterval(loadSources, 3000);
    return () => clearInterval(interval);
  }, [sources]);

  return (
    <div className="flex flex-col h-full bg-transparent text-slate-200">
      {/* Header */}
      <div className="flex-none p-6 pb-2 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Headphones size={24} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-light text-white/90">{t('transcripts.title')}</h1>
              <p className="text-sm text-white/40">{t('transcripts.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 py-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('transcripts.search')}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="animate-spin text-white/20" size={32} />
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/30">
            <Headphones size={48} className="mb-4 opacity-20" />
            <p>{t('transcripts.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map(source => (
              <div
                key={source.id}
                onClick={() => source.status === 'completed' && setInspectSourceId(source.id)}
                className={`flex flex-col p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors ${source.status === 'completed' ? 'cursor-pointer' : 'opacity-75 cursor-default'}`}
              >
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <PlayCircle size={18} className="text-indigo-400 shrink-0 mt-0.5" />
                    <span className="font-medium text-white/80 line-clamp-2 leading-tight break-all" title={source.title}>{source.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase font-mono tracking-wider shrink-0">
                    {STATUS_ICONS[source.status]}
                    <span className="opacity-80">{source.status}</span>
                  </div>
                </div>
                
                {source.status === 'error' && source.error_message && (
                  <p 
                    className="text-[10px] leading-tight text-red-400/80 mt-2 p-2 bg-red-500/10 rounded-lg line-clamp-3 break-all cursor-help"
                    title={source.error_message}
                  >
                    {source.error_message}
                  </p>
                )}

                <div className="mt-auto pt-4 flex items-center justify-between text-xs text-white/40">
                  <span>{new Date(source.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1" title="Chunks">
                      <FileText size={12} /> {source.chunks_count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {inspectSourceId && (
        <DocumentEditorModal
          sourceId={inspectSourceId}
          onClose={() => setInspectSourceId(null)}
          onSaved={loadSources}
        />
      )}
    </div>
  );
}