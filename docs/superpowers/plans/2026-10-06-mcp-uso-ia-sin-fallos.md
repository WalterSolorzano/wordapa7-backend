# Plan: WordAPA7 usable por IA, sin fallos y ahorrando tokens

Fecha: 2026-10-06
Estado: **F0 aplicado**. F1–F5 pendientes.

## Objetivo

Que un usuario (o agente) pueda entregar **un Word + un Excel**, pedir *"pon la portada UNI de wordapa y formatea con los motores"*, y obtener un `.docx` APA 7 correcto:

- con **pocos tokens** (el agente no debe mapear el repo),
- **sin fallos** (portada, sangrías, tablas, interlineado, referencias),
- y con el MCP **descargable / instalable** de forma simple.

## Diagnóstico (causa raíz)

El MCP `wordapa7-content` (`python/mcp_server.py`) es una superficie **JSON-only, sin entrada ni salida de archivo**:

| # | Gap | Evidencia | Efecto en el caso real |
|---|---|---|---|
| G1 | `build_document` **no emite archivo** | `python/mcp_server.py:56` → `build_content_document`, retorna dict `{session_id, elements, warnings}` | El agente no obtiene `.docx` → improvisa |
| G2 | MCP **no ingiere** `.docx`/`.xlsx` | `mcp_server.py:51-61` (solo 3 tools) | Fuerza el mapeo del repo (~10 min) |
| G3 | **Cero parser de Excel** en el repo | grep `openpyxl\|pandas\|read_excel\|xlsx` = 0 | Excel imposible de meter en tablas |
| G4 | **Sin puente** `DocumentModel → ContentDocument` | solo `content/builder.py:124` construye `ContentDocument` | Las dos tuberías no se hablan |
| G5 | `cover_mode` **no expuesto** en MetaSpec/builder/spec/MCP | `content/schema.py:8-16`, `content/builder.py:143-149`, `spec_dsl.py:41-49` | Portada UNI inalcanzable por API |
| G6 | Generator **fuerza APA** si no hay `original.docx` | `generation/generator.py:962-963` | Aun con G5, sin original no hay UNI |
| G7 | MCP **no registrable**: sin `mcp.json`, `mcp` fuera de `requirements`, falta PYTHONPATH | `mcp_server.py:46-47`; docs solo en plan | "usable con IA" falla al instalar |
| G8 | CLI documentado **no existe** | docs decían un módulo inexistente; real: `python -m content` (`content/__main__.py:12`) | Comando documentado revienta |
| G9 | Installer **solo trae el add-in de Word** | `build/installer.nsh`, `electron-builder.yml` | MCP/CLI no descargables |
| G10 | `/api/generate` **exige COM (Word)** | `main.py:2036-2041` | "sin fallos" falso sin Word |

### Tiempos medidos

- Import `content.builder` = **0.64 s**.
- Build completo con COM = **9.8 s**.
- Los ~10 min reportados **no son el motor**: son el agente leyendo/mapeando el repo porque el MCP no se autodescribe.

### Bug de referencias (causa raíz confirmada)

Texto `"Pérez, A. (2020). Inteligencia artificial y educación. Editorial UNI."` salía como `"f.).Pérez, A. ... educaci"`.

1. `content/builder.py:120` ponía `title=raw` → la referencia "parecía" estructurada.
2. `models.py:854-861` `_normalizar_apa` → `modules/apa_format.build_apa_segments` saltaba el fallback raw-only (`apa_format.py:166`) y fabricaba prefijo `"(s.f.). "`.
3. `modules/referencias_module.py:693` `_strip_ref_prefix`; su regex `_REF_PREFIX_RE` creía que `"(s."` era marcador `"(a."` → dejaba `"f.)."`.
4. `modules/apa_format.py:86` `limpiar_artefactos` hacía `.strip(" .,;:")` → borraba el punto final.

## Política de modelos y costo

- **Subagentes: `mimo-v2.5`** (`$0.14`/`$0.28` por M). Autorizado por el usuario.
- Modelo por defecto del proyecto para trabajo delegado: `deepseek-v4.1-flash`. Prohibidos sin autorización: `kimi-k3`, `claude-*`, `gpt-6-*`, `qwen-*`.
- **Micro-diffs ≤ 40 líneas**, **commit atómico** por cambio, **test focalizado** por fase; suite completa solo antes del commit final.
- Paralelizar **por propiedad de archivo** (evitar que dos agentes editen el mismo archivo).

## Fases

### F0 — Referencias mutiladas  ✅ HECHO

Archivos: `python/content/builder.py`, `python/modules/referencias_module.py`, `python/modules/apa_format.py`, `python/tests/test_content_builder.py`.

- `builder.py:120`: no setear `title=raw` (solo `raw_text`/`formatted_apa`).
- `referencias_module.py:26-28`: `_REF_PREFIX_RE` con `(?![a-zA-Z])` para no comerse un `"(s.f.)"` legítimo.
- `apa_format.py:79-87,167`: `limpiar_artefactos(..., strip_punct=False)` en el fallback raw-only (conserva el punto final).
- Tests: `test_raw_reference_not_mangled`, `test_strip_ref_prefix_keeps_no_date`.
- Verificación: **86/86 verde** (`test_content_builder`, `test_apa_format`, `test_apa_model`, `test_csl_json`, `test_referencias_*`, `test_references_*`, `test_orden_apa`, `test_citation_multiauthor`, `test_org_citation_matching`, `test_audit_fixes_f01_f10`).

### F1 — MCP que sí sirve (mata los 10 min = ahorro máximo de tokens)

Archivos: `python/mcp_server.py` (+ `python/content/emit.py` como apoyo).

- `build_document` **emite el `.docx`** y devuelve `path` (y/o bytes), no solo `elements`.
- Nuevo tool **one-shot** `resolve_document(docx?, xlsx?, cover='uni', format='apa7')` → archivo listo. El agente deja de mapear el repo: 1 tool = pocos tokens.
- `SCHEMA_HINT` autodescriptivo (incluye `cover_mode`).
- Test: `python/tests/test_mcp_server.py` ampliado.

### F2 — Ingesta de archivos

Archivos: nuevo `python/content/ingest.py` (+ `requirements.txt`).

- Parser `.xlsx` → `TableSpec` con **openpyxl** (1 dependencia).
- Puente `DocumentModel → ContentDocument` (o ruta directa docx→export) para no re-transcribir el Word.
- Tests nuevos en `python/tests/`.

### F3 — Portada UNI por API

Archivos: `python/content/schema.py`, `python/content/builder.py`, `python/generation/generator.py`.

- `cover_mode` en `MetaSpec` + copiado a `PortadaData` en `builder.py`.
- `generator.py:962-963`: permitir UNI **sin** `original.docx` (documento en blanco).
- Verificar `_resolve_logo_path` en contexto MCP/frozen (`python/assets/logo_uni.png`).
- Test: generar docx con `cover_mode='generate_uni_cover'` y verificar la portada.

### F4 — Distribución, registro MCP y docs

Archivos: `build/installer.nsh`, `electron-builder.yml`, `requirements.txt`, docs (`README.md`, `docs/`), ejemplo `mcp.json`.

- Empaquetar MCP + CLI en el installer; `mcp` como dependencia opcional documentada.
- Ejemplo de registro `mcpServers` con comando exacto y `PYTHONPATH`.
- Corregir docs CLI: uso correcto `python -m content`.
- Documentar el camino sin Word (`--no-com`).

### F5 — Verificación end-to-end

- Test e2e: **Word + Excel → docx con portada UNI** y aserciones de sangría/doble espacio/tablas/referencias.
- Corrida del CLI `--no-com` y con COM.

### F6 — Traductor de Rúbrica (motor oculto)

Capacidad sin UI, expuesta por MCP/CLI/API como los demás motores.

- **Entrada**: rúbrica en **Word (.docx) y Excel (.xlsx)** primero (PDF después) + documento `.docx`.
- **Salida**: informe JSON de cumplimiento — `criterio → peso(%) → puntaje(0-100) → evidencia (sección/párrafo) → qué falta` — más un `.docx` anotado opcional.
- **Extracción de criterios/pesos** de la rúbrica; **mapeo** de cada criterio a secciones/evidencia del documento.
- **Determinista donde se pueda (0 tokens)**; IA solo para criterios ambiguos.
- **Exposición**: tool MCP `analyze_rubric` + CLI.
- Tests focalizados con una rúbrica de ejemplo.

## Paralelización (por propiedad de archivo)

Conflictos reales: `content/builder.py` lo tocan F0 y F3; `generation/generator.py` lo toca F3.

- **Carril A** (secuencial, crítico): F0 → F3. Archivos: `content/builder.py`, `content/schema.py`, `modules/referencias_module.py`, `modules/apa_format.py`, `generation/generator.py`.
- **Carril B** (paralelo, independiente): F2. Archivo nuevo `content/ingest.py` + `requirements.txt`.
- **Carril C** (paralelo, independiente): F4. `build/installer.nsh`, `electron-builder.yml`, docs.
- **Tras A**: F1 (`mcp_server.py`), que consume las interfaces de A y B.
- **Al final**: F5.

## Riesgos

- **Modelo barato rompe código** → rework. Mitigación: `mimo-v2.5` solo con prompts acotados y test focalizado; commit atómico; `git restore` si hay regresión.
- **Edición concurrente** → conflictos. Mitigación: propiedad de archivo estricta.
- **UNI sin original** (G6) → validar `apply_page_setup` y logo en docx en blanco.
- **Excel con formato irregular** → definir política de merge/encabezados y advertir en `warnings`.
