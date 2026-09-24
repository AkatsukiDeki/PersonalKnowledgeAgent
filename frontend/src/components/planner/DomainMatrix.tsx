import React from 'react';
import { PlannerGoal, PlannerDomain } from '../../api/planner';
import { Plus } from 'lucide-react';

interface DomainMatrixProps {
  goals: PlannerGoal[];
  domains: PlannerDomain[];
  onCreateGoal?: (domain_id: string) => void;
  onGoalClick?: (goal: PlannerGoal) => void;
}

export const DomainMatrix: React.FC<DomainMatrixProps> = ({ goals, domains, onCreateGoal, onGoalClick }) => {
  return (
    <div className="flex flex-row overflow-x-auto gap-4 p-4 h-full custom-scrollbar">
      {domains.map((domain) => {
        const domainGoals = goals.filter(g => g.domain_id === domain.id && !g.parent_goal_id);
        
        // Use color mapping
        const colorClass = `bg-${domain.color}-900/20 border-${domain.color}-500/50 text-${domain.color}-500`;
        const borderClass = `border-${domain.color}-500/50`;
        const bgClass = `bg-${domain.color}-900/20`;
        
        return (
          <div key={domain.id} className={`flex flex-col min-w-[320px] rounded-xl border ${borderClass} ${bgClass} overflow-hidden shadow-lg`}>
            <div className="p-3 border-b border-white/10 flex justify-between items-center bg-black/20">
              <h3 className="font-semibold text-white/90">{domain.name}</h3>
              <button 
                onClick={() => onCreateGoal && onCreateGoal(domain.id)}
                className={`p-1 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white/90`}
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
              {domainGoals.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/30 text-sm italic">
                  Нет активных целей
                </div>
              ) : (
                domainGoals.map(goal => (
                  <div 
                    key={goal.id}
                    onClick={() => onGoalClick && onGoalClick(goal)}
                    className="p-3 rounded-lg bg-black/40 border border-white/5 hover:border-white/20 cursor-pointer transition-all hover:translate-y-[-2px]"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-sm font-medium text-white/90">{goal.title}</h4>
                      {goal.cadence === 'sprint' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">Спринт</span>}
                    </div>
                    
                    <div className="w-full bg-white/5 rounded-full h-1.5 mt-3">
                      <div 
                        className={`h-1.5 rounded-full bg-${domain.color}-500`} 
                        style={{ width: `${goal.progress_pct}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
