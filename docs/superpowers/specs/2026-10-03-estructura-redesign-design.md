# Estructura (Paso 2) — Rediseño «Canónico unificado»

- **Fecha:** 2026-10-04
- **Estado:** aprobado por el usuario (sobre el mockup v4)
- **Mockup fuente de verdad visual:** `docs/superpowers/mockups/2026-10-03-estructura-redesign.html`
- **Spec relacionada:** `docs/superpowers/specs/2026-09-27-taxonomia-por-fase-design.md`
- **Guardián de montaje:** `src/__tests__/estructuraEstaMontada.test.tsx`

## 1. Objetivo

Reemplazar la implementación partida de la fase de Estructura por **una sola fase montada**
(`EscritorioEstructura`), con:

1. **Jerarquía visual real** entre H1/H2/H3 (antes todos iguales).
2. **Tipografía con carácter** de la app: Inter (base), Outfit (títulos/UI), Newsreader (editorial), JetBrains Mono (números), con las fuentes **cargadas** (antes se declaraban y no se cargaban → caía a Segoe UI).
3. **Color con contraste**, sin amarillo: secundario teal + navy académico; el warning deja de ser amarillo.
4. **Prosa como panel derecho** que se abre al tocar un título (antes era una pestaña central).
5. **Diagrama responsive y animado**, con arrastre y alternativa de teclado.

## 2. No-objetivos (YAGNI)

- No se toca el backend ni los endpoints.
- No se revierte la lectura secuencial de Revisión (no es esta fase).
- No se inventa la lista de secciones obligatorias de APA 7 (sigue siendo ausencia de dato declarada).
- No se agregan librerías de grafos (`dagre`/`reactflow`/`cytoscape`/`elk` siguen prohibidas por `estructuraNoMiente.test.ts`).

## 3. Arquitectura de pantalla

Tres columnas (CSS grid): **Esquema 308px | Diagrama 1fr | Panel 452px** (ampliable a 760px).

### 3.1 Esquema (izquierda, fijo)

Índice jerárquico **puro**: la lista, sin el toggle «ver el documento / ver el mapa» que hoy vive dentro de `IndiceEstructura`.

- Filas con jerarquía real: H1 Outfit 700 13.5px, H2 500 13px, H3 400 12.5px; conector de nivel vertical; conteo de palabras en mono; barra de balance entre hermanas.
- Chips de **foco por fase** (derivadas de la misma lista de `lib/auditItems`).
- **Colapsar / expandir** ramas.
- **Autonumeración APA** al mover o promover.

### 3.2 Diagrama (centro, siempre visible)

`MapaEstructura` reescrito:

- Responsive (SVG con `viewBox`, `width:100%`), no ancho fijo.
- **Color por nivel**: H1 azul (`--color-accent`), H2 teal (`--color-secondary`), H3 indigo (`--color-level-3`); franja + borde + arista, con leyenda.
- Aristas curvas **animadas** (flujo), nodos con **entrada escalonada** (`prefers-reduced-motion` las apaga).
- Selección con anillo pulsante; **zoom**; toggle de densidad (figuras / solo H1–H2).
- **Reordenar por arrastre** con línea fantasma + **alternativa de teclado**; doble clic **colapsa** la rama.
- Se conservan los invariantes duros: etiqueta **siempre dentro** del nodo, cero librería, no es capa flotante.

### 3.3 Panel derecho (Prosa | Herramientas)

- Pestañas **Prosa** y **Herramientas**, con botón **Ampliar** (760px) y Cerrar.
- **Tocar un título** (fila del esquema o nodo del diagrama) selecciona el nodo y **abre la pestaña Prosa** con esa sección.
- **Prosa** = `LecturaProsaSeccion` con **tokens** (hoy tiene hex hardcodeados), tipografía editorial (Newsreader cuerpo + Outfit títulos), cuerpo más grande, hoja papel blanco/tinta fija.
- **Herramientas** = `InspectorRama` (acciones de la rama, con su alcance escrito) + activos + `FaltasApa7`, todo con tokens.

## 4. Tokens y tipografía (`src/styles/design-system.css`)

Nuevos:

```css
--font-display: 'Outfit', 'Inter', system-ui, sans-serif;
--font-editorial: 'Newsreader', 'Georgia', serif;
--color-secondary: #0d9488;            /* teal, combina con el azul */
--color-secondary-soft: rgba(13, 148, 136, 0.12);
--color-ink: #1e3a5f;                  /* navy académico para títulos editoriales */
--color-level-3: #6366f1;              /* indigo, tercer nivel del diagrama */
```

Recolor del amarillo (aprobado): `--color-warning` y su familia pasan a terracota.

- Claro: `#c0562e`; `--severity-warning-soft: rgba(192, 86, 46, 0.12)`; alfas a05/a08/a12/a30/a40 derivados de `#c0562e`.
- Oscuro: `#e08a63`; alfas derivados.
- Actualizar también `src/styles/design-tokens.md`.

Fuentes: cargar **Outfit** y **JetBrains Mono** (`@fontsource/outfit`, `@fontsource/jetbrains-mono`) en `src/main.tsx`, junto a Inter/Newsreader que ya están.

## 5. Contrato de interacción

1. Al montar: primer capítulo autoseleccionado, pestaña **Prosa** activa.
2. Clic en título del esquema o nodo del diagrama → `setElegido(nodo)` + panel en **Prosa**.
3. Clic en pestaña **Herramientas** → inspector de la rama activa.
4. «Ampliar» alterna ancho del panel (452 ↔ 760).
5. Cerrar el panel no rompe la fase (reducible/recuperable).

## 6. Destino de archivos

| Archivo | Destino |
|---|---|
| `EscritorioEstructura.tsx` | **vive** — shell de la fase (3 columnas) |
| `IndiceEstructura.tsx` | **vive** — columna izquierda, sin toggle documento/mapa |
| `NodoIndice.tsx`, `BarraBalance.tsx` | **viven** — filas del esquema, pulidas |
| `MapaEstructura.tsx` | **vive** — diagrama reescrito |
| `LecturaProsaSeccion.tsx` | **vive** — prosa, tokens arreglados |
| `InspectorRama.tsx`, `FaltasApa7.tsx` | **viven** — panel Herramientas |
| `DistribucionVolumen`, `MatrizEvidencias`, `ReorganizadorCapitulos` | se **pliegan**; si no se usan, se eliminan con su test |
| `EstudioEstructuraView.tsx` | **se elimina** (absorbido) |
| `EsqueletoNavegacion.tsx` | **se elimina** (absorbido) |
| `DiagramaAnatomicoSVG.tsx` | **se elimina** (absorbido) |
| `InspectorActivosSeccion.tsx` | **se elimina** (absorbido) |

`App.tsx` monta `EscritorioEstructura` en `wizardStep === 2` (hoy monta `EstudioEstructuraView`).

## 7. Invariantes y guardián

Se reescribe `estructuraEstaMontada.test.tsx` con el contrato nuevo, conservando:

- `App.tsx` importa y **monta** `EscritorioEstructura` en `wizardStep === 2`.
- El render muestra `data-testid="indice-estructura"` (izquierda) y `data-testid="diagrama-estructura"` (centro) y el panel con pestañas Prosa/Herramientas.
- **Tocar un título abre la prosa**: aparece `data-testid="prosa-seccion"` con el título de la sección.
- **No** existe `documento-completo` (el documento entero no es el centro).
- Cada `.tsx` de `src/components/structure/` tiene **importador** fuera de `__tests__` (cero huérfanos).
- **Ningún** `<select>` en la carpeta.
- Cero hex hardcodeado (lo cubre `noHardcodedColors.test.ts`).
- Se eliminan los tests de los 4 componentes absorbidos.

## 8. Riesgos

- El recolor global del warning puede romper tests que asuman `#d48806` → grep antes de cerrar.
- `LecturaProsaSeccion` tiene hex hardcodeados → debe quedar 100% en tokens o `noHardcodedColors.test.ts` falla.
- El diagrama debe seguir sin librerías (`estructuraNoMiente.test.ts`).
