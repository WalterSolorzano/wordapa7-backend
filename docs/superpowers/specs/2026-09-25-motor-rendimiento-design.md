# Design — Motor de Render/Edición Híbrido (Word COM como autoridad)

Date: 2026-09-25
Status: approved (enfoque + prioridades aprobados en chat; spec bajo revisión de usuario)

## 1. Problema

Cuatro dolores reportados por el usuario, con causa raíz localizada:

1. **Texto se sale de las hojas** — `computePages` (`PaperCanvas.tsx:292-360`) pagina por estimación de "units" (chars/90 ÷ 2), cero medición DOM. La hoja tiene `overflow: hidden` (`PaperCanvas.tsx:1336-1339`) → recorta silenciosamente lo que no cabe. Word pagina por métrica real.
2. **Edición antinatural** — click abre `<textarea>` overlay (`PaperCanvas.tsx:1868-1908`); sin reflow mientras se teclea, sin cursor nativo.
3. **Export infiel (C-c: canvas y artefactos ambos mienten)** — el canvas ignora `margins_cm` (padding fijo 54px, `PaperCanvas.tsx:1342`), `rules.page_size` (ratio Letter/A4 hardcodeado, `:808-811`) y `line_spacing` en headings/tablas/citas. Bug adicional: `inplace_editor.py:143` lee `getattr(rules,"font_size",12)` pero el campo es `font_size_pt` (`models.py:101`) → siempre 12pt en ruta in-place.
4. **Paginación rival** — backend ya calcula paginación real Word (`page_layout_provider.paragraph_pages` → `elem.page_number`, `main.py:443-451`) y `POST /api/audit/paginate` (`audit_pagination`, `post_processor.py:581` con `Repaginate()`) pero `computePages` no consume nada de eso. Dos verdades compitiendo.

## 2. Decisiones del usuario

| Pregunta | Decisión |
|---|---|
| Prioridad | A (desborde) → B (edición) → C (fidelidad export) |
| Motor de paginación | A3 híbrido **con COM como autoridad**: medición browser solo feedback instantáneo mientras se teclea; Word reconcilia. "Prefiero COM porque es Word real en vez de predecir o simular" |
| Modelo de edición | B1: contentEditable inline en la hoja. Acotado: párrafo de cuerpo editable inline; headings/citas/tablas/imagen conservan panel (estructura APA protegida) |
| Brecha de fidelidad | C-c: canvas miente ⇒ cualquier artefacto discrepa |
| Guards COM→LibreOffice→heurístico | **D-a COM duro**. Sin Office: aviso "Se requiere Microsoft Word". Eliminar fallback LibreOffice/heurístico del camino de render/export (sin tiempo ni interés en pulir LO) |
| Render en reposo | **Doble capa** (elegido por el asistente por calidad): PDF de Word vía `ExportAsFixedFormat` + pdf.js dibuja páginas detrás del HTML cuando hay reposo (~1.5s sin teclear) |

## 3. Enfoque

**Enfoque 1 con doble capa.** Word COM es la única autoridad de layout. HTML existe como superficie de escritura mientras hay mano en el teclado; en reposo y en export, render de Word.

### 3.1 Fases

#### Fase 1 — Geometría real + fin del desborde (prioridad A)
- Canvas consume geometría real del documento: `margins_cm` (padding de hoja calculado, no 54px fijo), `rules.page_size` (Letter/A4 con dimensiones pt reales), `line_spacing` aplicado a **todos** los bloques (headings, tablas, citas, no solo párrafos).
- Consumir paginación real ya existente: `elem.page_number` del backend para cortes de página; `computePages` deja de decidir cortes por heurística propia.
- Medición DOM real: `ResizeObserver`/`offsetHeight` por elemento → cualquier elemento que exceda la hoja se **parte** entre páginas (corte tipo Word), nunca se recorta. Fallback visual de reflow mientras no haya respuesta COM.
- Fix bug `font_size_pt` en `inplace_editor.py:143`.

#### Fase 2 — Endpoint de layout COM en vivo
- `POST /api/layout/paginate`: recibe `session_id` + cambios de elementos, ejecuta `Repaginate()` sobre el docx de sesión (reutiliza `word_com_service` singleton con GIT marshalling), devuelve por elemento: `page_start`, `line_cuts[]` (offsets de corte), y por página: dimensiones/márgenes reales.
- Frontend: debounce ~1.5s tras pausa de tecleo (coalescer, nunca encadenar repaginaciones en vuelo); respuesta aplica cortes reales al canvas.
- Eliminar estimaciones rivales: `StatusBar.tsx:41` (`Math.ceil(totalElements/14)`), paginación propia de `DocumentAIChat.tsx:384`.

#### Fase 3 — Edición inline B1
- contentEditable sobre el párrafo de cuerpo seleccionado; reflow instantáneo con medición DOM (feedback, no verdad).
- Enter → nuevo párrafo en modelo; Esc/blur → commit; conservar mapeo a `updateElementType`/modelo Pydantic existente.
- Headings, citas (`cita_ids`), tablas, imagen, portada: NO editables inline, siguen con panel/inspector.
- Sanitización: input del browser se normaliza a texto plano + marcas APA ya soportadas (`renderReviewedText`); cero formato arbitrario.

#### Fase 4 — Doble capa: PDF en reposo
- Tras ~1.5s sin tecleo (mismo gate que Fase 2): backend exporta PDF de sesión (`ExportAsFixedFormat`, ya existe en `post_processor.py:154-163`) → frontend renderiza vía pdf.js **detrás** del texto HTML alineado por página.
- Al volver a teclear: capa PDF se oculta (o baja opacidad) y HTML manda de nuevo.
- Alineación HTML↔PDF por offsets de página del layout real (mismo origen de verdad, sin doble predicción).

#### Fase 5 — Fidelidad de export + limpieza
- Verificar paridad canvas ↔ docx exportado con los mismos inputs (mismos `margins_cm`, `page_size`, `line_spacing`, `font_size_pt`).
- Guards D-a: rutas de render/export sin Word → error claro "Se requiere Microsoft Word"; eliminar motor LibreOffice y heurístico de `doc_converter.get_active_engine`, `page_layout_provider` y similares en esas rutas.
- Tests de paridad y regresión.

### 3.2 Dependencias entre fases

Fase 1 (geometría + cortes reales) es cimiento de todo. Fase 2 aporta verdad COM en vivo. Fase 3 se apoya en 1-2 (edita y repagina). Fase 4 se apoya en 2 (mismo gate de reposo). Fase 5 cierra con 1-4.

## 4. Riesgos

- **Latencia COM** (~0.5-2s/round-trip): mitigado con debounce + coalescer; nunca bloquear el tecleo (HTML manda mientras se escribe).
- **Alineación HTML↔PDF imperfecta**: mitigada porque ambos consumen el mismo layout COM; si difieren, PDF gana (autoridad Word).
- **Word no disponible**: D-a decide error explícito, no degradación silenciosa.
- **Procesos WINWORD fantasma**: reutilizar `word_com_service` singleton (liveness check + restart ya implementados); nunca `DispatchEx` por request en el hot path.

## 5. Fuera de alcance

- Editor colaborativo / OnlyOffice / ProseMirror-TipTap como engine completo.
- Soporte LibreOffice.
- Cambios al modelo Pydantic de elementos.
