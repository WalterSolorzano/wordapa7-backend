# Delta proactivo seguro — Informe (rama `feat/proactive-safe-delta`)

## T1 — contextAnalyzer ✅
`office/contextAnalyzer.ts`: inferencia PURA (7 contextos: table/image/heading/references/paragraph/protected-cover/unknown). Cero roundtrips nuevos: consume el snapshot que liveAssistant ya lee. `protected-cover` gana siempre → no actuar.
Tests: 8 (`contextAnalyzer.test.ts`).

## T2 — Modo proactivo: YA EXISTÍA (sin UI nueva)
`liveAssistant.ts:78-84` `DEFAULT_OPTIONS` todo **true**; persistido en Office **roamingSettings** (:85-101, :456-461); switches por feature ya visibles en LiveAssistantPanel; escrituras gated por `_options.*` (:311/:357/:373/:417).
→ Cumple "ON por defecto, sin toggle nuevo": cero código añadido para T2.

## T3 — Idempotencia por sesión generalizada ✅
Nuevo `office/sessionRegistry.ts` (`oncePerSession/wasApplied/reset`, techo 2000 claves). Patrón previo (`appliedCaps` en jarvisLive) generalizado:
- Formato al vuelo: clave `fmt:<hash(texto)>` — re-formatea solo si el texto cambió.
- Aviso de portada bloqueada y aviso offline-citas: una sola vez por sesión.

## T4 — coverGuard + CORE_DOWN antes de escribir ✅
- Formato: gate existente (`isCoverText`) ahora emite motivo visible 1× sesión.
- **Captions (nuevo)**: `captionUncaptionedFigures/Tables` aceptan `{skip}` y liveAssistant pasa `isCoverText` sobre zonas del core → portada sin captions automáticas.
- Citas offline: sin motor NO se persiste; aviso "Modo limitado" 1× sesión (honestidad de estado).

## Evidencia
- `tsc --noEmit` limpio · **vitest add-in 52/52** (11 nuevos).
- Sin endpoints nuevos · requirement set intacto (WordApi 1.3) · sin dependencias nuevas.
