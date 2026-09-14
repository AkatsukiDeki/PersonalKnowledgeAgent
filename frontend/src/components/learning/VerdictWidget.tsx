import React from 'react';
import clsx from 'clsx';
import { Target, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

interface VerdictWidgetProps {
  score: number;
}

export const VerdictWidget: React.FC<VerdictWidgetProps> = ({ score }) => {
  let statusColor = 'bg-zinc-800 border-zinc-700 text-zinc-400';
  let Icon = Target;
  let statusText = 'Ожидание';
  let progressColor = 'bg-zinc-600';

  if (score >= 80) {
    statusColor = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    Icon = CheckCircle2;
    statusText = 'Тема зачтена';
    progressColor = 'bg-emerald-500';
  } else if (score >= 50) {
    statusColor = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
    Icon = AlertTriangle;
    statusText = 'Нужно повторение (SM-2)';
    progressColor = 'bg-amber-500';
  } else {
    statusColor = 'bg-rose-500/10 border-rose-500/30 text-rose-400';
    Icon = AlertCircle;
    statusText = 'Критические ошибки (SM-2)';
    progressColor = 'bg-rose-500';
  }

  return (
    <div className={clsx("mt-4 p-4 rounded-xl border flex flex-col gap-3", statusColor)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" />
          <span className="font-semibold text-sm uppercase tracking-wider">Вердикт Экзаменатора</span>
        </div>
        <div className="text-xl font-bold font-mono">
          {score}%
        </div>
      </div>
      
      <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
        <div 
          className={clsx("h-full rounded-full transition-all duration-1000", progressColor)} 
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      
      <div className="text-xs font-medium opacity-90">
        {statusText}
      </div>
    </div>
  );
};
