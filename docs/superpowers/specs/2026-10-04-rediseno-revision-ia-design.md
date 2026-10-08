# Rediseño de la fase Revisión & IA — Diseño aprobado (borrador)

Fecha: 2026-10-04
Rama: `master`
Estado: diseño visual aprobado; pendiente de aprobación del spec escrito.

## Resumen ejecutivo

La fase 5 (Revisión & IA) se rediseña como una experiencia guiada por **categorías internas
del H1 activo**, con un **riel de iconos** que cambia la categoría y un **dashboard vertical**
que muestra primero lo grande, luego un gráfico, y debajo las correcciones en **lista de
acordeones desplegables**. Cada corrección conserva su relevancia porque permanece cerrada
hasta que se abre, y al abrirse muestra el **caso exacto: análisis + propuesta**.

Ninguna corrección relativa (voz sintética, objetivos) se aplica en masa. No hay "aplicar
todas". Lo mecánico tampoco se aplica a ciegas: se decide en el acordeón, con contexto.

## Contexto verificado del repositorio (2026-10-04)

- Rama **`master`**, árbol limpio (solo `.superpowers/` y `graphify-out/` sin seguimiento).
- `src/components/wizard/Step5AuditIAWizard.tsx` es hoy un **monolito de 866 líneas**: un
  mega-workbench con `ToolWindowId = 'ai'|'style'|'spelling'|'citations'|'structure'`,
  cinco acordeones (`openWindows`), estado propio y `AuditItem` local (sin `phase`).
- **No existen** en el árbol actual: `src/components/review/`, `ReviewWorkbench.tsx`,
  `ReviewMinimap.tsx`, `ReadingText.tsx`, `AiHierarchy.tsx`, `AiMosaic.tsx`,
  `src/hooks/useReviewWorkbench.ts`, `useReviewActions.ts`, `src/lib/auditItems.ts`,
  `railPending.ts`. Tampoco `src/components/shell/AppShell.tsx`, `IconRail.tsx`,
  `RailFlyout.tsx`, `railItems.ts`.
- La exploración previa que describía esos archivos corresponde a un estado que **no es el
  HEAD** (`master`), por lo que **no debe usarse como si existiera**. El plan de implementación
  debe partir del código real (Step5AuditIAWizard monolítico) y tratar el rediseño como
  **reescritura de ese componente**, con la infraestructura de datos que sí exista en el árbol
  real (store `useDocStore`, `reviewResult`, `proofreadFindings`, `citationAuditResult`,
  `runAIReview`, `runProofreadBatch`, `runCitationAudit`).
- Antes de escribir el plan definitivo hay que **re-verificar** con Graphify/grep el árbol real
  (tipos `ProofreadFinding`, `AuditItem`, endpoints `/api/proofread-batch`,
  `/api/ai-review/{session_id}`, `/api/validate-citations`) porque las rutas de la exploración
  previa pueden no coincidir.

## Problema (dolores confirmados por el usuario)

1. Saturación visual.
2. Acciones que no funcionan.
3. Falta de guía por prioridad.
4. IA y revisión común mezcladas.
5. Cada fase no se siente especial.

## Decisiones cerradas

1. **Rediseño completo** de la fase, no parches.
2. **Puerta de entrada**: panel de estado con cifra principal (`82%`), tres sub-cifras y
   **matriz de calor fase × motor**; mascota saludando arriba a la derecha. Aprobada.
3. **Base de experiencia**: recorrido guiado, **una fase a la vez**.
4. **IA en sala aparte**, segmentada por títulos H1/H2, con subrayado inline violeta y
   confianza visible. Aprobada ("está hermoso").
5. **Ortografía no es motor aparte**: entra como corrección mecánica (formato y estilo) y puede
   mezclarse con otra categoría.
6. **Citas queda fuera** del módulo de categorías: vive en su propio paso (Referencias).
7. **Categorías del H1** (derivadas de los motores, propuesta): **Redacción y voz** (incluye
   objetivos/Bloom, frases IA, muletillas, voz pasiva), **Estructura**, **Formato y estilo**,
   **Voz sintética**.
8. **Objetivos (Bloom) viven en Redacción y voz**, no como categoría suelta. En una fase como
   Resultados se muestran los objetivos de ese H1.
9. **Riel de iconos** a la izquierda: un icono por categoría interna del H1, con su conteo;
   cambiar de icono reemplaza todo el panel derecho.
10. **Dashboard vertical** dentro de la categoría: arriba la cifra grande, tablero compacto,
    luego el gráfico ("dónde se concentra"), y abajo la lista de correcciones.
11. **Correcciones = lista de acordeones desplegables.** El encabezado agrupa por tema (p. ej.
    "todos los objetivos de este H1, con su nivel Bloom"); al abrir aparece **el caso exacto**:
    cita textual + **análisis** + **propuesta**. Acciones `Aceptar` / `Marcar para revisar` /
    `Descartar` y `n de M · Siguiente`.
12. **Sin acciones masivas.** El botón "Aplicar todas" queda descartado explícitamente: son
    cuestiones relativas donde entra la IA y son delicadas.
13. **Botón "Revisar"** para abrir el caso completo; la decisión no se dispersa inline (se
    probó y "pierde relevancia cada corrección").
14. **Paleta clara** por defecto (no dark). Dirección Swiss Modernism 2.0 mapeada a tokens
    (`--accent-primary` navy, gold para criterio, violeta para IA, rojo solo severidad). Nunca
    hex hardcodeado.
15. **Tipografía y todo el resto quedan aprobados** ("hermoso ese es, me encanta las letras
    diseño todo es hermoso").

## Principios de diseño vinculantes (feedback textual del usuario)

- "odio las listas me gustan las columnas y el uso eficiente de espacio" → columnas, espacio
  eficiente; no listas verticales tipo bandeja.
- "no pue[d]e ser a lo loco porque es delicado" → nada de aplicar en masa; criterio por caso.
- Divulgación progresiva: el acordeón cerrado guarda el tema; el detalle aparece al abrirlo.
- Cero emojis en UI (solo SVG `lucide-react`).
- Solo design tokens CSS; prohibido hex.

## Anti-patrones rechazados (no repetir)

- "Aplicar todas" / acciones masivas.
- Listas tipo bandeja de entrada.
- Panel izquierdo cargado (duplicaba la lectura).
- Decidir inline en el dashboard (pierde relevancia cada corrección).
- Barras horizontales como gráfico.
- Cards por todos lados.

## Arquitectura en tres capas

1. **Puerta** — panel de estado (82%, sub-cifras, matriz de calor fase × motor).
2. **Bucle** — recorrido por fase: categoría activa con riel de iconos + dashboard vertical +
   acordeones de corrección.
3. **Lente IA** — sala aparte, segmentada por títulos, con subrayado inline y confianza.

## Pendiente de definir antes del plan

- Re-mapeo de **categorías internas** a los motores reales del backend (kinds de
  `audit_elements`, `RULE_SCOPES`, `phase_findings`).
- Tratamiento "especial" por fase (hipótesis: mismo motor, distinto énfasis; sin confirmar).
- Ruta de la puerta de entrada dentro del wizard real.
- Cómo se relaciona la fase con `Step5BodyWizard` / `Step5ReferencesWizard` existentes.
