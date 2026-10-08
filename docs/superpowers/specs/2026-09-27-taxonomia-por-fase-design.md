# Taxonomía por fase: los H1 abren ámbitos con criterios

> **Estado: aprobado por el usuario. Listo para plan.**
> Creado durante la ejecución de `2026-09-25-redesign-shell-ia-workbench.md`.

## El defecto que lo motiva

`python/modules/proactive_auditor.py:478-479` decide si un elemento pertenece al ámbito "objetivos"
con una búsqueda de subcadena sobre el texto de **cualquier** elemento:

```python
low_t = text.lower()
if any(kw in low_t for kw in ("objetivo", "propósito", "finalidad", "meta")):
```

Dos consecuencias, ambas confirmadas leyendo el código:

1. Cualquier párrafo que mencione "objetivo" dispara la regla de verbos imprecisos de Bloom, aunque no
   sea un título ni viva en la sección de objetivos.
2. **`"meta"` está dentro de "me·ta·dología".** Cualquier párrafo que hable de metodología dispara la
   regla de objetivos. También "metáfora" y "meta-análisis".

## La regla que el usuario quiere

Los **títulos de nivel 1 son las fases del documento**. Cada fase tiene sus propios criterios. Los
objetivos tienen reglas; las conclusiones tienen reglas; el resto de fases tienen las suyas. La
taxonomía **solo aplica dentro de títulos 1**, no sobre todo el documento, para que el motor no malinterprete
palabras que casualmente coincidan.

## El modelo: dos capas de reglas

**Capa 1 — Reglas generales.** Aplican a **todo** el documento, sin importar dónde esté el elemento. El
detector de IA es el ejemplo canónico: un párrafo con 6 marcas de IA es un problema en cualquier fase. Hoy
estas reglas ya funcionan así; el cambio no las reescribe, las **declara** como generales para que dejen
de inferir su ámbito del texto.

**Capa 2 — Reglas de fase (H1).** Aplican **solo dentro** del ámbito que abre su H1. Tamaño de párrafo,
tipo de redacción, taxonomía de Bloom, estructura de la fase. Son las que hoy se disparan por palabra
suelta y hay que acotar.

Una regla pasa a tener un ámbito explícito, y esa declaración es **verificable por test**: el auditor
mantiene un registro `RULE_SCOPES` que mapea cada `kind` que emite a su ámbito, y un test falla si
aparece un `kind` nuevo sin declarar. Así nadie reintroduce un ámbito inferido del texto por descuido.

## D1 — El H1 abre un ámbito; los criterios se enganchan a la fase, no al texto

Un objetivo en APA casi nunca es un título — suele ser un ítem de lista o un párrafo. Cortar el motor a
"solo H1 y nada más" mataría una regla que hoy acierta. La resolución es que el H1 funcione como
**delimitador de sección**: un H1 titulado "Objetivos" hace que sus párrafos e ítems hereden los criterios
de esa fase, y un H1 titulado "Metodología" no activa nada porque esa fase no tiene criterios de
objetivos. "Metodología" deja de ser un disparador por palabra suelta y pasa a ser un nombre de fase.

Consecuencia directa sobre el defecto: el patrón `any(kw in low_t ...)` desaparece de las reglas de
taxonomía. Un elemento es miembro de un ámbito porque **está dentro** de un H1 que declara ese ámbito,
nunca porque su texto contenga una palabra.

**La coincidencia solo puede ocurrir sobre el título del H1, nunca sobre el cuerpo.** Eso elimina el
riesgo de raíz en vez de mitigarlo, y permite ser generoso al comparar títulos sin Fear.

## D2 — La revisión se organiza por fase además de por motor

El objetivo declarado del usuario es "ver los fallos de una forma más amigable, ya sea en objetivos o en
cada fase". Hoy la pantalla agrupa por motor y luego por subtipo. Falta la tercera agrupación: la fase
del documento a la que pertenece el hallazgo, que es la unidad en la que el usuario piensa.

Sin volver a una tabla de hallazgos: `AGENTS.md` §1 prohíbe las tres columnas y la revisión sigue siendo
un párrafo a la vez.

## D3 — Los H2 no abren ámbito propio

Un H2 sería irse más específico sin ganar nada. El H2 **hereda**: su contenido sigue sometido a las
reglas generales y a las reglas de la fase que abrió su H1 ancestro. No crea un ámbito hijo, no
endurece criterios, y no puede contradecir a su H1.

Consecuencia de implementación: el mapa de ámbitos se construye **solo con H1**, así que no hay
ambigüedad de anidamiento posible.

## D4 — La fase se nombra arriba y se puede filtrar por chip

Dos cosas, no una: la fase se escribe como línea de contexto sobre el párrafo que se está leyendo, y se
agregan chips de fase a la tira de filtros que ya existe. El texto da el contexto; el chip da el
atajo. La revisión sigue siendo un párrafo a la vez — el chip filtra, no navega.

Las reglas generales aparecen en su propia sección de la tira, porque no pertenecen a ninguna fase.

## D5 — Vocabulario de fases

Lista cerrada y configurable, reconocida sobre el **título del H1**. Un H1 que no está en la lista es una
sección cualquiera: lleva reglas generales y nada más. Ese es el límite que impide el malinterprete.

| H1 | Criterios de fase | Nota |
|---|---|---|
| Resumen | un solo párrafo de 150–250 palabras, sin citas, verbo en pasado, sin "este trabajo va a" | Es un standalone, no un tramo de tesis |
| **Título** | **solo lectura** | Ver D6 |
| Objetivos / Propósito | verbo Bloom medible, jerarquía general↔específicos, vaguedad | Es el que dispara el bug actual |
| Introducción | tamaño de párrafo, primera persona, formuleos vagos | |
| Marco teórico | paráfrasis vs. cita, tamaño de párrafo | |
| Método | reproducibilidad, verbo medible, tamaño de párrafo | |
| Resultados | verbo en pasado, sin interpretación | |
| Discusión | conecta con resultados, no repite | |
| Conclusiones | responde a los objetivos, no introduce nada nuevo | |
| Referencias | cita presente, año parseable | Ya tiene motor propio: citas fantasma y huérfanas |
| Anexos | presencia de título, fuente citada, nomenclatura interna | Sensibilidad material: no es prosa argumental |

**Comparación de títulos, no de subcadenas.** Se normaliza el título (minúsculas, sin acentos, sin
numeración inicial tipo "3." o "IV.", sin dos puntos final) y se compara contra el vocabulario. Se acepta
el título exacto o su cabeza cuando el resto es un calificador: "Resultados de la encuesta" es la fase
Resultados; "Metodología" dentro de un párrafo no es nada.

## D6 — La Portada se mide, pero no se escribe

Corrección importante sobre lo que se aveva dicho. La Portada no es "cero criterios": **sí se mide, con
criterios de solo lectura**. "Protegida" significa que ninguna regla puede *escribir* en ella, no que
nadie la mire.

El H1 de Portada —y todo elemento con `is_cover_section`— abre el ámbito `portada`. Los criterios son de
solo lectura: si el título está vacío, si termina en punto, si excede 20 palabras, si el subtítulo trae
marcas de frase de IA. Cada incumplimiento **aparece en Revisión**, con el hallazgo marcado
`read_only`, y la interfaz **no ofrece botón "Aceptar"** porque no hay nada que aceptar: hay algo que
corregir a mano.

Por qué la separación es obligatoria, y por qué son dos invariantes distintas de `AGENTS.md` §1:

1. **`use_original_cover` no puede mutar la portada original.** Un criterio con `suggestion` que ofrezca
   reescribir el título es exactamente el fallo que la regla existe para impedir. Por eso los criterios
   de portada se construyen **sin `suggestion`**, y un test lo verifica.
2. **La portada es indivisible en `computePages`.** Todo elemento con `is_cover_section` o
   `portada_block` va a la página 1 como bloque y nunca se parte. Un ámbito que re-dimensionara
   elementos rompería esa invariante.

## D7 — El modelo de datos se modifica; es necesario

Autorizado explícitamente por el usuario. No es opcional: sin esto no hay forma de distinguir "un H1
llamado Metodología" de "un párrafo que dice metodología".

Hoy `ElementModel` (models.py:381) ya trae `heading_level: Optional[int] = 1` y `is_cover_section: bool`.
Eso alcanza para construir el mapa de ámbitos **sin romper el schema**: el nivel ya está en el elemento.
El modelo nuevo que hace falta es otro — un `PhaseConfig` por fase y un registro de ámbitos por fase en
`phase_scope.py`, no un campo nuevo en `ElementModel`.

El `heading_levels: dict[int, HeadingLevelConfig]` de `FormattingConfig` (models.py:119) es formato, no
semántica: no se toca. `AGENTS.md` §1 obliga a que `computePages` respete la configuración de formato del
documento original, y este trabajo no debe rozar eso.

## D8 — El arreglo del patrón de subcadena cubre los dos sitios, con bugs distintos

El mismo mecanismo aparece en dos módulos, pero **el segundo no es el mismo bug**:

- `proactive_auditor.py:479` — substring sobre el cuerpo de cualquier párrafo. Falso positivo puro.
- `ai_document_editor.py:272` — substring sobre el título de un HEADING, para promoverlo a Nivel 1. Acá el
  daño es otro: "Resultados de la encuesta" que el usuario anidó **deliberadamente** como H2 bajo Método
  es promovido a H1, y la jerarquía que el autor construyó queda aplanada.

Arreglar solo el primero deja la misma clase de error en el segundo. Los dos se arreglan, y los dos
consumen el **mismo vocabulario** de `phase_scope`, con la regla adicional de no promover si ya existe un
H1 de esa fase en el documento.

## Restricciones que sigue mandando

- `AGENTS.md` §1: la revisión es un párrafo a la vez; nunca reintroducir las tres columnas.
- `AGENTS.md` §1: el detector de IA es probabilístico y solo ofrece "Marcar para revisar".
- `AGENTS.md` §1: la portada no se muta y es indivisible en `computePages` (ver D6).
- `AGENTS.md` §1: el conteo de pendientes se deriva UNA sola vez desde `lib/railPending.ts`. Los criterios
  de fase entran por `auditItems.ts` y no crean una segunda fuente de conteo.
- `AGENTS.md` §2: un hallazgo aparece en dos canales a la vez y ambos dicen lo mismo. La fase se propaga a
  los dos canales, porque `buildCommentContext` es el que la lee.
- Sin emojis. Solo variables CSS, sin hex. `strokeWidth` = `--icon-stroke`.
- Este trabajo **no** arregla la calibración de páginas (Task 10b del plan de rediseño), que sigue
  abierta y es independiente.
