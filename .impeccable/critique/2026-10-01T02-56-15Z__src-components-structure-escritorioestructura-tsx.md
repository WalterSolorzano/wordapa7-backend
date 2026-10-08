---
target: panel lateral de estructura
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
target_identity: "file:C:\\Users\\--X\\.gemini\\antigravity\\scratch\\wordapa7\\src\\components\\structure\\EscritorioEstructura.tsx"
target_fingerprint: "sha256:bfcb6af6c8df1fa9583b7ea90166041f5c7b09bd5706d30264a0d199edaeb59a"
target_path: "C:\\Users\\--X\\.gemini\\antigravity\\scratch\\wordapa7\\src\\components\\structure\\EscritorioEstructura.tsx"
timestamp: 2026-10-01T02-56-15Z
slug: src-components-structure-escritorioestructura-tsx
---
Method: dual-agent (A: 9d1bded6-c7a7-4144-8ed3-b7b57e2d01ff · B: 8e7b2421-22b9-450f-875e-ac29d869432c)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `ReorganizadorCapitulos` tiene spinner, pero mutaciones en `InspectorRama` no muestran feedback ni bloqueo. |
| 2 | Match System / Real World | 2 | Jerga técnica expuesta en UI: "rama", "H1", "H2", "endpoint", "el backend no expone...". |
| 3 | User Control and Freedom | 2 | Reordenamiento en caliente sin opción de Deshacer (Undo). |
| 4 | Consistency and Standards | 2 | Desincronización: `nodoActivo` preselecciona `raices[0]` en submódulos mientras el inspector muestra estado vacío inicial. |
| 5 | Error Prevention | 2 | Botones ▲/▼ de 24px sin suficiente separación facilitan clics erróneos en reordenamientos drásticos. |
| 6 | Recognition Rather Than Recall | 3 | Etiquetas `(esta rama)` y preview de párrafos dan buen contexto, aunque se repite el listado de capítulos 4 veces. |
| 7 | Flexibility and Efficiency | 2 | Falta de pestañas o acordeón en panel de 360px: navegación vertical excesiva (>1400px de scroll). |
| 8 | Aesthetic and Minimalist Design | 2 | Hacinamiento visual severo: 5 módulos apilados en 320px útiles, lista de capítulos cuadruplicada. |
| 9 | Error Recovery | 2 | Diagnósticos claros (fases mal niveladas, 0 citas), pero sin remediación asistida con un clic. |
| 10 | Help and Documentation | 2 | Tooltips justifican arquitectura técnica en lugar de guiar editorialmente al tesista. |
| **Total** | | **21/40** | **Needs Improvement** |

### Design Specificity Verdict

**LLM assessment**:
La lógica de `DistribucionVolumen` y `MatrizEvidencias` tiene un valor de dominio excelente para la redacción de tesis APA 7 (control de hipertrofia de capítulos y verificación de citas metodológicas). Sin embargo, la integración espacial en `EscritorioEstructura.tsx` comete el error de convertir un panel lateral de 360px en un megadashboard vertical infinito, duplicando la lista de capítulos que ya vive en el centro. Además, se filtran justificaciones técnicas de la API al usuario final ("Sale por /api/update-element...", "El backend no expone qué secciones exige APA 7...").

**Deterministic scan**:
2 hallazgos CLI detectados por `impeccable detect`:
1. `DistribucionVolumen.tsx:152`: `layout-transition` (warning) por animar `width` en lugar de `transform: scaleX(...)`.
2. `InspectorRama.tsx:523`: `design-system-font-size` (advisory) por literal tipográfico `10px` fuera de escala de tokens.
Adicionalmente, se detectó contraste no conforme (2.84:1 vs 4.5:1 exigido) al usar `var(--color-warning)` directamente sobre texto pequeño de 0 citas en `MatrizEvidencias.tsx`.

**Visual overlays**:
Sin servidor en vivo activo. Se ejecutó escaneo determinista CLI sobre los componentes fuente.

### Overall Impression
Funcionalidad editorial potente y contratos backend impecables, pero ahogados en un layout vertical congestionado de 360px. El panel lateral debe segmentarse o delegar la vista analítica al área central para no fatigar al usuario.

### What's Working
1. **Contrato de alcance transparente**: La etiqueta `(esta rama)` junto a las acciones elimina la incertidumbre sobre qué se está modificando.
2. **Matriz de evidencias aplicada a tesis**: El cruce automático de fases metodológicas con conteo de citas detecta vacíos críticos antes de la sustentación.
3. **Integridad garantizada de tramos**: `moverRama` transporta el capítulo íntegro (párrafos, subsecciones, figuras y tablas) sin pérdida ni desmembramiento.

### Priority Issues

- **[P0] Desincronización de selección inicial en el sidebar**:
  - *Why it matters*: Al cargar la pantalla, los módulos inferiores marcan activo el Capítulo 1, mientras el inspector superior muestra el placeholder de "Elegí un capítulo del índice...".
  - *Fix*: Unificar `elegido` con `nodoActivo` para que si se preselecciona el primer capítulo, el inspector también muestre su contenido de inmediato.
  - *Suggested command*: `/impeccable clarify`

- **[P1] Hacinamiento y cuadruplicación de la lista de capítulos en 360px**:
  - *Why it matters*: El usuario ve el listado de capítulos 4 veces en el mismo viewport (árbol central, pacing, evidencias, reordenador), generando un scroll vertical inmanejable (>1400px).
  - *Fix*: Organizar el panel lateral mediante pestañas segmentadas (`Inspector` / `Pacing & Evidencias` / `Reorganizar`) o mover la matriz de evidencias a una vista expandida central.
  - *Suggested command*: `/impeccable layout`

- **[P2] Filtrado de mensajes técnicos de backend al usuario**:
  - *Why it matters*: Mensajes como `"El backend no expone qué secciones exige APA 7..."` o menciones a `/api/update-element` confunden al estudiante y degradan la calidad del producto.
  - *Fix*: Reemplazar con microcopia orientada al redactor: `"Verificación de estructura y jerarquía de niveles APA 7."`
  - *Suggested command*: `/impeccable polish`

- **[P3] Ausencia de Undo en reordenamientos estructurales**:
  - *Why it matters*: Un clic involuntario en ▲ o ▼ altera el documento entero sin confirmación ni opción de revertir en un clic.
  - *Fix*: Disparar un toast informativo con botón interactivo de "Deshacer" (*Undo*) al reordenar elementos.
  - *Suggested command*: `/impeccable harden`

### Persona Red Flags

- **Jordan (Tesista primerizo)**:
  - Ansiedad por acumulación de alertas amarillas simultáneas sin guía de remediación.
  - Miedo a romper el documento al usar botones de subir/bajar sin confirmación ni botón de deshacer.
  - Inseguridad ante mensajes de advertencia que mencionan "el backend".

- **Alex (Power User / Revisor editorial)**:
  - Frustración por tener que scrollear una columna de 320px útiles para inspeccionar tablas comparativas.
  - Incomodidad con botones pequeños de 24px para tareas repetitivas de reordenación.
  - Desaprovechamiento del área central ancha, que podría albergar la matriz de rigor de forma horizontal y legible.

### Minor Observations
- `MatrizEvidencias.tsx` importa `BookOpen` de `lucide-react` sin utilizarlo.
- Elementos clickeables en tablas/listas carecen de atributos de accesibilidad de teclado (`role="button"`, `tabIndex={0}`, `onKeyDown`).
- Contraste insuficiente en el indicador de 0 citas en `MatrizEvidencias`.

### Questions to Consider
1. ¿Debería el panel lateral de Estructura tener pestañas ("Rama", "Métricas", "Reorganizar") para mantener la altura contenida sin scroll?
2. ¿Convendría que la Matriz de Evidencias sea un modo de vista conmutable en el panel central (junto a "Índice", "Mapa" y "Documento") donde dispondría de ancho completo?
