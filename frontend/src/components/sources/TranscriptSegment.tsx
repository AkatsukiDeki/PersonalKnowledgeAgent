import React, { useEffect, useState, memo } from 'react';
import { AudioSyncController } from '../../hooks/useAudioSync';

export interface SegmentData {
  id: string;
  start: number;
  end: number;
  speaker?: string;
  text: string;
  isSlide?: boolean;
}

interface TranscriptSegmentProps {
  segment: SegmentData;
  sync: AudioSyncController;
  onSegmentClick: (start: number) => void;
}

export const TranscriptSegment: React.FC<TranscriptSegmentProps> = memo(
  ({ segment, sync, onSegmentClick }) => {
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
      const unsubscribe = sync.subscribeTime((currentTime) => {
        const active = currentTime >= segment.start && currentTime < segment.end;
        setIsActive((prev) => (prev !== active ? active : prev));
      });
      return unsubscribe;
    }, [sync, segment.start, segment.end]);

    const formatTimestamp = (sec: number) => {
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = Math.floor(sec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };

    if (segment.isSlide) {
      return (
        <div
          onClick={() => onSegmentClick(segment.start)}
          className={`p-3 my-2 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
            isActive
              ? 'bg-amber-950/40 border-amber-500/80 text-amber-200'
              : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-1 text-amber-400 font-semibold">
            <span>🖼 [Слайд {formatTimestamp(segment.start)}]</span>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap">{segment.text}</pre>
        </div>
      );
    }

    return (
      <div
        onClick={() => onSegmentClick(segment.start)}
        className={`flex gap-3 p-2 rounded-md transition-colors cursor-pointer ${
          isActive
            ? 'bg-blue-600/20 text-white font-medium border-l-2 border-blue-500'
            : 'text-zinc-300 hover:bg-zinc-800/50'
        }`}
      >
        <span className="text-xs font-mono text-zinc-500 select-none pt-0.5">
          {formatTimestamp(segment.start)}
        </span>
        <p className="text-sm leading-relaxed flex-1">{segment.text}</p>
      </div>
    );
  }
);
