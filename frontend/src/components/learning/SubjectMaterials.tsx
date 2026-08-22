import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Globe,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckSquare,
  Square
} from 'lucide-react';
import { sourcesApi, SourceItem } from '../../api/sources';
import { subjectsApi } from '../../api/subjects';

interface SubjectMaterialsProps {
  subjectId: string;
}

export const SubjectMaterials: React.FC<SubjectMaterialsProps> = ({ subjectId }) => {
  const [allSources, setAllSources] = useState<SourceItem[]>([]);
  const [attachedSourceIds, setAttachedSourceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [parsingUrl, setParsingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sourcesData, currentSubject] = await Promise.all([
        sourcesApi.getSources(),
        subjectsApi.getSubject(subjectId)
      ]);

      setAllSources(sourcesData);
      const attached = new Set(
        (currentSubject.sources || []).map((s: any) => s.id)
      );
      setAttachedSourceIds(attached);
    } catch (err) {
      console.error('Failed to load materials data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [subjectId]);

  const handleToggleSource = async (sourceId: string) => {
    const isAttached = attachedSourceIds.has(sourceId);
    try {
      if (isAttached) {
        await subjectsApi.detachSource(subjectId, sourceId);
        setAttachedSourceIds(prev => {
          const next = new Set(prev);
          next.delete(sourceId);
          return next;
        });
      } else {
        await subjectsApi.attachSource(subjectId, sourceId);
        setAttachedSourceIds(prev => new Set(prev).add(sourceId));
      }
    } catch (err) {
      console.error('Failed to toggle source attachment:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const newSource = await sourcesApi.uploadFile(file);
      await subjectsApi.attachSource(subjectId, newSource.id);

      setAllSources(prev => [newSource, ...prev]);
      setAttachedSourceIds(prev => new Set(prev).add(newSource.id));
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    try {
      setParsingUrl(true);
      const newSource = await sourcesApi.uploadUrl(urlInput.trim());
      await subjectsApi.attachSource(subjectId, newSource.id);

      setAllSources(prev => [newSource, ...prev]);
      setAttachedSourceIds(prev => new Set(prev).add(newSource.id));
      setUrlInput('');
    } catch (err) {
      console.error('Failed to parse URL:', err);
    } finally {
      setParsingUrl(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Загрузка материалов...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload and Ingest Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* File Upload Card */}
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h3 className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-400" />
            Загрузить документ
          </h3>
          <p className="text-xs text-zinc-400 mb-4">
            Поддерживаются PDF, DOCX, TXT, MD. Файл будет автоматически проиндексирован.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            id="materials-file-upload"
          />
          <label
            htmlFor="materials-file-upload"
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
              uploading 
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
            }`}
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Обработка файла...
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Выбрать файл
              </>
            )}
          </label>
        </div>

        {/* Web Ingestion Card */}
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h3 className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            Парсинг веб-страницы
          </h3>
          <p className="text-xs text-zinc-400 mb-3">
            Вставьте URL статьи или документации для извлечения текстового контекста.
          </p>

          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com/docs..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={parsingUrl}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
            <button
              type="submit"
              disabled={parsingUrl || !urlInput.trim()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {parsingUrl ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Импорт'}
            </button>
          </form>
        </div>
      </div>

      {/* Materials List with Multiselect Checkboxes */}
      <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
        <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/60">
          <div className="text-xs font-semibold text-zinc-300">
            База знаний предмета ({attachedSourceIds.size} из {allSources.length} подключено)
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60 max-h-[420px] overflow-y-auto">
          {allSources.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              Источники не найдены. Загрузите файлы или добавьте URL для начала обучения.
            </div>
          ) : (
            allSources.map((source) => {
              const isSelected = attachedSourceIds.has(source.id);
              return (
                <div
                  key={source.id}
                  onClick={() => handleToggleSource(source.id)}
                  className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-950/20 hover:bg-indigo-950/30' : 'hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="text-zinc-400">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>

                    <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />

                    <div className="min-w-0">
                      <div className={`text-xs font-medium truncate ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`}>
                        {source.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                        <span>Чанков: {source.chunks_count || 0}</span>
                        <span>•</span>
                        <span>Фактов: {source.claims_count || 0}</span>
                        {source.meta_info?.url && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[200px]">{source.meta_info.url}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${
                      source.status === 'indexed' 
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}>
                      {source.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};