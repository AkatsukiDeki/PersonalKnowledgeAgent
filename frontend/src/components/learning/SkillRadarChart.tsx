import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

export interface SkillMetric {
  subject: string;
  masteryScore: number; // 0 - 100
  totalClaims?: number;
}

interface SkillRadarChartProps {
  data: SkillMetric[];
}

export const SkillRadarChart: React.FC<SkillRadarChartProps> = ({ data }) => {
  const chartData =
    data.length >= 3
      ? data
      : [
          ...data,
          // Фоллбек-заглушки для корректной отрисовки полигона (требуется минимум 3 оси)
          { subject: 'Security', masteryScore: 20 },
          { subject: 'DevOps', masteryScore: 40 },
          { subject: 'Backend', masteryScore: 60 },
        ].slice(0, Math.max(data.length, 3));

  return (
    <div className="bg-[#0a0a0f]/90 border border-zinc-800/60 rounded-xl p-5 flex flex-col justify-between backdrop-blur-xl shadow-[0_0_30px_rgba(99,102,241,0.04)] h-full">
      <div className="w-full flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
            Паутина компетенций (Skill Spider)
          </span>
        </div>
        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-500/30 px-2 py-0.5 rounded-full">
          Mastery Matrix
        </span>
      </div>

      <div className="w-full h-56 relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="75%">
            <PolarGrid stroke="#27272a" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Mastery Score"
              dataKey="masteryScore"
              stroke="#6366f1"
              strokeWidth={2}
              fill="#6366f1"
              fillOpacity={0.35}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="w-full pt-2 border-t border-zinc-900 flex justify-between items-center text-[10px] font-mono text-zinc-500">
        <span>Метрика: Освоение тем в %</span>
        <span className="text-indigo-400 font-medium">Граф знаний L2/L3</span>
      </div>
    </div>
  );
};

export const GlobalSkillRadarChart: React.FC = () => {
  const [data, setData] = React.useState<SkillMetric[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Import subjectsApi here to avoid circular dependencies if any, or just import it at top
    import('../../api/subjects').then(({ subjectsApi }) => {
      subjectsApi.getSubjects().then(subjects => {
        setData(subjects.map(s => ({
          subject: s.title,
          masteryScore: s.mastery_score || 0
        })));
        setLoading(false);
      }).catch(e => {
        console.error('Failed to load subjects for radar', e);
        setLoading(false);
      });
    });
  }, []);

  if (loading) {
    return (
      <div className="bg-[#0a0a0f]/90 border border-zinc-800/60 rounded-xl p-5 flex items-center justify-center h-full min-h-[250px]">
        <span className="text-zinc-500 font-mono text-sm animate-pulse">Loading competency profile...</span>
      </div>
    );
  }

  return <SkillRadarChart data={data} />;
};
