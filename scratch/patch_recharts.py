import re

path = r'c:\Users\Andrey\PycharmProjects\PKA\frontend\src\components\kinetics\OverloadCharts.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add Recharts import
if "import { BarChart" not in content:
    content = content.replace(
        "import { Activity, Dumbbell, BarChart3, TrendingUp, Loader2 } from 'lucide-react';",
        "import { Activity, Dumbbell, BarChart3, TrendingUp, Loader2 } from 'lucide-react';\nimport { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';"
    )

# Find the Weekly Tonnage rendering block
old_render = """        {weeks.length > 0 ? (
          <div className="relative w-full h-56">
             <svg viewBox={`0 0 ${Math.max(400, weeks.length * 60)} 200`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
               {/* Compute max total tonnage per week to scale */}
               {(() => {
                 const weeklyTotals = weeks.map(w => {
                   return normalizedTonnage.filter(t => t.week_start === w).reduce((acc, curr) => acc + curr.tonnage_kg, 0);
                 });
                 const maxTotal = Math.max(...weeklyTotals, 1000);
                 
                 return weeks.map((w, wIdx) => {
                   const weekData = normalizedTonnage.filter(t => t.week_start === w);
                   const xOffset = wIdx * (400 / Math.max(weeks.length, 5)) + 20;
                   const barWidth = Math.min(30, 300 / Math.max(weeks.length, 5));
                   
                   let currentY = 200;
                   return (
                     <g key={w}>
                       {weekData.map((d, i) => {
                         const barHeight = (d.tonnage_kg / maxTotal) * 180;
                         const mColor = muscleColors[muscleGroups.indexOf(d.muscle_group) % muscleColors.length];
                         const y = currentY - barHeight;
                         const rect = (
                           <rect 
                             key={d.muscle_group}
                             x={xOffset} 
                             y={y} 
                             width={barWidth} 
                             height={barHeight} 
                             fill={mColor} 
                             rx={i === weekData.length - 1 ? 4 : 0} // top rounding only
                           />
                         );
                         currentY = y;
                         return rect;
                       })}
                       <text x={xOffset + barWidth/2} y={currentY - 5} fill="#cbd5e1" fontSize="9" textAnchor="middle" fontWeight="bold">
                         {(weeklyTotals[wIdx]/1000).toFixed(1)}т
                       </text>
                       <text x={xOffset + barWidth/2} y={215} fill="#64748b" fontSize="8" textAnchor="middle">
                         {new Date(w).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                       </text>
                     </g>
                   );
                 });
               })()}
             </svg>
          </div>
        ) : ("""

new_render = """        {weeks.length > 0 ? (
          <div className="w-full h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={weeks.map(w => {
                  const weekData = normalizedTonnage.filter(t => t.week_start === w);
                  const obj: any = { week: new Date(w).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) };
                  weekData.forEach(d => {
                    obj[d.muscle_group] = Number((d.tonnage_kg / 1000).toFixed(1));
                  });
                  return obj;
                })} 
                margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}т`} />
                <Tooltip 
                  cursor={{ fill: '#1e293b', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                  itemStyle={{ fontSize: '12px' }}
                  formatter={(value: number) => [`${value} т`, '']}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                {muscleGroups.map((m, i) => (
                  <Bar 
                    key={m} 
                    dataKey={m} 
                    stackId="a" 
                    fill={muscleColors[i % muscleColors.length]} 
                    maxBarSize={40}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : ("""

if old_render in content:
    content = content.replace(old_render, new_render)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched successfully!")
else:
    print("Could not find the old block to replace!")
