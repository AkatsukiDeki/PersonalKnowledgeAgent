import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import ForceGraph2D, { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';
import { forceCenter, forceCollide, forceManyBody, forceX, forceY, SimulationNodeDatum } from 'd3-force';
import { graphApi } from '../../api/graph';
import { GraphNode, GraphLink } from '../../types/graph';
import { GraphSidebarFilters } from './GraphSidebarFilters';
import { MemoryInspector } from './MemoryInspector';
import { LinkInspector } from './LinkInspector';
import { endpointId, isPositionedNode, resolveGraphNode } from './graphEndpoints';

export interface KnowledgeGraphRef {
  focusNode: (nodeId: string, zoomLevel?: number) => void;
  resetView: () => void;
}

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  driftSpeedX: number;
  driftSpeedY: number;
  phase: number;
}

interface EntityVisualMeta {
  color: string;
  glowRgb: string;
  radius: number;
  pulseFreq: number;
}

interface FocusRequest {
  nodeId: string;
  zoomLevel: number;
}

type GraphHandle = ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>>;

const STAR_BOUNDS = 5000;
const STAR_COUNT = 640;
const FRAME_MS = 1000 / 24;
const SPACE_VOID = '#0a0b10';
const LINK_GLOW = 'rgba(56, 189, 248, 0.25)';
const LINK_CORE = 'rgba(186, 230, 253, 0.55)';

const ENTITY_CONFIG: Record<string, EntityVisualMeta> = {
  insight:  { color: '#f59e0b', glowRgb: '245, 158, 11',  radius: 9, pulseFreq: 1.8 },
  decision: { color: '#a855f7', glowRgb: '168, 85, 247',  radius: 7, pulseFreq: 1.2 },
  entity:   { color: '#a855f7', glowRgb: '168, 85, 247',  radius: 5.5, pulseFreq: 1.0 },
  claim:    { color: '#38bdf8', glowRgb: '56, 189, 248',  radius: 3.5, pulseFreq: 0.9 },
  source:   { color: '#64748B', glowRgb: '100, 116, 139', radius: 3, pulseFreq: 0.5 },
  conflict: { color: '#EF4444', glowRgb: '239, 68, 68',   radius: 5, pulseFreq: 2.5 },
};

interface D3LinkForce {
  distance: (value: number) => D3LinkForce;
  strength: (value: number) => D3LinkForce;
}

function isGraphNode(value: unknown): value is GraphNode {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.id === 'string' && typeof rec.label === 'string' && typeof rec.group === 'string';
}

function isGraphLink(value: unknown): value is GraphLink {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return 'source' in rec && 'target' in rec && typeof rec.type === 'string';
}

function canvasEndpoint(end: GraphLink['source'] | GraphLink['target']): GraphNode | null {
  if (!isGraphNode(end)) return null;
  if (typeof end.x !== 'number' || typeof end.y !== 'number') return null;
  return end;
}

function isD3LinkForce(force: unknown): force is D3LinkForce {
  if (typeof force !== 'object' || force === null) return false;
  const rec = force as Record<string, unknown>;
  return typeof rec.distance === 'function' && typeof rec.strength === 'function';
}

function isMassiveNode(node: GraphNode): boolean {
  return node.group === 'insight' || node.kind === 'insight'
    || node.group === 'decision' || node.kind === 'decision';
}

function chargeForNode(node: SimulationNodeDatum): number {
  if (!isGraphNode(node)) return -30;
  if (isMassiveNode(node)) return -120;
  if (node.group === 'entity') return -70;
  return -30;
}

function constellationKey(node: GraphNode): string {
  const raw = (node.domain || node.category || 'general').trim().toLowerCase();
  return raw.length > 0 ? raw : 'general';
}

function normalizeArm(key: string): string {
  if (/^(programming|code|software|engineering|dev|tech|backend|frontend|python|javascript|infra)$/.test(key)) {
    return 'programming';
  }
  if (/^(work|career|job|office|project|business|team|product)$/.test(key)) {
    return 'work';
  }
  if (/^(general|unknown|personal|misc|other)$/.test(key)) {
    return 'general';
  }
  return key;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function domainAnchor(
  node: GraphNode,
  cx: number,
  cy: number,
  spreadX: number,
  spreadY: number,
): { x: number; y: number } {
  const arm = normalizeArm(constellationKey(node));
  let x = cx;
  let y = cy;

  if (arm === 'programming') {
    x = cx - spreadX;
    y = cy - spreadY;
  } else if (arm === 'work') {
    x = cx + spreadX;
    y = cy + spreadY * 0.08;
  } else if (arm === 'general') {
    x = cx;
    y = cy;
  } else {
    const seed = hashString(arm);
    const angle = (seed % 6283) / 1000;
    const dist = Math.max(spreadX, spreadY) * (0.52 + (seed % 45) / 120);
    x = cx + Math.cos(angle) * dist;
    y = cy + Math.sin(angle) * dist;
  }

  const jitter = hashString(node.id);
  x += ((jitter % 97) - 48) * 1.6;
  y += (((jitter >> 8) % 97) - 48) * 1.6;
  return { x, y };
}

function screenRadius(node: GraphNode, globalScale: number): number {
  const config = getNodeConfig(node);
  return config.radius / Math.max(globalScale, 0.08);
}

function getNodeConfig(node: GraphNode): EntityVisualMeta {
  if (node.group === 'decision' || node.kind === 'decision') return ENTITY_CONFIG.decision;
  if (node.group === 'entity') return ENTITY_CONFIG.entity;
  if (node.group === 'insight' || node.kind === 'insight') return ENTITY_CONFIG.insight;
  if (node.group === 'claim') {
    if (node.is_active === false) {
      return { color: '#475569', glowRgb: '71, 85, 105', radius: 3, pulseFreq: 0 };
    }
    return ENTITY_CONFIG.claim;
  }
  return ENTITY_CONFIG.source;
}

function generateStars(bounds: number, count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: (Math.random() - 0.5) * bounds * 2,
      y: (Math.random() - 0.5) * bounds * 2,
      r: Math.random() * 1.0 + 0.5,
      baseAlpha: Math.random() * 0.55 + 0.28,
      twinkleSpeed: Math.random() * 2.4 + 0.4,
      driftSpeedX: (Math.random() - 0.5) * 10,
      driftSpeedY: (Math.random() - 0.5) * 10,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return stars;
}

function wrapCoord(value: number, bounds: number): number {
  const span = bounds * 2;
  let next = value;
  if (next > bounds) next -= span;
  if (next < -bounds) next += span;
  return next;
}

interface KnowledgeGraphViewProps {
  focusNodeId?: string | null;
  onSelectSource?: (sourceId: string) => void;
  onNavigateToChatWithContext?: (contextText: string) => void;
}

export const KnowledgeGraphView = forwardRef<KnowledgeGraphRef, KnowledgeGraphViewProps>(({
  focusNodeId,
  onSelectSource,
  onNavigateToChatWithContext,
}, ref) => {
  const fgRef = useRef<GraphHandle | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);

  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<GraphLink>>(new Set());

  const [windowSize, setWindowSize] = useState({ width: 800, height: 600 });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [showDecisions, setShowDecisions] = useState(true);

  const starsRef = useRef<Star[]>(generateStars(STAR_BOUNDS, STAR_COUNT));
  const phaseRef = useRef(0);
  const pendingFocusRef = useRef<FocusRequest | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const hasAutoFitRef = useRef(false);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setWindowSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('center', forceCenter(windowSize.width / 2, windowSize.height / 2));
      fgRef.current.centerAt(windowSize.width / 2, windowSize.height / 2, 0);
    }
  }, [windowSize.width, windowSize.height]);

  useEffect(() => {
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (document.hidden) return;
      const elapsed = now - lastFrameRef.current;
      if (elapsed < FRAME_MS) return;
      const dt = Math.min(elapsed, 80) / 1000;
      lastFrameRef.current = now;
      phaseRef.current += dt;

      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.x = wrapCoord(star.x + star.driftSpeedX * dt, STAR_BOUNDS);
        star.y = wrapCoord(star.y + star.driftSpeedY * dt, STAR_BOUNDS);
      }

      fgRef.current?.resumeAnimation();
    };

    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await graphApi.getGraphTopology(selectedCategory || undefined, 350, showSuperseded);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch graph data');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, showSuperseded]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateHighlight = useCallback((node: GraphNode | null) => {
    if (!node) {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }
    const nodes = new Set<string>([node.id]);
    const links = new Set<GraphLink>();

    data.links.forEach((link) => {
      const sId = endpointId(link.source);
      const tId = endpointId(link.target);
      if (sId === node.id || tId === node.id) {
        links.add(link);
        nodes.add(sId === node.id ? tId : sId);
      }
    });

    setHighlightNodes(nodes);
    setHighlightLinks(links);
  }, [data.links]);

  const applyFocus = useCallback((target: GraphNode, zoomLevel: number, duration = 1000) => {
    setSelectedNode(target);
    setSelectedLink(null);
    updateHighlight(target);
    if (fgRef.current && isPositionedNode(target)) {
      fgRef.current.centerAt(target.x ?? 0, target.y ?? 0, duration);
      fgRef.current.zoom(zoomLevel, duration);
      return true;
    }
    return false;
  }, [updateHighlight]);

  const attemptPendingFocus = useCallback(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const target = resolveGraphNode(data.nodes, pending.nodeId);
    if (!target) return;
    if (applyFocus(target, pending.zoomLevel)) {
      pendingFocusRef.current = null;
    }
  }, [applyFocus, data.nodes]);

  const queueFocus = useCallback((nodeId: string, zoomLevel = 3.5) => {
    pendingFocusRef.current = { nodeId, zoomLevel };
    attemptPendingFocus();
  }, [attemptPendingFocus]);

  useEffect(() => {
    if (focusNodeId) {
      queueFocus(focusNodeId);
    }
  }, [focusNodeId, queueFocus]);

  useEffect(() => {
    attemptPendingFocus();
  }, [attemptPendingFocus]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    pendingFocusRef.current = null;
    applyFocus(node, 3.5, 800);
  }, [applyFocus]);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNode(node);
    if (!selectedNode) {
      updateHighlight(node);
    }
  }, [selectedNode, updateHighlight]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedLink(null);
    updateHighlight(null);
  }, [updateHighlight]);

  const resetView = useCallback(() => {
    pendingFocusRef.current = null;
    setSelectedNode(null);
    setSelectedLink(null);
    updateHighlight(null);
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 40);
    }
  }, [updateHighlight]);

  useImperativeHandle(ref, () => ({
    focusNode: (nodeId: string, zoomLevel = 3.5) => {
      queueFocus(nodeId, zoomLevel);
    },
    resetView,
  }), [queueFocus, resetView]);

  useEffect(() => {
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (document.hidden) return;
      const elapsed = now - lastFrameRef.current;
      if (elapsed < FRAME_MS) return;
      const dt = Math.min(elapsed, 80) / 1000;
      lastFrameRef.current = now;
      phaseRef.current += dt;

      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.x = wrapCoord(star.x + star.driftSpeedX * dt, STAR_BOUNDS);
        star.y = wrapCoord(star.y + star.driftSpeedY * dt, STAR_BOUNDS);
      }

      fgRef.current?.resumeAnimation();
    };

    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    ctx.save();
    ctx.fillStyle = '#07080d';
    ctx.fillRect(-STAR_BOUNDS, -STAR_BOUNDS, STAR_BOUNDS * 2, STAR_BOUNDS * 2);

    const phase = phaseRef.current;

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
    gradient.addColorStop(0, 'rgba(30, 27, 75, 0.35)');
    gradient.addColorStop(1, 'rgba(10, 11, 16, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(-STAR_BOUNDS, -STAR_BOUNDS, STAR_BOUNDS * 2, STAR_BOUNDS * 2);

    const stars = starsRef.current;
    const radiusScale = 1 / Math.max(globalScale, 0.35);

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const alphaWave = Math.sin(phase * star.twinkleSpeed + star.phase);
      const dynamicAlpha = Math.max(0.04, Math.min(0.7, star.baseAlpha + alphaWave * 0.18));

      ctx.fillStyle = `rgba(255, 255, 255, ${dynamicAlpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, Math.max(0.2, star.r * radiusScale), 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
  }, []);

  const nodeCanvasObject = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!isGraphNode(node)) return;
    const config = getNodeConfig(node);
    const hasFocus = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoverNode?.id === node.id;

    const baseAlpha = hasFocus ? 1 : 0.08;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const phase = phaseRef.current;
    const pulse = config.pulseFreq > 0
      ? Math.sin(phase * config.pulseFreq * Math.PI) * 0.5 + 0.5
      : 0;

    const baseRadius = config.radius / Math.max(globalScale * 0.28, 1);
    const visualRadius = isSelected || isHovered ? baseRadius * 1.15 : baseRadius;

    ctx.save();
    ctx.globalAlpha = baseAlpha;

    if (hasFocus) {
      const auraMultiplier = isSelected ? 2.8 : isHovered ? 2.2 : 1.4;
      const auraRadius = visualRadius * (auraMultiplier + pulse * 0.4);

      const auraGradient = ctx.createRadialGradient(x, y, visualRadius * 0.5, x, y, auraRadius);
      const innerOpacity = isSelected ? 0.45 : isHovered ? 0.35 : 0.18 + pulse * 0.12;
      auraGradient.addColorStop(0, `rgba(${config.glowRgb}, ${innerOpacity})`);
      auraGradient.addColorStop(1, `rgba(${config.glowRgb}, 0)`);

      ctx.fillStyle = auraGradient;
      ctx.beginPath();
      ctx.arc(x, y, auraRadius, 0, 2 * Math.PI);
      ctx.fill();
    }

    const coreGrad = ctx.createRadialGradient(
      x - visualRadius * 0.25,
      y - visualRadius * 0.25,
      0,
      x,
      y,
      visualRadius,
    );
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.3, config.color);
    coreGrad.addColorStop(1, `rgba(${config.glowRgb}, 0.8)`);

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, visualRadius, 0, 2 * Math.PI);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6 / globalScale;
      ctx.stroke();
    }

    if (node.is_active === false) {
      ctx.setLineDash([2 / globalScale, 2 / globalScale]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 0.8 / globalScale;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (globalScale > 1.6 && hasFocus) {
      const label = node.label || '';
      const truncated = label.length > 32 ? `${label.slice(0, 32)}…` : label;
      const fontSize = Math.max(9 / globalScale, 2.2);

      ctx.font = `500 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = isSelected ? '#F8FAFC' : 'rgba(226, 232, 240, 0.75)';
      ctx.fillText(truncated, x, y + visualRadius + 2.5 / globalScale);
    }

    ctx.restore();
  }, [highlightNodes, selectedNode, hoverNode]);

  const linkCanvasObject = useCallback((link: LinkObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!isGraphLink(link)) return;
    const isHL = highlightLinks.has(link);
    const sn = canvasEndpoint(link.source);
    const tn = canvasEndpoint(link.target);
    if (!sn || !tn) return;

    ctx.save();
    const hasActiveSelection = highlightLinks.size > 0;
    ctx.globalAlpha = isHL ? 0.75 : hasActiveSelection ? 0.03 : 0.12;

    const relType = link.type.toLowerCase();
    const isConflict = relType === 'supersedes' || relType === 'contradicts';
    ctx.strokeStyle = isHL
      ? isConflict ? '#EF4444' : '#8B5CF6'
      : isConflict ? '#7F1D1D' : 'rgba(255, 255, 255, 0.2)';

    ctx.lineWidth = (isHL ? 1.4 : 0.4) / globalScale;

    if (isConflict) {
      ctx.setLineDash([3 / globalScale, 3 / globalScale]);
    }

    ctx.beginPath();
    ctx.moveTo(sn.x ?? 0, sn.y ?? 0);
    ctx.lineTo(tn.x ?? 0, tn.y ?? 0);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isHL) {
      const dx = (tn.x ?? 0) - (sn.x ?? 0);
      const dy = (tn.y ?? 0) - (sn.y ?? 0);
      const angle = Math.atan2(dy, dx);
      const len = 4.5 / globalScale;
      const mx = ((sn.x ?? 0) + (tn.x ?? 0)) / 2;
      const my = ((sn.y ?? 0) + (tn.y ?? 0)) / 2;

      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(mx + len * Math.cos(angle), my + len * Math.sin(angle));
      ctx.lineTo(mx + len * Math.cos(angle - 2.4), my + len * Math.sin(angle - 2.4));
      ctx.lineTo(mx + len * Math.cos(angle + 2.4), my + len * Math.sin(angle + 2.4));
      ctx.fill();
    }

    ctx.restore();
  }, [highlightLinks]);

  const filteredData = useMemo(() => {
    let nodes = data.nodes;
    if (!showDecisions) {
      nodes = nodes.filter((n) => n.group !== 'decision' && n.kind !== 'decision');
    }
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = data.links.filter((l) => {
      const sId = endpointId(l.source);
      const tId = endpointId(l.target);
      return nodeIds.has(sId) && nodeIds.has(tId);
    });

    return { nodes, links };
  }, [data, showDecisions]);

  if (loading && data.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#06070B]">
        <div className="text-center space-y-2">
          <div className="text-xl text-amber-400 animate-pulse">✦</div>
          <p className="text-zinc-500 text-xs">Инициализация нейрокосмоса…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-rose-400 text-sm">Ошибка топологии памяти: {error}</div>;
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[100vh] relative overflow-hidden bg-[#06070B] flex-1 flex">
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
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node, color, ctx) => {
          if (!isGraphNode(node)) return;
          const r = getNodeConfig(node).radius + 3;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkCanvasObject={linkCanvasObject}
        onNodeHover={(node) => handleNodeHover(isGraphNode(node) ? node : null)}
        onNodeClick={(node) => {
          if (isGraphNode(node)) handleNodeClick(node);
        }}
        onLinkClick={(link) => {
          if (!isGraphLink(link)) return;
          setSelectedLink(link);
          setSelectedNode(null);
        }}
        onBackgroundClick={handleBackgroundClick}
        onRenderFramePre={(ctx, globalScale) => paintBackground(ctx, globalScale)}
        cooldownTicks={90}
        onEngineStop={() => {
          attemptPendingFocus();
          if (fgRef.current && !selectedNode && !selectedLink && !pendingFocusRef.current) {
            fgRef.current.zoomToFit(400, 40);
          }
        }}
        backgroundColor="transparent"
      />

      {selectedNode && (
        <MemoryInspector
          node={selectedNode}
          links={data.links}
          allNodes={data.nodes}
          onClose={() => {
            setSelectedNode(null);
            updateHighlight(null);
          }}
          onSelectNode={(nodeId) => {
            const target = resolveGraphNode(data.nodes, nodeId);
            if (target) handleNodeClick(target);
          }}
          onViewSource={onSelectSource}
          onNavigateToChatWithContext={onNavigateToChatWithContext}
        />
      )}

      {selectedLink && (
        <LinkInspector
          link={selectedLink}
          onClose={() => {
            setSelectedLink(null);
            updateHighlight(null);
          }}
          onSelectNode={(nodeId) => {
            const target = resolveGraphNode(data.nodes, nodeId);
            if (target) handleNodeClick(target);
          }}
        />
      )}

      {(highlightNodes.size > 0 || selectedNode !== null) && (
        <div className="absolute top-4 right-4 z-40">
          <button
            onClick={resetView}
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-lg hover:bg-white/[0.08] transition-colors flex items-center gap-1.5 shadow-lg"
          >
            <span className="text-amber-400">✦</span> Сбросить фокус орбиты
          </button>
        </div>
      )}
    </div>
  );
});

KnowledgeGraphView.displayName = 'KnowledgeGraphView';
