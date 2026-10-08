# WordAPA7 Corrección Integral de Fallos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los fallos reportados por el usuario en 6 subsistemas (add-in offline, portada duplicada, inspector roto, diseño/layout, revisión proactiva de escritura, referencias) dejando cada subsistema funcionando y testeado.

**Architecture:** App Electron + React (Zustand) + backend FastAPI (Python) + Word Add-in (Office.js). El frontend vive en `src/`, el add-in en `word-addin/src/taskpane/`, el backend en `python/`. Los tests frontend usan Vitest (`src/__tests__/`); los backend usan pytest (`python/tests/`). Cada clúster (A–F) produce software testeable de forma independiente, por lo que pueden ejecutarse en orden o en paralelo entre clústeres.

**Tech Stack:** React 18, Zustand, TypeScript, Vite, Vitest; FastAPI, python-docx, pytest; Office.js (Word Add-in).

## Global Constraints

- Python >= 3.11. Tests backend: `cd python && python -m pytest tests/<test>.py -v` (usar `venv` si existe). Tests frontend: `npx vitest run src/__tests__/<test>.test.tsx`.
- No romper tests existentes: tras cada tarea ejecuta el test afectado Y el clúster relacionado.
- Idioma de UI/mensajes: español (mantener tono existente).
- Commits en español, prefijo `fix:`/`feat:` según corresponda. Un commit por tarea.
- No usar emojis en código salvo que existan en el componente (WhatsApp comments usan emojis por diseño).
- El backend corre en `127.0.0.1:8742` (HTTPS por defecto en Windows). El add-in descubre el backend via `word-addin/src/taskpane/api/backend.ts`.

## Scope Note

Este plan cubre 6 subsistemas. Son mayormente independientes; si se prefiere, cada cluster (A-F) puede ejecutarse como un sub-plan separado. Cada cluster produce software que compila y pasa sus tests por si mismo.

---

## File Structure (Resumen de archivos a tocar)

**Cluster A - Add-in offline / motor central / plantillas / fuentes / carga**
- Modify: `word-addin/src/taskpane/office/masterNormalizer.ts` (degradación offline)
- Modify: `word-addin/src/taskpane/office/coverGuard.ts` (fallback de zonas)
- Modify: `word-addin/src/taskpane/components/LiveAssistantPanel.tsx` (re-exponer `onFormatAll`)
- Modify: `word-addin/src/taskpane/api/backend.ts` (heartbeat reutilizable, `probeLocalBackend`)
- Modify: `word-addin/src/taskpane/App.tsx` (heartbeat via backend.ts, unificar polling)
- Modify: `word-addin/src/taskpane/liveAssistant.ts` (eliminar polling duplicado)
- Modify: `word-addin/src/taskpane/styles/taskpane.css` (tipografías más grandes)
- Create: `word-addin/src/taskpane/office/masterNormalizer.test.ts`
- Create: `word-addin/src/taskpane/api/backend.test.ts`

**Cluster B - Portada duplicada**
- Modify: `python/parsing/xml_deep_parser.py` (guard mc:Fallback al extraer texto de parrafo con textbox)
- Modify: `python/parsing/docx_parser.py` (dedup de elementos de portada por texto)
- Modify: `src/components/layout/PaperCanvas.tsx` (dedup de `coverAuthorTexts`)
- Create: `python/tests/test_cover_author_dedup.py`

**Cluster C - Inspector roto**
- Modify: `src/components/inspector/ElementInspector.tsx` (eliminar panel duplicado, quitar Estado/Info, arreglar mutación directa)
- Modify: `src/App.tsx` (única instancia de `ImageEditPanel`)
- Modify: `src/store/useDocStore.ts` (acción `updateElementTable`, toasts de error)
- Modify: `python/main.py` (`UpdateElementRequest` + `table_info`; arreglar `ExplainElementRequest`)
- Modify: `src/components/layout/PaperCanvas.tsx` (botón flotante "Sugerir leyenda con IA" en tabla)
- Modify: `src/components/inspector/ImageEditPanel.tsx` (debounce)
- Modify: `src/components/wizard/Step3FiguresTablesWizard.tsx` (botón "Auto-leyenda todo")
- Modify: `src/api/backend.ts` (enviar `table_info`; arreglar `explainElement`)
- Create: `src/__tests__/inspector.test.tsx`
- Create: `python/tests/test_update_element_table.py`

**Cluster D - Diseño / layout / auditor de imágenes**
- Modify: `src/components/wizard/EditorRail.tsx` (eliminar/fusionar botón estrella)
- Modify: `src/components/wizard/StepRail.tsx` (extender `showMap` al paso 2)
- Modify: `src/components/wizard/Step2HeadingsWizard.tsx` (quitar panel outline de 280px)
- Modify: `python/generation/generator.py` (`_apply_image_design_style` keep_together/widow; altura máx)
- Modify: `python/modules/doc_auditor.py` (chequeos de overflow/bleed de imágenes)
- Create: `python/tests/test_image_keep_together.py`
- Create: `python/tests/test_doc_auditor_overflow.py`

**Cluster E - Revisión proactiva de escritura / IA**
- Create: `python/routers/proofread.py` (endpoint `/api/proofread-batch`)
- Modify: `python/main.py` (montar router; `/api/ai-review` integra proactive_auditor)
- Modify: `src/components/layout/PaperCanvas.tsx` (`styleAuditRun` en `renderReviewedText`; auto re-review on edit)
- Modify: `src/components/layout/WhatsAppComment.tsx` (`DUPLICATE_RE` >=2 letras)
- Modify: `src/store/useDocStore.ts` (no tragar 404; limpiar `iaCache` al editar)
- Create: `python/tests/test_proofread_batch.py`

**Cluster F - Referencias / bibliografía**
- Modify: `python/parsing/references_extractor.py` (dedup semántico author+year+title)
- Modify: `python/generation/inplace_editor.py` (dedup de bibliografía in-place)
- Modify: `python/generation/generator.py` + `layered_generator.py` (no doble escritura de refs)
- Modify: `src/components/wizard/Step5ReferencesWizard.tsx` (drawer global)
- Modify: `src/App.tsx` (renderizar `ValidatorView` a nivel raiz)
- Modify: `src/components/referencias/ReferencesPanel.tsx` (siempre permitir abrir validador)
- Modify: `src/store/useDocStore.ts` (dedup en `addReference`)
- Create: `python/tests/test_references_dedup.py`

---

# CLUSTER A - Add-in offline, "Motor central", plantillas, fuentes y carga

## Task A1: Degradación offline del masterNormalizer (no exigir motor central)

**Files:**
- Modify: `word-addin/src/taskpane/office/masterNormalizer.ts:65-77`
- Modify: `word-addin/src/taskpane/office/coverGuard.ts:38-60`
- Test: `word-addin/src/taskpane/office/masterNormalizer.test.ts`

**Interfaces:**
- Consumes: `getCoverZones(force?: boolean): Promise<CoverZones | null>` from `coverGuard.ts`; `formatDocumentAPA7()` local from `wordHelper.ts`.
- Produces: `normalizeEntireDocumentAPA7(onProgress?)` que NUNCA lanza "Motor central no disponible"; aplica formato local cuando el core está caído. `NormalizationReport` gana campo `fallbackUsed?: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// word-addin/src/taskpane/office/masterNormalizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./coverGuard', () => ({
  getCoverZones: vi.fn().mockResolvedValue(null), // backend caído
}))
vi.mock('./wordHelper', () => ({
  formatDocumentAPA7: vi.fn().mockResolvedValue(undefined),
  getDocumentText: vi.fn().mockResolvedValue('texto de prueba'),
}))

describe('normalizeEntireDocumentAPA7 offline', () => {
  beforeEach(() => vi.clearAllMocks())
  it('no lanza "Motor central" cuando el backend está caído (aplica fallback local)', async () => {
    const { normalizeEntireDocumentAPA7 } = await import('./masterNormalizer')
    const report = await normalizeEntireDocumentAPA7()
    expect(report).toBeDefined()
    expect(report.fallbackUsed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/office/masterNormalizer.test.ts`
Expected: FAIL - `normalizeEntireDocumentAPA7` lanza el error "Motor central no disponible".

- [ ] **Step 3: Write minimal implementation**

En `masterNormalizer.ts`, reemplazar el bloque que lanza (lineas ~65-77) por un fallback:

```ts
export async function normalizeEntireDocumentAPA7(
  onProgress?: (step: string, percent: number) => void
): Promise<NormalizationReport> {
  onProgress?.('Consultando zonas al motor central...', 8)
  const zones = await getCoverZones(true)
  if (!zones) {
    // Degradación acordada: versión limitada local sin renderizar.
    onProgress?.('Motor central no disponible — aplicando formato local limitado…', 20)
    await import('./wordHelper').then((m) => m.formatDocumentAPA7())
    onProgress?.('Formato local aplicado', 100)
    return { fallbackUsed: true, applied: [], skipped: [] } as NormalizationReport
  }
  // ... resto del flujo existente con `zones` ...
}
```

Asegurar que `NormalizationReport` acepte `fallbackUsed?: boolean` (añadir al tipo si no existe).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/office/masterNormalizer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/office/masterNormalizer.ts word-addin/src/taskpane/office/masterNormalizer.test.ts
git commit -m "fix(addin): el normalizador degrada a formato local cuando el motor central está caído"
```

## Task A2: Re-exponer el botón de formato local en el panel del add-in

**Files:**
- Modify: `word-addin/src/taskpane/components/LiveAssistantPanel.tsx:49-60,206-211`
- Test: `word-addin/src/taskpane/components/LiveAssistantPanel.test.tsx`

**Interfaces:**
- Consumes: prop `onFormatAll: () => void` (ya pasada desde `App.tsx:255`).
- Produces: un botón "Formatear (modo local)" visible que llama `onFormatAll`.

- [ ] **Step 1: Write the failing test**

```tsx
// LiveAssistantPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
// Mockear los iconos usados por el panel segun los nombres exportados en ./Icons
vi.mock('./Icons', () => ({
  ZapIcon: () => null, FileTextIcon: () => null, CheckCircleIcon: () => null,
  AlertCircleIcon: () => null, SparklesIcon: () => null,
}))

describe('LiveAssistantPanel botón modo local', () => {
  it('muestra y dispara el botón de formato local', async () => {
    const onFormatAll = vi.fn()
    const mod = await import('./LiveAssistantPanel')
    const { getByText } = render(
      // @ts-expect-error props parciales para test
      <mod.LiveAssistantPanel onFormatAll={onFormatAll} running={true} options={{}} stats={null}
        citationsCount={0} onToggle={() => {}} onOptionChange={() => {}} onScanNow={() => {}}
        auditStatus="idle" auditResult={null} auditNotice={null} showToast={() => {}} />
    )
    const btn = getByText(/Formatear/i)
    fireEvent.click(btn)
    expect(onFormatAll).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/components/LiveAssistantPanel.test.tsx`
Expected: FAIL - no existe el botón "Formatear".

- [ ] **Step 3: Write minimal implementation**

En `LiveAssistantPanel.tsx`, añadir `onFormatAll` a la desestructuración (linea 49) y un botón antes del botón master:

```tsx
<button type="button" className="btn btn-sm" onClick={onFormatAll}
  title="Aplica formato APA 7 básico localmente (Times New Roman, interlineado, sangría) sin el motor central">
  Formatear (modo local)
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/components/LiveAssistantPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/components/LiveAssistantPanel.tsx word-addin/src/taskpane/components/LiveAssistantPanel.test.tsx
git commit -m "feat(addin): botón de formato local visible en el panel del asistente"
```

## Task A3: Plantillas - reconstruir add-in y verificar flujo client-side (fin de Method Not Allowed)

**Files:**
- Verify: `word-addin/src/taskpane/components/TemplatesPanel.tsx:115-181` (ya es 100% client-side)
- Verify: `python/main.py:726,2493,2524,2576` (rutas de plantilla: GET vs POST)
- Test: `word-addin/src/taskpane/components/TemplatesPanel.test.tsx`

**Contexto:** El 405 "Method Not Allowed" viene de un bundle del add-in STALE que llamaba rutas backend con metodo incorrecto. El codigo fuente actual de `TemplatesPanel.tsx` ya es client-side (usa `Word.run`), por lo que la correccion es: (a) añadir un test que garantice que `TemplatesPanel` NO hace `fetch`/`backend.*` a rutas de plantilla, y (b) asegurar el rebuild+redeploy.

- [ ] **Step 1: Write the regression test**

```tsx
// TemplatesPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'

describe('TemplatesPanel no llama al backend', () => {
  it('no hace fetch a /api/template* ni /api/apply-template', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    global.fetch = fetchSpy as any
    const WordMock = { run: async (cb: any) => {
      const ctx = { document: { body: { insertParagraph: () => ({}) }, sync: async () => {} } }
      await cb(ctx)
    }}
    ;(global as any).Word = WordMock
    await import('./TemplatesPanel')
    const templateCalls = fetchSpy.mock.calls.filter((c: any[]) =>
      /\/api\/(template|apply-template|create-from-template)/.test(String(c[0])))
    expect(templateCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test**

Run: `cd word-addin && npx vitest run src/taskpane/components/TemplatesPanel.test.tsx`
Expected: PASS (el codigo fuente ya es correcto) - confirma que el problema era el bundle stale.

- [ ] **Step 3: Rebuild add-in (documentar el paso de deploy)**

Añadir nota en el commit de que debe ejecutarse `npm run build:addin` y sincronizar `word-addin/dist/` con `resources/addin/` del paquete. No hay cambio de codigo fuente; este test es la red de seguridad.

- [ ] **Step 4: Commit**

```bash
git add word-addin/src/taskpane/components/TemplatesPanel.test.tsx
git commit -m "test(addin): garantiza que TemplatesPanel no llama al backend (fin de 405 Method Not Allowed)"
```

## Task A4: Tipografías más grandes en el menu/carga del add-in

**Files:**
- Modify: `word-addin/src/taskpane/styles/taskpane.css:113,84,145,280,195,175,230`
- Test: `word-addin/src/taskpane/styles/taskpane.test.ts`

**Interfaces:**
- Produce: reglas `.tab`, `.app-header__status`, `.mascot-bubble__text`, `.card__subtitle`, `.btn-sm` con tipografías más grandes.

- [ ] **Step 1: Write the failing test**

```ts
// taskpane.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('taskpane.css tipografías', () => {
  const css = fs.readFileSync(path.resolve(__dirname, 'styles/taskpane.css'), 'utf8')
  it('.tab usa al menos 14px', () => {
    const m = css.match(/\.tab\s*{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(14)
  })
  it('.mascot-bubble__text usa al menos 12px', () => {
    const m = css.match(/\.mascot-bubble__text\s*{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(12)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/styles/taskpane.test.ts`
Expected: FAIL - `.tab` es 11.5px, `.mascot-bubble__text` es 11.5px.

- [ ] **Step 3: Write minimal implementation**

En `taskpane.css`, actualizar:
- `.tab { font-size: 14px; padding: 8px 12px; }`
- `.app-header__status { font-size: 13px; }`
- `.card__subtitle { font-size: 12.5px; }`
- `.mascot-bubble__text { font-size: 12.5px; }`
- `.btn-sm { font-size: 12px; }`
- `.stat-chip__label { font-size: 10.5px; }`
- `.finding-item__badge { font-size: 10.5px; }`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/styles/taskpane.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/styles/taskpane.css word-addin/src/taskpane/styles/taskpane.test.ts
git commit -m "fix(addin): tipografías del menu y carga más grandes y legibles"
```

## Task A5: Heartbeat via backend.ts + colapsar polling duplicado (cargas raras)

**Files:**
- Modify: `word-addin/src/taskpane/api/backend.ts` (añadir `heartbeat()`; reducir fan-out de `probeLocalBackend`)
- Modify: `word-addin/src/taskpane/App.tsx:75-98` (heartbeat y health via backend.ts)
- Modify: `word-addin/src/taskpane/liveAssistant.ts:461-463` (eliminar polling duplicado)
- Test: `word-addin/src/taskpane/api/backend.test.ts`

**Interfaces:**
- Consumes: `ensureBaseUrl()` ya existente; `post(path, body)` helper.
- Produce: `backend.heartbeat(): Promise<void>` que usa la URL descubierta (no hardcoded :8742).

- [ ] **Step 1: Write the failing test**

```ts
// backend.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('backend.heartbeat', () => {
  it('existe y apunta a la ruta de heartbeat', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    global.fetch = fetchSpy as any
    const { backend } = await import('./backend')
    await backend.heartbeat()
    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toContain('/api/addin/heartbeat')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd word-addin && npx vitest run src/taskpane/api/backend.test.ts`
Expected: FAIL - `backend.heartbeat` no existe.

- [ ] **Step 3: Write minimal implementation**

En `backend.ts` añadir:
```ts
export async function heartbeat(): Promise<void> {
  try { await post('/api/addin/heartbeat', {}) } catch { /* silencioso */ }
}
```
Y exportarlo en el objeto `backend`. En `App.tsx`, reemplazar las llamadas hardcoded (lineas 75-76) por `backend.heartbeat()` (tras `await ensureBaseUrl()`). Eliminar el `setInterval` de `liveAssistant.ts` linea 461-463 (dejar que `App.tsx` sea la unica fuente de health). En `backend.ts`, reducir el fan-out de `probeLocalBackend`: probar 8742 primero, y solo ensanchar a 8743-8746 en HTTP si falla; abort timeout 1500ms.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd word-addin && npx vitest run src/taskpane/api/backend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add word-addin/src/taskpane/api/backend.ts word-addin/src/taskpane/App.tsx word-addin/src/taskpane/liveAssistant.ts word-addin/src/taskpane/api/backend.test.ts
git commit -m "fix(addin): heartbeat via backend.ts y polling unificado (cargas más estables)"
```

---

# CLUSTER B - Portada duplicada (autores/integrantes repetidos)

## Task B1: Evitar duplicar texto de textbox al extraer texto de parrafo (guard mc:Fallback)

**Files:**
- Modify: `python/parsing/xml_deep_parser.py` (añadir helper `paragraph_text_without_fallback`)
- Modify: `python/parsing/docx_parser.py` (usar el helper para texto de parrafos de portada)
- Test: `python/tests/test_cover_author_dedup.py`

**Contexto:** `extract_textbox_paragraphs` (xml_deep_parser.py:108) ya salta `mc:Fallback`. Pero la extraccion de `.text` de cada `ElementModel` de portada (parrafos del cuerpo que contienen textboxes) lee AMBAS ramas de `mc:AlternateContent`, duplicando cada autor. El comentario en `src/lib/portadaAuthors.ts:41` ("Los textboxes duplicados del original llegan dos veces - bug reportado") confirma que es conocido.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_cover_author_dedup.py
import io, zipfile
from xml.etree import ElementTree as ET
from lxml import etree
from parsing.xml_deep_parser import paragraph_text_without_fallback

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'

def _docx_xml_with_doubled_textbox():
    return f'''<w:document xmlns:w="{W}" xmlns:mc="{MC}" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>
      <w:p><w:r><w:t>Portada</w:t></w:r></w:p>
      <w:p><mc:AlternateContent>
        <mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Br. Iván Álvarez</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice>
        <mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>Br. Iván Álvarez</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>
      </mc:AlternateContent></w:p>
    </w:body></w:document>'''

def test_paragraph_text_not_doubled_by_fallback():
    root = etree.fromstring(_docx_xml_with_doubled_textbox().encode('utf-8'))
    paras = root.findall(f'{{{W}}}body/{{{W}}}p')
    text = paragraph_text_without_fallback(paras[1])
    assert text.count('Br. Iván Álvarez') == 1, f'Esperado 1 vez, got {text.count("Br. Iván Álvarez")}'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_cover_author_dedup.py -v`
Expected: FAIL - el texto aparece 2 veces (Choice+Fallback).

- [ ] **Step 3: Write minimal implementation**

En `xml_deep_parser.py` añadir:
```python
def paragraph_text_without_fallback(p_element) -> str:
    """Texto de un parrafo EXCLUYENDO la rama mc:Fallback de AlternateContent (evita duplicar textboxes)."""
    MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
    parts = []
    for el in p_element.iter():
        # Saltar cualquier elemento bajo mc:Fallback
        in_fallback = False
        p = el.getparent()
        while p is not None:
            if p.tag == f'{{{MC}}}Fallback':
                in_fallback = True; break
            p = p.getparent()
        if in_fallback:
            continue
        tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
        if tag == 't' and el.text:
            parts.append(el.text)
        elif tag == 'br':
            parts.append('\n')
        elif tag == 'tab':
            parts.append('\t')
    return ''.join(parts)
```
En `docx_parser.py`, donde se construye `elem.text` para los parrafos de portada (cerca de la extraccion de texto del parrafo en `parse_docx_bytes`), usar `paragraph_text_without_fallback(p._element)` en lugar de `p.text` cuando el parrafo pueda contener textboxes. (Localizar el punto exacto leyendo `parse_docx_bytes`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_cover_author_dedup.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/parsing/xml_deep_parser.py python/parsing/docx_parser.py python/tests/test_cover_author_dedup.py
git commit -m "fix(portada): el texto de portada no duplica autores por rama mc:Fallback de textboxes"
```

## Task B2: Dedup de elementos de portada en el preview (defensa en profundidad)

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:895-940` (dedup de `coverAuthorTexts`)
- Test: `src/__tests__/portadaDedup.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// portadaDedup.test.tsx
import { describe, it, expect } from 'vitest'
import { dedupCoverAuthors } from '../components/layout/PaperCanvas'

describe('dedupCoverAuthors', () => {
  it('colapsa autores duplicados por texto normalizado', () => {
    const a = (text: string) => ({ id: text, type: 'portada_block' as const, is_cover_section: true, text })
    const out = dedupCoverAuthors([a('Br. Iván Álvarez\nCarnet: 2022-0215I'), a('Br. Iván Álvarez\nCarnet: 2022-0215I')] as any)
    expect(out).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/portadaDedup.test.tsx`
Expected: FAIL - `dedupCoverAuthors` no existe.

- [ ] **Step 3: Write minimal implementation**

En `PaperCanvas.tsx`, extraer y exportar:
```tsx
export function dedupCoverAuthors(elems: ElementModel[]): ElementModel[] {
  const seen = new Set<string>()
  return elems.filter((e) => {
    const key = (e.text || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!key) return false
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}
```
Usar `dedupCoverAuthors(coverAuthorTexts)` al renderizar el grid de autores (linea 895). Aplicar tambien a `coverHeaderTexts` y `coverFooterTexts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/portadaDedup.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/portadaDedup.test.tsx
git commit -m "fix(portada): dedup de autores en el preview (defensa contra textboxes duplicados)"
```

---

# CLUSTER C - Inspector roto (panel duplicado, controles, botón IA)

## Task C1: Eliminar la duplicación del ImageEditPanel (única instancia)

**Files:**
- Modify: `src/components/inspector/ElementInspector.tsx:391-395` (quitar `<ImageEditPanel>` embebido)
- Modify: `src/App.tsx:107-145,528` (conservar `ImageEditSidePanel` como unica instancia)
- Test: `src/__tests__/inspector.test.tsx`

**Contexto:** `ImageEditPanel` se monta DOS veces: dentro de `ElementInspector` (ElementInspector.tsx:394) y en `ImageEditSidePanel` (App.tsx:143). Esto duplica todo el panel "Editar imagen".

- [ ] **Step 1: Write the failing test**

```tsx
// inspector.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, queryAllByText } from '@testing-library/react'

vi.mock('../store/useDocStore', () => ({
  useDocStore: () => ({
    doc: { elements: [{ id: 'i1', type: 'image', image_info: { width_cm: 10, height_cm: 8, caption: '' } }] },
    selectedElementId: 'i1', setSelectedElementId: () => {}, updateElementType: () => {},
    portada: {}, setPortada: () => {}, imagePanelOpen: false, setImagePanelOpen: () => {},
    updateElementImage: () => {}, setWizardStep: () => {}, showToast: () => {},
  }),
}))

describe('ElementInspector no duplica ImageEditPanel', () => {
  it('muestra un botón "Editar imagen" en vez del panel completo embebido', async () => {
    const { ElementInspector } = await import('../components/inspector/ElementInspector')
    const { queryByText, getByText } = render(<ElementInspector />)
    expect(queryAllByText(/Restaurar tamaño original/i)).toHaveLength(0)
    expect(getByText(/Editar imagen/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL - el panel embebido renderiza "Restaurar tamaño original".

- [ ] **Step 3: Write minimal implementation**

En `ElementInspector.tsx` (lineas 391-395), reemplazar `<ImageEditPanel elem={selectedElem} />` por:
```tsx
<button type="button" className="btn btn-sm" onClick={() => useDocStore.getState().setImagePanelOpen(true)}>
  Editar imagen
</button>
```
Conservar `<SuggestCaptionButton elem={selectedElem} />`. Asi `ImageEditSidePanel` (App.tsx) queda como la unica instancia del editor.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/ElementInspector.tsx src/__tests__/inspector.test.tsx
git commit -m "fix(inspector): única instancia de ImageEditPanel (fin del panel duplicado)"
```

## Task C2: Arreglar controles de tabla (añadir table_info al backend + store)

**Files:**
- Modify: `python/main.py:474-481` (`UpdateElementRequest` + `table_info`)
- Modify: `python/main.py` bloque `update_element` (manejar `table_info`)
- Modify: `src/api/backend.ts` (enviar `table_info`)
- Modify: `src/store/useDocStore.ts` (acción `updateElementTable`)
- Modify: `src/components/inspector/ElementInspector.tsx:412-440` (usar `updateElementTable`)
- Test: `python/tests/test_update_element_table.py`

**Contexto:** `UpdateElementRequest` no tiene campo `table_info`, asi que editar numero/caption/nota de tabla SIEMPRE se pierde tras el roundtrip API. Las imagenes si funcionan via `image_info`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_update_element_table.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)

def test_update_element_persists_table_info():
    r = client.post('/api/start-blank')
    sid = r.json()['session_id']
    resp = client.post('/api/update-element', json={
        'session_id': sid, 'element_id': 't1', 'type': 'table',
        'table_info': {'table_number': 5, 'caption': 'Resultados', 'note': 'n=30'}
    })
    assert resp.status_code == 200
    doc = resp.json()
    t = next(e for e in doc['elements'] if e['id'] == 't1')
    assert t['table_info']['table_number'] == 5
    assert t['table_info']['caption'] == 'Resultados'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_update_element_table.py -v`
Expected: FAIL - `table_info` se ignora; el valor no persiste.

- [ ] **Step 3: Write minimal implementation**

En `main.py`, añadir a `UpdateElementRequest`:
```python
table_info: Optional[dict] = None
```
En `update_element`, tras el bloque de `image_info` (linea ~1122), añadir:
```python
if req.table_info is not None:
    if hasattr(elem, 'table_info') and elem.table_info is not None:
        for k, v in req.table_info.items():
            if hasattr(elem.table_info, k):
                setattr(elem.table_info, k, v)
    elif hasattr(elem, 'table_info'):
        from models import TableModel
        elem.table_info = TableModel(**{k: v for k, v in req.table_info.items() if hasattr(TableModel, k)})
```
En `backend.ts` (`updateElement`/`updateElementImage`), crear `updateElementTable(id, table_info)` que envie `table_info`. En `useDocStore.ts`, añadir `updateElementTable`. En `ElementInspector.tsx` lineas 412-440, reemplazar la mutacion directa por `updateElementTable(elem.id, { table_number, caption, note })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_update_element_table.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/main.py python/tests/test_update_element_table.py src/api/backend.ts src/store/useDocStore.ts src/components/inspector/ElementInspector.tsx
git commit -m "fix(inspector): los controles de tabla persisten via table_info en el backend"
```

## Task C3: Arreglar la API "explicar elemento" (schema mismatch)

**Files:**
- Modify: `src/api/backend.ts` (`explainElement` envia `element_type`, `text`, etc.)
- Modify: `src/components/inspector/ElementInspector.tsx:235` (pasar datos del elemento)
- Test: `python/tests/test_explain_element.py`

**Contexto:** El frontend envia `{id, question}` pero el backend `ExplainElementRequest` espera `{element_type, text, rules_applied, confidence}`. El LLM recibe strings vacios y no responde nada util.

- [ ] **Step 1: Write the backend regression test**

```python
# python/tests/test_explain_element.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)

def test_explain_element_uses_text():
    resp = client.post('/api/ai/explain-element', json={
        'element_type': 'paragraph', 'text': 'Este parrafo habla de ergonomía.',
        'rules_applied': 'APA 7', 'confidence': 0.9,
    })
    assert resp.status_code == 200
    assert 'explanation' in resp.json()
```

- [ ] **Step 2: Run test**

Run: `cd python && python -m pytest tests/test_explain_element.py -v`
Expected: PASS ya (el backend esta bien); el bug esta en el frontend. Continua con el paso 3 (arreglar el frontend).

- [ ] **Step 3: Fix the frontend**

En `backend.ts`, `explainElement` debe enviar:
```ts
export async function explainElement(elem: ElementModel, question: string): Promise<string> {
  return post('/api/ai/explain-element', {
    element_type: elem.type,
    text: question || elem.text || '',
    rules_applied: 'APA 7',
    confidence: elem.confidence ?? 0,
  }).then((r: any) => r.explanation)
}
```
En `ElementInspector.tsx` linea 235, llamar `explainElement(selectedElem, val.trim())` en vez de `explainElement(selectedElem.id, val.trim())`.

- [ ] **Step 4: Commit**

```bash
git add python/tests/test_explain_element.py src/api/backend.ts src/components/inspector/ElementInspector.tsx
git commit -m "fix(inspector): explicar elemento envía el schema correcto al backend"
```

## Task C4: Quitar/rediseñar secciones tontas "Estado" e "Info" del inspector

**Files:**
- Modify: `src/components/inspector/ElementInspector.tsx:256-278,303-347` (eliminar badges informativos sin acción; compactar el select de tipo)
- Test: `src/__tests__/inspector.test.tsx` (añadir aserciones)

- [ ] **Step 1: Write the failing test**

```tsx
it('no muestra la sección "Estado" ni el badge "Clasificado"', () => {
  const { queryByText } = render(<ElementInspector />)
  expect(queryByText(/^Estado$/)).toBeNull()
  expect(queryByText(/Clasificado/)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL - aparece "Estado" y "Clasificado".

- [ ] **Step 3: Write minimal implementation**

Eliminar el bloque "Estado" (lineas 303-331) y el badge de "Tipo de Elemento" (lineas 257-265), conservando el `<select>` de cambio de tipo (moverlo a una fila compacta con label "Tipo"). Ocultar el textarea "Contenido" para imagenes/tablas (solo mostrarlo para texto).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/ElementInspector.tsx src/__tests__/inspector.test.tsx
git commit -m "fix(inspector): quita badges informativos sin acción (Estado/Tipo) y compacta el selector"
```

## Task C5: Botón flotante "Sugerir leyenda con IA" al tocar imagen O tabla

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:668-715` (extender la barra contextual a tablas; añadir botón)
- Test: `src/__tests__/inspector.test.tsx`

**Contexto:** La barra contextual (lineas 668-715) solo aparece para imagenes. `handleSuggestCaption` (linea 330) ya funciona para ambos tipos.

- [ ] **Step 1: Write the failing test**

```tsx
it('muestra "Sugerir leyenda con IA" al seleccionar una tabla', () => {
  // mock store con una tabla seleccionada
  const { getByText } = render(<PaperCanvas />)
  expect(getByText(/Sugerir leyenda con IA/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL - la barra no aparece para tablas.

- [ ] **Step 3: Write minimal implementation**

En `PaperCanvas.tsx` (linea 670), cambiar la condicion de retorno a:
```tsx
if (!selElem || (selElem.type !== 'image' && selElem.type !== 'table')) return null;
```
Añadir siempre el botón:
```tsx
<button type="button" onClick={() => handleSuggestCaption(selElem)} style={{ /* estilo existente */ }}>
  <Wand2 size={11} /> Sugerir leyenda con IA
</button>
```
Para tablas sin `image_info`, omitir los controles de ancho/rotacion (guardar con `if (selElem.type === 'image' && selElem.image_info)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/inspector.test.tsx
git commit -m "feat(inspector): botón flotante 'Sugerir leyenda con IA' al tocar imagen o tabla"
```

## Task C6: Botón "Auto-leyenda todo" con loading y protección contra caídas

**Files:**
- Modify: `src/store/useDocStore.ts` (acción `autoCaptionAll`)
- Modify: `src/components/wizard/Step3FiguresTablesWizard.tsx:117-133` (botón + estado de carga)
- Test: `src/__tests__/inspector.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('autoCaptionAll aplica leyendas solo a figuras/tablas sin caption', async () => {
  // mock doc con 2 figuras sin caption + 1 con caption; mock suggestCaption
  const suggestSpy = vi.fn().mockResolvedValue('Leyenda IA')
  vi.mock('../api/backend', () => ({ suggestCaption: suggestSpy }))
  await useDocStore.getState().autoCaptionAll()
  expect(suggestSpy).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL - `autoCaptionAll` no existe.

- [ ] **Step 3: Write minimal implementation**

En `useDocStore.ts`:
```ts
autoCaptionAll: async () => {
  const { doc } = get()
  if (!doc) return
  const targets = doc.elements.filter((e) =>
    (e.type === 'image' || e.type === 'table') &&
    !(e.image_info?.caption || e.table_info?.caption))
  for (let i = 0; i < targets.length; i++) {
    const elem = targets[i]
    get().showToast(`Generando leyenda ${i + 1}/${targets.length}…`, 'info')
    try {
      const ctx = get()._contextFor(elem) // helper que arma el contexto de parrafos cercanos
      const suggestion = await api.suggestCaption(doc.session_id, elem.id, ctx, get().apiKey)
      if (elem.type === 'image') get().updateElementImage(elem.id, { caption: suggestion })
      else get().updateElementTable(elem.id, { caption: suggestion })
    } catch (err: any) {
      get().showToast(`No se pudo generar la leyenda de un elemento: ${err.message}`, 'error')
      // continuar con el siguiente (protección contra caídas)
    }
  }
  get().showToast('Leyendas automáticas completadas', 'success')
},
```
En `Step3FiguresTablesWizard.tsx`, añadir boton "Auto-leyenda todo (IA)" con `disabled` mientras corre y un contador "X/Y". Exponer `autoCaptionProgress` en el store para el contador.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/useDocStore.ts src/components/wizard/Step3FiguresTablesWizard.tsx src/__tests__/inspector.test.tsx
git commit -m "feat(inspector): botón 'Auto-leyenda todo' con IA, loading y protección contra caídas"
```

## Task C7: Debounce de inputs de ImageEditPanel + toasts de error visibles

**Files:**
- Modify: `src/components/inspector/ImageEditPanel.tsx` (debounce en width/height)
- Modify: `src/store/useDocStore.ts` (reemplazar `console.error` por `showToast` en `updateElementImage`/`updateElementType`)
- Test: `src/__tests__/inspector.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('updateElementImage muestra toast de error si el backend falla', async () => {
  vi.mock('../api/backend', () => ({ updateElementImage: vi.fn().mockRejectedValue(new Error('fail')) }))
  await useDocStore.getState().updateElementImage('x', { caption: 'y' })
  expect(showToastMock).toHaveBeenCalledWith(expect.any(String), 'error')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: FAIL - solo hace `console.error`.

- [ ] **Step 3: Write minimal implementation**

En `useDocStore.ts`, en los catch de `updateElementImage`/`updateElementType`/`updateElementTable`, cambiar `console.error(...)` por `get().showToast(err.message || 'Error al guardar el cambio', 'error')`. En `ImageEditPanel.tsx`, envolver los `onChange` de ancho/alto con un debounce de 300ms (usar `use-debounce` que ya esta en dependencias, o un `useRef` timeout) antes de llamar `updateElementImage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/ImageEditPanel.tsx src/store/useDocStore.ts src/__tests__/inspector.test.tsx
git commit -m "fix(inspector): debounce en el editor de imagen y errores visibles al usuario"
```

---

# CLUSTER D - Diseño/layout y auditor de imágenes

## Task D1: Eliminar el botón estrella desplazado (EditorRail)

**Files:**
- Modify: `src/components/wizard/EditorRail.tsx:84-117` (eliminar el botón Sparkles suelto; mover el toggle al RightSidePanel o toolbar)
- Modify: `src/App.tsx:499,510` (dejar de montar `EditorRail` o reducirlo)
- Test: `src/__tests__/editorRail.test.tsx`

**Contexto:** `EditorRail` es una columna de 52px cuyo unico contenido es un boton `Sparkles` (la "estrella") anclado al fondo por un `flex:1` (EditorRail.tsx:92), que controla el panel DERECHO. Aparece "debajo de los pasos" y desplazado.

- [ ] **Step 1: Write the failing test**

```tsx
it('no existe el botón Sparkles suelto en el EditorRail', () => {
  const { queryByLabelText } = render(/* layout con EditorRail */)
  expect(queryByLabelText(/asistente/i)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editorRail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Mover el toggle del asistente al header de `RightSidePanel.tsx` (junto a su boton de cerrar). Quitar la columna `EditorRail` de `App.tsx` (lineas 499 y 510) o, si se quiere conservar el rail, dejarlo vacio/colapsado. Eliminar el `flex:1` spacer (linea 92) y el boton Sparkles (lineas 96-117) de `EditorRail.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/editorRail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/EditorRail.tsx src/App.tsx src/__tests__/editorRail.test.tsx
git commit -m "fix(layout): elimina el botón estrella desplazado del EditorRail"
```

## Task D2: Unificar el mapa de títulos (menos separación entre pasos y outline)

**Files:**
- Modify: `src/components/wizard/StepRail.tsx:29` (`showMap` incluye paso 2)
- Modify: `src/components/wizard/Step2HeadingsWizard.tsx:223-239` (quitar el panel outline de 280px)
- Test: `src/__tests__/editorRail.test.tsx`

**Contexto:** El outline se monta en 3 sitios. En el paso 2 hay un panel de 280px separado de los pasos por la columna EditorRail de 52px. Extender `showMap` al paso 2 unifica la ubicacion.

- [ ] **Step 1: Write the failing test**

```tsx
it('en el paso 2 el outline vive dentro del StepRail (no en un panel separado de 280px)', () => {
  // renderizar el layout con wizardStep=2; el Step2HeadingsWizard no debe tener su propio panel outline
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editorRail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

En `StepRail.tsx:29`, cambiar `const showMap = wizardStep === 3 || wizardStep === 4` a incluir el 2: `const showMap = wizardStep === 2 || wizardStep === 3 || wizardStep === 4`. En `Step2HeadingsWizard.tsx`, quitar el panel outline de 280px (lineas 223-239) cuando `showMap` del rail este activo (o siempre, ya que ahora el rail lo provee).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/editorRail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/StepRail.tsx src/components/wizard/Step2HeadingsWizard.tsx src/__tests__/editorRail.test.tsx
git commit -m "fix(layout): unifica el mapa de títulos en el StepRail (menos separación)"
```

## Task D3: keep_together/widow_control en imágenes del generador in-place

**Files:**
- Modify: `python/generation/generator.py:474-558` (`_apply_image_design_style` añade `keep_together`/`widow_control`)
- Test: `python/tests/test_image_keep_together.py`

**Contexto:** El generador in-place (default) NO aplica `keep_together`/`widow_control` al parrafo de imagen (a diferencia de `image_handler.py:238-239`), asi que imagenes altas se cortan al final de pagina.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_image_keep_together.py
from docx import Document
from generation.generator import _apply_image_design_style
from models import ElementModel, ImageModel, APARuleSet

def test_image_paragraph_has_keep_together():
    doc = Document()
    p = doc.add_paragraph()
    elem = ElementModel(id='i', type='image', image_info=ImageModel(element_id='i', file_path='', filename='', design_style='standard'))
    _apply_image_design_style(p, elem, APARuleSet())
    assert p.paragraph_format.keep_together is True
    assert p.paragraph_format.widow_control is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_image_keep_together.py -v`
Expected: FAIL - `keep_together` es None.

- [ ] **Step 3: Write minimal implementation**

En `_apply_image_design_style` (generator.py:474), al final de la funcion (antes del `first_line_indent`), añadir:
```python
p.paragraph_format.keep_together = True
p.paragraph_format.widow_control = True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_image_keep_together.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/generation/generator.py python/tests/test_image_keep_together.py
git commit -m "fix(generator): keep_together/widow_control en imágenes in-place (no se cortan al final de página)"
```

## Task D4: Tope de altura de imagen + page-break preventivo

**Files:**
- Modify: `python/generation/generator.py` (añadir `_usable_height_cm` y clampeo de altura)
- Modify: `python/generation/image_handler.py` (mismo clampeo en `format_apa_figure`)
- Test: `python/tests/test_image_keep_together.py` (añadir caso de altura)

- [ ] **Step 1: Write the failing test**

```python
def test_image_taller_than_page_is_clamped():
    # imagen con height_cm=30 (mas alta que pagina usable ~24cm) se clampea
    ...
    assert img.height_cm <= 24.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_image_keep_together.py -v`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Añadir en `generator.py`:
```python
def _usable_height_cm(section) -> float | None:
    try:
        if section is None or section.page_height is None: return None
        return float((section.page_height - section.top_margin - section.bottom_margin) / 914400) * 2.54
    except Exception:
        return None
```
En el bloque de imagen existente (generator.py ~1295-1363), tras obtener `width_cm`/`height_cm`, clampear: `max_h = _usable_height_cm(doc.sections[0]); if max_h and (height_cm or 0) > max_h: escalar proporcionalmente`. Replicar en `image_handler.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_image_keep_together.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/generation/generator.py python/generation/image_handler.py python/tests/test_image_keep_together.py
git commit -m "fix(generator): clampea la altura de imágenes a la página usable (no se cortan ni se meten debajo)"
```

## Task D5: Chequeos de overflow/bleed de imágenes en el doc_auditor

**Files:**
- Modify: `python/modules/doc_auditor.py:54-244` (añadir chequeos de imagen vs pagina)
- Test: `python/tests/test_doc_auditor_overflow.py`

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_doc_auditor_overflow.py
from modules.doc_auditor import audit_document_heuristic

def _img(h):
    info = type('I', (), {'width_cm': 12, 'height_cm': h, 'caption': 'Fig. 1'})()
    return type('E', (), {'type': 'image', 'text': '', 'image_info': info, 'is_cover_section': False, 'heading_level': None})()

def _doc(elems):
    return type('D', (), {'elements': elems, 'meta': type('M', (), {'apa_format': 'student', 'forensic_metadata': {}})(), 'portada': {'detected': False}, 'referencias': [], 'citas_intext': []})()

def test_image_taller_than_page_flagged():
    result = audit_document_heuristic(_doc([_img(30)]))
    assert any('página' in f.lower() or 'corta' in f.lower() for f in result.format_suggestions)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_doc_auditor_overflow.py -v`
Expected: FAIL - no hay chequeo de overflow.

- [ ] **Step 3: Write minimal implementation**

En `audit_document_heuristic`, añadir un bucle sobre elementos `image`:
```python
PAGE_USABLE_H_CM = 24.0
for elem in doc_model.elements:
    if getattr(elem, 'type', None) == 'image' and not getattr(elem, 'is_cover_section', False):
        info = getattr(elem, 'image_info', None)
        if info and (info.height_cm or 0) > PAGE_USABLE_H_CM:
            issues.format_suggestions.append(
                f"La figura mide {info.height_cm} cm de alto y no cabe en una página (máx ~{PAGE_USABLE_H_CM} cm). Redúcela o divídala."
            )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_doc_auditor_overflow.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/modules/doc_auditor.py python/tests/test_doc_auditor_overflow.py
git commit -m "feat(auditor): detecta imágenes que no caben en la página (overflow/bleed)"
```

---

# CLUSTER E - Revisión proactiva de escritura / IA (subrayado + WhatsApp)

## Task E1: Crear el endpoint /api/proofread-batch (conecta proactive_auditor con el frontend)

**Files:**
- Create: `python/routers/proofread.py`
- Modify: `python/main.py` (montar el router)
- Test: `python/tests/test_proofread_batch.py`

**Contexto:** El frontend llama a `POST /proofread-batch` (`src/api/backend.ts:153`, `useDocStore.ts:668`) pero el endpoint NO EXISTE en el backend -> 404 silencioso -> `proofreadFindings` siempre vacio. `proactive_auditor.audit_elements` detecta palabras duplicadas (linea 170/296) pero nunca llega al React app.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_proofread_batch.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)

def test_proofread_batch_detects_duplicate_words():
    resp = client.post('/api/proofread-batch', json={
        'session_id': '', 'texts': ['El resultado final final fue claro.']
    })
    assert resp.status_code == 200
    findings = resp.json().get('findings', [])
    assert any('duplicada' in str(f).lower() or 'pegado' in str(f).lower() for f in findings)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_proofread_batch.py -v`
Expected: FAIL - 404.

- [ ] **Step 3: Write minimal implementation**

```python
# python/routers/proofread.py
from fastapi import APIRouter, BaseModel
from typing import List, Optional
from modules.proactive_auditor import audit_elements

router = APIRouter()

class ProofreadRequest(BaseModel):
    session_id: Optional[str] = None
    texts: List[str] = []

class ProofreadElement:
    def __init__(self, idx: int, text: str):
        self.id = f"p{idx}"
        self.type = "paragraph"
        self.text = text
        self.heading_level = None

@router.post("/api/proofread-batch")
async def proofread_batch(req: ProofreadRequest):
    elements = [ProofreadElement(i, t) for i, t in enumerate(req.texts) if t and t.strip()]
    findings = audit_elements(elements)
    return {"findings": findings}
```
En `main.py`, importar y montar: `from routers import proofread; app.include_router(proofread.router)` (cerca de los otros routers, ~linea 230).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_proofread_batch.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/routers/proofread.py python/main.py python/tests/test_proofread_batch.py
git commit -m "feat(review): endpoint /api/proofread-batch conecta el auditor proactivo (palabras duplicadas) con la app"
```

## Task E2: /api/ai-review integra el proactive_auditor y fusiona hallazgos

**Files:**
- Modify: `python/main.py:3043-3110` (`ai_review_endpoint` llama `audit_elements`)
- Test: `python/tests/test_proofread_batch.py` (añadir caso via /api/ai-review)

- [ ] **Step 1: Write the failing test**

```python
def test_ai_review_returns_duplicate_findings():
    # crear sesión con un parrafo que tiene palabra duplicada (via start-blank + update-element)
    ...
    resp = client.post(f'/api/ai-review/{sid}')
    paragraphs = resp.json()['paragraphs']
    assert any(any('duplicada' in str(f).lower() for f in p.get('findings', [])) for p in paragraphs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_proofread_batch.py -v -k ai_review`
Expected: FAIL - `/api/ai-review` no incluye hallazgos de palabras duplicadas.

- [ ] **Step 3: Write minimal implementation**

En `ai_review_endpoint`, tras el bucle de `analyze_ai_risk` (main.py ~3110), añadir:
```python
from modules.proactive_auditor import audit_elements
pa_elements = [type('E', (), {'id': e.id, 'type': 'paragraph', 'text': (e.text or '').strip(), 'heading_level': None})()
               for e in doc_model.elements if e.type in text_types and (e.text or '').strip()]
pa_findings = audit_elements(pa_elements)
for f in pa_findings:
    for p in paragraphs:
        if p['element_id'] == f.get('element_id'):
            p['findings'].append({'phrase': f.get('phrase', ''), 'phrases': [], 'detail': f.get('detail', ''), 'severity': f.get('severity', 'LOW')})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_proofread_batch.py -v -k ai_review`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/main.py python/tests/test_proofread_batch.py
git commit -m "feat(review): /api/ai-review fusiona hallazgos del auditor proactivo (palabras duplicadas subrayadas)"
```

## Task E3: Arreglar styleAuditRun en renderReviewedText (subrayado inline de estilo)

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:225-230` (añadir `styleAuditRun` al `cmtCtx`)
- Test: `src/__tests__/WhatsAppComment.test.tsx`

**Contexto:** El `cmtCtx` de `renderReviewedText` (linea 225) omite `styleAuditRun`, asi que los comentarios de estilo (duplicado, primera persona, etc.) NO generan marca inline, aunque el gutter si los muestre (gutter usa `styleAuditRun: !!reviewResult`).

- [ ] **Step 1: Write the failing test**

```tsx
it('renderReviewedText subraya palabras duplicadas cuando hay review', () => {
  // mock reviewResult con findings de duplicado; renderizar un parrafo con "final final"
  // esperar un <mark> con text-decoration
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/WhatsAppComment.test.tsx`
Expected: FAIL - no hay mark.

- [ ] **Step 3: Write minimal implementation**

En `PaperCanvas.tsx:225`, cambiar `cmtCtx` para incluir `styleAuditRun: !!useDocStore.getState().reviewResult`:
```tsx
const cmtCtx = {
  ghostCitations: (s.citationAuditResult?.ghost_citations || []) as any[],
  orphanReferences: (s.citationAuditResult?.orphan_references || []) as any[],
  validationIssues: (s.validationIssues || []) as any[],
  styleAuditRun: !!s.reviewResult,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/WhatsAppComment.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/WhatsAppComment.test.tsx
git commit -m "fix(review): el subrayado inline de estilo respeta styleAuditRun como el gutter"
```

## Task E4: Bajar el mínimo de DUPLICATE_RE a 2 letras (atrapa "de de", "la la")

**Files:**
- Modify: `src/components/layout/WhatsAppComment.tsx:43` (`\p{L}{3,}` -> `\p{L}{2,}` con guarda de stopwords)
- Test: `src/__tests__/WhatsAppComment.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('detecta duplicados cortos: "de de", "la la"', () => {
  // ctx con styleAuditRun:true; texto "fue de de la la casa"
  // esperar al menos 1 comentario de tipo duplicate
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/WhatsAppComment.test.tsx`
Expected: FAIL - no detecta "de de".

- [ ] **Step 3: Write minimal implementation**

En `WhatsAppComment.tsx:43`:
```ts
const STOPWORD_DUPS = new Set(['que', 'se', 'te', 'me', 'lo', 'su']);
const DUPLICATE_RE = /(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/iu;
// antes de emitir, descartar si la palabra esta en STOPWORD_DUPS (evita "que que" falso)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/WhatsAppComment.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/WhatsAppComment.tsx src/__tests__/WhatsAppComment.test.tsx
git commit -m "fix(review): detecta palabras duplicadas cortas (de de, la la) con guarda de stopwords"
```

## Task E5: Re-review automático al editar + limpiar iaCache + no tragar 404

**Files:**
- Modify: `src/store/useDocStore.ts:680` (no tragar 404 de runProofreadBatch silenciosamente)
- Modify: `src/store/useDocStore.ts:~990` (`updateElementType` dispara `runProofreadBatch` con debounce; limpia `iaCache[elem.id]`)
- Modify: `src/components/layout/WhatsAppComment.tsx` (invalidar cache al editar via evento)
- Test: `src/__tests__/useDocStore.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
it('runProofreadBatch avisa si el endpoint falla (no traga silenciosamente)', async () => {
  vi.mock('../api/backend', () => ({ runProofreadBatch: vi.fn().mockRejectedValue(new Error('404')) }))
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await useDocStore.getState().runProofreadBatch()
  expect(warnSpy).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: FAIL - el catch es `/* silencioso */`.

- [ ] **Step 3: Write minimal implementation**

En `runProofreadBatch` (useDocStore.ts:680), reemplazar el catch silencioso por:
```ts
catch (err) { console.warn('[proofread-batch] falló:', err); }
```
En `updateElementType`, tras guardar, añadir un debounce (500ms) que llame `runProofreadBatch()` y dispare un evento `window.dispatchEvent(new CustomEvent('wordapa7:clear-comment-cache', { detail: { id: elemId } }))` que `WhatsAppComment` escucha para invalidar `iaCache[elem.id]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/useDocStore.ts src/components/layout/WhatsAppComment.tsx src/__tests__/useDocStore.test.ts
git commit -m "fix(review): re-revisa al editar, limpia cache de comentarios y no traga el 404"
```

---

# CLUSTER F - Referencias / bibliografía

## Task F1: Dedup semántico (autor+año+título) en references_extractor

**Files:**
- Modify: `python/parsing/references_extractor.py:235-242` (dedup por clave semántica, no texto crudo)
- Test: `python/tests/test_references_dedup.py`

**Contexto:** La dedup actual es por texto crudo (incluye el prefijo "6.", "7."...), asi que "6. Hirano..." y "7. Hirano..." sobreviven como 4 entradas distintas.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_references_dedup.py
from parsing.references_extractor import extract_references
from models import ElementModel

def test_number_prefixed_duplicates_collapsed():
    lines = [
        "6. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press",
        "7. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press",
        "8. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press",
        "9. Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press",
        "10. Juran, J. M. (1999). Juran's Quality Handbook. McGraw-Hill",
    ]
    elems = [ElementModel(id=f'e{i}', type='paragraph', text=l, heading_level=None) for i, l in enumerate(lines)]
    refs = extract_references(elems)
    hirano = [r for r in refs if 'hirano' in (r.raw_text or '').lower() or 'hirano' in ' '.join(r.authors or []).lower()]
    assert len(hirano) == 1, f'Esperado 1 Hirano, got {len(hirano)}'
    assert len(refs) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_references_dedup.py -v`
Expected: FAIL - 4 Hirano.

- [ ] **Step 3: Write minimal implementation**

En `references_extractor.py:235-242`, cambiar la dedup para usar `_parse_single_reference` primero y construir la clave con autor+año+título normalizado:
```python
seen = set()
for raw in entry_lines:
    parsed = _parse_single_reference(raw)
    if parsed and (parsed.get('authors') or parsed.get('year')):
        first = (parsed['authors'][0] if parsed['authors'] else '').lower()
        key = f"{first}|{parsed.get('year', 's.f.')}|{_norm_title(parsed.get('title', ''))}"
    else:
        base = _strip_ref_prefix(raw)
        key = re.sub(r'\s+', ' ', base.lower()).strip()
    if key in seen:
        continue
    seen.add(key)
    refs.append(ReferenciaModel(...))
```
Añadir helper `_norm_title` (alfanumerico, minusculas, sin stopwords iniciales) y reutilizar `_strip_ref_prefix` de `referencias_module`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_references_dedup.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/parsing/references_extractor.py python/tests/test_references_dedup.py
git commit -m "fix(refs): dedup semántico por autor+año+título (fin de Hirano x4)"
```

## Task F2: Dedup de bibliografía en el export in-place

**Files:**
- Modify: `python/generation/inplace_editor.py:135-162` (dedup de parrafos de bibliografia por texto normalizado)
- Test: `python/tests/test_inplace_editor.py` (añadir caso)

- [ ] **Step 1: Write the failing test**

```python
def test_inplace_dedup_duplicate_references(tmp_path):
    # doc con 4 parrafos identicos "Hirano..." tras el encabezado "Referencias"
    ...
    apply_inplace(original, out, doc_model, rules, scopes=['bibliografia'])
    # verificar que solo queda 1 "Hirano"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_inplace_editor.py -v -k dedup`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

En `apply_inplace` (inplace_editor.py:135-162), al recorrer la zona de bibliografia, mantener un `seen_refs` por texto normalizado (prefijo stripped) y eliminar (`parent.remove`) los parrafos duplicados tras el primero.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_inplace_editor.py -v -k dedup`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/generation/inplace_editor.py python/tests/test_inplace_editor.py
git commit -m "fix(refs): el export in-place elimina referencias duplicadas de la bibliografía"
```

## Task F3: No doble escritura de referencias en el rebuild path

**Files:**
- Modify: `python/generation/generator.py:1571-1572` (saltar elementos de la seccion de refs al formatear; solo append)
- Modify: `python/generation/layered_generator.py` (PHASE 4: no duplicar)
- Test: `python/tests/test_generator.py` (añadir caso)

- [ ] **Step 1: Write the failing test**

```python
def test_references_not_duplicated_in_rebuild(tmp_path, rules, references_sample):
    # doc_model con elementos que incluyen los parrafos de refs originales + references=references_sample
    ...
    # esperar que el output tenga UNA sola seccion de referencias
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_generator.py -v -k references_not_duplicated`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

En el bucle principal de `generate_apa7_docx` (generator.py ~1222), saltar (`continue`) los elementos cuyo texto corresponda a parrafos dentro de la zona de referencias (detectar el heading "Referencias"/"Bibliografia" y todo parrafo posterior que cumpla `_is_ref_paragraph`), ya que la seccion se appende al final (linea 1571). Marcar estos elementos con un flag `is_reference_section` al parsear, o detectar en runtime.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && python -m pytest tests/test_generator.py -v -k references_not_duplicated`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/generation/generator.py python/generation/layered_generator.py python/tests/test_generator.py
git commit -m "fix(refs): el rebuild no escribe la sección de referencias dos veces"
```

## Task F4: Drawer del validador global (se abre desde cualquier paso)

**Files:**
- Modify: `src/App.tsx` (renderizar `{validatorOpen && <ValidatorViewDrawer/>}` a nivel raiz)
- Modify: `src/components/wizard/Step5ReferencesWizard.tsx:114-135` (quitar el drawer local; dejar el contenido del paso)
- Modify: `src/components/referencias/ReferencesPanel.tsx:111-120` (siempre permitir abrir el validador)
- Test: `src/__tests__/useDocStore.test.ts`

**Contexto:** El drawer solo se monta en `Step5ReferencesWizard` (paso 4). `setValidatorOpen(true)` desde el Command Palette (Ctrl+K) o Escape no abre nada en otros pasos. Y el boton "Ver validador" solo aparece tras un audit exitoso.

- [ ] **Step 1: Write the failing test**

```tsx
it('setValidatorOpen(true) abre el drawer desde cualquier paso', () => {
  // wizardStep !== 4
  useDocStore.getState().setValidatorOpen(true)
  // esperar que el drawer se renderice en el root
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Mover el bloque `{validatorOpen && (<div drawer>...<ValidatorView/></div>)}` de `Step5ReferencesWizard.tsx:114-135` a `App.tsx` (nivel raiz, junto a `CommandPalette`/`DownloadSuccessOverlay`). En `ReferencesPanel.tsx:111-120`, siempre mostrar "Abrir validador" que llama `setValidatorOpen(true)` (y dispara `runCitationAudit` al abrir si no hay resultado). `ValidatorView` debe llamar `runCitationAudit()`/`runValidation()` on mount.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/wizard/Step5ReferencesWizard.tsx src/components/referencias/ReferencesPanel.tsx src/__tests__/useDocStore.test.ts
git commit -m "fix(refs): el validador se abre desde cualquier paso (drawer global) sin requerir audit previo"
```

## Task F5: Dedup de referencias en el store (addReference / autoResolveGhosts)

**Files:**
- Modify: `src/store/useDocStore.ts` (`addReference` dedup por autor+año+título)
- Test: `src/__tests__/useDocStore.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
it('addReference no duplica por autor+año', () => {
  useDocStore.getState().addReference({ authors: ['Hirano'], year: '1995', title: '5 Pillars' } as any)
  useDocStore.getState().addReference({ authors: ['Hirano'], year: '1995', title: '5 Pillars' } as any)
  expect(useDocStore.getState().references.filter((r: any) => r.authors?.includes('Hirano'))).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

En `addReference`, antes de append, calcular `key = surname|year|normTitle` y verificar si ya existe; si existe, actualizar en vez de agregar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/useDocStore.ts src/__tests__/useDocStore.test.ts
git commit -m "fix(refs): addReference deduplica por autor+año+título en el store"
```

---

## Nota final de deploy (Cluster A)

Tras aplicar el Cluster A, ejecutar `npm run build:addin` y sincronizar `word-addin/dist/` con el `resources/addin/` del paquete Electron, ya que el bundle desplegado estaba stale respecto al codigo fuente (causa raiz del 405 "Method Not Allowed" y de ver sintomas mezclados).
