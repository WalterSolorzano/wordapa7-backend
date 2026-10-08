# Diseño — Correcciones de Figuras y Tablas (revisión 2026-10-05)

> Estado: spec actualizada en chat y aprobada por el usuario el 2026-10-05. Sustituye a la
> revisión 2026-10-04, de la que se salva el modelo de decisiones D-1…D-6 y se descarta el
> catálogo legacy de estilos de tabla (`tableStyles` `standard|compact|expanded`) y los dos
> renders de tabla divergentes del lienzo. Pendiente de revisión final del archivo antes del plan.

## 1. Contexto y problema

El usuario reporta cuatro cosas sobre la previsualización de figuras y tablas:

1. **Corte.** Algunas imágenes o tablas se ven recortadas en la previsualización.
2. **Estilos de tabla inexistentes.** Las tablas "no tienen los ajustes de estilo que habíamos
   planeado". En la versión que usa nunca vio nada de estilos.
3. **Falta sección Estilo en el menú de edición.** El menú/barra que ya aparece al seleccionar
   imagen o tabla debe sumar una sección de estilo: **solo un ícono**, y al abrir, la lista de
   estilos de tabla. Si no existen, crearlos.
4. **Leyenda IA bajo la tabla.** Bajo las tablas de la previsualización debe aparecer la leyenda
   sugerida por la IA **con la mascota al lado**, o un botón **"Generar leyenda con IA"**, para no
   gastar tokens "a lo loco".

### Causa raíz verificada

- **Corte:** `src/lib/flowPagination.ts` documenta que los elementos no partibles (tablas, figuras)
  "van enteros — nunca se corta", pero la hoja en `src/components/layout/PaperCanvas.tsx`
  (render de página, `overflow: 'hidden'` + `PAGE_H` fijo) recorta físicamente cualquier elemento
  atómico más alto que el área útil. El comentario miente; el recorte es real.
- **Estilos:** los helpers ya existen y son puros —`src/lib/tablaRender.ts`
  (`normalizarSpans`, `matrizDeTabla`, `estiloDePreset`) y `src/components/figures/TablaRender.tsx`—
  pero **nadie los conecta en el lienzo**. `PaperCanvas` y `LienzoEditorialActivo` siguen con su
  propio `<table>` legacy y el map del store `tableStyles` (`'standard'|'compact'|'expanded'`).
  Por eso el usuario nunca vio los presets planeados.

## 2. Objetivos

- O1. Ninguna imagen ni tabla se recorta en la previsualización; nunca se sale de la hoja.
- O2. Los estilos de tabla planeados existen, se ven y se aplican de verdad (lienzo + export).
- O3. La barra contextual de imagen/tabla suma una categoría **Estilo**, colapsada por defecto,
  identificada por un **ícono SVG propio** (nunca una letra "Estilo"), que despliega los presets.
- O4. Bajo cada tabla se ofrece la leyenda IA con mascota o el botón de generar, **sin generación
  automática** (cero gasto de tokens hasta que el usuario hace clic).

## 3. No-objetivos

- Exportación PDF de los estilos nuevos.
- Colores libres por celda.
- Reescritura del in-place engine.
- Edición inline de celdas en `PaperCanvas` (solo lectura ahí; edición de celdas solo en el Taller).
- Emojis en la UI (prohibido por AGENTS.md). Solo íconos `lucide-react`.

## 4. Preferencias de UI capturadas del usuario (obligatorias)

- **Listas desplegables cerradas por defecto** para opciones discretas (estilos de tabla,
  orientación, etc.). No exponer series de botones ni letras sueltas.
- **Íconos vectoriales construidos con el estilo de la app** para tabs/categorías/secciones.
  Nunca etiquetas de una letra ni texto "Estilo"/"Texto" como reemplazo de ícono.
- Solo **design tokens**; cero hex hardcodeado. Cero emojis. Fidelidad de papel APA
  (`--paper-white` / `--paper-ink`) intacta en ambos temas.

## 5. Decisiones (D)

- **D-1 — El modelo es la fuente de verdad.** El estilo y la orientación de una tabla viven en
  `TableModel` (`table_info.style`, `table_info.orientation`), no en un map del store. Se retira
  `tableStyles` + `setTableStyle`.
- **D-2 — Presets, dos grupos.**
  - APA-safe: `apa` (default), `compact`, `expanded`.
  - No-APA: `grid`, `zebra`. Al elegirlos se muestra aviso "no APA".
  - Los cinco se aplican en el lienzo y se exportan.
- **D-3 — Orientación por tabla.** `auto | portrait | landscape`, reutilizando el mecanismo de
  sección horizontal (`_wrap_in_landscape_section`) en el export.
- **D-4 — Spans como metadata paralela.** `header_spans` / `row_spans` sin cambiar la forma
  `headers: string[]` / `rows: string[][]`.
- **D-5 — Edición de celdas solo en el Taller.** `PaperCanvas` muestra la tabla con su estilo,
  sin edición inline de celda.
- **D-6 — UN solo render de tabla.** `src/lib/tablaRender.ts` (lógica pura) +
  `src/components/figures/TablaRender.tsx` (pintura). Los dos renders legacy del lienzo se migran.
- **D-7 — Regla de corte (aprobada en chat, opción C).**
  - **Imagen:** escala para caber en el alto útil de la hoja. Nunca se recorta ni se sale.
  - **Tabla:** si no cabe, se **parte entre páginas por filas**, **repitiendo el encabezado**.
    No se reduce la fuente de la tabla.
  - **Nunca crece la hoja.** El `overflow: hidden` de la hoja deja de ser el mecanismo de
    recorte: se conserva como red de seguridad, pero el layout garantiza que nada excede.
- **D-8 — Cero generación automática de leyendas.** La sugerencia IA solo se pide al hacer clic.

## 6. Arquitectura

### 6.1 Modelo (fuente única)

**Frontend `src/types/index.ts`** ya define `TableStylePreset`, `TableOrientation`, `CellSpan` y
`TableModel` con `header_spans?`, `row_spans?`, `style?`, `orientation?`, `column_widths?`.

**Backend `python/models.py` (`TableModel`, línea 436)** hoy solo tiene `element_id`, `headers`,
`rows`, `caption`, `note`, `table_number`. Hay que agregarle, con defaults, los mismos campos
opcionales para que no se pierdan al persistir/transportar:

```
header_spans: Optional[list[CellSpan]] = None
row_spans: Optional[list[list[CellSpan]]] = None
style: str = "apa"            # TableStylePreset
orientation: str = "auto"     # auto | portrait | landscape
column_widths: Optional[list[float]] = None
```

`CellSpan{col,row}` se agrega como modelo Pydantic. El enum backend `TableBorderStyle` (solo
`apa`/`grid`) se mantiene para el export; los presets de UI se mapean a él (ver 6.5).

### 6.2 Render compartido

- `src/lib/tablaRender.ts`: lógica pura (spans, matriz, preset→claves). Se le suma el helper puro
  de **partición por filas** para el corte (ver 6.4).
- `src/components/figures/TablaRender.tsx`: pintura. Recibe `tabla`, `estilo?`, `editable?`,
  `onEditarCelda?`. Se le agregan props opcionales:
  - `filaInicio?`, `filaFin?` (para el fragmento de página),
  - `repetirEncabezado?: boolean` (fragmentos tras el primero),
  - `mostrarLeyenda?: boolean` (la leyenda solo en el primer fragmento).
- Consumidores: `PaperCanvas` (modo lectura, `editable=false`), `LienzoEditorialActivo`
  (Taller, `editable=true`), y `LecturaProsaSeccion` (ya migrado).

### 6.3 Estilos de tabla en la barra contextual (ask #3)

Barra contextual actual: `PaperCanvas.tsx` ~1158–1263, visible cuando `selectedElementId` es
imagen o tabla. Se agrega, **para tablas**, una categoría **Estilo**:

- Cabecera con **un solo ícono** (`lucide-react`, p. ej. `Palette` o `Paintbrush`) + chevron.
- Colapsada por defecto (dropdown cerrado). Al abrir, lista de presets `apa`, `compact`,
  `expanded`, `grid`, `zebra`, cada uno como fila ícono+texto.
- Elegir uno ejecuta `updateElementTable(id, { ...table_info, style: preset })`.
- Los presets no-APA muestran el aviso "no APA" en la fila.
- El mismo componente de dropdown se usa en el Taller y el Inspector.

En `InspectorActivoTabs.tsx` hoy las tabs Formato y Estilo se **ocultan** para tablas
(`esTabla ? [] : [...]`). Se reemplaza ese ocultamiento por una categoría de estilo de tabla
alimentada por los mismos presets (sin mezclar con los `STYLE_PRESETS` de imagen).

### 6.4 Corte: paginación consciente de figuras y tablas (ask #1, D-7)

- **Imagen:** en `PaperCanvas` la imagen (simple y multipanel) se pinta con alto máximo
  `min(alto declarado, contentH)` y `object-fit: contain`, centrada. Si el alto declarado excede
  el área útil, se escala. Nunca se recorta.
- **Tabla:** el paginador trata las tablas como **partibles por filas**.
  - `flowPagination`/`pageSplitter`: hoy solo parte texto. Se agrega manejo de tabla con
    medición por fila (altura de encabezado + alturas de fila). Si el total no cabe, se reparte
    en fragmentos por página; el encabezado se repite en cada fragmento.
  - `FlowChunk` gana `startRow`/`endRow` opcionales. `TablaRender` los consume con
    `repetirEncabezado` y `mostrarLeyenda` (leyenda+nota solo en el primer fragmento).
  - Fallback sin medición por fila: estimación por número de filas (la heurística actual
    `max(3, ceil(rows*0.8))` se reemplaza por un estimado por fila).
  - Regla APA: al continuar, el encabezado se repite; si la tabla trae nota, se conserva al final.
- La hoja mantiene `overflow: hidden` como red de seguridad, pero ya nada debería exceder.
- No cambia el comportamiento de la portada: `computePages` sigue agrupando todos los elementos
  `is_cover_section`/`portada_block` en la Página 1, indivisibles.

### 6.5 Export

- El motor de export (`python/generation/generator.py`, `table_engine.set_table_borders`) acepta
  hoy `"apa"`/`"grid"`. Mapeo de presets de UI → export:
  - `apa`, `compact`, `expanded` → borde `"apa"` (los tres cambian padding/fuente, no el borde).
  - `grid`, `zebra` → borde `"grid"` (no-APA).
- `orientation: landscape` reutiliza la sección horizontal (`_wrap_in_landscape_section`).
- `column_widths` se aplican vía `fit_table_to_page(...)`.
- Sin PDF nuevo.

### 6.6 Mascota + leyenda IA bajo tablas (ask #4)

Patrón ya existente y reutilizable: bloque mascota en `LienzoEditorialActivo.tsx` ~374–476
(`data-testid="figura-mascota"`, `DocumentMascot`, tarjeta "¿Uso esta leyenda?" con
`Aplicar`/`Regenerar`). Se porta a la previsualización **bajo cada tabla**:

- Sin leyenda: se muestra la **mascota en reposo** + botón **"Generar leyenda con IA"**.
  Al hacer clic recién se llama a `suggestCaption(session_id, elem.id, contextText, apiKey)`.
- Con sugerencia: tarjeta con la leyenda propuesta y botones **Aplicar** / **Regenerar**.
- **Prohibido** disparar `suggestCaption` al cargar el documento o al montar la tabla (cero tokens
  automáticos). El botón es la única puerta.
- Estados: `sin-leyenda` (mascota + botón), `cargando`, `con-leyenda`, `error`.
- Se elimina la dependencia del render legacy de tabla y de `CaptionSuggestionBadge` en esta ruta.

## 7. Workstreams

- **WS1 — Corte.** Imagen escala-a-caber; tabla partible por filas con encabezado repetido.
  Archivos: `flowPagination.ts`, `pageSplitter.ts`, `PaperCanvas.tsx`, `tablaRender.ts`,
  `TablaRender.tsx`.
- **WS2 — Estilos reales.** Retirar `tableStyles`/`setTableStyle` (6 usos: `store/types.ts:67-68`,
  `documentSlice.ts:187,252`, `PaperCanvas.tsx:482,1711`). Migrar los dos renders legacy a
  `TablaRender`. Agregar campos a `python/models.py`. Mapear presets en export.
- **WS3 — Sección Estilo en barra contextual.** Nueva categoría colapsada solo-ícono, dropdown de
  presets, aviso "no APA", en `PaperCanvas` y en `InspectorActivoTabs`.
- **WS4 — Mascota + leyenda IA.** Portar el patrón de mascota del Taller bajo las tablas de la
  previsualización, con botón de generar y sin generación automática.
- **WS5 — Spans en render/export.** `header_spans`/`row_spans` en matriz y export.

## 8. Testing

- Unit `tablaRender.ts`: `normalizarSpans`, `matrizDeTabla`, `estiloDePreset`, y la nueva
  partición por filas (encabezado repetido, leyenda solo en el primer fragmento).
- Render: `TablaRender` con `filaInicio/filaFin`, `repetirEncabezado`, `mostrarLeyenda`.
- `PaperCanvas`: imagen que excede el área útil se escala (no se recorta); tabla larga se parte y
  repite encabezado. Portada intacta (Página 1 indivisible).
- Barra contextual: la categoría Estilo aparece solo para tablas, cerrada por defecto, con ícono
  (no letra); elegir preset persiste en `table_info.style`.
- Mascota: aparece bajo la tabla sin leyenda con el botón; **no** se llama a `suggestCaption` en
  el montaje (assert de que no se disparó la red).
- Retiro de `tableStyles`: assert de que ya no se lee/escribe; `setTableStyle` ausente del store.
- Backend: `TableModel` conserva `style/orientation/header_spans/row_spans/column_widths` en
  ida/vuelta; mapeo de presets a `set_table_borders`.

## 9. Casos borde

- `vMerge` que arranca en la fila de encabezado.
- Fila con menos celdas que el ancho visual.
- Celda con URL larga (no debe desbordar la hoja; `word-break` en el wrapper).
- Leyenda legítima que ya empieza con "Figura 1." (no duplicar el rótulo).
- Documento con secciones landscape preexistentes (`preserve_landscape`).
- Tabla que cabe exacto en el límite del área útil (no debe saltar de página por redondeo).
- Imagen con `height_cm` declarado mayor al área útil (se escala, no se recorta).

## 10. Rollout

1. Actualizar spec (este archivo) y commitear.
2. Revisión del usuario sobre el archivo.
3. `writing-plans` → plan de implementación.
4. Ejecución con TDD por workstream; tests focalizados y luego suite completa pre-commit.
