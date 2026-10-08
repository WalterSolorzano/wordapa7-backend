# Clasificación robusta de H1/H2/H3 en documentos no típicos

> **Estado: diseño aprobado, listo para plan.** Hace que el clasificador de
> títulos reconozca documentos que no siguen el manual de Word —el caso que
> rompe hoy es el autor que escribe `INTRODUCCION` en mayúsculas, a la
> izquierda, sin negrita y sin estilo Heading.

## El defecto que este ciclo viene a cerrar

`python/parsing/pre_classifier.py` (1630 líneas, nueve pasadas) decide el nivel
de cada título. Funciona bien con documentos que usan los estilos nativos de
Word o una de sus heurísticas conocidas. Falla con títulos "no típicos", que son
la mayoría de los documentos reales de estudiantes:

- **C1 — `INTRODUCCION` en mayúsculas, izquierda, 12 pt, sin negrita.** El
  keyword `introduccion` existe (`HEADING1_KEYWORDS` L91-159) pero L626 exige
  `centered or bold or font_size>=14`. No cumple ninguno. El score da 0.3
  (sin punto +0.1, menos de 12 palabras +0.2), por debajo de 0.4, así que **cae a
  párrafo**. Título no clasificado.
- **C2 — Título solo por tamaño de fuente (>14 pt) alineado a la izquierda.**
  L814-821 exige `centered`, así que no cae como H1. Cae por score con 0.4, como
  **H2** (L1534), no H1. Nivel dudoso.
- **C3 — Título solo en mayúsculas con punto final, sin negrita, sin centrar,
  sin número.** Ninguna heurística matchea; el score queda bajo. **No
  clasificado.**
- **C4 — `CAPITULO I` sin punto tras el romano.** `REGEX_NUMBERED_HEADING`
  (L44-46) exige `\.` para el romano, así que no matchea. Solo cae si es negrita
  o centrado por otra vía.
- **C5 — Negrita a la izquierda con fuente menor a 13 pt, sin número.** No cae en
  H2 (L772 exige `font_size>=13`); cae por score 0.6 como H2 con
  `needs_review=True`. Marginal.
- **C6 — El `outline_level` real de Word nunca llega al clasificador.**
  `StyleFingerprint` (`clustering_classifier.py` L88) tiene `outline_level`
  **hardcodeado a 9.0**. Solo `com_reader.py` (L367, L473-475), que vive dentro
  de Word por COM, lee el outline real. En la app, un docx que marque títulos
  **solo** por `w:outlineLvl` (sin estilo Heading ni formato directo) no se ve.

## Restricciones que este ciclo NO puede romper

Estas son reglas innegociables del proyecto; el plan las respeta sin excepción:

- **Nunca decidir el ámbito de una fase buscando palabras en el cuerpo de un
  párrafo.** La comparación de fase ocurre solo sobre el título de un H1
  (`match_phase`), nunca sobre el cuerpo (fue el bug original de `"meta"` dentro
  de `"metodología"`).
- **Un H2 hereda el ámbito de su H1 ancestro**; no abre ámbito propio. El mapa de
  ámbitos se construye solo con H1 (`build_phase_map`, `phase_scope.py`
  L550-593); antes del primer H1, el ámbito es `portada`.
- **Para corregir niveles de título se usa `match_phase_exact`, no `match_phase`**
  (`/api/normalize-headings`, `python/routers/sessions.py` L639). Un H2 que dice
  "Resultados" a secas se promueve; "Resultados de la encuesta" no, lleva un
  calificador que avisa de intención.
- **La portada se mide pero no se escribe**: sus criterios llegan con
  `read_only=True`, sin `suggestion`. Los criterios de título exigen
  `is_cover=True`.
- **Cero emojis; solo tokens CSS** (eso es UI, pero aplica si el plan toca la
  vista de Estructura).

## D1 — Leer el `outline_level` real del docx y propagarlo

`docx_parser.py` (que hoy deja `heading_level=None` en L1135 y L1353) extrae
`w:outlineLvl` del `w:pPr` de cada párrafo cuando existe, y lo pone en el
`ElementModel`. `StyleFingerprint` (`clustering_classifier.py` L88) deja de
hardcodear 9.0 y usa el valor real; el 9.0 pasa a ser el "sin outline" explícito.

`w:outlineLvl` vale 0..8, donde 0 = nivel 1. La conversión a 1..5 se hace una
sola vez, con test en `test_heading_numbering_notation.py` o un test nuevo.

**Por qué importa:** es la señal más fuerte y barata que un documento puede dar.
Word la escribe cuando el usuario usa la vista Esquema o los estilos de título.
Hoy se ignora en todo el pipeline salvo dentro de Word.

## D2 — Heurísticas para títulos no típicos

Se agregan/ajustan reglas en `pre_classifier.py` para los casos C1-C5, cada una
con su test:

- **Mayúsculas cortas que son un título, sin negrita ni centrado.** Una línea
  corta, toda en mayúsculas (ya existe `_is_all_caps` L169-174), sin punto final,
  con muy pocas palabras, es un título aunque no sea negrita, no esté centrada y
  mida 12 pt. Es exactamente `INTRODUCCION`, `METODOLOGIA`, `CONCLUSIONES`. El
  umbral de palabras y el de caracteres los fija el plan.
- **Solo tamaño grande (izquierda) → H1, no H2.** Un título que destaca por
  tamaño de fuente respecto a la mediana, sin otro formato, debe caer como H1
  cuando además es corto y sin punto. Hoy cae H2 por el orden de L1516-1541.
- **Mayúsculas con punto final.** El punto final no descalifica un título corto
  en mayúsculas; hoy el score resta por punto (falta de +0.1) y lo hunde.
- **`CAPITULO I` sin punto.** Extender el reconocimiento de romano
  (`REGEX_NUMBERED_HEADING` L44-46 y el bloque L642-679) para aceptar el romano
  sin el punto obligatorio cuando va precedido de la palabra capítulo/parte.
  Cuidado con no convertir "Seiri" 1-2 palabras en heading (excepción L643-653):
  la regla nueva exige el prefijo `capitulo`/`parte` o el número romano seguido
  de título, no una palabra suelta.

**Regla de oro:** cada heurística nueva es **una señal más**, nunca un atajo que
se salte los guards existentes (longitud máxima de heading L191-209, detección
multi-oración, `_demasiado_largo_para_heading`). Un párrafo de 40 palabras en
mayúsculas sigue siendo párrafo.

## D3 — Mantener la disciplina de ámbitos

Ninguna heurística de este ciclo cambia cómo se decide la fase. Los títulos
nuevos entran al mismo `build_phase_map`, y solo un **H1** abre ámbito. Si una
línea se promueve a H1 por tamaño, se trata como cualquier H1: abre fase si su
título hace `match_phase`, y si no lo hace, queda como H1 sin fase propia (no
inventa ámbito).

El clasificador **no** endurece criterios de fase ni decide ámbitos: solo asigna
niveles 1/2/3. La fase la resuelve `phase_scope` después, sobre el título.

## D4 — Frontend: confiar en el nivel, no re-adivinar

`src/lib/jerarquia.ts` (`construirJerarquia` L419-474, `faseDeTitulo` L197-215)
hoy confía en `heading_level` que ya viene calculado del backend, y eso está
bien. Este ciclo **no** agrega heurística de negrita/tamaño en el frontend: si un
título se clasificó mal, se arregla en `pre_classifier`, no en la vista.

La única tarea de frontend es verificar que los niveles nuevos (por ejemplo un H1
promovido por tamaño) se rendericen bien en `Step2HeadingsWizard.tsx` y en el
árbol de Estructura, con los tests que ya existen (`jerarquia.test.ts`,
`estructuraNoMiente.test.ts`).

**Nota de divergencia conocida:** los alias de `PHASES.titles` no viajan al
frontend (`VOCABULARIO` en `jerarquia.ts` L97-104 tiene un rótulo por fase).
"Metodología de la investigación" da `null` en el frontend y fase en el backend.
Esto está documentado y **no** es parte de este ciclo; se menciona para que el
plan no lo confunda con una regresión.

## Fuera de alcance

- Unificar el vocabulario de fases backend/frontend (divergencia conocida).
- Reclasificar documentos ya procesados: el motor corre al cargar el documento,
  como hoy.
- Cambiar cómo `inplace_editor.py` escribe el formato APA 7 de cada nivel. Solo
  se le entregan mejores niveles de entrada.

## Criterios de aceptación

1. Un docx con `w:outlineLvl` y sin estilo Heading recibe los niveles correctos,
   verificado por test.
2. `INTRODUCCION` en mayúsculas, izquierda, 12 pt, sin negrita clasifica H1, con
   test.
3. Un título solo por tamaño de fuente, corto y sin punto, clasifica H1 (no H2),
   con test.
4. `CAPITULO I` sin punto clasifica H1, y `Seiri` 1-2 palabras **no** se promueve,
   con tests.
5. Un párrafo largo en mayúsculas **no** se promueve (guard de longitud intacto),
   con test.
6. Ninguna regla de fase cambia: `test_phase_scope.py` y `test_rule_scopes.py`
   en verde sin modificar sus expectativas.
7. `pytest python/tests/` y `npm test` en verde.
