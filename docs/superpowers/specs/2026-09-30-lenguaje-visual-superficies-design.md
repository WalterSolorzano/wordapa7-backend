# Lenguaje visual y rediseño de superficies — WordAPA7

- **Fecha**: 2026-09-30
- **Rama**: `feat/motor-render-fase1`
- **Estado**: **BORRADOR — en pulido con el usuario** (sesión de visual companion)
- **Padres**:
  - `docs/superpowers/specs/2026-09-29-plan-correccion-por-fases-design.md` (las fases F0–F10)
  - `docs/superpowers/specs/2026-09-29-fases-sagradas-design.md` (qué vive en cada pantalla + inventario de controles)
- **Qué agrega**: la capa que los planes anteriores habían **diferido**. Decían "la decisión de forma de cada superficie se toma con la skill `impeccable` al ejecutar su fase"; ese diferido es lo que el usuario reportó como "no razonó las UIs". Este documento es esa decisión de forma, tomada con el usuario, pantalla por pantalla.

> Este documento **no reemplaza** a los padres. Los complementa. Las decisiones de los padres (portada protegida, papel blanco puro, revisión de un párrafo a la vez, rail siempre visible, conteos desde `railPending.ts`) siguen vigentes y no se tocan acá.

---

## 1. Por qué existe

El usuario reportó: el plan razonó **los controles** (qué se queda, qué se va) pero **no la forma** (cómo se ve y se siente). Resultado: la app seguía con los fallos visuales. Esta sesión produce la forma con el usuario, con mockups en el navegador, antes de tocar código.

**Orden acordado con el usuario**: primero el diseño visual de cada superficie, después el código.

---

## 2. La dirección visual elegida (aplica a TODAS las superficies)

Opción **A — "Calma (estilo Notion)"**. Elegida por el usuario sobre las alternativas "Editorial (hoja APA)" y "Herramienta pro".

Reglas del lenguaje:

1. **Neutro y sin bordes duros.** Fondo neutro (`#fbfbfa` de referencia en mockup; en la app, tokens de la casa). La jerarquía se comunica por **tipografía y sangría**, no por cajas ni bandas.
2. **El estado se dice en palabras.** `desbalanceada`, `vacía`, `2 figuras`. Nunca un color suelto sin nombre.
3. **La selección se marca con un fondo suave.** Jamás con un `border-left` de acento. Prohibido reintroducir la banda navy (`--color-navy-header`) y el borde azul de 4 px.
4. **Nada aparece por hover.** Ningún tooltip ni popup cubre el área de trabajo al pasar el mouse.
5. **El chrome vive en el flujo.** Ni barras ni paneles flotantes sobre el contenido. Ocupan espacio real y empujan la pantalla.
6. **Cada dato tiene función.** Un número se muestra solo si sostiene una decisión (el conteo de palabras sobrevive únicamente porque sostiene el veredicto "desbalanceada"). Sin métricas de vanidad: muere la tira de pulso (5 números).
7. **Pocos controles, categorizados.** Los controles de una superficie se agrupan en dos categorías declaradas, no en N botones sueltos.
8. **El contenido se presenta según lo que ES, no en texto plano ni en volcado.** Cero `<pre>` con el documento entero. El contenido se formatea para lo que es (objetivos, figuras, citas, hallazgos).
9. **Cero emojis. Solo tokens.** `lucide-react`, `strokeWidth="var(--icon-stroke)"`. Sin hex en TS/TSX/CSS.
10. **Microcopy corto: el estado se dice en la fila, no en un párrafo.** El botón lleva el verbo y el número (`Aplicar a 3`), nunca la frase completa. El detalle de "quién ya cumple" vive en la fila, no en un recuadro de impacto.

---

## 3. Estructura — decisiones cerradas en esta sesión

### 3.1 Una sola superficie, un selector en el flujo

- Muere `StructureTabBar` (`Esquema Jerárquico / Revisor de Títulos APA 7 / Editor de Prosa`). Muere `structureTab`; nace `vistaEstructura`.
- Una superficie, con **un** selector arriba, **en el flujo** (no flota): **`Índice` · `Documento` · `Mapa`**.
- La vista elegida vive en el store, no en un `useState` local (para que el rail y `ValidatorView` puedan volver a una vista).

### 3.2 Las acciones del nodo van en la columna derecha (opción A2)

- Decisión del usuario: las acciones del nodo seleccionado (`Nivel 1 / 2 / 3 / No es título`, `Renombrar`) **viven en la columna derecha**, no en una barra superior. Menos chrome arriba.
- Las acciones de rama dicen su alcance: `(esta rama)` / `(todo el documento)`.

### 3.3 El índice: filas por tipografía

- Las filas H1/H2 se distinguen por **peso y sangría**, con tokens suaves. Sin banda, sin borde de color.
- El badge `sin elementos` repetido desaparece; la información aparece solo cuando hay algo que decir.
- El conteo de palabras se conserva **solo** donde sostiene el veredicto de balance.

### 3.4 El panel derecho se rige por el CONTRATO de fase (B1 + B2)

- **Fuente única**: `python/modules/phase_scope.py`, `PHASES`. Cada H1 declara sus criterios (párrafo 80–200, paráfrasis vs. cita, verbo Bloom, verbo pasado, método sin detalle…). El panel **consume** esa tabla; **no** crea una sexta copia de la taxonomía.
- El panel muestra:
  - **B1 — El contrato de la fase**: qué espera APA 7 de una sección como esa (`✓`/`✗`), y **cada falta con su acción**.
  - **B2 — La lectura de la sección**: la app interpreta el contenido (no lo vuelca) y lo presenta como lo que es (en Objetivos, los objetivos; en Marco teórico, autores y afirmaciones).
- **Reparto sistema vs. LLM** (resuelve la duda del usuario "esto necesita un sistema-LLM"):
  - **Sin LLM, ya calculado**: tamaño de párrafo, verbo en pasado, paráfrasis vs. cita, Bloom, objetivo sin variable, método sin detalle.
  - **Con LLM, solo donde exige razonar**: "¿la conclusión responde a los objetivos?", "¿esta sección promete algo que no entrega?". Se corre **una vez por fase, con caché**, nunca por tecla.

### 3.5 Objetivos: leer primero, corregir abajo

- **Se descartó el gráfico/escalera Bloom como pieza principal.**
- El panel **lee primero**: `Objetivo general` y `Objetivos específicos`, con **estilo editorial** — más cuerpo, ancho de lectura acotado (`max-width`), más interlínea, aire entre bloques. No se ve cargado ni todo junto.
- Las **sugerencias y correcciones van abajo**, tras una regla: una por renglón.
- Las marcas de corrección son **inline y discretas**, no un tablero: el verbo flojo va **subrayado**, el verbo de más va **tachado**.
- Cada corrección ofrece la salida: alternativas del mismo nivel para un verbo flojo (`Identificar / Determinar / Establecer`) con botón `Aplicar`; o `Quitar "y describir"`.

### 3.6 El H2: no abre criterios propios

- Un **H2 hereda** el ámbito de su H1 (D3 de la taxonomía). No recibe contrato propio.
- El panel de un H2 muestra lo que **sí** es útil: **si su nombre entrega lo que promete** ("se llama *Antecedentes* y no menciona ningún estudio previo"), su **peso** dentro de la fase, y **qué cuelga** de él (figuras, tablas, citas).

### 3.7 La tercera ventana: el Mapa

- **Diagrama de organización del documento**, dibujado en **SVG a mano** (cero librerías de grafo).
- El archivo como raíz; las fases (H1) como nodos; clic en una fase y **se despliega** en sus subsecciones (H2).
- **Cada nodo con su nombre siempre visible.** Nunca el nombre solo en hover (era el bug del mosaico viejo).
- La numeración es la del documento, no una impuesta.
- Marcas para `desbalanceada / vacía` y `con figuras o tablas`.

---

## 4. Pendientes de esta sesión (sin cerrar)

1. **Secciones que no abren fase** (ej. "Desarrollo"): tres opciones presentadas, ninguna elegida todavía.
   - **E1** — mismo criterio que Objetivos: se lee el contenido (acotado) y abajo observaciones estructurales.
   - **E2** — sin panel: si no abre fase, la columna derecha queda vacía; mandan el índice y el mapa.
   - **E3** — el panel pregunta "¿esta sección es…?" y recién al elegir lee el contrato.
   - Regla común a las tres: **la app no adivina criterios**.
2. **Ideas nuevas propuestas** (el usuario no eligió todavía cuáles):
   - **C1 · El hilo** — cómo conecta esta fase con la vecina ("2 cierra preguntando X; Resultados todavía no lo mide").
   - **C2 · El arco de los objetivos** — cada objetivo declarado y dónde se responde (Método / Resultados / Conclusiones).
   - **C3 · Fuentes de la fase** — qué autores la sostienen y cuáles aparecen una sola vez (solo el aviso estructural; el detalle es de Referencias, F6).
3. **Superficies sin diseñar todavía**: Figuras, Referencias, Revisión, Exportar (y la carga/mascotas de F2).

---

## 5. Lo que NO vuelve (en ninguna superficie)

- La banda `--color-navy-header` por fila H1 y el `border-left` de acento de 4 px.
- El badge `sin elementos` repetido.
- El popup flotante de Estructura al pasar el mouse.
- La tira de pulso de 5 números ("Balance 0 %", "Fases que faltan" sueltos).
- Los conteos sin acción (párrafos/figuras/tablas/citas como lista de vanidad).
- El `<pre>` con el documento entero.
- El gráfico Bloom como pieza principal (la información Bloom se muestra como crítica en la lista de correcciones).

---

## 6. Mockups de esta sesión (referencia local)

Viven en `.superpowers/brainstorm/wordapa7-ui/content/` (gitignoreado, persiste en la máquina):

| archivo | qué muestra |
|---|---|
| `direccion-visual.html` | las tres direcciones visuales (A/B/C) |
| `estructura-calma.html` | Estructura en lenguaje A + decisión A1/A2 |
| `rama-que-muestra.html` | B1/B2/B3 para la columna derecha |
| `fases-y-subfases.html` | el panel por fase + el caso H2 + ideas C1/C2/C3 |
| `objetivos-bloom.html` | primer intento de Objetivos (descartado: el gráfico) |
| `objetivos-v2.html` | Objetivos leyendo primero (aprobado) |
| `mapa-navegacion.html` | el Mapa + pulido editorial de Objetivos |
| `propuestas-estructura.html` | T1/T2 + las 8 propuestas de Estructura (P1–P8) |
| `figuras-propuesta.html` | Figuras v1 (lista por sección + detalle) |
| `figuras-v2-tres-pestanas.html` | **Figuras v2 — el aprobado**: tres pestañas, párrafo anterior arriba y editorial, previews legibles, H1 con scroll, procedencia del H2 |
| `editor-estilos-donde-vive.html` | primer intento del editor de estilos (formulario de inputs, **descartado**) |
| `editor-estilos-presets.html` | **el editor de estilos v2**: galería de presets reales + listas desplazables + multi-selección |

---

## 7. Refinamiento pendiente de Estructura (auditoría contra el sistema de diseño)

Auditoría contra `src/styles/design-system.css` y el código de `src/components/structure`.

**Veredicto de paleta**: el diseño **entra en los tokens sin agregar ninguno**. Los hex de los mockups son referencia de dibujo; todos tienen token real (`--color-bg-canvas`, `--color-bg-surface`, `--color-bg-surface-alt`, `--color-bg-surface-hover`, `--color-accent-soft`, `--color-warning`, `--color-success`, `--color-text-primary/secondary/tertiary`). `components/structure` ya está en el alcance de R3 (`noHardcodedColors.test.ts`, `DIRECTORIOS_R3`) y `NodoIndice` ya usa tokens. **La deuda de paleta está saldada.**

Lo que falta **no es color**:

| # | Tipo | Falta |
|---|---|---|
| 1 | **DECISIÓN** | **No hay tipografía editorial.** La casa usa `--font-sans` (Inter); no hay serif ni display. Lo "editorial" del panel de Objetivos sale de tamaño, peso, interlínea y ancho de lectura con `--text-*` y `--space-*`, **o** se agrega un token nuevo. **Decidido (2026-09-30): T1** — Inter con jerarquía, cero token nuevo. |
| 2 | **A11Y** | **Las filas no son de teclado.** `NodoIndice` es un `div onClick` con `role="listitem"`: no se tabula, no tiene `aria-selected` ni anillo de foco. Falta `roving tabindex` + `--shadow-focus`, y `aria-pressed` en el selector de vistas. |
| 3 | **CONTRASTE** | **El badge de nivel usa `--color-accent` y tiñe todos los capítulos.** Es el mismo gesto que la banda navy: el acento es la señal de "mirá acá". Debe ser tinta neutra; el acento queda solo para la fila seleccionada. |
| 4 | **ESTADOS** | **Falta el estado "analizando".** El panel combina cálculo determinista + una pasada de LLM con caché. Hace falta un estado de carga honesto con su deshacer, no un hueco que parece vacío. |
| 5 | **ESTADOS** | **Vacíos con `EstadoVacio`** (sección sin fase, sin resultados de filtro, mapa sin documento), sobreviviendo a la ventana angosta. |
| 6 | **MAPA** | **El SVG no puede llevar hex.** Cada nodo y línea por `currentColor` / `var(--…)` vía clase, en los dos temas. Un `fill="#fff"` en el SVG es el mismo defecto que un hex en TSX. |
| 7 | **RESPONSIVE** | **Comportamiento por debajo de 1280x800**: colapsa primero la columna derecha (su función pasa al flyout del rail); el índice se queda. Ningún panel se aplasta. |
| 8 | **MOTION** | Transiciones con `--transition-fast` y respeto de `prefers-reduced-motion` en el despliegue del mapa y la aparición de correcciones. |
| 9 | **ICONOS** | Todo con `lucide-react` y `strokeWidth="var(--icon-stroke)"`. Falta decidir qué íconos llevan el selector y las acciones del nodo. |

---

## 8. Propuestas para Estructura (lo que el diseño todavía no cubre)

Cada propuesta se suma al diseño de Estructura o se descarta con el usuario.

### 8.1 Datos que faltan en el backend

- **Las fases obligatorias de APA 7 no existen como dato.** `RULE_SCOPES` mapea regla→ámbito, `PhaseConfig` no tiene campo `required`, y no hay endpoint. `FaltasApa7` recibe la lista por prop y, sin ella, lo dice en pantalla. **Sin este dato, "que me diga qué le falta" está a medias.** Propuesta: `required: bool` en `PhaseConfig` + endpoint que exponga `PHASES`.
- **Divergencia Python/TS pendiente** en tres títulos (`1.1 Antecedentes`, `Parte 1. Metodología`, `Metodología de la investigación`). Se cierra con el mismo endpoint.

### 8.2 Acciones que faltan

- **Insertar lo que falta desde una plantilla APA 7** (una sección, un esqueleto entero) — es lo que resuelve en automático lo que el diagnóstico detectó. Hoy no existe.
- **Reordenar ramas con alcance y vista previa**: subir / bajar / mover un nodo, mostrando **qué va a cambiar antes de aplicar**. Sin preview, un botón de reordenar en un árbol es una amenaza.
- **Normalizar la numeración de títulos** (`3. Marco teórico` vs `Marco teórico`) como **acción explícita**, nunca impuesta (el mapa declara la numeración del documento, no una propia).
- **Multi-selección de nodos** para acciones en lote ("Aplicar a los 4 títulos").

### 8.3 Seguridad de la edición

- **Deshacer y persistencia**: cada acción estructural (promover, degradar, renombrar, insertar, reordenar) entra al stack de deshacer y se guarda, como se hizo con `updateElementEquation`.
- **Volver al original / estado "ediciones sin guardar"**: poder comparar contra el `.docx` cargado.

### 8.4 Encontrar en documentos largos

- **Buscar en el índice** (hoy `Step3FiguresTablesWizard` no busca por sección aunque la sección ya está calculada) y **filtrar por estado**: solo desbalanceadas, vacías, sin figuras, sin citas.
- **Colapsar y expandir ramas**: 40 capítulos exigen cerrar un H1 y trabajar en otro.

### 8.5 Puentes entre fases (sin contaminar)

- **De un nodo a sus objetos**: saltar a las figuras de esa rama (F5) y a sus referencias (F6). Es un enlace con alcance, no traer F5/F6 dentro de Estructura.
- **De un hallazgo de Revisión al nodo**: caer en Estructura en la sección del hallazgo.

### 8.6 Honestidad y calidad

- **"¿Por qué?"**: ver la regla detrás de cada `✗` de la columna, sin salir de la pantalla.
- **Títulos duplicados**: dos H2 con el mismo nombre en la misma fase.
- **Profundidad H3+**: definir el comportamiento (¿se muestran? ¿se pliegan?).
- **Anuncios accesibles** al cambiar de nodo o de vista (`aria-live`).

### 8.7 Decidido el 2026-09-30

**Tipografía (T1)**: Inter con jerarquía. Cero token nuevo. Lo editorial sale de tamaño de lectura (16–17 px), interlínea 1.7 y ancho de 52–56 caracteres, con `--text-*` y `--space-*`.

**Propuestas elegidas**: **P5** (buscar y filtrar en el índice + colapsar ramas), **P6** (puentes hacia Figuras y Referencias, y de Revisión al nodo) y **P7** (multi-selección para acciones en lote).

**Propuestas NO elegidas por ahora** (quedan registradas, no se ejecutan):
- **P1** — fases obligatorias como dato del backend. Sigue abierto: `FaltasApa7` mantiene su mensaje honesto de que no tiene la lista. Es la única que, si el usuario la quiere, desbloquea "falta Discusión".
- **P2** — insertar plantilla APA.
- **P3** — reordenar con vista previa.
- **P4** — deshacer y persistencia (nota: es seguridad de la edición, no una feature; evaluar si se retoma con F4 en marcha).
- **P8** — "¿por qué?", títulos duplicados, H3+.

---

## 9. Figuras, tablas y ecuaciones (decidido el 2026-09-30)

La fase pasa a llamarse **Figuras, tablas y ecuaciones**: la ecuación vive acá, no en Revisión.

**G2 elegido — tres pestañas** (`Figuras · Tablas · Ecuaciones`). Razón: en APA 7 cada tipo tiene su propia numeración (Figura N / Tabla N), así que mantenerlos en listas separadas **preserva el orden real** del documento. Una sola lista mezclada los desordenaría.

**Refinamientos que pidió el usuario:**

1. **El párrafo anterior va ARRIBA de la previsualización y grande.** El contexto se lee *antes* de la imagen, no después. Hoy está abajo, en `--text-xs` y recortado a 3 líneas.
2. **Previsualizaciones grandes, con la letra legible.** La miniatura no sirve: hay que ver la figura o la tabla al tamaño en que se lee.
3. **Cada elemento dice de qué H2 viene**, además del H1 de su sección (`3. Marco teórico → 3.2 Medición de la carga`).
4. **Los H1 son listas desplazables**: cada grupo es un bloque colapsable con su propio scroll.
5. **Fuente editorial (T1)**: Inter con jerarquía de lectura. El contexto y las leyendas a tamaño de lectura (14–15 px, interlínea 1.7), nunca `--text-xs`.
6. **Encaje en el sistema**: cero emojis, íconos `lucide-react`, solo tokens existentes, cero hex.

**Se mantiene del diseño previo**: la leyenda visible en cada fila, las dos acciones con nombre (`Ver en el documento`, `Tamaño y alineación`), `Criterio general…` para aplicar el mismo criterio a todas, y `Sugerir con IA` para la leyenda.

### 9.1 El editor de estilos: dónde vive, y con qué

**Dónde (no es una pantalla nueva): la misma columna derecha en dos alcances.**

- Alcance **Este elemento** → el inspector del elemento seleccionado.
- Alcance **Todos** → `Criterio general…` abre ese mismo editor con el alcance ancho, dice **cuántos cambian y cuántos ya cumplen**, y aplica por el camino que ya existe (`scoped_apply` / format-plan), con deshacer.

**Con qué: los materiales que YA construimos y no se pueden desperdiciar.**

| Material que existe | Qué aporta |
|---|---|
| **`ImageEditPanel.tsx` → `DESIGN_STYLES`**: **7 presets** con `label`, `desc`, `badge` y **miniatura SVG dibujada con tokens** | Es la galería visual del editor. No hay que inventar ninguna |
| **`ImageEditPanel` → 4 pestañas** `Formato · Texto · Estilo · Revisión` (`Sliders`, `Type`, `Palette`, `ShieldCheck`) | El juego de pestañas del inspector, ya existente |
| **`table_engine.py`**: `set_table_borders("apa")`, `set_table_apa7_borders`, `format_apa_table`, `fit_table_to_page`, `validate_table_widths` | La aplicación real sobre tablas |
| **`style_engine.py`** | Normaliza `styles.xml` |
| **`apa_rules.py` (`RULES`)** | El contrato de reglas APA 7, consumido por export y add-in |

Los 7 presets reales, tal como están hoy en el código: `APA Estándar` (badge “Oficial”) · `Científico` (“Técnico”) · `Ancho Completo` · `Compacto / Flotante` · `Doble Horizontal (a, b)` (“Doble”) · `Cuadrícula 2×2 (a, b, c, d)` (“Malla”) · `Vertical Apilado (a, b)` (“Serie”).

> **Deslinde honesto**: `python/generation/templates.py` (TESINA, INFORME, IMRYD, ENSAYO) son plantillas de **estructura**, no de estilo. Su lugar natural es Estructura —es la propuesta **P2** (“insertar lo que falta”) que quedó sin elegir—, no este editor. Mezclarlas acá sería usar la herramienta equivocada.

**Decisión de forma (reemplaza el primer intento, que era un formulario de inputs):**

El editor de estilos **no es una caja de campos**. Es **la galería de presets que ya existe, montada sobre listas desplazables**:

1. **Columna izquierda: la lista desplazable de elementos**, agrupada por H1, cada fila con su H2, su miniatura y su estado. Con checkbox por fila (**multi-selección, P7**).
2. **La galería de presets** (`DESIGN_STYLES`) es el control central: se elige por miniatura, no escribiendo valores.
3. **La lista es la vista previa**: al elegir un preset, cada fila elegida muestra cómo va a quedar. El botón dice `Aplicar a N figuras`.
4. **Se conservan las 4 pestañas** del inspector (`Formato · Texto · Estilo · Revisión`). No se inventa otro juego.
5. **Lo que APA 7 fija se declara, no se ofrece**: número y título arriba, nota debajo con “Nota.” en cursiva, sin líneas verticales en tablas. El preset `APA Estándar` es el que cumple; los demás son desvíos deliberados y se muestran como tales.

---

## 10. Cómo sigue

1. Cerrar los pendientes de §4 (E1/E2/E3, C1/C2/C3), la §7.1 (tipografía editorial) y elegir de §8.
2. Diseñar las superficies restantes con el mismo método (Figuras, Referencias, Revisión, Exportar).
3. Volcar estas decisiones a los planes de fase (`writing-plans`) y ejecutar, fase por fase, con `impeccable` aplicado.
