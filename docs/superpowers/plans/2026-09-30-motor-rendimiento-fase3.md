# Motor de Render HÃ­brido â€” Fase 3: EdiciÃ³n inline B1 (contentEditable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development (REDâ†’GREEN por task) y superpowers:executing-plans para implementar este plan.

**Goal:** Reemplazar el `<textarea>` overlay de pÃ¡rrafos de cuerpo por `contentEditable` inline en la hoja: se edita sobre el pÃ¡rrafo real, con reflow instantÃ¡neo por mediciÃ³n DOM (feedback, no verdad â€” Word COM sigue siendo la autoridad vÃ­a Fase 2). Enter divide el pÃ¡rrafo en dos pÃ¡rrafos del modelo; Esc cancela; blur commite. SanitizaciÃ³n dura: el input del browser se normaliza a texto plano, cero formato arbitrario.

**Spec:** `docs/superpowers/specs/2026-09-25-motor-rendimiento-design.md` Â§3.1 Fase 3.

**Architecture:** (1) backend: `POST /api/elements/insert` â€” inserta el pÃ¡rrafo fÃ­sico en `original.docx` (misma convenciÃ³n de mapeo por Ã­ndice que `apply_inplace`: sin inserciÃ³n fÃ­sica, el mapeo modeloâ†”docx se desfasarÃ­a y corromperÃ­a la materializaciÃ³n) + el elemento en el modelo; (2) frontend: `src/lib/inlineEdit.ts` (sanitizaciÃ³n + split), componente `InlineTextEditor` (contentEditable con paste plano, Enterâ†’split, Escâ†’cancel, blurâ†’commit); (3) store: `splitParagraphAt` = `updateElementType` (commit del texto antes del cursor) + `api.insertElement` (pÃ¡rrafo nuevo); (4) PaperCanvas: cablea InlineTextEditor para tipos editables inline; headings/imÃ¡genes/tablas/portada conservan el textarea overlay (spec: NO editables inline).

**Tech Stack:** Python 3.11 + pytest (backend), TypeScript + React 18 + vitest (frontend).

## Global Constraints

- Cero emojis en toda UI; solo iconos `lucide-react`. Cero colores literales en TS/TSX (solo tokens).
- Tipos editables inline: `paragraph`, `bullet`, `numbered_list`, `block_quote`. NO editables inline: `heading`, `image`, `table`, `portada_block`, `toc`, `equation`, `page_break`, `section_break`, `empty`, `caption`, `unknown` â†’ conservan textarea overlay / panel.
- SanitizaciÃ³n: el contentEditable del navegador puede insertar HTML arbitrario (pegar con formato, autocompletado). Todo input pasa a texto plano: paste con `clipboardData.getData('text/plain')`, insertText con `execCommand('insertText')`, y defensa en `onInput` (si hay tags, colapsar a textContent).
- Enter â†’ nuevo pÃ¡rrafo en modelo (split en el cursor: antes â†’ pÃ¡rrafo actual vÃ­a `updateElementType`; despuÃ©s â†’ pÃ¡rrafo nuevo vÃ­a `POST /api/elements/insert`). Esc â†’ cancelar (sin commit). Blur â†’ commit (si el texto cambiÃ³).
- `python/main.py` NO se toca (WIP de sesiÃ³n paralela). El endpoint va en `python/routers/sessions.py` (donde vive `update-element`).
- Sin regresiones al cerrar cada task: `pytest python/tests/`, `npx vitest run`, `npx tsc --noEmit`.
- Baseline frontend conocido: 1640 passed / 7 failed ajenos (`focoNoBarraElSelector.test.tsx` Ã—4, `proyectoSobrevive.test.tsx` Ã—3 â€” ajenos a Fase 3).

## Rulings de diseÃ±o

1. **InserciÃ³n fÃ­sica obligatoria en el docx**: `apply_inplace` mapea elementos del modelo a pÃ¡rrafos del docx POR ÃNDICE (`elem_p_idx`). Un elemento nuevo en el modelo sin su pÃ¡rrafo fÃ­sico desfasarÃ­a todos los siguientes â†’ corrupciÃ³n. El endpoint insert escribe el pÃ¡rrafo en `original.docx` (zona de cuerpo, jamÃ¡s portada) Y en el modelo.
2. **El id del pÃ¡rrafo nuevo lo genera el frontend** (`crypto.randomUUID`, mismo patrÃ³n que `lib/proyecto.ts`): el store puede enfocar el nuevo pÃ¡rrafo al instante, sin esperar respuesta.
3. **Split en el cursor con un solo nodo de texto**: el contentEditable mantiene texto plano de un solo nodo (paste e insertText lo garantizan); `selection.focusOffset` es el offset dentro de ese nodo. Defensa: si hay >1 nodo, colapsar a textContent antes de calcular.
4. **Blur despuÃ©s de split no commitea dos veces**: `onSplit` marca un flag; `onBlur` lo consume y no vuelve a llamar `updateElementType` (el split ya commiteÃ³ "before").
5. **Reflow instantÃ¡neo gratis**: el contentEditable vive dentro del div `paper-elem-${id}` que ya mide `offsetHeight` en cada render (Fase 1). Al escribir, la altura cambia â†’ `setMeasureTick` â†’ `applyPageFlow` re-pagina. No hay que cablear nada extra.
6. **`renderReviewedText` del spec = `ReadingText`** (el componente real): el texto plano editado se renderiza con `ReadingText` igual que hoy; las marcas de revisiÃ³n sobreviven al commit porque se re-derivan del texto.

---

### Task 1: Backend â€” `POST /api/elements/insert` (modelo + inserciÃ³n fÃ­sica + modelo)

**Files:**
- Modify: `python/models.py` (agregar `InsertElementRequest`)
- Modify: `python/routers/sessions.py` (endpoint tras `update_element`)
- Test: `python/tests/test_elements_insert.py` (crear)

**Interfaces:**
- Produces: `POST /api/elements/insert` con body `{session_id, after_element_id, new_element_id, text, type?, heading_level?}` â†’ 200 con el `DocumentModel` actualizado; 404 si sesiÃ³n o elemento no existen; 400 si el tipo no es insertable.
- Consumed by: frontend `src/api/backend.ts` (Task 4).

- [x] **Step 1: Escribir tests fallidos**

```python
# python/tests/test_elements_insert.py
"""FASE 3 â€” POST /api/elements/insert: dividir un pÃ¡rrafo en dos.

El pÃ¡rrafo fÃ­sico se inserta en original.docx (misma convenciÃ³n de mapeo
por Ã­ndice que apply_inplace) y el elemento en el modelo. Sin la inserciÃ³n
fÃ­sica, apply_inplace desfasarÃ­a todos los elementos siguientes.
"""
import sys
import pathlib
import types

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


def _client():
    from main import app
    return TestClient(app)


def _mk_doc(n=3):
    """Modelo con n pÃ¡rrafos de cuerpo (ids e0..e{n-1})."""
    return types.SimpleNamespace(
        elements=[
            types.SimpleNamespace(
                id=f"e{i}", type="paragraph", heading_level=1,
                text=f"texto {i}", is_cover_section=False,
            )
            for i in range(n)
        ],
        apa_rules=None,
    )


def _mk_session(tmp_path, monkeypatch, doc):
    """SesiÃ³n con original.docx de n pÃ¡rrafos + estado mockeado."""
    from persistence import session_manager as sm
    sd = tmp_path / "sessions" / "s1"
    sd.mkdir(parents=True)
    (sd / "original.docx").write_bytes(b"PK\x03\x04fake")
    monkeypatch.setattr(sm, "load_session_state", lambda sid, st: doc)
    monkeypatch.setattr(sm, "save_session_state", lambda d, st: None)
    return sd


def _patch_docx(monkeypatch, tmp_path, n_paras=3):
    """apply_inplace real sobre un docx creado en tmp_path."""
    from docx import Document
    d = Document()
    for i in range(n_paras):
        d.add_paragraph(f"texto {i}")
    d.save(str(tmp_path / "sessions" / "s1" / "original.docx"))


def test_insert_404_sesion_desconocida():
    r = _client().post("/api/elements/insert", json={
        "session_id": "nope", "after_element_id": "e0",
        "new_element_id": "n1", "text": "hola",
    })
    assert r.status_code == 404


def test_insert_404_elemento_desconocido(tmp_path, monkeypatch):
    _mk_session(tmp_path, monkeypatch, _mk_doc())
    r = _client().post("/api/elements/insert", json={
        "session_id": "s1", "after_element_id": "zzz",
        "new_element_id": "n1", "text": "hola",
    })
    assert r.status_code == 404


def test_insert_divide_parrafo_fisico_y_modelo(tmp_path, monkeypatch):
    doc = _mk_doc(3)
    _mk_session(tmp_path, monkeypatch, doc)
    _patch_docx(monkeypatch, tmp_path, n_paras=3)
    r = _client().post("/api/elements/insert", json={
        "session_id": "s1", "after_element_id": "e1",
        "new_element_id": "n1", "text": "mitad nueva",
    })
    assert r.status_code == 200
    data = r.json()
    ids = [e["id"] for e in data["elements"]]
    assert ids == ["e0", "e1", "n1", "e2"]
    texts = [e["text"] for e in data["elements"]]
    assert texts[2] == "mitad nueva"
    # El pÃ¡rrafo fÃ­sico existe en el docx (4 pÃ¡rrafos)
    from docx import Document
    d = Document(str(tmp_path / "sessions" / "s1" / "original.docx"))
    assert len(d.paragraphs) == 4
    assert d.paragraphs[2].text == "mitad nueva"


def test_insert_no_toca_portada(tmp_path, monkeypatch):
    """Un pÃ¡rrafo de portada (idx < body_start) no puede ser dividido."""
    doc = _mk_doc(2)
    doc.elements[0].is_cover_section = True
    _mk_session(tmp_path, monkeypatch, doc)
    _patch_docx(monkeypatch, tmp_path, n_paras=2)
    r = _client().post("/api/elements/insert", json={
        "session_id": "s1", "after_element_id": "e0",
        "new_element_id": "n1", "text": "hola",
    })
    assert r.status_code == 400
```

- [x] **Step 2: Correr tests, verificar FALLA**

Run: `pytest python/tests/test_elements_insert.py -v`
Expected: FAIL â€” 404/400 con detalle distinto o ruta inexistente.

- [x] **Step 3: Implementar modelo + endpoint**

```python
# python/models.py â€” tras UpdateElementRequest:
class InsertElementRequest(BaseModel):
    """FASE 3 â€” dividir un pÃ¡rrafo: inserta un pÃ¡rrafo fÃ­sico en el docx
    y un elemento en el modelo, tras `after_element_id`."""
    session_id: str
    after_element_id: str
    new_element_id: str
    text: str
    type: str = "paragraph"
    heading_level: int = 1
```

```python
# python/routers/sessions.py â€” tras update_element:
@router.post("/api/elements/insert")
async def insert_element(req: InsertElementRequest) -> DocumentModel:
    """FASE 3 â€” Inserta un pÃ¡rrafo fÃ­sico en original.docx y un elemento en
    el modelo. La inserciÃ³n fÃ­sica es obligatoria: apply_inplace mapea
    modeloâ†”docx por Ã­ndice y un elemento nuevo sin pÃ¡rrafo desfasarÃ­a todos
    los siguientes. Nunca inserta en la zona de portada (is_cover_section).
    """
    from persistence.session_manager import save_session_snapshot, save_session_state
    from models import ElementModel, ElementType
    from docx import Document
    from docx.oxml import OxmlElement
    from docx.text.paragraph import Paragraph

    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="SesiÃ³n no encontrada.")

    idx = next((i for i, e in enumerate(doc.elements)
                if (e.id if hasattr(e, "id") else e.get("id", "")) == req.after_element_id), None)
    if idx is None:
        raise HTTPException(status_code=404,
                            detail=f"Elemento con ID '{req.after_element_id}' no encontrado.")

    target = doc.elements[idx]
    if getattr(target, "is_cover_section", False):
        raise HTTPException(status_code=400,
                            detail="No se puede dividir un pÃ¡rrafo de portada.")

    original = STORAGE_DIR / "sessions" / req.session_id / "original.docx"
    d = Document(str(original))
    paragraphs = d.paragraphs

    # Ãndice del pÃ¡rrafo fÃ­sico: misma convenciÃ³n que apply_inplace
    # (solo paragraph/heading/bullet/numbered_list/portada_block avanzan).
    phys = 0
    for i, elem in enumerate(doc.elements):
        if i == idx:
            break
        et = getattr(elem, "type", None)
        ets = et.value if hasattr(et, "value") else str(et)
        if ets in ("paragraph", "heading", "bullet", "numbered_list", "portada_block"):
            phys += 1
    if phys >= len(paragraphs):
        raise HTTPException(status_code=500, detail="PosiciÃ³n de pÃ¡rrafo fuera de rango.")

    src = paragraphs[phys]
    new_p = OxmlElement("w:p")
    src._p.addnext(new_p)
    new_para = Paragraph(new_p, src._parent)
    new_para.style = src.style
    run = new_para.add_run(req.text)
    # Heredar tipografÃ­a del pÃ¡rrafo fuente (bold/italic)
    if src.runs:
        s0 = src.runs[0]
        run.bold = s0.bold
        run.italic = s0.italic
    d.save(str(original))

    try:
        etype = ElementType(req.type)
    except ValueError:
        etype = ElementType.PARAGRAPH
    new_elem = ElementModel(
        id=req.new_element_id, type=etype,
        heading_level=req.heading_level, text=req.text,
        is_user_modified=True, confidence=1.0,
    )
    doc.elements.insert(idx + 1, new_elem)
    save_session_snapshot(doc, STORAGE_DIR)
    save_session_state(doc, STORAGE_DIR)
    return doc
```

- [x] **Step 4: Correr tests, verificar GREEN**

Run: `pytest python/tests/test_elements_insert.py -v`
Expected: 4 passed.

- [x] **Step 5: Commit**

Run: `git add python/models.py python/routers/sessions.py python/tests/test_elements_insert.py && git commit -m "feat(edit): POST /api/elements/insert â€” divide pÃ¡rrafo con inserciÃ³n fÃ­sica en docx"`

---

### Task 2: `src/lib/inlineEdit.ts` â€” sanitizaciÃ³n + split

**Files:**
- Create: `src/lib/inlineEdit.ts`
- Test: `src/__tests__/inlineEdit.test.ts` (crear)

**Interfaces:**
- Produces:
  - `sanitizeToPlainText(html: string): string` â€” texto plano desde HTML arbitrario (quita tags, decodifica entidades bÃ¡sicas, `<br>` y `</div>` â†’ `\n`).
  - `splitTextAt(text: string, offset: number): { before: string; after: string }` â€” split con clamp defensivo.
  - `extractPlainText(el: HTMLElement): string` â€” textContent normalizado (colapsa `\r`).

- [x] **Step 1: Escribir tests fallidos**

```ts
// src/__tests__/inlineEdit.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeToPlainText, splitTextAt, extractPlainText } from '../lib/inlineEdit';

describe('inlineEdit â€” sanitizaciÃ³n', () => {
  it('quita tags y decodifica entidades', () => {
    expect(sanitizeToPlainText('<b>hola</b> <i>mundo</i>')).toBe('hola mundo');
    expect(sanitizeToPlainText('a &amp; b &lt;c&gt;')).toBe('a & b <c>');
  });
  it('br y /div â†’ salto de lÃ­nea', () => {
    expect(sanitizeToPlainText('uno<br>dos')).toBe('uno\ndos');
    expect(sanitizeToPlainText('uno<div>dos</div>')).toBe('uno\ndos');
  });
  it('texto plano pasa igual', () => {
    expect(sanitizeToPlainText('texto plano')).toBe('texto plano');
  });
});

describe('inlineEdit â€” splitTextAt', () => {
  { }
  it('divide en el offset', () => {
    expect(splitTextAt('ABCDEF', 3)).toEqual({ before: 'ABC', after: 'DEF' });
  });
  it('offset 0 â†’ todo after; offset len â†’ todo before', () => {
    expect(splitTextAt('ABC', 0)).toEqual({ before: '', after: 'ABC' });
    expect(splitTextAt('ABC', 3)).toEqual({ before: 'ABC', after: '' });
  });
  it('offset fuera de rango â†’ clamp', () => {
    expect(splitTextAt('ABC', 99)).toEqual({ before: 'ABC', after: '' });
    expect(splitTextAt('ABC', -5)).toEqual({ before: '', after: 'ABC' });
  });
});

describe('inlineEdit â€” extractPlainText', () => {
  { }
  it('textContent de un nodo', () => {
    const el = document.createElement('div');
    el.innerHTML = '<b>hola</b> mundo';
    expect(extractPlainText(el)).toBe('hola mundo');
  });
});
```

- [x] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/inlineEdit.test.ts`
Expected: FAIL â€” mÃ³dulo inexistente.

- [x] **Step 3: Implementar**

```ts
// src/lib/inlineEdit.ts
/**
 * WordAPA7 â€” Fase 3: utilidades del editor inline (contentEditable).
 *
 * El navegador puede insertar HTML arbitrario en un contentEditable
 * (pegar con formato, autocompletado, arrastrar). El modelo Pydantic es
 * texto plano: toda entrada pasa por sanitizeToPlainText antes de tocar
 * el store. Cero formato arbitrario (spec Â§3.1 Fase 3).
 */

/** Texto plano desde HTML: quita tags, decodifica entidades, br/div â†’ \n. */
export function sanitizeToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '');
}

/** Split de texto plano con clamp defensivo. */
export function splitTextAt(text: string, offset: number): { before: string; after: string } {
  const n = text.length;
  const o = Number.isFinite(offset) ? Math.max(0, Math.min(n, Math.floor(offset))) : 0;
  return { before: text.slice(0, o), after: text.slice(o) };
}

/** textContent normalizado de un contentEditable (un solo nodo de texto). */
export function extractPlainText(el: HTMLElement): string {
  return (el.textContent || '').replace(/\r/g, '');
}
```

- [x] **Step 4: Correr test, verify GREEN**

Run: `npx vitest run src/__tests__/inlineEdit.test.ts`
Expected: 8 passed.

- [x] **Step 5: Commit**

Run: `git add src/lib/inlineEdit.ts src/__tests__/inlineEdit.test.ts && git commit -m "feat(edit): inlineEdit â€” sanitizaciÃ³n a texto plano + split por cursor"`

---

### Task 3: Componente `InlineTextEditor` (contentEditable)

**Files:**
- Create: `src/components/layout/InlineTextEditor.tsx`
- Test: `src/__tests__/inlineTextEditor.test.tsx` (crear)

**Interfaces:**
- Produces:

```tsx
interface InlineTextEditorProps {
  initialText: string;
  style: React.CSSProperties;          // el mismo estilo del pÃ¡rrafo (fuente, tamaÃ±o, indent)
  onCommit: (text: string) => void;    // blur con cambios
  onCancel: () => void;                // Esc
  onSplit: (before: string, after: string) => void;  // Enter
}
```

- Comportamiento: paste â†’ solo texto plano; insertText â†’ execCommand('insertText'); insertParagraph â†’ onSplit en el cursor; Enter â†’ onSplit; Esc â†’ onCancel; blur â†’ onCommit (salvo que el split ya commiteÃ³).
- Defensa: en onInput, si el innerHTML contiene tags, colapsar a textContent (cursor al final).

- [x] **Step 1: Escribir tests fallidos**

```tsx
// src/__tests__/inlineTextEditor.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineTextEditor } from '../components/layout/InlineTextEditor';

const baseStyle: React.CSSProperties = { fontFamily: 'serif', fontSize: '12pt' };

describe('InlineTextEditor', () => {
  it('renderiza el texto inicial como contentEditable', () => {
    render(<InlineTextEditor initialText="hola mundo" style={baseStyle}
      onCommit={vi.fn()} onCancel={vi.fn()} onSplit={vi.fn()} />);
    const el = screen.getByRole('textbox');
    expect(el.isContentEditable).toBe(true);
    expect(el.textContent).toBe('hola mundo');
  });

  it('Enter â†’ onSplit con before/after en el cursor', () => {
    const onSplit = vi.fn();
    render(<InlineTextEditor initialText="ABCDEF" style={baseStyle}
      onCommit={vi.fn()} onCancel={vi.fn()} onSplit={onSplit} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    // Cursor despuÃ©s de "ABC"
    const range = document.createRange();
    range.setStart(el.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onSplit).toHaveBeenCalledWith('ABC', 'DEF');
  });

  it('Escape â†’ onCancel', () => {
    const onCancel = vi.fn();
    render(<InlineTextEditor initialText="hola" style={baseStyle}
      onCommit={vi.fn()} onCancel={onCancel} onSplit={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('blur â†’ onCommit con el texto actual', () => {
    const onCommit = vi.fn();
    render(<InlineTextEditor initialText="hola" style={baseStyle}
      onCommit={onCommit} onCancel={vi.fn()} onSplit={vi.fn()} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    el.textContent = 'hola editado';
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith('hola editado');
  });

  it('blur tras split NO commitea (el split ya commiteÃ³ before)', () => {
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

  it('paste â†’ inserta solo texto plano (sin tags)', () => {
    const onCommit = vi.fn();
    render(<InlineTextEditor initialText="" style={baseStyle}
      onCommit={onCommit} onCancel={vi.fn()} onSplit={vi.fn()} />);
    const el = screen.getByRole('textbox') as HTMLElement;
    const dt = { getData: (t: string) => (t === 'text/plain' ? 'texto pegado' : '<b>texto</b>') };
    fireEvent.paste(el, { clipboardData: dt });
    expect(el.textContent).toBe('texto pegado');
  });
});
```

- [x] **Step 2: Correr tests, verificar FALLA**

Run: `npx vitest run src/__tests__/inlineTextEditor.test.tsx`
Expected: FAIL â€” componente inexistente.

- [x] **Step 3: Implementar**

```tsx
// src/components/layout/InlineTextEditor.tsx
/**
 * WordAPA7 â€” Fase 3: editor inline (contentEditable) sobre el pÃ¡rrafo real.
 *
 * Reemplaza el textarea overlay para pÃ¡rrafos de cuerpo: se edita sobre el
 * pÃ¡rrafo de la hoja y el reflow es instantÃ¡neo (la mediciÃ³n DOM de Fase 1
 * ya observa el div paper-elem). SanitizaciÃ³n dura: paste plano, insertText
 * plano, y defensa en onInput contra HTML arbitrario.
 *
 * Enter â†’ onSplit (nuevo pÃ¡rrafo en el modelo). Esc â†’ onCancel. Blur â†’
 * onCommit (si el texto cambiÃ³). El blur posterior a un split no commitea:
 * el split ya commiteÃ³ el texto de antes del cursor.
 */
import React, { useRef } from 'react';
import { sanitizeToPlainText, splitTextAt, extractPlainText } from '../../lib/inlineEdit';

export interface InlineTextEditorProps {
  initialText: string;
  style: React.CCSProperties;
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
    // Defensa: si hay mÃ¡s de un nodo de texto, colapsar a textContent.
    if (el.childNodes.length > 1 || (el.firstChild && el.firstChild.nodeType !== 3)) {
      const txt = extractPlainText(el);
      el.textContent = txt;
      return txt.length;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return 0;
    // Offset absoluto dentro del nodo de texto Ãºnico.
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
    document.execCommand('insertText', false, plain);
  };

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    // Defensa: HTML arbitrario (autocompletado, arrastrar) â†’ texto plano.
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
```

Nota: `document.execCommand` estÃ¡ deprecado pero es el Ãºnico mecanismo cross-browser para insertar texto plano en un contentEditable sin romper el cursor; sigue soportado en Chrome/Firefox/Safari.

- [x] **Step 4: Correr tests, verificar GREEN**

Run: `npx vitest run src/__tests__/inlineTextEditor.test.tsx`
Expected: 6 passed.

- [x] **Step 5: Commit**

Run: `git add src/components/layout/InlineTextEditor.tsx src/__tests__/inlineTextEditor.test.tsx && git commit -m "feat(edit): InlineTextEditor â€” contentEditable con sanitizaciÃ³n y split por cursor"`

---

### Task 4: Store â€” `splitParagraphAt` + `api.insertElement`

**Files:**
- Modify: `src/api/backend.ts` (agregar `insertElement`)
- Modify: `src/store/types.ts` (acciÃ³n `splitParagraphAt`)
- Modify: `src/store/slices/documentSlice.ts` (acciÃ³n)
- Test: `src/__tests__/splitParagraphAt.test.ts` (crear)

**Interfaces:**
- Produces en `DocState`:

```ts
  /** Fase 3 â€” divide un pÃ¡rrafo en el cursor: commit de `before` al pÃ¡rrafo
   *  actual (updateElementType) + inserciÃ³n del pÃ¡rrafo `after` (insertElement). */
  splitParagraphAt: (elementId: string, before: string, after: string) => Promise<void>;
```

- [x] **Step 1: Escribir test fallidos**

```ts
// src/__tests__/splitParagraphAt.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDocStore } from '../store/useDocStore';

const insertElement = vi.fn();

vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(), updateElement: vi.fn(), getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'), fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(), explainElement: vi.fn(), suggestCaption: vi.fn(),
  insertElement: (...args: unknown[]) => insertElement(...args),
}));

const makeDoc = () =>
  ({
    session_id: 's1',
    file_name: 't.docx',
    elements: [
      { id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 },
      { id: 'e1', type: 'paragraph', text: 'dos', page_number: 1 },
      { id: 'e2', type: 'paragraph', text: 'tres', page_number: 1 },
    ],
    meta: { page_count: 1 },
    referencias: [],
  }) as any;

describe('splitParagraphAt', () => {
  beforeEach(() => {
    insertElement.mockReset();
    useDocStore.setState({ doc: makeDoc(), layoutCuts: {}, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('commit de before al actual + insert de after como pÃ¡rrafo nuevo', async () => {
    const p = useDocStore.getState().splitParagraphAt('e1', 'dos MITAD', 'MITAD dos');
    // updateElementType â†’ updateElement (mockeado) con el texto before
    await p;
    const s = useDocStore.getState();
    expect(s.doc!.elements[1].text).toBe('dos MITAD');
    expect(insertElement).toHaveBeenCalledWith('s1', 'e1', expect.any(String), 'MITAD dos');
    // El nuevo elemento estÃ¡ en el modelo, tras e1
    const ids = s.doc!.elements.map((e) => e.id);
    expect(ids[0]).toBe('e0');
    expect(ids[1]).toBe('e1');
    expect(ids[2]).not.toBe('e1');
    expect(ids[3]).toBe('e2');
    expect(s.doc!.elements[2].text).toBe('MITAD dos');
    expect(s.doc!.elements[2].type).toBe('paragraph');
  });

  it('after vacÃ­o â†’ no inserta (split al final del texto)', async () => {
    await useDocStore.getState().splitParagraphAt('e1', 'dos', '');
    expect(insertElement).not.toHaveBeenCalled();
  });

  it('elemento inexistente â†’ no hace nada', async () => {
    await useDocStore.getState().splitParagraphAt('zzz', 'a', 'b');
    expect(insertElement).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/splitParagraphAt.test.ts`
Expected: FAIL â€” `splitParagraphAt is not a function`.

- [x] **Step 3: Implementar**

```ts
// src/api/backend.ts â€” junto a updateElement:
export async function insertElement(
  sessionId: string, afterElementId: string, newElementId: string, text: string,
): Promise<any> {
  const res = await fetch(`${getApiBase()}/elements/insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId, after_element_id: afterElementId,
      new_element_id: newElementId, text, type: 'paragraph',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

```ts
// src/store/types.ts â€” en DocState, junto a updateElementText:
  /** Fase 3 â€” divide un pÃ¡rrafo en el cursor (Enter del editor inline). */
  splitParagraphAt: (elementId: string, before: string, after: string) => Promise<void>;
```

```ts
// src/store/slices/documentSlice.ts â€” tras updateElementText:
  splitParagraphAt: async (elementId, before, after) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const idx = doc.elements.findIndex((e) => e.id === elementId);
    if (idx < 0) return;
    const elem = doc.elements[idx];
    // 1) Commit del texto ANTES del cursor al pÃ¡rrafo actual (ruta existente).
    await get().updateElementType(elementId, elem.type, elem.heading_level, before);
    // 2) PÃ¡rrafo nuevo con el texto DESPUÃ‰S del cursor.
    if (!after) return;   // split al final: no hay pÃ¡rrafo nuevo que insertar
    const newId = (globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);
    try {
      const updated = await api.insertElement(doc.session_id, elementId, newId, after);
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al insertar pÃ¡rrafo', 'error');
    }
  },
```

- [x] **Step 4: Correr test, verificar GREEN**

Run: `npx vitest run src/__tests__/splitParagraphAt.test.ts src/__tests__/useDocStore.test.ts && npx tsc --noEmit`
Expected: GREEN; tsc limpio.

- [x] **Step 5: Commit**

Run: `git add src/api/backend.ts src/store/types.ts src/store/slices/documentSlice.ts src/__tests__/splitParagraphAt.test.ts && git commit -m "feat(edit): splitParagraphAt â€” Enter divide el pÃ¡rrafo en dos del modelo"`

---

### Task 5: PaperCanvas â€” cablear InlineTextEditor

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx`
- Test: `src/__tests__/inlineEdit.canvas.test.tsx` (crear)

**Interfaces:**
- Produces: pÃ¡rrafos de cuerpo (paragraph/bullet/numbered_list/block_quote) en modo ediciÃ³n â†’ InlineTextEditor con el estilo del pÃ¡rrafo; heading/image/table/portada â†’ textarea overlay (sin cambio). Enter â†’ splitParagraphAt + enfocar el nuevo pÃ¡rrafo.

- [x] **Step 1: Escribir test fallidos**

```tsx
// src/__tests__/inlineEdit.canvas.test.tsx
/** Fase 3: el pÃ¡rrafo de cuerpo se edita con contentEditable inline;
 *  los headings conservan el textarea overlay (NO editables inline). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(), resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(), suggestCaption: vi.fn(),
  insertElement: vi.fn().mockResolvedValue({ elements: [] }),
  updateElement: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));

const elem = (id: string, type: string, text: string, extra: any = {}) =>
  ({ id, type, text, page_number: 1, alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false,
     left_indent_cm: 0, confidence: 1, is_user_modified: false,
     needs_review: false, auto_applied: false, cita_ids: [], ...extra }) as any;

const docWith = (elements: any[]) =>
  ({ session_id: 's1', file_name: 't.docx', apa_format: 'student',
     elements, referencias: [], meta: { page_count: 1 } }) as any;

describe('ediciÃ³n inline en el canvas', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: null, layoutCuts: {}, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('doble click en pÃ¡rrafo â†’ contentEditable inline', () => {
    useDocStore.setState({ doc: docWith([elem('p1', 'paragraph', 'hola mundo')]) });
    render(<PaperCanvas />);
    const node = document.getElementById('paper-elem-p1')!;
    fireEvent.doubleClick(node);
    const ed = screen.getByRole('textbox');
    expect(ed.isContentEditable).toBe(true);
    expect(ed.textContent).toBe('hola mundo');
  });

  it('doble click en heading â†’ NO es contentEditable (textarea overlay)', () => {
    useDocStore.setState({ doc: docWith([elem('h1', 'heading', 'TÃ­tulo', { heading_level: 1 })]) });
    render(<PaperCanvas />);
    const node = document.getElementById('paper-elem-h1')!;
    fireEvent.doubleClick(node);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  it('Enter en el editor inline â†’ splitParagraphAt (nuevo pÃ¡rrafo)', () => {
    useDocStore.setState({ doc: docWith([elem('p1', 'paragraph', 'dos MITAD')]) });
    render(<PaperCanvas />);
    const node = document.getElementById('paper-elem-p1')!;
    fireEvent.doubleClick(node);
    const ed = screen.getByRole('textbox') as HTMLElement;
    const range = document.createRange();
    range.setStart(ed.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(ed, { key: 'Enter' });
    // El store recibiÃ³ el split: el pÃ¡rrafo actual quedÃ³ con "dos"
    const s = useDocStore.getState();
    expect(s.doc!.elements[0].text).toBe('dos');
  });
});
```

- [x] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/inlineEdit.canvas.test.tsx`
Expected: FAIL â€” el pÃ¡rrafo sigue abriendo textarea, no contentEditable.

- [x] **Step 3: Implementar en PaperCanvas**

1. Import:

```ts
import { InlineTextEditor } from './InlineTextEditor';
```

2. Tipos editables inline (junto a los imports o al top del componente):

```ts
/** Fase 3 â€” tipos editables inline (contentEditable). El resto conserva el
 *  textarea overlay / panel (spec Â§3.1: headings, citas, tablas, imagen,
 *  portada NO editables inline). */
const INLINE_EDITABLE_TYPES = new Set(['paragraph', 'bullet', 'numbered_list', 'block_quote']);
```

3. En el bloque `editingId === elem.id && elem.type !== 'image'` (~lÃ­nea 1900), reemplazar el textarea por:

```tsx
{editingId === elem.id && elem.type !== 'image' ? (
  INLINE_EDITABLE_TYPES.has(elem.type) ? (
    <InlineTextEditor
      initialText={elem.text || ''}
      style={{
        fontFamily: fontFamily,
        fontSize: `${rules.font_size_pt}pt`,
        lineHeight: rules.line_spacing,
        textAlign: elem.type === 'paragraph' ? 'justify' : 'left',
        textIndent: elem.type === 'paragraph' ? '0.5in' : undefined,
        margin: '0 0 8px 0',
      }}
      onCommit={(text) => {
        if (text !== (elem.text || '')) {
          updateElementType(elem.id, elem.type, elem.heading_level, text);
        }
        setEditingId(null);
      }}
      onCancel={() => setEditingId(null)}
      onSplit={(before, after) => {
        setEditingId(null);
        void useDocStore.getState().splitParagraphAt(elem.id, before, after);
      }}
    />
  ) : (
    // Textarea overlay â€” headings, block_quote NO... (ver nota)
    <div style={{ position: 'relative', margin: '4px 0' }}>
      ... textarea existente ...
    </div>
  )
) : elem.type !== 'image' ? (
```

Nota: `block_quote` estÃ¡ en INLINE_EDITABLE_TYPES â€” el textarea queda para heading, toc, equation, etc. (los tipos que hoy abren textarea y no son pÃ¡rrafo de cuerpo).

4. Enfoque del pÃ¡rrafo nuevo tras el split: el store genera el id; tras `splitParagraphAt`, enfocar `paper-elem-${newId}` con un efecto... SimplificaciÃ³n B1: el usuario hace doble click en el nuevo pÃ¡rrafo para seguir editando (el split ya dejÃ³ el cursor conceptual en el nuevo pÃ¡rrafo). Anotar como mejora posterior.

- [x] **Step 4: Correr tests, verificar GREEN**

Run: `npx vitest run src/__tests__/inlineEdit.canvas.test.tsx src/__tests__/pageGeometry.integration.test.tsx src/__tests__/layoutCuts.integration.test.tsx src/__tests__/readingText.test.tsx && npx tsc --noEmit`
Expected: GREEN; tsc limpio.

- [x] **Step 5: Commit**

Run: `git add src/components/layout/PaperCanvas.tsx src/__tests__/inlineEdit.canvas.test.tsx && git commit -m "feat(edit): canvas edita pÃ¡rrafos de cuerpo con contentEditable inline"`

---

### Task 6: Cierre â€” verificaciÃ³n completa

- [x] **Step 1: Suite backend**

Run: `pytest python/tests/ -q`
Expected: 0 failed (los 7 fallos ajenos del baseline NO existen en backend).

- [x] **Step 2: Suite frontend**

Run: `npx vitest run 2>&1 | Select-String "Test Files|Tests "`
Expected: mismos 7 fallos ajenos del baseline (focoNoBarraElSelector Ã—4, proyectoSobrevive Ã—3); ningÃºn fallo nuevo.

- [x] **Step 3: Tipos + build**

Run: `npx tsc --noEmit` â†’ 0 errores.

- [x] **Step 4: DocumentaciÃ³n**

- Marcar Fase 3 en `plan-motor-rendimiento.md` (si existe) o en el ledger.
- Run: `git add docs/ && git commit -m "docs: Fase 3 edicion inline B1 completada"`

---

## Notas para el ejecutor

- Orden estricto: 1â†’6. Cada task: test RED verificado â†’ fix â†’ GREEN verificado â†’ commit.
- `python/main.py` NO se toca. `src/components/review/*`, `src/lib/auditItems.ts`, `src/store/slices/uiSlice.ts` NO se tocan (F7 en background).
- `document.execCommand('insertText')` estÃ¡ deprecado pero es el Ãºnico mecanismo cross-browser para insertar texto plano sin romper el cursor; sigue soportado en Chrome/Firefox/Safari. Alternativa futura: Selection API + insertNode de texto.
- El pÃ¡rrafo nuevo insertado por el backend hereda el estilo del pÃ¡rrafo fuente (mismo `style` y bold/italic del run 0). La tipografÃ­a APA fina la aplica `apply_inplace` en el prÃ³ximo generate/layout desde el modelo.
- Mejora posterior anotada: enfocar automÃ¡ticamente el pÃ¡rrafo nuevo tras el split (hoy: doble click).

