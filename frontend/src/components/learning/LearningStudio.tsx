import React, { useState, useEffect } from 'react';
import { LearningScopeSelector } from './LearningScopeSelector';
import { RoadmapExplorer } from './RoadmapExplorer';
import { StudyCanvas } from './StudyCanvas';
import { LearningDashboard } from '../../pages/LearningDashboard';
import { BookOpen, Zap, Sparkles } from 'lucide-react';
import { 
  learningApi, 
  GenerateRoadmapRequest, 
  AdaptiveRoadmapPayload, 
  RoadmapModule, 
  RoadmapSubtopic, 
  StudyNoteResponse 
} from '../../api/learning';
import { useStudyNoteStream } from '../../hooks/useStudyNoteStream';

const STORAGE_KEY = 'pka_active_learning_session';

interface LearningSessionState {
  scopeReq: GenerateRoadmapRequest | null;
  roadmap: AdaptiveRoadmapPayload | null;
  selectedTopicId: string | null;
  note: StudyNoteResponse | null;
  notesByTopic: Record<string, StudyNoteResponse>;
}

export function LearningStudio() {
  const [activeTab, setActiveTab] = useState<'subjects' | 'studio'>('studio');
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [isSavingSubject, setIsSavingSubject] = useState(false);
  
  const [scopeReq, setScopeReq] = useState<GenerateRoadmapRequest | null>(null);
  const [roadmap, setRoadmap] = useState<AdaptiveRoadmapPayload | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [notesByTopic, setNotesByTopic] = useState<Record<string, StudyNoteResponse>>({});

  const { generateNoteStream, markdown, citations, isLoading: isStreaming, error: streamError } = useStudyNoteStream();

  // Load state from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: LearningSessionState = JSON.parse(stored);
        if (parsed.scopeReq) setScopeReq(parsed.scopeReq);
        if (parsed.roadmap) setRoadmap(parsed.roadmap);
        if (parsed.selectedTopicId) setSelectedTopicId(parsed.selectedTopicId);
        if (parsed.notesByTopic) setNotesByTopic(parsed.notesByTopic);
      }
    } catch (e) {
      console.error('Failed to parse learning session state', e);
    }
  }, []);

  // Save state to sessionStorage
  useEffect(() => {
    const state: LearningSessionState = { scopeReq, roadmap, selectedTopicId, note: null, notesByTopic };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [scopeReq, roadmap, selectedTopicId, notesByTopic]);

  const handleGenerateRoadmap = async (req: GenerateRoadmapRequest) => {
    try {
      setIsGeneratingRoadmap(true);
      setScopeReq(req);
      setRoadmap(null);
      setSelectedTopicId(null);
      
      const res = await learningApi.generateRoadmap(req);
      setRoadmap(res);
    } catch (err) {
      console.error(err);
      alert('Ошибка при генерации дорожной карты. Проверьте консоль.');
    } finally {
      setIsGeneratingRoadmap(false);
    }
  };

  const handleTopicSelect = async (module: RoadmapModule, topic: RoadmapSubtopic) => {
    if (!roadmap || !scopeReq) return;
    
    setSelectedTopicId(topic.id);
    
    if (notesByTopic[topic.id]) {
      return;
    }
    
    try {
      setIsGeneratingNote(true);
      const url = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1') + '/learning/generate-note';
      await generateNoteStream(url, {
        roadmap_payload: roadmap,
        module_id: module.id,
        topic_id: topic.id,
        scope: scopeReq.scope
      });
    } catch (err) {
      console.error(err);
      alert('Ошибка при генерации конспекта. Проверьте консоль.');
    } finally {
      setIsGeneratingNote(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!roadmap || !scopeReq) return;
    setSelectedTopicId('summary');
    
    if (notesByTopic['summary']) {
      return;
    }
    
    try {
      setIsGeneratingNote(true);
      const url = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1') + '/learning/generate-summary-note';
      await generateNoteStream(url, {
        roadmap_payload: roadmap,
        scope: scopeReq.scope
      });
    } catch (err) {
      console.error(err);
      alert('Ошибка при генерации сводного конспекта.');
    } finally {
      setIsGeneratingNote(false);
    }
  };

  const handleSaveSubject = async () => {
    if (!roadmap || !scopeReq) return;
    try {
      setIsSavingSubject(true);
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1') + '/learning/save-as-subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roadmap_payload: roadmap,
          scope: scopeReq.scope,
          notes_by_topic: notesByTopic
        })
      });
      if (!res.ok) throw new Error("Failed to save subject");
      alert("✅ Предмет успешно сохранен! Вы можете найти его во вкладке «Мои предметы».");
    } catch (err) {
      console.error(err);
      alert('Ошибка при сохранении предмета.');
    } finally {
      setIsSavingSubject(false);
    }
  };

  // Calculate active note to display
  let activeNote: StudyNoteResponse | null = null;
  if (selectedTopicId) {
    if (notesByTopic[selectedTopicId]) {
      activeNote = notesByTopic[selectedTopicId];
    } else {
      activeNote = {
        title: "Конспект",
        markdown: markdown,
        citations: citations as any,
        key_insights: [],
        insufficient_evidence: streamError ? true : false,
        evidence_warning: streamError || undefined
      };
    }
  }

  // Helper function to cache stream result when completed
  useEffect(() => {
    if (!isStreaming && selectedTopicId && markdown && !notesByTopic[selectedTopicId]) {
      setNotesByTopic(prev => ({
        ...prev,
        [selectedTopicId]: {
          title: "Конспект",
          markdown,
          citations: citations as any,
          key_insights: [],
          insufficient_evidence: streamError ? true : false,
          evidence_warning: streamError || undefined
        }
      }));
    }
  }, [isStreaming, markdown, citations, selectedTopicId, notesByTopic, streamError]);

  return (
    <div className="h-full flex flex-col w-full">
      {/* Top Tabs */}
      <div className="flex items-center justify-center p-3 border-b border-white/5 shrink-0 bg-white/[0.02]">
        <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveTab('subjects')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'subjects' ? 'bg-indigo-500/20 text-indigo-300 shadow-sm border border-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <BookOpen size={16} />
            Мои предметы
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'studio' ? 'bg-indigo-500/20 text-indigo-300 shadow-sm border border-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Zap size={16} />
            Интеллектуальная Студия
          </button>
        </div>
      </div>

      {activeTab === 'subjects' ? (
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <LearningDashboard />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 p-4 max-w-[1600px] mx-auto w-full">
          {/* Left Panel: Scope + Explorer */}
          <div className="w-full md:w-[35%] flex flex-col gap-4 min-w-[320px] h-full min-h-0 overflow-hidden">
            <LearningScopeSelector 
              onGenerate={handleGenerateRoadmap}
              isGenerating={isGeneratingRoadmap}
            />
            <div className="flex-1 min-h-0 relative flex flex-col gap-3">
              {/* Action Toolbar */}
              {roadmap && (
                <div className="flex items-center gap-2 bg-zinc-900/40 p-2 rounded-xl border border-white/5 shrink-0">
                  <button
                    onClick={handleSaveSubject}
                    disabled={isSavingSubject}
                    className="flex-1 flex justify-center items-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg text-sm transition border border-white/10 disabled:opacity-50"
                  >
                    💾 В Предметы
                  </button>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingNote}
                    className="flex-[1.5] flex justify-center items-center gap-2 py-2 bg-gradient-to-r from-indigo-600/80 to-purple-600/80 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-lg text-sm shadow-md transition disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    Полный конспект
                  </button>
                </div>
              )}
              
              <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-white/5">
                <RoadmapExplorer 
                  roadmap={roadmap}
                  selectedTopicId={selectedTopicId}
                  onTopicSelect={handleTopicSelect}
                  isGeneratingNote={isGeneratingNote}
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Study Canvas */}
          <div className="w-full md:w-[65%] flex-1 min-h-[500px] md:min-h-0">
            <StudyCanvas 
              note={activeNote}
              isLoading={isGeneratingNote || isStreaming}
              currentScope={scopeReq?.scope}
              moduleId={roadmap?.modules.find(m => m.topics.some(t => t.id === selectedTopicId))?.id}
              activeTopic={roadmap?.modules.flatMap(m => m.topics).find(t => t.id === selectedTopicId)}
              roadmapPayload={roadmap}
            />
          </div>
        </div>
      )}
    </div>
  );
}
