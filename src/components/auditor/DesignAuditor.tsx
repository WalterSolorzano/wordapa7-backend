/* WordAPA7 — Modo Auditor de Diseño
   Escanea la pantalla activa en busca de problemas de paleta, accesibilidad,
   estados y estructura. Panel anclado a la derecha, más grande y legible.
*/
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, X, RefreshCw, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export interface AuditIssue {
  level: 'error' | 'warn' | 'info';
  category: 'paleta' | 'accesibilidad' | 'estados' | 'estructura';
  message: string;
  selector: string;
  count: number;
}

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const ALLOWED_HEX = new Set(['#fff', '#ffffff', '#000', '#000000']);

function scanDOM(root: HTMLElement): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const seen = new Set<string>();

  const add = (level: AuditIssue['level'], category: AuditIssue['category'], message: string, selector: string) => {
    const key = `${level}:${category}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ level, category, message, selector, count: 1 });
  };

  const all = root.querySelectorAll('*');

  let hexCount = 0;
  let clickableDivCount = 0;
  let buttonNoTypeCount = 0;
  let imgNoAltCount = 0;

  all.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute('style') || '';

    let m: RegExpExecArray | null;
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(style)) !== null) {
      const hex = m[0].toLowerCase();
      if (!ALLOWED_HEX.has(hex)) hexCount++;
    }

    if (tag === 'div' || tag === 'span') {
      const hasClick = el.hasAttribute('onclick') || (el as any).onclick;
      const role = el.getAttribute('role');
      const hasCursor = /cursor:\s*(pointer|click)/i.test(style);
      if ((hasClick || hasCursor) && role !== 'button' && role !== 'link') clickableDivCount++;
    }

    if (tag === 'button') {
      if (!el.hasAttribute('type')) buttonNoTypeCount++;
    }

    if (tag === 'img') {
      if (!el.hasAttribute('alt') || !(el.getAttribute('alt') || '').trim()) imgNoAltCount++;
    }
  });

  if (hexCount > 0) add('warn', 'paleta', `${hexCount} color(es) hex hardcodeado(s) en estilos inline`, 'element[style*="#"]');
  if (clickableDivCount > 0) add('error', 'accesibilidad', `${clickableDivCount} <div>/<span> clickeable(s) sin role="button"`, 'div/span[onclick]');
  if (buttonNoTypeCount > 0) add('warn', 'estados', `${buttonNoTypeCount} <button> sin type="button"`, 'button:not([type])');
  if (imgNoAltCount > 0) add('error', 'accesibilidad', `${imgNoAltCount} imagen(es) sin alt`, 'img:not([alt])');

  const rootEl = document.documentElement;
  const sampleTokens = ['--text-main', '--text-secondary', '--border-subtle', '--accent-primary', '--app-bg'];
  const missing = sampleTokens.filter((t) => !getComputedStyle(rootEl).getPropertyValue(t).trim());
  if (missing.length > 0) add('error', 'paleta', `Tokens CSS faltantes: ${missing.join(', ')}`, ':root');

  if (issues.length === 0) add('info', 'estructura', 'No se detectaron problemas en esta pantalla', 'OK');

  return issues;
}

export const DesignAuditor: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [scanning, setScanning] = useState(false);

  const run = useCallback(() => {
    setScanning(true);
    setTimeout(() => {
      const target = document.querySelector('.app-main') as HTMLElement || document.body;
      setIssues(scanDOM(target));
      setScanning(false);
    }, 100);
  }, []);

  useEffect(() => {
    if (open) run();
  }, [open, run]);

  if (!open) return null;

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warn').length;
  const okCount = issues.filter((i) => i.level === 'info').length;

  return (
    <div style={{
      position: 'fixed', top: '54px', right: '0', zIndex: 20000,
      width: 'min(440px, 100vw)', maxHeight: 'calc(100vh - 80px)',
      background: 'var(--color-bg-surface)',
      borderLeft: '1px solid var(--color-border-strong)',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={18} color="white" />
          </div>
          <div>
            <strong style={{ fontSize: '15px', color: 'var(--color-text-primary)', display: 'block' }}>Auditor de Diseño</strong>
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Escaneo de paleta, accesibilidad y estados</span>
          </div>
        </div>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '6px' }}
          title="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-danger)' }}>
          <AlertTriangle size={14} /> {errorCount} errores
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-warning)' }}>
          <AlertTriangle size={14} /> {warnCount} avisos
        </div>
        {okCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-success)' }}>
            <CheckCircle2 size={14} /> OK
          </div>
        )}
        <button type="button" onClick={run} disabled={scanning}
          style={{
            marginLeft: 'auto', background: 'none', border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer',
            color: 'var(--color-text-secondary)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          <RefreshCw size={12} className={scanning ? 'spin' : ''} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} /> Re-escanear
        </button>
      </div>

      {/* Issues list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {issues.map((issue, i) => {
          const Icon = issue.level === 'error' ? AlertTriangle : issue.level === 'warn' ? AlertTriangle : issue.level === 'info' ? CheckCircle2 : Info;
          const color = issue.level === 'error' ? 'var(--color-danger)' : issue.level === 'warn' ? 'var(--color-warning)' : 'var(--color-success)';
          return (
            <div key={i} style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              padding: '12px 14px', marginBottom: '8px', borderRadius: 'var(--radius-md)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--color-border-subtle)',
              borderLeft: `3px solid ${color}`,
            }}>
              <Icon size={16} style={{ color, flexShrink: 0, marginTop: '1px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
                    padding: '2px 7px', borderRadius: 'var(--radius-sm)', letterSpacing: '0.04em',
                    background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                  }}>{issue.category}</span>
                </div>
                <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: '1.45' }}>
                  {issue.message}
                </p>
                <code style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{issue.selector}</code>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 20px', borderTop: '1px solid var(--color-border-subtle)',
        fontSize: '11px', color: 'var(--color-text-tertiary)', textAlign: 'center', flexShrink: 0,
      }}>
        Pantalla activa · {issues.length} hallazgo(s) · cierra con X o el botón Auditor
      </div>
    </div>
  );
};

export default DesignAuditor;