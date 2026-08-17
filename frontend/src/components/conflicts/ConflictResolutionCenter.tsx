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
    <div className="flex-1 flex flex-col bg-zinc-50 overflow-hidden h-full">
      <div className="bg-white px-6 py-4 border-b border-gray-200 shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <ShieldAlert className="text-amber-500" />
            Conflict Resolution Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and safely resolve contradictions found in L4 graph.
          </p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg border">
          <button
            onClick={() => setFilter('unresolved')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors \${filter === 'unresolved' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Unresolved
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors \${filter === 'resolved' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Resolved
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors \${filter === 'all' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-32 text-gray-500">
            <Clock className="animate-spin mr-2" size={18} /> Loading conflicts...
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white rounded-lg border border-dashed">
            <CheckCircle2 size={48} className="text-green-400 mb-4" />
            <p className="text-lg font-medium text-gray-700">No conflicts found</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {conflicts.map(conflict => {
              const isResolved = conflict.status === 'resolved';
              return (
                <div key={conflict.id} className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className={`px-4 py-3 border-b flex justify-between items-center \${isResolved ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className="flex items-center gap-2">
                      {isResolved ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : (
                        <ShieldAlert size={16} className="text-amber-600" />
                      )}
                      <span className={`text-sm font-bold uppercase tracking-wider \${isResolved ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {conflict.status}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {new Date(conflict.created_at).toLocaleString()}
                      </span>
                    </div>
                    {conflict.resolution_summary && (
                      <div className="text-xs text-zinc-700 font-medium bg-white/50 px-2 py-1 rounded">
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
                    <div className="px-4 py-3 bg-zinc-50 border-t flex justify-center">
                      <button
                        onClick={() => handleOpenCoexist(conflict.id)}
                        className="px-6 py-2 bg-white border border-zinc-300 rounded shadow-sm text-sm font-medium text-zinc-700 hover:bg-zinc-100 flex items-center gap-2 transition-colors"
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
