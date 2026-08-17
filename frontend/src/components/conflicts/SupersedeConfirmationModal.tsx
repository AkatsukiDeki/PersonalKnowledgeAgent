import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  winnerId: string;
  loserId: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function SupersedeConfirmationModal({ isOpen, isSubmitting, onClose, onConfirm }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-red-50">
          <div className="flex items-center gap-2 text-red-700 font-bold">
            <AlertTriangle size={18} />
            Confirm Supersede
          </div>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-5">
          <p className="text-sm text-zinc-700 mb-4">
            Выбранное утверждение станет источником истины. Оппонент будет помечен как <span className="font-mono bg-zinc-100 px-1 py-0.5 rounded text-xs text-red-600">superseded</span> и перестанет участвовать в поиске (RAG).
          </p>
          <p className="text-xs text-zinc-500 bg-zinc-50 p-2 border rounded">
            <strong>Note:</strong> Физического удаления не произойдет. Старая версия сохранится в истории графа для аудита (L4 History).
          </p>
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
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Confirming...' : 'Confirm Supersede'}
          </button>
        </div>
      </div>
    </div>
  );
}
