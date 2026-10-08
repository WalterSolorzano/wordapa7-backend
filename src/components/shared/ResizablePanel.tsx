import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ResizablePanelProps {
  children: ReactNode;
  side: 'left' | 'right';
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  localStorageKey?: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  side,
  defaultWidth = 250,
  minWidth = 140,
  maxWidth = 600,
  localStorageKey,
}) => {
  const [width, setWidth] = useState(() => {
    if (localStorageKey) {
      const saved = localStorage.getItem(localStorageKey);
      if (saved !== null) return parseInt(saved, 10);
    }
    return defaultWidth;
  });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorageKey && width > 0) {
      localStorage.setItem(localStorageKey, width.toString());
    }
  }, [width, localStorageKey]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newWidth;
      if (side === 'left') {
        newWidth = e.clientX;
      } else {
        newWidth = window.innerWidth - e.clientX;
      }

      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, side, minWidth, maxWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const actualWidth = isCollapsed ? 0 : width;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: side === 'left' ? 'row' : 'row-reverse',
        height: '100%',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: actualWidth,
          minWidth: actualWidth,
          maxWidth: actualWidth,
          height: '100%',
          overflow: 'hidden',
          transition: isResizing ? 'none' : 'width 0.2s ease, min-width 0.2s ease',
          backgroundColor: 'var(--bg-base, #ffffff)',
          borderRight: side === 'left' ? '1px solid var(--border-subtle, #e0e0e0)' : 'none',
          borderLeft: side === 'right' ? '1px solid var(--border-subtle, #e0e0e0)' : 'none',
          position: 'relative',
        }}
      >
        <div style={{ width: width, height: '100%', overflow: 'hidden' }}>
            {children}
        </div>
      </div>

      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        style={{
          width: '6px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 10,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: side === 'left' ? '-3px' : '0',
          marginRight: side === 'right' ? '-3px' : '0',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.05)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse();
          }}
          style={{
            position: 'absolute',
            width: '16px',
            height: '24px',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 11,
            // Center the button on the handle
            left: side === 'left' ? (isCollapsed ? '3px' : '-8px') : (isCollapsed ? '-19px' : '-8px'),
          }}
        >
          {side === 'left' ? (
            isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />
          ) : (
            isCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />
          )}
        </button>
      </div>
    </div>
  );
};
