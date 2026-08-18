import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D, { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';
import { graphApi } from '../../api/graph';
import { GraphNode, GraphLink } from '../../types/graph';
import { GraphSidebarFilters } from './GraphSidebarFilters';
import { NodeInspector } from './NodeInspector';
import { LinkInspector } from './LinkInspector';

interface KnowledgeGraphViewProps {
  onSelectSource?: (sourceId: string) => void;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ onSelectSource }) => {
  const fgRef = useRef<ForceGraphMethods>();
  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<GraphLink>());
  
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth - 256, height: window.innerHeight }); 
  
  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [showDecisions, setShowDecisions] = useState(true);

  useEffect(() => {
    const handleHighlightEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const nodeIds = customEvent.detail?.nodeIds as string[];
      if (nodeIds && nodeIds.length > 0) {
        setHighlightNodes(new Set(nodeIds));
        setHighlightLinks(new Set());
      } else {
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
      }
    };
    window.addEventListener('highlightGraphNodes', handleHighlightEvent);
    return () => window.removeEventListener('highlightGraphNodes', handleHighlightEvent);
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth - 256, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await graphApi.getGraphTopology(selectedCategory || undefined, 300, showSuperseded);
        setData(res);
        // Clear selection on data change
        setSelectedNode(null);
        setSelectedLink(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedCategory, showSuperseded]);
  
  const getNodeColor = useCallback((node: GraphNode) => {
    if (highlightNodes.size && !highlightNodes.has(node.id)) {
      return 'rgba(200, 200, 200, 0.2)'; 
    }
    
    if (node.id === hoverNode?.id || node.id === selectedNode?.id) {
      return '#3b82f6'; 
    }
    
    if (node.group === 'entity') return '#8b5cf6';
    if (node.group === 'decision') return '#f43f5e';
    if (node.is_active === false) return '#94a3b8'; // superseded
    
    switch (node.category) {
      case 'programming': return '#10b981'; 
      case 'sport': return '#f59e0b'; 
      case 'study': return '#3b82f6'; 
      default: return '#64748b'; 
    }
  }, [highlightNodes, hoverNode, selectedNode]);

  const updateHighlight = useCallback((node: GraphNode | null) => {
    if (!node) {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }
    
    const newHighlightNodes = new Set<string>();
    const newHighlightLinks = new Set<GraphLink>();
    
    newHighlightNodes.add(node.id);
    
    data.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      
      if (sourceId === node.id || targetId === node.id) {
        newHighlightLinks.add(link);
        newHighlightNodes.add(sourceId === node.id ? targetId : sourceId);
      }
    });
    
    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
  }, [data]);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNode(node);
    if (!selectedNode) {
      updateHighlight(node);
    }
  }, [selectedNode, updateHighlight]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setSelectedLink(null);
    updateHighlight(node);
    
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(4, 2000);
    }
  }, [updateHighlight]);

  const handleLinkClick = useCallback((link: GraphLink) => {
    setSelectedLink(link);
    setSelectedNode(null);
    
    const newHighlightNodes = new Set<string>();
    const newHighlightLinks = new Set<GraphLink>([link]);
    
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    newHighlightNodes.add(sourceId);
    newHighlightNodes.add(targetId);
    
    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
    
    if (fgRef.current) {
      const sourceNode = typeof link.source === 'object' ? link.source as any : null;
      const targetNode = typeof link.target === 'object' ? link.target as any : null;
      if (sourceNode && targetNode) {
        const cx = (sourceNode.x + targetNode.x) / 2;
        const cy = (sourceNode.y + targetNode.y) / 2;
        fgRef.current.centerAt(cx, cy, 1000);
        fgRef.current.zoom(4, 2000);
      }
    }
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedLink(null);
    updateHighlight(null);
  }, [updateHighlight]);

  const focusOnNode = useCallback((nodeId: string) => {
    const node = data.nodes.find(n => n.id === nodeId);
    if (node) {
      handleNodeClick(node);
    }
  }, [data.nodes, handleNodeClick]);

  if (loading && data.nodes.length === 0) return <div className="p-8 text-slate-400 flex items-center justify-center h-full">Loading graph topology...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  const filteredData = useMemo(() => {
    if (showDecisions) return data;
    return {
      nodes: data.nodes.filter(n => n.group !== 'decision'),
      links: data.links // decisions don't have links yet, but filter if they do
    };
  }, [data, showDecisions]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-50 dark:bg-slate-950 flex-1 flex">
      
      <GraphSidebarFilters 
        nodes={data.nodes}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        showSuperseded={showSuperseded}
        onToggleSuperseded={() => setShowSuperseded(!showSuperseded)}
        showDecisions={showDecisions}
        onToggleDecisions={() => setShowDecisions(!showDecisions)}
      />
      
      <ForceGraph2D
        ref={fgRef}
        width={windowSize.width}
        height={windowSize.height}
        graphData={filteredData}
        nodeColor={getNodeColor as any}
        nodeVal="val"
        nodeLabel={(n: any) => `<div class="bg-slate-800 text-white p-2 rounded text-xs shadow-lg max-w-xs break-words whitespace-pre-wrap">${n.label}</div>`}
        linkColor={(link: any) => highlightLinks.has(link) ? (link.color || '#94a3b8') : 'rgba(200, 200, 200, 0.2)'}
        linkWidth={(link: any) => highlightLinks.has(link) ? 2 : 1}
        linkDirectionalParticles={(link: any) => highlightLinks.has(link) ? 4 : 0}
        linkDirectionalParticleWidth={2}
        onNodeHover={handleNodeHover as any}
        onNodeClick={handleNodeClick as any}
        onLinkClick={handleLinkClick as any}
        onBackgroundClick={handleBackgroundClick}
        cooldownTicks={100}
        onEngineStop={() => {
          if (fgRef.current && !selectedNode && !selectedLink) {
            fgRef.current.zoomToFit(400, 50);
          }
        }}
        backgroundColor="transparent"
      />

      {selectedNode && (
        <NodeInspector 
          node={selectedNode} 
          links={data.links} 
          onClose={() => {
            setSelectedNode(null);
            updateHighlight(null);
          }} 
          onSelectNode={focusOnNode}
          onViewSource={onSelectSource}
        />
      )}

      {selectedLink && (
        <LinkInspector 
          link={selectedLink}
          onClose={() => {
            setSelectedLink(null);
            updateHighlight(null);
          }}
          onSelectNode={focusOnNode}
        />
      )}

      {(highlightNodes.size > 0 || selectedNode !== null) && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => {
              setHighlightNodes(new Set());
              setHighlightLinks(new Set());
              setSelectedNode(null);
              updateHighlight(null);
              if (fgRef.current) {
                fgRef.current.zoomToFit(400, 50);
              }
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-lg shadow-sm backdrop-blur transition-all flex items-center gap-1.5"
          >
            <span>✕</span> Сбросить фокус
          </button>
        </div>
      )}
    </div>
  );
};
