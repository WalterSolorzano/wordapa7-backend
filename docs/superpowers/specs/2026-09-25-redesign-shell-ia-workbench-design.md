# Rediseño del shell y del workbench de Revisión & IA

- **Fecha**: 2026-09-25
- **Origen**: `inspiracion/redesign_mockup.html` (mockup de otra IA)
- **Alcance**: shell global + 6 fases de adaptación profunda en Portada, Revisión y Exportación
- **Enfoque**: shell nuevo + vistas compuestas (enfoque B)

## 1. Intención

Trasplantar al producto la gramática visual del mockup: topbar de 48px, rail de iconos de 56px que
solo se expande al pasar el mouse, y un workbench cuyo centro es una tarjeta de lectura que muestra
un párrafo con resaltados inline por motor. La paleta del mockup ya existe en
`src/styles/design-system.css` (`--color-accent: #4f7cff`, `--color-bg-canvas`,
`--color-bg-surface`, `--color-border-subtle`): esto es un trasplante, no una paleta nueva.

El objetivo declarado del usuario: la representación de cada párrafo a corregir, su tipografía y sus
colores de resaltado. Secondary: una app con una sola gramática de navegación, no dos.

## 2. Decisiones tomadas

| Decisión | Valor | Razón |
|---|---|---|
| Alcance | Shell completo + adaptación profunda de Portada, Revisión y Exportación | El usuario lo pidió así; las fases 2-4 reciben el shell pero conservan su layout interno |
| Centro de Revisión | Tarjeta de lectura por defecto, con toggle a hoja paginada | El mockup solo muestra la tarjeta y es lo que más le gustó |
| Rail | 56px fijos, flyout lateral de 240px al hover, pin por clic | El usuario pidió explícitamente que sea más pequeño salvo al pasar el mouse |
| TopBar | Mínimo (título + guardado + avatar), resto en menú de desbordamiento | El mockup es minimalista y la barra actual tiene ~10 controles |
| Tipografía de la tarjeta | Sans de lectura del mockup, 16px, auto-ajustada | Decisión explícita del usuario, sobre la alternativa serif de documento |
| Fases 2-4 | Solo shell | Prioriza el resultado visible sobre la coherencia total |
| Inicio (`Step0QuickStart`) | Adopta el mismo `IconRail` | Una sola gramática de navegación en toda la app |
| Piso de tamaño de fuente | 13px | El usuario pidió auto-ajuste "sin letras hormigas" |

## 3. Arquitectura

### 3.1 Unidades nuevas

| Archivo | Responsabilidad única |
|---|---|
| `src/components/shell/AppShell.tsx` | Frame de la app: `TopBar` + `app-main`(`IconRail` + workbench) + `StatusBar` |
| `src/components/shell/IconRail.tsx` | Columna de 56px, iconos, badges de estado, grupos arriba/abajo |
| `src/components/shell/RailFlyout.tsx` | Panel de 240px que se abre al hover, con etiqueta, estado y `OutlineTree` |
| `src/components/shell/railItems.ts` | Array declarativo `RAIL_ITEMS`, compartido por editor e Inicio |
| `src/components/toolbar/ToolbarOverflowMenu.tsx` | Menú de desbordamiento de la topbar |
| `src/components/review/ReviewWorkbench.tsx` | Layout de Revisión: strip + grid de 3 columnas |
| `src/components/review/ReviewStrip.tsx` | Barra de 44px: chips de motor, pager, `Foco | Hoja` |
| `src/components/review/FocusReadingCard.tsx` | Tarjeta de lectura con párrafo auto-ajustado |
| `src/components/review/ReadingText.tsx` | Párrafo con `<mark>` inline por motor (implementation única) |
| `src/components/review/EngineGroupCard.tsx` | Grupo de motor con acción en masa |
| `src/components/review/SubtypeRow.tsx` | Fila `original → sugerido ×N` con su acción |
| `src/components/review/FindingDetail.tsx` | Detalle de la fila abierta, con navegación entre ocurrencias |
| `src/hooks/useReviewWorkbench.ts` | Capa de datos de Revisión, sin JSX |
| `src/hooks/usePageIndex.ts` | Índice elemento→página desde `computePages` real |
| `src/hooks/useAutoFitText.ts` | Búsqueda binaria de `fontSize` en `[13, 19]px` |
| `src/lib/commentContext.ts` | `buildCommentContext()` único |

### 3.2 Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Monta `AppShell`; borra el `leftSidebarWidth` local muerto (213-246); el rail se monta siempre |
| `src/components/toolbar/UnifiedToolbar.tsx` | Se adelgaza a la gramática del mockup; conserva el nombre para no romper el import |
| `src/components/wizard/StepRail.tsx` | Se elimina; su contenido pasa a `IconRail` + `RailFlyout` |
| `src/components/wizard/Step5AuditIAWizard.tsx` | Baja a 5 líneas y renderiza `<ReviewWorkbench/>` |
| `src/components/export/ExportView.tsx` | Chrome del shell, botón fantasma "Convertir otro", borra código muerto, arregla el `useEffect` de `Ctrl+S` |
| `src/components/wizard/CoverCarouselStudio.tsx` | Chrome nuevo: strip de estrategias + centro + panel de 320px |
| `src/components/wizard/Step0QuickStart.tsx` | Pierde su sidebar propio, adopta `IconRail` |
| `src/store/slices/uiSlice.ts` | Entra `railPinned`; salen `leftSidebarWidth` y `setLeftSidebarWidth` |
| `src/components/layout/PaperCanvas.tsx` | Importa `ReadingText` y `buildCommentContext`; deja de duplicarlos |
| `src/styles/design-system.css` | Entra `--mark-ai-bg` (claro y oscuro) |

### 3.3 Flujo de datos

`useDocStore` → `useReviewWorkbench()` → `ReviewWorkbench` → strip, minimapa, tarjeta y rack.
`usePageIndex()` se consume una sola vez en `ReviewWorkbench` y reparte `marks` y `currentPage` a los
tres hijos que las necesitan, para que no puedan divergir. Ningún componente de `src/components/review/`
lee del store directamente salvo el hook.

## 4. Shell

### 4.1 TopBar (48px)

Fondo `--color-bg-surface`, borde inferior `--color-border-subtle`, `display: grid` con tres zonas.

- Izquierda: botón logo (`BookOpen` + "WordAPA7", abre `FileMenu`), `span` de **solo lectura** con el
  nombre del documento, 420px con ellipsis, y chip de estado de guardado.

  El mockup usa un `input` editable y el spec lo exigía, pero **no existe endpoint de renombrado** en
  `src/api`: no hay `rename`, `setDocTitle` ni `updateDocName`. Un `input` editable sin persistencia
  sería una mentira —el usuario escribiría un nombre que nadie guarda y que desaparecería al
  recargar—, y un setter de store que solo vive en memoria empeoraría la mentira. El título se
  muestra, no se edita, hasta que exista el endpoint. **Enmendado en la Task 7.**
- El chip de guardado se conecta a `hasUnsavedChanges`, que es estado real y mantenido
  (`documentSlice.ts:538` lo activa en cada cambio de historia; las tres rutas de export lo limpian).
  Cuando está limpio dice "Guardado" con un check; cuando no, dice "Sin guardar" en
  `--color-warning`. Un chip que siempre dice "Guardado" afirmaría algo falso sobre estado que el
  usuario controla —y el propio `FileMenu.tsx:175` sigue consultando ese campo para proteger el
  documento al cerrar.
- Derecha: botón Copiloto IA con contador de issues, `MoreHorizontal`, avatar de 28px con la inicial.
  El botón logo no lleva `aria-expanded`; solo el de "Más acciones", que sí abre un popover.

El menú de desbordamiento abre con una entrada **Inicio** (volver a la pantalla de bienvenida). Al
adelgazar la barra, `goHome` se quedó sin ningún caller en la app: sin esta entrada, con un documento
abierto la pantalla de inicio solo volvía cerrando el documento, y tanto `goHome` como la bandera
`atHome` quedaban como código muerto. **Añadido en la Task 7.**

El menú de desbordamiento, en orden: Deshacer · Rehacer · separador · Puntuación APA · Módulos APA ·
Copiar PDF para WhatsApp · separador · Complemento de Word · Instalar actualización (solo si
`updateState === 'downloaded'`) · separador · Tema · Ajustes. `APAScoreCard` y `APAModuleToggles` se
conservan como componentes y se invocan desde el menú.

### 4.2 IconRail (56px)

`width: 56px`, `flex-shrink: 0`, fondo `--color-bg-surface`, borde derecho `--color-border-subtle`,
`padding: 12px 0`, `gap: 8px`. Botones de 40×40, `--radius-md`, fondo transparente; hover
`--color-bg-surface-alt` con `--color-text-primary`; activo `--color-accent-soft` con
`--color-accent`. Punto de 6px en `top/right: 6px` cuando la fase tiene hallazgos pendientes.
Dos grupos separados por un hairline: las 6 fases arriba, Ajustes y Tema abajo.

Los destinos provienen de `railItems.ts`, un array declarativo, para que editor e Inicio compartan
la gramática sin duplicarla. Las fases son: Portada, Estructura, Figuras, Referencias, Revisión, Exportar.

### 4.3 RailFlyout (240px)

`position: absolute`, `left: 64px`, `--radius-md`, `--shadow-card`, `--color-bg-surface`.
Se abre con `mouseenter` sobre el rail y se cierra con `mouseleave` del conjunto rail+flyout más
120ms de gracia para que el puntero cruce el hueco. Clic en el icono fija el flyout hasta otro clic
(`railPinned` en `uiSlice`); `Esc` lo cierra. Flota **sobre** el workbench, no lo empuja.

Contenido por destino: etiqueta, estado (listo / N pendientes / en curso) y, en las fases de sección,
el `OutlineTree` que hoy vive dentro de `StepRail`.

### 4.4 ProjectTabs

Se mantiene montado, pero solo pinta su strip de 36px cuando hay 2 o más pestañas. Con una sola, el
nombre del proyecto vive en la topbar.

## 5. Revisión & IA

Grid de tres columnas: minimapa de 19px (`ReviewMinimap` sin cambios) | tarjeta de lectura flexible |
rack de 400px. Fondo `--color-bg-canvas`, `padding: 20px 24px`, `gap: 20px`.

### 5.1 ReviewStrip (44px)

Fondo `--color-bg-surface`, borde inferior `--color-border-subtle`.

- Izquierda: chips `Todo · Ortografía · Redacción & Bloom · Patrones IA · Citas · Estructura`, con
  contador de 10.5px bold. Activo: `--color-accent-soft` + `--color-accent`, peso 600.
- Derecha: chip de cumplimiento APA, `Página X de N` con flechas, `Siguiente hallazgo` sólido y el
  toggle `Foco | Hoja`.

El chip activo filtra a la vez los grupos del rack y las marcas del minimapa.

### 5.2 FocusReadingCard

`--color-bg-surface`, borde `--color-border-subtle`, `--radius-lg`, `padding: 32px 40px`,
`--shadow-sm`, `overflow-y: auto`. Encabezado de 11.5px en `--color-text-tertiary`: `SECCIÓN ·
PÁGINA N` a la izquierda, `k hallazgos en este bloque` a la derecha, hairline debajo.

### 5.3 Ajuste de tamaño del párrafo

`useAutoFitText` mide el contenedor con `ResizeObserver` y hace una búsqueda binaria de `fontSize`
en `[13px, 19px]` tal que el texto quepa en 26 líneas sin scroll interno. `lineHeight` entre 1.75 y
1.85 según el tamaño. Si ni con 13px cabe, se detiene el auto-ajuste y la tarjeta scrollea.

**El piso de 13px es ley.** Ninguna ruta, tema ni longitud de párrafo puede producir texto por debajo
de ese tamaño.

### 5.4 Colores de resaltado

| Motor | Fondo | Subrayado |
|---|---|---|
| Ortografía | `--severity-critical-soft` | `2px solid --color-danger` |
| Redacción & Bloom | `--color-accent-soft` | `2px solid --color-accent` |
| Patrones IA | `--mark-ai-bg` | `2px dashed --color-text-secondary` |
| Citas | `--severity-warning-soft` | `2px solid --color-warning` |

`--mark-ai-bg` es el único token nuevo, definido en claro y oscuro. Con él desaparecen los rgba
hardcodeados de `renderReviewedText`.

### 5.5 Rack de hallazgos

`EngineGroupCard` con cabecera en `--color-bg-surface-alt` y la acción en masa pegada a la derecha:
`Aceptar todas` para motores objetivos, `Marcar todos` y `Marcar para revisar` para el detector de IA,
que nunca ofrece "Aceptar". `SubtypeRow` muestra `original → sugerido`, `×N` y `pág. 3, 14, 22…`.
`FindingDetail` aparece bajo la fila abierta, con navegación entre ocurrencias.

Solo el grupo de mayor severidad abre por defecto. La tira HUD de tres cajas desaparece; el
cumplimiento APA queda como chip en la strip.

## 6. Exportación

Columna única a la izquierda: `padding: 60px 48px`, `max-width: 440px`, alineada al inicio, sin
scroll. Orden fijo: check de 22px en `--color-success` → `h1` de 22px → una línea de `max-width:
50ch` → dos botones pegados con 8px de separación (sólido `--color-accent`, fantasma con borde
`--color-border-subtle`). El fantasma nuevo es "Convertir otro", que llama a `goHome()`.

Sin listas, tarjetas, columnas, scroll ni resúmenes de hallazgos. Formato, opciones y vista previa
permanecen bajo `optionsOpen`, sin cambios de lógica. `DownloadSuccessOverlay` no se toca.

**Enmendado:** el disparador de `optionsOpen` es un enlace textual terciario **debajo** de los dos
botones, no el propio botón fantasma. El JSX del plan ponía "Convertir otro" donde estaba el fantasma y
dejaba el panel sin disparador, con lo cual PDF y LaTeX quedaban inexportables y la vista previa perdía
su único acceso — contradiciendo el párrafo anterior de esta misma sección. El orden fijo se refiere a
las cuatro piezas *principales*; un enlace terciario debajo no reordena ninguna. La columna queda:
icono → título → línea → dos botones → "Opciones".

Se borran `ICON_PALETTES` y `summaryItemStyle` (código muerto) y se le añade el array de dependencias
al `useEffect` del atajo `Ctrl+S`, que hoy se re-registra en cada render.

## 7. Portada

Misma receta de workbench: strip de 44px con los chips de estrategia, carrusel de miniaturas al
centro, `CoverEditorPanel` a 320px a la derecha. Solo chrome y tokens; la lógica del carrusel, la
previsualización skeleton y la navegación quedan intactas.

La divisibilidad de portada en `computePages` y la protección de `use_original_cover` no se tocan.

## 8. Inicio

`Step0QuickStart` pierde su sidebar propio de 64px y adopta `IconRail` con su propio juego de
destinos: Inicio, Recientes, Nueva transformación, Ajustes, Complemento de Word. El hero se
re-tokeniza y alinea su `padding` a 60/48.

## 9. Arreglos de datos incluidos

Estos dos entran porque la tarjeta de lectura nueva depende de ambos.

**Páginas falsas.** Muere `elementPageMap`, que estimaba 1800 caracteres por página mientras el
minimapa usaba el `computePages` real, de modo que un hallazgo podía caer en una página que el
minimapa no marcaba. Entra `usePageIndex`, con un solo consumidor que reparte `marks`, `currentPage`
y el mapa del flyout. Mientras un motor no se haya ejecutado, sus grupos se muestran sin número de
página, nunca con uno inventado.

**`commentCtx` duplicado.** `PaperCanvas.tsx:894` y `PaperCanvas.tsx:594` construían el contexto con
reglas distintas de `styleAuditRun`, produciendo subrayados huérfanos cuando solo había corrido el
corrector. Entra `buildCommentContext()`; las dos llamadas pasan por ahí y `ReadingText` es el tercer
consumidor.

## 10. Fuera de alcance

Deuda anotada, no resuelta aquí:

- Las dos vocabularios de motor (`ToolWindowId` de 5 frente a `ScanEngineId` de 3) y su tabla de mapeo.
- El resto de hex hardcodeados en `SplitDiffPreview` y `WhatsAppComment`.
- Estado muerto restante: `SettingsMenu` inalcanzable desde el editor y `contentReview.ts` sin
  consumidor fuera de sus tests.

## 11. Pruebas

Los 125 tests actuales siguen en verde sin reescribir ninguno:
Despite su nombre, `editorRailToggle.test.tsx` prueba el toggle de `RightSidePanel` y no el rail, así
que no le afecta el rediseño. Los tests que sí muerden el shell son `reviewHighlight.test.tsx` y
`reviewMinimapKeyboard.test.tsx`, que se actualizan cuando `ReadingText` y el rack cambien de
implementación.

Nuevos:

- El hover abre el flyout y la gracia de 120ms lo cierra al salir del conjunto.
- El clic fija el flyout y `Esc` lo suelta.
- La tarjeta de lectura se mantiene en 13px con un párrafo de 3000 caracteres y sube a 19px con uno
  de 200. Ningún caso produce menos de 13px.
- El chip activo filtra el rack y el minimapa a la vez.
- El grupo que abre por defecto es el de mayor severidad.
- La columna de exportación mantiene el orden icono → título → línea → botones.
- Un test de lint falla si los archivos nuevos traen hex literal.

## 12. Restricciones heredadas que se siguen

Cero emojis. Solo variables CSS, sin hex. `--paper-white` siempre `#ffffff` con `--paper-ink`
`#111827` en ambos temas. El rail y el workbench usan `--icon-stroke: 1.75` como el resto de la app.
