# Especificación Técnica Integral: Estudio Anatómico de Estructura APA 7

**Fecha:** 2026-10-03  
**Estado:** Auditado con `frontend-design` & Aprobado para Planificación  
**Ruta:** `docs/superpowers/specs/2026-10-03-redisenio-estructura-anatomica-design.md`

---

## 1. Visión y Propósito
Transformar la fase de **Estructura** (Paso 2) de un conjunto fragmentado de pestañas (`Índice / Títulos / Cuerpo`) y paneles residuales (`StructureTabBar`, `RightSidePanel`) en un **Centro de Control Anatómico Unificado**:
1. **Comprensión Holística del Documento Word:** El sistema analiza la anatomía del `.docx` conectando los motores backend existentes (`phase_scope.py`, `structure_scanner.py`, `proactive_auditor.py`).
2. **Interactividad Anatómica (D&D Directo con Feedback Espacial):** Diagrama SVG interactivo sin librerías pesadas (0 KB extras), que soporta reordenamiento por arrastre de capítulos (H1), subsecciones (H2, H3) y figuras incrustadas, proyectando una *línea fantasma esqueleto* que visualiza el punto exacto de inserción en Word antes de soltar.
3. **Ergonomía de Nivelación Directa (Regla Estricta: Cero Selects/Dropdowns):** Queda terminantemente prohibido usar menús desplegables `<select>` para cambiar niveles de títulos. La promoción o degradación se ejecuta mediante micro-chips de acción directa (`[H1] [H2] [H3]`) en el panel o por arrastre directo en el árbol.
4. **Rescate e Integración Total del Editor de Figuras:** Las figuras y tablas se muestran asociadas a su capítulo contenedor, con acceso directo en 1 clic a su editor de estilos, filtros y leyenda APA 7 (rescatando `EscenarioFigura` y `ListaContextual`).
5. **Auditoría Académica de Alto Nivel (Tesis y Artículos Científicos):**
   - **Regla del Binomio APA 7:** Detección de subsecciones solitarias (`2.1` sin `2.2`).
   - **Verificación de Llamada en Prosa:** Auditoría de citas explícitas a figuras y tablas en el texto (*"ver Figura 1"*).
   - **Párrafo de Encuadre:** Detección de H1 sin párrafo introductorio previo a sus subsecciones.
6. **Lectura Editorial Focalizada:** Toggle limpio para alternar entre el *Diagrama Anatómico* y la *Prosa de Sección*, renderizando únicamente el bloque del capítulo activo con maquetación de libro académico.

---

## 2. Auditoría Frontend-Design (Criterios Estrictos)
- **Cero Emojis en Código de UI:** Todo icono proviene estrictamente de `lucide-react` (`GitFork`, `BookOpen`, `Image`, `AlertTriangle`, `CheckCircle2`, `Move`).
- **Paleta y Design Tokens:** Solo variables CSS (`var(--accent-primary)`, `var(--text-main)`, `var(--border-subtle)`, `var(--paper-white)`, `var(--paper-ink)`). Prohibidos colores hex hardcodeados.
- **Micro-interacciones y Estados:** Transiciones ágiles (100–150ms). Focus-visible con outline nítido.
- **Tipografía y Métricas:** `font-variant-numeric: tabular-nums` en contadores de palabras y posiciones. Escala de 11px a 14px compacta y profesional.
- **Purga de Residuos:** Eliminación completa de `StructureTabBar`, `RightSidePanel` y barras flotantes sin función en el Paso 2.

---

## 3. Arquitectura de Componentes

### 3.1 Contenedor Principal: `EstudioEstructuraView.tsx`
Reemplaza `EscritorioEstructura` y las 3 pestañas viejas en `App.tsx` (wizardStep === 2).
- **Barra Superior:** 
  - Título sobrio y badge de estado pasivo APA 7.
  - Switch de dos modos: `[Diagrama Anatómico]` y `[Prosa de Sección]`.
  - Indicador pasivo de sincronización con Word (mascota pasiva SVG sin botones redundantes).
- **Grid de 3 Columnas:**
  - **Columna 1 (240px):** `EsqueletoNavegacion.tsx` (Árbol puro, badges H1-H3, sin duplicación de palabras).
  - **Columna 2 (Flex 1):** `DiagramaAnatomicoSVG.tsx` / `LecturaProsaSeccion.tsx` (Lienzo interactivo con D&D, filtros `[Ocultar Figuras]` / `[Hasta H2]` y línea fantasma).
  - **Columna 3 (280px):** `InspectorActivosSeccion.tsx` (Chips directos H1-H3, tarjeta de figura con botón al Editor de Estilos, y auditoría académica de binomio/llamadas).

### 3.2 Lógica Académica: `src/lib/academicRules.ts`
Funciones puras testeadas con Vitest:
- `auditarBinomio(nodos: NodoJerarquia[]): DiagnosticItem[]`
- `auditarLlamadasFiguras(capitulo: NodoJerarquia, elementos: ElementModel[]): DiagnosticItem[]`
- `auditarEncuadre(capitulo: NodoJerarquia, elementos: ElementModel[]): boolean`

---

## 4. Reutilización y Explotación de Motores Existentes
- **Backend:** `python/modules/phase_scope.py` para mapeo de ámbitos de H1; endpoints `/api/reorder-element` y `/api/change-heading-level` para mutación directa al Word.
- **Figuras:** Integración de los componentes de `src/components/figures/` directamente invocables desde la tarjeta de activo del capítulo activo.
- **Store:** `useDocStore.ts` actualiza inmediatamente el árbol y persiste la sesión.
