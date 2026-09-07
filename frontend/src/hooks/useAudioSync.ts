import { useRef, useCallback, useEffect } from 'react';

export interface AudioSyncController {
  audioRef: React.RefObject<HTMLAudioElement | HTMLVideoElement>;
  seekTo: (seconds: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  subscribeTime: (callback: (currentTime: number) => void) => () => void;
  getCurrentTime: () => number;
}

export function useAudioSync(): AudioSyncController {
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const subscribersRef = useRef<Set<(time: number) => void>>(new Set());

  const subscribeTime = useCallback((callback: (time: number) => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = Math.max(0, seconds);
    }
  }, []);

  const play = useCallback(async () => {
    if (mediaRef.current) {
      await mediaRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.pause();
    }
  }, []);

  const getCurrentTime = useCallback(() => {
    return mediaRef.current?.currentTime ?? 0;
  }, []);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const notify = () => {
      const time = el.currentTime;
      subscribersRef.current.forEach((cb) => cb(time));
    };

    const handleTimeUpdate = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          notify();
          rafId = null;
        });
      }
    };

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('seeked', notify);

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('seeked', notify);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return {
    audioRef: mediaRef as React.RefObject<HTMLAudioElement | HTMLVideoElement>,
    seekTo,
    play,
    pause,
    subscribeTime,
    getCurrentTime,
  };
}
