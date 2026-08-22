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
import { claimsApi } from '../../api/claims';
import { GraphNode, GraphLink } from '../../types/graph';
import { GraphSidebarFilters } from './GraphSidebarFilters';
import { LinkInspector } from './LinkInspector';
import { useInspector } from '../../context/InspectorContext';
import { endpointId, isPositionedNode, resolveGraphNode } from './graphEndpoints';
import { ENTITY_TOKENS, resolveEntityGroup } from '../../utils/entityTokens';

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

function getNodeConfig(node: GraphNode) {
  const groupKey = resolveEntityGroup(node);
  const config = ENTITY_TOKENS[groupKey] ?? ENTITY_TOKENS.claim;
  
  if (node.is_active === false && groupKey === 'claim') {
    return { ...config, hex: '#475569', glowRgb: '71, 85, 105', pulseFreq: 0 };
  }
  
  return { ...config, color: config.hex }; // Ensure color maps to hex for canvas usage if needed
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
  semanticFilter?: 'all' | 'insights' | 'decisions';
  onSelectSource?: (sourceId: string) => void;
  onNavigateToChatWithContext?: (contextText: string) => void;
}

export const KnowledgeGraphView = forwardRef<KnowledgeGraphRef, KnowledgeGraphViewProps>(({
  focusNodeId,
  semanticFilter = 'all',
  onSelectSource,
  onNavigateToChatWithContext,
}, ref) => {
  const { inspectEntity } = useInspector();
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

  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 800,
    height: typeof window !== 'undefined' ? window.innerHeight : 600,
  }));
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [showDecisions, setShowDecisions] = useState(true);

  const starsRef = useRef<Star[]>(generateStars(STAR_BOUNDS, STAR_COUNT));
  const phaseRef = useRef(0);
  const pendingFocusRef = useRef<FocusRequest | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const hasAutoFitRef = useRef(false);

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

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setWindowSize({ width, height });
        }
      }
    });
    
    observer.observe(container);
    return () => observer.disconnect();
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

  const applyFocus = useCallback((target: GraphNode, zoomLevel?: number, duration = 1200) => {
    setSelectedNode(target);
    setSelectedLink(null);
    updateHighlight(target);
    if (fgRef.current && isPositionedNode(target)) {
      const isMajor = isMassiveNode(target);
      const targetZoom = zoomLevel ?? (isMajor ? 1.2 : 2.0);
      fgRef.current.centerAt(target.x ?? 0, target.y ?? 0, duration);
      fgRef.current.zoom(targetZoom, duration);
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
    applyFocus(node);
    
    // Open Entity Inspector
    if (node.group === 'claim' || node.kind === 'claim') {
      inspectEntity({
        id: node.id,
        type: 'claim',
        title: node.label || 'Утверждение',
        summary: node.content || node.label,
        provenanceSource: node.source_id ? { id: node.source_id, title: 'Источник' } : undefined,
        parentSubject: node.subject_id ? { id: node.subject_id, title: 'Предмет' } : undefined,
        onOpenSource: onSelectSource ? (sourceTitle) => {
           if (node.source_id) onSelectSource(node.source_id);
        } : undefined,
        onAskTutor: onNavigateToChatWithContext ? (subjectId, prompt) => {
           onNavigateToChatWithContext(prompt || node.label);
        } : undefined,
      });
    } else if (node.group === 'source' || node.kind === 'source') {
      inspectEntity({
        id: node.id,
        type: 'source',
        title: node.label || 'Документ',
        summary: `Файл: ${node.label}. Тип: ${node.group || 'источник'}.`,
        onOpenSource: onSelectSource ? () => {
          onSelectSource(node.id);
        } : undefined,
      });
    } else if (node.group === 'decision' || node.kind === 'decision') {
      inspectEntity({
        id: node.id,
        type: 'pattern', // Using pattern for decisions in inspector for now
        title: node.label || 'Решение',
        summary: node.content || node.label,
      });
    } else {
      inspectEntity({
        id: node.id,
        type: 'subject',
        title: node.label || 'Сущность',
        summary: node.content || node.label,
      });
    }
  }, [applyFocus, inspectEntity, onSelectSource, onNavigateToChatWithContext]);

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

  const handleUpdateStatus = useCallback(async (nodeId: string, isActive: boolean) => {
    // Optimistic UI update
    setData((prev) => {
      const nodes = prev.nodes.map(n => n.id === nodeId ? { ...n, is_active: isActive } : n);
      return { ...prev, nodes };
    });
    // Find node and update selected
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, is_active: isActive } : prev);

    try {
      await claimsApi.update(nodeId, { is_active: isActive });
    } catch (err) {
      console.error("Failed to update status", err);
      // Revert optimistic update
      setData((prev) => {
        const nodes = prev.nodes.map(n => n.id === nodeId ? { ...n, is_active: !isActive } : n);
        return { ...prev, nodes };
      });
      setSelectedNode(prev => prev?.id === nodeId ? { ...prev, is_active: !isActive } : prev);
      alert('Ошибка при смене статуса');
    }
  }, []);

  const resetView = useCallback(() => {
    pendingFocusRef.current = null;
    setSelectedNode(null);
    setSelectedLink(null);
    updateHighlight(null);
    if (fgRef.current) {
      fgRef.current.zoomToFit(600, 80);
    }
  }, [updateHighlight]);

  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;
    
    fg.d3Force('charge', forceManyBody().strength(chargeForNode));
    fg.d3Force('collide', forceCollide().radius((node: any) => {
      if (!isGraphNode(node)) return 8;
      const config = getNodeConfig(node);
      return config.radius + 5;
    }));
    
    const cx = windowSize.width / 2;
    const cy = windowSize.height / 2;
    const spreadX = Math.min(windowSize.width, windowSize.height) * 0.22;
    const spreadY = Math.min(windowSize.width, windowSize.height) * 0.18;
    
    fg.d3Force('center', forceCenter(cx, cy));
    
    fg.d3Force('x', forceX().strength(0.06).x((node: any) => {
      if (!isGraphNode(node)) return cx;
      return domainAnchor(node, cx, cy, spreadX, spreadY).x;
    }));
    
    fg.d3Force('y', forceY().strength(0.06).y((node: any) => {
      if (!isGraphNode(node)) return cy;
      return domainAnchor(node, cx, cy, spreadX, spreadY).y;
    }));
    
    fg.d3ReheatSimulation();
  }, [filteredData, windowSize]);

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
    const phase = phaseRef.current;

    ctx.save();
    ctx.fillStyle = '#06070B';
    ctx.fillRect(-STAR_BOUNDS - 1000, -STAR_BOUNDS - 1000, (STAR_BOUNDS + 1000) * 2, (STAR_BOUNDS + 1000) * 2);

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
    
    const isMajor = isMassiveNode(node);
    if (semanticFilter === 'insights' && node.group !== 'insight' && node.kind !== 'insight') return;
    if (semanticFilter === 'decisions' && node.group !== 'decision' && node.kind !== 'decision') return;

    // Semantic Zoom: Hide 'claim' and 'source' at macro level
    if (globalScale < 0.8 && (node.group === 'claim' || node.group === 'source' || config.radius <= 3.5)) {
      return;
    }

    const hasFocus = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoverNode?.id === node.id;

    // Dimming non-neighbors more aggressively when there is an active selection
    const hasActiveSelection = highlightNodes.size > 0;
    const baseAlpha = hasFocus ? 1 : (hasActiveSelection ? 0.03 : 0.08);
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const phase = phaseRef.current;
    
    // Enhanced pulse logic for orbital glow
    const pulseFreq = config.pulseFreq * (isSelected ? 1.5 : 1);
    const phaseShift = (hashString(node.id) % 100) / 10;
    const pulse = pulseFreq > 0
      ? Math.sin(phase * pulseFreq * Math.PI + phaseShift) * 0.5 + 0.5
      : 0;

    const baseRadius = config.radius / Math.max(globalScale * 0.28, 1);
    const visualRadius = isSelected || isHovered ? baseRadius * 1.25 : baseRadius;

    ctx.save();
    ctx.globalAlpha = baseAlpha;

    if (hasFocus) {
      const auraMultiplier = isSelected ? 3.5 : isHovered ? 2.5 : (hasActiveSelection ? 1.8 : 1.4);
      const auraRadius = visualRadius * (auraMultiplier + pulse * 0.6);

      const auraGradient = ctx.createRadialGradient(x, y, visualRadius * 0.5, x, y, auraRadius);
      const innerOpacity = isSelected ? 0.55 : isHovered ? 0.45 : 0.22 + pulse * 0.15;
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

    // Semantic Zoom: Text labels only on medium/micro zoom
    if (globalScale >= 0.9 && hasFocus) {
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

    // Apply semantic filter to links
    if (semanticFilter === 'insights' && ((sn.group !== 'insight' && sn.kind !== 'insight') || (tn.group !== 'insight' && tn.kind !== 'insight'))) return;
    if (semanticFilter === 'decisions' && ((sn.group !== 'decision' && sn.kind !== 'decision') || (tn.group !== 'decision' && tn.kind !== 'decision'))) return;

    // Semantic Zoom for links
    if (globalScale < 0.8 && !isHL) {
       const snConfig = getNodeConfig(sn);
       const tnConfig = getNodeConfig(tn);
       // Hide links to small nodes at macro level
       if (snConfig.radius <= 3.5 || tnConfig.radius <= 3.5) return;
    }

    ctx.save();
    const hasActiveSelection = highlightLinks.size > 0;
    ctx.globalAlpha = isHL ? 0.85 : hasActiveSelection ? 0.02 : 0.12;

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
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#06070B] flex-1 flex">
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
            fgRef.current.zoomToFit(400, 60);
          }
        }}
        backgroundColor="transparent"
      />

      {/* MemoryInspector is now replaced by the global EntityInspector */}

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
