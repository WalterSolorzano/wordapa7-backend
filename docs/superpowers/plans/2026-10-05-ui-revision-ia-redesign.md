# UI Revisión & IA — Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar las dos pantallas (`ReviewInforme` y `AiRoom`) para eliminar texto plano sin jerarquía, corregir el heatmap roto, convertir el `85%` en un hero number de dashboard, dar semántica de color a las tarjetas de fase y reemplazar la UI interna de H1 por un panel/overlay externo.

**Architecture:**
- `ReviewWorkbench` → eliminar 3-columnas con `ReviewMinimap` (viola AGENTS.md §1); sustituir por layout de columna única scrollable con cards agrupadas por motor.
- `AiRoom` (renderizado dentro de `Step5AuditIAWizard`) → hero dashboard con métricas grandes, heatmap rediseñado como sparkbars por fase, tarjetas semánticas de severidad y `PhaseDrawer` lateral on-demand.
- Ningún cambio al backend ni a stores.

**Tech Stack:** React 18, TypeScript, Lucide React, CSS variables de diseño (sin hex hardcodeado).

**Spec:** capturas adjuntas + AGENTS.md §1 (layout por tarea, reglas de revisión secuencial).

---

## Global Constraints

- Cero emojis — solo íconos `lucide-react`.
- Solo `var(--accent-primary)`, `var(--text-main)`, `var(--border-subtle)`, `var(--paper-white)`, `var(--canvas-bg)` y tokens existentes. Prohibido hardcodear hex salvo en `SEVERITY_COLOR` map (que mapea a tokens, no a literales de color).
- `ReviewMinimap` NUNCA debe reintroducirse.
- Motor probabilístico (IA) → SOLO "Marcar para revisar"; motores objetivos → "Aceptar / Aceptar todas".
- Portada: `read_only=true`, sin botón de aceptar, sin `suggestion`.
- `INLINE_STYLE` → usar clases CSS o tokens. Prohibido `style={{ color: '#xxx' }}`.
- Tests: `npm test -- --reporter=dot`; pytest: `pytest -q --tb=short`.

## Review Focus

- Heatmap con todos los párrafos sin score (27 en captura) → debe mostrar estado vacío informativo, no grid hueco.
- Tarjeta de fase con `sin alertas` → color `var(--border-subtle)` (gris), no lila. Click debe abrir `PhaseDrawer`, no expandir inline.
- `PhaseDrawer` al abrir → scroll y foco automático al primer hallazgo de esa fase en el workbench.
- `ReviewInforme` con 0 items → estado vacío con ícono `CheckCircle`, no tabla vacía.
- Cambio de `ancho < RACK_BREAKPOINT` → el nuevo layout de columna única no rompe en pantallas <1180px.

---

## Task 1: Purgar 3-columnas de ReviewWorkbench

**Files:**
- Modify: `src/components/review/ReviewWorkbench.tsx:1-90`

**Interfaces:**
- Consumes: nada nuevo
- Produces: layout de columna única, elimina `ReviewMinimap` del render y del import

- [ ] **Step 1: Leer el render completo de ReviewWorkbench**

```bash
# Leer líneas 90-200 para ver estructura actual del JSX
```
En el editor, abrir `ReviewWorkbench.tsx` líneas 90–250 para localizar el div raíz de 3 columnas.

- [ ] **Step 2: Eliminar import ReviewMinimap y su bloque JSX**

En `ReviewWorkbench.tsx` quitar la línea de import:
```tsx
// BORRAR:
import { ReviewMinimap } from './ReviewMinimap';
```
Y en el JSX, reemplazar el wrapper de 3 columnas por:
```tsx
<div className="rwb-single-col">
  {/* FocusReadingCard + EngineGroupCard van aquí, apilados */}
</div>
```

- [ ] **Step 3: Ajustar CSS del nuevo layout de columna única**

En `src/styles/review.css` (o el equivalente de estilos del componente) agregar:
```css
.rwb-single-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px 40px;
}
```

- [ ] **Step 4: Verificar que ReviewMinimap no aparece en ningún test**

```bash
npx grep -r "ReviewMinimap" src/ --include="*.tsx" --include="*.ts"
```
Actualizar cualquier import muerto en tests.

- [ ] **Step 5: Correr tests del componente**

```bash
npm test -- -t "ReviewWorkbench" --reporter=dot
```
Expected: PASS (o ajustar snapshots si los hay).

- [ ] **Step 6: Commit**

```bash
git add src/components/review/ReviewWorkbench.tsx src/styles/review.css
git commit -m "fix(review): purge 3-col ReviewMinimap layout (AGENTS §1)"
```

---

## Task 2: Jerarquía tipográfica en ReviewInforme (lista de hallazgos)

**Files:**
- Modify: `src/components/review/ReviewInforme.tsx` (o el componente que muestra el texto plano del informe general)
- Create: `src/components/review/FindingRow.tsx`

**Interfaces:**
- Consumes: `AuditItem` de `auditItems.ts` (campos: `id`, `kind`, `phase`, `message`, `excerpt`, `suggestion`, `read_only`, `category`)
- Produces: `<FindingRow item={AuditItem} onAccept onMark onDismiss />` — card con jerarquía tipográfica

- [ ] **Step 1: Identificar el componente que renderiza el texto plano**

Leer `src/components/review/ReviewInforme.tsx` líneas 1–60. Si el componente se llama diferente (ej. `ReviewGeneralReport`), ajustar nombre.

- [ ] **Step 2: Crear FindingRow.tsx**

```tsx
// src/components/review/FindingRow.tsx
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';

const CATEGORY_ICON: Record<string, React.ElementType> = {
  bloom: AlertTriangle,
  structure: Info,
  citations: AlertTriangle,
  ai: AlertTriangle,
};

interface FindingRowProps {
  item: AuditItem;
  onAccept?: (id: string) => void;
  onMark?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function FindingRow({ item, onAccept, onMark, onDismiss }: FindingRowProps) {
  const Icon = CATEGORY_ICON[item.category] ?? Info;
  const isReadOnly = item.read_only;
  const isAI = item.category === 'ai';

  return (
    <div className="finding-row" data-category={item.category}>
      <div className="finding-row__icon">
        <Icon size={16} />
      </div>
      <div className="finding-row__body">
        <p className="finding-row__phase">{item.phase}</p>
        <p className="finding-row__message">{item.message}</p>
        {item.excerpt && (
          <blockquote className="finding-row__excerpt">
            &ldquo;{item.excerpt}&rdquo;
          </blockquote>
        )}
        {item.suggestion && !isReadOnly && (
          <p className="finding-row__suggestion">{item.suggestion}</p>
        )}
      </div>
      {!isReadOnly && (
        <div className="finding-row__actions">
          {!isAI && onAccept && (
            <button className="btn-ghost btn-sm" onClick={() => onAccept(item.id)}>
              Aceptar
            </button>
          )}
          {isAI && onMark && (
            <button className="btn-ghost btn-sm" onClick={() => onMark(item.id)}>
              Marcar para revisar
            </button>
          )}
          {onDismiss && (
            <button className="btn-ghost btn-sm btn-dim" onClick={() => onDismiss(item.id)}>
              Ignorar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: CSS para FindingRow**

En `src/styles/review.css` agregar:
```css
.finding-row {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  gap: 10px 12px;
  align-items: start;
  padding: 12px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--paper-white);
}
.finding-row__icon { color: var(--accent-primary); padding-top: 2px; }
.finding-row__phase {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 2px;
}
.finding-row__message {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
  margin: 0;
}
.finding-row__excerpt {
  font-size: 12px;
  color: var(--text-muted);
  border-left: 2px solid var(--border-subtle);
  margin: 6px 0 0;
  padding-left: 8px;
  font-style: italic;
}
.finding-row__suggestion {
  font-size: 12px;
  color: var(--accent-primary);
  margin: 4px 0 0;
}
.finding-row__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}
```

- [ ] **Step 4: Reemplazar el texto plano en ReviewInforme**

En `ReviewInforme.tsx` sustituir el bloque de lista plana por:
```tsx
import { FindingRow } from './FindingRow';

// Dentro del render, donde estaba la lista:
<div className="finding-list">
  {items.map(item => (
    <FindingRow
      key={item.id}
      item={item}
      onAccept={!item.read_only && item.category !== 'ai' ? handleAccept : undefined}
      onMark={item.category === 'ai' ? handleMark : undefined}
      onDismiss={handleDismiss}
    />
  ))}
  {items.length === 0 && (
    <div className="finding-empty">
      <CheckCircle size={32} />
      <p>Sin hallazgos en esta fase</p>
    </div>
  )}
</div>
```

- [ ] **Step 5: Test**

```bash
npm test -- -t "FindingRow" --reporter=dot
```

- [ ] **Step 6: Commit**

```bash
git add src/components/review/FindingRow.tsx src/components/review/ReviewInforme.tsx src/styles/review.css
git commit -m "feat(review): FindingRow con jerarquía tipográfica, reemplaza lista plana"
```

---

## Task 3: Hero Dashboard en AiRoom (85% gigante)

**Files:**
- Modify: `src/components/review/AiRoom.tsx` (o el componente que renderiza la "Sala de IA")
- Create: `src/components/review/AiHeroBanner.tsx`

**Interfaces:**
- Consumes: `{ score: number, rigidez: number, totalParrafos: number, nitidos: number, enAlerta: number, picoCritico: string }`
- Produces: `<AiHeroBanner />` — bloque hero con número 85% prominente y stats secundarias

- [ ] **Step 1: Leer el componente AiRoom actual**

Leer `src/components/review/AiRoom.tsx` (o el wrapper de `AiHierarchy` en `Step5AuditIAWizard`) completo.

- [ ] **Step 2: Crear AiHeroBanner.tsx**

```tsx
// src/components/review/AiHeroBanner.tsx
import { ShieldCheck, AlertTriangle, Users, FileText } from 'lucide-react';

interface AiHeroBannerProps {
  score: number;           // 85
  rigidez: number;         // 15 (%)
  totalParrafos: number;   // 189
  nitidos: number;         // 161
  enAlerta: number;        // 28
  picoCritico: string;     // "Capítulo 1 (100%)"
}

export function AiHeroBanner({
  score, rigidez, totalParrafos, nitidos, enAlerta, picoCritico
}: AiHeroBannerProps) {
  const scoreColor = score >= 80
    ? 'var(--success)'
    : score >= 60
    ? 'var(--warning)'
    : 'var(--danger)';

  return (
    <div className="ai-hero">
      {/* Hero number */}
      <div className="ai-hero__score" style={{ color: scoreColor }}>
        {score}%
      </div>
      <div className="ai-hero__label">Voz Autoral Humana</div>

      {/* Stat row secundaria */}
      <div className="ai-hero__stats">
        <StatChip icon={AlertTriangle} value={`${rigidez}%`} label="rigidez sintética" danger />
        <StatChip icon={FileText} value={totalParrafos} label="párrafos" />
        <StatChip icon={Users} value={nitidos} label="con autoría nítida" />
        <StatChip icon={AlertTriangle} value={enAlerta} label="en alerta" danger />
      </div>

      {/* Pico crítico */}
      {picoCritico && (
        <p className="ai-hero__peak">
          Pico crítico: <strong>{picoCritico}</strong>
        </p>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, value, label, danger }: {
  icon: React.ElementType; value: string | number; label: string; danger?: boolean;
}) {
  return (
    <div className={`stat-chip${danger ? ' stat-chip--danger' : ''}`}>
      <Icon size={12} />
      <span className="stat-chip__value">{value}</span>
      <span className="stat-chip__label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: CSS del hero**

```css
/* src/styles/ai-room.css */
.ai-hero {
  padding: 28px 32px 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.ai-hero__score {
  font-size: 72px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -2px;
  font-variant-numeric: tabular-nums;
}
.ai-hero__label {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 4px 0 16px;
}
.ai-hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  background: var(--canvas-bg);
  font-size: 12px;
  color: var(--text-main);
}
.stat-chip--danger { border-color: var(--danger); color: var(--danger); }
.stat-chip__value { font-weight: 700; }
.stat-chip__label { color: var(--text-muted); }
.ai-hero__peak {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}
```

- [ ] **Step 4: Integrar AiHeroBanner en AiRoom/AiHierarchy**

En el componente que renderiza la sala de IA, reemplazar el header actual por:
```tsx
<AiHeroBanner
  score={aiScore}
  rigidez={rigidezPct}
  totalParrafos={totalP}
  nitidos={nitidosN}
  enAlerta={enAlertaN}
  picoCritico={picoCritico}
/>
```

- [ ] **Step 5: Test**

```bash
npm test -- -t "AiHero" --reporter=dot
```

- [ ] **Step 6: Commit**

```bash
git add src/components/review/AiHeroBanner.tsx src/styles/ai-room.css
git commit -m "feat(ai-room): hero dashboard 72px score, stat chips secundarios"
```

---

## Task 4: Reemplazar Heatmap por Treemap interactivo ✅ Diseño aprobado

**Decisión de diseño:** El heatmap original dejaba ~90% de celdas vacías (cada capítulo cae en UN rango, no en varios). El treemap aprobado en mockup resuelve esto: **área del bloque = volumen de párrafos del capítulo**, **color del bloque = riesgo IA** (verde/azul/naranja/rojo). De un vistazo el usuario ve qué capítulos son grandes Y más riesgosos. Click en cualquier bloque abre el `PhaseDrawer`.

**Referencia visual:** `mockup_sala_ia.html` — tab "Treemap".

**Files:**
- Modify: `src/components/review/AiHeatmap.tsx` → reemplazar render por `<AiTreemap />`
- Create: `src/components/review/AiTreemap.tsx`

**Interfaces:**
- Consumes: `{ filas: FilaHeatmap[]; onSelectFase?: (titulo: string) => void }`
- `FilaHeatmap`: `{ titulo: string; scores: number[]; count: number; alertas?: number }`
- Produces: `<AiTreemap />` — treemap de divs absolutamente posicionados, clickeable, con tooltip nativo

**Algoritmo de layout:** Slice-and-dice greedy: ordenar fases por `count` desc, empaquetar en filas horizontales/verticales alternadas según aspecto del espacio restante; cada celda ocupa área proporcional a `Math.max(count, 2)`.

- [ ] **Step 1: Crear AiTreemap.tsx**

```tsx
// src/components/review/AiTreemap.tsx
import { useRef, useEffect, useState } from 'react';

interface TreemapFila {
  titulo: string;
  parrafos: number;
  score: number | null;
  alertas: number;
}

interface AiTreemapProps {
  filas: TreemapFila[];
  onSelectFase?: (titulo: string) => void;
}

function scoreColor(s: number | null): string {
  if (s === null) return 'var(--border-subtle, #e5e7eb)';
  if (s >= 90) return '#16a34a';
  if (s >= 75) return '#3b82f6';
  if (s >= 60) return '#f97316';
  return '#dc2626';
}

interface CellRect { x: number; y: number; w: number; h: number; item: TreemapFila & { val: number }; }

function buildLayout(items: TreemapFila[], W: number, H: number): CellRect[] {
  const sorted = [...items].sort((a, b) => b.parrafos - a.parrafos);
  const rects: CellRect[] = [];
  let remaining = sorted.map(i => ({ ...i, val: Math.max(i.parrafos, 2) }));
  let cx = 0, cy = 0, cw = W, ch = H;

  function layoutRow(row: typeof remaining, rx: number, ry: number, rw: number, rh: number, horiz: boolean) {
    const rowVal = row.reduce((s, i) => s + i.val, 0);
    let pos = horiz ? rx : ry;
    row.forEach(item => {
      const frac = item.val / rowVal;
      if (horiz) {
        const w = Math.round(rw * frac);
        rects.push({ x: pos, y: ry, w, h: rh, item });
        pos += w;
      } else {
        const h = Math.round(rh * frac);
        rects.push({ x: rx, y: pos, w: rw, h, item });
        pos += h;
      }
    });
  }

  while (remaining.length > 0) {
    const remVal = remaining.reduce((s, i) => s + i.val, 0);
    const horizontal = cw >= ch;
    let row: typeof remaining = [];
    let rowV = 0;
    let best = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = [...row, remaining[i]];
      const candV = rowV + remaining[i].val;
      const frac = candV / remVal;
      const mainLen = Math.round((horizontal ? cw : ch) * frac);
      const crossLen = horizontal ? ch : cw;
      const worstRatio = candidate.reduce((mx, it) => {
        const cellMain = Math.round(mainLen * (it.val / candV));
        const r = crossLen > cellMain ? crossLen / Math.max(cellMain, 1) : cellMain / Math.max(crossLen, 1);
        return Math.max(mx, r);
      }, 0);
      if (worstRatio < best) { best = worstRatio; row = candidate; rowV = candV; }
      else break;
    }
    if (row.length === 0) { row = [remaining[0]]; rowV = remaining[0].val; }

    const frac = rowV / remVal;
    if (horizontal) {
      const mainLen = Math.round(cw * frac);
      layoutRow(row, cx, cy, mainLen, ch, false);
      cx += mainLen; cw -= mainLen;
    } else {
      const mainLen = Math.round(ch * frac);
      layoutRow(row, cx, cy, cw, mainLen, true);
      cy += mainLen; ch -= mainLen;
    }
    remaining = remaining.filter(i => !row.includes(i));
  }
  return rects;
}

export function AiTreemap({ filas, onSelectFase }: AiTreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<CellRect[]>([]);
  const [containerH, setContainerH] = useState(300);
  const GAP = 3;

  useEffect(() => {
    if (!containerRef.current) return;
    const W = containerRef.current.clientWidth;
    const H = Math.round(W * 0.58);
    setContainerH(H);
    setRects(buildLayout(filas, W, H));
  }, [filas]);

  if (filas.length === 0) return (
    <div className="treemap-empty">Sin datos de score disponibles</div>
  );

  return (
    <div ref={containerRef} className="ai-treemap" style={{ height: containerH }}>
      {rects.map((r, idx) => {
        const color = scoreColor(r.item.score);
        const showLabel = r.w > 52 && r.h > 38;
        return (
          <div
            key={r.item.titulo + idx}
            className="treemap-cell"
            style={{ left: r.x + GAP, top: r.y + GAP, width: r.w - GAP * 2, height: r.h - GAP * 2, background: color }}
            title={`${r.item.titulo}: ${r.item.parrafos} párrafos · ${r.item.alertas} alertas · ${r.item.score ?? '—'}%`}
            role="button"
            tabIndex={0}
            aria-label={`${r.item.titulo}, ${r.item.alertas} alertas`}
            onClick={() => onSelectFase?.(r.item.titulo)}
            onKeyDown={e => e.key === 'Enter' && onSelectFase?.(r.item.titulo)}
          >
            {showLabel && (
              <div className="treemap-cell__label">
                <span className="treemap-cell__title">{r.item.titulo}</span>
                <span className="treemap-cell__sub">
                  {r.item.alertas > 0 ? `${r.item.alertas} alertas` : `${r.item.score}% ✓`}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Conversión FilaHeatmap → TreemapFila en AiHeatmap.tsx**

```tsx
import { AiTreemap } from './AiTreemap';

function toTreemapFila(f: FilaHeatmap): TreemapFila {
  const validos = f.scores.filter(s => !isNaN(s) && s > 0);
  const score = validos.length > 0
    ? Math.round(validos.reduce((a, b) => a + b, 0) / validos.length)
    : null;
  return { titulo: f.titulo, parrafos: f.count ?? validos.length, score, alertas: f.alertas ?? 0 };
}
```
Reemplazar el render del grid por:
```tsx
<AiTreemap filas={filas.map(toTreemapFila)} onSelectFase={onSelectFase} />
```

- [ ] **Step 3: CSS del Treemap en src/styles/ai-room.css**

```css
.ai-treemap { position: relative; width: 100%; border-radius: 6px; overflow: hidden; }
.treemap-cell {
  position: absolute; border-radius: 4px; overflow: hidden; cursor: pointer;
  display: flex; flex-direction: column; justify-content: flex-end; padding: 6px 8px;
  transition: filter 0.12s, transform 0.12s;
}
.treemap-cell:hover { filter: brightness(0.88); transform: scale(1.015); z-index: 5; }
.treemap-cell:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.treemap-cell__label {
  display: flex; flex-direction: column; gap: 1px;
  background: linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 100%);
  border-radius: 0 0 4px 4px; margin: -6px -8px; padding: 10px 8px 6px;
}
.treemap-cell__title { font-size: 12px; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.5); line-height: 1.2; }
.treemap-cell__sub   { font-size: 11px; color: rgba(255,255,255,.82); }
.treemap-legend { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px 0 4px; }
.treemap-legend__item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-muted); }
.treemap-legend__swatch { display: inline-block; width: 14px; height: 10px; border-radius: 2px; }
.treemap-empty { padding: 32px; text-align: center; font-size: 13px; color: var(--text-muted); }
```

- [ ] **Step 4: Leyenda debajo del treemap en AiHeatmap.tsx**

```tsx
const LEGEND = [
  { color: '#16a34a', label: 'Bajo (90–100%)' },
  { color: '#3b82f6', label: 'Medio (75–89%)' },
  { color: '#f97316', label: 'Alto (60–74%)' },
  { color: '#dc2626', label: 'Crítico (<60%)' },
];
// Después de <AiTreemap />:
<div className="treemap-legend">
  {LEGEND.map(({ color, label }) => (
    <span key={label} className="treemap-legend__item">
      <span className="treemap-legend__swatch" style={{ background: color }} />
      {label}
    </span>
  ))}
</div>
```

- [ ] **Step 5: Estado vacío**

Si `filas.every(f => (f.count ?? 0) === 0)`, el div `.treemap-empty` aparece con: `"Sin puntuaciones aún — procesando párrafos"`. Verificar que no crashea.

- [ ] **Step 6: Test**

```bash
npm test -- -t "AiTreemap\|AiHeatmap" --reporter=dot
```
Casos: array vacío, 1 item, 12 items con datos variados (incluir `score: null`).

- [ ] **Step 7: Commit**

```bash
git add src/components/review/AiTreemap.tsx src/components/review/AiHeatmap.tsx src/styles/ai-room.css
git commit -m "feat(ai-room): treemap interactivo reemplaza heatmap (diseño aprobado)"
```

**Files:**
- Modify: `src/components/review/AiHeatmap.tsx`
- Create: `src/components/review/AiSparkBar.tsx`

**Interfaces:**
- Consumes: `{ filas: FilaHeatmap[], max: number }` (misma interface que el heatmap actual)
- `FilaHeatmap`: `{ titulo: string; scores: number[]; count: number }`
- Produces: `<AiSparkBar />` — lista de filas con barra de progreso semántica, score medio y count de alertas

**Problema a resolver:** El heatmap actual es una grid de rangos de score; cuando solo 1 capítulo tiene datos muestra 1 celda morada flotando en un grid vacío. El diseño nuevo usa una barra horizontal por fase, mostrando el score promedio y el número de párrafos medidos.

- [ ] **Step 1: Crear AiSparkBar.tsx**

```tsx
// src/components/review/AiSparkBar.tsx
interface SparkBarFila {
  titulo: string;
  scoreMedio: number;   // 0-100, NaN si sin datos
  alertas: number;
  total: number;
}

interface AiSparkBarProps {
  filas: SparkBarFila[];
  onSelectFase?: (titulo: string) => void;
}

function severityColor(score: number): string {
  if (isNaN(score)) return 'var(--border-subtle)';
  if (score >= 90) return 'var(--success)';
  if (score >= 75) return 'var(--accent-primary)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--danger)';
}

export function AiSparkBar({ filas, onSelectFase }: AiSparkBarProps) {
  if (filas.length === 0) return null;

  return (
    <div className="ai-sparkbar">
      {filas.map(fila => {
        const sinDatos = isNaN(fila.scoreMedio) || fila.total === 0;
        const color = severityColor(fila.scoreMedio);
        const pct = sinDatos ? 0 : fila.scoreMedio;

        return (
          <div
            key={fila.titulo}
            className="sparkbar-row"
            role={onSelectFase ? 'button' : undefined}
            tabIndex={onSelectFase ? 0 : undefined}
            onClick={() => onSelectFase?.(fila.titulo)}
            onKeyDown={e => e.key === 'Enter' && onSelectFase?.(fila.titulo)}
          >
            <span className="sparkbar-row__title">{fila.titulo}</span>
            <div className="sparkbar-row__track">
              <div
                className="sparkbar-row__fill"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="sparkbar-row__score" style={{ color: sinDatos ? 'var(--text-muted)' : color }}>
              {sinDatos ? '—' : `${Math.round(fila.scoreMedio)}%`}
            </span>
            {fila.alertas > 0 && (
              <span className="sparkbar-row__badge">{fila.alertas}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: CSS de AiSparkBar**

```css
.ai-sparkbar { display: flex; flex-direction: column; gap: 6px; padding: 16px 32px; }
.sparkbar-row {
  display: grid;
  grid-template-columns: 160px 1fr 44px 28px;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
}
.sparkbar-row:hover { background: var(--canvas-bg); }
.sparkbar-row__title { font-size: 13px; font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sparkbar-row__track { height: 8px; border-radius: 4px; background: var(--border-subtle); overflow: hidden; }
.sparkbar-row__fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
.sparkbar-row__score { font-size: 12px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.sparkbar-row__badge {
  font-size: 10px; font-weight: 700; text-align: center;
  background: var(--danger); color: #fff;
  border-radius: 9999px; min-width: 18px; height: 18px; line-height: 18px;
}
```

- [ ] **Step 3: Adaptar AiHeatmap para usar SparkBar internamente**

En `AiHeatmap.tsx`, agregar una función de conversión `FilaHeatmap → SparkBarFila`:
```tsx
function toSparkFila(f: FilaHeatmap): SparkBarFila {
  const validos = f.scores.filter(s => !isNaN(s) && s > 0);
  const scoreMedio = validos.length > 0
    ? validos.reduce((a, b) => a + b, 0) / validos.length
    : NaN;
  return { titulo: f.titulo, scoreMedio, alertas: f.alertas ?? 0, total: f.scores.length };
}
```
Y reemplazar el render del grid por `<AiSparkBar filas={filas.map(toSparkFila)} onSelectFase={onSelectFase} />`.

- [ ] **Step 4: Verificar estado vacío**

Si `filas.every(f => f.total === 0)`, mostrar:
```tsx
<div className="heatmap-empty">
  <Info size={20} />
  <p>Sin puntuaciones aún — procesando párrafos</p>
</div>
```

- [ ] **Step 5: Test**

```bash
npm test -- -t "AiHeatmap\|AiSparkBar" --reporter=dot
```

- [ ] **Step 6: Commit**

```bash
git add src/components/review/AiSparkBar.tsx src/components/review/AiHeatmap.tsx src/styles/ai-room.css
git commit -m "feat(ai-room): heatmap → sparkbars por fase con semántica de color y estado vacío"
```

---

## Task 5: Tarjetas de fase con semántica de color y PhaseDrawer

**Files:**
- Modify: `src/components/review/AiChapterGrid.tsx` (o `AiHierarchy.tsx` donde están las tarjetas moradas)
- Create: `src/components/review/PhaseDrawer.tsx`

**Interfaces:**
- Consumes: `{ titulo: string; alertas: number; total: number; items: AuditItem[]; onClose: () => void; onOpenInWorkbench: (phaseId: string) => void }`
- Produces: `<PhaseDrawer />` — panel lateral deslizante con resumen de hallazgos de la fase, sin UI interna de edición

**Problema a resolver:** Las tarjetas tenían el mismo lila para 0 alertas y 8 alertas. Click abría UI inline en la misma fase. El nuevo diseño usa color semántico y un drawer lateral.

- [ ] **Step 1: Leer AiChapterGrid.tsx o localizar las tarjetas de fase**

```bash
# Localizar qué archivo renderiza las tarjetas moradas del grid de fases
grep -rn "alertas\|sin alertas" src/components/review/ --include="*.tsx" | Select-Object -First 15
```

- [ ] **Step 2: Función de color semántico para tarjetas**

En el archivo de tarjetas, reemplazar el color uniforme por:
```tsx
function phaseCardStyle(alertas: number, total: number): React.CSSProperties {
  if (alertas === 0) return { background: 'var(--canvas-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' };
  const ratio = alertas / Math.max(total, 1);
  if (ratio > 0.4) return { background: 'var(--danger-bg)', borderColor: 'var(--danger)', color: 'var(--danger)' };
  if (ratio > 0.15) return { background: 'var(--warning-bg)', borderColor: 'var(--warning)', color: 'var(--warning)' };
  return { background: 'var(--accent-bg)', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' };
}
```

Aplicar `phaseCardStyle(card.alertas, card.total)` como `style` del elemento tarjeta.

- [ ] **Step 3: Crear PhaseDrawer.tsx**

```tsx
// src/components/review/PhaseDrawer.tsx
import { X, ArrowRight } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';

interface PhaseDrawerProps {
  titulo: string;
  items: AuditItem[];
  onClose: () => void;
  onOpenInWorkbench: (phaseId: string) => void;
}

export function PhaseDrawer({ titulo, items, onClose, onOpenInWorkbench }: PhaseDrawerProps) {
  return (
    <>
      {/* Overlay */}
      <div className="phase-drawer-overlay" onClick={onClose} aria-hidden />

      {/* Panel lateral */}
      <aside className="phase-drawer" role="dialog" aria-label={`Fase: ${titulo}`}>
        <div className="phase-drawer__header">
          <h2 className="phase-drawer__title">{titulo}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="phase-drawer__summary">
          <span className="phase-drawer__count">{items.length}</span>
          <span className="phase-drawer__count-label"> hallazgos en esta fase</span>
        </div>

        {/* Lista compacta de hallazgos */}
        <div className="phase-drawer__list">
          {items.length === 0 && (
            <p className="phase-drawer__empty">Sin hallazgos en esta fase.</p>
          )}
          {items.slice(0, 8).map(item => (
            <div key={item.id} className="phase-drawer__item">
              <p className="phase-drawer__item-kind">{item.kind}</p>
              <p className="phase-drawer__item-msg">{item.message}</p>
            </div>
          ))}
          {items.length > 8 && (
            <p className="phase-drawer__more">+{items.length - 8} más</p>
          )}
        </div>

        {/* CTA para ir al workbench secuencial */}
        <div className="phase-drawer__footer">
          <button
            className="btn-solid btn-sm"
            onClick={() => { onOpenInWorkbench(titulo); onClose(); }}
          >
            Revisar párrafo a párrafo
            <ArrowRight size={14} />
          </button>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 4: CSS del PhaseDrawer**

```css
.phase-drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.25);
  z-index: 200;
}
.phase-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 360px;
  background: var(--paper-white);
  border-left: 1px solid var(--border-subtle);
  z-index: 201;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,0.08);
  animation: slideIn 0.18s ease;
}
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.phase-drawer__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 20px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.phase-drawer__title { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; }
.phase-drawer__summary { padding: 12px 20px; font-size: 13px; color: var(--text-muted); }
.phase-drawer__count { font-size: 28px; font-weight: 800; color: var(--accent-primary); }
.phase-drawer__list { flex: 1; overflow-y: auto; padding: 8px 20px; display: flex; flex-direction: column; gap: 8px; }
.phase-drawer__item { padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 6px; }
.phase-drawer__item-kind { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); margin: 0 0 2px; }
.phase-drawer__item-msg { font-size: 13px; color: var(--text-main); margin: 0; }
.phase-drawer__more { font-size: 12px; color: var(--text-muted); text-align: center; padding: 8px 0; }
.phase-drawer__empty { font-size: 13px; color: var(--text-muted); padding: 20px 0; text-align: center; }
.phase-drawer__footer { padding: 16px 20px; border-top: 1px solid var(--border-subtle); }
```

- [ ] **Step 5: Conectar PhaseDrawer al click de la tarjeta**

En el componente de tarjetas (AiChapterGrid o AiHierarchy):
```tsx
const [drawerPhase, setDrawerPhase] = useState<string | null>(null);

// En el onClick de cada tarjeta:
onClick={() => setDrawerPhase(card.titulo)}

// En el render, al final:
{drawerPhase && (
  <PhaseDrawer
    titulo={drawerPhase}
    items={items.filter(i => i.phase === drawerPhase)}
    onClose={() => setDrawerPhase(null)}
    onOpenInWorkbench={(phase) => { onSelectPhase?.(phase); setDrawerPhase(null); }}
  />
)}
```

- [ ] **Step 6: Verificar que el estado inline anterior fue removido**

Buscar cualquier bloque que expandía la UI dentro de la fase:
```bash
grep -n "capAbierto\|selectedH1\|inline.*expand" src/components/review/AiHierarchy.tsx | Select-Object -First 10
```
Si `capAbierto` o `selectedH1Id` existían para expandir inline, verificar que ahora solo abren `PhaseDrawer`.

- [ ] **Step 7: Test**

```bash
npm test -- -t "PhaseDrawer\|AiChapter" --reporter=dot
```

- [ ] **Step 8: Commit**

```bash
git add src/components/review/PhaseDrawer.tsx src/components/review/AiChapterGrid.tsx src/styles/ai-room.css
git commit -m "feat(ai-room): PhaseDrawer lateral, tarjetas con semántica de color por severidad"
```

---

## Task 6: Tokens CSS faltantes y verificación final

**Files:**
- Modify: `src/styles/tokens.css` (o el archivo de variables CSS del proyecto)
- Verify: Todos los tokens nuevos usados en Tasks 3–5

**Interfaces:**
- Consume: nada
- Produce: tokens `--success`, `--warning`, `--danger`, `--danger-bg`, `--warning-bg`, `--accent-bg` definidos

- [ ] **Step 1: Verificar tokens existentes**

```bash
grep -n "success\|warning\|danger\|accent-bg" src/styles/tokens.css | Select-Object -First 20
```

- [ ] **Step 2: Agregar tokens faltantes**

Si faltan, añadir en `src/styles/tokens.css`:
```css
:root {
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --danger-bg: #fef2f2;
  --warning-bg: #fffbeb;
  --accent-bg: #eff6ff;
}
.dark {
  --success: #4ade80;
  --warning: #fbbf24;
  --danger: #f87171;
  --danger-bg: rgba(220,38,38,0.1);
  --warning-bg: rgba(217,119,6,0.1);
  --accent-bg: rgba(59,130,246,0.1);
}
```

- [ ] **Step 3: Suite completa de tests**

```bash
npm test -- --reporter=dot
pytest -q --tb=short python/tests/
```
Expected: PASS en todos. Ajustar cualquier snapshot roto por los cambios de layout.

- [ ] **Step 4: Commit final**

```bash
git add src/styles/tokens.css
git commit -m "chore: tokens CSS --success/warning/danger/bg para AI room redesign"
```

---

## Orden de ejecución recomendado

```
Task 1 → Task 6 (tokens primero para que compilen sin error) → Task 2 → Task 3 → Task 4 → Task 5
```
En la práctica: hacer Task 6 Step 1-2 antes de Task 3 para no tener errores de var() desconocidas.
