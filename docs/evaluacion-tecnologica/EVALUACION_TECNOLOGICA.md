# Evaluación Tecnológica Comparativa — WordAPA7 (2026-08)

> Benchmarks empíricos de sandbox (`research/viabilidad-2026-08`). Evidencia cruda: `docs/evaluacion-tecnologica/area1.json`, `area4.json`. Este documento es la fuente que motiva las fases de implementación y su trazabilidad.

## S1 — Manipulación OOXML (python-docx+lxml vs docx4j vs Open XML SDK)

| Criterio | python-docx+lxml (hoy) | docx4j (JVM) | Open XML SDK (.NET) |
|---|---|---|---|
| Round-trip fiel | ✅ (scoped_apply 20-205 ms/doc) | ✅ | ✅ |
| Cobertura sin lxml crudo | parcial: numbering/SDT/AlternateContent a mano | alta | alta + `OpenXmlValidator` |
| Costo operativo en stack Python/Electron | 0 | JVM embebido (~100+ MB, IPC) | runtime .NET o pythonnet |
| Veredicto | **MANTENER** | no-go (costo JVM injustificado) | híbrido puntual solo si se necesita validador oficial |

**Métrica de caída a lxml**: sitios productivos que tocan partes no cubiertas por python-docx = `bullet_engine.py`, `xml_deep_parser.py` (numbering/sdt/textbox), `inplace_editor` (bibliografía). ~3 módulos de ~40 → cobertura nativa ≈ 92%. No justifica migrar.

## S2 — Numeración

**Hallazgo crítico (PoC reproducible)**: `bullet_engine.apply_bullet_from_template()` inyecta `numId=1/2` fijos SIN crear ni validar `word/numbering.xml`.
- Corpus: 0 refs huérfanas HOY en salidas scoped (in-place no crea listas nuevas).
- PoC colisión: documento con `numId=1` decimal del usuario → la viñeta del pipeline hereda formato decimal. `misformat_confirmed: true` (area4.json).
- Symbol/Wingdings in-place: preservado ✅ (no tocamos numbering part).

**Recomendación**: FIX quirúrgico (alloc dinámico de numId libre + abstractNum garantizado). Template-registry estático = innecesario para el caso actual. → FASE 1.1.

## S3 — Bibliografía APA

citeproc-py instalado y evaluado contra casos límite APA 7 (mismo autor-año, corporativo, s.f., DOI): gaps conocidos del spec CSL (desambiguación año-suficiente, colapso) afectan justo nuestros casos frecuentes; el formateador propio ya supera el 93% de exactitud medido.
**Recomendación**: MANTENER formateador propio + adoptar **CSL-JSON como formato intermedio estructurado** (interoperabilidad Zotero/Mendeley futura, dedup más robusta) sin cambiar el render. Haskell-por-subproceso = no-go (deploy pesado, ganancia marginal). → FASE 3.2.

## S4 — Protección de portada

Corpus sintético con ground-truth (5 variantes: plaintext, tabla+logo, textbox anidado mc:AlternateContent, imagen flotante, mixta).

**Round-trip SIN pedir portada (pipeline actual)**: `zone_identical=false` en **5/5** — daño reproducible 100%.
Tres vectores confirmados:
- V1: detección de zona falla con portadas estructurales (tabla/textbox/flotante) → 3/5 variantes con `body_start_idx=0` (trata portada como cuerpo). area1.json C_zones.
- V2: scope "texto" añade sangría a párrafos de portada AUN detectados correctamente (plaintext 7/7 detectado y dañado igual).
- V3: scope "tablas_imagenes" reformatea tablas dentro de la zona (jc center→left).

**SDT lock**: `w:lock` NO detiene manipulación lxml directa (`lock_stopped_us:false` en 4/4), PERO envolver la portada en `w:sdt` la saca de `doc.paragraphs` de python-docx → los scopes dejan de tocarla incidentalmente (protección estructural efectiva contra NUESTRO pipeline). En Word UI, `contentLocked` sí bloquea al usuario.

Office.js: requirement set actual = WordApi 1.3; `ContentControl.cannotEdit/cannotDelete` disponible desde 1.1 → viable como capa extra del add-in si se desea, pero redundante cuando el propio OOXML viaja con `contentLocked`.

**Recomendación**: FIX raíz (exclusión de portada en scopes usando el MISMO detector del parser) + SDT opt-in como blindaje. Convención sola = insuficiente (0/5). → FASE 1.2 y 2.1.

## S5 — Verificación post-generación

Hoy: cero verificación renderizada. Word-COM disponible en el parque de usuarios (prerequisito del add-in). Plan: gate asíncrono `/api/audit/pagination` con watchdog PID-scoped y estado honesto cuando Word no esté. OpenXML Validator queda como candidato de pre-chequeo barato (dependencia .NET nueva → requiere aprobación explícita; pospuesto). → FASE 3.1.

## S6 — Superficie Office.js subutilizada

Uso hoy (grep): `insertOoxml/getOoxml/search/ranges` en figureCaptions/highlighter/wordHelper. **No usado**: ContentControls API, TrackChanges API (`getReviewedText`/`acceptAll` etc.), `insertContentControl`.
- List API (`startNewList/attachToList`): el add-in NO crea listas hoy → **N/A**, no se inventa feature.
- ContentControls: aplicable solo si se quiere candado adicional desde el panel; el SDT del motor ya cubre el caso principal.
- TrackChanges API: oportunidad futura real para aplicar cambios reversibles sin el motor de track_changes propio (fuera de alcance de este sprint).

## Ranking impacto/esfuerzo (números, no intuición)

| # | Acción | Impacto (casos usuario rotos hoy) | Esfuerzo | Orden |
|---|---|---|---|---|
| 1 | Exclusión de portada en scopes (V2/V3) | daño 5/5 variantes | bajo-medio | FASE 1.2 |
| 2 | Detector de zonas para portadas estructurales (V1) | 3/5 variantes mal clasificadas | medio | sigue a 1 |
| 3 | numId dinámico en bullet_engine | rebuild con listas de usuario | bajo | FASE 1.1 |
| 4 | SDT opt-in portada | blindaje estructural | bajo | FASE 2.1 |
| 5 | Gate COM paginación | síntoma overflow sin medir | medio | FASE 3.1 |
| 6 | CSL-JSON intermedio | interoperabilidad/dedup | bajo-medio | FASE 3.2 |

---

## RESULTADOS POST-IMPLEMENTACIÓN (misma batería, código corregido)

| Criterio medible | ANTES | DESPUÉS | Commit |
|---|---|---|---|
| Round-trip portada intacta (scope texto+tablas, 5 variantes) | **0/5** `zone_identical` | **5/5** ✅ (218/26/31/25/25 ms) | 09a1db8 |
| Secuestro numId (viñeta hereda decimal del usuario) | `misformat=true` | **`false`** ✅ (ruta productiva `format_bullet_item`) | 9674822 |
| Symbol/Wingdings in-place preservado | ✅ ya funcionaba | ✅ se mantiene | — |
| Protección estructural opt-in (`cover_protect_sdt`) inexistente → idempotente + contenido byte-igual + oculta de iteradores | — | ✅ tests test_cover_sdt.py | e952156 |
| Verificación paginación real (Word renderizado) inexistente → endpoint + overflow detectado en doc real (imagen 35cm ⇒ ≥2 págs + warning) | — | ✅ test integración Word real | 6deec77 |
| CSL-JSON intermedio (autores split/corporativo/s.f./DOI vs URL) | — | ✅ 4 tests, render propio intacto | 6deec77 |

**Decisiones documentadas (no reinventar):**
- S6 List API add-in: el add-in NO crea listas hoy → N/A, no se implementa feature nueva.
- 3.3 UI de portada: YA EXISTE (`APACoverEditor.tsx`, `CoverEditorPanel.tsx`, wizard paso 1). El toggle "proteger" queda expuesto vía `rules.cover_protect_sdt` para que la UI existente lo wire cuando corresponda.
- OpenXmlValidator (.NET): pospuesto — requiere dependencia nueva (aprobación explícita); el gate COM cubre el síntoma usuario.

**Suite**: pytest 409 passed / 14 skipped · tsc root limpio · vitest raíz y add-in intactos (sin cambios TS este sprint).
