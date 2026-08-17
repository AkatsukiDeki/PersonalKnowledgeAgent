import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import ForceGraph2D, { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';
import { graphApi, GraphNode, GraphData, GraphLink } from '../api/graph';
import { Loader2, Info, Check, X, Filter } from 'lucide-react';

const EDGE_COLORS: Record<string, string> = {
  'SUPERSEDES': '#ef4444',     // red
  'CONTRADICTS': '#f43f5e',    // rose
  'DEPENDS_ON': '#eab308',     // yellow
  'USED_IN': '#22c55e',        // green
  'APPLIES_TO': '#06b6d4',     // cyan
  'SUPPORTS': '#14b8a6',       // teal
  'MENTIONS': '#64748b'        // slate
};

export function GraphWorkspace() {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [minMemoryScore, setMinMemoryScore] = useState<number>(0);
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Record<string, boolean>>({
    'SUPERSEDES': true,
    'CONTRADICTS': true,
    'DEPENDS_ON': true,
    'USED_IN': true,
    'APPLIES_TO': true,
    'SUPPORTS': true,
    'MENTIONS': false // Hide by default to reduce noise
  });
  
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await graphApi.getGraphData(500);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    const validNodes = new Set<string>();
    
    // Filter nodes by memory_score
    const nodes = data.nodes.filter(n => {
      if (n.group === 'entity') return true; // Keep all entities
      const score = n.memory_score ?? 0;
      return score >= minMemoryScore;
    });
    
    nodes.forEach(n => validNodes.add(n.id));

    // Filter links by edge type and valid nodes
    const links = data.links.filter(l => {
      const edgeType = l.type.toUpperCase();
      if (!visibleEdgeTypes[edgeType] && edgeType in visibleEdgeTypes) return false;
      
      const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return validNodes.has(sourceId) && validNodes.has(targetId);
    });

    return { nodes, links };
  }, [data, minMemoryScore, visibleEdgeTypes]);

  const toggleEdgeType = (type: string) => {
    setVisibleEdgeTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleNodeClick = useCallback((node: NodeObject) => {
    setSelectedNode(node as GraphNode);
  }, []);

  // Selected node neighbors
  const selectedNeighbors = useMemo(() => {
    if (!selectedNode) return [];
    
    return filteredData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return sourceId === selectedNode.id || targetId === selectedNode.id;
    }).map(l => {
      const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      const otherId = sourceId === selectedNode.id ? targetId : sourceId;
      const otherNode = filteredData.nodes.find(n => n.id === otherId);
      
      return {
        node: otherNode,
        type: l.type,
        direction: sourceId === selectedNode.id ? 'out' : 'in'
      };
    }).filter(n => !!n.node);
  }, [selectedNode, filteredData.links, filteredData.nodes]);


  return (
    <div className="h-full flex bg-zinc-950 overflow-hidden">
      
      {/* Graph Area */}
      <div className="flex-1 relative flex flex-col" ref={containerRef}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20">
            <Loader2 className="animate-spin text-emerald-400 w-8 h-8" />
          </div>
        ) : null}
        
        {/* Top Controls Overlay */}
        <div className="absolute top-4 left-4 z-10 bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl shadow-xl backdrop-blur-sm max-w-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Фильтры Графа</h3>
          </div>
          
          <div className="mb-4">
            <label className="text-xs font-medium text-zinc-400 mb-2 flex justify-between">
              <span>Минимальный Memory Score</span>
              <span className="text-emerald-400">{minMemoryScore.toFixed(2)}</span>
            </label>
            <input 
              type="range" 
              min="0" max="1" step="0.05"
              value={minMemoryScore}
              onChange={(e) => setMinMemoryScore(parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Отображаемые связи</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(EDGE_COLORS).map(type => {
                const isActive = visibleEdgeTypes[type];
                return (
                  <button
                    key={type}
                    onClick={() => toggleEdgeType(type)}
                    className={`text-[10px] px-2 py-1 rounded-md font-bold transition-colors border ${
                      isActive 
                        ? 'bg-zinc-800 text-zinc-100' 
                        : 'bg-zinc-900/50 text-zinc-500 border-zinc-800 hover:bg-zinc-800'
                    }`}
                    style={{ borderColor: isActive ? EDGE_COLORS[type] : undefined }}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={filteredData}
          nodeLabel={(n: any) => n.label}
          nodeColor={(n: any) => {
            if (n.group === 'entity') return '#8b5cf6'; // Violet for entities
            if (n.kind === 'decision') return '#f59e0b'; // Amber
            if (n.kind === 'fact') return '#3b82f6'; // Blue
            if (n.kind === 'habit') return '#10b981'; // Emerald
            return '#a1a1aa'; // default
          }}
          nodeVal={(n: any) => n.val}
          linkColor={(l: any) => {
            return EDGE_COLORS[l.type?.toUpperCase()] || '#52525b';
          }}
          linkLineDash={(l: any) => {
             const t = l.type?.toUpperCase();
             return (t === 'SUPERSEDES' || t === 'CONTRADICTS') ? [4, 4] : null;
          }}
          linkWidth={1.5}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          onNodeClick={handleNodeClick}
          backgroundColor="#09090b" // zinc-950
        />
      </div>

      {/* Sidebar Inspector */}
      {selectedNode && (
        <div className="w-80 border-l border-zinc-800 bg-zinc-900 flex flex-col h-full overflow-hidden shrink-0 shadow-2xl z-20">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-start bg-zinc-800/20">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] uppercase font-bold text-zinc-300 border border-zinc-700">
                  {selectedNode.group}
                </span>
                {selectedNode.kind && (
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] uppercase font-bold text-zinc-400 border border-zinc-700">
                    {selectedNode.kind}
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-zinc-100 text-sm mt-2">{selectedNode.label}</h3>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-zinc-500 hover:text-zinc-300 bg-zinc-800 rounded p-1">
              <X size={16} />
            </button>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            {selectedNode.group === 'claim' && (
              <div className="mb-6 space-y-3">
                <div className="flex justify-between items-center bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                  <span className="text-xs text-zinc-400">Memory Score</span>
                  <span className="text-sm font-mono text-emerald-400 font-bold">
                    {(selectedNode.memory_score ?? 0).toFixed(2)}
                  </span>
                </div>
                {selectedNode.domain && (
                  <div className="flex justify-between items-center bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                    <span className="text-xs text-zinc-400">Domain</span>
                    <span className="text-xs uppercase tracking-wider font-bold text-zinc-300">
                      {selectedNode.domain}
                    </span>
                  </div>
                )}
                {selectedNode.is_active === false && (
                  <div className="p-2 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-xs font-medium flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    Это решение было заменено и больше не является актуальным.
                  </div>
                )}
              </div>
            )}
            
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Связи ({selectedNeighbors.length})</h4>
            <div className="space-y-2">
              {selectedNeighbors.map((n, i) => (
                <div key={i} className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm cursor-pointer hover:border-zinc-700 transition-colors" onClick={() => n.node && handleNodeClick(n.node)}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border`}
                          style={{ borderColor: EDGE_COLORS[n.type] || '#52525b', color: EDGE_COLORS[n.type] || '#a1a1aa', backgroundColor: `${EDGE_COLORS[n.type]}15` }}>
                      {n.direction === 'out' ? '→ ' : '← '}{n.type}
                    </span>
                  </div>
                  <p className="text-zinc-300 text-xs line-clamp-3">{n.node?.label}</p>
                </div>
              ))}
              {selectedNeighbors.length === 0 && (
                <div className="text-zinc-500 text-xs italic text-center p-4">Нет отображаемых связей</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
