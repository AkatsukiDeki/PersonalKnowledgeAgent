import React, { useState, useEffect, useCallback } from 'react';
import { sourcesApi, SourceDetail } from '../../api/sources';
import { X, Save, RefreshCw, Loader2, CheckCircle2, XCircle, FileText, ExternalLink, GraduationCap, Sparkles, Wand2, Copy } from 'lucide-react';
import { LearningModal } from '../learning/LearningModal';
import { SelectionToolbar, ContextActionType } from './SelectionToolbar';
import { TaskPayload } from '../../api/sources';
import { DomainInput } from './DomainInput';
import { MediaViewer } from './MediaViewer';
import { RetranscribeModal } from './RetranscribeModal';

interface Props {
  sourceId: string;
  onClose: () => void;
  onSaved: () => void;
  onAskInChat?: (draftText: string) => void;
}

export function DocumentEditorModal({ sourceId, onClose, onSaved, onAskInChat }: Props) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [domain, setDomain] = useState('');
  const [existingDomains, setExistingDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAIFixing, setIsAIFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLearningModalOpen, setIsLearningModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'summary' | 'tasks' | 'media'>('content');

  // Retranscribe states
  const [showRetranscribeModal, setShowRetranscribeModal] = useState(false);
  const [retranscribeLoading, setRetranscribeLoading] = useState(false);

  // Selection states
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [surroundingContext, setSurroundingContext] = useState('');
  const [contextActionLoading, setContextActionLoading] = useState(false);
  const [activeContextAction, setActiveContextAction] = useState<ContextActionType | null>(null);
  const [popoverState, setPopoverState] = useState<{
    isOpen: boolean;
    title: string;
    text: string;
    taskPayload?: TaskPayload | null;
  } | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sourcesApi.getDetail(sourceId);
      setDetail(data);
      setEditedContent(data.raw_content ?? data.content ?? '');
      setDomain(data.domain ?? '');
      
      const allSources = await sourcesApi.list();
      const uniqueDomains = Array.from(
          new Set(
            allSources
              .map((s: any) => s.domain?.trim())
              .filter((d: any): d is string => Boolean(d))
          )
        ).sort((a, b) => a.localeCompare(b));
      setExistingDomains(uniqueDomains);
      
      if (data.meta_info?.media) {
        setActiveTab('media');
      } else {
        setActiveTab('content');
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleMouseUp = (e: React.MouseEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    if (start !== end) {
      const text = target.value.substring(start, end);
      const ctxStart = Math.max(0, start - 1500);
      const ctxEnd = Math.min(target.value.length, end + 1500);
      const ctx = target.value.substring(ctxStart, ctxEnd);

      setSelectedText(text.trim());
      setSurroundingContext(ctx);

      let clientX, clientY;
      if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      } else {
        const rect = target.getBoundingClientRect();
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }

      // Create a fake DOMRect based on mouse event to position toolbar
      const rectObj = {
        top: clientY,
        left: clientX,
        width: 0,
        height: 0,
        bottom: clientY,
        right: clientX,
        toJSON: () => {}
      } as DOMRect;
      setSelectionRect(rectObj);
    } else {
      setSelectionRect(null);
      setSelectedText('');
      setPopoverState(null);
    }
  };

  const handleContextAction = async (action: ContextActionType) => {
    if (!selectedText) return;
    try {
      setContextActionLoading(true);
      setActiveContextAction(action);
      const res = await sourcesApi.runContextAction(sourceId, {
        action,
        selected_text: selectedText,
        surrounding_context: surroundingContext
      });

      if (action === 'create_task') {
        setPopoverState({
          isOpen: true,
          title: 'Задача создана',
          text: res.task_payload?.title ? 'Сохранено в базу (мокап)' : 'В тексте не найдено явных задач.',
          taskPayload: res.task_payload
        });
      } else {
        setPopoverState({
          isOpen: true,
          title: action === 'explain' ? 'Объяснение' : 'Саммари',
          text: res.result_text || 'Нет ответа'
        });
      }
    } catch (err: any) {
      setPopoverState({
        isOpen: true,
        title: 'Ошибка',
        text: err.message || 'Не удалось выполнить действие'
      });
    } finally {
      setContextActionLoading(false);
      setActiveContextAction(null);
      setSelectionRect(null);
    }
  };

  const handleAskInChatAction = () => {
    if (!selectedText || !detail) return;
    const formattedDraft = `> ${selectedText.split('\n').join('\n> ')}\n\nВопрос по фрагменту из "${detail.title}": `;
    if (onAskInChat) {
      onAskInChat(formattedDraft);
    } else {
      // Fallback custom event if prop not passed
      window.dispatchEvent(new CustomEvent('askInChat', { detail: formattedDraft }));
    }
    onClose();
  };

  const handleAIFix = async () => {
    if (!editedContent) return;
    try {
      setIsAIFixing(true);
      setError(null);
      const res = await sourcesApi.aiFixText(sourceId, editedContent);
      setEditedContent(res.fixed_text);
    } catch (err: any) {
      setError(err.message || 'AI Fix failed');
    } finally {
      setIsAIFixing(false);
    }
  };

  const handleRetranscribe = async (lang: string, prompt: string) => {
    try {
      setRetranscribeLoading(true);
      await sourcesApi.retranscribe(sourceId, { 
        language: lang, 
        initial_prompt: prompt 
      });
      setShowRetranscribeModal(false);
      onSaved();
      loadDetail();
    } catch (err: any) {
      setError(err.message || 'Retranscribe failed');
    } finally {
      setRetranscribeLoading(false);
    }
  };

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
              <div className="flex items-center gap-3">
                <h2 className="font-medium text-sm text-zinc-100">
                  {detail?.title || 'Loading...'}
                </h2>
                {detail && (
                  <div className="w-64">
                    <DomainInput
                      value={domain}
                      onChange={setDomain}
                      suggestions={existingDomains}
                      placeholder="+ Домен (e.g. Sport)"
                    />
                  </div>
                )}
              </div>
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
            {activeTab === 'content' && (
              <button
                onClick={handleAIFix}
                disabled={isAIFixing || !editedContent}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                title="Починить текст (STT галлюцинации)"
              >
                {isAIFixing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                AI Fix
              </button>
            )}
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
            {detail?.source_type === 'audio' && (
              <button
                onClick={() => setShowRetranscribeModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/50 text-orange-300 text-xs font-medium rounded-lg transition-colors"
                title="Перезапустить транскрибацию"
              >
                <RefreshCw size={14} /> Retranscribe
              </button>
            )}
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('focusNode', { detail: sourceId }));
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              title="Показать на карте Вселенной"
            >
              <Sparkles size={14} className="text-indigo-400" />
            </button>
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
            
            {/* Left panel: Editor / Insights */}
            <div className="flex-1 flex flex-col border-r border-zinc-800">
              <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  {detail.meta_info?.media && (
                    <button 
                      onClick={() => setActiveTab('media')}
                      className={`text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${activeTab === 'media' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Media Player
                    </button>
                  )}
                  <button 
                    onClick={() => setActiveTab('content')}
                    className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === 'content' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Normalised Text
                  </button>
                  {detail.meta_info?.insights && (
                    <>
                      <button 
                        onClick={() => setActiveTab('summary')}
                        className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === 'summary' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        Саммари
                      </button>
                      <button 
                        onClick={() => setActiveTab('tasks')}
                        className={`text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${activeTab === 'tasks' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        Задачи
                        <span className="bg-zinc-800 text-[10px] px-1.5 rounded-full text-zinc-400">{detail.meta_info.insights.action_items?.length || 0}</span>
                      </button>
                    </>
                  )}
                </div>
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
              
              {activeTab === 'content' && (
                <div className="flex-1 relative flex flex-col min-h-0">
                  <textarea
                    value={editedContent ?? ''}
                    onChange={e => setEditedContent(e.target.value)}
                    onMouseUp={handleMouseUp}
                    onKeyUp={handleMouseUp}
                    className="flex-1 bg-zinc-950 text-zinc-200 text-sm p-4 font-mono leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/30 border-none"
                    spellCheck={false}
                  />
                  
                  <SelectionToolbar 
                    rect={selectionRect}
                    onAction={handleContextAction}
                    onAskChat={handleAskInChatAction}
                    isLoading={contextActionLoading}
                    activeAction={activeContextAction}
                  />

                  {popoverState && popoverState.isOpen && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 z-[80] animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                        <h3 className="font-medium text-zinc-200 flex items-center gap-2">
                          <Sparkles size={16} className="text-indigo-400" />
                          {popoverState.title}
                        </h3>
                        <button 
                          onClick={() => setPopoverState(null)}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      
                      <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                        {popoverState.text}
                        
                        {popoverState.taskPayload && popoverState.taskPayload.title && (
                          <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                            <div className="font-medium text-zinc-200 mb-1">{popoverState.taskPayload.title}</div>
                            {popoverState.taskPayload.description && (
                              <div className="text-xs text-zinc-400 mb-2">{popoverState.taskPayload.description}</div>
                            )}
                            <div className="text-[10px] text-zinc-500 italic border-l-2 border-zinc-700 pl-2">
                              «{popoverState.taskPayload.context_quote}»
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(popoverState.text);
                            setPopoverState(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                        >
                          <Copy size={14} /> Копировать
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'media' && (
                <div className="flex-1 relative flex flex-col min-h-0 bg-zinc-950">
                  <MediaViewer sourceId={sourceId} source={detail as any} metaInfo={detail.meta_info} />
                </div>
              )}

              {activeTab === 'summary' && detail.meta_info?.insights && (
                <div className="flex-1 bg-zinc-950 p-6 overflow-y-auto">
                  <h3 className="text-lg font-medium text-zinc-100 mb-4">Executive Summary</h3>
                  <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
                    {detail.meta_info.insights.summary}
                  </div>
                  
                  {detail.meta_info.insights.key_topics?.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Key Topics</h4>
                      <div className="flex flex-wrap gap-2">
                        {detail.meta_info.insights.key_topics.map((topic: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-md text-xs">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'tasks' && detail.meta_info?.insights && (
                <div className="flex-1 bg-zinc-950 p-6 overflow-y-auto">
                  <h3 className="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
                    Action Items
                  </h3>
                  {detail.meta_info.insights.action_items?.length === 0 ? (
                    <div className="text-sm text-zinc-500 italic">Нет выделенных задач.</div>
                  ) : (
                    <div className="space-y-3">
                      {detail.meta_info.insights.action_items.map((item: any, i: number) => (
                        <div key={i} className="p-4 rounded-xl border border-zinc-800/50 bg-zinc-900/50 group">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              <div className="w-4 h-4 rounded border border-zinc-600 flex items-center justify-center bg-black/20 group-hover:border-indigo-500/50 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-200">{item.task}</p>
                              
                              {(item.assignee || item.deadline) && (
                                <div className="flex items-center gap-3 mt-2 text-xs">
                                  {item.assignee && (
                                    <span className="flex items-center gap-1.5 text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">
                                      <span className="w-3 h-3 rounded-full bg-indigo-500/20 flex items-center justify-center text-[8px]">👤</span>
                                      {item.assignee}
                                    </span>
                                  )}
                                  {item.deadline && (
                                    <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-1 rounded-md">
                                      <span className="w-3 h-3 rounded-full bg-rose-500/20 flex items-center justify-center text-[8px]">⏳</span>
                                      {item.deadline}
                                    </span>
                                  )}
                                </div>
                              )}

                              {item.context_quote && (
                                <div className="mt-3 pl-3 border-l-2 border-zinc-700">
                                  <p className="text-xs text-zinc-500 italic">«{item.context_quote}»</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
      
      <RetranscribeModal
        isOpen={showRetranscribeModal}
        onClose={() => setShowRetranscribeModal(false)}
        onConfirm={handleRetranscribe}
        isLoading={retranscribeLoading}
      />

      <LearningModal  
        isOpen={isLearningModalOpen} 
        onClose={() => setIsLearningModalOpen(false)} 
        sourceId={sourceId} 
      />
    </div>
  );
}
