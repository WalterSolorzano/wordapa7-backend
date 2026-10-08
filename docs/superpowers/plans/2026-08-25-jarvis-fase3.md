# Fase 3 — Tallado Jarvis: numeración automática, leyendas IA, modo pasivo, citas vivas, diff

> Filosofía: Jarvis deja APA perfecto mientras escribes. Motor central decide SIEMPRE;
> add-in ejecuta. Minimalista, sin emojis. Nada de ruido (sin resumen diario).

## Task 1 — Contador central de Tablas/Figuras (`modules/captions.py`)
Fuente única de numeración. Escanea los textos existentes para continuar la serie,
nunca reiniciar desde 1 si ya hay "Tabla 2" en el doc.

```python
def scan_existing(texts) -> {"max_table": int, "max_figure": int}
def build_caption(kind:"tabla"|"figura", n:int) -> ["Tabla 3", "Título en cursiva"]  # APA7: label bold arriba, título itálica debajo
```

Test: `test_captions.py` — escaneo continúa serie, formato exacto APA7.

## Task 2 — Endpoint `POST /api/addin/captions-plan`
Input: `{texts:[...], tables:[{i, first_row_cells:[...]}], figures:[{i}]}` (índices relativos a paragraphs del add-in).
Output: `{ops:[{i, kind:"table"|"figure", number, needs_label:true|false}]}` —
solo marca los que FALTAN (idempotente: si ya tiene "Tabla N" encima, skip).

## Task 3 — Ejecutor en el add-in (`masterNormalizer.ts` + panel)
Tras normalizar: llama captions-plan y ejecuta con Office.js:
- **Tabla**: `table.insertParagraphBefore("Tabla N")` bold + párrafo título en cursiva debajo
- **Imagen** (`inlinePictures.items[i].parentParagraph`): insertar después `"Figura N"` bold + título cursiva
- Título provisional: primera fila de encabezados unida (máx 90 chars); editable luego

## Task 4 — Leyendas IA (reutiliza `/api/ai/suggest-caption`, YA EXISTE)
Botón discreto "Sugerir" por tabla/figura en el panel → envía primeras celdas/contexto →
devuelve leyenda → input editable inline (un `<input>` + Aplicar). Sin emojis, tokens de diseño.
Sin API key: fallback heurístico local (encabezados + verbo nominal).

## Task 5 — Modo Jarvis pasivo (default ON)
- Switch en el panel: "Jarvis" (persist `localStorage.wordapa7_jarvis`, default `'1'`)
- Implementación: **polling cada 12s** (compatible todas las versiones de Word):
  hash barato = `${paragraphs.length}|${último.text.slice(0,80)}` — si cambia:
  - diff de textos vs snapshot local → índices nuevos/modificados
  - `format-plan full:true` SOLO con esos índices → aplica roles silencioso
  - nunca toca índices < floor (portada)
- Pausa automática mientras corre Normalizar manual (lock simple)

## Task 6 — Citas vivas + bibliografía automática
- `citationDetector.ts` ya detecta `(Autor, YYYY)` → extender: tras debounce 6 s
- Compara contra refs cacheadas del doc (zona marcada por plan_engine.refs_start)
- Si falta → `POST /api/resolve-ghost-citation` (existe)
  - found → **insertar párrafo al final de la zona Referencias** con sangría francesa
    (después del último ref; si no hay sección, crearla al final con H1 "Referencias")
    + toast discreto "Referencia agregada"
  - not found → cola de sugerencias `[Buscar] [Ignorar]`
- Dedupe por (autor,año) — jamás duplicar entrada

## Task 7 — Diff preview (minimalista)
En LiveAssistantPanel, encima del botón Normalizar: fila colapsable "Vista previa"
→ muestra 1 ejemplo: `"texto actual…" → H2 · negrilla · izquierda`. Tokens de diseño,
una línea, expandible a 3 ejemplos máx. Cero emojis.

## Gates
pytest (captions+plan_engine ~8 tests nuevos) · vitest 132 ✓ · tsc · build chain ·
NSIS 1.0.54 · verificación unpacked: chunk contiene captions-plan + jarvis poll,
manifest intacto (Id 56D02414…, https, CustomTab).

## Riesgos
| Riesgo | Mitigación |
|---|---|
| insertParagraphBefore en tablas anidadas | Solo tablas de nivel body (`body.tables`) |
| Polling molesto en docs enormes | Hash O(1) primero; plan solo sobre delta |
| Sección Referencias inexistente | Central ordena crearla; se crea UNA vez |
