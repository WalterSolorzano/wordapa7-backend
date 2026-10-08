/**
 * WordAPA7 — Fase 3: editor inline (contentEditable) sobre el párrafo real.
 *
 * Reemplaza el textarea overlay para párrafos de cuerpo: se edita sobre el
 * párrafo de la hoja y el reflow es instantáneo (la medición DOM de Fase 1
 * ya observa el div paper-elem). Sanitización dura: paste plano, insertText
 * plano, y defensa en onInput contra HTML arbitrario.
 *
 * Enter → onSplit (nuevo párrafo en el modelo). Esc → onCancel. Blur →
 * onCommit (si el texto cambió). El blur posterior a un split no commitea:
 * el split ya commiteó el texto de antes del cursor.
 */
import React, { useRef } from 'react';
import { sanitizeToPlainText, splitTextAt, extractPlainText } from '../../lib/inlineEdit';

export interface InlineTextEditorProps {
  initialText: string;
  style: React.CSSProperties;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onSplit: (before: string, after: string) => void;
}

export function InlineTextEditor({ initialText, style, onCommit, onCancel, onSplit }: InlineTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const splitRef = useRef(false);
  const cancelledRef = useRef(false);

  const cursorOffset = (): number => {
    const el = ref.current;
    if (!el) return 0;
    // Defensa: si hay más de un nodo de texto, colapsar a textContent.
    if (el.childNodes.length > 1 || (el.firstChild && el.firstChild.nodeType !== 3)) {
      const txt = extractPlainText(el);
      el.textContent = txt;
      return txt.length;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return 0;
    // Offset absoluto dentro del nodo de texto único.
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType === 'insertParagraph' || ev.inputType === 'insertLineBreak') {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      const off = cursorOffset();
      const { before, after } = splitTextAt(extractPlainText(el), off);
      splitRef.current = true;
      onSplit(before, after);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      const off = cursorOffset();
      const { before, after } = splitTextAt(extractPlainText(el), off);
      splitRef.current = true;
      onSplit(before, after);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelledRef.current = true;
      onCancel();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain');
    // execCommand está deprecado pero es el único mecanismo cross-browser
    // para insertar texto plano sin romper el cursor. Defensivo: si el
    // navegador lo quita, el paste simplemente no inserta (nunca HTML).
    document.execCommand?.('insertText', false, plain);
  };

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    // Defensa: HTML arbitrario (autocompletado, arrastrar) → texto plano.
    if (/<[a-z][\s\S]*>/i.test(el.innerHTML)) {
      const txt = sanitizeToPlainText(el.innerHTML);
      el.textContent = txt;
    }
  };

  const handleBlur = () => {
    if (splitRef.current) { splitRef.current = false; return; }
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    const el = ref.current;
    if (!el) return;
    onCommit(extractPlainText(el));
  };

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      style={{ ...style, outline: 'none', whiteSpace: 'pre-wrap', minHeight: '1em' }}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onInput={handleInput}
      onBlur={handleBlur}
    >
      {initialText}
    </div>
  );
}
