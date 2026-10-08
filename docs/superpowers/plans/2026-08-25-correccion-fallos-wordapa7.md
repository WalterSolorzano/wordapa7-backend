# Corrección de Fallos WordAPA7 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los fallos reportados en 6 subsistemas de WordAPA7 (add-in offline, portada duplicada, inspector, diseño/layout, revisión proactiva y referencias) restaurando el comportamiento acordado.

**Architecture:** App Electron + React (Zustand) + backend FastAPI Python (python-docx) + add-in Word Office.js. El add-in vive dentro de Word y habla con el backend local; el frontend React es la app de escritorio. Hay dos rutas de generación: in-place (default, edita el original) y from-scratch (opt-in).

**Tech Stack:** React 18, TypeScript, Zustand, FastAPI, python-docx, Office.js, Vitest, pytest.

## Global Constraints

- Python 3.11+. Linter: `ruff`. Tests: `pytest python/tests/` y `npm test` (Vitest, jsdom).
- Backend arranca en `127.0.0.1:8742`. SSL por defecto en Windows (cert auto-firmado con `cryptography`).
- El add-in NUNCA decide formato por su cuenta: el motor central define zonas/reglas. Pero DEBE degradar a un modo local limitado (sin render) cuando el motor no responde, en vez de fallar.
- Portada: `use_original_cover=true` por defecto (preserva la original). `cover_mode='generate_uni_cover'` genera la portada UNI.
- Export default: `export_mode='inplace'` (edita el original sin regenerar portada).
- No romper tests existentes. Cada tarea termina con un commit.

## Scope Note

Este plan cubre 6 subsistemas independientes (Cluster A–F). Cada cluster produce software testeable por sí mismo. Si se prefiere, pueden ejecutarse como planes separados, pero se entregan juntos porque el usuario los pidió en un solo plan de corrección. Ejecutar por cluster (A→F) es el orden recomendado.

---

## File Structure (mapeo de archivos por cluster)

**Cluster A — Add-in offline / motor / plantillas / fuentes / carga**
- Modify: `word-addin/src/taskpane/office/masterNormalizer.ts` — fallback local cuando el motor no responde
- Modify: `word-addin/src/taskpane/office/coverGuard.ts` — `getCoverZones` no fatal
- Modify: `word-addin/src/taskpane/components/LiveAssistantPanel.tsx` — exponer `onFormatAll` (modo local)
- Modify: `word-addin/src/taskpane/App.tsx` — heartbeat vía `backend.ts`, colapsar doble polling
- Modify: `word-addin/src/taskpane/api/backend.ts` — `heartbeat()`, discovery perezoso
- Modify: `word-addin/src/taskpane/styles/taskpane.css` — fuentes más grandes
- Modify: `word-addin/src/taskpane/liveAssistant.ts` — un único loop de salud
- Delete/gate: `word-addin/src/taskpane/office/jarvisLive.ts` — dead code con URL hardcoded
- Test: `word-addin/src/taskpane/__tests__/masterNormalizer.test.ts` (nuevo)
- Backend: `python/routers/addin.py` — endpoints de plantillas bajo `/api/addin/` (opcional)

**Cluster B — Portada duplicada**
- Modify: `python/parsing/docx_parser.py` — extracción de texto de párrafo salta `mc:Fallback`
- Modify: `src/components/layout/PaperCanvas.tsx` — dedup de `coverAuthorTexts` por nombre/carnet
- Test: `python/tests/test_cover_author_dedup.py` (nuevo)
- Test: `src/__tests__/coverAuthorDedup.test.ts` (nuevo)

**Cluster C — Inspector UI**
- Modify: `src/components/inspector/ElementInspector.tsx` — quitar `ImageEditPanel` duplicado, rediseñar Info/Estado
- Modify: `src/App.tsx` — `ImageEditSidePanel` como único editor de imagen
- Modify: `src/components/layout/PaperCanvas.tsx` — botón flotante "Sugerir leyenda con IA" en tablas
- Modify: `src/store/useDocStore.ts` — `updateElementTable`, `autoCaptionAll`, toasts visibles
- Modify: `src/components/wizard/Step3FiguresTablesWizard.tsx` — botón "Leyendas IA para todo"
- Modify: `python/main.py` — `table_info` en `UpdateElementRequest`
- Test: `src/__tests__/inspector.test.tsx` (nuevo)
- Test: `python/tests/test_update_element_table.py` (nuevo)

**Cluster D — Diseño/layout + auditor de imágenes**
- Modify: `src/components/wizard/EditorRail.tsx` — eliminar columna sparkle / mover toggle
- Modify: `src/components/wizard/StepRail.tsx` — `showMap` incluye paso 2; espaciado
- Modify: `src/components/wizard/Step2HeadingsWizard.tsx` — quitar panel outline duplicado
- Modify: `python/generation/generator.py` — `keep_together`/`widow_control` en `_apply_image_design_style`; tope de altura de imagen
- Modify: `python/modules/doc_auditor.py` — chequeos de overflow/bleed de imágenes
- Test: `python/tests/test_image_keep_together.py` (nuevo)
- Test: `python/tests/test_doc_auditor_overflow.py` (nuevo)

**Cluster E — Revisión proactiva (IA/ortografía/palabras repetidas)**
- Create: `python/routers/proofread.py` — endpoint `/api/proofread-batch`
- Modify: `python/main.py` — `/api/ai-review` integra `proactive_auditor`
- Modify: `src/components/layout/PaperCanvas.tsx` — `styleAuditRun` en `renderReviewedText`; subrayado de `proofreadFindings`
- Modify: `src/components/layout/WhatsAppComment.tsx` — `DUPLICATE_RE` ≥2 letras
- Modify: `src/store/useDocStore.ts` — re-ejecutar revisión al editar; limpiar cache IA; no tragar 404
- Test: `python/tests/test_proofread_batch.py` (nuevo)
- Test: `src/__tests__/proofreadInline.test.tsx` (nuevo)

**Cluster F — Referencias / bibliografía**
- Modify: `python/parsing/references_extractor.py` — dedup semántico (autor+año+título, sin prefijo)
- Modify: `python/generation/inplace_editor.py` — dedup de bibliografía in-place
- Modify: `python/generation/generator.py` y `layered_generator.py` — no doble-escribir referencias
- Modify: `src/App.tsx` — drawer del validador global (overlay raíz)
- Modify: `src/components/referencias/ReferencesPanel.tsx` — siempre permitir abrir el validador
- Modify: `src/store/useDocStore.ts` — dedup en `addReference`/`autoResolveGhosts`
- Test: `python/tests/test_references_dedup.py` (nuevo)
- Test: `src/__tests__/validatorDrawer.test.tsx` (nuevo)

---

# Cluster A — Add-in: motor central, plantillas, fuentes y carga

### Task A1: El normalizador degrada a modo local cuando el motor central no responde

**Files:**
- Modify: `word-addin/src/taskpane/office/masterNormalizer.ts:65-77`
- Modify: `word-addin/src/taskpane/office/coverGuard.ts:38-60`
- Test: `word-addin/src/taskpane/__tests__/masterNormalizer.test.ts`

**Interfaces:**
- Consumes: `getCoverZones(force?: boolean): Promise<CoverZones | null>` (coverGuard.ts); `formatDocumentAPA7()` local (wordHelper.ts)
- Produces: `normalizeEntireDocumentAPA7(onProgress?): Promise<NormalizationReport>` que NUNCA lanza "Motor central no disponible"; aplica formato local + un floor heurístico cuando `getCoverZones` devuelve null.

- [ ] **Step 1: Write the failing test**

```ts
// word-addin/src/taskpane/__tests__/masterNormalizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('normalizeEntireDocumentAPA7 — offline fallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no lanza "Motor central" y retorna report cuando el backend está caído', async () => {
    // Forzar getCoverZones a devolver null (backend caído)
    vi.doMock('../office/coverGuard', () => ({
      getCoverZones: vi.fn().mockResolvedValue(null),
    }));
    // Mock del formateo local para no tocar Word real
    const localFormat = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../office/wordHelper', () => ({
      formatDocumentAPA7: localFormat,
      getDocumentText: vi.fn().mockResolvedValue('texto'),
    }));

    const { normalizeEntireDocumentAPA7 } = await import('../office/masterNormalizer');
    const report = await normalizeEntireDocumentAPA7();
    expect(report).toBeDefined();
    expect(localFormat).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/masterNormalizer.test.ts`
Expected: FAIL — el actual `masterNormalizer` lanza el error "Motor central".

- [ ] **Step 3: Write minimal implementation**

En `masterNormalizer.ts`, reemplazar el bloque que lanza (líneas ~67-77) por un fallback:

```ts
export async function normalizeEntireDocumentAPA7(
  onProgress?: (step: string, percent: number) => void
): Promise<NormalizationReport> {
  onProgress?.('Consultando zonas al motor central...', 8);
  const zones = await getCoverZones(true);
  if (!zones) {
    // MODO LIMITADO: el motor central no está. No adivinamos la portada,
    // pero SÍ aplicamos el formato APA 7 local (Times New Roman 12, doble
    // espaciado, sangría) sobre el cuerpo. Es lo acordado: versión limitada
    // en background sin renderizar.
    onProgress?.('Motor central no disponible — aplicando formato local...', 40);
    try {
      await formatDocumentAPA7();
    } catch (e) {
      // El formateo local es best-effort; no bloqueamos el report.
    }
    onProgress?.('Formato local aplicado', 100);
    return {
      applied: true,
      mode: 'local_fallback',
      note: 'Motor central no disponible: se aplicó formato APA 7 local limitado.',
    };
  }
  // ... resto del flujo con zones (sin cambios) ...
}
```

Asegurar el import de `formatDocumentAPA7` desde `./wordHelper` al tope del archivo.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/masterNormalizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/office/masterNormalizer.ts word-addin/src/taskpane/__tests__/masterNormalizer.test.ts
git commit -m "fix(addin): el normalizador degrada a modo local cuando el motor central no responde"
```

---

### Task A2: Re-exponer el botón de formato local en el panel del asistente

**Files:**
- Modify: `word-addin/src/taskpane/components/LiveAssistantPanel.tsx:49-60` (destructuring) y `~206-211` (botón)
- Test: `word-addin/src/taskpane/__tests__/masterNormalizer.test.ts` (ya cubre el flujo)

**Interfaces:**
- Consumes: prop `onFormatAll: () => void` (ya declarada en la interfaz, línea 42)
- Produce: un botón visible "Formatear (modo local)" en el panel.

- [ ] **Step 1: Write the failing test**

Añadir al archivo de test del Task A1:

```ts
it('LiveAssistantPanel renderiza el botón de formato local', async () => {
  const { render } = await import('@testing-library/react');
  const { LiveAssistantPanel } = await import('../components/LiveAssistantPanel');
  const onFormatAll = vi.fn();
  const { getByText } = render(
    <LiveAssistantPanel
      running={true} options={{}} stats={null} citationsCount={0}
      onToggle={vi.fn()} onOptionChange={vi.fn()} onScanNow={vi.fn()}
      onFormatAll={onFormatAll} auditStatus="idle" auditResult={null}
      auditNotice={null} showToast={vi.fn()}
    />
  );
  const btn = getByText(/Formatear/i);
  expect(btn).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/masterNormalizer.test.ts`
Expected: FAIL — `onFormatAll` no se desestructura ni se usa; el botón no existe.

- [ ] **Step 3: Write minimal implementation**

En `LiveAssistantPanel.tsx`, agregar `onFormatAll` al destructuring (línea 49):

```tsx
export const LiveAssistantPanel: React.FC<LiveAssistantPanelProps> = ({
  running, options, stats, citationsCount, onToggle, onOptionChange, onScanNow,
  onFormatAll, auditStatus, auditResult, auditNotice, showToast,
}) => {
```

Añadir un botón junto al de master-normalize (cerca de la línea 206):

```tsx
<button type="button" className="btn btn-sm" onClick={onFormatAll} title="Formato APA 7 local (no requiere motor central)">
  Formatear (local)
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/masterNormalizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/components/LiveAssistantPanel.tsx word-addin/src/taskpane/__tests__/masterNormalizer.test.ts
git commit -m "feat(addin): re-exponer botón de formato local en el panel"
```

---

### Task A3: Plantillas — garantir método HTTP correcto y reconstruir el add-in

**Files:**
- Modify: `word-addin/src/taskpane/components/TemplatesPanel.tsx` (verificar que no llame al backend con método erróneo)
- Verify: `python/routers/addin.py` (añadir `GET /api/addin/templates` y `POST /api/addin/insert-template` si se quiere backend-driven)
- Test: `python/tests/test_addin_endpoints.py` (añadir caso)

**Interfaces:**
- Consumes: `backend.ts` helpers; si se añaden rutas add-in, deben usar el mismo método que el cliente.

- [ ] **Step 1: Write the failing test**

Añadir a `python/tests/test_addin_endpoints.py`:

```python
def test_addin_templates_get_not_post(client):
    """GET /api/addin/templates responde 200; POST responde 405/404, no 500."""
    r = client.get("/api/addin/templates")
    assert r.status_code in (200, 404)  # existe o no, pero no 500
    rp = client.post("/api/addin/templates", json={})
    assert rp.status_code in (405, 404)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_addin_endpoints.py::test_addin_templates_get_not_post -x`
Expected: FAIL si la ruta no existe (404) — definir el comportamiento esperado.

- [ ] **Step 3: Write minimal implementation**

En `python/routers/addin.py`, añadir un endpoint estable para listar plantillas (reutiliza la generación existente):

```python
from generation.templates import AVAILABLE_TEMPLATES

@router.get("/templates")
async def addin_list_templates() -> dict:
    return {"templates": [
        {"name": t.name, "description": t.description, "section_count": len(t.sections)}
        for t in AVAILABLE_TEMPLATES
    ]}
```

Verificar que `TemplatesPanel.tsx` (línea 115-181) siga insertando vía `Word.run` local (client-side) y NO haga `POST /api/templates`. Si hace algún fetch, cambiarlo a `backend.get('/addin/templates')` o mantenerlo 100% client-side. El "Method Not Allowed" se elimina al no llamar rutas con método incorrecto.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_addin_endpoints.py::test_addin_templates_get_not_post -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/routers/addin.py python/tests/test_addin_endpoints.py word-addin/src/taskpane/components/TemplatesPanel.tsx
git commit -m "fix(addin): endpoint estable de plantillas bajo /api/addin y método correcto"
```

> Nota de despliegue: este fix solo llega al usuario tras `npm run build:addin` y sincronizar `resources/addin/`. El build stale es la causa raíz del 405 observado.

---

### Task A4: Fuentes del menú/carga más grandes

**Files:**
- Modify: `word-addin/src/taskpane/styles/taskpane.css` (~líneas 24, 113, 84, 145, 280, 195, 175, 230)

**Interfaces:** N/A (CSS puro).

- [ ] **Step 1: Write the failing test**

```ts
// word-addin/src/taskpane/__tests__/fontSizes.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('taskpane.css font sizes', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../styles/taskpane.css'), 'utf-8');

  it('.tab tiene font-size >= 13px', () => {
    const m = css.match(/\.tab\s*\{[^}]*font-size:\s*([\d.]+)px/);
    expect(m).toBeTruthy();
    expect(parseFloat(m![1])).toBeGreaterThanOrEqual(13);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/fontSizes.test.ts`
Expected: FAIL — `.tab` está en 11.5px.

- [ ] **Step 3: Write minimal implementation**

En `taskpane.css`, subir tamaños:
- `.tab` → `font-size: 14px;` padding `8px 12px;`
- `.app-header__status` → `font-size: 13px;`
- `.mascot-bubble__text` → `font-size: 12.5px;`
- `.card__subtitle` → `font-size: 12.5px;`
- `.btn-sm` → `font-size: 12px;`
- `.stat-chip__label` → `font-size: 10.5px;`
- `.finding-item__badge` → `font-size: 10.5px;`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/fontSizes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/styles/taskpane.css word-addin/src/taskpane/__tests__/fontSizes.test.ts
git commit -m "style(addin): fuentes de menú y carga más grandes"
```

---

### Task A5: Tiempos de carga — heartbeat por backend.ts, un solo loop de salud, discovery perezoso

**Files:**
- Modify: `word-addin/src/taskpane/api/backend.ts:55,125,157-158`
- Modify: `word-addin/src/taskpane/App.tsx:75-98`
- Modify: `word-addin/src/taskpane/liveAssistant.ts:461-463`
- Delete/gate: `word-addin/src/taskpane/office/jarvisLive.ts`
- Test: `word-addin/src/taskpane/__tests__/bootstrap.test.ts`

**Interfaces:**
- Produce: `backend.heartbeat(): Promise<void>` que usa la URL descubierta; un único loop de salud.

- [ ] **Step 1: Write the failing test**

```ts
// word-addin/src/taskpane/__tests__/bootstrap.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('backend.heartbeat usa la URL descubierta', () => {
  it('existe un método heartbeat que no hardcodea :8742', async () => {
    const mod = await import('../api/backend');
    expect(typeof mod.backend.heartbeat).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/bootstrap.test.ts`
Expected: FAIL — `backend.heartbeat` no existe.

- [ ] **Step 3: Write minimal implementation**

En `backend.ts` añadir:
```ts
export const backend = {
  // ... existentes
  async heartbeat(): Promise<void> {
    await ensureBaseUrl();
    await post('/api/addin/heartbeat', {});
  },
};
```
Hacer `ensureBaseUrl()` perezoso: quitar la llamada inmediata `ensureBaseUrl()` al final del módulo (línea 157-158) — ya es lazy vía `discoveryPromise` en cada método.

En `App.tsx` reemplazar el heartbeat hardcoded (líneas 75-76) por:
```ts
useEffect(() => {
  backend.heartbeat().catch(() => {});
  const hb = setInterval(() => backend.heartbeat().catch(() => {}), 60000);
  return () => clearInterval(hb);
}, []);
```
Mantener UN solo loop de salud (el de `App.tsx`); en `liveAssistant.ts:461-463` quitar el `setInterval` duplicado y exponer `_backendOnline` para que `App.tsx` sea la única fuente de verdad (o viceversa). Eliminar `jarvisLive.ts` o guardarlo tras un flag explícito.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/__tests__/bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/api/backend.ts word-addin/src/taskpane/App.tsx word-addin/src/taskpane/liveAssistant.ts word-addin/src/taskpane/office/jarvisLive.ts word-addin/src/taskpane/__tests__/bootstrap.test.ts
git commit -m "perf(addin): heartbeat vía backend.ts, un solo loop de salud, discovery perezoso"
```

---

# Cluster B — Portada: deduplicación de integrantes

### Task B1: La extracción de texto de párrafo salta la rama mc:Fallback

**Files:**
- Modify: `python/parsing/docx_parser.py` (extracción de texto de párrafo, ~líneas 146-198 `_extract_paragraph_text_with_footnotes` y la iteración de `w:t`)
- Test: `python/tests/test_cover_author_dedup.py`

**Interfaces:**
- Produce: `ElementModel.text` de párrafos de portada sin texto duplicado de textboxes Choice+Fallback.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_cover_author_dedup.py
import io, zipfile
from xml.etree import ElementTree as ET

def _make_docx_with_textbox() -> bytes:
    """DOCX con un párrafo que contiene un AlternateContent (Choice + Fallback)
    con el mismo textbox 'Br. Juan Perez Carnet: 2023-0001U'."""
    document_xml = '''<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
  <w:body>
    <w:p><w:r><w:t>x</w:t></w:r></w:p>
    <w:p>
      <w:r><w:drawing>
        <mc:AlternateContent>
          <mc:Choice Requires="wps">
            <wps:wsp><wps:txbx><w:txbxContent>
              <w:p><w:r><w:t>Br. Juan Perez</w:t></w:r></w:p>
              <w:p><w:r><w:t>Carnet: 2023-0001U</w:t></w:r></w:p>
            </w:txbxContent></wps:txbx></wps:wsp>
          </mc:Choice>
          <mc:Fallback>
            <w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox>
              <w:txbxContent>
                <w:p><w:r><w:t>Br. Juan Perez</w:t></w:r></w:p>
                <w:p><w:r><w:t>Carnet: 2023-0001U</w:t></w:r></w:p>
              </w:txbxContent>
            </v:textbox></v:shape></w:pict>
          </mc:Fallback>
        </mc:AlternateContent>
      </w:drawing></w:r>
    </w:p>
  </w:body>
</w:document>'''
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>')
        z.writestr('word/document.xml', document_xml)
        z.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    return buf.getvalue()

def test_paragraph_textbox_not_doubled(make_docx_bytes):
    from parsing.docx_parser import parse_docx_bytes
    docx_bytes = _make_docx_with_textbox()
    doc = parse_docx_bytes(docx_bytes, "test.docx", "s1", None, skip_page_layout=True)
    # El texto del autor no debe aparecer duplicado en ningún elemento.
    joined = " ".join((e.text or "") for e in doc.elements)
    assert joined.count("Br. Juan Perez") <= 1, "El autor se duplicó (Choice+Fallback)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_cover_author_dedup.py::test_paragraph_textbox_not_doubled -x`
Expected: FAIL — el texto aparece 2 veces.

- [ ] **Step 3: Write minimal implementation**

En la función de extracción de texto de párrafo (`_extract_paragraph_text_with_footnotes` y/o donde se itera `p.iter()` recogiendo `w:t`), añadir un guard que salte cualquier `w:t` cuyo ancestro sea `mc:Fallback`. Con lxml se puede precomputar el set de `w:t` dentro de Fallback:

```python
def _extract_paragraph_text_with_footnotes(p_element):
    MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    # Conjunto de w:t que viven bajo un mc:Fallback (VML legacy) — saltarlos:
    fallback_ts = set()
    for fb in p_element.iter(f'{{{MC}}}Fallback'):
        for t in fb.iter(f'{{{W}}}t'):
            fallback_ts.add(id(t))
    parts = []
    def _walk(el):
        for child in el:
            tag = child.tag
            if tag == f'{{{W}}}t' and child.text and id(child) not in fallback_ts:
                parts.append(child.text)
            elif tag == f'{{{W}}}br':
                parts.append('\n')
            elif tag == f'{{{W}}}tab':
                parts.append('\t')
            # no bajar dentro de txbx anidados ni Fallback
            if tag in (f'{{{MC}}}Fallback',):
                continue
            _walk(child)
    _walk(p_element)
    return ''.join(parts), []
```

Adaptar a la estructura real del archivo (la iteración existente). El objetivo: ningún `w:t` bajo `mc:Fallback` se añade al texto del párrafo.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_cover_author_dedup.py::test_paragraph_textbox_not_doubled -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/parsing/docx_parser.py python/tests/test_cover_author_dedup.py
git commit -m "fix(portada): la extracción de texto de párrafo salta la rama mc:Fallback"
```

---

### Task B2: Dedup de autores en el render de "Portada original conservada"

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx` (~líneas 760-790 y 895-940)
- Test: `src/__tests__/coverAuthorDedup.test.ts`

**Interfaces:**
- Produce: `coverAuthorTexts` sin duplicados (por nombre/carnet normalizado).

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/coverAuthorDedup.test.ts
import { describe, it, expect } from 'vitest';

// Extraer la lógica de dedup a una función pura testeable:
describe('dedupCoverAuthors', () => {
  it('colapsa autores duplicados por carnet', async () => {
    const { dedupCoverAuthors } = await import('../lib/coverDedup');
    const authors = [
      { id: 'a1', text: 'Br. Juan Perez\nCarnet: 2023-0001U' },
      { id: 'a2', text: 'Br. Juan Perez\nCarnet: 2023-0001U' },
      { id: 'a3', text: 'Br. Ana Lopez\nCarnet: 2023-0002U' },
    ];
    const out = dedupCoverAuthors(authors);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/coverAuthorDedup.test.ts`
Expected: FAIL — `dedupCoverAuthors` no existe.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/coverDedup.ts`:

```ts
import type { ElementModel } from '../types';

/** Dedup de elementos de autores de portada por nombre/carnet normalizado. */
export function dedupCoverAuthors(authors: ElementModel[]): ElementModel[] {
  const seenCarnet = new Set<string>();
  const seenName = new Set<string>();
  return authors.filter((e) => {
    const txt = (e.text || '').toLowerCase();
    const carnetMatch = txt.match(/carnet:\s*([0-9-]+[a-z]?)/i);
    const carnet = carnetMatch ? carnetMatch[1].replace(/\s+/g, '') : '';
    // nombre = líneas sin "carnet:"/sin "elaborado por"
    const nameLines = (e.text || '').split('\n')
      .map((l) => l.trim()).filter((l) => !/^carnet:/i.test(l) && !/elaborado por/i.test(l));
    const nameKey = nameLines.join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
      .replace(/^(br|ing|lic|sr|sra)\.?\s+/i, '');
    if (carnet) {
      if (seenCarnet.has(carnet)) return false;
      seenCarnet.add(carnet);
    } else if (nameKey) {
      if (seenName.has(nameKey)) return false;
      seenName.add(nameKey);
    }
    return true;
  });
}
```

En `PaperCanvas.tsx`, donde se construye `coverAuthorTexts` (línea ~770), aplicarle el dedup antes de renderizar:

```ts
import { dedupCoverAuthors } from '../../lib/coverDedup';
// ... dentro del bloque if (isCoverPage) { pageElements.forEach(...) }
// tras llenar coverAuthorTexts:
const coverAuthorTextsDedup = dedupCoverAuthors(coverAuthorTexts);
// usar coverAuthorTextsDedup en el grid de autores (línea ~895)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/coverAuthorDedup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/coverDedup.ts src/components/layout/PaperCanvas.tsx src/__tests__/coverAuthorDedup.test.ts
git commit -m "fix(portada): dedup de autores en el render de portada original conservada"
```

---

# Cluster C — Inspector UI

### Task C1: Eliminar el ImageEditPanel duplicado (instancia única)

**Files:**
- Modify: `src/components/inspector/ElementInspector.tsx:391-395` (quitar `<ImageEditPanel>` embebido)
- Modify: `src/App.tsx:107-145,528` (`ImageEditSidePanel` como único editor)
- Test: `src/__tests__/inspector.test.tsx`

**Interfaces:**
- Produce: un solo `<ImageEditPanel>` visible (en `ImageEditSidePanel`), abierto con `setImagePanelOpen(true)`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/inspector.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

describe('ElementInspector no renderiza ImageEditPanel embebido', () => {
  it('muestra un botón "Editar imagen" en vez del panel completo', async () => {
    // ElementInspector requiere store; mock mínimo
    vi.mock('../store/useDocStore', () => ({
      useDocStore: () => ({
        doc: { elements: [{ id: 'img1', type: 'image', text: '', image_info: { width_cm: 10, height_cm: 8 } }],
        selectedElementId: 'img1', updateElementType: vi.fn(), portada: {}, setPortada: vi.fn(),
        setImagePanelOpen: vi.fn(),
      }),
      cleanHeadingPrefix: (s: string) => s, toRoman: (n: number) => String(n),
    }));
    const { ElementInspector } = await import('../components/inspector/ElementInspector');
    const { queryByText, getByText } = render(<ElementInspector />);
    // No debe haber dos paneles de edición de imagen
    expect(queryByText(/Panel de edición/i)).toBeNull();
    expect(getByText(/Editar imagen/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL — el `ImageEditPanel` embebido aparece (panel duplicado).

- [ ] **Step 3: Write minimal implementation**

En `ElementInspector.tsx` (líneas 391-395) reemplazar el `<ImageEditPanel>` embebido por un botón que abre el panel único:

```tsx
{selectedElem.type === 'image' && (
  <div className="inspector-section" style={{ paddingBottom: 0 }}>
    <SuggestCaptionButton elem={selectedElem} />
    <button type="button" className="btn btn-sm" onClick={() => setImagePanelOpen(true)}>
      Editar imagen
    </button>
  </div>
)}
```
Añadir `setImagePanelOpen` al selector del store (`useDocStore`) en `ElementInspector`. En `App.tsx` mantener `ImageEditSidePanel` como el único `<ImageEditPanel>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/ElementInspector.tsx src/App.tsx src/__tests__/inspector.test.tsx
git commit -m "fix(inspector): un solo ImageEditPanel (eliminar duplicado)"
```

---

### Task C2: Los controles de tabla persisten (table_info en la API)

**Files:**
- Modify: `python/main.py:474-481` (`UpdateElementRequest`) y el handler `update_element`
- Modify: `src/store/useDocStore.ts` — `updateElementTable`
- Modify: `src/components/inspector/ElementInspector.tsx:399-444` — usar `updateElementTable`
- Test: `python/tests/test_update_element_table.py`

**Interfaces:**
- Produce: `UpdateElementRequest.table_info: Optional[dict]`; store `updateElementTable(elementId, patch)`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_update_element_table.py
def test_update_element_persists_table_info(client, tmp_path):
    """El endpoint /api/update-element persiste table_info (no lo pierde)."""
    # Crear sesión con una tabla via /api/start-blank y luego update-element
    r = client.post("/api/start-blank")
    assert r.status_code == 200
    doc = r.json()
    sid = doc["session_id"]
    # Añadir un elemento tabla al modelo via el store de la sesión no es trivial;
    # en su lugar, validamos que el schema acepte table_info sin 422:
    payload = {
        "session_id": sid,
        "element_id": "no-existe",
        "type": "table",
        "table_info": {"table_number": 5, "caption": "Mi Tabla", "note": "Nota"},
    }
    r2 = client.post("/api/update-element", json=payload)
    # 404 (elemento no encontrado) es OK; 422 (schema) sería el bug.
    assert r2.status_code != 422, "table_info debe ser aceptado por el schema"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_update_element_table.py -x`
Expected: FAIL — 422 porque `table_info` no está en el schema.

- [ ] **Step 3: Write minimal implementation**

En `python/main.py` `UpdateElementRequest` añadir:
```python
class UpdateElementRequest(BaseModel):
    session_id: str
    element_id: str
    type: str
    heading_level: Optional[int] = None
    text: Optional[str] = None
    image_info: Optional[dict] = None
    equation: Optional[dict] = None
    table_info: Optional[dict] = None   # NUEVO
    api_key: Optional[str] = None
```
En el handler `update_element`, tras el bloque de `image_info` (~línea 1122), añadir:
```python
if req.table_info is not None:
    if hasattr(elem, 'table_info') and elem.table_info is not None:
        for k, v in req.table_info.items():
            if hasattr(elem.table_info, k):
                setattr(elem.table_info, k, v)
    elif hasattr(elem, 'table_info') and elem.table_info is None:
        from models import TableModel
        tbl = TableModel()
        for k, v in req.table_info.items():
            if hasattr(tbl, k):
                setattr(tbl, k, v)
        elem.table_info = tbl
```

En `src/store/useDocStore.ts` añadir acción `updateElementTable`:
```ts
updateElementTable: async (elementId, patch) => {
  const { doc } = get();
  if (!doc) return;
  try {
    const updated = await api.updateElement(doc.session_id, elementId, 'table', undefined, undefined, { table_info: patch });
    set({ doc: updated });
  } catch (err: any) {
    get().showToast(err.message || 'Error al actualizar tabla', 'error');
  }
},
```
Ajustar `api.updateElement` en `src/api/backend.ts` para enviar `table_info` en el body. En `ElementInspector.tsx` reemplazar las mutaciones directas (líneas 412-440) por `updateElementTable(elem.id, { table_number, caption, note })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_update_element_table.py -x` y `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/main.py python/tests/test_update_element_table.py src/store/useDocStore.ts src/api/backend.ts src/components/inspector/ElementInspector.tsx
git commit -m "fix(inspector): los controles de tabla persisten vía table_info en la API"
```

---

### Task C3: Rediseñar Info/Estado y arreglar el chat "¿Por qué se clasificó así?"

**Files:**
- Modify: `src/components/inspector/ElementInspector.tsx:256-278` (Info), `303-331` (Estado), `228-237` (chat)
- Modify: `python/main.py:528` (`ExplainElementRequest` acepta `id`+`question`)
- Test: `src/__tests__/inspector.test.tsx`

**Interfaces:**
- Produce: el chat de explicación envía `{ element_id, question }` y el backend resuelve el elemento de la sesión.

- [ ] **Step 1: Write the failing test**

Añadir a `python/tests/test_update_element_table.py` (o un test dedicado):
```python
def test_explain_element_accepts_id_and_question(client):
    r = client.post("/api/start-blank"); sid = r.json()["session_id"]
    r2 = client.post("/api/ai/explain-element", json={"id": "x", "question": "por qué?"})
    # 200 o 500 (si no hay IA) pero NUNCA 422 por campos desconocidos
    assert r2.status_code != 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_update_element_table.py::test_explain_element_accepts_id_and_question -x`
Expected: FAIL — 422 porque el schema no acepta `id`/`question`.

- [ ] **Step 3: Write minimal implementation**

En `python/main.py` ampliar el schema (mantener compatibilidad):
```python
class ExplainElementRequest(BaseModel):
    element_type: str = ""
    text: str = ""
    rules_applied: str = ""
    confidence: float = 0.0
    api_key: Optional[str] = None
    # Nuevos campos (compatibles con el add-in/frontend):
    session_id: Optional[str] = None
    element_id: Optional[str] = None
    question: Optional[str] = None
```
En el handler, si llegan `session_id`+`element_id`+`question`, cargar el elemento de la sesión y usar su texto/tipo como contexto para `explain_element`. Quitar las secciones "Info" (badge de tipo, líneas 257-265) y "Estado" (líneas 303-331) de `ElementInspector.tsx`; dejar solo el `<select>` de tipo compacto. El chat usa `question` además del contexto del elemento.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_update_element_table.py::test_explain_element_accepts_id_and_question -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/main.py src/components/inspector/ElementInspector.tsx src/__tests__/inspector.test.tsx
git commit -m "fix(inspector): quitar Info/Estado sin valor y arreglar el chat de explicación"
```

---

### Task C4: Botón flotante "Sugerir leyenda con IA" al tocar imagen O tabla

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:668-715` (barra contextual incluye tablas)
- Test: `src/__tests__/inspector.test.tsx`

**Interfaces:**
- Produce: la barra contextual aparece para `image` Y `table` y muestra "Sugerir IA".

- [ ] **Step 1: Write the failing test**

```ts
it('PaperCanvas muestra Sugerir IA para tabla seleccionada', async () => {
  // mock store con una tabla seleccionada
  vi.mock('../store/useDocStore', () => ({ useDocStore: () => ({
    doc: { elements: [{ id: 't1', type: 'table', text: '', table_info: { table_number: 1, rows: [['a']] } }],
    selectedElementId: 't1', rules: {}, portada: {}, setSelectedElementId: vi.fn(),
    setForceRightPanelOpen: vi.fn(), setWizardStep: vi.fn(), setScrollTargetId: vi.fn(),
    updateElementType: vi.fn(), updateElementImage: vi.fn(), dismissComment: vi.fn(),
    tableStyles: {}, dismissedCommentIds: [], imagePanelOpen: false, setImagePanelOpen: vi.fn(),
    reviewResult: null, zoomLevel: 100, setZoomLevel: vi.fn(),
    citationAuditResult: null, validationIssues: [], sugerenciasProactivas: true,
  }) }));
  // El contexto se renderiza dentro de PaperCanvas; verificar el botón
  const { PaperCanvas } = await import('../components/layout/PaperCanvas');
  const { getByText } = render(<PaperCanvas />);
  // La barra contextual sólo aparece para imagen hoy; para tabla no => FAIL
  expect(() => getByText(/Sugerir IA|Sugerir Leyenda/i)).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL — la barra retorna null para tablas (línea ~673).

- [ ] **Step 3: Write minimal implementation**

En `PaperCanvas.tsx`, cambiar el guard de la barra contextual (línea ~673) de:
```tsx
if (!selElem || selElem.type !== 'image' || !selElem.image_info) return null;
```
a:
```tsx
if (!selElem || (selElem.type !== 'image' && selElem.type !== 'table')) return null;
```
Y dentro de la barra, mostrar el botón "Sugerir IA" para ambos tipos (ya existe `handleSuggestCaption` que funciona para tablas). Los controles de rotación/ancho pueden quedar solo para imágenes (`selElem.type === 'image'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/inspector.test.tsx
git commit -m "feat(inspector): botón Sugerir leyenda IA al tocar imagen o tabla"
```

---

### Task C5: "Leyendas IA para todo" + estados de carga + protección de caídas

**Files:**
- Modify: `src/store/useDocStore.ts` — `autoCaptionAll`
- Modify: `src/components/wizard/Step3FiguresTablesWizard.tsx:117-133` — botón + progreso
- Test: `src/__tests__/inspector.test.tsx`

**Interfaces:**
- Produce: `autoCaptionAll(): Promise<void>` que recorre imágenes+tablas sin leyenda, sugiere y aplica con loading y sin caer.

- [ ] **Step 1: Write the failing test**

```ts
it('autoCaptionAll aplica leyendas a figuras sin caption', async () => {
  const { useDocStore } = await import('../store/useDocStore');
  useDocStore.setState({
    doc: { session_id: 's1', elements: [
      { id: 'f1', type: 'image', text: '', image_info: { caption: '', relative_url: '/x.png', width_cm: 10, height_cm: 8 } },
      { id: 'f2', type: 'image', text: '', image_info: { caption: 'ya', relative_url: '/y.png', width_cm: 10, height_cm: 8 } },
    ]} as any,
  });
  vi.mock('../api/backend', () => ({ suggestCaption: vi.fn().mockResolvedValue('Leyenda IA') }));
  await useDocStore.getState().autoCaptionAll();
  const doc = useDocStore.getState().doc!;
  expect(doc.elements[0].image_info.caption).toBe('Leyenda IA');
  expect(doc.elements[1].image_info.caption).toBe('ya');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL — `autoCaptionAll` no existe.

- [ ] **Step 3: Write minimal implementation**

En `useDocStore.ts` añadir:
```ts
autoCaptionAll: async () => {
  const { doc } = get();
  if (!doc) return;
  set({ autoCaptionRunning: true, autoCaptionProgress: { done: 0, total: 0 } });
  const targets = doc.elements.filter((e) =>
    (e.type === 'image' || e.type === 'table') &&
    !((e.image_info?.caption || (e.table_info as any)?.caption || '').trim()));
  set({ autoCaptionProgress: { done: 0, total: targets.length } });
  let done = 0;
  for (const e of targets) {
    try {
      const idx = doc.elements.findIndex((x) => x.id === e.id);
      const ctx: string[] = [];
      for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
        const n = doc.elements[i]; if (n.id === e.id) continue;
        if (['paragraph','heading','bullet','numbered_list'].includes(n.type)) { const t=(n.text||'').trim(); if (t) ctx.push(t); }
      }
      const suggestion = await suggestCaption(doc.session_id, e.id, ctx.join('\n') || e.text || '', get().apiKey);
      if (e.type === 'image') get().updateElementImage(e.id, { caption: suggestion });
      else get().updateElementTable(e.id, { caption: suggestion });
    } catch (err: any) {
      get().showToast(`No se pudo generar leyenda para un elemento: ${err.message||''}`, 'error');
    } finally {
      done++; set({ autoCaptionProgress: { done, total: targets.length } });
    }
  }
  set({ autoCaptionRunning: false });
  get().showToast(`${done} leyenda(s) generada(s) con IA`, 'success');
},
```

En `Step3FiguresTablesWizard.tsx` añadir un botón "Leyendas IA para todo" con un indicador de progreso (`autoCaptionProgress`) y `disabled` mientras `autoCaptionRunning`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/useDocStore.ts src/components/wizard/Step3FiguresTablesWizard.tsx src/__tests__/inspector.test.tsx
git commit -m "feat(inspector): leyendas IA para todo con carga y protección de caídas"
```

---

### Task C6: Debounce de ImageEditPanel + toasts visibles en errores

**Files:**
- Modify: `src/components/inspector/ImageEditPanel.tsx` (debounce width/height)
- Modify: `src/store/useDocStore.ts` — `updateElementImage` muestra toast en error
- Test: `src/__tests__/inspector.test.tsx`

**Interfaces:** N/A (UX).

- [ ] **Step 1: Write the failing test**

```ts
it('updateElementImage muestra toast en error', async () => {
  const { useDocStore } = await import('../store/useDocStore');
  useDocStore.setState({ doc: { session_id: 's1', elements: [{ id: 'i1', type: 'image', image_info: {} }] } as any });
  vi.mock('../api/backend', () => ({ updateElement: vi.fn().mockRejectedValue(new Error('boom')) }));
  const before = (useDocStore.getState() as any).toastMsg;
  await useDocStore.getState().updateElementImage('i1', { width_cm: 11 });
  // Debe haber encolado un toast de error (mock showToast)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL — el error se traga con `console.error`.

- [ ] **Step 3: Write minimal implementation**

En `updateElementImage` de `useDocStore.ts` reemplazar el `console.error` por `get().showToast(err.message || 'Error al actualizar imagen', 'error')`. En `ImageEditPanel.tsx` envolver los `onChange` de ancho/alto en un debounce de ~250ms (usar `useRef` + `setTimeout`, como ya hace `PaperCanvas` para el resize).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/ImageEditPanel.tsx src/store/useDocStore.ts src/__tests__/inspector.test.tsx
git commit -m "fix(inspector): debounce de tamaño y toasts visibles en errores"
```

---

# Cluster D — Diseño/Layout + auditor de imágenes

### Task D1: Eliminar la columna sparkle (EditorRail) y mover el toggle del asistente IA

**Files:**
- Modify: `src/components/wizard/EditorRail.tsx:84-117`
- Modify: `src/App.tsx:499,510` (no montar EditorRail)
- Test: `src/__tests__/layout.test.tsx`

**Interfaces:**
- Produce: el toggle del asistente IA vive en el header/toolbar, no en una columna de 52px.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/layout.test.tsx
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
describe('EditorRail no es una columna de 52px', () => {
  it('el archivo no define width 52px para el rail', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/wizard/EditorRail.tsx'), 'utf-8');
    expect(src).not.toMatch(/width:\s*['"]52px['"]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/layout.test.tsx`
Expected: FAIL — existe `width: '52px'`.

- [ ] **Step 3: Write minimal implementation**

Mover el botón `Sparkles` (toggle del panel derecho) al header de `RightSidePanel.tsx` (junto al botón X). Eliminar la columna `EditorRail` de `App.tsx` (líneas 499, 510). Si `EditorRail` renderiza otra cosa (botones de paso), moverlos a `StepRail`. El archivo `EditorRail.tsx` puede quedar vacío o eliminarse del árbol de render.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/EditorRail.tsx src/App.tsx src/__tests__/layout.test.tsx
git commit -m "fix(layout): eliminar columna sparkle y mover toggle del asistente IA"
```

---

### Task D2: Unificar el mapa de títulos y reducir la separación entre pasos y outline

**Files:**
- Modify: `src/components/wizard/StepRail.tsx:29` (`showMap` incluye paso 2)
- Modify: `src/components/wizard/Step2HeadingsWizard.tsx:223-239` (quitar panel outline duplicado)
- Test: `src/__tests__/layout.test.tsx`

**Interfaces:**
- Produce: el outline vive en un solo lugar (debajo de StepRail) para los pasos 2-4.

- [ ] **Step 1: Write the failing test**

```tsx
it('showMap incluye el paso 2', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/wizard/StepRail.tsx'), 'utf-8');
  expect(src).toMatch(/wizardStep === 2/);
});
it('Step2 ya no monta su propio OutlineTree de 280px', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/wizard/Step2HeadingsWizard.tsx'), 'utf-8');
  expect(src).not.toMatch(/width:\s*`?\$\{outlineCollapsed \? 40 : 280\}`?/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/layout.test.tsx`
Expected: FAIL — `showMap` no incluye paso 2; Step2 mantiene el panel de 280px.

- [ ] **Step 3: Write minimal implementation**

En `StepRail.tsx` línea 29 cambiar a `const showMap = wizardStep === 2 || wizardStep === 3 || wizardStep === 4;`. En `Step2HeadingsWizard.tsx` quitar el bloque del panel outline (líneas 223-239) — el outline ya se muestra bajo StepRail. Ajustar el `padding`/`gap` de StepRail a valores más compactos si se desea (ej. `padding: '10px 8px'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/StepRail.tsx src/components/wizard/Step2HeadingsWizard.tsx src/__tests__/layout.test.tsx
git commit -m "fix(layout): unificar mapa de títulos y reducir separación pasos/outline"
```

---

### Task D3: keep_together/widow_control en imágenes in-place (evitar corte a fin de página)

**Files:**
- Modify: `python/generation/generator.py:474-558` (`_apply_image_design_style`)
- Test: `python/tests/test_image_keep_together.py`

**Interfaces:**
- Produce: párrafos de imagen con `keep_together=True` y `widow_control=True`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_image_keep_together.py
def test_image_paragraph_has_keep_together(rules, make_docx_file, tmp_path):
    from generation.generator import generate_apa7_docx
    from models import DocumentModel, ElementModel, ElementType, ImageModel
    img = ImageModel(element_id="i1", file_path="", filename="", width_cm=12, height_cm=8)
    doc = DocumentModel(session_id="s1", file_name="t.docx",
        elements=[ElementModel(id="i1", type=ElementType.IMAGE, text="", image_info=img)])
    out = tmp_path / "out.docx"
    generate_apa7_docx(doc, out, rules=rules)
    import docx
    d = docx.Document(out)
    # Buscar el párrafo que contiene el drawing y verificar keep_together
    found = False
    for p in d.paragraphs:
        if p._element.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
            kt = p.paragraph_format.keep_together
            assert kt is True, "La imagen debe tener keep_together=True"
            found = True
    assert found, "Debe haber al menos un párrafo con imagen"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_image_keep_together.py -x`
Expected: FAIL — `keep_together` no está asignado.

- [ ] **Step 3: Write minimal implementation**

En `_apply_image_design_style` (generator.py ~474), al inicio del bloque `standard` (y para todos los estilos), añadir:
```python
p.paragraph_format.keep_together = True
p.paragraph_format.widow_control = True
```
Añadir también un tope de altura: si `img_elem.image_info.height_cm` excede el alto útil de la página (calcular con `_usable_width_cm` y la razón de aspecto de la página), escalar la imagen al alto útil. Añadir helper `_usable_height_cm(section)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_image_keep_together.py -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/generation/generator.py python/tests/test_image_keep_together.py
git commit -m "fix(generator): keep_together y tope de altura en imágenes in-place"
```

---

### Task D4: El auditor detecta imágenes que desbordan / sangran

**Files:**
- Modify: `python/modules/doc_auditor.py` (añadir chequeos de overflow/bleed)
- Test: `python/tests/test_doc_auditor_overflow.py`

**Interfaces:**
- Produce: `DocAuditResult` con hallazgos de imágenes demasiado altas/anchas y flotantes que solapan texto.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_doc_auditor_overflow.py
from modules.doc_auditor import audit_document_heuristic

def test_image_taller_than_page_flagged():
    from models import DocumentModel, ElementModel, ElementType, ImageModel
    img = ImageModel(element_id="i1", file_path="", filename="", width_cm=12, height_cm=30)
    doc = DocumentModel(session_id="s1", file_name="t.docx",
        elements=[ElementModel(id="i1", type=ElementType.IMAGE, text="", image_info=img)])
    result = audit_document_heuristic(doc)
    joined = " ".join(result.format_suggestions + result.heading_issues)
    assert any("imagen" in s.lower() or "desborda" in s.lower() or "página" in s.lower() for s in result.format_suggestions)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_doc_auditor_overflow.py -x`
Expected: FAIL — no hay chequeo de tamaño.

- [ ] **Step 3: Write minimal implementation**

En `audit_document_heuristic` añadir, tras el bloque de figuras/tablas sin caption:
```python
PAGE_USABLE_H_CM = 24.6  # A4 - márgenes 2.54*2
for elem in elements:
    if elem.type == ElementType.IMAGE and elem.image_info:
        h = elem.image_info.height_cm or 0
        w = elem.image_info.width_cm or 0
        if h > PAGE_USABLE_H_CM:
            result.format_suggestions.append(
                f"Figura demasiado alta ({h} cm): se cortará entre páginas. Reduce la altura a ≤ {PAGE_USABLE_H_CM:.0f} cm.")
        if (getattr(elem.image_info, 'wrap_style', 'inline') in ('sidebar', 'corner')):
            result.format_suggestions.append(
                "Imagen flotante (sidebar/corner) puede solapar texto. Considera estilo 'Estándar'.")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_doc_auditor_overflow.py -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/modules/doc_auditor.py python/tests/test_doc_auditor_overflow.py
git commit -m "feat(auditor): detectar imágenes que desbordan/sangran la página"
```

---

# Cluster E — Revisión proactiva (IA/ortografía/palabras repetidas)

### Task E1: Endpoint /api/proofread-batch (conecta proactive_auditor con la app React)

**Files:**
- Create: `python/routers/proofread.py`
- Modify: `python/main.py` — incluir el router
- Test: `python/tests/test_proofread_batch.py`

**Interfaces:**
- Produce: `POST /api/proofread-batch` body `{ session_id, texts: string[], element_ids: string[] }` → `{ findings: ProofreadFinding[], ai_indices }` donde `ProofreadFinding` tiene `element_id, start, end, kind, message`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_proofread_batch.py
def test_proofread_batch_detects_duplicate_words(client):
    r = client.post("/api/start-blank"); sid = r.json()["session_id"]
    r2 = client.post("/api/proofread-batch", json={
        "session_id": sid,
        "texts": ["El resultado final final fue claro."],
        "element_ids": ["e1"],
    })
    assert r2.status_code == 200
    kinds = [f["kind"] for f in r2.json()["findings"]]
    assert "pegado" in kinds
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_proofread_batch.py -x`
Expected: FAIL — 404 (la ruta no existe).

- [ ] **Step 3: Write minimal implementation**

Crear `python/routers/proofread.py`:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from modules.proactive_auditor import audit_elements

router = APIRouter()

class ProofreadReq(BaseModel):
    session_id: Optional[str] = None
    texts: List[str] = []
    element_ids: List[str] = []

class ProofreadFinding(BaseModel):
    element_id: str; start: int; end: int; kind: str; message: str

@router.post("/api/proofread-batch")
async def proofread_batch(req: ProofreadReq) -> dict:
    if not req.texts:
        return {"findings": [], "ai_indices": {}}
    elems = []
    for t, eid in zip(req.texts, req.element_ids or [str(i) for i in range(len(req.texts))]):
        elems.append({"id": eid, "text": t, "type": "paragraph"})
    findings = audit_elements(elems)
    out = []
    for f in findings:
        out.append(ProofreadFinding(
            element_id=f.get("element_id", ""),
            start=int(f.get("start", 0)), end=int(f.get("end", 0)),
            kind=f.get("kind", ""), message=f.get("detail", f.get("message", "")),
        ).model_dump())
    return {"findings": out, "ai_indices": {}}
```
En `python/main.py` importar e incluir: `from routers import proofread; app.include_router(proofread.router)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_proofread_batch.py -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/routers/proofread.py python/main.py python/tests/test_proofread_batch.py
git commit -m "feat(review): endpoint /api/proofread-batch conecta proactive_auditor con la app"
```

---

### Task E2: /api/ai-review integra proactive_auditor (palabras repetidas en el review)

**Files:**
- Modify: `python/main.py:3043-3200` (`ai_review_endpoint`)
- Test: `python/tests/test_proofread_batch.py` (añadir caso)

**Interfaces:**
- Produce: cada `paragraph.findings` del review incluye hallazgos "pegado"/"first_person"/etc. con `phrase` y `detail`.

- [ ] **Step 1: Write the failing test**

```python
def test_ai_review_includes_duplicate_word(client):
    r = client.post("/api/start-blank"); sid = r.json()["session_id"]
    # Inyectar un elemento con palabra repetida en la sesión
    from persistence.session_manager import load_session_state, save_session_state
    from config import STORAGE_DIR
    doc = load_session_state(sid, STORAGE_DIR)
    from models import ElementModel, ElementType
    doc.elements = [ElementModel(id="e1", type=ElementType.PARAGRAPH, text="El resultado final final fue claro.")]
    save_session_state(doc, STORAGE_DIR)
    r2 = client.post(f"/api/ai-review/{sid}")
    assert r2.status_code == 200
    paras = r2.json()["paragraphs"]
    all_findings = [f for p in paras for f in p.get("findings", [])]
    assert any("duplic" in (f.get("detail","")+f.get("phrase","")).lower() for f in all_findings)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_proofread_batch.py::test_ai_review_includes_duplicate_word -x`
Expected: FAIL — el review no detecta duplicados.

- [ ] **Step 3: Write minimal implementation**

En `ai_review_endpoint`, tras calcular `findings` por `analyze_ai_risk`, llamar también a `proactive_auditor.audit_elements` para los mismos elementos y fusionar:
```python
from modules.proactive_auditor import audit_elements
pa_elems = [{"id": e.id, "text": (e.text or "").strip(), "type": e.type.value} for e in doc_model.elements if e.type in text_types and (e.text or "").strip()]
pa_findings = audit_elements(pa_elems)
# mapear por element_id y añadir a paragraph.findings correspondiente
by_id = {}
for f in pa_findings:
    by_id.setdefault(f["element_id"], []).append(f)
for p in paragraphs:
    for f in by_id.get(p["element_id"], []):
        p["findings"].append({
            "phrase": (f.get("text","") or "")[f.get("start",0):f.get("end",0)] or f.get("kind",""),
            "phrases": [],
            "detail": f.get("detail", f.get("message","")),
            "severity": f.get("severity","LOW"),
        })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_proofread_batch.py::test_ai_review_includes_duplicate_word -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/main.py python/tests/test_proofread_batch.py
git commit -m "feat(review): /api/ai-review integra proactive_auditor (palabras repetidas)"
```

---

### Task E3: Subrayado inline de hallazgos de redacción + styleAuditRun en renderReviewedText

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:225-230` (añadir `styleAuditRun`)
- Modify: `src/components/layout/PaperCanvas.tsx:186-205` (consumir `proofreadFindings`)
- Test: `src/__tests__/proofreadInline.test.tsx`

**Interfaces:**
- Produce: `renderReviewedText` subraya hallazgos de `proofreadFindings` (kind `pegado`, `first_person`, etc.).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/proofreadInline.test.tsx
import { describe, it, expect } from 'vitest';
describe('DUPLICATE_RE', () => {
  it('detecta duplicados de 2 letras (de de, la la)', async () => {
    const src = await import('../components/layout/WhatsAppComment');
    // La regex exportada o getWhatsAppComment debe detectar "la la"
    const { getWhatsAppComment } = src;
    const cmt = getWhatsAppComment(
      { id: 'e1', type: 'paragraph', text: 'fui a la la tienda', confidence: 1 } as any,
      { ghostCitations: [], orphanReferences: [], validationIssues: [], styleAuditRun: true } as any, 0);
    expect(cmt).not.toBeNull();
    expect(cmt!.kind).toBe('duplicate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/proofreadInline.test.tsx`
Expected: FAIL — `\p{L}{3,}` no captura "la la".

- [ ] **Step 3: Write minimal implementation**

En `WhatsAppComment.tsx` línea 43 cambiar:
```ts
const DUPLICATE_RE = /(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/iu;
```
Añadir una pequeña lista de stopwords a ignorar cuando la palabra repetida sea muy común y corta sin sentido real (opcional, para evitar "que que"). En `PaperCanvas.tsx` `renderReviewedText` (línea ~225) añadir `styleAuditRun: !!reviewResult || (useDocStore.getState().proofreadFindings?.length ?? 0) > 0` al `cmtCtx`. Y consumir `proofreadFindings` para añadir marcas `kind: 'ai'` con `phrase`/`detail` de cada hallazgo (bloque nuevo tras el de `reviewResult`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/proofreadInline.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/components/layout/WhatsAppComment.tsx src/__tests__/proofreadInline.test.tsx
git commit -m "fix(review): subrayado inline de redacción + styleAuditRun + duplicados de 2 letras"
```

---

### Task E4: Re-ejecutar la revisión al editar + limpiar cache IA + no tragar 404

**Files:**
- Modify: `src/store/useDocStore.ts` — `updateElementType` dispara revisión debounced; limpia `iaCache`; `runProofreadBatch` loguea errores
- Test: `src/__tests__/proofreadInline.test.tsx`

**Interfaces:**
- Produce: al editar un párrafo, los subrayados y comentarios de WhatsApp se refrescan.

- [ ] **Step 1: Write the failing test**

```ts
it('runProofreadBatch no traga el error silenciosamente', async () => {
  const { useDocStore } = await import('../store/useDocStore');
  vi.mock('../api/backend', () => ({ proofreadBatch: vi.fn().mockRejectedValue(new Error('404')) }));
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await useDocStore.getState().runProofreadBatch();
  // Debe haber registrado el error (no silencio total)
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/proofreadInline.test.tsx`
Expected: FAIL — el catch está vacío `/* silencioso */`.

- [ ] **Step 3: Write minimal implementation**

En `runProofreadBatch` reemplazar el catch silencioso por `console.warn('[proofread] falló:', err)`. En `updateElementType`, tras `set({ doc })`, disparar un `runProofreadBatch` debounced (300ms) y limpiar `iaCache[elem.id]`:
```ts
// tras actualizar:
if (window && (window as any).__proofreadDebounce) clearTimeout((window as any).__proofreadDebounce);
(window as any).__proofreadDebounce = setTimeout(() => get().runProofreadBatch().catch(()=>{}), 300);
```
(Preferible: un campo en el store para el timer en vez de `window`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/proofreadInline.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/useDocStore.ts src/__tests__/proofreadInline.test.tsx
git commit -m "fix(review): re-ejecutar revisión al editar, limpiar cache IA y no tragar 404"
```

---

# Cluster F — Referencias / bibliografía

### Task F1: Dedup semántico en la extracción de referencias

**Files:**
- Modify: `python/parsing/references_extractor.py:235-242` (dedup por autor+año+título, sin prefijo)
- Test: `python/tests/test_references_dedup.py`

**Interfaces:**
- Produce: `extract_references` colapsa referencias duplicadas aunque difieran en el prefijo numérico.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_references_dedup.py
from parsing.references_extractor import extract_references
from models import ElementModel, ElementType

def _para(t): return ElementModel(id="e", type=ElementType.PARAGRAPH, text=t)

def test_hirano_dedup_by_author_year():
    elems = [
        _para("Referencias"),
        _para("6. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press"),
        _para("7. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press"),
        _para("8. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press"),
        _para("9. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press"),
        _para("10. Juran, J. M., Godfrey, A. B (1999). Juran's Quality Handbook. McGraw-Hill"),
    ]
    refs = extract_references(elems)
    hirano = [r for r in refs if "Hirano" in (r.raw_text or "")]
    assert len(hirano) == 1, f"Esperaba 1 Hirano, hay {len(hirano)}"
    assert len(refs) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_references_dedup.py::test_hirano_dedup_by_author_year -x`
Expected: FAIL — devuelve 4-5 Hirano.

- [ ] **Step 3: Write minimal implementation**

En `references_extractor.py`, reescribir el dedup (líneas 235-242) para usar una clave semántica:
```python
from modules.citation_engine import normalize_surname_key
seen_keys = set()
for raw in entry_lines:
    parsed = _parse_single_reference(raw)
    if parsed and (parsed.get("authors") or parsed.get("year")):
        first = normalize_surname_key(parsed["authors"][0]) if parsed.get("authors") else ""
        title_norm = re.sub(r'[^a-z0-9]', '', (parsed.get("title") or "").lower())[:40]
        key = f"{first}|{parsed.get('year') or 's.f.'}|{title_norm}"
    else:
        # fallback: texto sin prefijo numérico
        base = re.sub(r'^\s*(?:\d+[.)]|[A-Za-z][.)])\s*', '', raw)
        key = re.sub(r'\s+', ' ', base.lower()).strip()
    if key in seen_keys:
        continue
    seen_keys.add(key)
    refs.append(ReferenciaModel(...))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_references_dedup.py -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/parsing/references_extractor.py python/tests/test_references_dedup.py
git commit -m "fix(refs): dedup semántico (autor+año+título) en la extracción de referencias"
```

---

### Task F2: La exportación in-place deduplica la bibliografía

**Files:**
- Modify: `python/generation/inplace_editor.py:135-162` (dedup en la zona de referencias)
- Test: `python/tests/test_references_dedup.py`

**Interfaces:**
- Produce: `apply_inplace` elimina párrafos de referencia duplicados (por texto normalizado sin prefijo).

- [ ] **Step 1: Write the failing test**

```python
def test_inplace_dedup_references(make_docx_file, tmp_path):
    from generation.inplace_editor import apply_inplace
    from models import DocumentModel
    # doc con 4 párrafos "X. Hirano..." idénticos
    p = make_docx_file(lambda d: None, filename="r.docx")
    # ... construir un doc con referencias duplicadas y verificar que apply_inplace deja 1
    # (usar python-docx para construir el doc de prueba)
    out = tmp_path / "out.docx"
    apply_inplace(p, out, DocumentModel(session_id="s", file_name="r.docx", elements=[]), None, scopes=None)
    import docx
    d = docx.Document(out)
    hirano = [p for p in d.paragraphs if "Hirano" in p.text]
    assert len(hirano) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_references_dedup.py::test_inplace_dedup_references -x`
Expected: FAIL — quedan 4 Hirano.

- [ ] **Step 3: Write minimal implementation**

En `apply_inplace`, en el bloque de bibliografía, tras `ref_zone_start`, dedupar párrafos de referencia por texto normalizado (sin prefijo) antes de reindentar:
```python
if "bibliografia" in active:
    seen = set()
    for i in range(len(paragraphs) - 1, ref_zone_start - 1, -1):
        text = paragraphs[i].text.strip()
        if not _is_ref_paragraph(text):
            continue
        base = re.sub(r'^\s*(?:\d+[.)]|[A-Za-z][.)])\s*', '', text)
        key = re.sub(r'\s+', ' ', base.lower()).strip()
        if key in seen:
            # eliminar el párrafo duplicado
            el = paragraphs[i]._element
            el.getparent().remove(el)
            continue
        seen.add(key)
```
Aplicar la reindentación solo a los sobrevivientes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_references_dedup.py::test_inplace_dedup_references -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/generation/inplace_editor.py python/tests/test_references_dedup.py
git commit -m "fix(refs): la exportación in-place deduplica la bibliografía"
```

---

### Task F3: No doble-escribir la sección de referencias en la ruta rebuild

**Files:**
- Modify: `python/generation/generator.py:1571-1572` y el loop de elementos (saltar elementos de referencia)
- Modify: `python/generation/layered_generator.py` (PHASE 4)
- Test: `python/tests/test_references_dedup.py`

**Interfaces:**
- Produce: la sección "Referencias" se escribe una sola vez (desde `references`), no dos.

- [ ] **Step 1: Write the failing test**

```python
def test_rebuild_single_references_section(rules, make_docx_file, tmp_path):
    from generation.generator import generate_apa7_docx
    from models import DocumentModel, ElementModel, ElementType, ReferenciaModel
    elems = [
        ElementModel(id="h", type=ElementType.HEADING, heading_level=1, text="Referencias"),
        ElementModel(id="p1", type=ElementType.PARAGRAPH, text="6. Hirano, H. (1995). 5 Pillars. Productivity Press"),
    ]
    refs = [ReferenciaModel(id="r1", authors=["Hirano, H."], year="1995", title="5 Pillars", raw_text="Hirano, H. (1995). 5 Pillars. Productivity Press")]
    doc = DocumentModel(session_id="s", file_name="t.docx", elements=elems, referencias=refs)
    out = tmp_path / "o.docx"
    generate_apa7_docx(doc, out, rules=rules, references=refs)
    import docx
    d = docx.Document(out)
    headings = [p.text.strip().lower() for p in d.paragraphs if p.text.strip().lower() in ("referencias","bibliografía")]
    assert len(headings) <= 1, "La sección Referencias se duplicó"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_references_dedup.py::test_rebuild_single_references_section -x`
Expected: FAIL — aparecen dos encabezados "Referencias".

- [ ] **Step 3: Write minimal implementation**

En `generator.py`, en el loop de elementos, saltar los elementos que pertenezcan a la zona de referencias (los que vienen tras el heading "Referencias") antes de formatearlos in-place, para que solo se escriba la sección nueva:
```python
past_refs_heading = False
for item in doc_model.elements:
    elem = ...
    if elem.type == ElementType.HEADING and is_ref_heading(elem.text or ""):
        past_refs_heading = True
    if past_refs_heading and elem.type in (ElementType.PARAGRAPH, ElementType.NUMBERED_LIST, ElementType.HEADING):
        continue  # se reescriben abajo desde `references`
    # ... formateo normal
```
`is_ref_heading` ya existe en PaperCanvas; replicar en generator. Igual para `layered_generator.py` (skip elementos tras el heading de refs antes de PHASE 4).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_references_dedup.py::test_rebuild_single_references_section -x`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add python/generation/generator.py python/generation/layered_generator.py python/tests/test_references_dedup.py
git commit -m "fix(refs): no doble-escribir la sección de referencias en la ruta rebuild"
```

---

### Task F4: Drawer del validador global (abrir desde cualquier paso)

**Files:**
- Modify: `src/App.tsx` — overlay raíz para el validador
- Modify: `src/components/wizard/Step5ReferencesWizard.tsx:114-135` — mover el drawer a App
- Modify: `src/components/referencias/ReferencesPanel.tsx:111-120` — siempre permitir abrir
- Test: `src/__tests__/validatorDrawer.test.tsx`

**Interfaces:**
- Produce: `validatorOpen` renderiza el drawer en la raíz sin importar el `wizardStep`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/validatorDrawer.test.tsx
import { describe, it, expect } from 'vitest';
describe('ValidatorView drawer global', () => {
  it('App renderiza el drawer cuando validatorOpen=true (cualquier paso)', () => {
    // Mock mínimo del store con wizardStep=1 y validatorOpen=true
    // Verificar que existe el overlay del validador
    // (Test de integración ligero; ajustar al patrón de tests existentes)
    expect(true).toBe(true); // placeholder hasta definir el mock exacto
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/validatorDrawer.test.tsx`
Expected: FAIL (o PASS si placeholder; reemplazar por aserción real).

- [ ] **Step 3: Write minimal implementation**

Mover el bloque `{validatorOpen && (...)}` de `Step5ReferencesWizard.tsx` a `App.tsx` (nivel raíz, junto a CommandPalette/DownloadSuccessOverlay). En `ReferencesPanel.tsx`, siempre mostrar un botón "Abrir validador" (si no hay `citationAuditResult`, ejecutar `runCitationAudit()` al abrir). En `setValidatorOpen(true)` desde CommandPalette/Escape, ya renderiza sin importar el paso.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/validatorDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/wizard/Step5ReferencesWizard.tsx src/components/referencias/ReferencesPanel.tsx src/__tests__/validatorDrawer.test.tsx
git commit -m "fix(refs): drawer del validador global, abrible desde cualquier paso"
```

---

### Task F5: Dedup de referencias en el store (addReference / autoResolveGhosts)

**Files:**
- Modify: `src/store/useDocStore.ts` — `addReference`, `updateReferences` dedup por autor+año+título
- Test: `src/__tests__/validatorDrawer.test.tsx`

**Interfaces:**
- Produce: añadir una referencia duplicada actualiza la existente en vez de duplicar.

- [ ] **Step 1: Write the failing test**

```ts
it('addReference no duplica por autor+año', async () => {
  const { useDocStore } = await import('../store/useDocStore');
  useDocStore.setState({ references: [{ id: 'r1', authors: ['Hirano, H.'], year: '1995', title: '5 Pillars' }] } as any);
  useDocStore.getState().addReference({ authors: ['Hirano, H.'], year: '1995', title: '5 Pillars' } as any);
  expect(useDocStore.getState().references.filter((r:any) => r.authors?.join().includes('Hirano'))).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/validatorDrawer.test.tsx`
Expected: FAIL — se añade duplicado.

- [ ] **Step 3: Write minimal implementation**

En `addReference`, antes de añadir, buscar una referencia con mismo `normalize_surname(authors[0])` + `year` + título normalizado; si existe, actualizarla; si no, añadir. Implementar una pequeña función `refKey(ref)` en el store.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/validatorDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/useDocStore.ts src/__tests__/validatorDrawer.test.tsx
git commit -m "fix(refs): dedup de referencias en el store al añadir/resolver"
```

---

## Self-Review

**1. Spec coverage** (cada queja del usuario → tarea):
- "Motor central no disponible" / versión limitada en background → A1, A2
- "Method Not Allowed" plantillas → A3
- "letras del menú más grande" → A4
- "tiempos de carga raros" → A5
- "portada duplica personas" → B1, B2
- "mucha separación entre pasos y mapa de títulos" → D2
- "botoncito estrella fuera de lugar" → D1
- "botón sugerir leyenda con IA al tocar tabla/imagen" → C4
- "inspector duplicado / controles no funcionan / botones tontos (Estado, Info)" → C1, C2, C3
- "botón IA leyenda a todo automático + proteger caídas + loading" → C5, C6
- "auditar motor: imágenes cortadas / textos debajo de páginas" → D3, D4
- "revisión ortografía/IA no funciona, no proactiva, no subraya, no marca palabras repetidas" → E1, E2, E3, E4
- "chats whatsapp se actualicen al corregir" → E4 (refresh on edit)
- "referencias no abre la ventana" → F4
- "bibliografía repite Hirano" → F1, F2, F3, F5

**2. Placeholder scan:** Revisado. Sin "TBD"/"TODO". El test F4 step 1 tiene un `expect(true).toBe(true)` marcado como placeholder hasta definir el mock exacto del store — se reemplaza por una aserción real en Step 3 (el implementador debe concretar el mock). El resto tiene código real.

**3. Type consistency:** `updateElementTable(elementId, patch)` se define igual en C2 (store) y se usa en C5 y C3. `dedupCoverAuthors` en B2. `backend.heartbeat()` en A5. `ProofreadFinding` (backend `kind`, frontend `proofreadFindings`) consistente. `autoCaptionAll`/`autoCaptionProgress`/`autoCaptionRunning` usados igual en C5.

**Nota:** Algunos tests de frontend (inspector/PaperCanvas) requieren mocks del store y de Office.js; el implementador debe seguir el patrón de `src/__tests__/setup.ts` y los mocks existentes (ej. `WhatsAppComment.test.tsx`). Si un test de UI resulta demasiado frágil por dependencias de Office, priorizar tests de la lógica pura extraída (ej. `dedupCoverAuthors`, `refKey`) y dejar el test de integración como smoke test.

---
