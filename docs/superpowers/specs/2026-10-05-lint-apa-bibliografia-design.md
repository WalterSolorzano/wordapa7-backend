# Epic A — Auditoría APA objetiva de la bibliografía

Fecha: 2026-10-05
Rama: `feat/motor-render-fase1`

## Objetivo

Convertir la fase `referencias` en una fase auditada de verdad. Hoy
`PhaseConfig("referencias", ...)` no declara `criteria`, así que la bibliografía
no produce ningún hallazgo en Revisión. Epic A agrega reglas de forma
deterministas (lint APA 7), mejora el orden alfabético real y avisa cuando el
documento mezcla estilos de cita.

## Alcance

Tres piezas, en orden de valor:

1. **Lint APA por entrada** (motor de estilo, categoría `style`): seis reglas de
   texto que producen hallazgos objetivos con corrección (`Aceptar` /
   `Aceptar todas`).
2. **Orden alfabético APA real**: comparador que ignora tildes, usa solo el
   apellido y salta partículas (`de`, `la`, `van`, `von`). El botón
   "Reordenar alfabéticamente" del wizard reordena `doc.referencias`, que es la
   fuente de la sección exportada.
3. **Estilo mezclado**: detección de citas numéricas tipo IEEE/Vancouver en el
   cuerpo; el wizard solo avisa, no convierte.

Fuera de alcance (A.2): `apa_titulo_title_case` (sentence case), lint type-aware
por campo estructurado, conversión entre estilos.

## Arquitectura

- **Reglas de fase (Approach 1, texto)**: se declaran en
  `python/modules/phase_scope.py`. Cada `kind` va en `RULE_SCOPES` con valor
  `"referencias"`; cada criterio va en `criteria=(...)` de la fase y en
  `_CHECKS`. El guard `test_rule_scopes.py` falla si un `kind` emitido no está
  declarado.
- **Contrato del hallazgo**: `mk(eid, text, start, end, kind, severity, message,
  suggestion=<TEXTO COMPLETO corregido>, phase="referencias", read_only=False)`.
  `useReviewActions.aplicar` escribe el texto completo vía `/api/update-element`,
  así que la sugerencia es la entrada entera, no el fragmento.
- **Frontend**: sin `EngineId` nuevo. Se agregan filas en `PROOFREAD_SPECS` y
  `SUBTYPE_LABELS` (`src/lib/rotulos.ts`) y la acción `accept` en
  `SUBTYPE_ACTION` (`src/hooks/useReviewWorkbench.ts`). Los guardias
  `reglasDeFaseConNombre.test.ts`, `rotulos.test.ts` y
  `noSubtipoInternoEnPantalla.test.ts` exigen las tres filas.

## Reglas v1

| kind | detecta | corrección |
|---|---|---|
| `apa_ampersand` | `y` entre autores antes del año | `&` |
| `apa_doi_forma` | `doi:`, `dx.doi.org`, DOI desnudo | `https://doi.org/…` |
| `apa_edicion` | `2a ed`, `2ª ed`, `2 ed.` | `(2.ª ed.)` |
| `apa_et_al` | `et al` sin punto | `et al.` |
| `apa_espaciado` | doble espacio / espacio antes de puntuación | normaliza |
| `apa_punto_final` | entrada sin punto final (salvo DOI/URL) | agrega punto |

Ninguna regla corre sobre el encabezado de la sección
(`match_phase_exact == "referencias"`). Si la corrección es ambigua, la regla no
se emite (nunca cae a `rewriteText`).

## Orden alfabético

`sort_referencias_alphabetically` (`python/modules/referencias_module.py`) pasa a
usar `_clave_orden_apa`: NFKD sin tildes, minúsculas, sin puntuación, descarta
partículas iniciales, primer token. Endpoint `POST /api/references/sort/{session_id}`
persiste el nuevo orden en `doc.referencias` y lo devuelve.

## Estilo mezclado

`detect_citation_style(doc)` en `python/parsing/citation_matcher.py` cuenta
patrones `[n]`/`(n)` en el cuerpo. Endpoint `GET /api/citation-style/{session_id}`
devuelve `{mixed, ieee, vancouver, apa}`. El wizard muestra un aviso cuando
`mixed`.

## Testing

- Backend: `python/tests/test_referencias_lint.py` (cada regla dispara / no
  dispara; guarda del encabezado), `python/tests/test_orden_apa.py` (comparador y
  endpoint), `python/tests/test_citation_style.py` (detección).
- Frontend: `reglasDeFaseConNombre.test.ts` y `rotulos.test.ts` cubren las filas
  nuevas; se agregan casos del aviso de estilo en el wizard.

## Bordes

- No se toca la portada ni `computePages`.
- `isOrphan` sigue vetado en el wizard (guarda de deuda de R3).
- Cero emojis; solo tokens CSS; micro-diffs.
