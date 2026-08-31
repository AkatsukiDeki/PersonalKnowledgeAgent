import React, { useState, useRef, useEffect } from 'react';
import { Source } from '@/types/source';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Pause, CheckSquare, Lightbulb, HelpCircle, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface VoiceNoteViewerProps {
  source: Source;
  sourceId: string;
}

export function VoiceNoteViewer({ source, sourceId }: VoiceNoteViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [copied, setCopied] = useState(false);

  const mediaMeta = source.meta_info?.media;
  const structuredNote = mediaMeta?.structured_note;
  const rawTranscript = source.meta_info?.raw_transcript || source.content || '';

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

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyActions = () => {
    if (!structuredNote?.action_items) return;
    const text = structuredNote.action_items.map(a => `- [ ] ${a.text}${a.context ? ` (${a.context})` : ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full">
      {/* Левая панель: Плеер и транскрипт */}
      <div className="flex-1 flex flex-col gap-4">
        <Card className="border-border/50 shadow-sm bg-card/50">
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <Button onClick={togglePlay} variant="secondary" size="icon" className="h-10 w-10 rounded-full flex-shrink-0">
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-1" />}
              </Button>
              <div className="flex-1 flex flex-col gap-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
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

        <Card className="flex-1 border-border/50 shadow-sm overflow-hidden flex flex-col min-h-[300px]">
          <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" /> 
              Исходный транскрипт
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1 p-4">
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {rawTranscript || "Транскрипт недоступен..."}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* Правая панель: Структурированная заметка */}
      {structuredNote ? (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
          
          {/* Summary */}
          {structuredNote.summary && (
            <Card className="border-primary/20 bg-primary/5 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Саммари
                </h3>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {structuredNote.summary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Action Items */}
          {structuredNote.action_items && structuredNote.action_items.length > 0 && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-500" /> 
                  Задачи (Action Items)
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCopyActions}
                  className="h-7 text-xs"
                >
                  {copied ? "Скопировано!" : "Скопировать"}
                </Button>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-3">
                {structuredNote.action_items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <Checkbox id={`action-${idx}`} className="mt-0.5" />
                    <div className="flex flex-col">
                      <label htmlFor={`action-${idx}`} className="text-sm font-medium leading-none cursor-pointer">
                        {item.text}
                      </label>
                      {item.context && (
                        <span className="text-xs text-muted-foreground mt-1">
                          {item.context}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Key Points & Ideas */}
          {(structuredNote.ideas?.length > 0 || structuredNote.key_points?.length > 0) && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" /> 
                  Ключевые мысли и идеи
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-2">
                {[...(structuredNote.key_points || []), ...(structuredNote.ideas || [])].map((idea, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-muted/30 p-2.5 rounded-md text-sm border border-border/30">
                    <span className="text-amber-500/70 shrink-0">•</span>
                    <span className="leading-snug">{idea}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Open Questions */}
          {structuredNote.open_questions && structuredNote.open_questions.length > 0 && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-purple-500" /> 
                  Открытые вопросы
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ul className="list-disc list-inside text-sm text-muted-foreground flex flex-col gap-1.5">
                  {structuredNote.open_questions.map((q, idx) => (
                    <li key={idx} className="leading-snug">{q}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-dashed border-border/50 rounded-lg bg-muted/5 p-6">
          <div className="text-center text-muted-foreground flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center animate-pulse">
              <Lightbulb className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium mt-2">Генерация инсайтов...</p>
            <p className="text-xs">Заметка структурируется ИИ</p>
          </div>
        </div>
      )}
    </div>
  );
}
