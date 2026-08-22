import React, { useState, useEffect, useCallback } from 'react';
import { sourcesApi } from '../../api/sources';
import { SourceDetail } from '../../types/source';
import { X, Save, RefreshCw, Loader2, CheckCircle2, XCircle, FileText, ExternalLink, GraduationCap } from 'lucide-react';
import { LearningModal } from '../learning/LearningModal';

interface Props {
  sourceId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentEditorModal({ sourceId, onClose, onSaved }: Props) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLearningModalOpen, setIsLearningModalOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sourcesApi.getDetail(sourceId);
      setDetail(data);
      setEditedContent(data.raw_content ?? data.content ?? '');
      setDomain(data.domain ?? '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleSave = async () => {
    if (!detail) return;
    try {
      setSaving(true);
      await sourcesApi.update(sourceId, editedContent, domain || undefined);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = detail && (editedContent !== (detail.raw_content ?? detail.content ?? '') || domain !== (detail.domain ?? ''));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-6xl shadow-2xl flex flex-col" style={{ height: '85vh' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-blue-400" />
            <div>
              <h2 className="font-medium text-sm text-zinc-100">
                {detail?.title || 'Loading...'}
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                {detail && (
                  <>
                    <span className="uppercase bg-zinc-800 px-1.5 py-0.5 rounded">{detail.file_type || detail.source_type}</span>
                    <span>v{detail.version}</span>
                    <span>{detail.chunks_count} chunks</span>
                    <span>{detail.claims_count} claims</span>
                    <span className={`px-1.5 py-0.5 rounded ${detail.status === 'completed' ? 'bg-green-900/30 text-green-400' : detail.status === 'failed' ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                      {detail.status}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save & Re-index
              </button>
            )}
            <button
              onClick={() => setIsLearningModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 text-indigo-300 text-xs font-medium rounded-lg transition-colors"
            >
              <GraduationCap size={14} /> Учить этот источник
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 ml-2">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading document...
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-2">
            <XCircle size={32} />
            <span className="text-sm">{error}</span>
            <button onClick={loadDetail} className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 mt-2">
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : detail ? (
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left panel: Editor */}
            <div className="flex-1 flex flex-col border-r border-zinc-800">
              <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Normalised Text</span>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500">Domain:</label>
                  <select
                    value={domain}
                    onChange={e => setDomain(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1"
                  >
                    <option value="">—</option>
                    <option value="programming">Programming</option>
                    <option value="sport">Sport</option>
                    <option value="study">Study</option>
                    <option value="books">Books</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
              </div>
              <textarea
                value={editedContent ?? ''}
                onChange={e => setEditedContent(e.target.value)}
                className="flex-1 bg-zinc-950 text-zinc-200 text-sm p-4 font-mono leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/30 border-none"
                spellCheck={false}
              />
            </div>

            {/* Right panel: Claims */}
            <div className="w-80 flex flex-col bg-zinc-900/50">
              <div className="px-4 py-2 border-b border-zinc-800 shrink-0">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Extracted Claims ({detail.claims.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {detail.claims.length === 0 ? (
                  <div className="text-xs text-zinc-500 text-center py-8">No claims extracted yet.</div>
                ) : (
                  detail.claims.map(claim => (
                    <div
                      key={claim.id}
                      className={`p-2.5 rounded-lg border text-xs ${
                        claim.is_active
                          ? 'bg-zinc-800/50 border-zinc-700/50'
                          : 'bg-zinc-800/20 border-red-900/30 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className={claim.is_active ? 'text-zinc-200' : 'text-zinc-400 line-through'}>
                          {claim.content}
                        </span>
                        {claim.is_active ? (
                          <CheckCircle2 size={12} className="text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                        <span className="uppercase bg-zinc-700/50 px-1 py-0.5 rounded">{claim.claim_type}</span>
                        <span>{claim.category}</span>
                        <span>{Math.round(claim.confidence * 100)}%</span>
                      </div>
                      {!claim.is_active && claim.superseded_by && (
                        <div className="text-[9px] text-red-400/70 mt-1">
                          Superseded → {claim.superseded_by.split('-')[0]}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      
      <LearningModal 
        isOpen={isLearningModalOpen} 
        onClose={() => setIsLearningModalOpen(false)} 
        sourceId={sourceId} 
      />
    </div>
  );
}
