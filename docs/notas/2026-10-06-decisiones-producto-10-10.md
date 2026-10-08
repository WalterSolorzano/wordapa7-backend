# Decisiones de producto — rumbo a 10/10

Fecha: 2026-10-06
Sesión: brainstorm de mejoras. No se implementó código todavía.

## Pregunta original

> "alguna función o mejora etc que le quedaría 10/10 a mi app?"

## Definición de éxito vigente

Un 10/10 hoy = **datos a salvo** (eje 1) + **la app resuelve sola lo tedioso** (eje 2).
El eje 3 (puntaje / rúbrica / "por qué" citando el manual) queda **descartado por ahora**.

Decisión textual del dueño sobre el eje 1:

> "guarda en una carpeta interna los archivos originales y al darle abrir en word se que
> se abre uno diferente al original... y al descargar pregunta nombre."

Sobre el eje 2:

> "si me gusta que el sistema haga todo por mi, eso tiene mucho camino para pulirse y
> automatizarse."

## Triage de las 18 propuestas

El dueño revisó la lista. Veredicto por propuesta:

| # | Propuesta | Veredicto | Estado real verificado |
|---|---|---|---|
| 1 | Rotular figura/tabla completa de una pasada | **NO** — "mucho gasto de LLM" | Existe parcial (`autoCaptionAll` solo escribe caption, tira la nota) |
| 2 | Avisar si una figura nunca se menciona | **NO** — "mucho ruido" | Existe detección, sin caller de producción |
| 3 | Renumerar todo automáticamente | **SÍ, y que sea proactivo** | **NO EXISTE** corrección; solo hay detección de cruce (`apa_validator.py:251`, `doc_auditor.py:238`) |
| 4 | Hoja horizontal para tabla ancha | **revisar** | **YA EXISTE** (`models.py:190,452`; `generator.py:408,1450`) |
| 5 | Repetir encabezado al partir tabla | **SÍ, debería estar** | **YA EXISTE** (`table_engine.py:266,295,432`; `inplace_editor.py:586`) |
| 6 | Avisar imagen borrosa | **NO** | `esBajaResolucion` existe (DPI 150) |
| 7 | Fuente en la nota de figura | **NO** | — |
| 8 | Reescribir frases que suenan a máquina | **ya está** | Existe patrón "Reformular con IA" (`proofread.py:171`) |
| 9 | Avisar oración enredada | **ya está** | Existe `long_sentence` ≥40 palabras, **pero depende de un componente opcional que puede faltar en silencio** |
| 10 | Unificar terminología / ver variantes | **SÍ**, "que vea variantes o que la LLM ayude a detectar" | **NO EXISTE** (solo `g34_sigla_sin_definir`); hay diseño sin implementar en `mega_set_deteccion_ia.md:1839` |
| 11 | Que la app aprenda de vos | **puede ser, no sé cómo** | Sin implementar |
| 12 | Ordenar citas dentro del texto | **NO** | — |
| 13 | Limpiar partes del motor desconectadas | **revisar primero** | Verificado abajo |
| 14 | Autoguardado + historial de versiones | **"debe estar o estuvo antes"** | **PARCIAL** (ver abajo) |
| 15 | "Abrir en Word" sobre copia | **"funciona bien ya"** | **FALSO: hoy PISA el original** (ver abajo) |
| 16 | Resolver todas las citas sin referencia de una vez | **SÍ** | `autoResolveAllGhostCitations` declarado y **sin implementar** (`types.ts:518`) |
| 17 | Unificar manejo de proyectos | **SÍ** | Conviven dos sistemas; `exportDestino` lee el viejo y tiende a `null` |
| 18 | Importar referencias por arrastre | **SÍ** | Parser BibTeX/RIS ya existe, sin UX de arrastre ni dedupe |

## Verificación (hechos contra el código)

### #13 — Motor: partes desconectadas (confirmado)
- `_SPELL_CHECKER` (`proactive_auditor.py:198`) se instancia y **nunca se usa**.
- `_audit_contrast_hueco` (`:313`) **siempre devuelve vacío y no tiene caller**.
- `passive_voice` y `long_sentence` (`:219,229`) **desaparecen en silencio** si falta
  `spacy es_core_news_sm`. Sin aviso al usuario.
- Decisión pendiente: conectar o declarar "no disponible" en pantalla (regla del proyecto:
  la UI no puede afirmar lo que el código no hace).

### #14 — Autoguardado / versiones (parcial, tres cosas distintas)
- **(a) Backup del .docx**: SÍ (`main.py:3288` `_respaldo_de` → `<archivo>.docx.bak`, una vez).
- **(b) Versiones de proyecto**: SÍ sin restaurar (`proyecto_manager.py:72` agregar, `:86`
  archivar a papelera con retención 30 días, `:104` purgar). **No hay endpoint "restaurar".**
- **(c) Autosave del documento**: SÍ a nivel backend, **no periódico**. Se guarda en cada
  mutación (`session_manager.py:81`) y hay tabla de snapshots que conserva los últimos 5
  (`:193`, endpoint `POST /api/sessions/{id}/snapshot`). **No hay temporizador** y
  **no hay UI para listar/restaurar snapshots**; `documentSlice.ts:425 saveSnapshot` existe
  **sin caller en la UI**. El chip de la barra (`UnifiedToolbar.tsx:36`) solo muestra
  "guardado hace X".
- Lo que falta: **autosave periódico + UI de restaurar versiones/snapshots**.

### #15 — "Abrir en Word" (hoy escribe sobre el original)
- Handler `main.py:3352`; frontend `ExportView.tsx:123`.
- `dest = activeFilePath` (el archivo real del usuario) y `shutil.copy2(output, dest)`
  (`:3448`) → **pisa el original**. Abre en Word `dest.name` (el nombre del original).
- Sí hace backup `.docx.bak` una vez (`:3429`) y devuelve 409 si hay cambios sin guardar
  en Word (`:3411`). "Ver en Word" (`:181`) es el camino no destructivo.
- **Contradice la decisión del dueño** (original inmutable en carpeta interna, Word abre
  una copia, descargar pregunta nombre). Pendiente real del eje 1.

## Lista de trabajo resultante

### Aceptado (eje 1 — datos a salvo)
- **#15** "Abrir en Word" sobre copia: original inmutable en carpeta interna, Word abre una
  copia de trabajo, descarga pide nombre.
- **#14** Completar autosave/versiones: autoguardado periódico + UI de restaurar.

### Aceptado (eje 2 — que la app haga todo)
- **#3** Renumeración proactiva de figuras/tablas **y** de las menciones en el texto.
- **#10** Detección de variantes terminológicas (mismo concepto escrito distinto), con ayuda LLM.
- **#16** Resolver todas las citas sin referencia de una vez (`autoResolveAllGhostCitations`).
- **#17** Unificar los dos sistemas de proyecto (arregla export y carpeta interna).
- **#18** Importar referencias por arrastre (BibTeX/RIS) con dedupe.

### Revisado / a decidir
- **#13** Motor: conectar o declarar como no disponible las partes muertas.
- **#11** Aprendizaje de correcciones del usuario: "puede ser, no sé cómo". Diseñar después.

### Descartado
- **1, 2, 6, 7, 12** (por decisión del dueño).
- **8, 9** (ya existen; 9 depende de componente opcional — ver #13).
- **4, 5** (ya existen).

## Orden recomendado

1. **#15 + #14** — eje 1, el piso.
2. **#3** — figuras proactivas (área pedida por el dueño).
3. **#16 + #10** — el motor resolviendo solo.
4. **#17 + #18** — proyectos y referencias.
