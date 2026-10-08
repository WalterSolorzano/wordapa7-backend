---
name: WordAPA7
description: Entorno de escritorio editorial académico con fidelidad de hoja APA 7 e interfaz Fluent
colors:
  primary: "#4f7cff"
  primary-hover: "#3b66e0"
  primary-soft: "rgba(79, 124, 255, 0.10)"
  canvas-bg: "#f5f6f8"
  surface-bg: "#ffffff"
  surface-alt: "#eef0f4"
  surface-hover: "#e8eaf0"
  border-subtle: "rgba(0, 0, 0, 0.09)"
  border-strong: "rgba(0, 0, 0, 0.15)"
  text-primary: "#1a1a2e"
  text-secondary: "#4a4a5e"
  text-tertiary: "#6b6b80"
  success: "#38a017"
  warning: "#d48806"
  danger: "#d4382e"
  paper-white: "#ffffff"
  paper-ink: "#111827"
typography:
  display:
    fontFamily: "'Inter', 'Segoe UI Variable', -apple-system, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "'Inter', 'Segoe UI Variable', -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "'Inter', 'Segoe UI Variable', -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  paper-academic:
    fontFamily: "'Times New Roman', Times, serif"
    fontSize: "12pt"
    fontWeight: 400
    lineHeight: 2.0
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "18px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
---

# Design System — WordAPA7

## Overview

WordAPA7 combina dos mundos visuales con límites estrictos e infranqueables:
1. **El Entorno de la Aplicación (Shell / Chrome)**: Interfaz de escritorio inspirada en Microsoft Fluent Design, con modo claro y oscuro, tipografía *Inter*, bordes de 1px con opacidad sutil y jerarquía limpia sin ruidos visuales.
2. **El Lienzo Editorial (Paper Canvas)**: Simulación 1:1 de una hoja de papel físico Carta (8.5" x 11") APA 7ma edición. La hoja es **siempre blanca inmutable** (`#ffffff`) con tinta de máximo contraste (`#111827`), márgenes exactos de 1 pulgada (2.54 cm) e interlineado doble (2.0), independientemente del tema de la aplicación.

## Colors

- **Primario / Acento (`{colors.primary}`)**: `#4f7cff`. Usado para elementos interactivos principales, estados activos y focus rings accesibles.
- **Superficie y Canvas**:
  - Claro: Fondo de aplicación `{colors.canvas-bg}` (`#f5f6f8`), paneles `{colors.surface-bg}` (`#ffffff`).
  - Oscuro: Fondo de aplicación `#0f0f11`, paneles `#18181c`.
- **Papel APA 7 (Innegociable)**:
  - Fondo de hoja: `{colors.paper-white}` (`#ffffff`).
  - Tinta de texto: `{colors.paper-ink}` (`#111827`).
- **Estados Semánticos**:
  - Éxito / Área dominada: `{colors.success}` (`#38a017`).
  - Advertencia: `{colors.warning}` (`#d48806`).
  - Error crítico / Cita huérfana: `{colors.danger}` (`#d4382e`).

## Typography

- **UI Shell**: *Inter*, *Segoe UI Variable*, sistema sans-serif. Diseñada para legibilidad densa en herramientas de escritorio (11px labels, 13px controls, 14px body).
- **Micro-escala de inspectores** (paneles laterales densos, p. ej. `InspectorActivoTabs`): tres roles fijos — *kicker* de sección `10px/700/versalitas` (tertiary, retrocede), etiqueta de campo `11px/500` (secondary) y valor de control `12px` (primary). Son un escalón deliberado por debajo del shell general: la jerarquía la cargan peso, caja y tono —no solo el tamaño— y nunca se usa un valor intermedio no listado.
- **Hoja APA 7**: *Times New Roman* (12pt), *Calibri* (11pt), *Arial* (11pt) o *Georgia* (11pt). Interlineado reglamentario 2.0 y sangría de primera línea / francesa de 0.5 pulgadas (1.27 cm).

## Layout

- **Estructura Flex Horizontal**:
  - `StepRail` (lateral izquierdo redimensionable): navegación de fases editoriales (Portada, Títulos, Figuras, Referencias, Exportar).
  - `PaperCanvas` / `PDFPreview` (zona central expandida): el documento como protagonista absoluto sobre un backdrop de lienzo.
  - `RightSidePanel` (lateral derecho integrado): inspector contextual de propiedades, asistentes y validador sin superposición destructiva.

### Reasignación de espacio según la tarea

El layout no es fijo entre pantallas: **el espacio se le quita a lo que ya está decidido y se le da a lo que hay que examinar ahora**. Reglas vigentes:

- **Vista "Revisión & IA" (paso 5)** — `Step5AuditIAWizard.tsx` + `ReviewMinimap.tsx`:
  1. **Tres columnas**: minimapa angosto (~19px) con una marca por página coloreada según el motor que detectó hallazgos ahí y la página actual resaltada con contorno de acento (ubicación en cientos de páginas sin scroll a ciegas) → documento central con hallazgos resaltados *inline* (`reviewHighlightIds`, sin bloques separados) → columna derecha de hallazgos agrupados.
  2. **Agrupación, nunca fila por aparición**: cada motor es un grupo colapsable (encabezado + conteo total + acción masiva); dentro, **una fila por subtipo** con contador `×N` y acción propia. Por defecto solo está expandido el grupo con más hallazgos críticos.
  3. **Acciones según certeza del motor**: motores con corrección objetiva (ortografía, Bloom, estructura APA, citas) usan botón sólido "Aceptar / Aceptar todas"; el motor probabilístico (detector de IA) usa **solo** botón fantasma "Marcar para revisar" — nunca "Aceptar", nunca con el mismo peso visual.
  4. **Barra superior con dos zonas**: chips de filtro por motor con conteo (izquierda) y navegación `Página X de N` + "Siguiente hallazgo" (derecha). Nunca todo mezclado en una sola fila.
  5. Al entrar al paso 5, `StepRail` se colapsa a solo iconos (56px) y restaura su ancho al salir; `RightSidePanel` no se renderiza.

- **Pantalla final de exportación / descarga** — `ExportView.tsx` + `DownloadSuccessOverlay.tsx` (inverso de la vista de revisión: la pantalla con menos elementos del flujo):
  1. **Una sola columna alineada a la izquierda** (no centrada: continuidad del flujo, no pantalla de celebración). Orden vertical: ícono de éxito pequeño → título → **una** línea de descripción (máx. ~50 caracteres de ancho) → dos botones pegados (principal sólida + secundaria fantasma).
  2. Nada de listas, tarjetas, columnas ni scroll en estado por defecto. Formato, opciones, aviso de citas fantasma y vista previa viven ocultos bajo el botón "Opciones" (toggle "Previsualizar" para el panel derecho).
  3. **No se repiten** aquí resúmenes de hallazgos ni estadísticas: eso ya se mostró en la vista de revisión. El espacio en blanco es intencional: después de la pantalla más densa del flujo, el contraste es lo que comunica "terminado".

## Elevation & Depth

- **Capas Tonalmente Planas**: Preferencia por bordes perimetrales finos de 1px (`{colors.border-subtle}`) sobre sombras pesadas.
- **Sombra de Papel**: La hoja física proyecta `0 4px 16px rgba(0, 0, 0, 0.14)` para despegar el documento del canvas backdrop.
- **Overlays / Diálogos**: Elevación `var(--z-modal)` (1000) con backdrop difuso de `rgba(0,0,0,0.45)`.

## Shapes

- Controles y botones estándar: `{rounded.md}` (8px).
- Paneles y tarjetas contenedoras: `{rounded.lg}` (12px).
- Píldoras de estado y contadores de auditoría: `{rounded.full}` (9999px).
- La hoja de papel no tiene redondeo (`border-radius: 0`), replicando fielmente el corte físico de imprenta.

## Components

- **UnifiedToolbar**: Barra superior continua que concentra la identidad, el menú de archivo, los toggles de exclusión de módulos APA, el botón de exportación rápida a WhatsApp y el gatillo del Copiloto IA.
- **APAModuleToggles**: Conjunto de chips independientes con iconos vectoriales SVG para activar o tachar qué módulos normalizar en el documento.
- **CoverCarouselStudio**: Selector de carrusel horizontal con previsualización en vivo de portadas institucionales.
- **PaperCanvas**: Renderizador con paginación geométrica estricta y protección de portada indivisible.
- **ReviewMinimap**: Minimapa de ~19px con una marca por página (color = motor dominante, página actual con contorno de acento) para ubicarse en documentos de cientos de páginas.
- **AiMosaic**: Mapa de calor de IA. El documento entero como cuadritos en orden de sección, en su propio modo de vista (no es una columna más de la revisión). **El color carga UNA sola variable: la intensidad.** Motor, severidad y tipo de problema van como texto; si el color también los codificara, tres variables competirían por el mismo canal y la vista dejaría de leerse. El **área** de cada bloque es su cantidad de párrafos (canal distinto, variable distinta); el **número impreso** es el porcentaje.
- **ExportView / DownloadSuccessOverlay**: Pantalla final de descarga en columna única alineada a la izquierda; dos botones pegados (sólida + fantasma), resto bajo toggle.

### Rampa de intensidad de IA (`--ia-nivel-1..4`)

Cuatro escalones, no un degradado: doce matices no se ordenan de un vistazo, cuatro sí. Es **una sola tinta** —la del `--color-danger` de cada tema—, así que no se introduce una familia de color que el resto de la app no tiene.

| Token | Claro | Oscuro | Lectura |
|---|---|---|---|
| `--ia-nivel-1` | `rgba(212, 56, 46, 0.06)` | `rgba(255, 77, 79, 0.10)` | nada |
| `--ia-nivel-2` | `rgba(212, 56, 46, 0.16)` | `rgba(255, 77, 79, 0.24)` | algo |
| `--ia-nivel-3` | `rgba(212, 56, 46, 0.34)` | `rgba(255, 77, 79, 0.48)` | bastante |
| `--ia-nivel-4` | `#d4382e` | `#ff4d4f` | casi todo |

**El escalón 1 es casi neutro a propósito.** Una sección donde el detector no vio nada no es una advertencia, y si su cuadrado se viera levemente rojo el mapa estaría mintiendo sobre la mitad del documento.

**Los cortes son del documento, no absolutos** (percentiles P30/P60/P90 de *ese* documento), y con la regla de que **el escalón 4 es una excepción**: si todas las secciones se parecen, ninguna llega a 4 y el mapa se lee neutro. Sin esa regla, un documento uniforme sale entero en rojo de alarma, el usuario lee "peligro" veinte veces y no lee nada — que es el modo de fallo exacto de "mucho color pero que no se vea cargado".

## Do's and Don'ts

### Do's
- Usar siempre variables CSS semánticas (`var(--accent-primary)`, `var(--paper-white)`).
- Diseñar pensando en una herramienta de escritorio ágil, densa y respetuosa del espacio de lectura.
- Usar iconos SVG vectoriales nítidos a 14-16px con `stroke-width: 1.75`.
- Emplear curvas de aceleración limpia `cubic-bezier(0.16, 1, 0.3, 1)` para micro-interacciones.

### Don'ts
- **NUNCA usar emojis** en ninguna cadena de texto, botón, mensaje o diálogo.
- **NUNCA usar side-tabs gruesos** de 3-4px de color en un solo lado de las tarjetas ("AI slop").
- **NUNCA oscurecer el fondo de la hoja de papel** en modo oscuro; la hoja es siempre `#ffffff`.
- **NUNCA mutar la portada original** del usuario cuando `use_original_cover` está activado.
