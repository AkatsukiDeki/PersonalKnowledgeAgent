import React, { useState, useEffect } from 'react';
import { WorkoutExercise } from '../../api/kinetics';
import { Dumbbell, BookOpen, AlertCircle, CheckCircle2, Ruler, Flame, ArrowLeft, RefreshCw, Crosshair } from 'lucide-react';

interface SegmentDetailedViewProps {
  segmentId: string;
  exercises?: WorkoutExercise[];
  location?: 'Дом' | 'Зал';
  onBack?: () => void;
}

interface MuscleMeta {
  name: string;
  category: string;
  role: string;
  vector: string;
  cue: string;
  defaultExercises: { home: string[]; gym: string[] };
}

const EXTENDED_KNOWLEDGE_BASE: Record<string, MuscleMeta> = {
  glutes: {
    name: 'Большая и средняя ягодичные',
    category: 'Таз / Бедро',
    role: 'Мощное разгибание бедра, наружная ротация, стабилизация таза',
    vector: 'Тазово-доминантный шарнир (Hip Hinge) и отведение',
    cue: 'Пиковое сжатие в верхней точке без переразгибания в поясничном лордозе.',
    defaultExercises: {
      home: ['Ягодичный мост на одной ноге', 'Болгарские сплит-приседания с наклоном корпуса', 'Махи ногой назад с пола'],
      gym: ['Ягодичный мост со штангой', 'Румынская тяга с гантелями', 'Гиперэкстензия 45° с акцентом на ягодицы']
    }
  },
  hamstrings: {
    name: 'Двуглавая мышца бедра (Хамстринг)',
    category: 'Бедро (Сзади)',
    role: 'Сгибание голени в колене и разгибание бедра в тазобедренном суставе',
    vector: 'Тазово-доминантная тяга (Hip Hinge)',
    cue: 'Отводите таз строго назад с мягкими коленями; выраженное натяжение в эксцентрической фазе.',
    defaultExercises: {
      home: ['Румынская тяга с длинной резиной', 'Сгибания ног с полотенцем/слайдером на полу'],
      gym: ['Сгибания ног лежа в тренажере', 'Румынская тяга со штангой', 'Тяга на прямых ногах']
    }
  },
  quads: {
    name: 'Четырехглавая мышца бедра (Квадрицепс)',
    category: 'Бедро (Спереди)',
    role: 'Разгибание голени в коленном суставе, наклон таза вперед',
    vector: 'Коленно-доминантное сжатие',
    cue: 'Колени направлены строго по стопе; исключите отрыв пяток и резкие ударные толчки.',
    defaultExercises: {
      home: ['Приседания с паузой 3 сек в нижней точке', 'Болгарские приседания', 'Стульчик у стены'],
      gym: ['Жим ногами под 45°', 'Гакк-приседания', 'Разгибания голени сидя в тренажере']
    }
  },
  calves: {
    name: 'Икроножная и камбаловидная',
    category: 'Голень',
    role: 'Подошвенное сгибание стопы, амортизация',
    vector: 'Вертикальный подъем стопы с фиксацией',
    cue: '1 сек растяжения в нижней точке, 2 сек акцент на носках без баллистического отскока.',
    defaultExercises: {
      home: ['Подъемы на носок на одной ноге на ступени', 'Интервальный степпер'],
      gym: ['Подъем на носки стоя в станке', 'Подъем на носки сидя со штангой на коленях']
    }
  },
  chest: {
    name: 'Большая и малая грудные',
    category: 'Грудной отдел',
    role: 'Горизонтальное приведение и сгибание плеча',
    vector: 'Вектор 30° к ключице и нейтральный горизонт',
    cue: 'Эксцентрическая фаза 2-3 сек; не опускайте локти за плоскость тела при чувствительных плечах.',
    defaultExercises: {
      home: ['Отжимания с паузой внизу 2с', 'Алмазные отжимания', 'Отжимания с возвышения'],
      gym: ['Жим гантелей на наклонной скамье 30°', 'Pec-Deck (Бабочка)', 'Кроссовер на блоках']
    }
  },
  abs: {
    name: 'Прямая мышца живота и глубокий кор',
    category: 'Кор / Поясничный отдел',
    role: 'Сгибание позвоночника, противодействие ротации, стабилизация',
    vector: 'Сагиттальное скручивание ребер к тазу',
    cue: 'Работа на выдохе; прижимайте поясницу к опоре, исключите тягу за голову руками.',
    defaultExercises: {
      home: ['Скручивания на полу с фиксацией', 'Обратные скручивания', 'Планка на предплечьях'],
      gym: ['Cable Crunch в кроссовере', 'Подъем коленей/ног в висе']
    }
  },
  lats: {
    name: 'Широчайшие мышцы спины',
    category: 'Спина',
    role: 'Приведение плеча к позвоночнику и тазу',
    vector: 'Вертикальная тяга сверху вниз / Горизонтальная тяга к поясу',
    cue: 'Движение начинается с опускания лопаток; локти направляйте в карманы без швунга корпусом.',
    defaultExercises: {
      home: ['Австралийские подтягивания под столом', 'Тяга эспандера к тазу', 'Y-T-W подъемы лежа'],
      gym: ['Тяга верхнего блока к груди', 'Тяга горизонтального блока к поясу', 'Рычажная тяга']
    }
  },
  biceps: {
    name: 'Двуглавая мышца плеча (Бицепс)',
    category: 'Плечо / Руки',
    role: 'Сгибание в локтевом суставе и супинация предплечья',
    vector: 'Изолированное сгибание локтя',
    cue: 'Локти неподвижны вдоль корпуса; максимальный доворот кисти наружу в пике.',
    defaultExercises: {
      home: ['Подтягивания обратным узким хватом', 'Сгибания с эспандером с супинацией'],
      gym: ['Подъем штанги на бицепс стоя', 'Молотки с гантелями', 'Скамья Скотта']
    }
  },
  triceps: {
    name: 'Трехглавая мышца плеча (Трицепс)',
    category: 'Плечо / Руки',
    role: 'Разгибание предплечья в локтевом суставе',
    vector: 'Линейное разгибание локтя',
    cue: 'Локти параллельны, без разведения в стороны; контролируйте верхний локаут.',
    defaultExercises: {
      home: ['Алмазные отжимания', 'Обратные отжимания от скамьи'],
      gym: ['Разгибания рук на верхнем блоке с канатом', 'Французский жим с гантелями']
    }
  },
  delts: {
    name: 'Дельтовидные мышцы (Передняя, Средняя, Задняя)',
    category: 'Плечевой пояс',
    role: 'Отведение и подъем рук в трех плоскостях',
    vector: 'Плоскость лопатки (30° вперед)',
    cue: 'Локоть чуть выше запястья при махах; избегайте чистого вертикального жима при болях.',
    defaultExercises: {
      home: ['Отжимания уголком (Pike push-ups)', 'Разведения эспандера в стороны', 'Y-T-W разведения'],
      gym: ['Жим гантелей сидя нейтральным хватом', 'Махи гантелями в стороны', 'Face Pull']
    }
  }
};

export const SegmentDetailedView: React.FC<SegmentDetailedViewProps> = ({
  segmentId,
  exercises = [],
  location = 'Дом',
  onBack
}) => {
  const normSeg = segmentId.toLowerCase();
  const [viewMode, setViewMode] = useState<'load' | 'caliper'>('load');

  const isPosteriorInitial = normSeg.includes('back') || normSeg.includes('glute') || normSeg.includes('hamstring');
  const [projection, setProjection] = useState<'anterior' | 'posterior'>(isPosteriorInitial ? 'posterior' : 'anterior');

  const getDefaultZone = () => {
    if (normSeg.includes('glute')) return 'glutes';
    if (normSeg.includes('back')) return 'lats';
    if (normSeg.includes('arm')) return 'biceps';
    if (normSeg.includes('leg')) return isPosteriorInitial ? 'hamstrings' : 'quads';
    return 'chest';
  };

  const [activeZone, setActiveZone] = useState<string>(getDefaultZone());

  useEffect(() => {
    const isPost = normSeg.includes('back') || normSeg.includes('glute') || normSeg.includes('hamstring');
    setProjection(isPost ? 'posterior' : 'anterior');
    setActiveZone(getDefaultZone());
  }, [segmentId]);

  // Данные калипера
  const [caliperSites, setCaliperSites] = useState([
    { id: 'chest', name: 'Грудная складка', valMm: 14, desc: 'Диагональная складка между подмышкой и соском' },
    { id: 'ab', name: 'Живот (околопупочная)', valMm: 24, desc: 'Вертикальная складка в 2 см латеральнее пупка' },
    { id: 'thigh', name: 'Передняя поверхность бедра', valMm: 18, desc: 'По центру передней поверхности бедра' },
    { id: 'tricep', name: 'Трицепс', valMm: 12, desc: 'По центру задней поверхности руки' },
    { id: 'subscap', name: 'Подлопаточная', valMm: 16, desc: 'Под нижним углом лопатки' },
    { id: 'supra', name: 'Подвздошная складка', valMm: 19, desc: 'Над гребнем подвздошной кости' },
  ]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('thigh');

  const sumMm = caliperSites.reduce((acc, s) => acc + s.valMm, 0);
  const bodyDensity = 1.112 - (0.00043499 * sumMm) + (0.00000055 * sumMm * sumMm) - (0.00028826 * 22);
  const fatPct = Math.max(8, Math.min(45, ((4.95 / bodyDensity) - 4.5) * 100));

  const currentMeta = EXTENDED_KNOWLEDGE_BASE[activeZone] || EXTENDED_KNOWLEDGE_BASE.quads;
  const currentSite = caliperSites.find(s => s.id === selectedSiteId) || caliperSites[0];

  const matchedExercises = exercises.filter(ex =>
    ex.target_muscle_groups.some(m => {
      const ml = m.toLowerCase();
      if (activeZone === 'glutes' && (ml.includes('ягодиц') || ml.includes('мост') || ml.includes('тяга') || ml.includes('выпад'))) return true;
      if (activeZone === 'hamstrings' && (ml.includes('бицепс бедра') || ml.includes('хамстринг') || ml.includes('тяга'))) return true;
      if (activeZone === 'quads' && (ml.includes('квадр') || ml.includes('присед') || ml.includes('выпад') || ml.includes('ноги'))) return true;
      if (activeZone === 'calves' && (ml.includes('икр') || ml.includes('голен') || ml.includes('степпер'))) return true;
      if (activeZone === 'chest' && (ml.includes('грудь') || ml.includes('отжимания') || ml.includes('жим'))) return true;
      if (activeZone === 'abs' && (ml.includes('кор') || ml.includes('пресс') || ml.includes('планка'))) return true;
      if (activeZone === 'lats' && (ml.includes('спин') || ml.includes('тяг') || ml.includes('подтягиван'))) return true;
      if (activeZone === 'biceps' && (ml.includes('бицепс') || ml.includes('руки'))) return true;
      if (activeZone === 'triceps' && (ml.includes('трицепс') || ml.includes('отжимания'))) return true;
      if (activeZone === 'delts' && (ml.includes('плеч') || ml.includes('дельт'))) return true;
      return false;
    })
  );

  const isLeg = normSeg.includes('leg') || normSeg.includes('thigh') || normSeg.includes('glute');
  const isArm = normSeg.includes('arm') || normSeg.includes('hand');
  const isTorso = !isLeg && !isArm;

  return (
    <div className="flex h-full gap-4 font-mono text-slate-200">
      {/* ЛЕВАЯ КОЛОНКА: Анатомический сканер */}
      <div className="w-[390px] bg-[#030712] border border-cyan-950/80 rounded-xl p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(3,7,18,0.9)]">
        
        {/* Панель управления проекцией и навигацией */}
        <div className="border-b border-slate-800/80 pb-3 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            {onBack ? (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-cyan-400 rounded text-xs transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>НАЗАД К ТЕЛУ</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-500">СЕГМЕНТ</span>
            )}
            <span className="text-xs font-bold text-slate-200 tracking-wider flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              {segmentId.toUpperCase()}
            </span>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 grid grid-cols-2 gap-1 bg-[#090d16] p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('load')}
                className={`py-1 rounded text-center transition-all ${
                  viewMode === 'load'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                НАГРУЗКА
              </button>
              <button
                type="button"
                onClick={() => setViewMode('caliper')}
                className={`py-1 rounded text-center transition-all ${
                  viewMode === 'caliper'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                КАЛИПЕР
              </button>
            </div>

            <button
              onClick={() => {
                const next = projection === 'anterior' ? 'posterior' : 'anterior';
                setProjection(next);
                if (isLeg) setActiveZone(next === 'posterior' ? 'glutes' : 'quads');
                if (isTorso) setActiveZone(next === 'posterior' ? 'lats' : 'chest');
              }}
              className="px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-cyan-400 rounded text-[10px] flex items-center gap-1.5 font-bold transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              {projection === 'anterior' ? 'СПЕРЕДИ' : 'СЗАДИ'}
            </button>
          </div>
        </div>

        {/* ЦЕНТРАЛЬНЫЙ СКАНЕР: Высокодетализированный анатомический срез */}
        <div className="flex-1 flex items-center justify-center my-auto min-h-[380px] w-full relative">
          
          {/* СЕГМЕНТ 1: НОГА / ТАЗ (ИЗОЛИРОВАННЫЙ ЗУМ) */}
          {isLeg && (
            <svg viewBox="0 0 160 300" className="w-full h-full max-h-[390px] drop-shadow-[0_0_20px_rgba(6,182,212,0.15)]">
              {projection === 'anterior' ? (
                /* НОГА СПЕРЕДИ (Таз, Квадрицепс, Колено, Голень) */
                <g>
                  {/* Контур тазового гребня */}
                  <path d="M 45 20 Q 80 32 115 20 L 110 40 Q 80 50 50 40 Z" fill="rgba(6,182,212,0.12)" stroke="#0891b2" strokeWidth="1" />

                  {/* Квадрицепс (Латеральная + Медиальная + Прямая бедра) */}
                  <path
                    d="M 50 45 C 38 90 42 145 58 175 L 80 175 C 84 135 84 85 80 45 Z"
                    fill={activeZone === 'quads' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'quads' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('quads')}
                  />
                  <path
                    d="M 80 45 C 84 85 84 135 80 175 L 102 175 C 118 145 122 90 110 45 Z"
                    fill={activeZone === 'quads' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'quads' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('quads')}
                  />
                  <text x="56" y="115" fill="#e2e8f0" fontSize="9" fontWeight="bold">КВАДРИЦЕПС</text>

                  {/* Надколенник (Колено) */}
                  <circle cx="80" cy="188" r="8" fill="rgba(15,23,42,0.9)" stroke="#0891b2" strokeWidth="1.5" />
                  <text x="73" y="191" fill="#64748b" fontSize="6">КОЛЕНО</text>

                  {/* Большеберцовая и голень */}
                  <path
                    d="M 60 200 C 50 230 52 265 65 285 L 95 285 C 108 265 110 230 100 200 Z"
                    fill={activeZone === 'calves' ? 'rgba(34,211,238,0.65)' : 'rgba(6,182,212,0.22)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'calves' ? 2 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('calves')}
                  />
                  <text x="68" y="245" fill="#e2e8f0" fontSize="8" fontWeight="bold">ГОЛЕНЬ</text>

                  {/* Калипер: Бедро */}
                  {viewMode === 'caliper' && (
                    <g className="cursor-pointer" onClick={() => setSelectedSiteId('thigh')}>
                      <circle cx="80" cy="110" r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                      <text x="92" y="114" fill="#fbbf24" fontSize="10" fontWeight="bold">Бедро: 18мм</text>
                    </g>
                  )}
                </g>
              ) : (
                /* НОГА СЗАДИ (Ягодичные, Хамстринг, Икры) */
                <g>
                  {/* Большая ягодичная мышца (Gluteus Maximus) */}
                  <path
                    d="M 45 25 C 35 65 55 95 80 95 C 105 95 125 65 115 25 Z"
                    fill={activeZone === 'glutes' ? 'rgba(34,211,238,0.75)' : 'rgba(6,182,212,0.3)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'glutes' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('glutes')}
                  />
                  <line x1="80" y1="25" x2="80" y2="95" stroke="#0891b2" strokeWidth="1" strokeDasharray="2 2" />
                  <text x="60" y="65" fill="#ffffff" fontSize="10" fontWeight="bold">ЯГОДИЦЫ</text>

                  {/* Задняя поверхность бедра (Бицепс бедра / Полусухожильная) */}
                  <path
                    d="M 52 100 C 46 135 52 165 62 180 L 98 180 C 108 165 114 135 108 100 Z"
                    fill={activeZone === 'hamstrings' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'hamstrings' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('hamstrings')}
                  />
                  <text x="56" y="145" fill="#e2e8f0" fontSize="9" fontWeight="bold">ХАМСТРИНГ</text>

                  {/* Подколенная ямка */}
                  <circle cx="80" cy="190" r="6" fill="rgba(15,23,42,0.9)" stroke="#0891b2" />

                  {/* Икроножная мышца (Медиальная и латеральная головки) */}
                  <path
                    d="M 58 200 C 46 225 50 255 64 285 L 96 285 C 110 255 114 225 102 200 Z"
                    fill={activeZone === 'calves' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'calves' ? 2 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('calves')}
                  />
                  <text x="70" y="245" fill="#e2e8f0" fontSize="8" fontWeight="bold">ИКРЫ</text>
                </g>
              )}
            </svg>
          )}

          {/* СЕГМЕНТ 2: РУКА (ИЗОЛИРОВАННЫЙ ЗУМ) */}
          {isArm && (
            <svg viewBox="0 0 160 300" className="w-full h-full max-h-[390px] drop-shadow-[0_0_20px_rgba(6,182,212,0.15)]">
              {/* Дельтовидная мышца */}
              <path
                d="M 55 20 C 80 10 105 20 115 50 C 105 70 55 70 45 50 Z"
                fill={activeZone === 'delts' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                stroke="#22d3ee"
                strokeWidth={activeZone === 'delts' ? 2.5 : 1.2}
                className="cursor-pointer transition-all hover:brightness-125"
                onClick={() => setActiveZone('delts')}
              />
              <text x="66" y="45" fill="#e2e8f0" fontSize="9" fontWeight="bold">ДЕЛЬТА</text>

              {/* Бицепс (Передняя проекция) */}
              <path
                d="M 52 75 C 44 110 48 145 62 165 L 88 165 C 92 135 90 95 84 75 Z"
                fill={activeZone === 'biceps' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                stroke="#22d3ee"
                strokeWidth={activeZone === 'biceps' ? 2.5 : 1.2}
                className="cursor-pointer transition-all hover:brightness-125"
                onClick={() => setActiveZone('biceps')}
              />
              <text x="56" y="125" fill="#e2e8f0" fontSize="8" fontWeight="bold">БИЦЕПС</text>

              {/* Трицепс */}
              <path
                d="M 86 75 C 92 105 92 135 88 165 L 108 165 C 118 140 118 105 108 75 Z"
                fill={activeZone === 'triceps' ? 'rgba(34,211,238,0.7)' : 'rgba(6,182,212,0.25)'}
                stroke="#22d3ee"
                strokeWidth={activeZone === 'triceps' ? 2.5 : 1.2}
                className="cursor-pointer transition-all hover:brightness-125"
                onClick={() => setActiveZone('triceps')}
              />
              <text x="91" y="125" fill="#94a3b8" fontSize="7" fontWeight="bold">ТРИЦЕПС</text>

              {/* Локтевой сустав */}
              <circle cx="80" cy="175" r="7" fill="rgba(15,23,42,0.9)" stroke="#0891b2" />

              {/* Предплечье */}
              <path
                d="M 60 185 C 50 215 54 255 68 285 L 92 285 C 106 255 110 215 100 185 Z"
                fill="rgba(6,182,212,0.22)"
                stroke="#22d3ee"
                strokeWidth="1.2"
              />
              <text x="63" y="240" fill="#e2e8f0" fontSize="8" fontWeight="bold">ПРЕДПЛЕЧЬЕ</text>

              {/* Точка калипера трицепса */}
              {viewMode === 'caliper' && (
                <g className="cursor-pointer" onClick={() => setSelectedSiteId('tricep')}>
                  <circle cx="102" cy="120" r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                  <text x="114" y="124" fill="#fbbf24" fontSize="10" fontWeight="bold">12 мм</text>
                </g>
              )}
            </svg>
          )}

          {/* СЕГМЕНТ 3: ТОРС / СПИНА */}
          {isTorso && (
            <svg viewBox="0 0 160 300" className="w-full h-full max-h-[390px] drop-shadow-[0_0_20px_rgba(6,182,212,0.15)]">
              {projection === 'anterior' ? (
                /* ТОРС СПЕРЕДИ: Грудные + 6 кубиков пресса */
                <g>
                  {/* Большая грудная (левая и правая) */}
                  <path
                    d="M 80 40 L 40 50 C 30 80 45 105 80 105 Z"
                    fill={activeZone === 'chest' ? 'rgba(34,211,238,0.75)' : 'rgba(6,182,212,0.28)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'chest' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('chest')}
                  />
                  <path
                    d="M 80 40 L 120 50 C 130 80 115 105 80 105 Z"
                    fill={activeZone === 'chest' ? 'rgba(34,211,238,0.75)' : 'rgba(6,182,212,0.28)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'chest' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('chest')}
                  />
                  <text x="64" y="80" fill="#ffffff" fontSize="10" fontWeight="bold">ГРУДЬ</text>

                  {/* 6 анатомических сегментов пресса */}
                  {[
                    { x: 67, y: 115, w: 11, h: 18 },
                    { x: 82, y: 115, w: 11, h: 18 },
                    { x: 67, y: 138, w: 11, h: 18 },
                    { x: 82, y: 138, w: 11, h: 18 },
                    { x: 67, y: 161, w: 11, h: 22 },
                    { x: 82, y: 161, w: 11, h: 22 },
                  ].map((p, i) => (
                    <rect
                      key={i}
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      rx="3"
                      fill={activeZone === 'abs' ? 'rgba(52,211,153,0.75)' : 'rgba(52,211,153,0.3)'}
                      stroke="#34d399"
                      strokeWidth={activeZone === 'abs' ? 2 : 1}
                      className="cursor-pointer transition-all hover:brightness-125"
                      onClick={() => setActiveZone('abs')}
                    />
                  ))}
                  <text x="66" y="202" fill="#34d399" fontSize="9" fontWeight="bold">ПРЕСС</text>

                  {/* Точки калипера спереди */}
                  {viewMode === 'caliper' && (
                    <>
                      <g className="cursor-pointer" onClick={() => setSelectedSiteId('chest')}>
                        <circle cx="50" cy="70" r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                        <text x="12" y="74" fill="#fbbf24" fontSize="9" fontWeight="bold">Грудь: 14мм</text>
                      </g>
                      <g className="cursor-pointer" onClick={() => setSelectedSiteId('ab')}>
                        <circle cx="102" cy="150" r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                        <text x="112" y="154" fill="#fbbf24" fontSize="9" fontWeight="bold">Живот: 24мм</text>
                      </g>
                    </>
                  )}
                </g>
              ) : (
                /* ТОРС СЗАДИ: Трапеции + Широчайшие */
                <g>
                  <polygon
                    points="80,30 50,60 110,60"
                    fill="rgba(6,182,212,0.25)"
                    stroke="#0891b2"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M 50 65 C 35 105 45 155 80 180 C 115 155 125 105 110 65 Z"
                    fill={activeZone === 'lats' ? 'rgba(34,211,238,0.75)' : 'rgba(6,182,212,0.3)'}
                    stroke="#22d3ee"
                    strokeWidth={activeZone === 'lats' ? 2.5 : 1.2}
                    className="cursor-pointer transition-all hover:brightness-125"
                    onClick={() => setActiveZone('lats')}
                  />
                  <text x="56" y="125" fill="#ffffff" fontSize="10" fontWeight="bold">ШИРОЧАЙШИЕ</text>

                  {/* Точка калипера лопатки */}
                  {viewMode === 'caliper' && (
                    <g className="cursor-pointer" onClick={() => setSelectedSiteId('subscap')}>
                      <circle cx="48" cy="115" r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                      <text x="8" y="118" fill="#fbbf24" fontSize="9" fontWeight="bold">Лопатка: 16мм</text>
                    </g>
                  )}
                </g>
              )}
            </svg>
          )}
        </div>

        {/* Нижний статус-бар */}
        <div className="border-t border-slate-800/80 pt-2 text-center text-[10px]">
          {viewMode === 'caliper' ? (
            <span className="text-amber-400 font-bold tracking-wider">
              ТОЧКА ЗАМЕРА: {currentSite.name.toUpperCase()} ({currentSite.valMm} мм)
            </span>
          ) : (
            <span className="text-cyan-400 font-bold tracking-wider">
              АКТИВНЫЙ ФОКУС: {currentMeta.name.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА: Протокол нагрузки или Калиперометрия */}
      <div className="flex-1 bg-[#090d16] border border-cyan-950/80 rounded-xl p-4 flex flex-col overflow-y-auto custom-scrollbar shadow-[0_0_25px_rgba(3,7,18,0.9)]">
        {viewMode === 'caliper' ? (
          /* КАЛИПЕРОМЕТРИЯ */
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
              <div>
                <span className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Ruler className="w-4 h-4" /> КАЛИПЕРОМЕТРИЯ // JACKSON-POLLOCK
                </span>
                <div className="text-xs text-slate-400 mt-0.5">Оценка состава тела по кожно-жировым складкам</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-400">{fatPct.toFixed(1)}%</div>
                <div className="text-[10px] text-slate-500">РАСЧЕТНЫЙ ЖИР</div>
              </div>
            </div>

            <div className="p-3 bg-[#030712] border border-amber-500/40 rounded-lg space-y-2">
              <div className="text-xs font-bold text-slate-200">{currentSite.name}</div>
              <div className="text-[11px] text-slate-400 leading-relaxed">{currentSite.desc}</div>
              <div className="flex items-center gap-3 pt-2">
                <label className="text-xs text-amber-400 font-bold">ТОЛЩИНА СКЛАДКИ (ММ):</label>
                <input
                  type="number"
                  min="2"
                  max="60"
                  value={currentSite.valMm}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 0);
                    setCaliperSites(caliperSites.map(s => s.id === currentSite.id ? { ...s, valMm: val } : s));
                  }}
                  className="w-20 bg-[#090d16] border border-amber-500/50 rounded px-2 py-1 text-amber-300 font-bold text-sm outline-none focus:border-amber-400"
                />
                <span className="text-xs text-slate-500">мм</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {caliperSites.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSiteId(s.id)}
                  className={`p-2.5 rounded border text-left flex justify-between items-center transition-all ${
                    s.id === selectedSiteId
                      ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                      : 'border-slate-800 bg-[#030712] hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs text-slate-200 font-bold">{s.name}</span>
                  <span className="text-sm font-bold text-amber-400">{s.valMm} <span className="text-[10px]">мм</span></span>
                </button>
              ))}
            </div>

            <div className="p-3 bg-[#030712] border border-slate-800 rounded-lg text-xs text-slate-400 space-y-1">
              <div className="text-cyan-400 font-bold text-[10px] flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                МЕТАБОЛИЧЕСКИЙ ВЕРДИКТ
              </div>
              <div>Сумма складок: <span className="text-slate-200 font-bold">{sumMm} мм</span>. Плотность тела: <span className="text-slate-200 font-bold">{bodyDensity.toFixed(4)} г/см³</span>.</div>
            </div>
          </div>
        ) : (
          /* НАГРУЗКА И НАУЧНЫЕ ВЫВОДЫ */
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
              <div>
                <span className="text-sm font-bold text-cyan-300">{currentMeta.name}</span>
                <div className="text-xs text-slate-400 mt-0.5">
                  Зона: <span className="text-slate-200">{currentMeta.category}</span> | Вектор: {currentMeta.vector}
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                {location.toUpperCase()}
              </span>
            </div>

            <div className="p-3 bg-[#030712] border border-cyan-900/50 rounded-lg space-y-1.5">
              <div className="text-[10px] text-cyan-400 font-bold flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                БИОМЕХАНИКА И ИССЛЕДОВАНИЯ ИЗ БАЗЫ ЗНАНИЙ
              </div>
              <div className="text-xs text-slate-300 leading-relaxed">{currentMeta.cue}</div>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Функция: <span className="text-slate-300">{currentMeta.role}</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Dumbbell className="w-4 h-4 text-cyan-400" />
                  В ТЕКУЩЕМ ПЛАНЕ ({matchedExercises.length})
                </span>
              </div>

              {matchedExercises.length > 0 ? (
                <div className="space-y-2">
                  {matchedExercises.map(ex => (
                    <div key={ex.id} className="p-2.5 bg-[#030712] border border-cyan-800/60 rounded flex justify-between items-center">
                      <div>
                        <div className="text-xs font-bold text-slate-100">{ex.exercise_name}</div>
                        <div className="text-[10px] text-cyan-400 mt-0.5">
                          {ex.sets} сета × {ex.reps_or_duration} | RPE: {ex.rpe_target}
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-[#030712] border border-slate-800/80 rounded text-xs text-slate-400 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-bold">
                    <AlertCircle className="w-3.5 h-3.5" /> В сегодняшнем сплите прямая нагрузка не запланирована
                  </div>
                  <div>Рекомендованный арсенал ({location}):</div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    {(location === 'Зал' ? currentMeta.defaultExercises.gym : currentMeta.defaultExercises.home).map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
