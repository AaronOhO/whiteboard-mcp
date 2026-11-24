import { useEffect, useRef } from 'react';

interface Props {
  label: string;
  text: string;
  onText(text: string): void;
  onSend(): void;
  onClose(): void;
  className?: string;
}

export function NoteForm({ label, text, onText, onSend, onClose, className }: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => field.current?.focus(), []);

  const submit = () => {
    if (text.trim()) onSend();
  };

  return (
    <form
      className={className ?? 'xl-note'}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={field}
        value={text}
        maxLength={4000}
        placeholder={`${label}…`}
        aria-label={label}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') onClose();
        }}
      />
      <div className="xl-note-row">
        <span className="xl-hint">⌘/Ctrl + Enter</span>
        <button type="submit" className="xl-send" disabled={!text.trim()}>Send</button>
      </div>
    </form>
  );
}
