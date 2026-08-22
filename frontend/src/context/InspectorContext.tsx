import React, { createContext, useContext, useState, ReactNode } from 'react';

export type InspectableType = 'subject' | 'source' | 'claim' | 'pattern' | 'timeline_event';

export interface InspectableEntity {
  id: string;
  type: InspectableType;
  title: string;
  subtitle?: string;
  summary?: string;
  meta?: Record<string, any>;
  parentSubject?: { id: string; title: string };
  provenanceSource?: { id: string; title: string };
  // Колбэки действий (без жесткой привязки к страницам)
  onOpenSubject?: (subjectId: string) => void;
  onOpenSource?: (sourceId: string) => void;
  onAskTutor?: (subjectId: string, contextPrompt?: string) => void;
  onViewTimeline?: (eventId?: string) => void;
}

interface InspectorContextType {
  activeEntity: InspectableEntity | null;
  isOpen: boolean;
  inspectEntity: (entity: InspectableEntity) => void;
  closeInspector: () => void;
}

const InspectorContext = createContext<InspectorContextType | undefined>(undefined);

export const InspectorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeEntity, setActiveEntity] = useState<InspectableEntity | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const inspectEntity = (entity: InspectableEntity) => {
    setActiveEntity(entity);
    setIsOpen(true);
  };

  const closeInspector = () => {
    setIsOpen(false);
  };

  return (
    <InspectorContext.Provider value={{ activeEntity, isOpen, inspectEntity, closeInspector }}>
      {children}
    </InspectorContext.Provider>
  );
};

export const useInspector = () => {
  const ctx = useContext(InspectorContext);
  if (!ctx) {
    throw new Error('useInspector must be used within InspectorProvider');
  }
  return ctx;
};
