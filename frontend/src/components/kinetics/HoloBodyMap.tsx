import React, { useState } from 'react';

interface HoloBodyMapProps {
  activeLayer: 'load' | 'fat';
  segmentFat?: Record<string, any>;
  activeMuscles: string[];
  fatigueScore: number;
  selectedSegment: string | null;
  onSelectSegment: (segment: any) => void;
}

export const HoloBodyMap: React.FC<HoloBodyMapProps> = ({
  activeLayer,
  segmentFat,
  activeMuscles,
  onSelectSegment,
}) => {
  const [viewAngle, setViewAngle] = useState<'front' | 'back'>('front');

  const getStyle = (key: string, muscleNames: string[]) => {
    const isTargeted = activeMuscles.some((m) =>
      muscleNames.some((target) => m.toLowerCase().includes(target.toLowerCase()))
    );

    if (activeLayer === 'fat') {
      const fatPct = segmentFat?.[key]?.fat_pct || (key === 'torso' || key === 'back' ? 180 : 145);
      const alpha = Math.min(Math.max((fatPct - 100) / 110, 0.2), 0.85);
      return {
        fill: `rgba(245, 158, 11, ${alpha})`,
        stroke: '#f59e0b',
        strokeWidth: 1.2,
      };
    }

    return {
      fill: isTargeted ? 'rgba(6, 182, 212, 0.45)' : 'rgba(6, 182, 212, 0.08)',
      stroke: isTargeted ? '#22d3ee' : '#0891b2',
      strokeWidth: isTargeted ? 1.8 : 1,
    };
  };

  return (
    <div className="w-full h-full relative flex items-center justify-center select-none font-mono">
      {/* Тумблер ракурса: Спереди / Сзади */}
      <div className="absolute top-4 right-4 flex bg-[#030712]/90 border border-cyan-950 rounded-lg p-1 z-10 text-[10px]">
        <button
          onClick={() => setViewAngle('front')}
          className={`px-3 py-1 rounded transition-all ${
            viewAngle === 'front'
              ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ВИД СПЕРЕДИ
        </button>
        <button
          onClick={() => setViewAngle('back')}
          className={`px-3 py-1 rounded transition-all ${
            viewAngle === 'back'
              ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          СО СПИНЫ
        </button>
      </div>

      {/* SVG Силуэт человека с мышечными массивами */}
      <svg viewBox="0 0 200 320" className="h-[92%] max-w-full filter drop-shadow-[0_0_15px_rgba(6,182,212,0.25)]">
        {/* Голова и шея */}
        <ellipse cx="100" cy="22" rx="12" ry="15" fill="rgba(6,182,212,0.08)" stroke="#0891b2" strokeWidth="1" />
        <path
          d="M 94 36 L 90 48 L 110 48 L 106 36 Z"
          style={getStyle('neck', ['шея', 'трапец'])}
          onClick={() => onSelectSegment(viewAngle === 'front' ? 'torso' : 'back')}
          className="cursor-pointer transition-all hover:brightness-125"
        />

        {viewAngle === 'front' ? (
          /* ================= ВИД СПЕРЕДИ ================= */
          <g>
            {/* Торс: Грудь и Кор */}
            <path
              d="M 76 48 L 124 48 L 128 78 L 115 130 L 85 130 L 72 78 Z"
              style={getStyle('torso', ['грудь', 'кор', 'пресс', 'живот'])}
              onClick={() => onSelectSegment('torso')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Левая рука: Дельта, Плечо, Предплечье */}
            <path
              d="M 73 50 L 55 60 L 50 100 L 64 100 L 71 68 Z"
              style={getStyle('left_arm', ['дельты', 'плечи', 'бицепс', 'руки'])}
              onClick={() => onSelectSegment('left_arm')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 50 102 L 44 145 L 56 148 L 62 102 Z"
              style={getStyle('left_arm', ['предплечья', 'кисти'])}
              onClick={() => onSelectSegment('left_arm')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Правая рука */}
            <path
              d="M 127 50 L 145 60 L 150 100 L 136 100 L 129 68 Z"
              style={getStyle('right_arm', ['дельты', 'плечи', 'бицепс', 'руки'])}
              onClick={() => onSelectSegment('right_arm')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 150 102 L 156 145 L 144 148 L 138 102 Z"
              style={getStyle('right_arm', ['предплечья', 'кисти'])}
              onClick={() => onSelectSegment('right_arm')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Ноги: Бедро (квадрицепс) и Голень (икры) */}
            <path
              d="M 82 133 L 98 133 L 94 205 L 75 205 L 70 150 Z"
              style={getStyle('left_leg', ['квадрицепс', 'бедро', 'ноги'])}
              onClick={() => onSelectSegment('left_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 75 208 L 93 208 L 90 280 L 76 280 Z"
              style={getStyle('left_leg', ['икронож', 'голень', 'ноги'])}
              onClick={() => onSelectSegment('left_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 102 133 L 118 133 L 130 150 L 125 205 L 106 205 Z"
              style={getStyle('right_leg', ['квадрицепс', 'бедро', 'ноги'])}
              onClick={() => onSelectSegment('right_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 107 208 L 125 208 L 124 280 L 110 280 Z"
              style={getStyle('right_leg', ['икронож', 'голень', 'ноги'])}
              onClick={() => onSelectSegment('right_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
          </g>
        ) : (
          /* ================= ВИД СО СПИНЫ ================= */
          <g>
            {/* Спина: Трапеции и Широчайшие */}
            <path
              d="M 74 48 L 126 48 L 122 105 L 112 130 L 88 130 L 78 105 Z"
              style={getStyle('back', ['спина', 'широчайшие', 'трапеции', 'ромбовидные'])}
              onClick={() => onSelectSegment('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Ягодичные мышцы (Glutes) */}
            <path
              d="M 78 132 L 122 132 L 126 160 L 74 160 Z"
              style={getStyle('back', ['ягодицы', 'таз'])}
              onClick={() => onSelectSegment('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Задняя поверхность рук (Трицепс) */}
            <path
              d="M 72 50 L 52 62 L 48 102 L 62 102 Z"
              style={getStyle('left_arm', ['трицепс', 'руки'])}
              onClick={() => onSelectSegment('left_arm')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 128 50 L 148 62 L 152 102 L 138 102 Z"
              style={getStyle('right_arm', ['трицепс', 'руки'])}
              onClick={() => onSelectSegment('right_arm')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Задняя поверхность бедра (Бицепс бедра) */}
            <path
              d="M 75 162 L 98 162 L 94 205 L 72 205 Z"
              style={getStyle('left_leg', ['бицепс бедра', 'ноги'])}
              onClick={() => onSelectSegment('left_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 102 162 L 125 162 L 128 205 L 106 205 Z"
              style={getStyle('right_leg', ['бицепс бедра', 'ноги'])}
              onClick={() => onSelectSegment('right_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Икры со спины */}
            <path
              d="M 72 208 L 94 208 L 90 280 L 74 280 Z"
              style={getStyle('left_leg', ['икронож', 'ноги'])}
              onClick={() => onSelectSegment('left_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M 106 208 L 128 208 L 126 280 L 110 280 Z"
              style={getStyle('right_leg', ['икронож', 'ноги'])}
              onClick={() => onSelectSegment('right_leg')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
