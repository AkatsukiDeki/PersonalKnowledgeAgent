import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StudyNoteResponse, StudyCitation } from '../../api/learning';
import { Lightbulb, AlertTriangle, Download, Info, CheckSquare, Layers } from 'lucide-react';
import { learningApi } from '../../api/learning';
import { QuizView } from './QuizView';
import { useQuizGenerator } from '../../hooks/useQuizGenerator';
import { NoteCopilotDrawer } from './NoteCopilotDrawer';

interface StudyCanvasProps {
  note: StudyNoteResponse | null;
  isLoading: boolean;
  currentScope?: any;
  moduleId?: string;
  activeTopic?: any;
  roadmapPayload?: any;
}

export function StudyCanvas({ note, isLoading, currentScope, moduleId, activeTopic, roadmapPayload }: StudyCanvasProps) {
  const [activeCitation, setActiveCitation] = useState<StudyCitation | null>(null);
  const [isGeneratingExtra, setIsGeneratingExtra] = useState(false);
  const [extraResult, setExtraResult] = useState<{type: 'flashcards', data: any} | null>(null);
  
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const { quiz, isLoading: isQuizLoading, generateQuiz, resetQuiz } = useQuizGenerator();
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-900/20 rounded-xl border border-white/5">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm text-zinc-400">Синтез конспекта...</span>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-6 text-center border border-white/5 rounded-xl bg-zinc-900/20">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Lightbulb size={24} className="opacity-50" />
        </div>
        <h3 className="text-sm font-medium text-zinc-300 mb-1">Рабочая Тетрадь</h3>
        <p className="text-xs max-w-xs">Выберите тему в дорожной карте слева, чтобы сгенерировать детальный конспект с цитатами из первоисточников.</p>
      </div>
    );
  }

  // Pre-process markdown to convert [1], [2] into links like [1](cite:1)
  let processedMarkdown = note.markdown.replace(/\[(\d+)\]/g, '[$1](cite:$1)');
  
  // Convert GitHub alerts to styled headers inside blockquotes
  processedMarkdown = processedMarkdown.replace(/> \[\!TIP\]/gi, '> 💡 **Совет сеньора / Best Practice**\n>');
  processedMarkdown = processedMarkdown.replace(/> \[\!WARNING\]/gi, '> ⚠️ **Подводные камни / Pitfalls**\n>');
  processedMarkdown = processedMarkdown.replace(/> \[\!NOTE\]/gi, '> 🛠 **Шпаргалка команд / Конфиг**\n>');

  const handleExport = () => {
    let content = `# ${note.title}\n\n`;
    if (note.insufficient_evidence) {
      content += `> [!WARNING]\n> ${note.evidence_warning}\n\n`;
    }
    content += `${note.markdown}\n\n## Источники\n`;
    note.citations.forEach(c => {
      content += `[${c.marker}] ${c.source_name} (Chunk: ${c.chunk_id})\n`;
    });
    
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateExtra = async (type: 'quiz' | 'flashcards') => {
    if (!note) return;
    
    if (type === 'quiz') {
      if (!activeTopic) return;
      generateQuiz({
        scope: currentScope,
        module_id: moduleId,
        topic_id: activeTopic.id,
        difficulty: 'intermediate',
        question_count: 5,
      });
      return;
    }
    
    setIsGeneratingExtra(true);
    setExtraResult(null);
    try {
      if (type === 'flashcards') {
        const res = await learningApi.generateFlashcards({ topic: note.title, count: 5 });
        setExtraResult({ type: 'flashcards', data: res });
      }
    } catch (e: any) {
      alert("Ошибка при генерации: " + e.message);
    } finally {
      setIsGeneratingExtra(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 rounded-xl border border-white/10 overflow-hidden relative">
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5 shrink-0">
        <h2 className="text-lg font-bold text-zinc-100">{note.title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCopilotOpen(true)}
            className="p-1.5 px-3 flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition border border-slate-700"
            title="Копилот по конспекту"
          >
            Спросить Наставника
          </button>
          <button
            onClick={() => handleGenerateExtra('quiz')}
            disabled={isQuizLoading}
            className="p-1.5 px-3 flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition border border-white/10 disabled:opacity-50"
            title="Сгенерировать тест"
          >
            <CheckSquare size={14} /> {isQuizLoading ? 'Генерация...' : 'Тест'}
          </button>
          <button
            onClick={() => handleGenerateExtra('flashcards')}
            disabled={isGeneratingExtra}
            className="p-1.5 px-3 flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition border border-white/10 disabled:opacity-50"
            title="Карточки (Flashcards)"
          >
            <Layers size={14} /> Карточки
          </button>
          <div className="w-px h-4 bg-white/10 mx-1"></div>
          <button
            onClick={handleExport}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition"
            title="Экспорт в Markdown"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {quiz ? (
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
          <QuizView quiz={quiz} onClose={resetQuiz} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
        {note.insufficient_evidence && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-200/90">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-500" />
            <div>
              <h4 className="text-sm font-semibold mb-1">⚠️ Недостаточно первоисточников</h4>
              <p className="text-xs opacity-80">{note.evidence_warning}</p>
            </div>
          </div>
        )}

        {/* EXTRA RESULTS (Flashcards) */}
        {extraResult && (
          <div className="mb-8 p-5 rounded-xl bg-zinc-800/50 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Layers size={16} className="text-amber-400"/>
                Интеллектуальные карточки
              </h3>
              <button onClick={() => setExtraResult(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            
            {extraResult.type === 'flashcards' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {extraResult.data.map((c: any, i: number) => (
                  <div key={c.id || i} className="p-4 bg-zinc-900/50 rounded-lg flex flex-col justify-between group relative overflow-hidden">
                    <div className="mb-4">
                      <span className="text-[10px] text-amber-500/50 uppercase font-bold tracking-wider mb-1 block">Вопрос {i+1}</span>
                      <p className="text-sm font-medium text-zinc-200">{c.question}</p>
                    </div>
                    <div className="mt-auto opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 bg-zinc-800 p-4 flex flex-col justify-center text-center">
                      <span className="text-[10px] text-green-500/50 uppercase font-bold tracking-wider mb-1 block">Ответ</span>
                      <p className="text-sm text-green-300">{c.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {note.key_insights && note.key_insights.length > 0 && (
          <div className="mb-8 p-5 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
            <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2 mb-3">
              <Lightbulb size={16} /> Ключевые выводы
            </h3>
            <ul className="space-y-2">
              {note.key_insights.map((insight, idx) => (
                <li key={idx} className="text-sm text-zinc-300 flex items-start gap-2">
                  <span className="text-indigo-500/50 mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="prose prose-invert prose-sm max-w-none prose-headings:mt-6 prose-headings:mb-3 prose-p:my-2 prose-headings:text-zinc-200 prose-p:text-zinc-300 prose-a:text-indigo-400">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node, href, children, ...props }) => {
                if (href?.startsWith('cite:')) {
                  const marker = parseInt(href.replace('cite:', ''), 10);
                  const citation = note.citations.find(c => c.marker === marker);
                  if (!citation) {
                    return <span className="text-zinc-500 bg-zinc-800 px-1 rounded text-xs">[{marker}]</span>;
                  }
                  
                  return (
                    <button
                      className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 border border-indigo-500/30 transition-colors align-super"
                      onClick={() => setActiveCitation(activeCitation?.marker === marker ? null : citation)}
                      title={citation.source_name}
                    >
                      {marker}
                    </button>
                  );
                }
                return <a href={href} {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
              },
              blockquote: ({ node, children, ...props }) => {
                // Try to extract text to identify callouts like [!TIP]
                let isTip = false, isWarning = false, isNote = false;
                
                // We'll just style all blockquotes with a generic styled container, 
                // but change color if we detect keywords.
                // ReactMarkdown wraps blockquote text in a <p>, so children is usually an array of React elements.
                // We can't easily parse the raw string, so we'll just style the blockquote itself contextually by checking text content.
                // A simpler way is to just pre-process the markdown string, but styling the blockquote element works too.
                
                return (
                  <blockquote className="border-l-4 border-indigo-500/50 bg-indigo-500/10 p-4 rounded-r-lg my-4 not-prose text-sm text-indigo-100 shadow-sm" {...props}>
                    {children}
                  </blockquote>
                );
              }
            }}
          >
            {processedMarkdown}
          </ReactMarkdown>
        </div>
      {/* Citation Tooltip/Popover */}
      {activeCitation && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-zinc-800 border border-white/20 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Info size={12} className="text-indigo-400"/> {activeCitation.source_name}
            </h4>
            <button onClick={() => setActiveCitation(null)} className="text-zinc-500 hover:text-white">✕</button>
          </div>
          <p className="text-xs text-zinc-400">
            Переход к источнику временно недоступен в превью, но вы можете найти его по ID чанка: <code className="bg-black/30 px-1 rounded text-[10px]">{activeCitation.chunk_id.split('-')[0]}</code>
          </p>
        </div>
      )}
      </div>
      )}

      <NoteCopilotDrawer
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        scope={currentScope}
        topicId={activeTopic?.id}
        roadmapPayload={roadmapPayload}
        topicTitle={activeTopic?.title || note.title}
      />
    </div>
  );
}
