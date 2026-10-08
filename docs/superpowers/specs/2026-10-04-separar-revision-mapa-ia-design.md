# Separar Revisión de Mapa IA + dashboard del mapa de IA — diseño

Fecha: 2026-10-04
Estado: **implementado** (2026-10-04) — Revisión («Modo lectura») y Mapa IA (dashboard) en 4 pantallas `gate|informe|reader|ai`; verificado (npm test 1852 verde, tsc limpio, build OK). Anexo A del plan: leyes de metodología por fase van primero.
Plan ejecutado: `docs/superpowers/plans/2026-10-04-modo-lectura-mapa-ia.md` (12 tareas). No confundir con `2026-10-04-fusion-fase5-revision.md`, que describe el flujo viejo «Recorrido por categorías» retirado.

## Contexto y problema

La fase 5 se monta con `Step5AuditIAWizard` (`src/components/wizard/Step5AuditIAWizard.tsx`,
3 pantallas `gate | journey | ai`). Al pulsar «Empezar revisión» entra a
`ReviewPhaseJourney`, cuyo riel se construye desde `CATEGORY_META`
(`src/components/review/CategoryRail.tsx`) y elige como activa la primera categoría
disponible. Como `CATEGORY_META` empieza por `'ai'`, la pantalla aterriza en
«Voz sintética» y **vuelca de golpe todos los hallazgos de IA** (una lista plana de 28
elementos «Índice de IA 24 % — rigidez sintética detectada · Pág. 2», frases repetidas,
clichés).

Dos problemas, uno de forma y uno de fondo:

1. **De forma:** entrar a Revisión no muestra lo general, muestra el detalle más denso
   primero. El pedido es **de lo general a lo específico**.
2. **De fondo:** IA y revisión objetiva están mezcladas en la misma superficie. El pedido
   es **«una cosa en un solo lado»**: lo de IA va al Mapa IA, las revisiones generales
   (estilo, ortografía, estructura) a Revisión.

## Decisión del usuario (aprobada)

- La fase 5 tiene **dos entradas**: «Revisión» y «Mapa IA». Lo de IA vive **solo** en el
  Mapa IA; los motores objetivos, **solo** en Revisión. No se mezcla un hallazgo en dos
  lados.
- **Cifra protagonista:** «Integridad humana» en grande (el `84 %` que ya se ve hoy),
  en negrita, como número principal del dashboard.
- **Gráfico grande:** **mapa de calor H1 × rango de índice IA**. Filas = capítulos H1;
  columnas = rango del índice (`45–59 / 60–74 / 75–89 / 90–100`); celda coloreada por
  concentración de párrafos.
- **Capítulos como rectángulos:** en lugar de una lista o acordeones, los capítulos H1 se
  muestran como **rectángulos** (bloques) dimensionados por el tamaño del capítulo y
  coloreados por intensidad. Al tocar uno se abre una **vista de revisión aislada solo de
  ese capítulo** (lectura + split comparador «Original (Fórmula LLM Detectada)» |
  «Propuesta con Voz de Autor Humano» + acciones), sin volcar el resto del documento.
- Se puede usar gráficas; se hacen con **SVG/CSS y tokens**, sin agregar librerías.
- Se sigue el design system: cero emojis, solo `lucide-react`, solo `var(--...)`.

## Alcance

**Dentro:**

- La ruta `journey` (`ReviewPhaseJourney` + `CategoryRail` + `CategoryDashboard`) se
  reemplaza por **R1 Informe general + R2 Modo lectura**; no quedan rieles de categorías ni
  listas de hallazgos dentro de Revisión.
- `ReviewGate` mantiene sus dos botones («Empezar revisión →» y «Mapa IA · N») y omite la
  fila de IA del conteo por motor.
- `AiHierarchy` (pantalla Mapa IA) pasa a **dashboard general→específico**: hero +
  heatmap arriba, **capítulos como rectángulos** abajo, y una **vista aislada por
  capítulo** al tocar un rectángulo.
- Nuevo módulo puro para los datos del heatmap, con test unitario.

**Fuera (no se toca / no se monta):**

- `ReviewWorkbench`, `ReviewMinimap`, `ReviewStrip`, `FocusReadingCard` (rama B, no
  montados). No se montan. De `AiMosaic` / `src/lib/aiMosaic.ts` se **reutiliza la idea de
  mosaico** (bloques por sección), pero se re-monta una versión nueva dentro del Mapa IA,
  no el componente tal cual.
- El rail de la app: la fase 5 sigue siendo el paso `step-5` («Revisión & IA»). No se
  parte en dos destinos de rail.
- La portada sigue `readOnly`, sin `suggestion` y sin acción de aceptar.

## Arquitectura

### 1. Revisión — «Modo lectura» (aprobado)

La Revisión va **de lo general a lo específico** en dos pantallas, sin listas ni «cards»
de navegación. El documento manda.

**R1 · Informe general (aterrizaje de Revisión = lo general).** Es lo primero que se ve al
pulsar «Empezar revisión →». Muestra la calidad global, sin listas de hallazgos:

- **Objetivos · validación Bloom**: cada objetivo con su verbo actual → verbo propuesto
  (p. ej. Recall → Analizar / Evaluar), chip `bad` (actual) → chip `good` (propuesto).
- **Repetición · cuerpo completo**: palabras repetidas en todo el documento, en barras
  horizontales + conteo (cubre «fallas de repeticiones que muestre con un gráfico qué
  palabras se repiten demasiado»). Vive aquí porque cruza todo el cuerpo, no un H1.
- **Salud por capítulo**: la micro-franja de capítulos (la misma de R2) como resumen
  tocable.
- CTA **«Leer y corregir»** → entra a R2 en el primer capítulo con pendientes.

**R2 · Modo lectura (lo específico).** El documento es la navegación; cero selectores
intermedios:

- **Hoja tipo libro** centrada (papel, márgenes amplios, `--paper-white`); se lee.
- **Cinta superior pegada** (sticky, *no* es una lista): «Revisión · {H1 actual}» + **micro
  franja de segmentos de capítulo = progreso** (cada segmento proporcional al tamaño del
  H1; un punto marca pendientes; tocar un segmento salta de capítulo) + contador `X/N` +
  botón **Informe** (despliega R1 como hoja encima) + botón **Siguiente**.
- **Hallazgos inline**: subrayados sobre el texto; los pinta `ReadingText` (único dueño del
  subrayado inline).
- **Categoría = chips-filtro** (Ortografía y formato / Redacción y estilo / Estructura /
  Citas), opcional. La categoría `ai` **no** aparece nunca en Revisión.
- **Dock inferior flotante**: motor + texto del hallazgo actual + pág. + «Aceptar» /
  «Aceptar todas» / «Siguiente». Reemplaza **toda** lista de hallazgos. (Los motores de
  Revisión son objetivos, así que sí ofrecen «Aceptar»; IA, que no está aquí, es la única
  que solo «Marca para revisar».)
- **Un párrafo a la vez**: «Siguiente» avanza por el documento cruzando motores dentro del
  capítulo.

**Secuencia de pantallas (quién empieza y a dónde lleva):**

```
ReviewGate ──[Empezar revisión →]──> R1 Informe general ──[Leer y corregir / tocar capítulo]──> R2 Modo lectura
     │                                                                                              │
     └──[Mapa IA · N]──> Mapa IA (AiHierarchy, dashboard + rectángulos)          [Informe] ──> R1 como hoja encima
```

- **Empieza en R1** (lo general). No hay forma de aterrizar en un hallazgo suelto.
- De R1 se entra a **R2** (lo específico) con «Leer y corregir» o tocando un capítulo de la
  micro-franja.
- R2 vuelve a R1 con el botón **Informe** (hoja encima, sin cambiar de pantalla) y al mapa
  general volviendo a la entrada.
- El **Mapa IA** (pantalla `ai`) es independiente y solo contiene IA.

Reglas del usuario aplicadas: **nada de listas** ni de estilo «cards»; el capítulo y el
hallazgo se navegan por la cinta y el dock, no por una lista; el informe nunca es otra
pantalla, es una hoja encima del documento.

### 2. Mapa IA como dashboard (aprobado)

`AiHierarchy.tsx` reorganiza su render (hoy: hero macro + `<aside>` «Jerarquía
Capitular» con todos los capítulos + `<section>` «Inspector de Alertas»):

- **Hero**: «Integridad humana» grande (`humanIntegrityPct`), con subdato
  «`syntheticPct` % rigidez sintética», nº de párrafos, «párrafos con autoría nítida» y
  «pico crítico: {capítulo}».
- **Mapa de calor H1 × rango** (nuevo componente, p.ej.
  `src/components/review/AiHeatmap.tsx`): una fila por H1, una columna por rango del
  índice, celda sombreada por concentración de párrafos y con el número dentro. Encabezado
  de columnas con los rangos; primera columna con el título del H1. Leyenda de la rampa.
- **Capítulos como rectángulos**: franja/grid de bloques, uno por H1, ancho proporcional al
  tamaño del capítulo, color por `--ia-nivel-1..4` según intensidad, etiqueta con nombre +
  nº de hallazgos + score. Reemplaza la lista y los acordeones.
- **Vista aislada por capítulo**: al tocar un rectángulo se abre una superficie de revisión
  **solo de ese capítulo** (lectura + pills + split comparador + acciones). Un botón
  «‹ Mapa IA» vuelve. Aísla y reduce el ruido.
- Se elimina el volcado inmediato: al entrar solo se ve hero + heatmap + rectángulos.

### 3. Datos del heatmap (módulo puro)

Nuevo `src/lib/aiHeatmap.ts`, sin dependencias de React:

```
RANGOS_IA = [45, 60, 75, 90]  // cortes de los cuatro buckets
export function construirHeatmap(
  chapters: { id: string; titulo: string; findings: AuditItem[] }[]
): { filas: FilaHeatmap[]; max: number }
// FilaHeatmap = { h1Id; titulo; counts: [n1,n2,n3,n4]; total; sinMedir }
```

- Reutiliza la agrupación H1/H2/H3 que ya calcula `AiHierarchy` (vía `construirJerarquia`
  de `src/lib/jerarquia.ts`) o recibe los `findings` ya agrupados por capítulo.
- El índice de cada hallazgo IA es `aiScore` (0..1) → `Math.round(aiScore * 100)` para
  ubicarlo en un rango. El límite inferior `45` coincide con `AI_PARAGRAPH_THRESHOLD`.
- Hallazgos **sin medición** (`aiScore === undefined`, p. ej. clasificados por
  `ai_category` sin score) **no** entran en un bucket numérico: se cuentan aparte en
  `sinMedir` y se muestran como texto, para no inventar un porcentaje.

## Color

El color **carga una sola dimensión: la intensidad**. Todo lo demás (por qué, qué regla,
motor) es texto. La rampa ya existe como tokens:

- `--ia-nivel-1` … `--ia-nivel-4` (definidos para tema claro y oscuro en
  `src/styles/design-system.css`).
- Celda con 0 párrafos → superficie neutra (`--color-bg-surface` / `--color-border-subtle`).
- El sombreado usa escalones de la rampa según la cuenta relativa al máximo del grid, no un
  degradado continuo. `noHardcodedColors.test.ts` y `designTokens.test.ts` vigilan que no
  se cuele hex.

## Invariantes

- IA es probabilística: **solo «Marcar para revisar»**, nunca «Aceptar». Los motores
  objetivos (estilo, ortografía, estructura) siguen con «Aceptar».
- Portada `readOnly`, sin sugerencia ni aceptar; `use_original_cover` no la muta.
- Revisión sigue siendo «un párrafo a la vez»; no se reintroducen las tres columnas ni
  `ReviewMinimap`.
- El rail (56 px) y su flyout viven siempre; el rail no colapsa por paso.
- Los conteos de pendientes se derivan **una sola vez** de la lista compartida
  `src/lib/auditItems.ts`, vía `src/lib/railPending.ts`. El nuevo heatmap **no** crea un
  conteo paralelo: solo agrupa los mismos `AuditItem` de categoría `ai`.
- Tokens únicamente; cero emojis; iconos de `lucide-react`.

## Observaciones de código (a verificar durante la implementación)

- `AiHierarchy.tsx` línea ~728 muestra `Confianza: {Math.round(currentFinding.aiScore)}%`
  sobre un `aiScore` que es 0..1 → renderizaría `0 %`. Corregir a `* 100` (o alinear la
  escala) al tocar el archivo.
- El `useMemo` de `chapters` (línea ~241) declara deps `[elements, itemsByElemId]` y usa
  `aiItems`; `itemsByElemId` deriva de `aiItems`, pero conviene dejar la dependencia
  explícita al refactorizar.

## Archivos previstos

- `src/components/review/ReviewInforme.tsx` — **nuevo**: R1 Informe
  general (Bloom + repetición + salud por capítulo + CTA «Leer y corregir»).
- `src/components/review/ReviewReader.tsx` — **nuevo**: R2 Modo lectura
  (hoja tipo libro + cinta de progreso de capítulos + dock de hallazgo + hoja de informe
  encima).
- `src/components/wizard/Step5AuditIAWizard.tsx` — la ruta `journey` pasa a
  `informe | reader`.
- `src/components/review/ReviewGate.tsx` — conteo sin fila de IA; dos botones.
- Se retiran del flujo montado `ReviewPhaseJourney` / `CategoryRail` / `CategoryDashboard`;
  se eliminan si nadie más los usa.
- `src/components/review/AiHierarchy.tsx` — hero + heatmap + rectángulos de capítulo.
- `src/components/review/AiHeatmap.tsx` — nuevo (SVG/CSS + tokens).
- `src/components/review/AiChapterGrid.tsx` — nuevo: grid de rectángulos por H1; al tocar,
  abre la vista aislada.
- `src/components/review/AiChapterFocus.tsx` — nuevo: revisión aislada de un solo
  capítulo.
- `src/lib/aiHeatmap.ts` — nuevo (puro, con test).
- Tests.

## Testing y aceptación

- Nuevo/ampliado: `src/__tests__/aiHeatmap.test.ts` (bucketing por rango, `sinMedir`,
  `max`).
- `src/__tests__/aiHierarchy.test.tsx`: hero visible; heatmap renderiza una fila por H1 y
  cuatro columnas de rango; los rectángulos de capítulo se renderizan y el clic abre la
  vista aislada.
- Verificar que Revisión **no** muestra «Voz sintética» ni hallazgos de categoría `ai`
  (nuevo test o extensión de los existentes que pulsan «Ver mapa de IA»).
- Nuevo test de R1/R2: «Empezar revisión» aterriza en **Informe general** (Bloom visible,
  repetición visible); «Leer y corregir» entra a **Modo lectura** (cinta de progreso + dock
  presentes) y el botón **Informe** vuelve a mostrar R1 encima.
- `npx tsc --noEmit` limpio; suite focalizada verde; luego la suite completa antes del
  commit (`npm test`, objetivo baseline 1401 vitest).
