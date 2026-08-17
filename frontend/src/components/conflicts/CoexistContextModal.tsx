import React, { useState } from 'react';
import { Columns, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

export function CoexistContextModal({ isOpen, isSubmitting, onClose, onConfirm }: Props) {
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-blue-50">
          <div className="flex items-center gap-2 text-blue-700 font-bold">
            <Columns size={18} />
            Contextual Coexistence
          </div>
          <button onClick={onClose} className="text-blue-400 hover:text-blue-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-5">
          <p className="text-sm text-zinc-700 mb-4">
            Укажите контекст или граничные условия, при которых оба утверждения являются верными (например, "Верно зимой, но не летом" или "Зависит от проекта").
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Опишите контекст сосуществования..."
            className="w-full h-24 p-3 border rounded text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            onClick={() => onConfirm(notes)}
            disabled={isSubmitting || !notes.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save Context'}
          </button>
        </div>
      </div>
    </div>
  );
}
