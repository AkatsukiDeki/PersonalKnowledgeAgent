import React, { useState, useEffect } from 'react';
import { conflictsApi, ConflictResponse, ClaimInfo } from '../../api/conflicts';
import { ShieldAlert, CheckCircle2, Clock, Columns } from 'lucide-react';
import { ConflictCard } from './ConflictCard';
import { SupersedeConfirmationModal } from './SupersedeConfirmationModal';
import { CoexistContextModal } from './CoexistContextModal';
import { VersionEditModal } from './VersionEditModal';

export const ConflictResolutionCenter: React.FC = () => {
  const [conflicts, setConflicts] = useState<ConflictResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Modal states
  const [activeConflictId, setActiveConflictId] = useState<string | null>(null);
  
  const [supersedeModalOpen, setSupersedeModalOpen] = useState(false);
  const [supersedeWinnerId, setSupersedeWinnerId] = useState<string | null>(null);
  const [supersedeLoserId, setSupersedeLoserId] = useState<string | null>(null);
  
  const [coexistModalOpen, setCoexistModalOpen] = useState(false);
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [claimToEdit, setClaimToEdit] = useState<ClaimInfo | null>(null);

  const loadConflicts = async () => {
    setIsLoading(true);
    try {
      const data = await conflictsApi.getConflicts(filter !== 'all' ? filter : undefined);
      setConflicts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConflicts();
  }, [filter]);

  const dispatchUpdateEvent = () => {
    window.dispatchEvent(new Event('conflictsUpdated'));
  };

  // --- Actions ---
  const handleOpenSupersede = (conflictId: string, winnerId: string, loserId: string) => {
    setActiveConflictId(conflictId);
    setSupersedeWinnerId(winnerId);
    setSupersedeLoserId(loserId);
    setSupersedeModalOpen(true);
  };

  const executeSupersede = async () => {
    if (!activeConflictId || !supersedeWinnerId) return;
    setIsSubmitting(true);
    try {
      await conflictsApi.resolveConflict(activeConflictId, {
        strategy: 'supersede',
        winner_claim_id: supersedeWinnerId,
        resolution_notes: "User explicitly superseded opponent"
      });
      setSupersedeModalOpen(false);
      await loadConflicts();
      dispatchUpdateEvent();
    } catch (e) {
      alert("Error resolving conflict");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCoexist = (conflictId: string) => {
    setActiveConflictId(conflictId);
    setCoexistModalOpen(true);
  };

  const executeCoexist = async (notes: string) => {
    if (!activeConflictId) return;
    setIsSubmitting(true);
    try {
      await conflictsApi.resolveConflict(activeConflictId, {
        strategy: 'coexist',
        resolution_notes: notes
      });
      setCoexistModalOpen(false);
      await loadConflicts();
      dispatchUpdateEvent();
    } catch (e) {
      alert("Error resolving conflict");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (conflictId: string, claim: ClaimInfo) => {
    setActiveConflictId(conflictId);
    setClaimToEdit(claim);
    setEditModalOpen(true);
  };

  const executeEdit = async (claimId: string, newContent: string) => {
    if (!activeConflictId) return;
    setIsSubmitting(true);
    try {
      await conflictsApi.resolveConflict(activeConflictId, {
        strategy: 'edit',
        edited_claims: [{ claim_id: claimId, new_content: newContent }]
      });
      setEditModalOpen(false);
      await loadConflicts();
      dispatchUpdateEvent();
    } catch (e) {
      alert("Error saving edit");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden h-full">
      <div className="bg-zinc-900/40 px-6 py-4 border-b border-zinc-800 shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <ShieldAlert className="text-amber-500" />
            Conflict Resolution Center
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Review and safely resolve contradictions found in L4 graph.
          </p>
        </div>
        
        <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setFilter('unresolved')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${filter === 'unresolved' ? 'bg-zinc-800 text-zinc-200 shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Unresolved
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${filter === 'resolved' ? 'bg-zinc-800 text-zinc-200 shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Resolved
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${filter === 'all' ? 'bg-zinc-800 text-zinc-200 shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-zinc-500">
            <Clock className="animate-spin mr-2" size={18} /> Loading conflicts...
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500 bg-zinc-900/50 rounded-lg border border-dashed border-zinc-800">
            <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
            <p className="text-lg font-medium text-zinc-300">No conflicts found</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {conflicts.map(conflict => {
              const isResolved = conflict.status === 'resolved';
              return (
                <div key={conflict.id} className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className={`px-4 py-3 border-b border-zinc-800 flex justify-between items-center ${isResolved ? 'bg-emerald-900/20' : 'bg-amber-900/20'}`}>
                    <div className="flex items-center gap-2">
                      {isResolved ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : (
                        <ShieldAlert size={16} className="text-amber-500" />
                      )}
                      <span className={`text-sm font-bold uppercase tracking-wider ${isResolved ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {conflict.status}
                      </span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {new Date(conflict.created_at).toLocaleString()}
                      </span>
                    </div>
                    {conflict.resolution_summary && (
                      <div className="text-xs text-zinc-300 font-medium bg-zinc-800/50 px-2 py-1 rounded">
                        Note: {conflict.resolution_summary}
                      </div>
                    )}
                  </div>

                  <ConflictCard
                    claimA={conflict.claim_a}
                    claimB={conflict.claim_b}
                    isResolved={isResolved}
                    onSupersede={(winnerId) => handleOpenSupersede(
                      conflict.id, 
                      winnerId, 
                      winnerId === conflict.claim_a.id ? conflict.claim_b.id : conflict.claim_a.id
                    )}
                    onEdit={(claim) => handleOpenEdit(conflict.id, claim)}
                  />

                  {/* Footer actions for unresolved */}
                  {!isResolved && (
                    <div className="px-4 py-3 bg-zinc-900/50 border-t border-zinc-800 flex justify-center">
                      <button
                        onClick={() => handleOpenCoexist(conflict.id)}
                        className="px-6 py-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-sm text-sm font-medium text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 transition-colors"
                      >
                        <Columns size={16} />
                        Acknowledge Contextual Coexistence
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SupersedeConfirmationModal
        isOpen={supersedeModalOpen}
        isSubmitting={isSubmitting}
        winnerId={supersedeWinnerId || ''}
        loserId={supersedeLoserId || ''}
        onClose={() => setSupersedeModalOpen(false)}
        onConfirm={executeSupersede}
      />

      <CoexistContextModal
        isOpen={coexistModalOpen}
        isSubmitting={isSubmitting}
        onClose={() => setCoexistModalOpen(false)}
        onConfirm={executeCoexist}
      />

      <VersionEditModal
        isOpen={editModalOpen}
        isSubmitting={isSubmitting}
        claimToEdit={claimToEdit}
        onClose={() => setEditModalOpen(false)}
        onConfirm={executeEdit}
      />
    </div>
  );
};
