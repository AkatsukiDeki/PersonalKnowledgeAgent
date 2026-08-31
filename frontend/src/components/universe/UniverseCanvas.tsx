import React, { useEffect, useRef, useState, useMemo } from 'react';
import { subjectsApi } from '../../api/subjects';
import { conversationsApi } from '../../api/conversations';
import { claimsApi, ClaimItem } from '../../api/claims';
import { useInspector } from '../../context/InspectorContext';
import { UniverseSpotlight, SearchableEntity } from './UniverseSpotlight';
import { UniverseDomainFilter } from './UniverseDomainFilter';
import { BridgeContextInspector } from './BridgeContextInspector';
import { GraphCopilotPanel } from './GraphCopilotPanel';
import { Sparkles, ZoomIn, ZoomOut, RotateCcw, Search, Clock, Orbit, Play, Pause, X } from 'lucide-react';

interface Moon {
  id: string;
  title: string;
  type: 'insight' | 'decision' | string;
  angle: number;
  dist: number;
  speed: number;
  color: string;
  timestamp: number;
  supersededAt?: number;
  supersededById?: string | null;
  isActive: boolean;
  domain?: string;
}

interface CausalEdge {
  fromId: string;
  toId: string;
  type: string;
}

interface Particle {
  edgeIndex: number;
  progress: number;
  speed: number;
  spawnDelay: number;
}

interface Planet {
  id: string;
  title: string;
  type: 'source' | 'conversation' | 'roadmap_node';
  orbitRadius: number;
  angle: number;
  speed: number;
  size: number;
  color: string;
  meta?: Record<string, any>;
  moons: Moon[];
  timestamp: number;
  timelineX?: number;
  timelineY?: number;
  renderX?: number;
  renderY?: number;
  domain?: string;
}

interface StarSystem {
  id: string;
  title: string;
  type: 'subject' | 'chat_folder' | 'root_core';
  localRadius: number;
  angle: number;
  driftSpeed: number;
  size: number;
  color: string;
  planets: Planet[];
  meta?: Record<string, any>;
  timestamp: number;
  timelineX?: number;
  timelineY?: number;
  renderX?: number;
  renderY?: number;
}

interface Constellation {
  id: string;
  title: string;
  color: string;
  orbitRadius: number;
  angle: number;
  driftSpeed: number;
  stars: StarSystem[];
  laneY: number;
  renderX?: number;
  renderY?: number;
}

interface UniverseCanvasProps {
  onOpenSubject?: (subjectId: string, tab?: 'roadmap' | 'sources' | 'tutor' | 'stats') => void;
  onOpenChat?: (conversationId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export const UniverseCanvas: React.FC<UniverseCanvasProps> = ({
  onOpenSubject,
  onOpenChat,
  onOpenSource,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { inspectEntity } = useInspector();

  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [rootStars, setRootStars] = useState<StarSystem[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'galaxy' | 'timeline'>('galaxy');
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });
  const [cutoffTimestamp, setCutoffTimestamp] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const activeStarIdRef = useRef<string | null>(null);

  const nodePositionsRef = useRef<Record<string, {x: number, y: number, color: string, alpha: number}>>({});
  const edgesRef = useRef<CausalEdge[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const [tracedNodeId, setTracedNodeId] = useState<string | null>(null);
  const [tracedNodesMap, setTracedNodesMap] = useState<Set<string>>(new Set());
  const traceZoomRef = useRef(false);

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [compareDomain, setCompareDomain] = useState<string | null>(null);
  const [copilotTarget, setCopilotTarget] = useState<{ id: string; label: string; group: string; type: 'node' | 'edge' } | null>(null);
  const [showBridges, setShowBridges] = useState(true);
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const domainZoomRef = useRef(false);
  const bridgeTargetsMapRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const bridgeTargets = new Set<string>();
    if (selectedDomain && showBridges) {
      const domainNodeIds = new Set<string>();
      
      constellations.forEach(c => c.stars.forEach(s => s.planets.forEach(p => {
        if (p.domain === selectedDomain) {
          domainNodeIds.add(p.id);
          p.moons.forEach(m => domainNodeIds.add(m.id));
        }
      })));
      rootStars.forEach(s => s.planets.forEach(p => {
        if (p.domain === selectedDomain) {
          domainNodeIds.add(p.id);
          p.moons.forEach(m => domainNodeIds.add(m.id));
        }
      }));

      edgesRef.current.forEach(edge => {
        const fromInDomain = domainNodeIds.has(edge.fromId);
        const toInDomain = domainNodeIds.has(edge.toId);
        
        if (fromInDomain && !toInDomain) {
          bridgeTargets.add(edge.toId);
        } else if (!fromInDomain && toInDomain) {
          bridgeTargets.add(edge.fromId);
        }
      });
    }
    bridgeTargetsMapRef.current = bridgeTargets;
  }, [selectedDomain, showBridges, constellations, rootStars]);

  useEffect(() => {
    if (!tracedNodeId) {
      setTracedNodesMap(new Set());
      traceZoomRef.current = false;
      return;
    }
    const nodes = new Set<string>([tracedNodeId]);
    const edges = edgesRef.current;
    const queue = [tracedNodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of edges) {
        if (e.fromId === cur && !nodes.has(e.toId)) {
          nodes.add(e.toId);
          queue.push(e.toId);
        }
        if (e.toId === cur && !nodes.has(e.fromId)) {
          nodes.add(e.fromId);
          queue.push(e.fromId);
        }
      }
    }
    setTracedNodesMap(nodes);
    traceZoomRef.current = true;
  }, [tracedNodeId]);

  const morphProgressRef = useRef(0);
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 0.55,
    targetX: 0,
    targetY: 0,
    targetZoom: 0.55,
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadUniverseData = async () => {
      try {
        setLoading(true);

        const [subjectsRes, conversationsRes, claimsRes] = await Promise.allSettled([
          subjectsApi.getSubjects(),
          conversationsApi.getConversations(),
          claimsApi.getClaims(),
        ]);

        const rawSubjects: any[] = subjectsRes.status === 'fulfilled' && Array.isArray(subjectsRes.value) ? subjectsRes.value : [];
        const conversations: any[] = conversationsRes.status === 'fulfilled' && Array.isArray(conversationsRes.value) ? conversationsRes.value : [];
        const rawClaims = claimsRes.status === 'fulfilled' ? claimsRes.value : [];
        const claims: ClaimItem[] = Array.isArray(rawClaims) ? rawClaims : (rawClaims as any)?.items || [];

        const subjects = await Promise.all(
          rawSubjects.map(async (sub) => {
            try {
              const fullDetails = await subjectsApi.getSubject(sub.id);
              return { ...sub, ...fullDetails };
            } catch {
              return sub;
            }
          })
        );

        // Расчет границ реального времени
        const timestamps: number[] = [];
        subjects.forEach((s) => { if (s.created_at) timestamps.push(new Date(s.created_at).getTime()); });
        conversations.forEach((c) => { if (c.created_at) timestamps.push(new Date(c.created_at).getTime()); });
        claims.forEach((cl) => { if (cl.created_at) timestamps.push(new Date(cl.created_at).getTime()); });

        const minTime = timestamps.length > 0 ? Math.min(...timestamps) : Date.now() - 30 * 24 * 60 * 60 * 1000;
        const maxTime = timestamps.length > 0 ? Math.max(...timestamps, Date.now()) : Date.now();

        const calcTimelineX = (ts: number) => {
          const normalized = (ts - minTime) / Math.max(maxTime - minTime, 1);
          return (normalized - 0.5) * 1400;
        };

        // 1. Группировка диалогов
        const folderMap: Record<string, any[]> = {};
        const rootChats: any[] = [];
        conversations.forEach((conv: any) => {
          if (conv.folder && typeof conv.folder === 'string' && conv.folder.trim() !== '') {
            if (!folderMap[conv.folder]) folderMap[conv.folder] = [];
            folderMap[conv.folder].push(conv);
          } else {
            rootChats.push(conv);
          }
        });

        // 2. Доменные кластеры предметов
        const clusterMap: Record<string, { title: string; color: string; subjects: any[] }> = {
          indigo: { title: 'ENGINEERING & ARCHITECTURE', color: '#6366f1', subjects: [] },
          emerald: { title: 'SECURITY & SYSTEMS', color: '#10b981', subjects: [] },
          amber: { title: 'DATA & ANALYTICS', color: '#f59e0b', subjects: [] },
          purple: { title: 'THEORY & PROTOCOLS', color: '#8b5cf6', subjects: [] },
        };

        const colorKeys = Object.keys(clusterMap);
        subjects.forEach((sub: any, idx: number) => {
          const themeKey = sub.color_theme || colorKeys[idx % colorKeys.length];
          if (!clusterMap[themeKey]) {
            clusterMap[themeKey] = { title: `${sub.title.toUpperCase()} DOMAIN`, color: '#3b82f6', subjects: [] };
          }
          clusterMap[themeKey].subjects.push(sub);
        });

        const newConstellations: Constellation[] = [];
        const extractedEdges: CausalEdge[] = [];
        const domainSet = new Set<string>();
        let cIdx = 0;
        const activeClusters = Object.entries(clusterMap).filter(([_, val]) => val.subjects.length > 0);

        for (const [key, cluster] of activeClusters) {
          const clusterAngle = (cIdx * (Math.PI * 2)) / Math.max(activeClusters.length, 1);
          const clusterDist = 550 + (cIdx % 2) * 120;
          const laneY = -220 + cIdx * 140;

          const stars: StarSystem[] = cluster.subjects.map((sub: any, sIdx: number) => {
            const subTs = sub.created_at ? new Date(sub.created_at).getTime() : minTime;
            const currentSources: any[] = sub.sources || [];
            const starTimelineX = calcTimelineX(subTs);

            const planets: Planet[] = currentSources.map((src: any, pIdx: number) => {
              const srcTs = src.created_at ? new Date(src.created_at).getTime() : subTs;
              extractedEdges.push({ fromId: String(src.id), toId: String(sub.id), type: 'source_to_subject' });
              
              if (src.domain) {
                 domainSet.add(src.domain);
              }

              return {
                id: String(src.id),
                title: src.title || 'Документ',
                type: 'source' as const,
                orbitRadius: 45 + pIdx * 25,
                angle: (pIdx * (Math.PI * 2)) / Math.max(currentSources.length, 1),
                speed: 0.003 + (pIdx % 3) * 0.001,
                size: 6,
                color: '#38bdf8',
                meta: { type: src.source_type || 'document', created_at: src.created_at, domain: src.domain },
                moons: [],
                timestamp: srcTs,
                timelineX: starTimelineX,
                timelineY: laneY - 35 - pIdx * 18,
                domain: src.domain,
              };
            });

            return {
              id: String(sub.id),
              title: sub.title,
              type: 'subject' as const,
              localRadius: 90 + sIdx * 50,
              angle: (sIdx * (Math.PI * 2)) / Math.max(cluster.subjects.length, 1),
              driftSpeed: 0.0008 + (sIdx % 2) * 0.0003,
              size: Math.max(20, Math.min(32, 20 + (sub.mastery_score || 0) / 6)),
              color: cluster.color,
              planets,
              timestamp: subTs,
              timelineX: starTimelineX,
              timelineY: laneY,
              meta: {
                mastery: sub.mastery_score || 0,
                sourcesCount: currentSources.length,
                description: sub.description,
                created_at: sub.created_at,
              },
            };
          });

          newConstellations.push({
            id: `constellation-${key}`,
            title: cluster.title,
            color: cluster.color,
            orbitRadius: clusterDist,
            angle: clusterAngle,
            driftSpeed: 0.00025 + (cIdx % 2) * 0.0001,
            stars,
            laneY,
          });
          cIdx++;
        }

        // 3. Созвездие диалогов с реальными лунами-инсайтами
        if (Object.keys(folderMap).length > 0) {
          const laneY = 220;
          const folderStars: StarSystem[] = Object.entries(folderMap).map(([folderName, folderChats], fIdx) => {
            const firstChatTs = folderChats[0]?.created_at ? new Date(folderChats[0].created_at).getTime() : minTime;
            const folderTimelineX = calcTimelineX(firstChatTs);

            const planets: Planet[] = folderChats.map((chat: any, pIdx: number) => {
              const chatTs = chat.created_at ? new Date(chat.created_at).getTime() : firstChatTs;

              // Связываем реальные claims к чату (или берем глобальные)
              const chatMoons: Moon[] = claims.slice(pIdx * 2, pIdx * 2 + 2).map((claimItem: ClaimItem, mIdx: number) => {
                const claimTs = claimItem.created_at ? new Date(claimItem.created_at).getTime() : chatTs;
                const isSuperseded = Boolean(claimItem.superseded_by);
                const supersededAt = isSuperseded && claimItem.updated_at ? new Date(claimItem.updated_at).getTime() : undefined;
                
                const moonId = String(claimItem.id || `claim-${mIdx}-${chat.id}`);
                extractedEdges.push({ fromId: moonId, toId: String(chat.id), type: 'claim_to_chat' });
                if (claimItem.superseded_by) {
                   extractedEdges.push({ fromId: moonId, toId: claimItem.superseded_by, type: 'superseded' });
                }

                return {
                  id: moonId,
                  title: claimItem.content || 'Инсайт',
                  type: claimItem.claim_type || 'insight',
                  angle: mIdx * Math.PI,
                  dist: 11,
                  speed: 0.01 + mIdx * 0.005,
                  color: isSuperseded ? '#71717a' : '#facc15',
                  timestamp: claimTs,
                  supersededAt,
                  supersededById: claimItem.superseded_by,
                  isActive: claimItem.is_active,
                };
              });

              return {
                id: String(chat.id),
                title: chat.title || 'Диалог',
                type: 'conversation' as const,
                orbitRadius: 40 + pIdx * 22,
                angle: (pIdx * (Math.PI * 2)) / Math.max(folderChats.length, 1),
                speed: 0.0025 + (pIdx % 3) * 0.0008,
                size: 6,
                color: '#818cf8',
                meta: { messageCount: chat.message_count || 0, created_at: chat.created_at },
                moons: chatMoons,
                timestamp: chatTs,
                timelineX: folderTimelineX,
                timelineY: laneY + 30 + pIdx * 18,
              };
            });

            return {
              id: `folder-${folderName}`,
              title: `📁 ${folderName}`,
              type: 'chat_folder' as const,
              localRadius: 80 + fIdx * 45,
              angle: (fIdx * (Math.PI * 2)) / Math.max(Object.keys(folderMap).length, 1),
              driftSpeed: 0.0006 + (fIdx % 2) * 0.0002,
              size: Math.max(18, Math.min(28, 16 + folderChats.length * 2)),
              color: '#06b6d4',
              planets,
              timestamp: firstChatTs,
              timelineX: folderTimelineX,
              timelineY: laneY,
              meta: { chatCount: folderChats.length },
            };
          });

          newConstellations.push({
            id: 'constellation-operations',
            title: 'OPERATIONAL MEMORY & CHATS',
            color: '#06b6d4',
            orbitRadius: 650,
            angle: Math.PI * 1.35,
            driftSpeed: 0.0002,
            stars: folderStars,
            laneY,
          });
        }

        // 4. Галактическое ядро
        const corePlanets: Planet[] = rootChats.map((chat: any, rIdx: number) => {
          const chatTs = chat.created_at ? new Date(chat.created_at).getTime() : minTime;
          return {
            id: String(chat.id),
            title: chat.title || 'Диалог',
            type: 'conversation' as const,
            orbitRadius: 75 + rIdx * 22,
            angle: (rIdx * (Math.PI * 2)) / Math.max(rootChats.length, 1),
            speed: 0.002 + (rIdx % 4) * 0.0005,
            size: 5,
            color: '#a78bfa',
            meta: { messageCount: chat.message_count || 0, created_at: chat.created_at },
            moons: [],
            timestamp: chatTs,
            timelineX: calcTimelineX(chatTs),
            timelineY: 0,
          };
        });

        const coreSystem: StarSystem = {
          id: 'root-galactic-core',
          title: '⚡ Galactic Core',
          type: 'root_core' as const,
          localRadius: 0,
          angle: 0,
          driftSpeed: 0,
          size: 26,
          color: '#ffffff',
          planets: corePlanets,
          timestamp: minTime,
          timelineX: -700,
          timelineY: 0,
          meta: { rogueChatsCount: rootChats.length },
        };

        if (isMounted) {
          setTimeRange({ min: minTime, max: maxTime });
          setCutoffTimestamp(maxTime);
          setConstellations(newConstellations);
          setRootStars([coreSystem]);
          edgesRef.current = extractedEdges;
          setAvailableDomains(Array.from(domainSet).sort());
        }
      } catch (err) {
        console.error('Failed to load real timeline universe data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadUniverseData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || viewMode !== 'timeline') return;
    const interval = setInterval(() => {
      setCutoffTimestamp((prev) => {
        const step = (timeRange.max - timeRange.min) / 200;
        if (prev + step >= timeRange.max) {
          setIsPlaying(false);
          return timeRange.max;
        }
        return prev + step;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [isPlaying, viewMode, timeRange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(0.12, Math.min(3.5, cameraRef.current.targetZoom * zoomFactor));
      cameraRef.current.targetZoom = newZoom;
    };

    canvas.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const starsBackground = Array.from({ length: 300 }).map(() => ({
      x: (Math.random() - 0.5) * 6500,
      y: (Math.random() - 0.5) * 6500,
      size: Math.random() * 1.6,
      alpha: Math.random() * 0.7 + 0.3,
    }));

    const render = () => {
      const targetMorph = viewMode === 'timeline' ? 1.0 : 0.0;
      morphProgressRef.current += (targetMorph - morphProgressRef.current) * 0.06;
      const morph = morphProgressRef.current;

      const cam = cameraRef.current;
      cam.x += (cam.targetX - cam.x) * 0.08;
      cam.y += (cam.targetY - cam.y) * 0.08;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.08;

      const currentZoom = cam.zoom;
      const isMacro = currentZoom < 0.45 && morph < 0.5;
      const isMicro = currentZoom >= 0.85 || morph > 0.5;

      nodePositionsRef.current = {};
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      const dpr = window.devicePixelRatio || 1;
      ctx.scale(dpr, dpr);
      const logicalWidth = window.innerWidth;
      const logicalHeight = window.innerHeight;
      
      ctx.translate(Math.round(logicalWidth / 2 + cam.x), Math.round(logicalHeight / 2 + cam.y));
      ctx.scale(currentZoom, currentZoom);

      starsBackground.forEach((star) => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * (1 - morph * 0.4)})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      if (morph > 0.05) {
        ctx.save();
        ctx.globalAlpha = morph * 0.4;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);

        ctx.beginPath();
        ctx.moveTo(-750, 0);
        ctx.lineTo(750, 0);
        ctx.stroke();

        const dateTicks = 6;
        ctx.fillStyle = '#71717a';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        for (let i = 0; i <= dateTicks; i++) {
          const tx = -700 + (i * 1400) / dateTicks;
          const tickTime = new Date(timeRange.min + (i * (timeRange.max - timeRange.min)) / dateTicks);
          ctx.beginPath();
          ctx.moveTo(tx, -10);
          ctx.lineTo(tx, 10);
          ctx.stroke();
          ctx.fillText(tickTime.toLocaleDateString([], { month: 'short', day: 'numeric' }), tx, 24);
        }
        ctx.restore();
      }

      const allStarsToRender: Array<{ star: StarSystem; worldX: number; worldY: number }> = [];

      constellations.forEach((cluster) => {
        cluster.angle += cluster.driftSpeed * (1 - morph);
        const galaxyCX = Math.cos(cluster.angle) * cluster.orbitRadius;
        const galaxyCY = Math.sin(cluster.angle) * cluster.orbitRadius;

        const cx = galaxyCX * (1 - morph) + 0 * morph;
        const cy = galaxyCY * (1 - morph) + cluster.laneY * morph;

        cluster.renderX = cx;
        cluster.renderY = cy;

        const nebulaRadius = 260 * (1 - morph * 0.6);
        const nebulaGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, nebulaRadius);
        nebulaGrad.addColorStop(0, cluster.color);
        nebulaGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.save();
        ctx.globalAlpha = 0.1 * (1 - morph * 0.3);
        ctx.fillStyle = nebulaGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, nebulaRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (morph > 0.4) {
          ctx.save();
          ctx.fillStyle = `${cluster.color}cc`;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`── ${cluster.title}`, -720, cluster.laneY - 14);
          ctx.restore();
        } else if (isMacro) {
          ctx.fillStyle = `${cluster.color}99`;
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`✦ ${cluster.title}`, cx, cy - 140);
        }

        const clusterStarCoords: Array<{ x: number; y: number }> = [];
        cluster.stars.forEach((star) => {
          star.angle += star.driftSpeed * (1 - morph);
          const galaxySX = galaxyCX + Math.cos(star.angle) * star.localRadius;
          const galaxySY = galaxyCY + Math.sin(star.angle) * star.localRadius;

          const tX = star.timelineX !== undefined ? star.timelineX : cx;
          const tY = star.timelineY !== undefined ? star.timelineY : cy;

          const sx = galaxySX * (1 - morph) + tX * morph;
          const sy = galaxySY * (1 - morph) + tY * morph;

          star.renderX = sx;
          star.renderY = sy;
          clusterStarCoords.push({ x: sx, y: sy });
          allStarsToRender.push({ star, worldX: sx, worldY: sy });
        });

        if (morph < 0.5 && clusterStarCoords.length > 1) {
          ctx.save();
          ctx.globalAlpha = 1 - morph * 2;
          ctx.setLineDash([4, 6]);
          ctx.strokeStyle = `${cluster.color}40`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < clusterStarCoords.length; i++) {
            const next = clusterStarCoords[(i + 1) % clusterStarCoords.length];
            ctx.moveTo(clusterStarCoords[i].x, clusterStarCoords[i].y);
            ctx.lineTo(next.x, next.y);
          }
          ctx.stroke();
          ctx.restore();
        }
      });

      rootStars.forEach((star) => {
        const sx = 0 * (1 - morph) + (star.timelineX || 0) * morph;
        const sy = 0;
        star.renderX = sx;
        star.renderY = sy;
        allStarsToRender.push({ star, worldX: sx, worldY: sy });
      });

      // Рендеринг с реальным учетом времени
      allStarsToRender.forEach(({ star, worldX, worldY }) => {
        const isStarBorn = star.timestamp <= cutoffTimestamp;
        
        // FOCUS MODE INJECTION
        const isActive = !activeStarIdRef.current || activeStarIdRef.current === star.id;
        const focusAlpha = isActive ? 1.0 : 0.15;
        const starAlpha = (isStarBorn ? 1.0 : morph > 0 ? 0.0 : 0.08) * focusAlpha;

        if (starAlpha <= 0) return;

        nodePositionsRef.current[star.id] = { x: worldX, y: worldY, color: star.color, alpha: starAlpha };

        ctx.save();
        ctx.globalAlpha = starAlpha;

        const glow = ctx.createRadialGradient(worldX, worldY, 2, worldX, worldY, star.size * 2.2);
        glow.addColorStop(0, star.color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(worldX, worldY, star.size * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(worldX, worldY, star.size, 0, Math.PI * 2);
        ctx.fill();

        if (!isMacro || morph > 0.3) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(star.title, worldX, worldY + star.size + 14);
        }

        if (!isMacro || morph > 0.3) {
          star.planets.forEach((planet) => {
            const isPlanetBorn = planet.timestamp <= cutoffTimestamp;
            let domainAlpha = 1.0;
            let isBridgeTarget = false;
            if (selectedDomain) {
              if (planet.domain === selectedDomain) {
                domainAlpha = 1.0;
              } else if (showBridges && bridgeTargetsMapRef.current.has(planet.id)) {
                domainAlpha = 0.4;
                isBridgeTarget = true;
              } else {
                domainAlpha = 0.05;
              }
            }
            const planetAlpha = (isPlanetBorn ? 1.0 : morph > 0 ? 0.0 : 0.06) * domainAlpha;

            if (planetAlpha <= 0) return;

            planet.angle += planet.speed * (1 - morph);

            const galaxyPX = worldX + Math.cos(planet.angle) * planet.orbitRadius;
            const galaxyPY = worldY + Math.sin(planet.angle) * planet.orbitRadius;

            const tPX = planet.timelineX !== undefined ? planet.timelineX : worldX;
            const tPY = planet.timelineY !== undefined ? planet.timelineY : worldY;

            const px = galaxyPX * (1 - morph) + tPX * morph;
            const py = galaxyPY * (1 - morph) + tPY * morph;

            planet.renderX = px;
            planet.renderY = py;

            nodePositionsRef.current[planet.id] = { x: px, y: py, color: planet.color, alpha: starAlpha * planetAlpha };
            
            ctx.save();
            ctx.globalAlpha = starAlpha * planetAlpha;

            if (morph < 0.6) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 * (1 - morph * 1.5)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(worldX, worldY, planet.orbitRadius * (1 - morph * 0.4), 0, Math.PI * 2);
              ctx.stroke();
            }

            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(px, py, planet.size, 0, Math.PI * 2);
            ctx.fill();

            if (isBridgeTarget) {
              ctx.strokeStyle = planet.color;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px, py, planet.size + 3, 0, Math.PI * 2);
              ctx.stroke();
            }

            if (isMicro) {
              ctx.fillStyle = '#a1a1aa';
              ctx.font = '9px sans-serif';
              ctx.fillText(planet.title, px, py + planet.size + 10);
            }

            // Луны (Инсайты и проверка Superseded)
            if (isMicro && morph < 0.6) {
              planet.moons.forEach((moon) => {
                const isMoonBorn = moon.timestamp <= cutoffTimestamp;
                if (!isMoonBorn) return;

                const isSupersededAtCurrentCutoff = moon.supersededAt !== undefined && cutoffTimestamp >= moon.supersededAt;

                moon.angle += moon.speed;
                const mx = px + Math.cos(moon.angle) * moon.dist;
                const my = py + Math.sin(moon.angle) * moon.dist;

                ctx.save();
                ctx.fillStyle = isSupersededAtCurrentCutoff ? '#71717a' : moon.color;
                ctx.globalAlpha = isSupersededAtCurrentCutoff ? 0.35 : 1.0;
                
                nodePositionsRef.current[moon.id] = { x: mx, y: my, color: moon.color, alpha: ctx.globalAlpha * starAlpha * planetAlpha };

                ctx.beginPath();
                ctx.arc(mx, my, 2, 0, Math.PI * 2);
                ctx.fill();

                if (isSupersededAtCurrentCutoff) {
                  ctx.strokeStyle = '#a1a1aa';
                  ctx.lineWidth = 0.5;
                  ctx.stroke();
                }
                ctx.restore();
              });
            }
            ctx.restore();
          });
        }
        ctx.restore();
      });

      // --- DRAW KNOWLEDGE FLOW ---
      const positions = nodePositionsRef.current;
      const isTracing = tracedNodeId !== null;

      if (traceZoomRef.current) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        tracedNodesMap.forEach(id => {
          const pos = positions[id];
          if (pos) {
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
          }
        });
        
        if (minX !== Infinity) {
          const w = Math.max(maxX - minX, 100);
          const h = Math.max(maxY - minY, 100);
          const centerX = minX + w / 2;
          const centerY = minY + h / 2;
          
          const maxDim = Math.max(w, h);
          let optimalZoom = Math.min(window.innerWidth, window.innerHeight) / (maxDim * 1.6);
          optimalZoom = Math.max(0.12, Math.min(optimalZoom, 1.8));

          cam.targetX = -centerX * optimalZoom;
          cam.targetY = -centerY * optimalZoom;
          cam.targetZoom = optimalZoom;
          traceZoomRef.current = false;
        }
      }

      if (domainZoomRef.current && selectedDomain) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        // Find all planets belonging to selectedDomain
        rootStars.forEach(s => s.planets.forEach(p => {
          if (p.domain === selectedDomain && positions[p.id]) {
             minX = Math.min(minX, positions[p.id].x);
             maxX = Math.max(maxX, positions[p.id].x);
             minY = Math.min(minY, positions[p.id].y);
             maxY = Math.max(maxY, positions[p.id].y);
          }
        }));
        constellations.forEach(c => c.stars.forEach(s => s.planets.forEach(p => {
          if (p.domain === selectedDomain && positions[p.id]) {
             minX = Math.min(minX, positions[p.id].x);
             maxX = Math.max(maxX, positions[p.id].x);
             minY = Math.min(minY, positions[p.id].y);
             maxY = Math.max(maxY, positions[p.id].y);
          }
        })));

        if (minX !== Infinity) {
          const w = Math.max(maxX - minX, 100);
          const h = Math.max(maxY - minY, 100);
          const centerX = minX + w / 2;
          const centerY = minY + h / 2;
          
          const maxDim = Math.max(w, h);
          let optimalZoom = Math.min(window.innerWidth, window.innerHeight) / (maxDim * 1.6);
          optimalZoom = Math.max(0.12, Math.min(optimalZoom, 1.8));

          cam.targetX = -centerX * optimalZoom;
          cam.targetY = -centerY * optimalZoom;
          cam.targetZoom = optimalZoom;
        }
        domainZoomRef.current = false;
      }

      edgesRef.current.forEach((edge, i) => {
        const fromPos = positions[edge.fromId];
        const toPos = positions[edge.toId];
        if (!fromPos || !toPos) return;

        const isEdgeTraced = isTracing ? (tracedNodesMap.has(edge.fromId) && tracedNodesMap.has(edge.toId)) : false;
        
        // Hide untraced edges when tracing
        if (isTracing && !isEdgeTraced) return;

        // Base alpha depends on connected nodes
        let baseAlpha = Math.min(fromPos.alpha, toPos.alpha) * (isTracing ? 0.8 : 0.15);
        let isBridge = false;

        if (selectedDomain && !isTracing) {
           const fromInDomain = fromPos.alpha >= 0.9;
           const toInDomain = toPos.alpha >= 0.9;
           
           if (fromInDomain && toInDomain) {
              baseAlpha = 0.8;
           } else if (showBridges && ((fromInDomain && toPos.alpha > 0.1) || (toInDomain && fromPos.alpha > 0.1))) {
              baseAlpha = 0.75;
              isBridge = true;
           } else {
              baseAlpha = 0.02;
           }
        }

        if (baseAlpha <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = baseAlpha;
        
        // Draw organic Bezier Curve
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        
        const cx = fromPos.x + dx * 0.5 + dy * 0.2;
        const cy = fromPos.y + dy * 0.5 - dx * 0.2;

        ctx.lineWidth = isTracing ? 1.5 : (isBridge ? 1.2 : 0.8);
        
        if (isBridge) {
           const grad = ctx.createLinearGradient(fromPos.x, fromPos.y, toPos.x, toPos.y);
           grad.addColorStop(0, fromPos.color);
           grad.addColorStop(1, toPos.color);
           ctx.strokeStyle = grad;
           ctx.setLineDash([4, 4]);
           ctx.lineDashOffset = -performance.now() * 0.03;
        } else {
           ctx.strokeStyle = fromPos.color;
           if (edge.type === 'superseded') {
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = '#f59e0b';
           }
        }
        
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.quadraticCurveTo(cx, cy, toPos.x, toPos.y);
        ctx.stroke();

        ctx.restore();
      });

      // Spawn particles
      if (Math.random() < (isTracing ? 0.8 : (selectedDomain ? 0.4 : 0.2))) {
        const activeEdges = edgesRef.current.map((e, idx) => ({ e, idx })).filter(({ e }) => {
           if (isTracing) return tracedNodesMap.has(e.fromId) && tracedNodesMap.has(e.toId);
           const pFrom = positions[e.fromId];
           const pTo = positions[e.toId];
           if (!pFrom || !pTo) return false;
           
           if (selectedDomain && showBridges) {
             const fromIn = pFrom.alpha >= 0.9;
             const toIn = pTo.alpha >= 0.9;
             return (fromIn && pTo.alpha > 0.1) || (toIn && pFrom.alpha > 0.1);
           }
           
           return pFrom.alpha > 0.1 && pTo.alpha > 0.1;
        });

        if (activeEdges.length > 0) {
           let rand = activeEdges[Math.floor(Math.random() * activeEdges.length)];
           
           if (selectedDomain && showBridges) {
              const bridgesOnly = activeEdges.filter(ae => {
                 const pFrom = positions[ae.e.fromId];
                 const pTo = positions[ae.e.toId];
                 return (pFrom.alpha >= 0.9 && pTo.alpha < 0.9) || (pFrom.alpha < 0.9 && pTo.alpha >= 0.9);
              });
              if (bridgesOnly.length > 0 && Math.random() < 0.7) {
                 rand = bridgesOnly[Math.floor(Math.random() * bridgesOnly.length)];
              }
           }

           let flowReverse = false;
           if (selectedDomain && showBridges) {
               const pFrom = positions[rand.e.fromId];
               if (pFrom && pFrom.alpha < 0.9) flowReverse = true;
           }

           particlesRef.current.push({
             edgeIndex: rand.idx,
             progress: flowReverse ? 1 : 0,
             speed: (0.005 + Math.random() * 0.01) * (flowReverse ? -1 : 1),
             spawnDelay: 0
           });
        }
      }

      // Draw and update particles
      ctx.save();
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        const edge = edgesRef.current[p.edgeIndex];
        const fromPos = positions[edge.fromId];
        const toPos = positions[edge.toId];

        if (!fromPos || !toPos) {
           particlesRef.current.splice(i, 1);
           continue;
        }

        p.progress += p.speed * (1 - morph * 0.5);
        if (p.progress >= 1 || p.progress <= 0) {
           particlesRef.current.splice(i, 1);
           continue;
        }

        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const cx = fromPos.x + dx * 0.5 + dy * 0.2;
        const cy = fromPos.y + dy * 0.5 - dx * 0.2;

        const t = p.progress;
        const mt = 1 - t;
        
        const px = mt * mt * fromPos.x + 2 * mt * t * cx + t * t * toPos.x;
        const py = mt * mt * fromPos.y + 2 * mt * t * cy + t * t * toPos.y;
        
        ctx.globalAlpha = Math.min(fromPos.alpha, toPos.alpha);
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();

        const glow = ctx.createRadialGradient(px, py, 0, px, py, 6);
        glow.addColorStop(0, fromPos.color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [constellations, rootStars, viewMode, cutoffTimestamp, timeRange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    cameraRef.current.isDragging = true;
    cameraRef.current.startX = e.clientX - cameraRef.current.targetX;
    cameraRef.current.startY = e.clientY - cameraRef.current.targetY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cameraRef.current.isDragging) return;
    cameraRef.current.targetX = e.clientX - cameraRef.current.startX;
    cameraRef.current.targetY = e.clientY - cameraRef.current.startY;
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
  };

  const searchableEntities = useMemo<SearchableEntity[]>(() => {
    const list: SearchableEntity[] = [];
    constellations.forEach((c) => {
      list.push({
        id: c.id,
        title: c.title,
        subtitle: `Созвездие (${c.stars.length} звезд)`,
        type: 'constellation',
        category: 'Кластер',
        color: c.color,
        worldX: c.renderX || 0,
        worldY: c.renderY || 0,
        targetZoom: 0.45,
        originalEntity: c,
      });

      c.stars.forEach((star) => {
        list.push({
          id: star.id,
          title: star.title,
          subtitle: star.type === 'subject' ? `Предмет • Освоение: ${Math.round(star.meta?.mastery || 0)}%` : `Папка чатов`,
          type: star.type as any,
          category: star.type === 'subject' ? 'Звезда' : 'Папка',
          color: star.color,
          worldX: star.renderX || 0,
          worldY: star.renderY || 0,
          targetZoom: 1.2,
          originalEntity: star,
        });

        star.planets.forEach((planet) => {
          list.push({
            id: planet.id,
            title: planet.title,
            subtitle: `В системе "${star.title}"`,
            type: planet.type as any,
            category: planet.type === 'source' ? 'Источник' : 'Диалог',
            color: planet.color,
            worldX: planet.renderX || 0,
            worldY: planet.renderY || 0,
            targetZoom: 1.8,
            originalEntity: planet,
          });

          planet.moons.forEach((moon) => {
            list.push({
              id: moon.id,
              title: moon.title,
              subtitle: `Инсайт диалога "${planet.title}"`,
              type: 'insight',
              category: 'Инсайт',
              color: moon.color,
              worldX: planet.renderX || 0, // approximation
              worldY: planet.renderY || 0,
              targetZoom: 2.2,
              originalEntity: { ...moon, parentPlanetId: planet.id },
            });
          });
        });
      });
    });
    return list;
  }, [constellations]);

  const handleJumpToTargetNode = (targetId: string) => {
    const item = searchableEntities.find(e => e.id === targetId);
    if (item) {
      handleSelectSearchEntity(item);
    }
  };

  const handleSelectSearchEntity = (item: SearchableEntity) => {
    cameraRef.current.targetX = -item.worldX * item.targetZoom;
    cameraRef.current.targetY = -item.worldY * item.targetZoom;
    cameraRef.current.targetZoom = item.targetZoom;

    if (item.type === 'subject' || item.type === 'chat_folder') {
      activeStarIdRef.current = item.id;
    }

    if (item.type === 'subject') {
      inspectEntity({
        id: item.id,
        type: 'subject',
        title: item.title,
        subtitle: item.subtitle,
        parentSubject: { id: item.id, title: item.title },
        onOpenSubject: (id) => onOpenSubject && onOpenSubject(id, 'roadmap'),
        onAskTutor: (id) => onOpenSubject && onOpenSubject(id, 'tutor'),
        onTracePath: () => setTracedNodeId(item.id),
      });
    } else if (item.type === 'source') {
      inspectEntity({
        id: item.id,
        type: 'source',
        title: item.title,
        subtitle: item.subtitle,
        onOpenSource: () => onOpenSource && onOpenSource(item.id),
        onTracePath: () => setTracedNodeId(item.id),
      });
    } else if (item.type === 'conversation') {
      inspectEntity({
        id: item.id,
        type: 'claim',
        title: item.title,
        subtitle: item.subtitle,
        onOpenChat: () => window.dispatchEvent(new CustomEvent('openConversation', { detail: { conversationId: item.id } })),
        onTracePath: () => setTracedNodeId(item.id),
      });
    } else if (item.type === 'insight') {
      const moon = item.originalEntity as Moon;
      inspectEntity({
        id: item.id,
        type: 'claim',
        title: item.title,
        subtitle: item.subtitle,
        meta: {
          superseded_by: moon.supersededById,
          // Extract conversation ID from planet? Wait, we didn't store planet in originalEntity.
        },
        onJumpToTargetNode: handleJumpToTargetNode,
        onTracePath: () => setTracedNodeId(item.id),
      });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cam = cameraRef.current;
    
    // hit testing ...
    const logicalWidth = window.innerWidth;
    const logicalHeight = window.innerHeight;
    const worldX = (clickX - logicalWidth / 2 - cam.targetX) / cam.targetZoom;
    const worldY = (clickY - logicalHeight / 2 - cam.targetY) / cam.targetZoom;

    const allStars: StarSystem[] = [...rootStars, ...constellations.flatMap((c) => c.stars)];

    for (const star of allStars) {
      for (const planet of star.planets) {
        if (planet.renderX !== undefined && planet.renderY !== undefined) {
          // Check Moons first
          for (const moon of planet.moons) {
            const mx = planet.renderX + Math.cos(moon.angle) * moon.dist;
            const my = planet.renderY + Math.sin(moon.angle) * moon.dist;
            if (Math.hypot(worldX - mx, worldY - my) <= 6) {
              cam.targetX = -mx * 2.2;
              cam.targetY = -my * 2.2;
              cam.targetZoom = 2.2;
              activeStarIdRef.current = star.id;
              
              inspectEntity({
                id: moon.id,
                type: 'claim',
                title: moon.title,
                subtitle: `Инсайт диалога "${planet.title}"`,
                meta: {
                  superseded_by: moon.supersededById,
                  conversationId: planet.id,
                },
                onJumpToTargetNode: handleJumpToTargetNode,
                onOpenChat: (convId) => window.dispatchEvent(new CustomEvent('openConversation', { detail: { conversationId: convId } })),
                onTracePath: () => setTracedNodeId(moon.id),
              });
              return;
            }
          }

          const dist = Math.hypot(worldX - planet.renderX, worldY - planet.renderY);
          if (dist <= planet.size + 8) {
            cam.targetX = -planet.renderX * 1.6;
            cam.targetY = -planet.renderY * 1.6;
            cam.targetZoom = 1.6;
            activeStarIdRef.current = star.id;

            const dateStr = new Date(planet.timestamp).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            if (planet.type === 'conversation') {
              inspectEntity({
                id: planet.id,
                type: 'claim',
                title: planet.title,
                subtitle: `Диалог в ветке "${star.title}"`,
                summary: `Операционная память: ${planet.meta?.messageCount || 0} сообщений. Создано: ${dateStr}.`,
                meta: {
                  сообщений: planet.meta?.messageCount || 0,
                  создано: dateStr,
                },
                onOpenChat: () => window.dispatchEvent(new CustomEvent('openConversation', { detail: { conversationId: planet.id } })),
                onTracePath: () => setTracedNodeId(planet.id),
              });
            } else if (planet.type === 'source') {
              inspectEntity({
                id: planet.id,
                type: 'source',
                title: planet.title,
                subtitle: `Первоисточник предмета "${star.title}"`,
                summary: `Тип документа: ${planet.meta?.type || 'документ'}. Добавлено: ${dateStr}.`,
                parentSubject: { id: star.id, title: star.title },
                meta: {
                  добавлено: dateStr,
                },
                onOpenSource: () => onOpenSource && onOpenSource(planet.id),
                onOpenSubject: (subId) => onOpenSubject && onOpenSubject(subId, 'sources'),
                onTracePath: () => setTracedNodeId(planet.id),
              });
            }
            return;
          }
        }
      }
    }

    for (const star of allStars) {
      if (star.renderX !== undefined && star.renderY !== undefined) {
        const dist = Math.hypot(worldX - star.renderX, worldY - star.renderY);
        if (dist <= star.size + 10) {
          cam.targetX = -star.renderX * 1.2;
          cam.targetY = -star.renderY * 1.2;
          cam.targetZoom = 1.2;
          activeStarIdRef.current = star.id;

          const dateStr = new Date(star.timestamp).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          if (star.type === 'subject') {
            inspectEntity({
              id: star.id,
              type: 'subject',
              title: star.title,
              subtitle: `Звездная система | Освоение: ${Math.round(star.meta?.mastery || 0)}%`,
              summary: star.meta?.description || `Включает ${star.planets.length} первоисточников. Создано: ${dateStr}.`,
              parentSubject: { id: star.id, title: star.title },
              meta: {
                освоение: `${Math.round(star.meta?.mastery || 0)}%`,
                источников: star.planets.length,
                создано: dateStr,
              },
              onOpenSubject: (subId) => onOpenSubject && onOpenSubject(subId, 'roadmap'),
              onAskTutor: (subId) => onOpenSubject && onOpenSubject(subId, 'tutor'),
              onTracePath: () => setTracedNodeId(star.id),
            });
          } else if (star.type === 'chat_folder') {
            inspectEntity({
              id: star.id,
              type: 'pattern',
              title: star.title,
              subtitle: `Папка диалогов`,
              summary: `Содержит ${star.planets.length} активных диалогов. Создано: ${dateStr}.`,
              meta: {
                диалогов: star.planets.length,
                создано: dateStr,
              },
              onTracePath: () => setTracedNodeId(star.id),
            });
          }
          return;
        }
      }
    }

    activeStarIdRef.current = null;
    setTracedNodeId(null);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const cam = cameraRef.current;
    
    const logicalWidth = window.innerWidth;
    const logicalHeight = window.innerHeight;
    const worldX = (clickX - logicalWidth / 2 - cam.targetX) / cam.targetZoom;
    const worldY = (clickY - logicalHeight / 2 - cam.targetY) / cam.targetZoom;

    const allStars: StarSystem[] = [...rootStars, ...constellations.flatMap((c) => c.stars)];

    for (const star of allStars) {
      for (const planet of star.planets) {
        if (planet.renderX !== undefined && planet.renderY !== undefined) {
          for (const moon of planet.moons) {
            const mx = planet.renderX + Math.cos(moon.angle) * moon.dist;
            const my = planet.renderY + Math.sin(moon.angle) * moon.dist;
            if (Math.hypot(worldX - mx, worldY - my) <= 6) {
              setCopilotTarget({ id: moon.id, label: moon.title, group: 'claim', type: 'node' });
              return;
            }
          }

          const dist = Math.hypot(worldX - planet.renderX, worldY - planet.renderY);
          if (dist <= planet.size + 8) {
            setCopilotTarget({ id: planet.id, label: planet.title, group: planet.type === 'conversation' ? 'claim' : 'source', type: 'node' });
            return;
          }
        }
      }
    }

    for (const star of allStars) {
      if (star.renderX !== undefined && star.renderY !== undefined) {
        const dist = Math.hypot(worldX - star.renderX, worldY - star.renderY);
        if (dist <= star.size + 10) {
          setCopilotTarget({ id: star.id, label: star.title, group: star.type === 'subject' ? 'subject' : 'chat_folder', type: 'node' });
          return;
        }
      }
    }
  };

  const resetCamera = () => {
    cameraRef.current.targetX = 0;
    cameraRef.current.targetY = 0;
    cameraRef.current.targetZoom = viewMode === 'timeline' ? 0.65 : 0.55;
    activeStarIdRef.current = null;
  };

  return (
    <div className="relative w-full h-full bg-[#070709] overflow-hidden select-none">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070709]/80 z-10 text-zinc-400 text-xs">
          Построение 4D Вселенной на реальных данных времени...
        </div>
      )}

      {!loading && availableDomains.length > 0 && (
        <UniverseDomainFilter
          domains={availableDomains}
          selectedDomain={selectedDomain}
          compareDomain={compareDomain}
          onSelect={(domain) => {
            setSelectedDomain(domain);
            if (!domain) setCompareDomain(null);
            domainZoomRef.current = true;
          }}
          onCompare={(domain) => {
            setCompareDomain(domain);
          }}
          showBridges={showBridges}
          onToggleBridges={setShowBridges}
        />
      )}

      {selectedDomain && compareDomain && (
        <BridgeContextInspector
          domainA={selectedDomain}
          domainB={compareDomain}
          onClose={() => setCompareDomain(null)}
          onExplainConnection={(bridgeId, relationType) => {
            setCopilotTarget({
              id: bridgeId,
              label: `Связь: ${relationType}`,
              group: 'edge',
              type: 'edge'
            });
          }}
        />
      )}

      {/* Верхняя панель */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar w-[95vw] sm:w-auto max-w-full px-2 py-1.5 bg-[#111115]/80 backdrop-blur-md border border-zinc-800/80 rounded-xl shadow-lg">
        <div className="px-2 py-1 text-xs font-bold text-white flex items-center gap-1.5 shrink-0">
          <Sparkles size={14} className="text-indigo-400" />
          Galaxy Universe 4D
        </div>
        <div className="h-4 w-[1px] bg-zinc-800 shrink-0" />

        <button
          onClick={() => {
            const nextMode = viewMode === 'galaxy' ? 'timeline' : 'galaxy';
            setViewMode(nextMode);
            resetCamera();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
            viewMode === 'timeline'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
          }`}
          title="Сменить проекцию Вселенной"
        >
          {viewMode === 'timeline' ? <Clock size={13} /> : <Orbit size={13} />}
          <span>{viewMode === 'timeline' ? 'Timeline' : 'Galaxy'}</span>
        </button>

        <div className="h-4 w-[1px] bg-zinc-800 shrink-0" />

        <button
          onClick={() => setIsSpotlightOpen(true)}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all flex items-center gap-1.5 px-2 text-xs shrink-0"
          title="Быстрый поиск (Ctrl+K)"
        >
          <Search size={13} />
          <span>Поиск</span>
          <kbd className="hidden sm:inline-block text-[10px] text-zinc-500 font-mono bg-zinc-900 px-1 rounded">Ctrl+K</kbd>
        </button>

          {tracedNodeId && (
            <>
              <div className="h-4 w-[1px] bg-zinc-800 shrink-0" />
              <button
                onClick={() => setTracedNodeId(null)}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium rounded-lg transition-all shrink-0"
                title="Сбросить трассировку потока (Esc или клик в пустоту)"
              >
                <X size={14} />
                Trace Active
              </button>
            </>
          )}
      </div>

      {/* Элементы управления камерой (мобильные/десктопные) */}
      <div className="absolute bottom-24 right-4 sm:bottom-6 sm:right-6 z-20 flex flex-col items-center gap-2 bg-[#111115]/80 backdrop-blur-md border border-zinc-800/80 p-1.5 rounded-xl shadow-lg">
        <button
          onClick={() => { cameraRef.current.targetZoom = Math.min(3.5, cameraRef.current.targetZoom * 1.25); }}
          className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all"
          title="Приблизить"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={() => { cameraRef.current.targetZoom = Math.max(0.12, cameraRef.current.targetZoom * 0.75); }}
          className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all"
          title="Отдалить"
        >
          <ZoomOut size={18} />
        </button>
        <div className="w-6 h-[1px] bg-zinc-800" />
        <button
          onClick={resetCamera}
          className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all flex flex-col items-center justify-center gap-0.5"
          title="Сброс камеры"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Нижняя плавающая панель скраббера времени */}
      <div
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl bg-[#111116]/90 backdrop-blur-md border border-zinc-800/90 rounded-2xl px-4 py-3 shadow-2xl transition-all duration-300 ${
          viewMode === 'timeline' ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all"
              title={isPlaying ? 'Пауза' : 'Воспроизвести эволюцию'}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <span className="font-mono text-zinc-200">
              {new Date(cutoffTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            {cutoffTimestamp >= timeRange.max ? 'Текущий момент (Всё)' : 'Исторический срез'}
          </span>
        </div>

        <input
          type="range"
          min={timeRange.min}
          max={timeRange.max}
          value={cutoffTimestamp}
          onChange={(e) => {
            setIsPlaying(false);
            setCutoffTimestamp(Number(e.target.value));
          }}
          className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
        />
      </div>

      <UniverseSpotlight
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        entities={searchableEntities}
        onSelectEntity={handleSelectSearchEntity}
      />

      {copilotTarget && (
        <GraphCopilotPanel
          nodeId={copilotTarget.id}
          nodeLabel={copilotTarget.label}
          nodeGroup={copilotTarget.group}
          nodeType={copilotTarget.type}
          onClose={() => setCopilotTarget(null)}
        />
      )}

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
