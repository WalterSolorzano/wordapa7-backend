# Plan Jarvis-APA — Complemento proactivo sobre motor central

> Filosofía: un Jarvis que deja APA perfecto mientras el usuario escribe.
> Regla dura: NUNCA reconstruir lo que ya funciona — puentear.

## Respuesta directa (auditoría del estado actual)

| Pregunta | Veredicto |
|---|---|
| ¿`masterNormalizer.ts` usa el motor central? | **NO** — aplica sus propias reglas en TS vía Office.js |
| ¿Comete los errores que el central ya resolvió? | **SÍ, 3 críticos**: (1) TOCA la portada ("mapea y centra") — viola intocable; (2) reglas duplicadas sin el piso por contenido ni calibración; (3) no pasa por scopes ni auditoría |

## Arquitectura puente (sin reconstruir nada)

```
Word (add-in)                    Backend (motor central, ya calibrado)
─────────────                    ─────────────────────────────────────
masterNormalizer ──OOXML──►  POST /api/addin/format-plan
   │                             ├─ inplace_editor._cover_floor_by_content()
   │ ◄──ops[] (plan)────         ├─ apa_rules.json (fuente ÚNICA)
   │                             └─ auditoría local (que/muletillas/etc.)
   ▼
Ejecuta ops con Office.js
(SALTA índices < floor → portada intocable GARANTIZADA por el central)
```

### Fase 1 — Cerebro central, manos de Word (1 sesión)
1. `python/main.py`: endpoint `POST /api/addin/format-plan`
   - Input: `{ooxml_b64, scopes?}`
   - Interno: monta docx temporal → corre `_cover_floor_by_content` + reglas
   - Output: `{floor, ops:[{i, kind:"align|bold|font|size|spacing|first_indent|hanging", value}], findings:[...auditoría]}`
2. `apa_rules.json` nuevo (fuente única): font/size/line_spacing/H1-H5 estilos/tablas bordes/hanging indent — consumido por inplace_editor, scoped_apply Y devuelto al add-in
3. `masterNormalizer.ts`: reescribir su lógica para consumir ops del endpoint (mantiene su ejecutor Office.js que YA funciona). Borrar su detección propia de portada — usa `floor` del servidor
4. Heartbeat en cada llamada (chip "Activo en Word" siempre honesto)

### Fase 2 — Jarvis en vivo (mientras escribe)
1. Evento `Word.EventType.documentContentChanged` (debounce 8s)
2. Add-in envía SOLO párrafos sucios (hash por párrafo en memoria)
3. Backend responde: fixes seguros (aplicar silencioso) + sugerencias (cola)
4. Cola visual tipo tarjeta pequeña: «(Chase, 2019) sin referencia → [Buscar] [Ignorar]»
5. Citas: pausa de escritura tras patrón `(Autor, YYYY)` → `resolve-ghost-citation` silencioso → toast discreto "Referencia agregada ✓"

### Fase 3 — Pulir
- Numeración Tabla/Figura compartida con `table_engine.py` (un contador)
- Balloon-mascot en el panel con resumen diario («Hoy te ahorré 12 arreglos»)

## Reglas inquebrantables
- El add-in JAMÁS calcula formato propio: solo ejecuta `ops` firmadas por el central
- Todo op incluye `skip_if_cover: true` cuando `i < floor`
- Undo-friendly: agrupar ops en un solo `document.save()` lógico por pasada
