import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  FileText,
} from 'lucide-react';

export interface ManuscriptCitationMention {
  page: number;
  p: string;
  text: string;
  highlight?: string;
}

export interface ManuscriptMentionsAccordionProps {
  citations: ManuscriptCitationMention[];
  onJumpToWord?: (page: number, p: string) => void;
  onCopyCitation?: () => void;
  defaultOpen?: boolean;
  className?: string;
}

function parseTextSegments(rawText: string, customHighlight?: string): { isHighlight: boolean; text: string }[] {
  if (!rawText) return [];

  // 1. If rawText already has HTML span markup
  if (/<span\b[^>]*>/i.test(rawText)) {
    const parts: { isHighlight: boolean; text: string }[] = [];
    const spanRegex = /<span\b[^>]*>([\s\S]*?)<\/span>/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = spanRegex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ isHighlight: false, text: rawText.substring(lastIndex, match.index) });
      }
      parts.push({ isHighlight: true, text: match[1] });
      lastIndex = spanRegex.lastIndex;
    }
    if (lastIndex < rawText.length) {
      parts.push({ isHighlight: false, text: rawText.substring(lastIndex) });
    }
    return parts;
  }

  // 2. If customHighlight passed
  if (customHighlight && rawText.includes(customHighlight)) {
    const parts: { isHighlight: boolean; text: string }[] = [];
    const pieces = rawText.split(customHighlight);
    pieces.forEach((p, idx) => {
      if (idx > 0) parts.push({ isHighlight: true, text: customHighlight });
      if (p) parts.push({ isHighlight: false, text: p });
    });
    return parts;
  }

  // 3. Fallback: match parenthetical and narrative APA 7 citations
  const CITATION_REGEX = /(\([A-ZÁÉÍÓÚÑ][^)]*\d{4}[a-z]?(?:,\s*p[p]?\.\s*\d+)?\s*\)|[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñ\s&y\.,\-]+?(?:\s+et\s+al\.?)?\s*\(\d{4}[a-z]?(?:,\s*p[p]?\.\s*\d+)?\))/g;
  const parts: { isHighlight: boolean; text: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_REGEX.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ isHighlight: false, text: rawText.substring(lastIndex, match.index) });
    }
    parts.push({ isHighlight: true, text: match[0] });
    lastIndex = CITATION_REGEX.lastIndex;
  }
  if (lastIndex < rawText.length) {
    parts.push({ isHighlight: false, text: rawText.substring(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ isHighlight: false, text: rawText }];
}

export const ManuscriptMentionsAccordion: React.FC<ManuscriptMentionsAccordionProps> = ({
  citations,
  onJumpToWord,
  onCopyCitation,
  defaultOpen = true,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const countBadgeText =
    citations.length === 0
      ? '0 citas'
      : citations.length === 1
      ? '1 cita registrada'
      : `${citations.length} citas registradas`;

  return (
    <div
      className={`manuscript-mentions-accordion ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* Collapsible Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-none)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background-color var(--transition-fast)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={18} strokeWidth="var(--icon-stroke)" color="var(--color-accent-deep)" aria-hidden="true" />
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Aparición en el Manuscrito
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--mark-citation-bg)',
              color: 'var(--mark-citation-ink)',
            }}
          >
            {countBadgeText}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            {isOpen
              ? <ChevronUp size={16} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
              : <ChevronDown size={16} strokeWidth="var(--icon-stroke)" aria-hidden="true" />}
          </span>
        </div>
      </button>

      {/* Accordion Body */}
      {isOpen && (
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {citations.length === 0 ? (
            /* Orphan state fallback */
            <div
              data-testid="orphan-mentions-card"
              style={{
                padding: '24px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px dashed var(--color-border-strong)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  padding: '10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--severity-warning-soft)',
                  color: 'var(--color-warning)',
                }}
              >
                <AlertTriangle size={24} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
              </div>
              <div
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                }}
              >
                Esta obra no está citada en el cuerpo del trabajo
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.5,
                  color: 'var(--color-text-secondary)',
                  maxWidth: '480px',
                }}
              >
                Aparece en la bibliografía final pero ningún párrafo de la tesis o artículo hace referencia a ella. En APA 7, las fuentes no citadas deben removerse o insertarse debidamente en el texto.
              </p>
              <button
                type="button"
                onClick={onCopyCitation}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                  padding: '7px 14px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
                }}
              >
                <Copy size={13} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                <span>Copiar cita para insertar en un párrafo</span>
              </button>
            </div>
          ) : (
            /* Citation cards */
            citations.map((c, idx) => {
              const segments = parseTextSegments(c.text, c.highlight);

              return (
                <div
                  key={idx}
                  className="mention-quote-card"
                  style={{
                    backgroundColor: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                    padding: '16px 20px',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'box-shadow var(--transition-fast), transform var(--transition-fast)',
                  }}
                >
                  {/* Badge bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      paddingBottom: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--mark-citation-ink)',
                        backgroundColor: 'var(--mark-citation-bg)',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <FileText size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                      Página {c.page} • {c.p}
                    </span>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--color-success)',
                      }}
                    >
                      <CheckCircle2 size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                      <span>Concordancia APA Confirmada</span>
                    </span>
                  </div>

                  {/* Editorial Quote Container */}
                  <div
                    style={{
                      position: 'relative',
                      paddingLeft: '28px',
                      margin: '6px 0',
                    }}
                  >
                    <span
                      data-testid="quote-mark"
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: '-8px',
                        top: '-24px',
                        fontFamily: "'Newsreader', 'Georgia', serif",
                        fontSize: '72px',
                        lineHeight: 1,
                        color: 'var(--color-accent-deep)',
                        opacity: 0.22,
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                    >
                      “
                    </span>

                    <div
                      style={{
                        fontFamily: "'Newsreader', 'Georgia', serif",
                        fontSize: '17px',
                        lineHeight: 1.65,
                        color: 'var(--color-text-primary)',
                        fontStyle: 'italic',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {segments.map((seg, sIdx) =>
                        seg.isHighlight ? (
                          <mark
                            key={sIdx}
                            data-testid="citation-highlight"
                            style={{
                              backgroundColor: 'var(--mark-citation-bg)',
                              color: 'var(--mark-citation-ink)',
                              borderBottom: '1px solid var(--color-accent-deep)',
                              padding: '1px 4px',
                              borderRadius: 'var(--radius-xs)',
                              fontWeight: 600,
                              fontStyle: 'normal',
                            }}
                          >
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={sIdx}>{seg.text}</span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Quote footer */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '4px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Ubicación exacta en el documento Word
                    </span>

                    <button
                      type="button"
                      onClick={() => onJumpToWord?.(c.page, c.p)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 12px',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--color-accent-deep)',
                        backgroundColor: 'var(--mark-citation-bg)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
                      }}
                    >
                      <span>Saltar al párrafo en Word</span>
                      <ArrowRight size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ManuscriptMentionsAccordion;
