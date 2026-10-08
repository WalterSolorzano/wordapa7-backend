/* WordAPA7 — OutlineTree: mapa de títulos (única implementación).
   Estilo clásico con jerarquía legible: filas redondeadas, hover suave,
   activo en acento, chevrons para colapsar secciones (H2/H3 bajo un H1)
   y peso tipográfico que marca la jerarquía (H1 extra negrita).
   Usado por el paso 2 (Estructura), el flyout del rail (RailFlyout) y el
   tab "Mapa" del RightSidePanel. Click navega y selecciona el título. */

import React, { useMemo, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { ChevronRight, ChevronDown } from 'lucide-react';

const isRefHeading = (txt: string): boolean => {
  const n = (txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /^(referencias?|bibliografia|obras consultadas|works cited)\b/.test(n.trim());
};

type HeadingElem = { id: string; text?: string; heading_level?: number | null };

type Node = { elem: HeadingElem; children: Node[] };

function buildTree(headings: HeadingElem[]): Node[] {
  const root: Node[] = [];
  const stack: Node[] = [];
  for (const h of headings) {
    const lvl = h.heading_level || 1;
    const node: Node = { elem: h, children: [] };
    while (stack.length && (stack[stack.length - 1].elem.heading_level || 1) >= lvl) {
      stack.pop();
    }
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root.push(node);
    stack.push(node);
  }
  return root;
}

export const OutlineTree: React.FC = () => {
  const doc = useDocStore((s) => s.doc);
  const selectedElementId = useDocStore((s) => s.selectedElementId);
  const setSelectedElementId = useDocStore((s) => s.setSelectedElementId);

  const headings = (
    ((doc?.elements || []) as unknown as (HeadingElem & { type?: string; is_cover_section?: boolean })[])
  ).filter(
    (e) => e.type === 'heading' && !e.is_cover_section && !isRefHeading(e.text || ''),
  );

  const tree = useMemo(() => buildTree(headings), [headings]);

  // Hijos (nivel > 1) arrancan colapsados para no saturar; el usuario expande.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const d = useDocStore.getState().doc;
    const ids = (d?.elements || [])
      .filter((e: any) => e.type === 'heading' && e.heading_level && e.heading_level > 1)
      .map((e: any) => e.id);
    return new Set(ids);
  });

  const toggleNode = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const nav = (id: string) => {
    setSelectedElementId(id);
    // Asegura una vista que muestre el documento completo (Cuerpo o posterior).
    const step = useDocStore.getState().wizardStep;
    if (step < 2 || step > 5) useDocStore.getState().setWizardStep(4);
    document.getElementById(`paper-elem-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const h = node.elem;
    const lvl = h.heading_level || 1;
    const isActive = selectedElementId === h.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(h.id);
    return (
      <div key={h.id}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          {/* Chevron de colapso (solo si tiene hijos) */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleNode(h.id); }}
              title={isCollapsed ? 'Mostrar subtítulos' : 'Ocultar subtítulos'}
              aria-label={isCollapsed ? 'Mostrar subtítulos' : 'Ocultar subtítulos'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                display: 'flex', alignItems: 'center', flexShrink: 0,
                color: 'var(--text-muted)',
              }}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          <button
            type="button"
            onClick={() => nav(h.id)}
            title={h.text || ''}
            style={{
              display: 'block', flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
              border: 'none', background: 'transparent', fontFamily: 'inherit',
              padding: '4px 6px', borderRadius: 'var(--radius-xs)',
              fontSize: lvl === 1 ? '12.5px' : lvl === 2 ? '11.5px' : '11px',
              lineHeight: 1.35,
              color: isActive ? 'var(--accent-primary)' : lvl === 1 ? 'var(--text-main)' : 'var(--text-secondary)',
              fontWeight: lvl === 1 ? 800 : lvl === 2 ? 600 : 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-subtle)'; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            {lvl <= 1 ? (h.text || '').replace(/^\d+[\.\)]?\s*/, '') : (h.text || '')}
          </button>
        </div>
        {hasChildren && !isCollapsed && (
          <div style={{ marginLeft: 14 }}>
            {node.children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '8px', gap: '2px' }}>
      {headings.length === 0 && (
        <div style={{
          padding: '24px 12px', textAlign: 'center', color: 'var(--text-secondary)',
          fontSize: '11.5px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Sin títulos detectados</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Hacé clic sobre cualquier párrafo en el documento para asignarle nivel H1, H2 o H3.
          </span>
        </div>
      )}
      {tree.map((node) => renderNode(node, 1))}
    </div>
  );
};

export default OutlineTree;
