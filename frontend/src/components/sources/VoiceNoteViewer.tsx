import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, CheckSquare, Lightbulb, HelpCircle, FileText, CheckCircle2, Languages, Loader2 } from 'lucide-react';
import { Source } from '@/types/source';
import { useSourceTranslation } from '../../hooks/useSourceTranslation';

const Card = ({ children, className = '' }: any) => <div className={`rounded-xl border bg-black/20 ${className}`}>{children}</div>;
const CardHeader = ({ children, className = '' }: any) => <div className={`px-4 py-3 border-b ${className}`}>{children}</div>;
const CardTitle = ({ children, className = '' }: any) => <h3 className={`text-sm font-medium ${className}`}>{children}</h3>;
const CardContent = ({ children, className = '' }: any) => <div className={`p-4 ${className}`}>{children}</div>;
const ScrollArea = ({ children, className = '' }: any) => <div className={`overflow-y-auto ${className}`}>{children}</div>;
const Button = ({ children, className = '', onClick, disabled = false }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center justify-center rounded-md font-medium transition-colors ${className}`}
  >
    {children}
  </button>
);
const Checkbox = ({ id, className = '' }: any) => <input type="checkbox" id={id} className={`rounded border-white/20 bg-transparent ${className}`} />;

interface VoiceNoteViewerProps {
  source: Source;
  sourceId: string;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export function VoiceNoteViewer({ source, sourceId }: VoiceNoteViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [copied, setCopied] = useState(false);

  const mediaMeta = source.meta_info?.media;
  const structuredNote = mediaMeta?.structured_note;

  // Получаем оригинальные сегменты из метаданных
  const originalSegments: TranscriptSegment[] = source.meta_info?.transcript_segments || [];
  const rawTranscript = source.meta_info?.raw_transcript || source.content || '';

  const [languageMode, setLanguageMode] = useState<'orig' | 'ru'>('orig');
  const { isTranslating, translatedText, startTranslation } = useSourceTranslation();

  // Парсинг текста с таймкодами [MM:SS] в сегменты для караоке
  const parseTimestampedText = (text: string): TranscriptSegment[] => {
    if (!text) return [];
    const lines = text.split('\n');
    const parsed: TranscriptSegment[] = [];
    const timeRegex = /\[(\d{1,2}):(\d{2})\]/;

    let currentStart = 0;
    lines.forEach((line) => {
      const match = line.match(timeRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        currentStart = mins * 60 + secs;
        const cleanText = line.replace(timeRegex, '').trim();
        if (cleanText) {
          parsed.push({ start: currentStart, end: currentStart + 4, text: cleanText });
        }
      } else if (line.trim() && parsed.length > 0) {
        parsed[parsed.length - 1].text += ` ${line.trim()}`;
      }
    });

    return parsed;
  };

  const cachedTranslation = source.meta_info?.translations?.ru || source.metadata_info?.translations?.ru;
  const activeTranslatedText = translatedText || cachedTranslation;

  // Формируем список сегментов в зависимости от выбранного языка
  const displaySegments = useMemo(() => {
    if (languageMode === 'ru') {
      if (activeTranslatedText) {
        const parsed = parseTimestampedText(activeTranslatedText);
        if (parsed.length > 0) return parsed;
      }
    }
    return originalSegments;
  }, [languageMode, activeTranslatedText, originalSegments]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      if (!isPlaying) {
        audioRef.current.play();
      }
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleLanguage = (mode: 'orig' | 'ru') => {
    setLanguageMode(mode);
    if (mode === 'ru' && !activeTranslatedText && !isTranslating) {
      startTranslation(sourceId, 'ru');
    }
  };

  const handleCopyActions = () => {
    if (!structuredNote?.action_items) return;
    const text = structuredNote.action_items.map((a: any) => `- [ ] ${a.text}${a.context ? ` (${a.context})` : ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full">
      {/* Левая панель: Плеер и транскрипт */}
      <div className="flex-1 flex flex-col gap-4">
        <Card className="border-white/10 shadow-sm bg-black/40">
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <Button onClick={togglePlay} className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex-shrink-0">
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </Button>
              <div className="flex-1 flex flex-col gap-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
            <audio
              ref={audioRef}
              src={`/api/v1/media/${sourceId}/stream`}
              preload="metadata"
            />
          </CardContent>
        </Card>

        <Card className="flex-1 border-white/10 shadow-sm overflow-hidden flex flex-col min-h-[350px] bg-black/40">
          <CardHeader className="py-2.5 px-4 border-b border-white/10 bg-white/5 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Транскрипт
            </CardTitle>

            {/* Тумблер: Оригинал / Русский */}
            <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => handleToggleLanguage('orig')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  languageMode === 'orig'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Оригинал
              </button>
              <button
                type="button"
                onClick={() => handleToggleLanguage('ru')}
                disabled={isTranslating}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                  languageMode === 'ru'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                Русский
              </button>
            </div>
          </CardHeader>

          <ScrollArea className="flex-1 p-4">
            {displaySegments.length > 0 ? (
              <div className="space-y-2.5">
                {displaySegments.map((seg, idx) => {
                  const isActive = currentTime >= seg.start && currentTime <= seg.end;
                  return (
                    <div
                      key={idx}
                      onClick={() => seekTo(seg.start)}
                      className={`flex gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                        isActive 
                          ? 'bg-indigo-500/15 border border-indigo-500/30 text-white shadow-sm' 
                          : 'hover:bg-white/5 text-slate-300 border border-transparent'
                      }`}
                    >
                      <span className="text-xs font-mono text-slate-500 pt-0.5 select-none shrink-0">
                        {formatTime(seg.start)}
                      </span>
                      <p className="text-sm leading-relaxed">
                        {seg.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
                {languageMode === 'ru' && isTranslating
                  ? "Выполняется перевод транскрипта..."
                  : (activeTranslatedText || rawTranscript || "Транскрипт недоступен...")}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      {/* Правая панель: Структурированная заметка */}
      {structuredNote ? (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
          {structuredNote.summary && (
            <Card className="border-indigo-500/20 bg-indigo-500/5 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-indigo-400 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Саммари
                </h3>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {structuredNote.summary}
                </p>
              </CardContent>
            </Card>
          )}

          {structuredNote.action_items && structuredNote.action_items.length > 0 && (
            <Card className="border-white/10 shadow-sm bg-black/40">
              <CardHeader className="py-3 px-4 border-b border-white/10 bg-white/5 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
                  <CheckSquare className="w-4 h-4 text-blue-400" />
                  Задачи (Action Items)
                </CardTitle>
                <Button
                  onClick={handleCopyActions}
                  className="h-7 px-2 text-xs bg-white/5 hover:bg-white/10 text-slate-300"
                >
                  {copied ? "Скопировано!" : "Скопировать"}
                </Button>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-3">
                {structuredNote.action_items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3">
                    <Checkbox id={`action-${idx}`} className="mt-0.5" />
                    <div className="flex flex-col">
                      <label htmlFor={`action-${idx}`} className="text-sm font-medium leading-none cursor-pointer text-slate-200">
                        {item.text}
                      </label>
                      {item.context && (
                        <span className="text-xs text-slate-400 mt-1">
                          {item.context}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(structuredNote.ideas?.length > 0 || structuredNote.key_points?.length > 0) && (
            <Card className="border-white/10 shadow-sm bg-black/40">
              <CardHeader className="py-3 px-4 border-b border-white/10 bg-white/5">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  Ключевые мысли и идеи
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-2">
                {[...(structuredNote.key_points || []), ...(structuredNote.ideas || [])].map((idea: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 bg-white/5 p-2.5 rounded-md text-sm border border-white/5 text-slate-200">
                    <span className="text-amber-400/70 shrink-0">•</span>
                    <span className="leading-snug">{idea}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {structuredNote.open_questions && structuredNote.open_questions.length > 0 && (
            <Card className="border-white/10 shadow-sm bg-black/40">
              <CardHeader className="py-3 px-4 border-b border-white/10 bg-white/5">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
                  <HelpCircle className="w-4 h-4 text-purple-400" />
                  Открытые вопросы
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ul className="list-disc list-inside text-sm text-slate-400 flex flex-col gap-1.5">
                  {structuredNote.open_questions.map((q: string, idx: number) => (
                    <li key={idx} className="leading-snug">{q}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 rounded-lg bg-white/5 p-6">
          <div className="text-center text-slate-400 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
              <Lightbulb className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-sm font-medium mt-2 text-slate-300">Генерация инсайтов...</p>
            <p className="text-xs text-slate-500">Заметка структурируется ИИ</p>
          </div>
        </div>
      )}
    </div>
  );
}
