import React, { forwardRef } from 'react';
import { KnowledgeGraphView, KnowledgeGraphRef } from '../components/graph/KnowledgeGraphView';

export type { KnowledgeGraphRef };

interface GraphWorkspaceProps {
  focusNodeId?: string | null;
  semanticFilter?: 'all' | 'insights' | 'decisions';
  onSelectSource?: (sourceId: string) => void;
  onNavigateToChatWithContext?: (contextText: string) => void;
}

export const GraphWorkspace = forwardRef<KnowledgeGraphRef, GraphWorkspaceProps>(
  function GraphWorkspace({ focusNodeId, semanticFilter = 'all', onSelectSource, onNavigateToChatWithContext }, ref) {
    return (
      <div className="w-full h-full bg-transparent relative overflow-hidden">
        <KnowledgeGraphView
          ref={ref}
          focusNodeId={focusNodeId}
          semanticFilter={semanticFilter}
          onSelectSource={onSelectSource}
          onNavigateToChatWithContext={onNavigateToChatWithContext}
        />
      </div>
    );
  },
);