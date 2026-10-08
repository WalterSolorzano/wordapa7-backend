# Estructura: rail de 2 destinos, esquema navegable e índice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la fase Estructura con un rail de 2 destinos (Esquema / Índice), descargar el árbol, añadir zoom/pan/drag al diagrama, corregir los falsos positivos de parser y prosa, y permitir elegir la notación de H1/H2.

**Architecture:** Se conserva `EscritorioEstructura` como shell, pero pasa a `grid` `56px | panel-izq | centro | derecho`, con un destino activo `'esquema' | 'indice'`. El esquema usa `MapaEstructura` con raíz sintética "Documento" y transformaciones CSS (zoom/pan) sobre un `<g>`; el índice reutiliza el árbol de `jerarquia.ts` plegado por H1 y añade un panel de controles de diseño. Los bugs de parser se corrigen en `python/parsing/`.

**Tech Stack:** React 18 + TypeScript + Vite, Zustand (`useDocStore`), Lucide React, Vitest + Testing Library; Python 3.11 + FastAPI, pytest. Sin librerías de grafos.

**Spec:** `docs/superpowers/specs/2026-10-04-estructura-rail-indice-design.md`

## Global Constraints

- CERO emojis en UI/copys; solo íconos `lucide-react`.
- Solo tokens CSS (`var(--accent-primary)`, `var(--text-main)`, `var(--border-subtle)`, `var(--paper-white)`, `var(--paper-ink)`, etc.). Prohibido hex literal.
- La hoja es siempre `--paper-white` con tinta `--paper-ink`; el lienzo exterior usa `--bg-canvas`/`--color-bg-canvas`.
- No añadir librería de grafos (`estructuraNoMiente.test.ts` lo prohíbe).
- No decidir el ámbito/fase buscando palabras en el cuerpo de un párrafo.
- Comandos de shell: este repo tiene el plugin `opencode-snip` que rompe comandos sin pipe. **Terminá cada comando con ` | Out-String`**.
- Frontend: `npm test -- --run <ruta>` (Vitest). Backend: `pytest -q python/tests/<archivo>.py`.
- Cada tarea cierra con commit propio.

## Referencia visual (mockup aprobado)

El usuario aprobó la estética del mockup `docs/superpowers/mockups/2026-10-03-estructura-redesign.html` (servido en `http://localhost:8765/2026-10-03-estructura-redesign.html`). Reutilizar su lenguaje visual, que ya está tokenizado en `src/styles/design-system.css`:

- Fuentes: `--font-display` (Outfit) en títulos y filas H1/nodos; `--font-mono` (JetBrains Mono) en badges `H1/H2/H3` y números; `--font-editorial` (Newsreader) solo en el cuerpo del paper.
- Color por nivel: H1 `--color-accent`, H2 `--color-secondary` (teal), H3 `--color-level-3` (indigo); tinta de títulos `--color-ink`. `src/styles/estructura.css` ya pinta el diagrama con estos tokens (`.lv1/.lv2/.lv3` y `.mapa-arista.e1/e2/e3`).
- Piezas de fila del árbol a conservar: chevron de plegado, badge de nivel, título en una línea con elipsis, barra de balance de 40px y marca de selección de 2px a la izquierda (equivalente a `.row.sel`).
- Lo que el mockup NO refleja y manda el diseño: raíz sintética "Documento" en el diagrama, SIN conteos de palabras/páginas dentro de los nodos, zoom/pan/arrastre, y rail de 2 destinos ESQUEMA/ÍNDICE con preview de índice y `ControlesIndice`.

## Review Focus

1. Un párrafo de cuerpo con UNA palabra en negrita y sangría NO debe aparecer como H4 en el árbol.
2. Una sección cuyos hijos son listas (`bullet`/`numbered_list`) NO debe mostrar "no contiene párrafos de prosa".
3. Un título duplicado antes del real (TOC de Word) NO debe sombrear la sección al resolver por id.
4. Arrastrar una rama sobre su propio descendiente NO debe emitir `reorderElements`.
5. Cambiar la notación a romanos en H2 debe verse igual en el preview y en el .docx generado (no solo en H1).

---

## Task 1: Corregir el falso vacío de prosa (`LecturaProsaSeccion`)

**Files:**
- Modify: `src/components/structure/LecturaProsaSeccion.tsx:38-53,82-90`
- Test: `src/components/structure/__tests__/LecturaProsaSeccion.test.tsx`

**Interfaces:**
- Consumes: `NodoJerarquia` (`src/lib/jerarquia.ts`), `ElementModel` (`src/types`).
- Produces: mismo componente, sin cambio de props; `tieneContenido` cuenta `bullet`/`numbered_list`/`block_quote`; `deLaSeccion` resuelve por id primero y por título (último match) como respaldo.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/components/structure/__tests__/LecturaProsaSeccion.test.tsx` (dentro del `describe` existente, reutilizando sus imports de `render`/`screen`/`ElementModel`):

```tsx
it('muestra una lista numerada como contenido, no como vacío', () => {
  const nodo = {
    id: 'h2-1', elementoId: 'h2-1', titulo: 'Objetivos específicos', nivel: 2,
    palabras: 12, figuras: 0, tablas: 0, citas: 0, hijos: [], fase: null,
  } as unknown as import('../../../lib/jerarquia').NodoJerarquia;
  const elementos = [
    { id: 'h2-1', type: 'heading', text: 'Objetivos específicos', heading_level: 2 },
    { id: 'l1', type: 'numbered_list', text: 'Diseñar el sistema.' },
    { id: 'l2', type: 'numbered_list', text: 'Implementar el plan.' },
    { id: 'h2-2', type: 'heading', text: 'Marco teórico', heading_level: 1 },
  ] as unknown as import('../../../types').ElementModel[];
  render(<LecturaProsaSeccion seccionActiva={nodo} elementos={elementos} />);
  expect(screen.queryByText(/no contiene párrafos de prosa/i)).toBeNull();
  expect(screen.getByText('Diseñar el sistema.')).toBeTruthy();
});

it('no confunde la sección con un título duplicado anterior (TOC)', () => {
  const nodo = {
    id: 'h2-1', elementoId: 'h2-1', titulo: 'Objetivos específicos', nivel: 2,
    palabras: 8, figuras: 0, tablas: 0, citas: 0, hijos: [], fase: null,
  } as unknown as import('../../../lib/jerarquia').NodoJerarquia;
  const elementos = [
    { id: 'toc-h', type: 'heading', text: 'Objetivos específicos', heading_level: 2 },
    { id: 'toc-p', type: 'paragraph', text: 'Índice (TOC).' },
    { id: 'h1', type: 'heading', text: 'Objetivos', heading_level: 1 },
    { id: 'h2-1', type: 'heading', text: 'Objetivos específicos', heading_level: 2 },
    { id: 'p1', type: 'paragraph', text: 'El objetivo específico es medir.' },
    { id: 'h1b', type: 'heading', text: 'Marco teórico', heading_level: 1 },
  ] as unknown as import('../../../types').ElementModel[];
  render(<LecturaProsaSeccion seccionActiva={nodo} elementos={elementos} />);
  expect(screen.getByText('El objetivo específico es medir.')).toBeTruthy();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- --run src/components/structure/__tests__/LecturaProsaSeccion.test.tsx | Out-String`
Expected: FAIL — el primer test ve "no contiene párrafos de prosa"; el segundo no encuentra el texto de `p1`.

- [ ] **Step 3: Implementar**

En `LecturaProsaSeccion.tsx`, reemplazar las líneas 40-44:

```tsx
    const idInicio = seccionActiva.elementoId || seccionActiva.id;
    let idxInicio = elementos.findIndex((e) => e.id === idInicio);
    if (idxInicio === -1) {
      const titulo = seccionActiva.titulo.trim();
      for (let i = elementos.length - 1; i >= 0; i--) {
        const e = elementos[i];
        if (e.type === 'heading' && e.text.trim() === titulo) { idxInicio = i; break; }
      }
    }
    if (idxInicio === -1) return [];
```

Y las líneas 85-90 por:

```tsx
  const ES_PROSA_CON_TEXTO = new Set(['paragraph', 'bullet', 'numbered_list', 'block_quote']);
  const tieneContenido = cuerpo.some(
    (e) =>
      (ES_PROSA_CON_TEXTO.has(e.type) && String(e.text ?? '').trim()) ||
      e.type === 'image' ||
      e.type === 'heading',
  );
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test -- --run src/components/structure/__tests__/LecturaProsaSeccion.test.tsx | Out-String`
Expected: PASS (incluye el test preexistente de la línea ~284).

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/LecturaProsaSeccion.tsx src/components/structure/__tests__/LecturaProsaSeccion.test.tsx
git commit -m "fix(estructura): prosa cuenta listas y resuelve seccion por id"
```

---

## Task 2: Bold por mayoría de runs (mata el H4 falso)

**Files:**
- Modify: `python/parsing/docx_parser.py:1022-1040`
- Test: `python/tests/test_docx_bold_majority.py` (create)

**Interfaces:**
- Produces: `runs_mayoria_negrita(runs) -> bool` (module-level en `docx_parser`), usado para fijar `is_bold`.
- Consumes (de Task 3): `pre_classifier` seguirá leyendo `elem.is_bold` sin cambios; al volverse majoritario, los párrafos con un solo término negrita dejan de entrar a las heurísticas de heading.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_docx_bold_majority.py
from types import SimpleNamespace
from parsing.docx_parser import runs_mayoria_negrita


def _run(text, bold=False):
    return SimpleNamespace(text=text, bold=bold, italic=False, font=None, name=None)


def test_un_solo_run_negrita_no_es_mayoria():
    runs = [_run("Texto "), _run("importante", bold=True), _run(" normal del párrafo.")]
    assert runs_mayoria_negrita(runs) is False


def test_mayoria_en_negrita_es_titulo():
    runs = [_run("Título ", bold=True), _run("completo ", bold=True), _run("normal")]
    assert runs_mayoria_negrita(runs) is True


def test_runs_sin_texto_no_cuentan():
    assert runs_mayoria_negrita([_run("   "), _run("", bold=True)]) is False


def test_lista_vacia_es_false():
    assert runs_mayoria_negrita([]) is False
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pytest -q python/tests/test_docx_bold_majority.py | Out-String`
Expected: FAIL con `ImportError: cannot import name 'runs_mayoria_negrita'`.

- [ ] **Step 3: Implementar**

En `python/parsing/docx_parser.py`, agregar antes de la función que parsea runs (a nivel de módulo, cerca del inicio de las utilidades):

```python
def runs_mayoria_negrita(runs) -> bool:
    """True si más de la mitad de los runs con texto están en negrita.

    Antes bastaba UN run en negrita (semántica OR) para que un párrafo de
    cuerpo con una sola palabra destacada se clasificara como Heading 4.
    """
    con_texto = [r for r in runs if (getattr(r, "text", "") or "").strip()]
    if not con_texto:
        return False
    negritas = sum(1 for r in con_texto if getattr(r, "bold", False))
    return negritas * 2 > len(con_texto)
```

Y reemplazar las líneas 1032-1040 por:

```python
            is_bold = runs_mayoria_negrita(p.runs)
            is_italic = False
            font_size = None
            font_name = None
            for r in p.runs:
                if r.italic:
                    is_italic = True
                if font_size is None and r.font.size and r.font.size.pt:
                    font_size = float(r.font.size.pt)
                if font_name is None and r.font.name:
                    font_name = r.font.name
```

(Eliminar las inicializaciones `is_bold: bool = False` / `is_italic: bool = False` / `font_size: Optional[float] = None` / `font_name: Optional[str] = None` de las líneas 1023-1026, ahora redundantes.)

- [ ] **Step 4: Correr y verificar que pasan (y no hay regresión)**

Run: `pytest -q python/tests/test_docx_bold_majority.py python/tests/test_pre_classifier.py | Out-String`
Expected: PASS. Si algún test de `test_pre_classifier.py` que construye `ElementModel` con `is_bold=True` falla, revisar que ese test no dependa de la semántica OR a nivel parser (los tests construyen `ElementModel` directo, así que no deberían verse afectados).

- [ ] **Step 5: Commit**

```bash
git add python/parsing/docx_parser.py python/tests/test_docx_bold_majority.py
git commit -m "fix(parser): negrita por mayoria de runs, no cualquier run"
```

---

## Task 3: Guards de heading heurístico (multi-oración y largo del label)

**Files:**
- Modify: `python/parsing/pre_classifier.py:191-209` (helper nuevo), `:708`, `:720`, `:746`, `:1435`
- Test: `python/tests/test_pre_classifier_guards.py` (create)

**Interfaces:**
- Produces: `_contiene_multiples_oraciones(text: str) -> bool` (module-level en `pre_classifier`).
- Consumes: nada nuevo.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_pre_classifier_guards.py
from parsing.pre_classifier import _contiene_multiples_oraciones


def test_detecta_dos_oraciones():
    assert _contiene_multiples_oraciones("Se observó el proceso. Además reduce costos.") is True


def test_acronimo_con_puntos_no_es_multi_oracion():
    assert _contiene_multiples_oraciones("Aplicación del Método S.C.E.M.") is False


def test_una_sola_oracion_no_es_multi():
    assert _contiene_multiples_oraciones("Diseño de investigación aplicada.") is False


def test_texto_vacio():
    assert _contiene_multiples_oraciones("") is False
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pytest -q python/tests/test_pre_classifier_guards.py | Out-String`
Expected: FAIL con `ImportError: cannot import name '_contiene_multiples_oraciones'`.

- [ ] **Step 3: Implementar**

En `python/parsing/pre_classifier.py`, agregar después de `_apply_native_heading_length_guard` (línea ~209):

```python
def _contiene_multiples_oraciones(text: str) -> bool:
    """True si hay varias oraciones reales (punto + espacio + mayúscula).

    Las abreviaturas tipo "S.C.E.M." tienen varios puntos pero no son
    oraciones distintas, así que NO cuentan.
    """
    if not text:
        return False
    return bool(re.search(r'\.\s+[A-ZÁÉÍÓÚÑ]', text))
```

Reemplazar la línea 1435:

```python
        multi_sentence = _contiene_multiples_oraciones(txt)
```

Añadir `and not _contiene_multiples_oraciones(text)` a la rama Heading 4 (línea 708):

```python
        if (has_indent and all_bold and has_period_end and word_count <= 18
                and not is_italic and not _contiene_multiples_oraciones(text)):
```

Añadir la misma condición a la rama Heading 5 (línea ~719-723), dentro del `if`:

```python
            has_indent and all_bold and is_italic and has_period_end and word_count <= 18
            and not _contiene_multiples_oraciones(text)
            and not re.search(r"\(\d{4}[a-z]?\)", text)
```

Y endurecer el inline heading (línea 746) con longitud del label:

```python
        if (inline_match and is_bold and word_count <= 20 and not is_centered
                and ":" not in inline_match.group(1)
                and len(inline_match.group(1).split()) <= 6
                and not _contiene_multiples_oraciones(text)
                and not text.rstrip().endswith(":")):
```

- [ ] **Step 4: Correr y verificar que pasa (y sin regresión)**

Run: `pytest -q python/tests/test_pre_classifier_guards.py python/tests/test_pre_classifier.py | Out-String`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/parsing/pre_classifier.py python/tests/test_pre_classifier_guards.py
git commit -m "fix(parser): heading heurístico rechaza multi-oración y labels largos"
```

---

## Task 4: Degradar heading de bajo score y guard de clustering

**Files:**
- Modify: `python/parsing/pre_classifier.py:1458-1464`, `python/parsing/clustering_classifier.py:228-232`
- Test: `python/tests/test_heading_demotion.py` (create)

**Interfaces:**
- Produces: en `pre_classifier`, la rama `else` degrada HEADING de bajo score aunque `style_name` esté seteado; en `clustering_classifier`, `_demasiado_largo_para_heading(text: str) -> bool`.
- Consumes: `_contiene_multiples_oraciones` (Task 3) en `pre_classifier`.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_heading_demotion.py
from models import ElementType
from parsing.pre_classifier import pre_classify_elements
from parsing.clustering_classifier import _demasiado_largo_para_heading


def test_heading_largo_por_heuristica_se_degrada_aunque_tenga_estilo(make_element):
    texto = ("Se describe el proceso productivo completo de la empresa y sus "
             "etapas principales dentro de la planta de producción actual.") * 2
    elem = make_element(
        elem_id="1", text=texto, elem_type=ElementType.HEADING, heading_level=4,
        style_name="Normal", is_bold=False,
    )
    result = pre_classify_elements([elem])
    assert result[0].type == ElementType.PARAGRAPH


def test_guard_clustering_largo():
    assert _demasiado_largo_para_heading("palabra " * 25) is True
    assert _demasiado_largo_para_heading("Diseño de investigación aplicada") is False


def test_guard_clustering_multi_oracion():
    assert _demasiado_largo_para_heading("Se observó el proceso. Además reduce costos.") is True
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `pytest -q python/tests/test_heading_demotion.py | Out-String`
Expected: FAIL — el primer test ve `HEADING`; el import de `_demasiado_largo_para_heading` falla.

- [ ] **Step 3: Implementar**

En `python/parsing/pre_classifier.py`, reemplazar las líneas 1458-1464 por:

```python
        else:
            # Un heading heurístico de bajo score se degrada aunque traiga un
            # `style_name` ('Normal' es tan común que no absuelve la heurística).
            if elem.type == ElementType.HEADING and (
                not elem.style_name or len(words) > 25 or multi_sentence
            ):
                elem.type = ElementType.PARAGRAPH
                elem.confidence = 0.75
                elem.needs_review = True
            else:
                elem.needs_review = elem.confidence < 0.80
```

En `python/parsing/clustering_classifier.py`, agregar antes de `class ClusteringHeadingClassifier` (línea ~139):

```python
def _demasiado_largo_para_heading(text: str) -> bool:
    """Un heading real es corto y de una sola oración."""
    t = (text or "").strip()
    if not t:
        return False
    if len(t.split()) > 20:
        return True
    return bool(re.search(r'\.\s+[A-ZÁÉÍÓÚÑ]', t))
```

Asegurar `import re` en el módulo (si falta, añadirlo). Y en la rama de promoción (línea 228), insertar el guard:

```python
                if elem.type == ElementType.PARAGRAPH:
                    if _demasiado_largo_para_heading(elem.text or ""):
                        continue
                    elem.type = ElementType.HEADING
                    elem.heading_level = level
                    elem.confidence = min(0.95, score + 0.3)
                    elem.needs_review = score < 0.7
```

- [ ] **Step 4: Correr y verificar que pasan (y sin regresión)**

Run: `pytest -q python/tests/test_heading_demotion.py python/tests/test_pre_classifier.py python/tests/ | Out-String`
Expected: PASS. Si el primer test aún ve HEADING, revisar que ninguna pasada posterior re-promueva (buscar el `pre_classifier_rule` resultante y ajustar el guard).

- [ ] **Step 5: Commit**

```bash
git add python/parsing/pre_classifier.py python/parsing/clustering_classifier.py python/tests/test_heading_demotion.py
git commit -m "fix(parser): degrada heading de bajo score y frena clustering largo"
```

---

## Task 5: Rail de fase `RailEstructura` + destino activo

**Files:**
- Create: `src/components/structure/RailEstructura.tsx`
- Modify: `src/components/structure/EscritorioEstructura.tsx:19-21,138-184`
- Test: `src/components/structure/__tests__/RailEstructura.test.tsx` (create)

**Interfaces:**
- Produces: `RailEstructura` con props `{ destino: 'esquema' | 'indice'; onDestino: (d: 'esquema' | 'indice') => void }` y `data-testid="rail-estructura"`; `EscritorioEstructura` expone su destino vía el rail.
- Consumes: `lucide-react` (`Network`, `ListTree`).

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/structure/__tests__/RailEstructura.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RailEstructura } from '../RailEstructura';

describe('RailEstructura', () => {
  it('muestra los dos destinos y marca el activo', () => {
    const spy = vi.fn();
    render(<RailEstructura destino="esquema" onDestino={spy} />);
    expect(screen.getByTestId('rail-estructura')).toBeTruthy();
    expect(screen.getByRole('button', { name: /esquema/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /índice/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('avisa el cambio de destino', () => {
    const spy = vi.fn();
    render(<RailEstructura destino="esquema" onDestino={spy} />);
    fireEvent.click(screen.getByRole('button', { name: /índice/i }));
    expect(spy).toHaveBeenCalledWith('indice');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- --run src/components/structure/__tests__/RailEstructura.test.tsx | Out-String`
Expected: FAIL — no existe `../RailEstructura`.

- [ ] **Step 3: Implementar `RailEstructura`**

```tsx
/* Rail de la fase Estructura: 56px, solo íconos, 2 destinos. Patrón de
 * `RailTipoActivos` (Figuras). TOKENS, NO HEX. */
import React from 'react';
import { Network, ListTree } from 'lucide-react';

export type DestinoEstructura = 'esquema' | 'indice';

export interface RailEstructuraProps {
  destino: DestinoEstructura;
  onDestino: (destino: DestinoEstructura) => void;
}

const ITEMS: Array<{ id: DestinoEstructura; label: string; Icon: typeof Network }> = [
  { id: 'esquema', label: 'Esquema y jerarquía', Icon: Network },
  { id: 'indice', label: 'Índice', Icon: ListTree },
];

export const RailEstructura: React.FC<RailEstructuraProps> = ({ destino, onDestino }) => (
  <aside
    data-testid="rail-estructura"
    aria-label="Destinos de estructura"
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
      width: '56px', padding: 'var(--space-2) 0', background: 'var(--color-bg-surface)',
      borderRight: '1px solid var(--color-border-subtle)',
    }}
  >
    {ITEMS.map(({ id, label, Icon }) => {
      const activo = destino === id;
      return (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={activo}
          title={label}
          onClick={() => onDestino(id)}
          style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '40px', height: '40px', border: 0, borderRadius: 'var(--radius-md)', cursor: 'pointer',
            color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            background: activo ? 'var(--color-accent-soft)' : 'transparent',
          }}
        >
          {activo ? (
            <span aria-hidden style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: 'var(--color-accent)', borderRadius: 'var(--radius-full)' }} />
          ) : null}
          <Icon size={18} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>
      );
    })}
  </aside>
);

export default RailEstructura;
```

- [ ] **Step 4: Conectar el rail en `EscritorioEstructura`**

Añadir el import y el estado:

```tsx
import { RailEstructura, type DestinoEstructura } from './RailEstructura';
// dentro del componente:
const [destino, setDestino] = useState<DestinoEstructura>('esquema');
```

Cambiar el `grid` (línea 167) y el bloque de columnas (173-184) para que la primera columna sea el rail y el panel izquierdo (`IndiceEstructura`) viva solo en modo `esquema`, mientras el centro conmuta:

```tsx
        gridTemplateColumns: cerrado ? '56px 308px minmax(0, 1fr) 44px' : `56px 308px minmax(0, 1fr) ${anchoPanel}px`,
```

```tsx
      <RailEstructura destino={destino} onDestino={setDestino} />

      {destino === 'esquema' ? (
        <div style={{ minWidth: 0, minHeight: 0, background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border-subtle)' }}>
          <IndiceEstructura
            elementos={elementos}
            faseConocida={faseConocida}
            onSelect={abrir}
            nodoSeleccionadoId={elegido?.id ?? null}
          />
        </div>
      ) : (
        <div style={{ minWidth: 0, minHeight: 0, background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border-subtle)' }}>
          <IndiceEstructura
            elementos={elementos}
            faseConocida={faseConocida}
            onSelect={abrir}
            nodoSeleccionadoId={elegido?.id ?? null}
          />
        </div>
      )}

      <div style={{ minWidth: 0, minHeight: 0, overflow: 'auto', padding: 'var(--space-4)' }}>
        {destino === 'esquema' ? (
          <MapaEstructura raices={raices} onSelect={abrir} nodoSeleccionadoId={elegido?.id ?? null} />
        ) : (
          <IndicePrevisualizacion raices={raices} onSelect={abrir} nodoSeleccionadoId={elegido?.id ?? null} />
        )}
      </div>
```

(En Task 6 se diferencia el panel izquierdo entre modos; en Task 8 se montan los controles a la derecha. `IndicePrevisualizacion` se crea en Task 6.)

- [ ] **Step 5: Correr y verificar**

Run: `npm test -- --run src/components/structure/__tests__/RailEstructura.test.tsx src/__tests__/estructuraEstaMontada.test.tsx | Out-String`
Expected: PASS (el test de montaje sigue viendo `indice-estructura` y `diagrama-estructura` en el modo por defecto).

- [ ] **Step 6: Commit**

```bash
git add src/components/structure/RailEstructura.tsx src/components/structure/__tests__/RailEstructura.test.tsx src/components/structure/EscritorioEstructura.tsx
git commit -m "feat(estructura): rail de dos destinos (esquema / indice)"
```

---

## Task 6: Descargar el árbol y plegar H1 por defecto + vista previa del índice

**Files:**
- Modify: `src/components/structure/NodoIndice.tsx:90-141`
- Modify: `src/components/structure/IndiceEstructura.tsx:34-141`
- Create: `src/components/structure/IndicePrevisualizacion.tsx`
- Test: `src/components/structure/__tests__/IndiceEstructura.test.tsx` (create or extend)

**Interfaces:**
- Consumes: `filasDelIndice`, `NodoJerarquia`, `DiagnosticoRama` (jerarquia).
- Produces: `IndicePrevisualizacion` con props `{ raices; onSelect?; nodoSeleccionadoId? }` y `data-testid="indice-previsualizacion"`. `NodoIndice` acepta `{ mostrarPalabras?: boolean; mostrarMetricas?: boolean }` (defaults: palabras `true` en árbol, `false` en preview) y ya no renderiza `sin elementos`/`sin comparar`/motivo textual.

- [ ] **Step 1: Escribir los tests que fallan**

```tsx
// src/components/structure/__tests__/IndiceEstructura.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IndiceEstructura } from '../IndiceEstructura';
import type { ElementModel } from '../../../types';

const elementos = [
  { id: 'h1', type: 'heading', text: 'Objetivos', heading_level: 1 },
  { id: 'h2', type: 'heading', text: 'Objetivo general', heading_level: 2 },
  { id: 'p1', type: 'paragraph', text: 'Texto del objetivo general.' },
  { id: 'h1b', type: 'heading', text: 'Marco teórico', heading_level: 1 },
] as unknown as ElementModel[];

describe('IndiceEstructura', () => {
  it('no muestra ruido por fila', () => {
    render(<IndiceEstructura elementos={elementos} />);
    expect(screen.queryByText('sin elementos')).toBeNull();
    expect(screen.queryByText('sin comparar')).toBeNull();
  });

  it('arranca con los H1 plegados y despliega al clic', () => {
    render(<IndiceEstructura elementos={elementos} />);
    expect(screen.queryByText('Objetivo general')).toBeNull();
    screen.getByRole('button', { name: /Objetivos/i }).click();
    expect(screen.getByText('Objetivo general')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- --run src/components/structure/__tests__/IndiceEstructura.test.tsx | Out-String`
Expected: FAIL — hoy el árbol es plano (H2 siempre visible) y muestra `sin elementos`.

- [ ] **Step 3: Limpiar `NodoIndice`**

Quitar el conteo de palabras de la fila (líneas 90-100) y las líneas 103-141, sustituyéndolas por: una barra de balance solo si `diagnostico.balance` es no-null (sin texto `sin comparar`), un chip de aviso **solo** cuando `diagnostico.diagnostico === 'desbalanceada'` con un punto ámbar y `title={motivo}` (sin texto largo visible), y los chips de métricas **solo si** `figuras+tablas+citas > 0`:

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {balance ? (
          <BarraBalance
            palabras={nodo.palabras}
            escala={balance.mayor}
            laMasLarga={balance.laMasLarga}
            nombre={nodo.titulo}
          />
        ) : null}
        {diagnostico?.diagnostico === 'desbalanceada' ? (
          <span
            aria-label={motivo ?? 'Rama desbalanceada'}
            title={motivo ?? 'Rama desbalanceada'}
            style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 'var(--radius-full)', background: 'var(--color-warning)' }}
          />
        ) : null}
        {nodo.figuras + nodo.tablas + nodo.citas > 0 ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {nodo.figuras} fig · {nodo.tablas} tab · {nodo.citas} cit
          </span>
        ) : null}
      </div>
```

(La eliminación del `span` de palabras es la que quita el conteo de la fila.)

- [ ] **Step 4: Plegar H1 en `IndiceEstructura`**

Reemplazar el render plano (líneas 126-137) por un árbol plegable. Cambiar el estado y la derivación:

```tsx
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filasVisibles = useMemo(() => {
    // filas viene de filasDelIndice con profundidad; una fila es visible si
    // ninguno de sus ancestros H1 está plegado. Como filasDelIndice es
    // preorden, basta con ocultar desde un H1 plegado hasta el próximo H1.
    const out: typeof filas = [];
    let oculto = false;
    const h1Plegadas = new Set<string>();
    for (const fila of visibles) {
      if (fila.profundidad === 0) {
        out.push(fila);
        oculto = !abiertos.has(fila.nodo.id);
        if (oculto) h1Plegadas.add(fila.nodo.id);
      } else if (!oculto) {
        out.push(fila);
      }
    }
    void h1Plegadas;
    return out;
  }, [visibles, abiertos]);
```

Y en el listado:

```tsx
        <div role="list" style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {filasVisibles.map((fila) => (
            <div key={fila.nodo.id} style={{ display: 'flex', alignItems: 'stretch' }}>
              {fila.profundidad === 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(fila.nodo.id)}
                  aria-expanded={abiertos.has(fila.nodo.id)}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: '0 var(--space-1)' }}
                >
                  {abiertos.has(fila.nodo.id) ? '−' : '+'}
                </button>
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <NodoIndice
                  nodo={fila.nodo}
                  diagnostico={fila.diagnostico}
                  profundidad={fila.profundidad}
                  onSelect={onSelect}
                  seleccionado={fila.nodo.id === nodoSeleccionadoId}
                />
              </div>
            </div>
          ))}
        </div>
```

- [ ] **Step 5: Crear `IndicePrevisualizacion`**

Vista previa del índice (nivel 0 "Documento" → H1 → H2 → H3) con `data-testid="indice-previsualizacion"`; filas planas indentadas, sin métricas. Reutiliza `NodoJerarquia` y muestra `Documento` como primera fila.

```tsx
import React from 'react';
import { FileText } from 'lucide-react';
import type { NodoJerarquia } from '../../lib/jerarquia';

export interface IndicePrevisualizacionProps {
  raices: readonly NodoJerarquia[];
  onSelect?: (nodo: NodoJerarquia) => void;
  nodoSeleccionadoId?: string | null;
  profundidadMaxima?: number;
}

const filas = (nodos: readonly NodoJerarquia[], nivel: number, max: number): NodoJerarquia[] => {
  if (nivel > max) return [];
  const out: NodoJerarquia[] = [];
  for (const n of nodos) {
    out.push(n);
    out.push(...filas(n.hijos, nivel + 1, max));
  }
  return out;
};

export const IndicePrevisualizacion: React.FC<IndicePrevisualizacionProps> = ({
  raices, onSelect, nodoSeleccionadoId, profundidadMaxima = 3,
}) => (
  <div data-testid="indice-previsualizacion" role="list" style={{ display: 'flex', flexDirection: 'column' }}>
    <div role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
      <FileText size={15} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-accent)' }} />
      Documento
    </div>
    {filas(raices, 1, profundidadMaxima).map((n) => (
      <button
        key={n.id}
        type="button"
        role="listitem"
        onClick={() => onSelect?.(n)}
        style={{
          textAlign: 'left', border: 0, cursor: onSelect ? 'pointer' : 'default',
          padding: 'var(--space-2) var(--space-3)',
          paddingLeft: `calc(var(--space-3) + ${(n.nivel - 1) * 18}px)`,
          background: n.id === nodoSeleccionadoId ? 'var(--color-accent-soft)' : 'transparent',
          color: 'var(--color-text-primary)',
          fontFamily: n.nivel === 1 ? 'var(--font-display)' : 'var(--font-sans)',
          fontWeight: n.nivel === 1 ? 700 : 500,
          fontSize: n.nivel === 1 ? '13.5px' : '13px',
        }}
      >
        {n.titulo}
      </button>
    ))}
  </div>
);

export default IndicePrevisualizacion;
```

Importar `IndicePrevisualizacion` en `EscritorioEstructura` (Task 5 dejó el hueco).

- [ ] **Step 6: Correr y verificar**

Run: `npm test -- --run src/components/structure/__tests__/IndiceEstructura.test.tsx src/__tests__/indiceEstructura.test.tsx | Out-String`
Expected: PASS. Actualizar `src/__tests__/indiceEstructura.test.tsx` si todavía espera el literal `sin comparar` (línea 221): esas filas ahora no lo muestran.

- [ ] **Step 7: Commit**

```bash
git add src/components/structure/NodoIndice.tsx src/components/structure/IndiceEstructura.tsx src/components/structure/IndicePrevisualizacion.tsx src/components/structure/__tests__/IndiceEstructura.test.tsx src/__tests__/indiceEstructura.test.tsx
git commit -m "feat(estructura): arbol sin ruido, H1 plegadas y vista previa de indice"
```

---

## Task 7: Esquema con raíz "Documento", zoom, pan y drag

**Files:**
- Modify: `src/components/structure/MapaEstructura.tsx`
- Modify: `src/components/structure/EscritorioEstructura.tsx` (pasar `elementos` y `onReubicar`)
- Test: `src/components/structure/__tests__/MapaEstructura.test.tsx` (extend)

**Interfaces:**
- Consumes: `reorderElements` de `useDocStore` (`src/store/slices/documentSlice.ts:1014`).
- Produces: `MapaEstructura` props `{ raices; onSelect?; nodoSeleccionadoId?; onReubicar?: (origenId: string, destinoId: string) => void }`; `data-testid="mapa-zoom"` en el SVG y transform `scale/translate`; helpers exportados `esDescendiente(raices, ancestroId, candidatoId) -> boolean` y `centrarEn(raices): string | null`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/components/structure/__tests__/MapaEstructura.test.tsx`:

```tsx
import { esDescendiente } from '../MapaEstructura';
// ...
it('dibuja la raíz Documento', () => {
  const raices = [{ id: 'a', titulo: 'Introducción', nivel: 1, elementos: 0, elementoId: 'a', palabras: 0, figuras: 0, tablas: 0, citas: 0, hijos: [], fase: null }] as any;
  render(<MapaEstructura raices={raices} />);
  expect(screen.getByText('Documento')).toBeTruthy();
});

it('esDescendiente detecta ancestros', () => {
  const arbol = [{ id: 'a', hijos: [{ id: 'b', hijos: [{ id: 'c', hijos: [] }] }] }] as any;
  expect(esDescendiente(arbol, 'a', 'c')).toBe(true);
  expect(esDescendiente(arbol, 'b', 'a')).toBe(false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- --run src/components/structure/__tests__/MapaEstructura.test.tsx | Out-String`
Expected: FAIL — no existe `esDescendiente` ni la raíz "Documento".

- [ ] **Step 3: Implementar raíz y helpers**

En `MapaEstructura.tsx`:

```tsx
export const esDescendiente = (
  nodos: readonly NodoJerarquia[], ancestroId: string, candidatoId: string,
): boolean => {
  const busca = (lista: readonly NodoJerarquia[]): boolean =>
    lista.some((n) => n.id === ancestroId ? contiene(n, candidatoId) : busca(n.hijos));
  const contiene = (n: NodoJerarquia, id: string): boolean =>
    n.hijos.some((h) => h.id === id || contiene(h, id));
  return busca(nodos);
};
```

Cambiar `posicionesDe` para que reciba el nivel base en 0 y agregar el nodo raíz sintético en el render:

```tsx
const RAIZ_ID = '__documento__';
const raizDocumento: NodoJerarquia = {
  id: RAIZ_ID, titulo: 'Documento', nivel: 0, elementoId: RAIZ_ID,
  palabras: 0, figuras: 0, tablas: 0, citas: 0, hijos: [...raices], fase: null,
} as NodoJerarquia;
```

Y usar `posicionesDe([raizDocumento])` para que las H1 queden a nivel 1 (x = MARGEN + 0·paso) y el texto del nodo raíz diga "Documento".

- [ ] **Step 4: Quitar el conteo de los nodos**

Reemplazar la línea 169 por solo la etiqueta:

```tsx
              <text className="mapa-etiqueta" x={n.x + 12} y={n.y + 24}>
                {n.etiqueta}{n.hijos > 0 ? ` · +${n.hijos}` : ''}
              </text>
```

Y el `<title>` (línea 166) por `${n.nodo.titulo}`.

- [ ] **Step 5: Añadir zoom y pan**

Añadir estado y handlers; envolver los `<g>` en un grupo transformado. El SVG recibe `data-testid="mapa-zoom"`:

```tsx
  const [escala, setEscala] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const arrastreRef = React.useRef<{ x: number; y: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setEscala((v) => Math.min(3, Math.max(0.5, v - e.deltaY * 0.001)));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as SVGElement).closest('[data-nodo]')) return;
    arrastreRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!arrastreRef.current) return;
    setPan({ x: e.clientX - arrastreRef.current.x, y: e.clientY - arrastreRef.current.y });
  };
  const onPointerUp = () => { arrastreRef.current = null; };
```

Envolver el contenido del SVG:

```tsx
        <g transform={`translate(${pan.x} ${pan.y}) scale(${escala})`}>
          {/* aristas + nodos */}
        </g>
```

Añadir botones `−`, `+`, `Ajustar` (reset `escala=1`, `pan={x:0,y:0}`) en `.mapa-barra`.

- [ ] **Step 6: Añadir drag para reubicar**

Cada `<g data-nodo>` recibe `draggable` vía `onPointerDown` propio que setea el origen; al soltar sobre otro nodo, validar con `esDescendiente` y llamar `onReubicar(origen, destino)`. No usar HTML5 DnD (el resto del repo solo lo usa para archivos):

```tsx
  const [dragging, setDragging] = useState<string | null>(null);
  // en el <g> del nodo:
  onPointerDown={(e) => { if (onReubicar) { e.stopPropagation(); setDragging(n.nodo.id); } }}
  onPointerUp={(e) => {
    if (!dragging || dragging === n.nodo.id) { setDragging(null); return; }
    if (n.nodo.id === RAIZ_ID) { setDragging(null); return; }
    if (esDescendiente([raizDocumento], dragging, n.nodo.id)) { setDragging(null); return; }
    onReubicar?.(dragging, n.nodo.id);
    setDragging(null);
  }}
```

En `EscritorioEstructura`, pasar el handler:

```tsx
        const reordenar = useDocStore((s) => s.reorderElements);
        const manejarReubicar = useCallback((origenId: string, destinoId: string) => {
          const orden = (doc?.elements ?? []).map((e) => e.id);
          const iOrigen = orden.indexOf(origenId);
          const iDestino = orden.indexOf(destinoId);
          if (iOrigen < 0 || iDestino < 0) return;
          const reordenado = [...orden];
          const [movido] = reordenado.splice(iOrigen, 1);
          reordenado.splice(iDestino, 0, movido);
          void reordenar(reordenado);
        }, [doc, reordenar]);
        // <MapaEstructura ... onReubicar={manejarReubicar} />
```

- [ ] **Step 7: Correr y verificar**

Run: `npm test -- --run src/components/structure/__tests__/MapaEstructura.test.tsx src/__tests__/mapaEstructura.test.tsx src/__tests__/estructuraNoMiente.test.ts | Out-String`
Expected: PASS. Ajustar `src/__tests__/mapaEstructura.test.tsx` si esperaba el texto `· N pal.` en los nodos.

- [ ] **Step 8: Commit**

```bash
git add src/components/structure/MapaEstructura.tsx src/components/structure/EscritorioEstructura.tsx src/components/structure/__tests__/MapaEstructura.test.tsx src/__tests__/mapaEstructura.test.tsx
git commit -m "feat(estructura): esquema con raiz Documento, zoom, pan y drag"
```

---

## Task 8: Panel de diseño del Índice

**Files:**
- Create: `src/components/structure/ControlesIndice.tsx`
- Modify: `src/components/structure/EscritorioEstructura.tsx` (montarlo en modo `indice`)
- Modify: `src/components/settings/tabs/formatoAjustes.ts:181-185` (options de índice ya existen; no duplicar)
- Test: `src/components/structure/__tests__/ControlesIndice.test.tsx` (create)

**Interfaces:**
- Consumes: `useDocStore` → `doc.elements`, `rules.toc_style`, `insertTocElement`, `removeTocElement`.
- Produces: `ControlesIndice` con props `{ profundidad: 1|2|3|4; onProfundidad; reglas; onRegla(clave, valor); hayIndice: boolean; onInsertar; onQuitar }` y `data-testid="controles-indice"`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ControlesIndice } from '../ControlesIndice';

describe('ControlesIndice', () => {
  it('cambia la profundidad visible', () => {
    const onProf = vi.fn();
    render(<ControlesIndice profundidad={2} onProfundidad={onProf} reglas={{ toc_style: 'apa' }} onRegla={() => {}} hayIndice={false} onInsertar={() => {}} onQuitar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /hasta h1/i }));
    expect(onProf).toHaveBeenCalledWith(1);
  });

  it('inserta el índice cuando no existe', () => {
    const onInsert = vi.fn();
    render(<ControlesIndice profundidad={3} onProfundidad={() => {}} reglas={{ toc_style: 'apa' }} onRegla={() => {}} hayIndice={false} onInsertar={onInsert} onQuitar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /insertar índice/i }));
    expect(onInsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- --run src/components/structure/__tests__/ControlesIndice.test.tsx | Out-String`
Expected: FAIL — no existe `../ControlesIndice`.

- [ ] **Step 3: Implementar `ControlesIndice`**

```tsx
/* Controles de diseño del Índice: estilo, profundidad e insertar/quitar.
 * TOKENS, NO HEX. */
import React from 'react';
import { ListTree, Plus, Trash2 } from 'lucide-react';

export interface ControlesIndiceProps {
  profundidad: 1 | 2 | 3 | 4;
  onProfundidad: (p: 1 | 2 | 3 | 4) => void;
  reglas: { toc_style?: 'apa' | 'dotted' | 'plain' };
  onRegla: (clave: string, valor: string) => void;
  hayIndice: boolean;
  onInsertar: () => void;
  onQuitar: () => void;
}

const PROFUNDIDADES: Array<{ valor: 1 | 2 | 3 | 4; label: string }> = [
  { valor: 1, label: 'Hasta H1' },
  { valor: 2, label: 'Hasta H2' },
  { valor: 3, label: 'Hasta H3' },
  { valor: 4, label: 'Todo' },
];

export const ControlesIndice: React.FC<ControlesIndiceProps> = ({
  profundidad, onProfundidad, reglas, onRegla, hayIndice, onInsertar, onQuitar,
}) => (
  <section data-testid="controles-indice" aria-label="Diseño del índice" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-3)', fontFamily: 'var(--font-sans)' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <ListTree size={16} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-accent)' }} />
      <h2 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Diseño del índice</h2>
    </header>

    <div>
      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>Estilo</span>
      <div role="group" aria-label="Estilo del índice" style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
        {(['apa', 'dotted', 'plain'] as const).map((estilo) => (
          <button
            key={estilo} type="button" aria-pressed={reglas.toc_style === estilo}
            onClick={() => onRegla('toc_style', estilo)}
            style={estiloChip(reglas.toc_style === estilo)}
          >
            {estilo === 'apa' ? 'APA' : estilo === 'dotted' ? 'Punteado' : 'Plano'}
          </button>
        ))}
      </div>
    </div>

    <div>
      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>Profundidad visible</span>
      <div role="group" aria-label="Profundidad" style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
        {PROFUNDIDADES.map((p) => (
          <button key={p.valor} type="button" aria-pressed={profundidad === p.valor} onClick={() => onProfundidad(p.valor)} style={estiloChip(profundidad === p.valor)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>

    <button type="button" onClick={hayIndice ? onQuitar : onInsertar} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', alignSelf: 'flex-start', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
      {hayIndice ? <Trash2 size={14} strokeWidth="var(--icon-stroke)" aria-hidden /> : <Plus size={14} strokeWidth="var(--icon-stroke)" aria-hidden />}
      {hayIndice ? 'Quitar índice' : 'Insertar índice'}
    </button>
  </section>
);

const estiloChip = (activo: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: activo ? 600 : 400,
  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  background: activo ? 'var(--color-accent-soft)' : 'transparent',
  border: '1px solid ' + (activo ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
  borderRadius: 'var(--radius-full)', padding: '2px var(--space-2)', cursor: 'pointer',
});

export default ControlesIndice;
```

- [ ] **Step 4: Montarlo en `EscritorioEstructura` modo `indice`**

```tsx
const [profundidad, setProfundidad] = useState<1 | 2 | 3 | 4>(3);
const insertarToc = useDocStore((s) => s.insertTocElement);
const quitarToc = useDocStore((s) => s.removeTocElement);
const reglas = useDocStore((s) => s.rules);
const setRules = useDocStore((s) => s.setRules);
const hayIndice = (doc?.elements ?? []).some((e) => e.type === 'toc');
```

Sustituir el panel derecho cuando `destino === 'indice'` por `<ControlesIndice ... />` y pasar `profundidadMaxima={profundidad}` a `IndicePrevisualizacion`.

- [ ] **Step 5: Correr y verificar**

Run: `npm test -- --run src/components/structure/__tests__/ControlesIndice.test.tsx | Out-String`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/structure/ControlesIndice.tsx src/components/structure/__tests__/ControlesIndice.test.tsx src/components/structure/EscritorioEstructura.tsx
git commit -m "feat(estructura): controles de diseno del indice"
```

---

## Task 9: Notación de numeración de títulos (extender dominio y aplicarla por nivel)

**Files:**
- Modify: `src/types/index.ts:264-266`, `src/components/settings/tabs/formatoAjustes.ts:148-152`
- Modify: `src/components/layout/PaperCanvas.tsx:1005-1018`
- Modify: `python/models.py:162-168`, `python/generation/generator.py:93-124`, `python/generation/layered_generator.py:189-200`
- Modify: `src/components/structure/ControlesIndice.tsx` (selector H1/H2)
- Test: `python/tests/test_heading_numbering_notation.py` (create), `src/__tests__/formatoTab.test.tsx` (extend)

**Interfaces:**
- Produces: valor `heading_numbering_style_lvlN ∈ {'none','decimal','upperRoman','lowerRoman','lowerLetter','upperLetter'}`; `_build_heading_prefix`/`_build_prefix` aplican la notación en H1 **y** H2.
- Consumes: `rules.heading_numbering_style_lvlN` ya viaja por `GenerateRequest.rules` / `doc.apa_rules`.

- [ ] **Step 1: Escribir los tests que fallan**

```python
# python/tests/test_heading_numbering_notation.py
from generation.generator import _build_heading_prefix


def test_h1_romano_mayuscula():
    counters = {1: 3, 2: 0}
    assert _build_heading_prefix(counters, 1, "upperRoman") == "III. "


def test_h1_romano_minuscula():
    counters = {1: 3, 2: 0}
    assert _build_heading_prefix(counters, 1, "lowerRoman") == "iii. "


def test_h2_hereda_decimal_jerarquico():
    counters = {1: 2, 2: 5}
    assert _build_heading_prefix(counters, 2, "decimal") == "2.5. "


def test_h2_romano_ya_no_es_arabigo_forzado():
    counters = {1: 2, 2: 5}
    assert _build_heading_prefix(counters, 2, "upperRoman") == "II.V. "


def test_none_no_numera():
    assert _build_heading_prefix({1: 1, 2: 0}, 1, "none") == ""
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pytest -q python/tests/test_heading_numbering_notation.py | Out-String`
Expected: FAIL — `upperRoman`/`lowerRoman` no producen lo esperado y H2 roman se fuerza a arábigo.

- [ ] **Step 3: Implementar en `generator.py`**

Generalizar el formateo por nivel. Reemplazar `_build_heading_prefix` (líneas 93-124) por una versión que formatee cada componente según su nivel:

```python
def _format_numero(n: int, estilo: str) -> str:
    if estilo in ("upperRoman", "roman"):
        return _to_roman(n)
    if estilo == "lowerRoman":
        return _to_roman(n).lower()
    if estilo == "upperLetter":
        return chr(64 + ((n - 1) % 26) + 1)
    if estilo == "lowerLetter":
        return chr(96 + ((n - 1) % 26) + 1)
    return str(n)


def _build_heading_prefix(counters, level: int, style: str) -> str:
    if style == "none" or level > 2:
        return ""
    if level == 1:
        return f"{_format_numero(counters.get(1, 1), style)}. "
    if not counters.get(1):
        return ""
    padre = _format_numero(counters.get(1, 1), "decimal")
    hijo = _format_numero(counters.get(2, 1), style)
    return f"{padre}.{hijo}. "
```

> Nota: en H2 el prefijo del padre se mantiene decimal (`2.`) para no perder la jerarquía; la notación elegida se aplica al componente del propio nivel (`V.`). Ajustar `test_h2_romano_ya_no_es_arabigo_forzado` si se decide romanizar también el padre.

- [ ] **Step 4: Replicar en `layered_generator.py`**

Aplicar el mismo `_format_numero` + `_build_prefix` (líneas 177-200) para que ambos generadores coincidan. Reutilizar la lógica copiando las funciones (los dos módulos no comparten util) o importar `_format_numero` desde `generator`.

- [ ] **Step 5: Ampliar el dominio TS y las opciones**

En `src/types/index.ts:264-266` cambiar la unión a:

```ts
  heading_numbering_style_lvl1: 'none' | 'decimal' | 'upperRoman' | 'lowerRoman' | 'lowerLetter' | 'upperLetter';
  heading_numbering_style_lvl2: 'none' | 'decimal' | 'upperRoman' | 'lowerRoman' | 'lowerLetter' | 'upperLetter';
  heading_numbering_style_lvl3: 'none' | 'decimal' | 'upperRoman' | 'lowerRoman' | 'lowerLetter' | 'upperLetter';
```

En `formatoAjustes.ts:148-152` ampliar `NUMERACIONES_DE_TITULO`:

```ts
export const NUMERACIONES_DE_TITULO = [
  { valor: 'none', etiqueta: 'Sin numerar' },
  { valor: 'decimal', etiqueta: '1. 2. 3.' },
  { valor: 'upperRoman', etiqueta: 'I. II. III.' },
  { valor: 'lowerRoman', etiqueta: 'i. ii. iii.' },
  { valor: 'upperLetter', etiqueta: 'A. B. C.' },
  { valor: 'lowerLetter', etiqueta: 'a. b. c.' },
];
```

- [ ] **Step 6: Preview en `PaperCanvas`**

En `PaperCanvas.tsx:1005-1018`, extraer un formateador y usarlo en todos los niveles:

```tsx
const aNumero = (n: number, estilo: string): string => {
  if (estilo === 'upperRoman') return toRoman(n);
  if (estilo === 'lowerRoman') return toRoman(n).toLowerCase();
  if (estilo === 'upperLetter') return String.fromCharCode(64 + ((n - 1) % 26) + 1);
  if (estilo === 'lowerLetter') return String.fromCharCode(96 + ((n - 1) % 26) + 1);
  return String(n);
};
```

Y en la construcción de `headingDisplayText`, usar `aNumero` para el componente del nivel actual en H1 y H2 (el padre jerárquico sigue decimal si se decidió así en el backend, para no divergir).

- [ ] **Step 7: Selector en `ControlesIndice`**

Añadir dos grupos (H1, H2) que llamen `onRegla('heading_numbering_style_lvl1', valor)` / `...lvl2`. Añadir props `{ numeracionH1: string; numeracionH2: string }` a `ControlesIndiceProps` y renderizar chips con `NUMERACIONES_DE_TITULO`.

- [ ] **Step 8: Correr y verificar**

Run: `pytest -q python/tests/test_heading_numbering_notation.py | Out-String`
Run: `npm test -- --run src/__tests__/formatoTab.test.tsx src/components/structure/__tests__/ControlesIndice.test.tsx | Out-String`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add python/models.py python/generation/generator.py python/generation/layered_generator.py python/tests/test_heading_numbering_notation.py src/types/index.ts src/components/settings/tabs/formatoAjustes.ts src/components/layout/PaperCanvas.tsx src/components/structure/ControlesIndice.tsx src/__tests__/formatoTab.test.tsx
git commit -m "feat(numeracion): notacion de titulos por nivel (romanos/letras) aplicada a H1 y H2"
```

---

## Task 10: Responsive para pantallas angostas

**Files:**
- Create: `src/hooks/useWindowWidth.ts`
- Modify: `src/components/structure/EscritorioEstructura.tsx`
- Test: `src/hooks/__tests__/useWindowWidth.test.tsx` (create), `src/__tests__/estructuraResponsive.test.tsx` (create)

**Interfaces:**
- Produces: `useWindowWidth(): number` (state + listener `resize`, patrón de `ReviewWorkbench.tsx:79-85`); constantes `ANCHO_ESTRUCTURA_COMPLETO = 1280`, `ANCHO_ESTRUCTURA_MINIMO = 900` en `EscritorioEstructura`.
- Consumes: `cerrado`/`ampliado` ya existentes.

- [ ] **Step 1: Escribir los tests que fallan**

```tsx
// src/hooks/__tests__/useWindowWidth.test.tsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useWindowWidth } from '../useWindowWidth';

describe('useWindowWidth', () => {
  it('devuelve el ancho actual', () => {
    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(window.innerWidth);
  });
});
```

```tsx
// src/__tests__/estructuraResponsive.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { EscritorioEstructura } from '../components/structure/EscritorioEstructura';

describe('EscritorioEstructura responsive', () => {
  beforeEach(() => { window.innerWidth = 800; window.dispatchEvent(new Event('resize')); });
  it('bajo 900px no reserva el panel derecho', () => {
    render(<EscritorioEstructura />);
    const grid = document.querySelector('.escritorio-estructura') as HTMLElement;
    expect(grid.style.gridTemplateColumns).not.toMatch(/452px|760px/);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- --run src/hooks/__tests__/useWindowWidth.test.tsx src/__tests__/estructuraResponsive.test.tsx | Out-String`
Expected: FAIL — no existe el hook; el grid sigue reservando 452px.

- [ ] **Step 3: Crear `useWindowWidth`**

```ts
import { useEffect, useState } from 'react';

export const useWindowWidth = (): number => {
  const [ancho, setAncho] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setAncho(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return ancho;
};

export default useWindowWidth;
```

- [ ] **Step 4: Aplicarlo en `EscritorioEstructura`**

```tsx
import { useWindowWidth } from '../../hooks/useWindowWidth';
// ...
const anchoVentana = useWindowWidth();
const estrecho = anchoVentana < 1280;
const muyEstrecho = anchoVentana < 900;
const panelCerrado = cerrado || muyEstrecho;
```

Usar `panelCerrado` en `gridTemplateColumns` y en el render del strip (sustituyendo `cerrado`). Cuando `muyEstrecho` y `destino === 'indice'`, renderizar `ControlesIndice` como overlay (reusar el patrón de `RailFlyout`: `position: absolute`, `right: 0`, `width: 280`, `zIndex`, fondo `var(--color-bg-surface)`, borde izquierdo).

- [ ] **Step 5: Correr y verificar**

Run: `npm test -- --run src/hooks/__tests__/useWindowWidth.test.tsx src/__tests__/estructuraResponsive.test.tsx src/__tests__/estructuraEstaMontada.test.tsx | Out-String`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useWindowWidth.ts src/hooks/__tests__/useWindowWidth.test.tsx src/components/structure/EscritorioEstructura.tsx src/__tests__/estructuraResponsive.test.tsx
git commit -m "feat(estructura): responsive con colapso/overlay del panel derecho"
```

---

## Verificación final

- [ ] `npm test -- --run | Out-String` (toda la suite Vitest en verde).
- [ ] `pytest -q python/tests/ | Out-String` (toda la suite pytest en verde).
- [ ] `graphify update . | Out-String` (mantener el grafo sincronizado).
