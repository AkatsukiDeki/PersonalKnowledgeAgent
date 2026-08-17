import React, { useState, useEffect } from 'react';
import { Edit2, X } from 'lucide-react';
import { ClaimInfo } from '../../api/conflicts';

interface Props {
  claimToEdit: ClaimInfo | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (claimId: string, newContent: string) => void;
}

export function VersionEditModal({ claimToEdit, isOpen, isSubmitting, onClose, onConfirm }: Props) {
  const [content, setContent] = useState('');

  useEffect(() => {
    if (claimToEdit) {
      setContent(claimToEdit.content);
    }
  }, [claimToEdit]);

  if (!isOpen || !claimToEdit) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-emerald-50">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <Edit2 size={18} />
            Edit Claim Version
          </div>
          <button onClick={onClose} className="text-emerald-400 hover:text-emerald-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-5">
          <p className="text-sm text-zinc-700 mb-4">
            Отредактируйте утверждение для создания новой версии (Claim v2). Исходная версия останется в истории со статусом <span className="font-mono bg-zinc-100 px-1 py-0.5 rounded text-xs text-zinc-500">superseded</span>.
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-32 p-3 border rounded text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={isSubmitting}
          />
        </div>

        <div className="p-4 border-t bg-zinc-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(claimToEdit.id, content)}
            disabled={isSubmitting || !content.trim() || content === claimToEdit.content}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save New Version'}
          </button>
        </div>
      </div>
    </div>
  );
}
