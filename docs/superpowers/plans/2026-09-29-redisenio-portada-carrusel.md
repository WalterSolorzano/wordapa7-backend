# Plan de Rediseño de Portada y Header — WordAPA7

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** Rediseñar la vista de Portada (`CoverCarouselStudio.tsx`), centrar el nombre del archivo en la barra superior eliminando el texto `WordAPA7`, suprimir tooltips invasores (`OnboardingTour.tsx`), e implementar el flujo de carrusel central a pantalla completa (portadas grandes) que al presionar "Seleccionar esta portada" pasa a split view 50/50 con el formulario de edición.

**Architecture:**
- Mantener intacto el rail lateral de 56px (`AppShell.tsx` / `IconRail.tsx`) y la barra superior (`UnifiedToolbar.tsx`).
- Rediseñar `UnifiedToolbar.tsx`: ícono minimalista sin texto `WordAPA7`, nombre del documento centrado horizontalmente.
- Ocultar `OnboardingTour.tsx` flotante invasivo.
- Transformar `CoverCarouselStudio.tsx` en un componente con dos estados visuales:
  1. `carousel`: Carrusel 3D centrado a gran escala (portadas grandes que aprovechan todo el alto/ancho disponible), controles `<` y `>`, botón central `Seleccionar esta portada`.
  2. `editor`: Vista dividida 50% / 50% (izquierda preview real en papel blanco, derecha `CoverEditorPanel`), con botón de retorno "Cambiar plantilla" y "Continuar a Estructura".
- Preservar invariantes de `AGENTS.md`: cero emojis, tokens CSS, portada indivisible, fidelidad de papel blanco puro.

---

### Task 1: Limpieza de Header y Tooltips Invasores
- **Files:**
  - Modify: `src/components/toolbar/UnifiedToolbar.tsx`
  - Modify: `src/components/shared/OnboardingTour.tsx`
- **Steps:**
  1. En `UnifiedToolbar.tsx`, remover la etiqueta `<span>WordAPA7</span>` dejando solo el ícono minimalista (`BookOpen` o logo SVG limpio).
  2. Centrar el título del archivo `doc.file_name` absolutamente o con layout flex centrado en el header.
  3. Desactivar los tooltips flotantes en `OnboardingTour.tsx` (retornar `null`).
  4. Verificar tests de toolbar: `npm test src/__tests__/toolbarOverflow.test.tsx`.

### Task 2: Ampliación y Escala del Carrusel de Portadas (Estado 1)
- **Files:**
  - Modify: `src/components/wizard/portada/CarruselPortada.tsx`
  - Modify: `src/components/wizard/portada/MiniaturasDeDiseno.tsx`
- **Steps:**
  1. Aumentar el tamaño de las tarjetas del carrusel para que sean grandes y aprovechen el espacio vertical (~420-460px de alto, escala real proporcional).
  2. Añadir botón prominente `Seleccionar esta portada` bajo la tarjeta activa.
  3. Controles de navegación laterales grandes (`<` y `>`) y tarjeta final con borde punteado `+ Agregar plantilla`.
  4. Animaciones suaves con CSS transition/transform sin romper `prefers-reduced-motion`.

### Task 3: Estado Dividido 50/50 y Transición (Estado 2)
- **Files:**
  - Modify: `src/components/wizard/CoverCarouselStudio.tsx`
- **Steps:**
  1. Crear estado `vista: 'carrusel' | 'editor'`. Si el usuario no ha seleccionado o pulsa "Cambiar plantilla", se muestra el carrusel central grande.
  2. Al pulsar `Seleccionar esta portada`, cambiar a `vista: 'editor'`:
     - Columna izquierda (50%): Vista previa real en papel blanco puro (`PaperCanvas onlyCover` o preview de plantilla activa).
     - Columna derecha (50%): Formulario `CoverEditorPanel` con campos limpios.
     - Barra de acciones: Botón "Cambiar plantilla" (vuelve al carrusel) y botón "Continuar a Estructura" (pasa al paso 2).
  3. Eliminar la tira superior de chips (`CoverStrategyStrip`) en favor de este nuevo flujo claro.

### Task 4: Verificación Visual y Tests
- **Steps:**
  1. Ejecutar tests vitest de carrusel y portada (`npm test coverStudio`).
  2. Tomar captura con Chrome headless para comprobar visualmente la UI final con el carrusel grande y el split view.
