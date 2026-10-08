# API de contenido + diagramas para IA externa — Diseño

> Spec de diseño. Autoridad para el plan de implementación. Léelo junto con
> `docs/superpowers/specs/2026-10-04-correcciones-figuras-tablas-design.md`
> (estilos de figura/tabla y numeración),
> `docs/superpowers/specs/2026-09-27-taxonomia-por-fase-design.md` (ámbitos) y
> `docs/superpowers/specs/2026-10-03-redisenio-figuras-tablas-design.md` (Taller).

**Fecha:** 2026-10-05
**Estado:** aprobado en chat (enfoque A, COM-cuando-disponible, MVP flujo/árbol/red). Pendiente de review del usuario sobre este archivo.
**Rama de trabajo:** `feat/motor-render-fase1` (o la que indique el usuario al ejecutar).

## 1. Visión

Hoy, para producir un `.docx` APA 7 con el programa, alguien tiene que pasar por
la App (subir un documento, revisar, exportar) o escribir OpenXML a mano. Una IA
externa que quiera "construir un Word usando el programa" gasta miles de tokens
reproduciendo a mano el formato APA, los estilos de figura y la numeración —trabajo
que el programa ya sabe hacer.

Esta spec define una **API de contenido**: un payload semántico compacto (texto,
títulos, tablas, figuras, referencias, portada) que el programa convierte en un
`.docx` APA 7 terminado, con **la misma fidelidad y los mismos estilos que ya usa
la App**. Incluye un **lenguaje de diagramas** propio, pequeño y determinista, para
que la IA pida un flujo, un árbol o una red en una o dos líneas en vez de dibujar
OpenXML.

Resultado esperado: una IA externa describe contenido, no formato; ahorra tokens; y
el `.docx` sale con los estilos de figura existentes, la numeración `Figura N`
continua y la portada tratada según `use_original_cover`.

**No** es un reemplazo de `/api/generate`, del copiloto, del editor in-place ni de
la vía PDF con Word. Es una puerta nueva que reusa esos motores.

## 2. Constraintos globales (no negociables)

Vigentes para TODAS las tareas del plan (de `AGENTS.md` y `MEMORY.md`):

- **COM intacto.** El guard de `/api/generate` (`python/main.py:2020-2026`), la ruta
  in-place (`apply_inplace`), el post-proceso (`doc_converter.process_and_convert`),
  la paginación/PDF con Word y el copiloto **no se tocan ni se degradan**. El
  endpoint nuevo NO exige Word: llama a `process_and_convert`, que ya devuelve
  `(False, None)` cuando no hay motor (`python/services/doc_converter.py:71-81`), y
  en ese caso entrega el rebuild puro. Word COM sigue *lazy on-demand*,
  `Visible=False`, `DisplayAlerts=0`.
- **Cero emojis** en UI, mensajes, comentarios o plantillas. Solo `lucide-react`.
- **Solo design tokens CSS** en el frontend (si tocamos preview de diagrama).
  Prohibido hex inline. El tema de diagrama backend declara su paleta APA en un
  único módulo (`themes.py`), no recibe hex por request.
- **Portada protegida.** Con `use_original_cover: true` no se muta la portada.
  En el modo contenido no hay original: la portada se **genera** desde `meta`
  (`use_original_cover=False`), nunca se "conserva" algo que no existe.
- **Motores existentes intactos y reusados:** `generate_apa7_docx`
  (`python/generation/generator.py:832`), `format_apa_figure`
  (`python/generation/image_handler.py`), `captions.scan_existing`
  (`python/modules/captions.py`), `table_engine`, `phase_scope`. Se extienden, no se
  reemplazan.
- **Cero dependencias nuevas.** `networkx`, `Pillow` y `PyMuPDF` ya están en
  `requirements.txt` y se verificó en runtime (`fitz 1.28.0` rasteriza SVG→PNG;
  `networkx 3.4.2`; `Pillow 10.4.0`). Prohibido agregar matplotlib/graphviz/mermaid.
- **Ámbitos de fase:** el ámbito es dato declarado (`RULE_SCOPES`), nunca inferido
  del cuerpo de un párrafo. Un diagrama insertado no altera ámbitos.
- **Verificación:** baseline `pytest -q` (809 passed / 14 skipped por COM),
  `npx vitest run` (1401 passed), `npx tsc --noEmit` limpio, `npm run build` ok.
  Tras cada tarea, suite focalizada; la completa antes del commit final.
- **Terminal:** `git` directo está roto por el wrapper `snip.exe`; usar
  `cmd /c git ...`. `git add` **archivo por archivo**; nunca `git add -A`.

## 3. Decisiones de diseño

- **D-1. El esquema de contenido es el contrato.** Una sola definición canónica
  (`ContentDocument`, pydantic). Se acepta forma larga y forma corta; la corta es la
  que conviene a la IA por costo de tokens. La misma definición se expone en el MCP.
- **D-2. Emisión = `generate_apa7_docx` siempre; COM es un realce opcional.** El
  endpoint nuevo nunca exige Word. Si `process_and_convert` tiene motor, se aplica el
  acabado; si no, se devuelve el `.docx` puro. Un solo camino de datos, dos calidades.
- **D-3. El diagrama entra como figura normal.** El render produce un PNG en la
  sesión y se envuelve en un `ImageModel` (con `design_style`, `caption_position`,
  `note`, etc.). Así heredan TODOS los estilos de figura, la numeración y la
  inserción existentes (`format_apa_figure`) sin código paralelo.
- **D-4. DSL cerrado y determinista.** Gramática de líneas, sin parser ambiguo.
  Cada `kind` conoce sus operadores; una línea inválida produce *warning* y se omite,
  no una excepción. El mismo DSL da el mismo PNG (test de determinismo).
- **D-5. MCP es la superficie primaria auto-descriptiva.** La IA descubre el esquema
  y el DSL con `content_schema()` sin gastar tokens leyendo código. REST y CLI son
  alias sobre el mismo núcleo.
- **D-6. Numeración continua.** `FigureModel.figure_number` y `TableModel.table_number`
  salen de `captions.scan_existing` sobre el payload; nunca reinician en 1 si el
  documento ya traía serie.
- **D-7. El builder es puro.** `build_content_document(payload) -> (DocumentModel,
  PortadaData, list[ReferenciaModel])` no toca disco salvo assets de diagrama; se
  testea sin Word y sin red.
- **D-8. El documento construido es una sesión de primera clase.** Se persiste con
  `session_manager.save_session_state` para que el copiloto y la revisión puedan
  usarlo después, y para reusar `_artifact_url`/`_write_export_manifest`.

## 4. Arquitectura

### 4.1 Modelo de contenido (`python/content/schema.py`)

```python
class DiagramBlock(BaseModel):
    kind: Literal["flow", "tree", "net"]          # F1
    dsl: str
    caption: str = ""
    note: Optional[str] = None
    style: str = "standard"      # uno de los 6 design_style existentes
    caption_position: Literal["above", "below"] = "above"
    alt_text: Optional[str] = None

class TableBlock(BaseModel):
    caption: str = ""
    note: Optional[str] = None
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    style: str = "apa"           # apa|compact|expanded|grid|zebra
    orientation: str = "auto"    # auto|portrait|landscape

class ContentBlock(BaseModel):
    # forma corta: exactamente uno de estos
    h1: Optional[str] = None
    h2: Optional[str] = None
    p: Optional[str] = None
    bullets: Optional[list[str]] = None
    numbered: Optional[list[str]] = None
    quote: Optional[str] = None
    table: Optional[TableBlock] = None
    diagram: Optional[DiagramBlock] = None
    cite: Optional[str] = None       # cita en-texto pegada al bloque de texto

class ContentDocument(BaseModel):
    meta: ContentMeta                 # title, author, institution, course, date, language, cover_mode
    content: list[ContentBlock]
    references: list[str] = Field(default_factory=list)   # texto APA crudo
```

Regla: en un `ContentBlock`, exactamente uno de los campos "de tipo" está presente.
Varios presentes o ninguno ⇒ validación falla con mensaje claro (no se adivina).

`ContentMeta` mapea a `PortadaData` (title/institution/course/date/language/cover_mode,
`use_original_cover=False`) y a `DocumentMeta` (autor, etc.). Ver `python/models.py:594`
(`PortadaData`) y `:770` (`ReferenciaModel`).

### 4.2 Tubería

```
payload (JSON/CLI/MCP)
   |
   v
content.builder.build_content_document(payload) ---> DocumentModel + PortadaData + ReferenciaModel[]
   |                                                        |
   |  (por cada DiagramBlock)                               |
   v                                                        v
diagrams.render(kind, dsl, ...) --> PNG en <sesión>/figures/  ImageModel(design_style, caption_position, ...)
   |                                                        |
   +---------------------------+----------------------------+
                               v
            session_manager.save_session_state(doc, STORAGE_DIR)
                               v
            content.emit.emit_docx(...)  -->  generate_apa7_docx(doc, out, rules, portada, refs)
                               v
            doc_converter.process_and_convert(...)   # COM si está; si no, (False, None)
                               v
            { session_id, download_url, warnings[] }
```

Puntos de anclaje reales:

- `generate_apa7_docx(doc_model, output_filepath, rules=None, portada=None,
  references=None, remove_cover_paragraphs=False) -> Path`
  (`python/generation/generator.py:832`). Para contenido no hay `original.docx`: usa
  la rama sintética (`docx.Document()` en `:874-876`).
- `process_and_convert(original_path, generated_path, final_path, preserve_cover=False,
  generate_pdf=True, rules=None) -> (bool, Optional[Path])`
  (`python/services/doc_converter.py:55`). Ya captura la ausencia de motor
  (`:71-81`) y devuelve `False`. **No lanza** por no tener Word.
- Sólo COM: `doc_converter.get_active_engine()` (`:32-53`) sigue siendo la única
  autoridad para el acabado. No se modifica.

### 4.3 Motor de diagramas (`python/diagrams/`)

- `parser.py` — `parse_dsl(kind, dsl) -> DiagramSpec` (nodos, aristas, etiquetas,
  jerarquía, direcciones). Determinista; errores por línea como `warnings`.
- `layout.py` — posiciones con `networkx`: capas (flujo), jerárquico (árbol),
  force-directed con semilla fija (red). Semilla fija ⇒ posiciones reproducibles.
- `themes.py` — paleta APA en un solo lugar: tinta `#111827`, relleno blanco, trazo
  fino, tipografía Times New Roman, escala de grises. El único módulo con hex.
- `render.py` — `render_diagram(spec, theme) -> svg_str` y
  `rasterize(svg_str, out_png) -> Path`. Rasteriza con PyMuPDF
  (`fitz.open(stream=svg_bytes, filetype="svg")` → `get_pixmap(dpi=…)`), ya verificado.
  `render_png(kind, dsl, style) -> Path` es la función que consume el builder y el MCP.
- `__init__.py` — fachada `render_png` y `list_kinds`.

python-docx no embebe SVG, por eso el formato de inserción es PNG (D-3). El SVG se
conserva como salida de preview del MCP y, si algún día se quiere, para el frontend.

### 4.4 Superficies (mismo núcleo)

- **REST** `python/routers/content.py` + registro en `main.py`:
  `POST /api/content/build` → `{session_id, download_url, warnings[]}`. Reusa
  `_artifact_url` (`main.py:214`) y `_write_export_manifest` (`:205`).
- **MCP** `python/mcp_server.py`: tools `content_schema()`, `build_document(payload)`,
  `render_diagram(kind, dsl, style)` (devuelve SVG/PNG de preview), `list_styles()`.
- **CLI** `python -m content payload.json -o salida.docx`.

Los tres llaman a `content.builder` + `content.emit`; ninguno reimplementa formato.

## 5. Especificación del payload

Forma corta (canónica para la IA):

```json
{
  "meta": {
    "title": "Efecto de X en Y",
    "author": "Ana Pérez",
    "institution": "Universidad Nacional de Ingeniería",
    "course": "Metodología de la Investigación",
    "date": "2026",
    "language": "es-ES"
  },
  "content": [
    {"h1": "Método"},
    {"p": "Se aplicó un diseño cuasi-experimental.", "cite": "(Hernández, 2014)"},
    {"bullets": ["Grupo control", "Grupo experimental"]},
    {"table": {"caption": "Instrumentos", "rows": [["Instrumento", "Ítems"], ["Encuesta", "20"]]}},
    {"diagram": {"kind": "flow", "dsl": "Inicio > Medición\nMedición > ¿Válido?\n¿Válido? >|sí| Análisis\n¿Válido? >|no| Medición", "caption": "Flujo del procedimiento", "style": "scientific"}}
  ],
  "references": ["Hernández, R. (2014). Metodología de la investigación. McGraw-Hill."]
}
```

Reglas:

- `h1` abre fase; `h2` hereda ámbito de su `h1` (taxonomía por fase intacta).
- `cite` es texto en-texto; no dispara Crossref salvo que el builder lo pida
  explícitamente. Referencias se formatean por el engine APA existente.
- `table` sin `headers` ⇒ tabla sin fila de encabezado. No se promueve la primera fila
  de `rows` a encabezado: la ambigüedad se prohíbe.
- `diagram.style` acepta los 6 valores reales de `ImageModel.design_style`:
  `standard | sidebar | scientific | corner | full_width | multipanel`. Un valor
  fuera de la lista ⇒ warning + `standard`.
- La forma larga (claves explícitas equivalentes) también es válida; la corta gana en
  token-cost.

## 6. Especificación del DSL de diagramas

Gramática de líneas. Comentario: línea que empieza con `#`. Identificadores: texto
libre hasta un operador, recortado de espacios. El primer token no vacío puede ser el
`kind` o se toma del campo `kind`.

**flujo** (`kind: flow`) — aristas dirigidas, layout por capas:

```
# operadores
A > B            arista A -> B
A >|etiqueta| B  arista A -> B con etiqueta
A > B > C        cadena (equivale a A>B y B>C)
```

**árbol** (`kind: tree`) — la primera línea es la raíz; la indentación es el nivel:

```
Diseño
- Experimental
-- Grupo control
-- Grupo tratado
- No experimental
```

Un guion por nivel; `--` es hijo de `-`, etc. Saltar un nivel ⇒ warning y se cuelga del
nivel más cercano.

**red** (`kind: net`) — no dirigida por defecto, `->` para dirigida:

```
A -- B           arista no dirigida
A -> B           arista dirigida
A -- B -- C      cadena
```

Reglas de error (todas producen `warnings`, nunca excepción):

- `kind` desconocido ⇒ el bloque diagrama se omite con warning explícito.
- Línea sin operador en `flow`/`net` ⇒ warning; si es el único contenido, diagrama vacío.
- Nodo repetido ⇒ se reusa (no se duplica).
- `caption` vacío ⇒ se permite; aparecerá `Figura N` sin descripción.

## 7. Workstreams

### WS1 — Núcleo de contenido (schema + builder)

**Comportamiento**

- `build_content_document(payload) -> (DocumentModel, PortadaData, list[ReferenciaModel])`.
- Mapea bloques a `ElementModel` con `ElementType` correcto (`h1/h2`→heading con
  `heading_level`), `p`→paragraph, `bullets`→bullet, `numbered`→numbered_list,
  `quote`→block_quote.
- `table`→`TableModel` con los campos del spec de figuras/tablas (style/orientation).
- `diagram`→ llama `diagrams.render_png`, guarda el PNG y crea `ImageModel`.
- Numeración: `captions.scan_existing` sobre textos del payload; asigna
  `figure_number`/`table_number` continuando la serie.
- `meta`→`PortadaData(use_original_cover=False, ...)` + `DocumentMeta`.
- Validación estricta: un solo campo de tipo por bloque; `kind`/`style` desconocidos ⇒
  warn + default; nunca `KeyError`.

**Archivos**

- Nuevos: `python/content/__init__.py`, `python/content/schema.py`,
  `python/content/builder.py`.
- Reusa: `python/models.py` (`ElementModel`, `ImageModel`, `TableModel`,
  `DocumentModel`, `PortadaData`, `ReferenciaModel`), `python/modules/captions.py`.
- NO tocar: `generate_apa7_docx`, `image_handler`, `doc_converter`.

**Tests**

- `python/tests/test_content_builder.py`: payload corto⇒DocumentModel con tipos
  correctos; numeración continúa serie; `style` inválido ⇒ warning + default;
  bloque con dos campos de tipo ⇒ error claro; portada `use_original_cover=False`.

### WS2 — Motor de diagramas (flow/tree/net)

**Comportamiento**

- `parse_dsl`, `layout`, `render_svg`, `rasterize_png`, deterministas con semilla fija.
- Tema APA: Times New Roman, tinta `#111827`, relleno blanco, trazo fino, grises.
- Salida PNG a `<sesión>/figures/diagram-<n>.png`.

**Archivos**

- Nuevos: `python/diagrams/{__init__,parser,layout,themes,render}.py`.
- Usa: `networkx` (ya está), `Pillow` (ya está), `fitz` (PyMuPDF, ya está).

**Tests**

- `python/tests/test_diagrams_parser.py`: gramática válida de los 3 kinds; líneas
  inválidas ⇒ warnings; nodo repetido no duplica.
- `python/tests/test_diagrams_render.py`: mismo DSL ⇒ mismo PNG (hash estable);
  `rasterize` produce PNG no vacío; `render_png` de cada kind abre con Pillow.

### WS3 — Emisión y post-proceso opcional

**Comportamiento**

- `emit_docx(doc, portada, refs, session_dir) -> (Path, bool)`:
  1. `generate_apa7_docx(doc, out_file, rules, portada, refs)`.
  2. `process_and_convert(...)`; si devuelve `(True, path)` usa `path`; si no, usa el
     `.docx` puro. Nunca exige Word.
  3. Marcador de idempotencia (`add_marker_to_docx`) como en `main.py:2093`.

**Archivos**

- Nuevo: `python/content/emit.py`.
- Reusa: `generator.generate_apa7_docx`, `services.doc_converter.get_doc_converter`,
  `persistence.idempotency.add_marker_to_docx`.

**Tests**

- `python/tests/test_content_emit.py`: sin motor COM el `.docx` existe y abre con
  python-docx; con doble de `process_and_convert` que devuelve `True` se usa el final;
  el marcador está presente.

### WS4 — Superficien REST

**Comportamiento**

- `POST /api/content/build` con `ContentDocument` (o dict) en el body.
- Devuelve `{session_id, download_url, warnings[]}`; 422 si el payload no valida.
- Persiste la sesión para que revisión/copiloto puedan abrirla después.

**Archivos**

- Nuevos: `python/routers/content.py`.
- Modifica: `python/main.py` (registrar el router; no tocar `/api/generate`).

**Tests**

- `python/tests/test_content_router.py`: build corto⇒200 + `download_url`;
  payload inválido⇒422; `warnings` no vacío con diagrama de `kind` desconocido.

### WS5 — Servidor MCP

**Comportamiento**

- `python/mcp_server.py` con tools `content_schema()`, `build_document(payload)`,
  `render_diagram(kind, dsl, style)`, `list_styles()`.
- `content_schema()` devuelve la descripción del esquema y del DSL (auto-descripción:
  la IA no lee el código fuente).

**Archivos**

- Nuevo: `python/mcp_server.py` (usa el SDK MCP disponible; si no está como dep, el
  plan decide entre incluirlo o exponerlo como entrada a `mcp` sin nueva dependencia
  runtime del backend web).

**Tests**

- `python/tests/test_mcp_server.py`: `content_schema()` describe los 3 kinds y las
  claves cortas; `build_document` con payload mínimo produce artefacto; `list_styles`
  devuelve los 6 `design_style`.

### WS6 — CLI

**Comportamiento**

- `python -m content payload.json -o salida.docx [--no-com]`.
- `--no-com` fuerza emisión pura (útil en CI/headless).

**Archivos**

- Nuevo: `python/content/build.py` (`__main__`).

**Tests**

- `python/tests/test_content_cli.py`: un payload temporal + `--no-com` produce `.docx`
  que abre con python-docx.

### WS7 — Integración con el copiloto

**Comportamiento**

- Nueva acción `add_diagram` en el DSL del copiloto (`python/modules/ai_document_editor.py`):
  `{type:"add_diagram", kind, dsl, caption, style}`.
- Aplicación: render PNG + `ImageModel` + inserción por `format_apa_figure`
  (`image_handler.py`). Numeración vía `captions.scan_existing`.
- Fallback determinista: si el modelo no entiende una petición de diagrama, responde
  guiando el DSL sin romper.
- `SYSTEM_PROMPT` documenta la gramática en pocas líneas para no gastar tokens.

**Archivos**

- Modifica: `python/modules/ai_document_editor.py` (lista de acciones + aplicación +
  prompt).
- Reusa: `python/diagrams/`, `python/generation/image_handler.py`,
  `python/modules/captions.py`.

**Tests**

- `python/tests/test_ai_document_editor_diagram.py`: la acción `add_diagram` crea un
  `ImageModel` con `figure_number` continuo y no toca la portada; el fallback no lanza.

## 8. Review Focus

Casos que el spec implica y cuyo test no es obvio:

1. **Diagrama sin caption** — sale `Figura N` sin texto; no rompe la numeración. (WS2/WS7)
2. **kind desconocido** — warning + bloque omitido; el resto del documento se emite. (WS1/WS4)
3. **Serie preexistente** — payload con una tabla y una figura: numeración comienza donde
   `scan_existing` diga, no en 1 ciego. (WS1)
4. **Sin Word** — `/api/content/build` responde 200 con `.docx` puro; nunca 503. (WS3/WS4)
5. **Nodo con caracteres especiales** (paréntesis, tildes, `<`) — el SVG los escapa; no
   rompe el XML ni el layout. (WS2)
6. **`style` no-APA en diagrama** — igual se permite: es una figura, y los 6 estilos son
   figuras. No confundir con presets de tabla no-APA. (WS1)
7. **payload enorme** — el límite de bloques/artefactos y el timeout de emisión se
   declaran (ver Riesgos).

## 9. Fuera de alcance

- Secuencia/timeline, gráficas (barras/pastel/cuadrante) y adaptador subset-Mermaid
  (F2–F4, ver §10).
- Reescritura de `/api/generate`, del editor in-place o del post-proceso COM.
- PDF del endpoint de contenido (solo `.docx` en F1).
- Sincronizar la copia espejo `deploy/oracle/space/python/` (ver Riesgos).
- Editor UI del DSL en la App (la API es para IA; la App no gana una pantalla nueva en F1).

## 10. Fases

- **F1 (MVP): §1–§7** con `flow` + `tree` + `net`, REST + CLI + MCP mínimo, pytest.
- **F2:** `sequence` + `timeline`.
- **F3:** gráficas (`bars`, `pie`, `quadrant`).
- **F4:** adaptador que acepta un subconjunto de Mermaid y lo traduce al DSL propio.

## 11. Riesgos

- **Dependencias en la App empaquetada.** `networkx`/`Pillow`/`PyMuPDF` están en
  `requirements.txt` raíz, pero el instalador Electron puede tener su propio set.
  Mitigación: el plan verifica el set de dependencias del build antes de dar F1 por
  cerrada; si falta alguna, se declara explícitamente.
- **Copia espejo de despliegue.** `deploy/oracle/space/python/generation/generator.py`
  y `models.py` son copias. Mitigación: declarar fuera de alcance en F1 y anotar el
  riesgo de divergencia; no dejar dos verdades en silencio.
- **`original.docx` ausente.** `generate_apa7_docx` cae a `docx.Document()` sintético
  (`generator.py:874-876`). Hay que confirmar en tests que la rama sintética emite
  todos los tipos de bloque del payload sin depender de un original. (WS1/WS3)
- **Fuente del diagrama.** El tema usa Times New Roman; si la máquina no la tiene,
  PyMuPDF sustituye. Mitigación: test de `render_png` que falle solo por contenido
  (dimensiones/hash), no por glifo; documentar la sustitución.
- **Determinismo con force-directed.** `networkx` spring_layout admite `seed`; usar
  semilla fija o el snapshot de render no es estable. (D-4)
- **Payload no acotado.** Un payload gigante puede agotar tiempo/memoria. Mitigación:
  límite declarado de bloques y de diagramas, y timeout de emisión; error 413/422
  claro.
- **Bloat de `main.py`.** Añadir rutas a `main.py` (ya 3281 líneas) empeora el archivo.
  Mitigación: router propio `python/routers/content.py`; en `main.py` solo el registro.
