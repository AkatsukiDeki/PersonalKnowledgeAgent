import React, { useEffect, useRef, useState } from 'react';
import { subjectsApi } from '../../api/subjects';
import { useInspector } from '../../context/InspectorContext';
import { Compass, RotateCcw, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';

interface PlanetNode {
  id: string;
  title: string;
  mastery: number;
  color: string;
  orbitRadius: number;
  angle: number;
  speed: number;
  size: number;
  sourcesCount: number;
  sources: Array<{ id: string; title: string }>;
}

interface UniverseCanvasProps {
  onOpenSubject?: (subjectId: string, tab?: 'roadmap' | 'sources' | 'tutor' | 'stats') => void;
}

export const UniverseCanvas: React.FC<UniverseCanvasProps> = ({ onOpenSubject }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { inspectEntity } = useInspector();
  
  const [planets, setPlanets] = useState<PlanetNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Состояние камеры (Pan & Zoom & Target Lerp)
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
    targetX: 0,
    targetY: 0,
    targetZoom: 1,
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  const selectedPlanetIdRef = useRef<string | null>(null);

  // Загрузка данных предметов для Вселенной
  useEffect(() => {
    const loadUniverseData = async () => {
      try {
        setLoading(true);
        // Загружаем список всех предметов
        const subjectsList = await subjectsApi.getSubjects(); 
        
        const colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
        
        const mappedPlanets: PlanetNode[] = subjectsList.map((sub: any, index: number) => {
          const orbitRadius = 140 + index * 90;
          return {
            id: sub.id,
            title: sub.title,
            mastery: sub.mastery_score || 0,
            color: colors[index % colors.length],
            orbitRadius,
            angle: (index * (Math.PI * 2)) / Math.max(subjectsList.length, 1),
            speed: 0.001 + index * 0.0002,
            size: Math.max(16, Math.min(32, 16 + (sub.mastery_score || 0) / 5)),
            sourcesCount: sub.sources?.length || 0,
            sources: sub.sources || [],
          };
        });

        setPlanets(mappedPlanets);
      } catch (e) {
        console.error('Failed to load universe subjects:', e);
      } finally {
        setLoading(false);
      }
    };

    loadUniverseData();
  }, []);

  // Основной цикл анимации и рендеринга Canvas (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Генерация статического звездного фона (параллакс)
    const stars = Array.from({ length: 150 }).map(() => ({
      x: (Math.random() - 0.5) * 3000,
      y: (Math.random() - 0.5) * 3000,
      size: Math.random() * 1.5,
      alpha: Math.random() * 0.7 + 0.3,
    }));

    const render = () => {
      const cam = cameraRef.current;

      // Плавное приближение камеры (Lerp)
      cam.x += (cam.targetX - cam.x) * 0.08;
      cam.y += (cam.targetY - cam.y) * 0.08;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.08;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      // Центрирование и применение матрицы камеры
      ctx.translate(canvas.width / 2 + cam.x, canvas.height / 2 + cam.y);
      ctx.scale(cam.zoom, cam.zoom);

      // 1. Рендер звездного поля
      stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      // 2. Рендер Ядра Вселенной (Центр)
      const coreGradient = ctx.createRadialGradient(0, 0, 5, 0, 0, 60);
      coreGradient.addColorStop(0, 'rgba(99, 102, 241, 0.8)');
      coreGradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#818cf8';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      // 3. Рендер планет и орбит
      planets.forEach(planet => {
        // Вращение планеты по орбите
        planet.angle += planet.speed;
        const x = Math.cos(planet.angle) * planet.orbitRadius;
        const y = Math.sin(planet.angle) * planet.orbitRadius;

        // Орбитальное кольцо
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, planet.orbitRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Свечение планеты
        const glow = ctx.createRadialGradient(x, y, 2, x, y, planet.size * 2);
        glow.addColorStop(0, planet.color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, planet.size * 2, 0, Math.PI * 2);
        ctx.fill();

        // Тело планеты
        ctx.fillStyle = planet.color;
        ctx.beginPath();
        ctx.arc(x, y, planet.size, 0, Math.PI * 2);
        ctx.fill();

        // Текстовая подпись планеты
        ctx.fillStyle = '#f4f4f5';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(planet.title, x, y + planet.size + 16);

        // Процент освоения поверх планеты
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px monospace';
        ctx.fillText(`${Math.round(planet.mastery)}%`, x, y + 3);

        // Спутники (Источники) на мини-орбите вокруг планеты
        planet.sources.forEach((src, sIdx) => {
          const sAngle = planet.angle * 3 + (sIdx * (Math.PI * 2)) / Math.max(planet.sources.length, 1);
          const sDist = planet.size + 14;
          const sx = x + Math.cos(sAngle) * sDist;
          const sy = y + Math.sin(sAngle) * sDist;

          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        // Сохраняем текущие мировые координаты планеты для отслеживания кликов
        (planet as any).renderX = x;
        (planet as any).renderY = y;
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [planets]);

  // Обработка мыши: Pan (перетаскивание)
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault(); // Теперь работает корректно и без ошибок
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(0.4, Math.min(3.0, cameraRef.current.targetZoom * zoomFactor));
      cameraRef.current.targetZoom = newZoom;
    };

    // Регистрация с явным passive: false
    canvas.addEventListener('wheel', onNativeWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  // Клик по планете -> Фокус камеры + Инспектор
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cam = cameraRef.current;
    // Преобразуем координаты клика в мировые координаты холста
    const worldX = (clickX - canvas.width / 2 - cam.targetX) / cam.targetZoom;
    const worldY = (clickY - canvas.height / 2 - cam.targetY) / cam.targetZoom;

    // Ищем планету, по которой кликнули
    for (const planet of planets) {
      const rx = (planet as any).renderX || 0;
      const ry = (planet as any).renderY || 0;
      const dist = Math.hypot(worldX - rx, worldY - ry);

      if (dist <= planet.size + 10) {
        // Фокусируем камеру на планете
        cam.targetX = -rx * 1.5;
        cam.targetY = -ry * 1.5;
        cam.targetZoom = 1.6;
        selectedPlanetIdRef.current = planet.id;

        // Вызываем глобальный Inspector
        inspectEntity({
          id: planet.id,
          type: 'subject',
          title: planet.title,
          subtitle: `Освоение предмета: ${Math.round(planet.mastery)}%`,
          summary: `Планетная система знаний включает ${planet.sourcesCount} связанных первоисточников.`,
          meta: {
            освоение: `${Math.round(planet.mastery)}%`,
            источников: planet.sourcesCount,
          },
          parentSubject: { id: planet.id, title: planet.title },
          onOpenSubject: (subId) => {
            if (onOpenSubject) {
              onOpenSubject(subId, 'roadmap');
            }
          },
          onAskTutor: (subId, topic) => {
            if (onOpenSubject) {
              onOpenSubject(subId, 'tutor');
            }
          },
        });
        return;
      }
    }
  };

  const resetCamera = () => {
    cameraRef.current.targetX = 0;
    cameraRef.current.targetY = 0;
    cameraRef.current.targetZoom = 1;
    selectedPlanetIdRef.current = null;
  };

  return (
    <div className="relative w-full h-full bg-[#070709] overflow-hidden select-none">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070709]/80 z-10 text-zinc-400 text-xs">
          Инициализация орбитальной вселенной...
        </div>
      )}

      {/* Верхняя панель управления картой */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#111115]/80 backdrop-blur-md border border-zinc-800/80 p-1.5 rounded-xl shadow-lg">
        <div className="px-2.5 py-1 text-xs font-bold text-white flex items-center gap-1.5">
          <Sparkles size={14} className="text-indigo-400" />
          Universe 2.5D
        </div>
        <div className="h-4 w-[1px] bg-zinc-800" />
        <button
          onClick={() => { cameraRef.current.targetZoom = Math.min(3.0, cameraRef.current.targetZoom * 1.2); }}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all"
          title="Приблизить"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={() => { cameraRef.current.targetZoom = Math.max(0.4, cameraRef.current.targetZoom * 0.8); }}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all"
          title="Отдалить"
        >
          <ZoomOut size={15} />
        </button>
        <button
          onClick={resetCamera}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all flex items-center gap-1 px-2.5 text-xs"
          title="Сбросить вид"
        >
          <RotateCcw size={13} />
          <span>Центр</span>
        </button>
      </div>

      {/* Интерактивный Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
