import React, { useRef } from 'react';

interface CopilotTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  suggestion: string;
  onAccept: () => void;
  onDismiss: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CopilotTextarea: React.FC<CopilotTextareaProps> = ({
  value,
  onChange,
  onKeyDown,
  suggestion,
  onAccept,
  onDismiss,
  placeholder,
  disabled,
  className = "",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestion && (e.key === 'Tab' || (e.key === 'ArrowRight' && textareaRef.current?.selectionStart === value.length))) {
      e.preventDefault();
      onAccept();
      return;
    }

    if (e.key === 'Escape' && suggestion) {
      e.preventDefault();
      onDismiss();
      return;
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div className="relative w-full font-sans text-sm flex items-center">
      {/* Подложка для ghost text (идентичный шрифт, паддинги и переносы) */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none whitespace-pre-wrap break-words overflow-hidden text-transparent select-none border border-transparent ${className}`}
      >
        <span>{value}</span>
        {suggestion && <span className="text-white/40 opacity-80">{suggestion}</span>}
      </div>

      {/* Основной интерактивный textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className={`w-full relative z-10 bg-transparent text-white/90 focus:outline-none resize-none leading-normal placeholder-white/30 transition-colors ${className}`}
      />
    </div>
  );
};
