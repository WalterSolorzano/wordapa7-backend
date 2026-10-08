import React, { useEffect, useRef, useState } from 'react';

export interface MiniToolbarAction {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

interface MiniToolbarProps {
  items: MiniToolbarAction[];
  anchorRect: DOMRect | null;
  visible: boolean;
  onClose: () => void;
}

export const MiniToolbar: React.FC<MiniToolbarProps> = ({ items, anchorRect, visible, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!visible || !anchorRect) {
      setPosition(null);
      return;
    }
    const toolbarWidth = ref.current?.offsetWidth ?? 200;
    const toolbarHeight = ref.current?.offsetHeight ?? 36;
    const gap = 8;

    let left = anchorRect.left + anchorRect.width / 2 - toolbarWidth / 2;
    let top = anchorRect.top - toolbarHeight - gap;

    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + toolbarWidth > window.innerWidth - 8) left = window.innerWidth - toolbarWidth - 8;
    if (top < 8) top = anchorRect.bottom + gap;

    setPosition({ top, left });
  }, [visible, anchorRect]);

  useEffect(() => {
    if (!visible) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Small delay to avoid the click that triggered the toolbar from also closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible || !position || !anchorRect) return null;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: '4px',
        transition: 'opacity 100ms ease',
        opacity: 1,
      }}
    >
      {items.map((item, idx) => (
        <React.Fragment key={item.id}>
          {idx > 0 && items[idx - 1]?.id !== 'separator' && item.id !== 'separator' && (
            <div style={{ width: 1, height: 20, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />
          )}
          {item.id === 'separator' ? null : (
            <button
              type="button"
              title={item.label}
              onClick={() => { item.onClick(); onClose(); }}
              disabled={item.disabled}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 28,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: item.active ? 'var(--color-accent-soft)' : 'transparent',
                color: item.active ? 'var(--accent-primary)' : 'var(--color-text-primary)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                opacity: item.disabled ? 0.4 : 1,
              }}
            >
              <item.icon size={16} />
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
