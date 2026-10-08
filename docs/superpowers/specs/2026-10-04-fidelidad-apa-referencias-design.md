# Especificación de Diseño: Fidelidad APA 7 en la Lista de Referencias (Tipos, Cursiva y Limpieza)

**Fecha:** 2026-10-04
**Estado:** Aprobado para Planificación
**Ruta:** `docs/superpowers/specs/2026-10-04-fidelidad-apa-referencias-design.md`
**Origen:** Auditoría externa sobre la previsualización de referencias + decisión del autor de llevar el formateo a fidelidad APA 7 completa.

---

## 1. Visión y Propósito

Hoy la línea de cada referencia se arma con **múltiples formateadores independientes** que producen `formatted_apa` como texto plano: sin tipo de fuente, sin cursiva, sin limpiar artefactos de exportación automática (`Available from:`, `[accessed …]`) y con autores corporativos que arrastran `[SIGLAS]`. El resultado no es APA 7 fiel y difiere entre la vista previa del Estudio, el canvas, el PDF y el documento de Word.

Objetivo: una **sola fuente de verdad** que construya la línea APA 7 como **segmentos tipográficos** (con cursiva exacta), sepa distinguir **libro / artículo / capítulo / tesis / web / informe**, corrija los defectos detectados por la auditoría, garantice **sangría francesa + interlineado doble** en todas las superficies, y **nunca invente un enlace** en un libro sin DOI/URL.

### Defectos de la auditoría que esta spec resuelve

1. Sangría francesa inconsistente entre superficies (algunas centradas o con sangría completa irregular).
2. Interlineado doble (`2.0`) no garantizado en todos los renders.
3. Referencias importadas con formato Vancouver/IEEE intacto (`Available from:`, `[accessed 26 Jun 2025]`).
4. Autor corporativo con siglas entre corchetes en la lista (`Organización Internacional del Trabajo [OIT]`).
5. Tesis sin el `[Tesis de …, Institución]` ni cursiva en el título; institución reducida a un dominio (`Upc.edu.`).
6. URLs `http://` que debían subirse a `https://`.
7. **Libros**: se debe citar sin enlace (título en cursiva + editorial), caso explícitamente señalado por el autor.

---

## 2. Criterios Estrictos

- **Cero emojis** en UI, strings y documentos. Solo iconos `lucide-react` vectoriales.
- **Solo tokens de color** (`var(--…)`). Prohibido hex/rgba hardcodeado (lo vigila `noHardcodedColors.test.ts`).
- Papel APA: tinta `--paper-ink`, hoja `--paper-white`; fuera, `--canvas-bg`.
- **Una sola verdad tipográfica**: React no recompone APA; el backend es el único autor de la línea. React solo dibuja los segmentos.
- Compatibilidad hacia atrás: un dato viejo sin `apa_segments` cae a `formatted_apa`/`raw_text` sin cursiva, sin romper el render.

---

## 3. Modelo (contrato compartido)

### 3.1 Backend — `python/models.py`

Nuevo modelo de segmento:

```python
class ApaSegment(BaseModel):
    text: str
    italic: bool = False
```

`ReferenciaModel` gana dos campos (no se elimina nada):

```python
tipo: str = "otro"          # "articulo" | "libro" | "capitulo" | "tesis" | "web" | "informe" | "otro"
apa_segments: list[ApaSegment] = Field(default_factory=list)
```

- `formatted_apa` **se conserva** y sigue siendo `"".join(s.text for s in apa_segments)` cuando hay segmentos. Consumidores de texto plano (copiar, LaTeX, panel del add-in) no cambian.
- `to_csl_json()` (`models.py:774-805`) deja de hardcodear `"type": "article-journal"` y mapea `tipo → CSL`:
  `articulo→article-journal`, `libro→book`, `capitulo→chapter`, `tesis→thesis`, `web→webpage`, `informe→report`, `otro→article-journal` (compatibilidad con lo actual).

### 3.2 Frontend — `src/types/index.ts` y `src/types/api-generated.d.ts`

Espejo exacto:

```ts
tipo?: 'articulo' | 'libro' | 'capitulo' | 'tesis' | 'web' | 'informe' | 'otro';
apa_segments?: { text: string; italic: boolean }[];
```

### 3.3 Migración (automática y central)

Validador `mode="after"` en `ReferenciaModel`: si `apa_segments` está vacío, se infiere `tipo` (si es `"otro"`) y se construyen los segmentos; si `formatted_apa` está vacío, se deriva de los segmentos. **Nunca** sobrescribe un `apa_segments` ya presente ni un `formatted_apa` ya presente (evita alterar salidas existentes y romper tests). El import del formateador va **dentro** del validador para evitar import pesado en el arranque de Pydantic.

---

## 4. Formateador canónico — `python/modules/apa_format.py` (nuevo)

Único autor de la línea APA. API pública:

```python
def build_apa_segments(ref: dict | ReferenciaModel) -> list[ApaSegment]
def format_apa_plain(ref) -> str                 # "".join(seg.text ...)
def inferir_tipo(ref) -> str
def normalizar_referencia(ref) -> None           # infiere tipo + llena apa_segments/formatted_apa
def limpiar_artefactos(texto: str) -> str
def url_segura(doi_o_url: str | None, tipo: str) -> str
def formatear_autores(authors: list[str]) -> str
```

Se **centraliza** aquí lo que hoy está duplicado o disperso:

- `formatear_autores`: mueve `_format_authors_apa` desde `addin_references_store.py:257-286` y le agrega el **recorte de corchetes corporativos** `^Nombre [SIGLAS]` (hoy vive solo en `referencias_module.py:656-658`). `APA_ELLIPSIS` se mueve aquí y se re-exporta desde el store para no romper tests.
- `addin_references_store._format_apa_reference` (`:289-327`) queda como **wrapper** que devuelve `format_apa_plain`.
- Los `fetch_*` de `referencias_module.py` (`fetch_crossref_metadata`, `fetch_openalex_metadata`, `fetch_semantic_scholar_metadata`, `search_crossref_by_author_year`, `fetch_openlibrary_metadata`), `core_server.py:195`, `bibtex_ris_parser.py` y `spec_dsl.py` pasan a construir vía `build_apa_segments` en vez de sus plantillas propias.
- La **composición client-side** de APA (`Step5ReferencesWizard.tsx:252,284`; `ReferenceForm.tsx:41`) se reemplaza por una llamada al endpoint `POST /references/format` (§6). React deja de inventar formato.

### 4.1 Reglas por tipo

Prefijo común: `"{autores} ({anio}). "` (o `"({anio}). "` sin autores). `anio` = `year` o `"s.f."`.
`limpiar_artefactos` se aplica a `title` y `source`. `url_segura` normaliza el cierre.

| tipo | Salida APA 7 (segmentos) | Cursiva |
|---|---|---|
| `libro` | `Autor (Año). ` + **Título** + ` (N.ª ed.). ` + `Editorial.` + ` URL` | título |
| `articulo` | `Autor (Año). Título. ` + **Revista** + `, 45(2), 123-145.` + ` URL/DOI` | revista (parte antes de la 1.ª coma del `source`) |
| `capitulo` | `Autor (Año). Título del capítulo. In ` + **Libro** + ` (pp. x–y). Editorial.` + ` URL` | libro contenedor |
| `tesis` | `Autor (Año). ` + **Título** + ` [Tesis de …, Institución]. ` + `Repositorio/URL` | título |
| `web` | `Autor (Año). ` + **Título de la página** + `. Sitio. ` + `URL` | título |
| `informe` | `Autor (Año). ` + **Título** + `. Editor. ` + `URL` | título |
| `otro` | `Autor (Año). Título. Source. URL` (sin cursiva; replica la salida actual) | — |

Reglas transversales:

- **Libro sin enlace**: si no hay `doi_or_url`, la línea termina en `.` tras la editorial. Nunca se inventa URL ni se escribe "Disponible en".
- `tesis`: la institución sale de `source` si existe; si no, del dominio de la URL. La descripción entre corchetes se infiere de palabras clave (`maestría`→"Tesis de maestría", `grado`→"Tesis de grado", si no→"Tesis").
- `articulo` sin `source`: se omite la parte de revista y queda `Título. URL/DOI`.
- `capitulo` sin datos de editor/páginas: se degrada a `Título. In ` + **Libro** + `.` (aproximación declarada).

### 4.2 Limpieza de artefactos (`limpiar_artefactos`)

Elimina, en cualquier posición, no solo al final:

- `Available from:` / `Available at:` / `Available:` (y la URL que le sigue si queda huérfana se re-captura como enlace).
- `[accessed 26 Jun 2025]`, `[Consultado …]`, `(accessed …)`.
- `Recuperado el <fecha>, de`, `Retrieved <fecha>, from`, `Disponible en`, `Obtenido de`.
- Prefijos de exportación Vancouver/IEEE sueltos cuando acompañan a un texto ya estructurado.

Se extiende el `_RETRIEVAL_PREFIX` existente (`references_extractor.py:68-71`), que hoy solo limpia al final del campo.

### 4.3 URLs (`url_segura`)

- `http://…` → `https://…`.
- `www.…` → `https://www.…`.
- `doi:10.x/…` y `10.x/…` → `https://doi.org/10.x/…`.
- `https://…` se conserva.
- **Libro impreso sin enlace**: cadena vacía.

### 4.4 Inferencia de tipo (`inferir_tipo`), en orden

1. `title`+`source`+`raw_text` matchean `tesis|tesina|trabajo (de|fin)|maestría|doctorado|grado` → `tesis`.
2. `source` con patrón `,\s*\d+\s*\(\d+\)` (volumen(número)) → `articulo` (señal más fuerte de artículo).
3. Marca de edición `\((?:\d+\.ª?|\d+(?:th|nd|rd|st)|[a-z]+)\s+ed\.\)` (p. ej. `(12th ed.)`, `(7.ª ed.)`) → `libro`.
4. DOI (10.x o doi.org) → `articulo`.
5. Sin URL y `source` presente → `libro`.
6. Con URL y sin patrón de volumen → `web`.
7. Resto → `otro`.

> Nota: un **libro con DOI** normalmente no trae `vol(número)` pero sí marca de edición; por eso la regla 3 va antes que la 4. Un libro electrónico con DOI y sin marca de edición igual puede caer en `articulo`; es el caso borde que el modal permite corregir a mano.

Editable a mano desde el modal (§6), que persiste `tipo`.

---

## 5. Renders — una sola verdad visual

### 5.1 Layout compartido — `src/lib/apaLayout.ts` (nuevo)

Mover `APA_LISTA` y `APA_ENTRADA` desde `Step5ReferencesWizard.tsx:1028-1041` a un módulo único:

```ts
export const APA_LISTA: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '12pt', lineHeight: 2, textAlign: 'left',
  wordBreak: 'break-word', whiteSpace: 'normal',
};
export const APA_ENTRADA: React.CSSProperties = {
  margin: 0, paddingLeft: '0.5in', textIndent: '-0.5in',
};
```

Regla dura: una entrada de referencia **nunca** se centra ni se justifica; recibe siempre `APA_ENTRADA` (sangría francesa 1.27 cm) dentro del bloque `APA_LISTA` (doble espacio).

### 5.2 Componente compartido — `src/components/referencias/ReferenciaLinea.tsx` (nuevo)

```tsx
export const ReferenciaLinea: React.FC<{ ref: ReferenciaModel; as?: 'p' | 'div' }>
```

- Si `ref.apa_segments?.length`: mapea a `<span style={s.italic ? { fontStyle: 'italic' } : undefined}>{s.text}</span>`.
- Si no: un único span con `formatted_apa || raw_text` (compatibilidad).
- Envuelve en `APA_ENTRADA`; el contenedor padre aplica `APA_LISTA`.
- Sin emojis, sin colores hardcodeados.

### 5.3 Consumidores

| Superficie | Cambio |
|---|---|
| `Step5ReferencesWizard.tsx` — vista previa (`:796-816`) y bibliografía completa (`:701-723`) | Sustituir `textoDeLaReferencia` por `<ReferenciaLinea>`; importar layout de `apaLayout.ts`. |
| `PaperCanvas.tsx:2030-2046` | Sustituir el `<p>` con composición en render por `<ReferenciaLinea>`; eliminar la composición APA de respaldo (ahora la garantiza el backend). Sangría e interlineado quedan por `APA_LISTA`/`APA_ENTRADA`. |
| `ReactPDFPreview.tsx:271-278` | Renderizar `apa_segments` con `fontStyle: 'italic'`; unificar la prioridad a `apa_segments → formatted_apa → raw_text` (hoy usa `text || raw_text || formatted_apa`). Mantener `referenceItem` (36pt ≈ 0.5in) e interlineado 2.0 del `page`. |
| `ExportView.tsx:1695-1744` | **Sin cambio estructural**: opera sobre elementos de cuerpo `type:'reference'`, que no llevan segmentos; ya aplica `paddingLeft 1.27cm` + `textIndent -1.27cm`. Verificar en test que la sangría francesa sigue. |
| Panel del add-in `word-addin/…/ReferencesPanel.tsx:404` | Sigue usando `formatted_apa` plano (inserta texto en Word; cursiva en el add-in fuera de alcance de esta pasada). |

### 5.4 Escritor DOCX — `python/modules/referencias_module.py:566-663`

- `format_apa_referencias_section`: por cada `ref`, si hay `apa_segments`, agregar **un run por segmento** con `run.italic = seg.italic`; si no, la ruta actual de un solo run. Se mantiene `_strip_ref_prefix`.
- Se **retira** el hack de recorte de siglas (`:656-658`): ya vive en `formatear_autores`.
- `_armar_apa_desde_campos` (`:539-563`): construir segmentos con `build_apa_segments` y devolver el plano.
- La selección de texto pasa a `ref.apa_segments` (fallback `formatted_apa` → `raw_text` → `_armar_apa_desde_campos`).

---

## 6. Endpoint de reformateo — `python/routers/references.py`

`POST /references/format` (sin prefijo `/api`, igual que `/resolve-doi`):

```json
// request
{ "authors": ["…"], "year": "2009", "title": "…", "source": "…",
  "doi_or_url": "…", "tipo": "libro" }
// response
{ "formatted_apa": "…", "apa_segments": [{"text":"…","italic":false}], "tipo": "libro" }
```

- Si `tipo` viene vacío/`"otro"`, se infiere.
- Lo consumen: `ReferenceEditModal` (al guardar el selector de tipo o editar campos), `ReferenceForm` y `handleAddManual`/`handleSaveSelected` de `Step5ReferencesWizard` (estos dos dejan de armar APA en TS).

### UI de tipo — `ReferenceEditModal.tsx`

Selector de tipo (libro/artículo/capítulo/tesis/web/informe) con etiquetas en español. Al guardar: `POST /references/format` → persistir `tipo`, `formatted_apa`, `apa_segments` vía `useDocStore`.

---

## 7. Tests

### 7.1 Backend — `python/tests/test_apa_format.py` (nuevo)

- **Libro sin URL**: título en segmento cursivo, editorial en plano, sin `http`, termina en `.`.
- **Tesis**: título cursivo + `[Tesis de maestría, <Institución>]` + URL `https://`.
- **Autor corporativo**: `["Organización Internacional del Trabajo [OIT]"]` → `Organización Internacional del Trabajo. (2007). …` sin `[OIT]`.
- **Artículo**: revista (antes de la 1.ª coma) en segmento cursivo.
- **Web**: título cursivo + sitio + `https://`.
- **Limpieza**: entrada con `Available from:` + `[accessed 26 Jun 2025]` → sin esas cadenas.
- **`http://` → `https://`**.
- **Invariante**: `format_apa_plain(ref) == "".join(s.text)`.
- **`inferir_tipo`**: casos libro/artículo/tesis/web.

### 7.2 Backend — existentes

- `test_web_references_parsing.py`: sigue verificando el `formatted_apa` plano (el wrapper lo preserva). Ajustar solo si la limpieza cambia un esperado.
- `test_doi_resolver.py`, `test_referencias_section_collision.py`, `test_audit_fixes_f01_f10.py` (F-06 siglas), `test_csl_json.py`: deben seguir en verde; se agrega un caso de `tipo → CSL type`.

### 7.3 Frontend

- `src/components/referencias/__tests__/ReferenciaLinea.test.tsx` (nuevo): emite `<em>`/`font-style: italic` para segmentos cursivos; cae a `formatted_apa` sin segmentos; sin emojis.
- `referenciasPaso4.test.tsx`: la vista previa sigue mostrando `formatted_apa` (sin recomposición en render).
- `PaperCanvas` / `ReactPDFPreview`: la entrada de referencia aplica sangría francesa e interlineado 2.0.
- **`referenciasEstaMontada.test.tsx:54-71`** afirma "exactamente 6 componentes" en `components/referencias/`; al agregar `ReferenciaLinea.tsx` pasa a 7 → **actualizar ese test** (autorizado).

---

## 8. Aproximaciones Declaradas

- **Artículo**: se curva el nombre de revista (texto antes de la 1.ª coma del `source`), **no** el volumen por separado (el dato viene como blob en `source`). Mejora futura: campos estructurados `volume/issue/pages`.
- **Capítulo**: si faltan editor/páginas, se degrada a `Título. In Libro.`.
- **Tipo**: inferido por heurística; el autor puede corregirlo en el modal.
- Cursiva en el **panel del add-in** no se implementa en esta pasada (inserta texto plano).

## 9. Fuera de Alcance

- Formato de citas en el texto (parentética/narrativa).
- Cursiva dentro del panel del add-in de Word.
- Reordenamiento, deduplicación o verificación de referencias (existen y no cambian).
- Parsing estructurado de `volume/issue/pages` para artículos.

## 10. Riesgos

- **Contrato compartido**: agregar campos a `ReferenciaModel` toca backend, tipos TS y tipos generados; hay que regenerar `api-generated.d.ts` o editarlo en sincronía.
- **Tests de conteo de componentes** y de strings exactos pueden requerir ajuste; se listan arriba.
- **Import circular** Pydantic (`models.py` ↔ `apa_format.py`): resolver con import dentro del validador/funciones.
