import React, { createContext, useContext, useState, useCallback } from 'react';

interface ActiveAudioContextType {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

const ActiveAudioContext = createContext<ActiveAudioContextType | undefined>(undefined);

export const ActiveAudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <ActiveAudioContext.Provider value={{ activeId, setActiveId }}>
      {children}
    </ActiveAudioContext.Provider>
  );
};

export const useActiveAudio = (id?: string) => {
  const context = useContext(ActiveAudioContext);
  if (!context) {
    throw new Error('useActiveAudio must be used within an ActiveAudioProvider');
  }

  const { activeId, setActiveId } = context;
  const isPlaying = id ? activeId === id : false;

  const requestPlay = useCallback(() => {
    if (id) setActiveId(id);
  }, [id, setActiveId]);

  const requestStop = useCallback(() => {
    setActiveId(null);
  }, [setActiveId]);

  return {
    isPlaying,
    requestPlay,
    requestStop,
    activeId,
  };
};
