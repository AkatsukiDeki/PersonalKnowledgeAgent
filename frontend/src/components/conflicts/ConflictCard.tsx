import React from 'react';
import { ClaimInfo } from '../../api/conflicts';

interface Props {
  claimA: ClaimInfo;
  claimB: ClaimInfo;
  isResolved: boolean;
  onSupersede: (winnerId: string) => void;
  onEdit: (claim: ClaimInfo) => void;
}

export function ConflictCard({ claimA, claimB, isResolved, onSupersede, onEdit }: Props) {
  const renderClaim = (claim: ClaimInfo, opponentId: string) => {
    return (
      <div className={`flex-1 p-4 rounded-lg border flex flex-col \${claim.is_active ? 'bg-white border-zinc-200' : 'bg-zinc-50 border-zinc-200 opacity-75'}`}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] uppercase font-bold rounded border border-blue-200">
              {claim.claim_type}
            </span>
            {claim.category && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] uppercase font-bold rounded border border-purple-200">
                {claim.category}
              </span>
            )}
            {claim.source_domain && (
              <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] uppercase font-bold rounded border border-zinc-200">
                {claim.source_domain}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {!claim.is_active && (
              <span className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200 uppercase">
                Superseded
              </span>
            )}
            <span className="text-[10px] text-zinc-400 font-medium font-mono">
              Conf: {(claim.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <p className="text-zinc-800 text-sm mb-4 leading-relaxed font-medium flex-1">
          "{claim.content}"
        </p>

        <div className="mt-auto">
          <div className="text-[11px] text-zinc-500 bg-zinc-50 p-2 rounded border border-zinc-100 mb-4">
            <span className="font-semibold text-zinc-600">Source:</span> {claim.source_title || 'Unknown'}
          </div>

          {!isResolved && (
            <div className="flex gap-2">
              <button
                onClick={() => onSupersede(claim.id)}
                className="flex-1 py-1.5 px-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded transition-colors"
              >
                This Supersedes
              </button>
              <button
                onClick={() => onEdit(claim)}
                className="py-1.5 px-3 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 p-4">
      {renderClaim(claimA, claimB.id)}
      {renderClaim(claimB, claimA.id)}
    </div>
  );
}
