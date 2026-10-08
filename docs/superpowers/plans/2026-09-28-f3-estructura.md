# F3 — Estructura: el escritorio de redacción: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla de Estructura deje de mostrar el documento vomitado y pase a
mostrar si el armazón del documento aguanta: qué hay, cuánto mide, qué le falta y qué se
puede corregir ahí.

**Architecture:** Tres piezas. (a) El índice jerárquico con **diagnóstico por nodo**, que
no es navegación: cada rama trae palabras, balance contra sus hermanas, figuras, citas y
un estado de salud derivado de reglas que el backend ya calcula y hoy se tiran.
(b) El **pulso del documento**: cinco números arriba. (c) Un **inspector de rama** con
acciones cuyo alcance se dice. Y el arreglo del `AiMosaic`, que es un `viewMode` aparte de
la Revisión y hoy es ilegible por un bug de coincidencia exacta.

**Tech Stack:** React 18, TypeScript, Vitest, Python (`phase_scope.py`), SVG a mano, tokens.

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §7.

## Global Constraints

- **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales.** R3 corre sobre doce directorios y **no tiene deuda**: si
  metés un literal, el build falla. `DEUDA_MEDIDA` ya no existe y su guarda exige que no
  vuelva.
- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, OBLIGATORIO.
- **Leer un fuente en un test: `?raw` para `.ts`/`.tsx`; para `.css` NO sirve** (el runner
  tiene `css: false` y devuelve cadena vacía, o sea una guarda verde y muda). Para una
  hoja: el rodeo del **specifier en variable** que ya usan `designTokens.test.ts` y
  `noHardcodedColors.test.ts`. **La regla estaba escrita al revés** y una regla a medias
  es peor que ninguna, porque hace repetir un rodeo que sí funciona.
- **NO crees `vitest.config.ts`.**
- PowerShell no sirve para cirugía por índice de array en archivos largos. **`Set-Content`
  de PowerShell DESTRUYE el archivo**: ya loFormatting un `.py` con el docstring pegado a
  los imports. Usá la herramienta de edición, y `git checkout` para recuperar. **NO uses
  `git worktree` para verificar nada.**
- `git add` explícito archivo por archivo. **NUNCA `git add -A`.**
- Después de cada escritura:
  `Select-String -Path <archivos> -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`.
  Comentarios y commits **en español, sin CJK**.

**Baseline** (no puede bajar): `npx vitest run` → **1143 passed, 0 failed** (104
archivos). `npx tsc --noEmit` → limpio. `pytest python/tests/ -q` → **800 passed, 14
skipped**. `npm run build` → sin error.

## Review Focus

1. **Un H1 numerado.** `"1. Introducción"` y `"CAPÍTULO 2: MARCO TEÓRICO"` caen hoy en
   `sin_fase` porque el match de `aiMosaic.ts:379-381` es **exacto** contra diez valores
   literales. Un redactor con el capítulo numerado —el caso normal en una tesis— ve
   "Secion sin nombre". Es el Review Focus del usuario, literal. → Task 1
2. **Un H2 que dice "Resultados" a secas y uno que dice "Resultados de la encuesta".** El
   primero es una fase mal nivelada y hay que promoverla. El segundo lleva un calificador
   que avisa de que el autor quiso decir algo concreto, y hay que **dejarlo quieto**. Un
   motor que promueve los dos está peor que uno que no promueve ninguno. → Task 3
3. **Dos capítulos hermanos, uno de 12.000 palabras y otro de 80.** El índice tiene que
   hacerlo visible con un número, no con una intuición. Y un documento con **un solo
   capítulo** no puede tener "balance": una rampa comparativa sin hermanas no significa
   nada y hay que decirlo o esconderla. → Task 2
4. **Acción con alcance de rama.** "Reordenar" en un índice jerárquico sin decir a qué
   aplica es una amenaza. Cada acción tiene que decir "esta rama" o "todo el documento",
   y **el alcance se aplica de verdad**, no solo se muestra. → Task 4
5. **El nodo sin nombre en pantalla.** El `AiMosaic` hoy pone el nombre de la fase
   **solo en el `title` de hover** (`:156-163`). Dentro del botón hay un porcentaje y nada
   más. Ningún nodo de este proyecto vuelve a tener su nombre fuera de pantalla. → Task 1

---

### Task 1: Que los H1 tengan nombre

**Files:**
- Modify: `src/lib/aiMosaic.ts:300-316` (`porFase`), `:334` (`phaseLabel`),
  `:366-368` (normalización), `:379-381` (`faseDeTitulo`)
- Create: `src/lib/jerarquia.ts` (la fuente de verdad del árbol de encabezados)
- Test: `src/__tests__/jerarquia.test.ts` (nuevo), `src/__tests__/aiMosaic.test.ts` (extender)

**Interfaces:**
- Produces:
  ```ts
  export type NodoJerarquia = {
    id: string; titulo: string; nivel: 1 | 2 | 3;
    elementoId: string | null; palabras: number;
    figuras: number; tablas: number; citas: number;
    hijos: NodoJerarquia[]; fase: string | null;
  };
  export function construirJerarquia(elementos: DocElemento[]): NodoJerarquia[];
  export function faseDeTitulo(titulo: string, estricto: boolean): string | null;
  ```
  `construirJerarquia` es lo que usan el índice, el pulso y el inspector.

> **Antes de escribir, leé `src/lib/auditItems.ts:59-112`**: `PHASE_ORDER`,
> `PHASE_LABELS` y `phaseLabel` ya existen y son la tabla de fases. **Reusalos, no los
> dupliques.** `auditItems.ts` ya importó `rotulos.ts` en la F0; `jerarquia.ts` debe
> importar de ahí y no al revés, para no abrir un ciclo.

- [ ] **Step 1: Escribí el test que falla**

`src/__tests__/jerarquia.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { construirJerarquia, faseDeTitulo } from '../lib/jerarquia';

describe('faseDeTitulo', () => {
  it('un H1 numerado abre su fase, no "Seccion sin nombre"', () => {
    // El defecto: el match era EXACTO contra diez valores literales, asi que
    // "1. Introduccion" caia en sin_fase. Y el filtro de fase usa la misma clave,
    // o sea que todos los capitulos numerados se fundian en un bloque.
    expect(faseDeTitulo('1. Introducción', false)).toBe('introduccion');
    expect(faseDeTitulo('CAPÍTULO 2: MARCO TEÓRICO', false)).toBe('marco_teorico');
  });

  it('un H1 con sufijo sigue abriendo su fase', () => {
    expect(faseDeTitulo('Metodología de la investigación', false)).toBe('metodo');
  });

  it('en modo estricto, un H2 mal nivelado se distingue de uno deliberado', () => {
    // El segundo caso tiene calificador: el autor quiso decir algo concreto.
    expect(faseDeTitulo('Resultados', true)).toBe('resultados');
    expect(faseDeTitulo('Resultados de la encuesta', true)).toBeNull();
  });

  it('un titulo que no abre ninguna fase devuelve null, no un nombre inventado', () => {
    expect(faseDeTitulo('Agradecimientos', false)).toBeNull();
  });
});

describe('construirJerarquia', () => {
  it('arma un arbol H1 > H2 > H3 y cuenta palabras por rama', () => {
    const arbol = construirJerarquia([
      h1('1. Introducción', 'Quince palabras aqui en el primer capitulo'),
      h2('1.1 Antecedentes', 'Otros quince palabras de antecedentes del trabajo'),
      h3('1.1.1 Uno', 'Detalle de la subseccion uno con sus palabras'),
      h1('2. Metodología', 'Quince palabras del capitulo de metodologia'),
    ]);
    const raices = arbol.filter((n) => n.nivel === 1);
    expect(raices).toHaveLength(2);
    expect(raices[0].palabras).toBeGreaterThan(0);
    expect(raices[0].hijos[0].hijos[0].titulo).toBe('1.1.1 Uno');
  });

  it('antes del primer H1 el nivel es 0, y NO es una raiz de nivel 1', () => {
    // El ambito antes del primer H1 es 'portada'. Si eso se cuela como raiz, el
    // indice muestra la portada como si fuera un capitulo.
    const arbol = construirJerarquia([parrafo('Texto suelto antes de cualquier encabezado')]);
    expect(arbol).toHaveLength(0);
  });

  it('una cita y una figura cuelgan del nodo correcto, no del primero', () => {
    const arbol = construirJerografia([
      h1('1. Introducción', 'palabras'),
      figura('Figura 1. Diagrama del proceso'),
      h1('2. Método', 'palabras'),
      cita('(García, 2019)'),
    ]);
    expect(arbol[0].figuras).toBe(1);
    expect(arbol[0].citas).toBe(0);
    expect(arbol[1].citas).toBe(1);
  });
});
```

Los helpers `h1`, `h2`, `h3`, `parrafo`, `figura`, `cita` los **escribís**, con el shape
real de elemento que usa el proyecto. **No dejes elipsis.** Y **corregí el typo
`construirJerografia` a `construirJerarquia`** antes de correr el test: si no, el test
pasa por un error de import que no es el que querés.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/jerarquia.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: El módulo**

`src/lib/jerarquia.ts`.

`faseDeTitulo(titulo, estricto)`:
- Normaliza como hoy (`NFD`, sin diacríticos, minúsculas, `trim`, `aiMosaic.ts:366-368`).
- **`estricto = false`**: primero intenta la coincidencia exacta, y si falla, quita un
  prefijo de numeración (`^\d+(\.\d+)*[\.\):]?\s*`, `^\s*cap[ií]tulo\s+\d+\s*:?\s*`) y
  **vuelve a intentar**. Después busca por **contención de palabra completa** sobre los
  valores de `PHASE_LABELS`, no por subcadena: `"introduccion"` no puede matchear
  `"introducciones"`.
- **`estricto = true`**: **solo** la coincidencia exacta, y devuelve el `kind` de
  promoción en vez de la fase, para que la UI pueda decir *por qué* promueve.

**El orden importa**: exacto primero, después la versión tolerante. Si tolerante
primero, `"Resultados de la encuesta"` matchearía `resultados` y el H2 deliberado se
promovería, que es el error del Review Focus #2.

`construirJerarquia(elementos)`:
- Recorre en orden. Un `heading` de nivel 1/2/3 abre nodo; **un nivel 2 hereda la fase
  de su H1 ancestro y no abre ninguna** (`AGENTS.md` §1).
- El conteo de palabras **se propaga hacia arriba**: un párrafo cuenta para su hoja y para
  todos sus ancestros. Un resumen de la rama tiene que incluir lo que tiene debajo.
- Las figuras y las citas cuelgan del nodo vigente.
- **Antes del primer H1 no hay raíz.** Devuelve `[]` para esos elementos y los deja
  documentados en un campo `preambulo`, porque existen pero no son un capítulo.

- [ ] **Step 4: `AiMosaic` deja de derivar la fase dos veces**

`aiMosaic.ts`: `construirMosaico` (`:302-316`) **deja de re-derivar la fase desde
`el.text`** y usa `AuditItem.phase` (o el `headingPhase` del elemento), que el backend ya
calculó. Eso **mata la quinta copia** del "qué título abre qué fase" que el propio
archivo dice evitar (`:351-362`).

Y `:302-316`: dos H1 que mapean a la misma fase **se fundían en silencio**. Con
`construirJerarquia` eso desaparece, porque el árbol tiene un nodo por encabezado y
`fase` es un **atributo**, no la clave de agrupación.

- [ ] **Step 5: El nombre, siempre en pantalla**

`AiMosaic.tsx:156-163`: hoy el nombre va al `title` y al `aria-label` y **dentro del
botón solo hay un porcentaje**. Pasa a imprimirse: el botón lleva `rotulo` y `porcentaje`,
con el rotulo arriba y el porcentaje abajo. Si no entra entero, se recorta con `ellipsis`
y el `title` conserva el entero — **pero el nombre tiene que estar visible sin hover.**

- [ ] **Step 6: La rampa que se leía como alarma**

`aiMosaic.ts:222` usa `var(--ia-nivel-1..4)`, y los cuatro están **rojos**
(`design-system.css:53-56`, `:219-222`). Cuatro tonos de la misma tinta leen como
intensidad; cuatro tonos de rojo leen como error. **Rediseñá la rampa** con el criterio
que ya usa el resto del proyecto: una tinta que va de tenue a marcada, **no rojo puro**.
Los cuatro en los dos themes. Y un test que la recorra y falle si **los cuatro tienen el
mismo tono**.

- [ ] **Step 7: Verificación y commit**

Run: `npx vitest run` && `npx tsc --noEmit` && `pytest python/tests/ -q`
Expected: frontend ≥1143, Python ≥800.

```bash
git add src/lib/jerarquia.ts src/lib/aiMosaic.ts src/components/review/AiMosaic.tsx src/styles/design-system.css src/__tests__/jerarquia.test.ts src/__tests__/aiMosaic.test.ts
git commit -m "estructura: los capitulos numerados tienen nombre, y el nombre se ve

El match de fase era EXACTO contra diez valores literales, asi que '1. Introduccion',
'CAPITULO 2: MARCO TEORICO' y 'Metodologia de la investigacion' caian los tres en
sin_fase. Y era peor que un nombre feo: el filtro de fase usa la misma clave, o sea que
todos los capitulos numerados de una tesis se fundian en un solo bloque. Para un
redactor, que es exactamente el caso normal, la pantalla no decia nada.

Ademas dos H1 que mapeaban a la misma fase se fundian en silencio. Con el arbol, fase
pasa a ser un atributo y no la clave de agrupacion, y cada encabezado es su nodo.

El nombre de la fase estaba solo en el title de hover: dentro del boton habia un
porcentaje y nada mas. Por eso no se entendia. Ahora el rotulo se imprime y el
porcentaje va debajo, y el nombre se ve sin hover.

La rampa de los cuatro niveles era monocroma roja, que se lee como error y no como
intensidad. Cuatro tonos de la misma tinta, mas un test que falla si los cuatro tienen
el mismo tono.

Y construirJerarquia deja de re-derivar la fase desde el texto del encabezado. El
backend ya la calcula y viaja en AuditItem.phase; aiMosaic la volvia a calcular, que era
la quinta copia de la misma regla que el propio archivo dice no repetir."
```

---

### Task 2: El índice con diagnóstico

**Files:**
- Create: `src/components/structure/IndiceEstructura.tsx`, `src/components/structure/NodoIndice.tsx`,
  `src/components/structure/BarraBalance.tsx`
- Test: `src/__tests__/indiceEstructura.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `construirJerarquia` de Task 1.
- Produce: `export type SaludNodo = 'completa' | 'en-duda' | 'desbalanceada' | 'sin-contenido'`.

- [ ] **Step 1: Escribí el test que falla**

```tsx
describe('IndiceEstructura', () => {
  it('cada nodo dice cuantas palabras tiene', () => { ... });
  it('el balance se mide contra las hermanas, no en absoluto', () => {
    // 12.000 palabras contra 80 tiene que ser visible con un numero.
    // Y con una sola hermana NO hay balance: la rampa no significa nada y hay
    // que decirlo, no mostrar un 100% que parece una nota.
  });
  it('un capitulo sin contenido se dice, no se muestra como vacio', () => {
    expect(captionDe(nodoSinPalabras)).toMatch(/sin contenido/i);
  });
  it('el documento entero no se renderiza por defecto', () => {
    // El defecto reportado: el centro era el documento vomitado. Eso es un
    // toggle, no el estado inicial.
    expect(porDefectoSeVeElDocumento()).toBe(false);
  });
});
```

Cada `...` es un test real con el shape del componente. **No los dejes.** Y el
segundo tiene **dos** casos: uno con imbalance real y otro con una sola hermana.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/indiceEstructura.test.tsx`
Expected: FAIL.

- [ ] **Step 3: El índice**

`IndiceEstructura.tsx`. Lista jerárquica, una fila por nodo, con:
- **nivel** (H1/H2/H3) como etiqueta, no como tamaño de fuente gigante
- **título**, con `ellipsis` y `title` con el entero
- **palabras** de la rama
- **BarraBalance**: una barra que pone a **todas las hermanas en la misma escala**. El
  máximo de la escala es la hermana más larga, y eso se dice en el `aria-label`:
  "620 palabras; la rama más larga tiene 12.400".
- **figuras y citas** colgando, como conteo
- **salud**: un estado con un **motivo en palabras**, no un punto de color. "Sin
  contenido", "En duda: el H2 dice 'Resultados' a secas y parece una fase mal nivelada",
  "Desbalanceada: 4 % de la rama hermana más corta".

**Con menos de dos hermanas, `BarraBalance` no se renderiza y la fila dice que no hay
con qué comparar.** Un 100 % solo es un bug esperando.

- [ ] **Step 4: `SaludNodo` sale de reglas, no de heurísticas**

`sin-contenido`: `palabras === 0`.
`en-duda`: hay un encabezado de nivel ≥ 2 cuyo título, en modo estricto, abre una fase
(Task 1, `estricto = true`). **El motivo se arma con el título real**, para que la persona
vea cuál.
`desbalanceada`: hay hermana y `palabras < 0.15 × hermanaMayor`.

**No uses heurísticas de texto** como "si termina en punto raro, está en duda". `AGENTS.md`
§1 lo prohíbe para el ámbito: el ámbito se decide **solo** sobre el título de un H1, por
`match_phase`. Esta es la misma regla.

- [ ] **Step 5: Verificación y commit**

```bash
git add src/components/structure/ src/__tests__/indiceEstructura.test.tsx
git commit -m "estructura: el indice es un documento de trabajo, no un arbol de navegacion

Cada nodo dice cuantas palabras tiene su rama, cuanto mide contra sus hermanas, y en
que estado de salud esta, con el motivo en palabras. Un balance de 12.000 contra 80 es
un problema que se ve en el indice y en ningun otro lado.

Con una sola hermana no hay balance y la barra no se renderiza: un 100 por ciento es un
bug esperando, no un resultado.

El estado de salud sale de reglas, no de heuristicas de texto. 'En duda' es un
encabezado que en modo estricto abre una fase, y el motivo dice el titulo real, para que
se vea cual. AGENTS.md prohibe decidir el ambito buscando palabras en el cuerpo, y
esto es el ambito.

Y el documento entero deja de ser el centro: pasa a un toggle. Era exactamente lo que
reporto, que el centro era el archivo vomitado."
```

---

### Task 3: Qué le falta a APA 7

**Files:**
- Create: `src/components/structure/FaltasApa7.tsx`
- Modify: `src/lib/jerarquia.ts` (expone los diagnósticos)
- Test: `src/__tests__/faltasApa7.test.tsx` (nuevo)

**Interfaces:**
- Consumes: Task 1.
- Produce: `export type FaltaApa7 = { clase: 'fase-requerida' | 'h2-mal-nivelado'; detalle: string; nodoId: string | null; accion: 'promover' | 'agregar' | null }`.

- [ ] **Step 1: Escribí el test que falla**

```tsx
describe('faltas de APA 7', () => {
  it('una tesis sin Metodologia la reporta como falta, no la inventa', () => {
    expect(faltas(titulos(['1. Introducción', '2. Resultados'])).map((f) => f.clase))
      .toContain('fase-requerida');
  });

  it('un H2 que dice "Resultados" a secas se propone promover, con el motivo', () => {
    const f = faltas(titulos(['1. Metodología', '1.1 Resultados'])).find((x) => x.clase === 'h2-mal-nivelado');
    expect(f?.accion).toBe('promover');
    expect(f?.detalle).toContain('Resultados');
  });

  it('un H2 con calificador NO se propone promover, y el motivo explica por que no', () => {
    // El autor puso un calificador: quiere decir algo concreto. Promoting it would
    // be worse than not promoting anything.
    const f = faltas(titulos(['1. Metodología', '1.1 Resultados de la encuesta']))
      .find((x) => x.clase === 'h2-mal-nivelado');
    expect(f).toBeUndefined();
  });

  it('nunca decide el ambito mirando el cuerpo de un parrafo', () => {
    // Un parrafo que dice "nuestra metodologia se aplico a 40 personas" NO puede
    // hacer que el documento parezca tener una fase de metodo.
    const arbol = construirJerarquia([h1('1. Introduccion', 'palabras'), parrafo('La metodologia se aplico a 40 personas del universo')]);
    expect(arbol[0].fase).toBe('introduccion');
  });
});
```

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/faltasApa7.test.tsx`
Expected: FAIL.

- [ ] **Step 3: La lista de fases requeridas**

`python/modules/phase_scope.py` ya sabe qué fases son obligatorias
(`RULE_SCOPES`). **Buscá la constante y reusala; no escribas una lista nueva en TS.**
Si la lista vive solo en Python, exponela por el mismo mecanismo que ya usa el frontend
para el resto — y si no hay mecanismo, **anotalo en el reporte**: duplicar la lista de
fases obligatorias en TypeScript es la quinta vez que se duplicaría.

La comparación es por **fase abierta por un H1**, nunca por texto de párrafo. El cuarto
test lo verifica.

- [ ] **Step 4: La acción de promover es real**

`accion: 'promover'` tiene que **cambiar el nivel del encabezado de verdad**, y el
`.docx` tiene que salir con el H1. Si el botón aparece y no cambia el nivel, es un botón
mudo, que es la clase de defecto que este proyecto vino a matar.

Si el cambio de nivel necesita backend, **decílo y no lo simules.** Un botón que actualiza
el estado local y no el documento es peor que no tenerlo.

- [ ] **Step 5: Verificación y commit**

```bash
git add src/components/structure/FaltasApa7.tsx src/lib/jerarquia.ts src/__tests__/faltasApa7.test.tsx
git commit -m "estructura: que le falta a APA 7, y se corrige ahi

Esto ya se calculaba en Python y se tiraba. phase_scope.py sabe que fases son
obligatorias, y match_phase_exact distingue un H2 mal nivelado de uno que el autor puso
a proposito. Para un redactor esa es exactamente la distincion que hace falta antes de
escribir, y hoy no la muestra nadie.

El caso de siempre: 'Resultados' a secas se propone promover porque es una fase mal
puesta. 'Resultados de la encuesta' lleva un calificador que avisa de que el autor
queria decir algo concreto, y se deja quieto. Un motor que promoviera los dos seria peor
que uno que no promoviera ninguno.

Y hay un test que falla si un parrafo con la palabra metodologia hace que el documento
parezca tener fase de metodo. El ambito se decide sobre el titulo de un H1 y nunca
sobre el cuerpo."
```

---

### Task 4: El pulso y el inspector de rama

**Files:**
- Create: `src/components/structure/PulsoDocumento.tsx`, `src/components/structure/InspectorRama.tsx`
- Test: `src/__tests__/pulsoDocumento.test.tsx`, `src/__tests__/inspectorRama.test.tsx` (nuevos)

**Interfaces:**
- Produces: `export type Pulso = { palabras: number; balance: number | null; fasesQueFaltan: string[]; figurasSinLeyenda: number; referenciasNoCitadas: number }`.
  `balance: number | null` — **`null` es un estado de primera clase**, no cero.

- [ ] **Step 1: Los tests**

```tsx
describe('pulso del documento', () => {
  it('son cinco numeros y nada mas', () => {
    // Si aparecen más, es porque alguien empezó a agregar cosas. Y cada número
    // tiene que decir SU valor, no un ícono.
    expect(celdas(armar())).toHaveLength(5);
  });

  it('el balance de un documento de un solo capítulo es null, no 100%', () => {
    expect(pulsoDe(titulos(['1. Introducción'])).balance).toBeNull();
  });
});

describe('inspector de rama', () => {
  it('cada acción dice a qué alcance aplica', () => {
    expect(alcanceDe('reordenar')).toBe('esta-rama');
  });
  it('una acción de rama NO toca las hermanas', () => {
    // "Reordenar" sin alcance declarado es una amenaza. Y si dice "esta rama" y
    // toca las hermanas, es peor.
    const antes = titulosHermanos();
    reorderRama('rama-2');
    expect(titulosHermanos()).toEqual(antes);
  });
  it('preguntarle a la IA dice sobre qué rama pregunta', () => {
    expect(preguntaDeIa('rama-2')).toContain('Metodología');
  });
});
```

- [ ] **Step 2: Corré, implementá, verificá**

`PulsoDocumento.tsx`: cinco celdas, con el número y su nombre. El balance muestra
"no hay con qué comparar" cuando es `null`.

`InspectorRama.tsx`: los párrafos de la rama, las figuras que tiene asignadas, las citas
que salen de ahí, y **cuatro acciones, cada una con su alcance escrito a la vista**:
promover H2→H1, reordenar la rama, renombrar, preguntarle a la IA qué debería ir ahí.
**Cada una tiene que aplicar de verdad.** Si alguna necesita backend y no existe, **se
quita de la lista**: un botón que no hace nada ocupa el lugar de uno que sí.

- [ ] **Step 3: Commit**

```bash
git add src/components/structure/ src/__tests__/pulsoDocumento.test.tsx src/__tests__/inspectorRama.test.tsx
git commit -m "estructura: el pulso arriba, y las acciones dicen a que aplican

Cinco numeros y nada mas: palabras, balance, fases que faltan, figuras sin leyenda,
referencias no citadas. Es lo que un redactor mira primero y no existia en ninguna parte.

El balance de un documento de un solo capitulo es null, no cien por ciento. Una rampa
comparativa sin hermanas no significa nada, y un cien por ciento parece una nota.

Las cuatro acciones de rama declaran su alcance en pantalla. Reordenar en un indice
jerarquico sin decir a que aplica es una amenaza, y el test comprueba que la accion de
rama no toca a las hermanas: si dice 'esta rama' y toca las hermanas, es peor que si no
existiera."
```

---

### Task 5: El mapa, y la guarda de la fase

**Files:**
- Create: `src/components/structure/MapaEstructura.tsx` (**SVG a mano, cero librería**)
- Create: `src/__tests__/estructuraNoMiente.test.ts`
- Test: `src/__tests__/mapaEstructura.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `construirJerarquia`.

- [ ] **Step 1: El mapa**

**Cero librería**: ni `dagre`, ni `reactflow`, ni `cytoscape`, ni `elk`. **SVG escrito a
mano.** El layout de un árbol por niveles son tres líneas de aritmética, y una dependencia
de 300 kB para dibujar 40 cajas que nadie va a leer en 3D es un mal negocio.

**Reglas duras**:
- **Todo nodo tiene su etiqueta dentro del nodo.** Sin excepción. El bug del `AiMosaic`
  fue exactamente esto.
- Si la etiqueta no entra, **se acorta con `ellipsis`**, y el texto íntegro va en el
  `<title>` del nodo — pero **el nombre tiene que estar en pantalla**.
- El mapa es un **toggle dentro de la vista de índice**, no una capa flotante encima.
  Nunca tapa el contenido.
- Un nodo truncado (`…`) con su conteo de hijos al lado, para que se sepa que hay más.

- [ ] **Step 2: La guarda de la fase**

`estructuraNoMiente.test.ts`:

```ts
it('ningún nodo de la estructura tiene su nombre fuera de pantalla', async () => {
  // Ni en el title, ni en el aria-label, ni en un hover: en pantalla.
  const fuentes = import.meta.glob('/src/components/structure/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  for (const [ruta, fuente] of Object.entries(fuentes)) {
    // Un nombre que solo vive en un title es un nombre que no existe.
    expect(fuente, ruta).not.toMatch(/title=\{[^}]*label/i);
  }
});

it('el mapa no usa ninguna librería de grafo', () => {
  // Si aparece una, es porque alguien decidió que dibujar cajas era difícil.
  // No lo es.
  const pkg = await import('../../package.json?raw');
  for (const dep of ['reactflow', 'dagre', 'elkjs', 'cytoscape', 'mermaid', 'vis-network']) {
    expect(pkg.default).not.toContain(dep);
  }
});
```

- [ ] **Step 3: Mutation testing**

Motá: (a) poné el nombre de un nodo **solo** en `title` y verificá que cae la guarda;
(b) poné `alignarHermanas` dividiendo siempre por 1 y verificá que el test del balance
cae; (c) poné `estricto = false` en la detección de H2 mal nivelado y verificá que cae el
test de "Resultados de la encuesta"; (d) cambiá `balance: null` por `balance: 100` y
verificá que cae.

- [ ] **Step 4: Verificación final de la fase y commit**

Run: `npx vitest run` && `npx tsc --noEmit` && `pytest python/tests/ -q` && `npm run build`
Expected: frontend ≥1143, Python ≥800.

```bash
git add src/components/structure/ src/__tests__/estructuraNoMiente.test.ts src/__tests__/mapaEstructura.test.tsx
git commit -m "estructura: el mapa es svg a mano, y ningun nombre vive fuera de pantalla

Ni dagre ni reactflow ni cytoscape. El layout de un arbol por niveles es tres lineas de
aritmetica, y 300 kB para dibujar cuarenta cajas que nadie va a leer en 3D es un mal
negocio.

La regla dura es que todo nodo tiene su etiqueta dentro. Si no entra, se acorta con
ellipsis y el entero va en el title, pero el nombre se ve. El mosaico de la revision
tenia el nombre solo en el hover, que es como se construye esto.

Y el mapa es un toggle dentro de la vista de indice, nunca una capa flotante encima. El
usuario pidio explicitamente sacarlo de ahi, y tenia razon: una capa que tapa el
contenido se lee como un estorbo."
```

---

### Task 6: Montar la fase, y el guardián que lo exige

> **ESTA TASK NO ESTABA EN EL PLAN, Y SU AUSENCIA ES EL DEFECTO.** Las cinco tasks de
> arriba construyen siete componentes, los prueban y los dan por terminados. Ninguna
> nombra `App.tsx` ni un `viewMode`. Resultado: 1239 tests verdes sobre una superficie
> que el usuario no ve, y un `grep` de `from '.*structure/'` fuera de la propia carpeta
> que da cero resultados. **Un componente sin hogar es un componente que no existe**:
> es, literalmente, el defecto que este proyecto vino a matar, reconocido en su propia
> carne.

- [ ] **Step 1: Decidir qué pasa con la fase 2 que ya existe**

La fase 2 del wizard es "Estructura" y hoy abre en `Step2HeadingsWizard`: el lienzo con
el revisor secuencial de títulos. El spec §7 pide que el centro sea la jerarquía y que
el documento sea un toggle. **No se borra lo que hay**: "Títulos" y "Cuerpo" hacen cosas
que el índice no hace. Se les suma una pestaña, y la fase abre en ella.

- [ ] **Step 2: El compositor**

`src/components/structure/EscritorioEstructura.tsx`, en el orden del spec §7: pulso de
cinco números arriba, índice con su diagnóstico al centro, inspector de la rama elegida
a la derecha, qué le falta a APA 7 al pie. El documento entra por prop (`documento`),
porque quien compone la fase es quien sabe qué es "el documento" en ese contexto. La
fase de cada elemento sale de `collectAuditItems` —la misma lista que cuenta el rail—,
nunca de un segundo recorrido.

- [ ] **Step 3: El guardián**

`src/__tests__/estructuraEstaMontada.test.tsx`, con dos pruebas negativas:

1. la fase monta el índice y NO el documento entero;
2. **todo** componente de la carpeta tiene un importador, y los nombres **se leen del
   disco** con `import.meta.glob`, nunca escritos a mano. Los `__tests__` no cuentan
   como montaje, porque una prueba que importa un componente para probarlo no lo pone
   en pantalla.

**Mutar el guardián y verlo caer** antes de dar la task por buena. Sin eso es una
afirmación.

- [ ] **Step 4: Verificación y commit**

Run: `npx vitest run` && `npx tsc --noEmit` && `pytest python/tests/ -q` && `npm run build`
Expected: frontend ≥1249, Python ≥800.
**Y el criterio de aceptación de la fase, que no es un número:**

```bash
grep -rn "from '.*structure/" src/ | grep -v __tests__
```

Si eso no da resultados, la fase está construida y no montada, que es exactamente lo
que pasó.

---

## Self-Review

**0. Lo que este plan se olvidó y la Task 6 tapa.** No nombraba `App.tsx` ni un
`viewMode`: cinco tasks, siete componentes, 1239 tests en verde y una carpeta que
`grep` daba por inhabitable. El error no fue de ejecución sino de plan, y por eso la
task que falta es de plan. **Una fase sin montaje no es una fase, es un repositorio.**

**1. Cobertura del spec §7.** 7.1 (índice con palabras, balance, salud) — Task 2;
7.2 (faltas de APA 7) — Task 3; 7.3 (pulso) — Task 4; 7.4 (inspector de rama) — Task 4;
7.5 (el mapa, y arreglar `AiMosaic`) — Tasks 1 y 5. **El montaje, que el spec da por
supuesto y este plan no, — Task 6.**

**2. La propuesta es del usuario y ajustada por la discusión.** Él pidió "ver cómo está el
documento, qué H1/H2 tiene, o ver si algún H1 está en duda o algún H2 no sé". Eso es
exactamente 7.1, 7.2 y 7.3. **El plan no inventa una quinta cosa.**

**3. Lo que puede salir mal y está anotado.** La lista de fases obligatorias vive en
Python (`RULE_SCOPES`). **Si no hay mecanismo para exponerla al frontend, duplicarla en
TypeScript es la quinta copia de la misma regla.** La Task 3 pide que se reporte en vez
de inventar. Y la acción de promover: **si necesita backend y no existe, se quita el
botón**, no se simula.

**4. Review Focus.** Los cinco tienen test: (1) Task 1, H1 numerado; (2) Task 3, los dos
H2; (3) Task 2, imbalance y hermana única; (4) Task 4, alcance; (5) Task 1 paso 5 y Task
5, la guarda del nombre.

**5. Errores míos que dejé en el plan.** Escribí `construirJerografia` (con `g`) en el test
de la Task 1 y lo marqué. Es el mismo tipo de error que el de los `kind` con doble letra
que la F0 encontró: **una errata en un identificador es un tipo que existe como regla en
el backend y no en el frontend.** Si el implementador copia el código sin corregirlo, el
test falla por el motivo equivocado y hay que leerlo dos veces. Está señalado, pero es una
trampa que puse yo.
