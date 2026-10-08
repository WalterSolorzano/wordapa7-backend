/* WordAPA7 — Copiloto Editorial IA (DocumentAIChat)
   Diseño impecable, tokens CSS centralizados, cero emojis y tipografía consistente.
*/

import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Sparkles, User, Check, Loader2, FileEdit,
  Quote, BookOpen, X, Info, AlertCircle, WifiOff, Minimize2, ArrowRight,
  Table, Image as ImageIcon, CheckCircle2, ChevronRight, Wand2, Layers, RefreshCw, Upload
} from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { sendLiveChat, LiveChatAction, suggestCaption } from '../../api/backend';
import { getApiBase } from '../../api/http';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: LiveChatAction[];
  applied?: boolean;
  isError?: boolean;
  suggestedPrompt?: string;
}

type QuickAction = {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  prompt: string;
  color: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: FileEdit,
    label: 'Mejorar tono',
    sublabel: 'Reescribir en estilo formal APA 7',
    prompt: 'Reescribe el párrafo seleccionado en tono formal impersonal según normas APA 7, eliminando lenguaje informal.',
    color: 'var(--accent-primary)',
  },
  {
    icon: Quote,
    label: 'Cita en bloque',
    sublabel: 'Formato APA para más de 40 palabras',
    prompt: 'Convierte el texto seleccionado a formato de cita en bloque APA 7 (más de 40 palabras, sangría izquierda de 1.27 cm).',
    color: 'var(--color-success)',
  },
  {
    icon: BookOpen,
    label: 'Revisar citas',
    sublabel: 'Cotejar afirmaciones empíricas',
    prompt: 'Analiza el documento y señala qué afirmaciones empíricas requieren respaldo de cita APA 7.',
    color: 'var(--color-warning)',
  },
];

function formatInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ fontWeight: 700, color: 'var(--text-main)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} style={{ fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const paragraphs = text.split(/\n\n+/);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n');
        const isList = lines.length > 1 && lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={pIdx} style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {lines.map((line, lIdx) => {
                const itemText = line.replace(/^\s*[-*•]\s+/, '');
                return <li key={lIdx}>{formatInlineMarkdown(itemText)}</li>;
              })}
            </ul>
          );
        }
        return (
          <p key={pIdx} style={{ margin: 0, lineHeight: 1.55 }}>
            {formatInlineMarkdown(para)}
          </p>
        );
      })}
    </div>
  );
}

function buildProactiveGreeting(
  doc: any,
  citationAudit: any,
  proofreadFindings: any[]
): { text: string; chips: { label: string; prompt: string; actionTab?: 'suggestions' }[] } {
  if (!doc) {
    return {
      text: 'Asistente editorial listo. Sube un documento de trabajo para comenzar la revisión APA 7.',
      chips: [],
    };
  }

  const elems = doc.elements || [];
  const ghosts = citationAudit?.ghost_citations || [];
  const uncaptionedTables = elems.filter((e: any) => e.type === 'table' && !e.table_info?.caption).length;
  const uncaptionedFigures = elems.filter((e: any) => e.type === 'image' && !e.is_cover_section && !e.image_info?.caption).length;
  const styleIssues = proofreadFindings || [];

  const chips: { label: string; prompt: string; actionTab?: 'suggestions' }[] = [];
  const issues: string[] = [];

  if (ghosts.length > 0) {
    const sample = ghosts.slice(0, 2).map((g: any) => g.citation_text || g.author || 'cita').join(' y ');
    issues.push(`Hay citas en el texto (${sample}) sin entrada en la bibliografía.`);
    chips.push({
      label: 'Generar referencias faltantes',
      prompt: `Genera las referencias bibliográficas completas en formato APA 7 para las citas: ${sample}.`,
      actionTab: 'suggestions',
    });
  }

  if (uncaptionedTables > 0 || uncaptionedFigures > 0) {
    issues.push('Existen tablas o figuras pendientes de rotulación formal APA 7.');
    chips.push({
      label: 'Generar leyendas APA 7',
      prompt: 'Genera títulos en cursiva y notas explicativas APA 7 para las tablas y figuras del documento.',
      actionTab: 'suggestions',
    });
  }

  if (styleIssues.length > 0) {
    issues.push('Hay fragmentos con expresiones informales o patrones rígidos que conviene pulir.');
    chips.push({
      label: 'Pulir redacción formal',
      prompt: 'Revisa y ajusta los párrafos marcados para cumplir con el estilo impersonal formal APA 7.',
    });
  }

  if (issues.length === 0) {
    return {
      text: 'El documento presenta una estructura inicial sólida. ¿En qué sección te gustaría trabajar?',
      chips: [
        { label: 'Revisar jerarquía de títulos', prompt: 'Verifica la jerarquía de títulos H1, H2 y H3 de acuerdo con las normas APA 7.' },
        { label: 'Optimizar tono del resumen', prompt: 'Reescribe el resumen o introducción para maximizar su claridad académica.' },
      ],
    };
  }

  const intro = issues.length === 1
    ? `Revisión completada: ${issues[0]}`
    : `Puntos de atención detectados:\n\n${issues.map((i) => `• ${i}`).join('\n')}`;

  return {
    text: `${intro}\n\nSelecciona una sugerencia o escribe una indicación.`,
    chips,
  };
}

export const DocumentAIChat: React.FC<{ onClose?: () => void; onMinimize?: () => void }> = ({ onClose, onMinimize }) => {
  const doc = useDocStore((s) => s.doc);
  const citationAudit = useDocStore((s) => s.citationAuditResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings || []);
  const selectedElementId = useDocStore((s) => s.selectedElementId);
  const setSelectedElementId = useDocStore((s) => s.setSelectedElementId);
  const updateElementText = useDocStore((s) => s.updateElementText);
  const updateElementType = useDocStore((s) => s.updateElementType);
  const updateElementTable = useDocStore((s) => s.updateElementTable);
  const updateElementImage = useDocStore((s) => s.updateElementImage);
  const autoCaptionAll = useDocStore((s) => s.autoCaptionAll);
  const addReferencia = useDocStore((s) => s.addReferencia);
  const showToast = useDocStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<'chat' | 'suggestions'>('chat');
  const [greetingData, setGreetingData] = useState(() => buildProactiveGreeting(doc, citationAudit, proofreadFindings));
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'welcome', role: 'assistant', content: greetingData.text }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [appliedItems, setAppliedItems] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prevDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    const docId = (doc as any)?.session_id || null;
    if (docId && docId !== prevDocIdRef.current) {
      prevDocIdRef.current = docId;
      const initial = buildProactiveGreeting(doc, citationAudit, proofreadFindings);
      setGreetingData(initial);
      setMessages([{ id: `welcome-${docId}`, role: 'assistant', content: initial.text }]);
    }
  }, [doc, citationAudit, proofreadFindings]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, isSending, activeTab]);

  const selectedElement = doc?.elements.find((e) => e.id === selectedElementId);

  // Elementos sin leyenda (Tablas y Figuras)
  const uncaptionedElements = (doc?.elements || []).filter((e) => {
    if (e.type === 'table') return !e.table_info?.caption?.trim();
    if (e.type === 'image' && !e.is_cover_section) return !e.image_info?.caption?.trim();
    return false;
  });

  const ghostCitations = citationAudit?.ghost_citations || [];
  const pendingCount = uncaptionedElements.length + ghostCitations.length;

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || input).trim();
    if (!textToSend || !doc || isSending) return;

    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await sendLiveChat(doc.session_id, textToSend, selectedElementId, history);
      const botMsg: ChatMessage = { id: `msg-${Date.now() + 1}`, role: 'assistant', content: res.reply, actions: res.actions };
      setMessages((prev) => [...prev, botMsg]);
      if (res.actions && res.actions.length > 0) applyActions(res.actions);
    } catch (err: any) {
      const isNetworkError = err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed');
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          role: 'assistant',
          content: isNetworkError
            ? 'Sin conexión con el servicio de IA local. Verifica que el servidor FastAPI esté iniciado.'
            : `Error de procesamiento: ${err.message || 'Error interno'}.`,
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const bibFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportBibFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${getApiBase()}/references/import-file`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.imported_references) {
        const state = useDocStore.getState();
        const currentRefs = state.doc?.referencias || [];
        useDocStore.setState({
          doc: state.doc
            ? {
                ...state.doc,
                referencias: [...currentRefs, ...data.imported_references],
              }
            : state.doc,
        });
        showToast(`Importadas ${data.count} referencias desde ${file.name}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Error importando archivo BibTeX/RIS', 'error');
    }
  };

  const applyActions = (actions: LiveChatAction[]) => {
    let appliedCount = 0;
    actions.forEach((act) => {
      if (act.type === 'update_text' && act.element_id && act.text) {
        updateElementText(act.element_id, act.text);
        appliedCount++;
      } else if (act.type === 'set_type' && act.element_id && act.element_type) {
        updateElementType(act.element_id, act.element_type as any, act.level || 1);
        appliedCount++;
      } else if (act.type === 'insert_citation' && act.element_id && act.citation) {
        const target = doc?.elements.find((e) => e.id === act.element_id);
        if (target) {
          updateElementText(act.element_id, `${(target.text || '').trim()} ${act.citation}`);
          appliedCount++;
        }
      } else if (act.type === 'add_reference' && act.reference) {
        addReferencia({
          id: `ref-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          raw_text: act.reference,
          authors: [],
          year: '',
          title: act.reference,
          source: '',
          doi_or_url: '',
          formatted_apa: act.reference,
        });
        appliedCount++;
      } else if (act.type === 'add_diagram' && act.image) {
        const afterId = act.element_id || doc?.elements[doc.elements.length - 1]?.id;
        if (afterId) {
          void useDocStore.getState().insertImageElement(afterId, act.image);
          appliedCount++;
        }
      }
    });
    if (appliedCount > 0) {
      showToast(`${appliedCount} ${appliedCount === 1 ? 'cambio aplicado' : 'cambios aplicados'} en vivo`, 'success');
    }
  };

  const handleApplySingleCaption = async (elem: any) => {
    if (!doc) return;
    setLoadingItemId(elem.id);
    try {
      const idx = doc.elements.findIndex((e) => e.id === elem.id);
      const ctx: string[] = [];
      for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
        const e = doc.elements[i];
        if (e.id === elem.id) continue;
        if (e.type === 'paragraph' || e.type === 'heading' || e.type === 'bullet' || e.type === 'numbered_list') {
          const t = (e.text || '').trim();
          if (t) ctx.push(t);
        }
      }
      const contextText = ctx.join('\n') || elem.text || '';
      const apiKey = useDocStore.getState().apiKey;
      const suggestion = await suggestCaption(doc.session_id, elem.id, contextText, apiKey);
      if (elem.type === 'table') {
        updateElementTable(elem.id, { ...(elem.table_info || {}), caption: suggestion });
      } else {
        updateElementImage(elem.id, { ...(elem.image_info || {}), caption: suggestion });
      }
      setAppliedItems((prev) => ({ ...prev, [elem.id]: suggestion }));
      showToast('Leyenda APA 7 aplicada con éxito', 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo generar la leyenda', 'error');
    } finally {
      setLoadingItemId(null);
    }
  };

  const getNearbyContextSnippet = (elem: any): string => {
    if (!doc) return '';
    const idx = doc.elements.findIndex((e) => e.id === elem.id);
    for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
      if (i === idx) continue;
      const text = (doc.elements[i].text || '').trim();
      if (text.length > 20) {
        return text.length > 90 ? text.slice(0, 87) + '...' : text;
      }
    }
    return elem.text ? (elem.text.length > 80 ? elem.text.slice(0, 77) + '...' : elem.text) : 'Sin texto descriptivo';
  };

  const [filterCategory, setFilterCategory] = useState<'all' | 'tables' | 'figures'>('all');
  const [sugPage, setSugPage] = useState(1);
  const pageSize = 10;

  const tableCount = uncaptionedElements.filter((e) => e.type === 'table').length;
  const figureCount = uncaptionedElements.filter((e) => e.type === 'image').length;

  const filteredElements = uncaptionedElements.filter((e) => {
    if (filterCategory === 'tables') return e.type === 'table';
    if (filterCategory === 'figures') return e.type === 'image';
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredElements.length / pageSize));
  const currentPageElements = filteredElements.slice((sugPage - 1) * pageSize, sugPage * pageSize);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--sidebar-bg)',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    >
      {/* Barra de progreso animada cuando la IA procesa */}
      {isSending && (
        <div
          style={{
            height: '2px',
            background: 'var(--border-subtle)',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
              animation: 'ai-progress-sweep 1.4s ease-in-out infinite',
              width: '50%',
            }}
          />
        </div>
      )}

      {/* Encabezado Superior */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-elevated)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isSending ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
              Copiloto Editorial IA
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: isSending ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 500 }}>
              {isSending ? 'Analizando documento...' : 'Asistencia conversacional APA 7'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title="Minimizar panel"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '5px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Minimize2 size={15} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Cerrar panel"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '5px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Barra de Pestañas */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--surface-elevated)',
          padding: '0 12px',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          style={{
            padding: '9px 12px',
            fontSize: 'var(--text-xs)',
            fontWeight: activeTab === 'chat' ? 700 : 500,
            color: activeTab === 'chat' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'chat' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Sparkles size={13} />
          <span>Conversación</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suggestions')}
          style={{
            padding: '9px 12px',
            fontSize: 'var(--text-xs)',
            fontWeight: activeTab === 'suggestions' ? 700 : 500,
            color: activeTab === 'suggestions' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'suggestions' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Layers size={13} />
          <span>Sugerencias APA</span>
          {pendingCount > 0 && (
            <span
              style={{
                backgroundColor: activeTab === 'suggestions' ? 'var(--accent-primary)' : 'var(--color-accent-soft)',
                color: activeTab === 'suggestions' ? '#ffffff' : 'var(--accent-primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              {pendingCount}
            </span>
          )}
        </button>

        <input
          type="file"
          ref={bibFileInputRef}
          accept=".bib,.ris"
          style={{ display: 'none' }}
          onChange={handleImportBibFile}
        />
        <button
          type="button"
          onClick={() => bibFileInputRef.current?.click()}
          title="Importar biblioteca desde Zotero o Mendeley (.bib, .ris)"
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--accent-primary)',
            backgroundColor: 'var(--color-accent-soft)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Upload size={12} />
          <span>Zotero / BibTeX</span>
        </button>
      </div>

      {/* Contenido según pestaña activa */}
      {activeTab === 'suggestions' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Banner de acción masiva */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--color-accent-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-main)' }}>
                {uncaptionedElements.length} elemento(s) sin rotulación formal
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                Normas APA 7
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Cada tabla y figura debe contener numeración secuencial, título breve en cursiva y nota explicativa.
            </p>
            {uncaptionedElements.length > 0 && (
              <button
                type="button"
                onClick={() => autoCaptionAll()}
                style={{
                  marginTop: '4px',
                  padding: '7px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Wand2 size={13} />
                <span>Rotular todos automáticamente con IA ({uncaptionedElements.length})</span>
              </button>
            )}
          </div>

          {/* Filtros por Categoría */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setFilterCategory('all'); setSugPage(1); }}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: filterCategory === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                backgroundColor: filterCategory === 'all' ? 'var(--color-accent-soft)' : 'var(--surface-elevated)',
                color: filterCategory === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Todas ({uncaptionedElements.length})
            </button>
            <button
              type="button"
              onClick={() => { setFilterCategory('figures'); setSugPage(1); }}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: filterCategory === 'figures' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                backgroundColor: filterCategory === 'figures' ? 'var(--color-accent-soft)' : 'var(--surface-elevated)',
                color: filterCategory === 'figures' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Figuras ({figureCount})
            </button>
            <button
              type="button"
              onClick={() => { setFilterCategory('tables'); setSugPage(1); }}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: filterCategory === 'tables' ? '1px solid var(--color-success)' : '1px solid var(--border-subtle)',
                backgroundColor: filterCategory === 'tables' ? 'var(--color-accent-soft)' : 'var(--surface-elevated)',
                color: filterCategory === 'tables' ? 'var(--color-success)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Tablas ({tableCount})
            </button>
          </div>

          {/* Lista compacta de elementos por rotular */}
          {currentPageElements.map((elem, idx) => {
            const isTable = elem.type === 'table';
            const num = isTable
              ? (elem.table_info?.table_number || ((sugPage - 1) * pageSize + idx + 1))
              : (elem.image_info?.figure_number || ((sugPage - 1) * pageSize + idx + 1));
            const typeLabel = isTable ? `Tabla ${num}` : `Figura ${num}`;
            const contextSnippet = getNearbyContextSnippet(elem);
            const isApplied = !!appliedItems[elem.id];
            const isLoading = loadingItemId === elem.id;

            return (
              <div
                key={elem.id}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--surface-elevated)',
                  border: selectedElementId === elem.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isTable ? 'var(--color-accent-soft)' : 'var(--color-accent-soft)',
                      color: isTable ? 'var(--color-success)' : 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isTable ? <Table size={14} /> : <ImageIcon size={14} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-main)' }}>
                        {typeLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedElementId(elem.id);
                          const domElem = document.getElementById(`paper-elem-${elem.id}`);
                          if (domElem) domElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--accent-primary)',
                          padding: 0,
                        }}
                      >
                        Ver en hoja
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontStyle: 'italic',
                        marginTop: '1px',
                      }}
                    >
                      «{contextSnippet}»
                    </div>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {isApplied ? (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> Listo
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApplySingleCaption(elem)}
                      disabled={isLoading}
                      style={{
                        padding: '5px 10px',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        backgroundColor: 'var(--accent-primary)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: isLoading ? 0.7 : 1,
                      }}
                    >
                      {isLoading ? <Loader2 size={11} className="spin" /> : <Wand2 size={11} />}
                      <span>{isLoading ? '...' : 'Rotular'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Controles de Paginación */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderTop: '1px solid var(--border-subtle)', marginTop: '4px' }}>
              <button
                type="button"
                disabled={sugPage <= 1}
                onClick={() => setSugPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '4px 10px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--surface-elevated)',
                  color: sugPage <= 1 ? 'var(--text-secondary)' : 'var(--text-main)',
                  cursor: sugPage <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Anterior
              </button>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Página {sugPage} de {totalPages}
              </span>
              <button
                type="button"
                disabled={sugPage >= totalPages}
                onClick={() => setSugPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '4px 10px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--surface-elevated)',
                  color: sugPage >= totalPages ? 'var(--text-secondary)' : 'var(--text-main)',
                  cursor: sugPage >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Siguiente
              </button>
            </div>
          )}

          {/* Citas fantasma */}
          {ghostCitations.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={15} style={{ color: 'var(--color-warning)' }} />
                <span>Citas sin respaldo bibliográfico ({ghostCitations.length})</span>
              </div>
              {ghostCitations.map((gc: any, gIdx: number) => (
                <div
                  key={gIdx}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-main)' }}>
                      {gc.citation_text || gc.author || 'Cita en texto'}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Sin entrada en la bibliografía
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('chat');
                      handleSend(`Genera la referencia bibliográfica completa en formato APA 7 para la cita: ${gc.citation_text || gc.author}.`);
                    }}
                    style={{
                      flexShrink: 0,
                      padding: '5px 10px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      backgroundColor: 'var(--accent-primary)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    Crear referencia
                  </button>
                </div>
              ))}
            </div>
          )}

          {uncaptionedElements.length === 0 && ghostCitations.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={32} style={{ color: 'var(--color-success)', margin: '0 auto 8px auto' }} />
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-main)' }}>
                Todo rotulado y respaldado
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)' }}>
                Todas las tablas, figuras y citas cumplen con los criterios de formato APA 7.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Vista de Chat Conversacional */
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedElement && (
            <div
              style={{
                padding: '7px 12px',
                backgroundColor: 'var(--color-accent-soft)',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 'var(--text-xs)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
              }}
            >
              <Info size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Elemento activo: <strong>{selectedElement.type}</strong>
                {selectedElement.text ? ` — ${selectedElement.text.slice(0, 40)}...` : ''}
              </span>
            </div>
          )}

          <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m) => (
              <div
                key={m.id}
                className="chat-msg-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: m.role === 'user' ? 'var(--accent-primary)' : m.isError ? 'var(--color-danger)' : 'var(--color-accent-soft)',
                      color: m.role === 'user' || m.isError ? '#ffffff' : 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {m.role === 'user' ? <User size={13} /> : m.isError ? <AlertCircle size={13} /> : <Sparkles size={13} />}
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: m.role === 'user' ? 'var(--accent-primary)' : m.isError ? 'rgba(212, 56, 46, 0.08)' : 'var(--surface-elevated)',
                      color: m.role === 'user' ? '#ffffff' : m.isError ? 'var(--color-danger)' : 'var(--text-main)',
                      border: m.role === 'user' ? 'none' : m.isError ? '1px solid var(--color-danger)' : '1px solid var(--border-subtle)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.isError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontWeight: 800, fontSize: 'var(--text-xs)' }}>
                        <WifiOff size={12} /> Error de conexión
                      </div>
                    )}

                    {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}

                    {m.isError && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleSend('Reintentar diagnóstico y mejoras APA 7')}
                          disabled={isSending}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 700,
                            backgroundColor: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: isSending ? 'not-allowed' : 'pointer',
                            color: 'var(--text-main)',
                          }}
                        >
                          <RefreshCw size={11} className={isSending ? 'spin' : ''} />
                          <span>Reintentar</span>
                        </button>
                      </div>
                    )}

                    {m.id.startsWith('welcome') && greetingData.chips.length > 0 && (
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.04em' }}>
                          Acciones recomendadas:
                        </div>
                        {greetingData.chips.map((chip, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => {
                              if (chip.actionTab === 'suggestions') {
                                setActiveTab('suggestions');
                              } else {
                                handleSend(chip.prompt);
                              }
                            }}
                            disabled={isSending}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 10px',
                              fontSize: 'var(--text-xs)',
                              fontWeight: 700,
                              backgroundColor: 'var(--sidebar-bg)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-main)',
                              cursor: isSending ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                              transition: 'border-color 0.15s ease',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
                          >
                            <span>{chip.label}</span>
                            <ArrowRight size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                          </button>
                        ))}
                      </div>
                    )}

                    {m.actions && m.actions.length > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={11} /> Aplicado al documento:
                        </div>
                        {m.actions.map((act, idx) => (
                          <div key={idx} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            — {act.type === 'update_text' ? 'Texto actualizado' : act.type === 'set_type' ? `Convertido a ${act.element_type}` : act.type}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isSending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', alignSelf: 'flex-start' }}>
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--accent-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={13} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--text-secondary)', display: 'inline-block' }} />
                  <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--text-secondary)', display: 'inline-block' }} />
                  <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--text-secondary)', display: 'inline-block' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Acciones Rápidas */}
          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--surface-elevated)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              Acciones rápidas
            </div>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
              {QUICK_ACTIONS.map((qa, i) => {
                const Icon = qa.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(qa.prompt)}
                    disabled={isSending}
                    title={qa.sublabel}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 9px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      backgroundColor: 'var(--sidebar-bg)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-full)',
                      color: 'var(--text-main)',
                      cursor: isSending ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={12} style={{ color: qa.color, flexShrink: 0 }} />
                    <span>{qa.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Formulario de Entrada */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--surface-elevated)',
              display: 'flex',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                selectedElement
                  ? `Instrucción sobre '${selectedElement.text?.slice(0, 25) || selectedElement.type}'...`
                  : 'Instrucción de edición para el Copiloto IA...'
              }
              disabled={isSending}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                fontSize: 'var(--text-xs)',
                outline: 'none',
                backgroundColor: 'var(--sidebar-bg)',
                color: 'var(--text-main)',
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--accent-primary)',
                color: '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: !input.trim() || isSending ? 'not-allowed' : 'pointer',
                opacity: !input.trim() || isSending ? 0.4 : 1,
                flexShrink: 0,
              }}
            >
              {isSending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default DocumentAIChat;
