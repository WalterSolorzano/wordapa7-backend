# Diseño — Fase «Revisión & IA» en dos salas (Sala de Revisión · Sala de IA)

Fecha: 2026-10-05
Estado: **diseño completo** — Puerta de Fase 5 aprobada (UI 0); Sala de IA aprobada (UI 1, 2 y 3);
REV-L0 aprobada (UI 4, v3: dashboard con calificación de revisión, motores, Objetivos con gráfico
Bloom y fases en gráfico de columnas); REV-L1 aprobada (UI 5); analizador de Objetivos aprobado
(UI 6); analizador de Referencias descartado (UI 7). La
revisión de **Referencias** no vive aquí: tiene su propia fase (`Step5ReferencesWizard`).
Mockups fuente: `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/`
Documento vivo: la sección 5 se completa a medida que el usuario aprueba cada UI. No se
implementa nada hasta que el diseño completo esté aprobado.

---

## 1. Objetivo

Rehacer la fase **Paso 5 · Revisión & IA** —salvo la puerta/landing, que se conserva— como
**dos salas separadas**, cada una con su propio patrón *dashboard → detalle*, sin mezclar en
una misma superficie los hallazgos de **revisión** (motores objetivos) con el **detector
probabilístico de IA**.

Éxito medible:

- Ninguna superficie mezcla revisión con IA. Una superficie de nivel N no renderiza contenido
  del nivel N+1: navega hacia él.
- Toda cifra de IA sale de **una sola fuente** (el perfil por párrafo), normalizada **0–100 una
  sola vez** en el límite de la API.
- El autor entra por el panorama y baja a la sección y al párrafo sin ruido visual.

---

## 2. Intención del usuario (verbatim)

Sobre el estado actual:

- «el menú general está okey» — la puerta/landing se conserva.
- «el mapa de calor tiene fallos y en alto se superpone la otra ventana de abajo y se ve
  cortado, además el % está mal».
- «la ui actual de revisión general está fea, es una versión basura que se ha persistido y
  quiero borrar porque tiene botones que no se usan y una representación super mala».

Sobre lo que quiere ver:

- «% en grande», «resúmenes de datos a la derecha de cuánta IA», «abajo un gráfico pequeño de
  los h1 cuáles tienen más ia», y al bajar «de manera general las cosas como objetivos si
  están mal».
- «si tocas cualquiera te lleva a una ui nueva entera interna donde es solo para ese h1», con
  «un menú lateral las diferentes párrafos que son ia o se marcan como ia subrayados» y «a la
  derecha por qué es ia y el % y cómo podría corregirlo».
- «Quiero gráficos para representar datos».
- «No quiero que se mezclen las cosas porque revisar es importante y no debe contaminarse con
  otro ruido visual».
- Revisión general: «el mismo criterio, aunque ahí es más complejo porque son varios tipos de
  correcciones».

Sobre la regla anterior de una sola columna:

- «eso de nada de 3 columnas no lo sigas, vamos a ir viendo en el curso cómo vamos diseñando
  para que se vea mejor». → **La regla «un párrafo a la vez / PROHIBIDO 3 columnas» queda
  retirada.** `AGENTS.md` §1 se actualizará al cerrar el diseño.

Aprobación de la UI 1:

- «ese superior aprobado» y «sobre lo de abajo de riesgo por sección también me gusta está
  perfecto». Único ajuste pedido: **quitar la cifra «pico» del bloque de la derecha**, porque
  la mascota ya lo dice.

---

## 3. Decisiones de arquitectura

1. **Dos salas (Approach A).** Sala de Revisión y Sala de IA son superficies separadas.
   Comparten primitivas visuales (tipografía, tokens, medidor, fila de sección), pero no se
   renderizan juntas.
2. **Un patrón por sala:** `L0 = dashboard` (panorama) → `L1 = lista + detalle` (una sección).
   Cada L1 muestra su contexto padre (nombre de la sección/fase) y un «volver».
3. **Separación de medidas (decidido con el usuario).** Revisión e IA **no se mezclan**:
   - **Sala de Revisión (REV-L0):** el % grande es **solo la calificación de revisión**,
     `cumplimiento(hallazgos, párrafos)` normalizado por tamaño. Sin componente de IA. El usuario:
     «solo pon el % de revisión, el de IA va en otro lado».
   - **Sala de IA (IA-L0):** su propia medida (rigidez / voz humana), 100 % IA.
   - **Puerta / landing (`ReviewGate`):** conserva un **% combinado 70/30**
     (`0.7·revisión + 0.3·(100 − riesgo_IA_medio)`) como resumen global; es el único lugar donde
     se combinan (decisión del usuario).

   `cumplimiento_revisión` **se normaliza por tamaño** (decisión del usuario en esta sesión): la
   definición vieja `100 − total·3` llegaba a 0 con solo 34 hallazgos, así que una tesis real
   (100+) quedaba muerta. Nueva definición ÚNICA (`lib/informeRevision.ts`, sustituye la actual
   `cumplimiento(total)`):

   ```
   cumplimiento(hallazgos, párrafos) = max(0, min(100, 100 − 200 · hallazgos/párrafos))
   ```

   Sin párrafos ⇒ 100. Cambia su firma de `(total)` a `(total, parrafos)`, así que sus
   consumidores (`ReviewGate`, `useReviewWorkbench` → `metrics.compliance`) pasan el total de
   párrafos. Sus tests (`cumplimiento(0)=100`, `(1)=97`, `(40)=0`) se reescriben.
4. **IA normalizada 0–100** en un único punto (límite de la API). Se corrige el bug de doble
   escala: hoy `Step5AuditIAWizard.tsx:65` prefiere `reviewResult.ai_indices.score` (0–1, campo
   que `runAIReview` nunca setea) y `ReviewGate.tsx:147` re-adivina la escala con
   `aiScore <= 1 ? aiScore*100 : aiScore`.
5. **Fuente única de IA:** el perfil por párrafo (`lib/aiPerfil.ts`, `construirPerfilIA`, ya
   implementado). La Sala de IA (L0 y L1) y el % de IA de la puerta derivan de ahí; no se
   vuelve a sintetizar un score a partir de conteos de hallazgos.
6. **Gráficos:** `@visx/*` (control total, sin dependencia pesada). Hoy no hay ninguna librería
   de gráficos instalada.
7. **La IA es de solo lectura:** el motor probabilístico solo permite «Marcar para revisar»,
   nunca «Aceptar» (regla ya vigente).
8. **Fases-artefacto vs fases-prosa (decidido con el usuario).** Un analizador propio (REV-L2)
   solo vale la pena cuando la fase contiene un **artefacto enumerable**, revisable ítem por ítem
   con reglas objetivas. Por eso:
   - **Analizador propio:** **Objetivos** (lista general/específicos, Bloom, medibilidad,
     jerarquía) — el único, porque el nivel Bloom y la jerarquía no se ven en una revisión
     párrafo a párrafo.
   - **Menú general filtrado por fase** (REV-L1, sin menú propio): **Método, Introducción, Marco
     teórico, Conclusiones, Resumen** y los **H1 sin reconocer** (p. ej. «Desarrollo»), que son
     prosa mezclada donde aislar la fase no aporta.
   - **Referencias se revisa en su propia fase** (`Step5ReferencesWizard`), no en REV-L0. El
     usuario: «referencias sacalo de acá, eso es tarea de otra fase».

---

## 4. Inventario de superficies (esqueleto)

| Superficie | Estado | Viene de | Va a |
|---|---|---|---|
| **UI 0** · Puerta / landing (`ReviewGate`) | **APROBADA** | rail / Paso 5 | «Empezar revisión» → REV-L0 · «Ver mapa de IA» → IA-L0 |
| **IA-L0** · Sala de IA, vista general | **APROBADA** | botón «Ver mapa de IA» | tocar una sección → IA-L1 |
| **IA-L1** · detalle de una sección (H1) | Aprobada | IA-L0 (fila de sección) | volver a IA-L0 |
| **Extra** · vista previa del documento con manchas | Aprobada (concepto) | botón en IA-L0, en el hueco del «pico» | cerrar → IA-L0 |
| **REV-L0** · Sala de Revisión, panorama (v3: dashboard con calificación, motores, Objetivos con gráfico Bloom y fases en gráfico de columnas) | **APROBADA** | «Empezar revisión» | un motor o una fase → REV-L1; Objetivos → REV-L2 |
| **REV-L1** · corrección de un motor/fase (texto delante, corrección al lado) | Aprobada | REV-L0 (fila de motor o columna de fase) | «‹ Menú general» → REV-L0 |
| **REV-L2** · Analizador de objetivos | Aprobado | REV-L0 (panel Objetivos) | «‹ Sala de Revisión» → REV-L0 |
| Referencias | Fase propia | — | `Step5ReferencesWizard` (fuera de REV-L0) |

Componentes a **retirar** al implementar (hoy desmontados o a sustituir): `AiHierarchy.tsx`,
`AiProfile.tsx` + `aiProfile.css`, `AiChapterFocus.tsx`, `ReviewWorkbench.tsx` (versión
«basura»), y los ya huérfanos `ReviewMinimap`, `EngineGroupCard`, `FindingDetail`,
`FindingAccordion`, `BloomPanel`, `AiMosaic` + `lib/aiMosaic.ts`, `ReviewStrip`. Se decide caso
a caso en la implementación qué se borra y qué se reusa.

---

## 5. Especificación por UI

### UI 0 — Puerta de Fase 5 (UI inicial) · **APROBADA**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-0-puerta-fase5.html`
**Viene de:** tocar la Fase 5 en el rail / wizard.
**Va a:** «Empezar revisión» → REV-L0 · «Ver mapa de IA» → IA-L0 · «Reanalizar documento» → re-scan.

**Razones (decisión del usuario: «puerta limpia»):** un solo % combinado y dos entradas grandes;
se quita la matriz fase×motor duplicada (esa vive en REV-L0). Es el **único lugar** donde
revisión e IA se combinan (70/30).

**Contenido:**

1. **Título** «Paso 5 · Revisión & IA» + nota «Revisión e IA se combinan solo aquí. Cada una tiene
   su propia sala.»
2. **Hero (2 col):**
   - Izquierda: **Salud del documento** con el **% combinado 70/30** en grande, coloreado por
     banda (§6), y sus **dos componentes** en barras (`Revisión · 70%` accent, `IA · 30%`
     violeta) con la fórmula `0,7·revisión + 0,3·IA`.
   - Derecha: **personaje humano** (señor gordito: morena, pelo desordenado y levantado, camisa
     celeste con escote discreto, parche en un ojo; SVG en el estilo de `EditorialMascot`) + globo
     con la frase de la banda. **Personaje nuevo → entra al plan.**
3. **Dos entradas sin card** (grid 2 col separadas por un divisor; el usuario: «no me gustan las
   cards»), cada una con icono, título y **chips de métricas** (no texto plano: «se ve feo como
   texto plano»):
   - «Empezar revisión» → REV-L0; chips: `12 por revisar`, `89% calificación`, `4 motores`.
   - «Ver mapa de IA» → IA-L0; chips: `41 marcados`, `78% voz humana`, `312 párrafos`.
4. **Pie:** «Reanalizar documento».
5. **Estado vacío:** «Aún no hay una revisión» + «Analizar documento»; «Ver mapa de IA»
   deshabilitado hasta que haya marcados.

**Mapeo de datos:**

| Elemento | Expresión |
|---|---|
| % combinado | `0.7·cumplimiento(hallazgos, párrafos) + 0.3·(100 − riesgo_IA_medio)` (§3.3) |
| Color del % y voz | `mascotaFrases.frasesRevision` (§6) |
| Chips de revisión | `reviewItems(...).length`, `cumplimiento(...)`, nº de motores con hallazgos |
| Chips de IA | `construirPerfilIA(...)` (`enAlerta`, `vozHumana`, `total`) |

### UI 1 — Sala de IA · vista general (IA-L0) · **APROBADA**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-1-sala-ia-l0.html`
**Viene de:** botón «Ver mapa de IA» de la puerta.
**Va a:** al tocar una fila de sección → IA-L1 (detalle de ese H1). Botón «Volver» → puerta.

**Razones del diseño acordadas con el usuario:**

- Una **sola superficie** con divisiones finas; **sin tarjetas anidadas** (el usuario rechazó
  «abusar de las cards»).
- **Ancho completo en 2 columnas invisibles:** izquierda = panorama; derecha = mascota + dato.
- La IA se pinta con la **rampa violeta del motor IA** (`--ia-nivel-1..4`), un solo canal
  (intensidad); el texto carga sección, conteo y categoría.
- Se **eliminó** la lista inferior que repetía las mismas secciones. La «salud 70/30» (revisión
  + IA) se moverá a la **Sala de Revisión**, para que la Sala de IA sea 100 % IA.

**Contenido:**

1. **Barra superior:** título «Sala de IA», subtítulo «Detector probabilístico · solo marcar
   para revisar, nunca edita», botón «Volver».
2. **Cabecera (2 columnas):**
   - Izquierda — «Voz humana del documento»: **número grande** (`vozHumana = 100 −
     rigidezMedia`, 0–100), el riesgo medio al lado, **reparto de párrafos por nivel** (barra
     apilada de 4 segmentos + leyenda con conteos) y **cifras**: párrafos analizados, en
     alerta, y (ver *Datos pendientes*) la confianza media.
   - Derecha — **mascota editorial** (`EditorialMascot kind="reference"`, cara curiosa) con un
     **globo que da un dato**: proporción de párrafos en sospecha y la sección pico.
3. **Tabla «Riesgo por sección (H1)»** — una fila por H1, ordenada por riesgo descendente.
   Columnas:
   - **Sección** (nombre + nº de párrafos y en alerta; chip **FOCO** en la peor).
   - **Reparto**: mini-barra fija de 4 segmentos por banda (no un cuadrito por párrafo: escala
     a documentos de miles de párrafos).
   - **Promedio**: barra del score medio de la sección (`rigidezMedia` de la fila).
   - **IA**: el porcentaje medio, en la tinta violeta del motor.
   Filas clicables → IA-L1.

**Mapeo de datos (fuente única):** todo sale de `construirPerfilIA(reviewResult.paragraphs,
elements)`:

| Elemento | Expresión |
|---|---|
| Voz humana (número grande) | `perfil.vozHumana` |
| Riesgo medio | `perfil.rigidezMedia` |
| Reparto (barra + leyenda) | `perfil.porBanda` → conteos por banda |
| Párrafos analizados | `perfil.total` |
| En alerta | `perfil.enAlerta` (banda alta + crítica) |
| Sección pico (mascota) | `perfil.filaMasRigida` |
| Fila de sección · promedio | `fila.rigidezMedia` |
| Fila de sección · reparto | `fila.porBanda` |
| Fila de sección · nº párrafos / en alerta | `fila.parrafos.length` / `fila.porBanda[2]+fila.porBanda[3]` |

**Bandas y vocabulario (a unificar):** el código ya usa `BANDAS_IA` con cortes **20 / 50 / 75**
y etiquetas **Baja / Media / Alta / Crítica** (`lib/aiPerfil.ts:5-20`). El mockup usó «Sin
indicios / Bajo / Medio / Alto». **Decisión abierta:** alinear el texto de la UI al vocabulario
existente o renombrar `BANDAS_IA`. No usar dos vocabularios.

**Datos pendientes (bloquean la implementación de la UI 1):**

- **«Confianza media»**: hoy el detector de IA **no** expone una confianza por párrafo
  (`analyze_ai_risk` devuelve `score` 0–1 y `category`). Opciones: (a) el backend agrega un
  campo de confianza al detector; (b) se reemplaza la cifra por otra con fuente real, p. ej.
  «% de párrafos en banda alta/crítica» o «sección con más párrafos en alerta».
- **Umbral de alerta:** `aiPerfil.ts` marca alerta en **score ≥ 50**, pero `lib/auditItems.ts`
  sigue en `AI_PARAGRAPH_THRESHOLD = 45`. Debe quedar **un solo número**.

---

### UI 2 — Sala de IA · detalle de una sección (IA-L1) · **APROBADA**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-2-sala-ia-l1.html`
**Viene de:** tocar una fila de sección en IA-L0.
**Va a:** «‹ Sala de IA» → IA-L0. Solo lectura: **marcar para revisar**, nunca «Aceptar».

**Razones del diseño acordadas con el usuario:**

- **Lista lateral** para elegir el párrafo (necesaria) + **detalle** a la derecha. El usuario
  la sigue «viendo rara»; se reduce el ruido: **cada fila lleva el color de su banda** en una
  barra a la izquierda y se quita la insignia «alto/medio» redundante (el color + el % ya lo
  dicen).
- **Escala (H1 gigante):** un H1 puede tener miles de párrafos marcados. La lista se **agrupa por
  H2** (colapsable, con conteo y mini-reparto), lleva **filtros por banda** (Todos/Alto/Medio/Bajo)
  y **virtualiza** las filas; por defecto muestra el peor subconjunto + «Ver todos». Un H1 entero
  marcado es un dato agregado, no miles de filas a la vista. **Aprobado.**
- El **«por qué» es dato real**, no una frase genérica: se leen los `findings` del detector.
- **«Reformular con IA»** se ejecuta **solo al presionar** el botón (no automático) y deja una
  propuesta **editable**; nunca reemplaza el texto por sí sola.
- **Mascota con frase sarcástica según el %** (biblioteca nueva, ver §6).

**Contenido:**

1. **Barra superior con contexto padre:** «‹ Sala de IA», nombre de la sección, conteos
   (párrafos, marcados, riesgo medio) y el reparto de la sección.
2. **Columna izquierda — lista de párrafos marcados, agrupada por H2:**
   - **Filtros por banda** (`Todos / Alto / Medio / Bajo`) con conteos.
   - **Grupos H2 colapsables** (chevron + título + conteo + mini-reparto), ordenados por riesgo.
   - Cada fila: barra de color de banda, nº de párrafo, `%` y excerpt con la frase señalada resaltada.
   - **Virtualizada**: solo pinta las filas visibles; «Ver todos» por grupo.
3. **Columna derecha — detalle del párrafo elegido:**
   - Cabecera: página, categoría, **% grande**, y **mascota + globo** con la frase de la banda.
   - **«Por qué lo marcamos»**: lista de motivos (`findings[].detail`).
   - **«Texto original»**: el párrafo con las frases marcadas en violeta (`findings[].phrase`).
   - **«Cómo corregirlo · tu voz de autor»**: textarea + **Reformular con IA** + **Marcar para
     revisar** + Copiar; nota de que nada se aplica solo.
4. **Pie:** párrafo anterior / siguiente.

**Mapeo de datos (fuente única):**

| Elemento | Expresión |
|---|---|
| Contexto de sección | `fila.titulo`, `fila.parrafos.length`, `fila.porBanda`, `fila.rigidezMedia` |
| Lista lateral | `fila.parrafos` (`score`, `excerpt`), orden por `score` desc |
| Color de banda de cada fila | `bandaDe(score)` → `--ia-nivel-1..4` |
| `%` grande / categoría | `parrafo.score` / `parrafo.categoria` (`ai_category`) |
| «Por qué lo marcamos» | `AIReviewParagraph.findings[].detail` (**real**; hoy se ignora) |
| Frases a subrayar en el texto | `AIReviewParagraph.findings[].phrase` |
| «Reformular con IA» | endpoint LLM **a definir**, disparado solo al presionar |
| «Marcar para revisar» | acción existente del store (nunca «Aceptar») |

**Datos pendientes:** `collectAuditItems` descarta hoy los `findings` del párrafo y usa un
`detail` genérico (`lib/auditItems.ts:275`); la UI 2 debe leer `reviewResult.paragraphs[].findings`
directamente. El endpoint de reformulación con LLM no existe todavía.

---

### UI 3 — Vista previa del documento con manchas (función extra) · **APROBADA**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-3-vista-previa-manchas.html`
**Entrada (viene de):** botón **«Ver en documento»** en IA-L0, en el hueco donde estaba el «pico»
(columna izquierda del resumen).
**Va a:** cerrar → vuelve a IA-L0; tocar un párrafo → detalle IA-L1.

**Qué es:** no una lista de texto, sino el **documento tal cual sale** (hojas paginadas, tipografía
y numeración reales) con las **manchas** de IA encima.

**Contenido:**
- **Miniaturas de páginas** a la izquierda, con su densidad de mancha; saltar a página.
- **Hojas reales**: cada párrafo **teñido por banda** + `%` al margen; los sin indicios quedan limpios.
- **Leyenda** de bandas y **toggle «Mostrar manchas»**.
- **Solo lectura** (la IA solo se marca para revisar).

**Reutilización:** el mismo lienzo de hojas que exporta (`PaperCanvas`) con una capa de manchas
encima, para que «tal cual sale» sea el mismo render.

---

### UI 4 — Sala de Revisión · panorama (REV-L0) · **APROBADA**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-4-sala-rev-l0.html`
**Viene de:** botón «Empezar revisión» de la puerta.
**Va a:** tocar un motor o un panel de fase → REV-L1 filtrado por ese motor/fase; el panel
**Objetivos** → REV-L2 (analizador). «‹ Volver» → puerta.

**Razones del diseño acordadas con el usuario:**

- Reemplaza la actual «versión basura» (`ReviewWorkbench`). **Superficie única** con divisiones
  finas, sin tarjetas anidadas.
- **Solo navegación**: aquí no se aceptan hallazgos (eso vive en REV-L1); así la pantalla no
  acumula botones muertos.
- El **% de revisión vive aquí**; el índice de IA **no se mezcla** (vive en la Sala de IA).
- **Portada** aparece como fila bloqueada («se mide, no se escribe»), coherente con `read_only`.
- Mascota con un dato duro (el motor que más baja).

**Contenido:**

1. **Barra superior:** «Sala de Revisión», subtítulo «Motores objetivos · aceptar o aceptar
   todas, nunca borra tu texto», botón «‹ Volver».
2. **Calificación de revisión (2 columnas):**
   - Izquierda: **% grande** = **solo revisión** (`cumplimiento(hallazgos, párrafos)`), con su
     barra. **Sin** componente de IA (el usuario: «solo pon el % de revisión, el de IA va en otro
     lado»).
   - Derecha: **mascota + globo** con el motor que más pesa.
3. **Motores objetivos** — una fila por motor (Ortografía, Redacción, Estructura, Citas):
   icono, conteo, **mezcla de severidad** (`critical | high | medium | low`) y nº de secciones.
   Fila clicable → REV-L1 de ese motor.
4. **Fases del documento** — **gráfico de columnas** (0–10) que usa el ancho: una columna por
   fase (Introducción, Marco teórico, Método, Resultados, Discusión, Conclusiones, Resumen),
   barra coloreada por banda, valor encima y nombre debajo; columnas clicables → REV-L1 de esa
   fase. El usuario rechazó las listas y los paneles compactos: «odio las listas, esas fases van
   usando el ancho», «se ven raras así», «un gráfico más interesante».
5. **Objetivos — aparte, no se mezcla.** Panel dashboard propio (fuera del gráfico de fases) con
   **gráfico de nivel Bloom** (eje 1–6: Recordar…Crear; el general como ancla y los específicos
   E1/E2 como marcas), KPI de medibles/variable, y botón **«Analizar objetivos ›»** → REV-L2. El
   usuario: «objetivos van aparte, no se mezclan» y «ponle otro gráfico, que se vea como un
   dashboard».
6. **Portada** — panel bloqueado («se mide, no se escribe»), sin medidor ni acciones.
7. **Leyenda de calificación** (verde ≥9,0 · azul 8,0–8,9 · ámbar 6,0–7,9).
8. **Color del % y voz de la mascota** según la calificación (verde ≥90 · azul 80–89 · ámbar
   60–79 · rojo <60): el número grande cambia de color y la mascota dice su frase de
   `mascotaFrases.frasesRevision` (§6).

**Mapeo de datos (fuente única):**

| Elemento | Expresión |
|---|---|
| Calificación de revisión | `cumplimiento(total, parrafos)` (nueva firma, **solo revisión**) |
| Conteo por motor | `items.filter(it => it.category === motor).length` |
| Mezcla de severidad | agrupar por `AuditItem.severity` |
| Secciones por motor | nº de fases distintas con ese motor |
| Filas por fase | `matrizFaseMotor(items, fasePorElemento(elements, items))` (`lib/informeRevision.ts`) |
| Peor motor de la fase | argmax de `fila.counts` |
| Bloqueo de portada | `fila.protegida` (`phase === 'portada'`) |

La lista `items` es la MISMA de `lib/auditItems.ts` que alimenta el rail (`lib/railPending.ts`):
esta pantalla no re-deriva conteos.

### UI 5 — Sala de Revisión · corrección (REV-L1) · **APROBADA**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-5-sala-rev-l1.html`
**Viene de:** tocar una fila de motor o una columna de fase en REV-L0 (menú general).
**Va a:** «‹ Menú general» → REV-L0.

**Razones del diseño acordadas con el usuario:** el texto va **delante** y la corrección **al
lado** (sin listas largas, que el usuario odia); índice compacto de puntos para saltar. El usuario
aprobó: «sí me gusta déjalo». Aclaró además que **REV-L0 es el menú general de revisiones** (no se
diseña otro menú; REV-L1 es la pantalla de corrección a la que lleva).

**Contenido:**

1. **Barra superior:** «‹ Menú general», título del motor/fase, sub-línea (conteo + «motor
   objetivo»), y **chips de filtro** por subtipo con conteo (p. ej. Todas · 5 / Faltas · 3 /
   Acentos · 2).
2. **Izquierda — el texto delante:** el párrafo real (sección + página) con el problema marcado
   inline; reutiliza `ReadingText` (único dueño de los resaltados).
3. **Derecha — la corrección al lado:** severidad, **Qué pasa** (explicación), **Propuesta** con
   alternativas elegibles, y acciones.
4. **Acciones:** motor **objetivo** → **Aceptar / Aceptar todas**; motor **IA** (probabilístico)
   → **solo «Marcar para revisar»**; **portada** (`read_only`) → **sin botón de aceptar**.
5. **Índice compacto** de puntos (1..N; hechos en verde) + pie anterior/siguiente con progreso.
6. **Mascota** (`ruler`) con frase de progreso.

**Mapeo de datos (fuente única):**

| Elemento | Expresión |
|---|---|
| Lista de puntos | `reviewItems(...)` filtrado por `category` (motor) o `phase` (fase) |
| Chips de filtro | agrupar por `AuditItem.subtype` |
| Texto con marcas | `AuditItem.originalText` + `ReadingText` |
| Qué pasa | `AuditItem.detail` / `summary` |
| Propuesta | `AuditItem.suggestedText` |
| Aceptar / Aceptar todas | acciones de `useReviewWorkbench` (motor objetivo) |
| Marcar para revisar | acción de IA (nunca acepta) |
| Portada | `AuditItem.readOnly` ⇒ sin aceptar |

**Reglas vigentes que respeta:** dos canales sincronizados (subrayado inline `ReadingText` +
burbuja `WhatsAppComment`, ambos desde `buildCommentContext`); la lista es la MISMA de
`lib/auditItems.ts` que alimenta el rail.

---

### UI 6 — Analizador de objetivos (REV-L2) · **APROBADO**

**Mockup:** `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/ui-6-analizador-objetivos.html`
**Viene de:** bloque **Objetivos** en REV-L0 (botón «Analizar ›»).
**Va a:** «‹ Sala de Revisión» → REV-L0. Motor **objetivo** ⇒ ofrece **Aplicar** (y «Aceptar todas
las propuestas»); no es el detector de IA.

**Razones del diseño acordadas con el usuario:**

- El **nivel cognitivo (Bloom) se conserva** («el nivel cognitivo sí déjalo y el gráfico me
  encantó»): escala 1–6 con los objetivos situados y la línea del nivel exigido.
- La **cabecera lleva jerarquía visual**: pill de estado, titular grande («2 de 3 objetivos no
  cumplen…») y **3 bloques numéricos** — el usuario rechazó el veredicto «plano texto».
- **General separado de específicos**: el general va en un bloque «ancla»; los específicos
  cuelgan de una guía y se numeran E1/E2, con la nota «derivan del general · su nivel no debe
  superarlo».
- Estilo: menos cards y más contraste (se refina con el estilo real al implementar).

**Contenido:** barra superior («‹ Sala de Revisión», «Aceptar todas las propuestas»); cabecera
(pill, veredicto, sublínea, stats `nivel del general`, `medibles`, `con variable`, mascota
`ruler`); escala **Bloom 1–6**; objetivo **general** como ancla; **específicos** agrupados con
verbo propuesto + alternativas y botones **Aplicar / Marcar para revisar**; chequeo de jerarquía.

**Mapeo de datos (fuente única frontend):**

| Elemento | Expresión |
|---|---|
| Objetivos + nivel + estado | `objetivosBloom(elements)` → `ObjetivoBloom` (`src/lib/contentReview.ts:639-670`, iface 538-556) |
| Veredicto / reglas | `reviewObjectives` (`contentReview.ts:150-244`): `objetivo_verbo_no_medible`, `objetivo_sin_infinitivo`, `objetivo_verbo_repetido`, `objetivo_nivel_mayor_que_general`, `objetivos_cantidad` |
| Nivel Bloom de un verbo | `bloomLevel(verb)` / `BLOOM_LEVELS` (`contentReview.ts:36-51`); nivel exigido `NIVEL_OBJETIVO = 4` |
| General vs específicos | `separarGeneralDeEspecificos` (`contentReview.ts:114-148`) |
| Aplicar propuesta | `reemplazarVerbo` (`contentReview.ts:625-631`) |

Equivalente backend **huérfano** (reutilizable): `audit_objective`, `audit_objectives_hierarchy`,
`find_bloom_level`, `BLOOM_VERBS`/`BLOOM_LEVELS` en `python/modules/proactive_auditor.py:67-79,
817-920`.

**Datos pendientes:** `BloomPanel.tsx`, `reviewObjectives` y `objetivosBloom` existen pero **ninguna
UI los monta** hoy. Decidir si REV-L2 consume el frontend (`contentReview.ts`) o el backend
(`proactive_auditor.py`); no duplicar la regla.

---

### UI 7 — Analizador de referencias · **DESCARTADA (fuera de REV-L0)**

El usuario: «referencias sacalo de acá, eso es tarea de otra fase». La revisión de **Referencias**
pertenece a su propia fase (`Step5ReferencesWizard`) y se retira de REV-L0. El mockup
`ui-7-analizador-referencias.html` queda solo como referencia de la idea (filtros por tipo de error
+ fila con corrección propuesta), reutilizable dentro de esa fase si se desea. Reglas APA
implicadas: `RULE_SCOPES['referencias']` (`python/modules/phase_scope.py:231-272`).

---

## 6. Biblioteca de frases de la mascota (NUEVO — entra al plan)

La mascota habla con una frase que **varía según el %**, en las dos salas. No existe hoy; hay que
crearla.

- **Archivo nuevo:** `src/lib/mascotaFrases.ts` (o `.json`) con dos mapas: `frasesIA` y
  `frasesRevision`.
- **Selección determinista** por `elementId`/índice (nada de `Math.random`, para que sea
  testeable y estable entre renders). Frases **cortas**, en español, **sin emojis**
  (`AGENTS.md` §1). Se muestran en el globo de `EditorialMascot`.
- **Regla de color del % (compartida por las dos salas):** verde ≥90 · azul 80–89 · ámbar 60–79 ·
  rojo <60. Aplica a la calificación grande y a las columnas de fase.

**Frases de Revisión** (banda = color del %):

- 90+ (sólida) → «Esto está sólido, sigue así.»
- 80–89 (buena) → «Vas bien, pero hay tela que cortar.»
- 60–79 (media) → «Esto pide una pasada en serio.»
- <60 (baja) → «Así no lo entregues.»

**Frases de IA** (bandas alineadas a `BANDAS_IA`, `lib/aiPerfil.ts:5-20`, cortes 20/50/75):

- 20–49 % (bajo) → «Hay un poco de IA en tu párrafo.»
- 50–74 % (medio) → «Hay un poco de párrafo en tu IA.»
- 75–100 % (alto) → «Lo copiaste tal cual, hermano.»
