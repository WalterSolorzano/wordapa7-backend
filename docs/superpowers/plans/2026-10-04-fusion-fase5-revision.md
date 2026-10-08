# Fusión de la fase 5 "Revisión & IA" — Documento de continuidad

Fecha: 2026-10-04
Estado: **APROBADO por el usuario — listo para ejecutar** (directo a fusionar, sin más mockups).
Este documento es la fuente de verdad para retomar después de un compact. Leer completo antes de tocar código.

---

## 1. Decisión del usuario (cerrada)

"directo a fusionar, adapta todo piensa como sera el flujo recuerda que en tu plan vimos desde lo general a especifico"

- **Mi rediseño (master) GANA** como base de la fase 5.
- Se le **roba a la otra IA (feat) el split-comparador** para la sala de IA.
- Flujo **general → específico**: Puerta (estado) → Recorrido (categorías) → Sala IA (detalle IA).
- Ejecutar la fusión; ya no hay iteración de mockups.

---

## 2. Las dos fases 5 en conflicto (hechos verificados)

| | **A = `master` @ `31d8d38` (MÍO, GANA)** | **B = `feat/motor-render-fase1` (otra IA)** |
|---|---|---|
| Archivos review/ | `AiRoom, AiSegment, CategoryDashboard, CategoryRail, FindingAccordion, ReadingText, ReviewGate, ReviewPhaseJourney` | `AiHierarchy, AiMosaic, EngineGroupCard, FindingDetail, FocusReadingCard, ReadingText, ReviewMinimap, ReviewStrip, ReviewWorkbench` |
| Modelo | 3 pantallas: gate → journey → ai | 1 workbench, viewMode focus/ia/canvas |
| Puerta | `ReviewGate`: cifra 56px + 3 sub-cifras + conteo por motor ("matriz") | NO existe |
| Recorrido | Riel categorías 56px + acordeones por tema | Rack 400px por motor + FocusReadingCard (1 párrafo) |
| IA | `AiRoom`/`AiSegment`: sala aparte por H1, subrayado violeta + `%` superíndice | `AiHierarchy`: termómetro + árbol H1→H2→H3 + **split comparador** |
| Minimapa | NO | `ReviewMinimap` 44px |
| Split original→propuesta | Acordeón con bloques **apilados** | **Lado a lado** en `AiHierarchy` |
| Tokens | alias legacy (`--accent-primary`, `--text-main`, `--border-subtle`, `--sidebar-bg`) | canónicos (`--color-*`) |

**Único archivo compartido:** `ReadingText.tsx` (contrato INVERTIDO entre ramas).

### Atribución verificada de piezas (para no mezclar)
- **SOLO A (mío):** "Voz sintética" (`CategoryRail.tsx:16` CATEGORY_META, `ReviewGate.tsx:15`, `CategoryDashboard.tsx:19`); Sala de IA por H1 (`AiRoom.tsx:1,18,22-35`, `AiSegment.tsx:27-28` flechas); confianza `%` superíndice (`AiSegment.tsx:38-45`); `ReviewGate` (cifra de entrada); acordeón cita+propuesta **apilada** (`FindingAccordion.tsx:84,91`); acciones por motor (`FindingAccordion.tsx:15`: `ai → ['Marcar para revisar','Descartar']`).
- **SOLO B (de la otra IA) — lo que se ROBA:** `"Este motor es probabilístico: propone, no decide. Revísalo tú antes de aplicarlo."` (`FindingDetail.tsx:266`); `"Texto Original (Fórmula LLM Detectada)"` (`AiHierarchy.tsx:424,829`); `"Propuesta con Voz de Autor Humano"` (`AiHierarchy.tsx:863,882`); botón `"Reemplazar en Manuscrito"` (`AiHierarchy.tsx:1056`); `FocusReadingCard`; `ReviewStrip`; `ReviewMinimap`; `EngineGroupCard`.
- **AMBAS:** el string `"Marcar para revisar"` (mecanismo distinto).

---

## 3. LO QUE SE ROBA DE B (la pieza que le gustó al usuario)

**El split-comparador de `AiHierarchy.tsx`** — va a la sala de IA (o al detalle de un hallazgo IA):

```
┌─────────────────────────────┬─────────────────────────────┐
│ Texto Original              │ Propuesta con Voz           │
│ (Fórmula LLM Detectada)     │ de Autor Humano             │
│ fondo --mark-ai-bg          │ fondo --severity-success-tint│
│ borde 1px dashed            │ borde 1px solid --color-success│
│ text-secondary              │ (editable)                  │
└─────────────────────────────┴─────────────────────────────┘
Acciones: [Ver en Mesa] [Copiar] [Marcar para revisar] [Descartar] [Reemplazar en Manuscrito]
```
- Fuente: `AiHierarchy.tsx` (header L6 dice: `Split Inspector lado a lado: Texto Original con patrón LLM vs Propuesta de Autor Humano.`)
- Regla AGENTS §1 se respeta: IA = "Marcar para revisar", nunca Aceptar. `Reemplazar en Manuscrito` es un marcado, no una mutación a ciegas.

---

## 4. EL FLUJO (general → específico) — así debe quedar

```
┌───────────────────────────────────────────────────────────────────┐
│ PANTALLA 1 · PUERTA (lo GENERAL)                                  │
│   eyebrow: "Paso 5 · Revisión & IA"                               │
│   H1: "Estado de tu documento"                                     │
│   cifra gigante 56px + 3 sub-cifras + conteo por motor             │
│   [Empezar revisión →]  [Ver mapa de IA]                          │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ PANTALLA 2 · RECORRIDO (lo ESPECÍFICO por categoría)              │
│   riel 56px categorías │ dashboard vertical + acordeones por tema  │
│   ← Estado del documento      ✦ Sala de IA · N                    │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ PANTALLA 3 · SALA DE IA (detalle IA, por H1)                      │
│   segmentos por H1 + flechas ‹ ›                                  │
│   texto con subrayado violeta + % superíndice                     │
│   + SPLIT COMPARADOR (robado de B): original LLM │ propuesta humana│
│   acción única: [Marcar para revisar]                             │
└───────────────────────────────────────────────────────────────────┘
```

Estados de navegación (ya existen en mi orquestador): `pantalla: 'gate' | 'journey' | 'ai'`.

---

## 5. ARQUITECTURA OBJETIVO (archivos)

### Se conservan de A (master) — base
`src/components/review/{ReviewGate,ReviewPhaseJourney,CategoryRail,CategoryDashboard,FindingAccordion,AiRoom,AiSegment,ReadingText}.tsx`
`src/lib/auditItems.ts` · `src/lib/railPending.ts`
`src/components/wizard/Step5AuditIAWizard.tsx` (orquestador 3 pantallas)
`src/store/slices/uiSlice.ts` + `src/store/types.ts` (`dismissedFindingIds`, `dismissFinding`, `restoreFinding`)

### Se ADAPTA desde B
- **`AiHierarchy.tsx`** → extraer SOLO el split-comparador (original LLM vs propuesta humana) a un componente nuevo, p. ej. **`AiCompareSplit.tsx`**, para inyectarlo en `AiSegment`/`AiRoom` (o en `FindingAccordion` cuando `category==='ai'`).
- Tokens del componente robado: traducir de canónicos (`--color-*`) a los que usa A (`--accent-primary`, `--text-secondary`, `--border-subtle`, `--paper-white`, `--sidebar-bg`) **o** adoptar canónicos si A ya los soporta. Verificar primero qué variables existen en `src/styles/design-system.css` de la rama destino.

### Se descarta de B (en la fase 5)
`ReviewWorkbench`, `ReviewStrip`, `AiMosaic`, `ReviewMinimap`, `EngineGroupCard`, `FindingDetail`, `FocusReadingCard` — NO se traen. La otra IA puede conservarlos en su rama.

---

## 6. MAPA DE CONFLICTOS DE API (diagnóstico ya hecho — CRÍTICO)

`auditItems.ts` y `railPending.ts` tienen **API INCOMPATIBLE** entre ramas:

| Símbolo | master (A, gana) | feat (B) |
|---|---|---|
| `collectAuditItems` | `(input)` con `AuditInput` | `(sources)` con `AuditSources` |
| `pendingCountForPhase` | `(phaseId, input)` | `(input, phase)` |
| `readPhaseStates` | `Record<phase, number>` | `Record<phase, {pending}>` (`PhaseState`) |
| `EngineId` vs `ToolWindowId` | `ToolWindowId` | `EngineId` |
| `phaseLabel`, `PHASE_ORDER`, `PHASE_LABELS` | NO exporta | SÍ exporta |
| `PROOFREAD_SPECS`, `proofreadRow`, `AIReviewParagraph` | NO exporta | SÍ exporta |

### Consumidores de la API de B en feat (que se romperían si piso auditItems/railPending)
**auditItems:** `hooks/useReviewWorkbench.ts:44`, `hooks/useReviewActions.ts:28`, `lib/aiMosaic.ts:33-34`, `lib/jerarquia.ts:34` (`PHASE_LABELS`), `lib/rotulos.ts:22` (`EngineId`), `review/FindingDetail.tsx:25`, `EngineGroupCard.tsx:27`, `AiMosaic.tsx:46`, `AiHierarchy.tsx:25`, `structure/IndiceEstructura.tsx:23`, `FaltasApa7.tsx:47`, `EscritorioEstructura.tsx:22` + ~14 tests.
**railPending:** `src/App.tsx:6` (`pendingCountForPhase`), `hooks/useRailDestinations.ts:14,20,44` (`readPhaseStates`, `PhaseState`, `RailPendingInput`).

### Consecuencia
Un `git checkout master -- <archivos>` a secas **ROMPE la compilación** de feat (App.tsx, useRailDestinations, PaperCanvas, FocusReadingCard, useMarkSource, ~14 tests). No es un checkout limpio: es un **merge real de dos arquitecturas**.

### `ReadingText.tsx` — contrato invertido
- **master (A):** `ReadingText({ text, elementId, findings, renderNote })`; helpers `marksForElement`, `MARK_STYLE: Record<string, {color,underline}>`. Consumidor: `AiSegment`.
- **feat (B):** `ReadingText({ text, source })` con `source: MarkSource`; `collectMarks`, `MarkSource`, `MARK_STYLE: Record<MarkKind, CSSProperties>`. Consumidores: `PaperCanvas.tsx:28`, `FocusReadingCard.tsx:15`, `hooks/useMarkSource.ts:21`.
- **AGENTS §2 exige** que subrayado inline y burbuja (WhatsAppComment) digan lo mismo vía `buildCommentContext`.

---

## 7. ESTRATEGIA DE EJECUCIÓN (ruta elegida: fusión quirúrgica)

**Objetivo:** fase 5 = mi rediseño + split robado de B, SOBRE la rama feat (conservar AppShell, portada, figuras, etc. de feat).

### Paso 0 — desbloquear working tree
Hay cambios sin commitear en feat (7 figuras + `src/components/shell/railItems.ts` + untracked `.impeccable/`). Commit o stash ANTES de cualquier operación.

### Paso 1 — verificar dónde vive cada API de `auditItems`/`railPending` que feat realmente usa
Decidir: ¿se **adapta** el `auditItems` de A para que además exporte lo que feat usa (`phaseLabel`, `PHASE_ORDER`, `PHASE_LABELS`, `EngineId`)? Es la vía menos destructiva: **unificar en una sola API que sea superconjunto**.

### Paso 2 — traer el rediseño de A + adaptar la API
Traer componentes de A; adaptar `auditItems.ts`/`railPending.ts` a **superconjunto compatible** (mantener firmas de feat Y agregar las de A, o migrar los ~15 consumidores de feat a la API de A). Decidir por consumidor.

### Paso 3 — reconciliar `App.tsx`, `StepRail.tsx`, `ReadingText.tsx`
- `App.tsx`: conservar AppShell de feat; punto de montaje fase 5 → `Step5AuditIAWizard` de A.
- `StepRail.tsx`: borrado en feat → gana feat (no reintroducir).
- `ReadingText.tsx`: AGENTS §2 manda. Probablemente **adoptar el de feat** (canónico, prioridad de solape, integrado con `useMarkSource`/burbs) y adaptar `AiSegment` de A a su contrato. O unificar.

### Paso 4 — inyectar el split-comparador
Crear `AiCompareSplit` desde `AiHierarchy.tsx` de B, con tokens correctos, y montarlo en `AiSegment`/`AiRoom`.

### Paso 5 — verificación
`npm test` (suite), `npx tsc --noEmit`, `npm run dev` (visual), y regenerar instalador con bump de versión.

---

## 8. REGLAS VINCULANTES (no violar)

- **Cero emojis** (solo `lucide-react`).
- **Solo design tokens CSS** (`var(--...)`); prohibido hex.
- **IA = "Marcar para revisar", NUNCA "Aceptar"** (motor probabilístico).
- Motores objetivos (ortografía/Bloom/estructura) → Aceptar permitido.
- **Portada read-only**: sin suggestion, sin botón aceptar.
- Sin acciones masivas indiscriminadas para IA ("es delicado").
- AGENTS §1: si se adopta el layout de B (un párrafo a la vez + rail 56px + chips), respetarlo; mi recorrido por acordeones convive.
- AGENTS §2: `ReadingText` único dueño del subrayado inline; `buildCommentContext` sincroniza con `WhatsAppComment`.

---

## 9. REFERENCIAS

- Mockup comparativo: `C:\Users\--X\Desktop\comparativa-fases5.html` y `.superpowers/brainstorm/1493-1791092910/content/comparativa-fases5.html`.
- Mi plan original: `docs/superpowers/plans/2026-10-04-rediseno-revision-ia.md` (rama master).
- Spec: `docs/superpowers/specs/2026-10-04-rediseno-revision-ia-design.md` (en stash@{0} de feat).
- Ledger: `.superpowers/sdd/2026-10-04-rediseno-revision-ia/progress.md`.
- Ramas backup de stashes: `backup/stash0-2026-10-04` … `stash4`.
- Repo: `C:\Users\--X\.gemini\antigravity\scratch\wordapa7`. git: `C:\Program Files\Git\cmd\git.exe` (alias snip intercepta `git`).
- Mockup server: puerto 65201, key `982974dd5e44ae9480fcd5dd57e7d10de2958f9c0496d3dd991068a4169c394a`.

---

## 10. PENDIENTES ABIERTOS (decidir en ejecución)

1. ¿Unificar `auditItems` a superconjunto o migrar consumidores? (recomendado: superconjunto).
2. `ReadingText`: ¿el de feat (canónico) o el de A? (AGENTS §2 sugiere feat; adaptar `AiSegment`).
3. ¿El split-comparador va en `AiSegment` (por párrafo) o en `FindingAccordion` cuando `category==='ai'`? (recomendado: `AiSegment`, en la sala de IA).
4. ¿Vale la pena mantener el `ReviewStrip`/`ReviewMinimap` de B como bonus, o descartar? (decisión del usuario, hoy: descartar).
