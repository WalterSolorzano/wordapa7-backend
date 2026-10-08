import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineTextEditor } from '../components/layout/InlineTextEditor';

const baseStyle: React.CSSProperties = { fontFamily: 'serif', fontSize: '12pt' };

describe('InlineTextEditor', () => {
  beforeEach(() => {
    // jsdom no implementa execCommand: se mockea para verificar el contrato
    // (paste → texto plano vía insertText).
    document.execCommand = vi.fn() as unknown as typeof document.execCommand;
  });
  afterEach(() => {
    // @ts-expect-error — limpiar el mock
    delete document.execCommand;
  });

  it('renderiza el texto inicial como contentEditable', () => {
    render(<InlineTextEditor initialText="hola mundo" style={baseStyle}
      onCommit={vi.fn()} onCancel={vi.fn()} onSplit={vi.fn()} />);
    const el = screen.getByRole('textbox');
    expect(el.getAttribute('contenteditable')).toBe('true');
    expect(el.textContent).toBe('hola mundo');
  });

  it('Enter → onSplit con before/after en el cursor', () => {
    const onSplit = vi.fn();
    render(<InlineTextEditor initialText="ABCDEF" style={baseStyle}
      onCommit={vi.fn()} onCancel={vi.fn()} onSplit={onSplit} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    // Cursor después de "ABC"
    const range = document.createRange();
    range.setStart(el.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onSplit).toHaveBeenCalledWith('ABC', 'DEF');
  });

  it('Escape → onCancel', () => {
    const onCancel = vi.fn();
    render(<InlineTextEditor initialText="hola" style={baseStyle}
      onCommit={vi.fn()} onCancel={onCancel} onSplit={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('blur → onCommit con el texto actual', () => {
    const onCommit = vi.fn();
    render(<InlineTextEditor initialText="hola" style={baseStyle}
      onCommit={onCommit} onCancel={vi.fn()} onSplit={vi.fn()} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    el.textContent = 'hola editado';
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith('hola editado');
  });

  it('blur tras split NO commitea (el split ya commiteó before)', () => {
    const onCommit = vi.fn();
    const onSplit = vi.fn();
    render(<InlineTextEditor initialText="ABCDEF" style={baseStyle}
      onCommit={onCommit} onCancel={vi.fn()} onSplit={onSplit} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    const range = document.createRange();
    range.setStart(el.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.blur(el);
    expect(onSplit).toHaveBeenCalledWith('ABC', 'DEF');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('paste → inserta solo texto plano (sin tags)', () => {
    render(<InlineTextEditor initialText="" style={baseStyle}
      onCommit={vi.fn()} onCancel={vi.fn()} onSplit={vi.fn()} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    const dt = { getData: (t: string) => (t === 'text/plain' ? 'texto pegado' : '<b>texto</b>') };
    fireEvent.paste(el, { clipboardData: dt });
    // El contrato: se llama insertText con el texto plano (no el HTML)
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'texto pegado');
  });
});
