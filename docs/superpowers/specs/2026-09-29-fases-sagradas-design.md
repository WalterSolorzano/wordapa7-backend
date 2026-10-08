# Fases sagradas — qué vive en cada pantalla

Fecha: 2026-09-29. Autor: sesión de corrección por fases.
Padre: `2026-09-29-plan-correccion-por-fases-design.md` (§8-bis).

Este documento responde una pregunta del usuario, textual:

> «Si yo fuera un estudiante universitario y pudiera resolver muchos problemas en
> automático, y cada fase es un super comodín, un área sagrada que se dedica solo
> a eso… ¿qué cosas deberían estar ahí? ¿qué controles deberían poder verse?…
> analiza y de ahí decides si 3 o 1».

No es un plan de implementación: es el **reparto** del que salen los planes. Cada
decisión de acá se ejecuta en la fase correspondiente (F3–F9).

---

## 1. El principio, en una frase

**Cada fase es un comodín: un área dedicada a UNA cosa, con sus propios
controles, y ningún control de otra fase se mezcla con los suyos.**

De ahí sale la prueba de pertenencia. Antes de dejar un control en una pantalla,
tres preguntas; si las tres no dan «sí», el control no va ahí:

1. **¿Un estudiante lo buscaría en ESTA pantalla?** (No «¿es útil?». Todo es
   útil. «¿Lo buscaría acá?».)
2. **¿Es de esta fase, o es de otra que ya existe?**
3. **¿Se puede resolver en automático en vez de pedirlo?** Si sí, no se pide: se
   resuelve y, si acaso, se muestra el resultado con su deshacer.

La consecuencia incómoda, y la que hay que aceptar: **una pantalla con pocos
controles es el éxito, no una pantalla a la que le falta algo.**

---

## 2. Estructura — la decisión 3 vs 1

### 2.1 Qué es el comodín

El trabajo de esta fase, en las palabras del estudiante: *«ordenar mi documento
como APA 7 sin abrir Word, y que me diga qué le falta».*

### 2.2 La prueba, aplicada

Con ese mandato, lo que un estudiante buscaría EN Estructura es:

| SÍ pertenece | Por qué |
|---|---|
| El **esqueleto**: los títulos, su nivel y lo que cuelga de cada uno | Es el eje: sin ver la forma, no hay nada que ordenar |
| **Corregir niveles** (promover / degradar) | Es LA acción de la fase |
| **Renombrar** un título | Es el mismo trabajo, un renglón más abajo |
| **Diagnóstico de la forma**: secciones obligatorias que faltan, títulos mal nivelados, capítulos desbalanceados o vacíos | Es lo que «me diga qué le falta» significa |
| **Insertar lo que falta** desde una plantilla APA 7 (una sección, un esqueleto entero) | Resuelve en automático lo que el diagnóstico detectó |
| **Ver el documento** (toggle), para leer el contexto de un título | Mirar la forma sin poder mirar el texto es adivinar |

| NO pertenece | A dónde va |
|---|---|
| El editor de prosa completo | Es Word. Acá solo se renombra. |
| Ortografía, frases de IA, tono | Revisión (F7) |
| Citas y referencias | Referencias (F6) |
| Leyendas de figuras y tablas | Figuras (F5) |
| Formato (interlineado, sangría, fuentes) | Es del lienzo / ajustes, no de la forma |

### 2.3 La decisión: **una sola superficie**

Los tres modos actuales (`Esquema Jerárquico` / `Revisor de Títulos APA 7` /
`Editor de Prosa`) no son tres trabajos: son **un trabajo con tres vistas de la
misma cosa**. Y dos de las tres violan la prueba de pertenencia —el «Revisor de
Títulos» repite el diagnóstico que el índice ya hace por nodo, y el «Editor de
Prosa» es Word.

Entonces: **1 superficie**, con el índice como eje y el documento como toggle, y
lo que hacían las otras dos pestañas convertido en **acciones del nodo**:

- promover / degradar → acción de la fila (ya existe en `FaltasApa7`/`InspectorRama`);
- renombrar → edición en línea del título;
- el «Revisor de Títulos» → el **diagnóstico por nodo** que ya se pinta en la fila
  y en el inspector de rama.

**La guarda `focoNoBarraElSelector.test.tsx` se reescribe, no se borra.** Esa
guarda existe por un defecto real: con el modo foco prendido, el índice quedaba
como callejón sin salida porque los otros destinos desaparecían. Con una sola
superficie no hay selector que perder, así que la guarda cambia de sujeto: pasa a
exigir que **toda acción siga alcanzable** (promover, renombrar, el toggle del
documento) en cualquier modo, incluido foco. Se reescribe CON el usuario cuando
esta fase se ejecute.

### 2.4 El caso Objetivos: la vista se adapta a lo que hay

Pedido textual: *«si son objetivos, que los presente bonito, no texto plano feo
con fuente fea; bien organizados, con su análisis de qué nivel es cada uno, qué
calidad le das, variantes… sugerencias de la IA»*.

Regla general: **cuando la rama seleccionada tiene un tipo reconocible, su vista
presenta ESE tipo**, no un volcado de párrafos. Para Objetivos:

- **general** y **específicos** separados — y la separación sale del documento
  (los H2 «Objetivo general» / «Objetivos específicos»), **no** de asumir que el
  primer párrafo es el general (que es lo que hace el código viejo, ver §4);
- cada objetivo con su **nivel de Bloom** (el verbo) y su **calidad**: ¿es
  medible?, ¿empieza en infinitivo?, ¿tiene relación con el general?;
- **variantes** por objetivo flojo, para que el estudiante elija en vez de
  redactar de cero;
- nada de esto es texto plano: es estructura con la tipografía de la casa.

---

## 3. Las otras fases

Mismo formato: el comodín, lo que entra, lo que no, y cómo se agrupa.

### F2 — Carga / Inicio
- **Comodín:** *«empezar mi trabajo»*.
- **Entra:** subir o elegir un `.docx`; recuperar una sesión; la identidad de la
  app. Nada más.
- **No entra:** ninguna configuración editorial (eso es Ajustes), ninguna
  estadística del documento (eso es Estructura/Revisión).
- **Agrupación:** un solo bloque de acción y, debajo, lo reciente en una lista
  plegable.
- **Pendiente:** el reinicio de la pantalla (F2) y la unificación de mascotas.

### F3 — Portada
- **Comodín:** *«que mi portada quede bien sin que se rompa la que ya tengo»*.
- **Entra:** elegir el diseño (carrusel) y editar los datos que van impresos.
  **Hecho:** la tira duplicada se borró y los campos se agruparon en secciones
  plegables (`Identificación`, `Institución y carrera` abiertas; `Docente y
  entrega` cerrada).
- **No entra:** el diseño de las otras fases ni el formato del cuerpo.
- **Pendiente:** que la miniatura sea el render real a escala (F3) y que la
  geometría salga de un solo módulo.

### F4 — Estructura
- Ver §2. Es la fase donde se toma la decisión.

### F5 — Figuras y tablas
- **Comodín:** *«que mis figuras y tablas cumplan APA 7»*.
- **Entra:** la lista de figuras/tablas (numeración, orden), la leyenda APA 7
  (Figura N / Tabla N / Nota), y el aviso de las que no tienen leyenda.
- **No entra:** el editor de imagen (recorte, distribución) — eso es una acción
  de la figura, no la fase; ni el texto que la referencia.
- **Dependencia:** necesita la geometría de F3 (misma hoja, misma escala).
- **Pendiente:** `ListaContextual` repite el párrafo anterior como «contexto».

### F6 — Referencias
- **Comodín:** *«que mis citas y mi lista estén completas y en APA 7»*.
- **Entra:** la lista con su contraste real contra el cuerpo (citadas / sin
  citar / huérfanas), resolver un DOI o una URL, y el estilo de cita.
- **No entra:** el formato del párrafo donde va la cita.
- **Pendiente:** el rediseño tipo Notion con contraste real (F6).

### F7 — Revisión
- **Comodín:** *«que me diga qué está mal en mi redacción y me deje arreglarlo»*.
- **Entra:** **un párrafo a la vez**, con el hallazgo y su acción. El rail y los
  chips de filtro por motor. Nada más.
- **No entra:** la estructura del documento (es F4) ni las referencias (F6); sus
  hallazgos llegan acá como hallazgos, no como pantallas.
- **Regla de botones (ya escrita en `AGENTS.md`):** motores objetivos →
  «Aceptar / Aceptar todas»; el detector de IA, que es probabilístico → SOLO
  «Marcar para revisar», nunca «Aceptar».
- **Pendiente:** los cuadrados de color sin leyenda; el «ya no está en el
  documento»; el contraste.

### F8 — Proyectos
- **Comodín:** *«trabajar varios archivos sin perder nada»*.
- **Entra:** la carpeta de trabajo, los `.docx` del proyecto, las figuras
  asociadas. Abrir, agregar, quitar.
- **No entra:** nada del documento abierto.
- **Pendiente:** el error al abrir (reproducir en vivo) y migrar
  `projectImages` a `asset_id` antes de tocar el modelo `Proyecto`.

### F9 — Exportar
- **Comodín:** *«sacarlo y mandarlo»*.
- **Entra:** **columna única alineada a la izquierda**, icono → título → una
  línea ≤50 ch → dos botones pegados (sólida + fantasma). Formato, opciones y
  vista previa bajo toggle.
- **No entra:** ningún resumen de hallazgos ni estadística (eso ya se vio).
- **Pendiente:** que no rompa en pantallas chicas.

### F10 — IA
- **Comodín:** *«que me ayude sin mentirme»*.
- **Entra:** el copiloto conversacional y las auditorías de fondo, con su estado
  visible («corriendo / terminó / falló»).
- **No entra:** decisiones de formato o estructura sin que el usuario las vea.
- **Pendiente:** la rampa de nivel de IA con cuatro rojos que no se distinguen.

---

## 4. Hallazgos de esta sesión (para el plan, no para el código todavía)

1. **`src/lib/contentReview.ts` no lo usa ninguna UI.** `reviewContent` solo se
   importa desde su test. Es una de las pantallas viejas que el usuario quiere
   reemplazar por algo útil; sirve como **base** del análisis de Objetivos de
   §2.4, pero no como pantalla tal cual.
2. **Bug real en `contentReview.ts:85-99` (`collectSections`).** El recorrido
   **descarta los encabezados** (`continue`) y vuelca todo lo que cuelga de
   «objetiv*» en un solo saco. Después `reviewObjectives` **asume que el primer
   elemento es el general** (`items.length - 1`, línea 182). Con H2 explícitos
   («Objetivo general» / «Objetivos específicos») la estructura se pierde y la
   cuenta de específicos puede mentir. La separación general/específicos tiene que
   salir del documento, no de una suposición.
3. **El bug que reportaste («H1 con todo, H2 vacíos») no lo pude reproducir sin
   tu documento.** `construirJerarquia` asigna la prosa al último encabezado
   abierto, así que un H2 solo queda vacío si su contenido **va antes** o si el
   contenido no es prosa para el modelo. Dos causas candidatas, en orden:
   - los párrafos de los objetivos vienen **antes** de los H2 en el documento;
   - el backend los marca con un `type` que no está en `ES_PROSA`
     (`paragraph|bullet|numbered_list|block_quote`).
   **Lo que necesito:** el `.docx` (o la captura de la rama «Objetivos» con el
   árbol abierto). Con eso lo cazo en una pasada.

---

## 5. Consecuencia: cómo se cambia una guarda

Ninguna de estas decisiones se ejecuta borrando un test. El protocolo:

1. el test que se va a cambiar **consignaba la conducta vieja** (no un defecto
   escondido): se dice cuál y por qué en el mensaje del commit;
2. el test nuevo **protege la conducta que reemplaza**, no solo comprueba que el
   viejo desapareció;
3. si la guarda nació de un defecto real (como `focoNoBarraElSelector`), el test
   nuevo cubre el defecto original por otro camino.

Este documento decide **qué** cambia. El **cómo** va en el plan de cada fase.

---

## 6. Inventario de controles por fase (leído del código, 2026-09-29)

Esto es lo que hay HOY en pantalla, control por control, y la decisión de cada
uno. Sale de leer el código, no de recordarlo. La decisión de **forma** de cada
superficie se toma con la skill `impeccable` al ejecutar su fase.

### Estructura
| Control de hoy | Decisión |
|---|---|
| Pestañas `Esquema Jerárquico` / `Revisor de Títulos APA 7` / `Editor de Prosa` (`App.tsx:152`) | **Se van.** Un trabajo, no tres (ver §2.3); el «Revisor» es el diagnóstico por nodo y el «Editor de Prosa» es Word |
| `Promover`, `Subir`, `Bajar`, `Renombrar`, `Preguntarle a la IA` (`InspectorRama`) | **Se quedan como acciones del nodo**, con su alcance «(esta rama)» pintado |
| Toggles `ver el mapa` / `ver el documento` (dentro del índice) | **Se quedan**: son la vista del mismo trabajo, no otro trabajo |
| `Faltas de APA 7` (columna derecha) | **Se queda**: es el diagnóstico de la forma, y ya dice que no tiene la lista de fases obligatorias |
| ~Pulso de 5 celdas~ | **Borrado** (esta sesión): cada dato duplicaba algo que vive donde se acciona; palabras y balance no tienen acción |

### Portada
| Control de hoy | Decisión |
|---|---|
| ~Tira de estrategias + «Usar este diseño y Continuar»~ | **Borrada**; el carrusel es la única superficie |
| 8 campos sueltos del editor | **Agrupados** en 3 secciones plegables (`Identificación` e `Institución y carrera` abiertas; `Docente y entrega` cerrada) |
| `Actualizar portada` + `Continuar a Estructura` | **Se quedan** al pie, pegados |

### Figuras, tablas y ecuaciones
| Control de hoy | Decisión |
|---|---|
| `Leyendas IA para todo`, `Colapsar lista`, `Buscar figura`, `Limpiar búsqueda`, `Solo pendientes` | **Se quedan**, agrupados en una sola fila de trabajo (no 5 controles sueltos) |
| Selector de estilo académico de tabla | **Se queda** |
| `Abrir el inspector de la figura` | **Se queda**: nombrar la acción es lo que evita que tocar una figura te saque de la pantalla |
| `Figura anterior` / `Figura siguiente` | **Se quedan** |
| (no existe) **Ecuaciones** | **Se agrega** acá: la fase pasa a «Figuras, tablas y ecuaciones». Mientras tanto el editor vive como destino de selección en el panel derecho |

### Revisión
| Control de hoy | Decisión |
|---|---|
| `Filtros por motor` (chips) + `Hallazgos por motor` | **Se quedan**: son el eje de la fase, y el conteo sale de una sola derivación |
| `Filtrar por fase del documento` + `Todas las fases` | **Se queda** como línea de contexto, no como eje de navegación |
| `Página anterior` / `Página siguiente` / `Siguiente hallazgo` | **Se quedan**: es el «un párrafo a la vez» |
| `Modo de vista` | **A revisar**: si es un modo que solo cambia el ancho, se va |
| `Aparición anterior` / `Siguiente aparición` | **Se quedan** |
| `Minimap de páginas` | **No volver** a la lectura secuencial con tres columnas (`AGENTS.md` §1) |

### Referencias
| Control de hoy | Decisión |
|---|---|
| `Nueva referencia` **(tres veces: líneas 360, 411 y 610)** | **Queda una.** Tres entradas al mismo formulario es el caso de manual de «mil botones» |
| `Auditar citas` | **Se queda**: es la acción de la fase |
| `Buscar y extraer metadatos` (DOI/URL) | **Se queda**, dentro de un desplegable de «Agregar» |
| `Completar`, `Guardar cambios`, `Guardar en la bibliografía` | **Un solo guardado.** Tres verbos para lo mismo se leen como tres cosas |
| `Copiar cita en texto`, `Ver en la hoja` | **Se quedan** como acciones de una referencia |
| `Continuar a Auditoría` | **Se queda** como salida del paso |
| `Detalles de referencia` (panel derecho) | **Se queda** — es una selección con destino |

### Exportar
| Control de hoy | Decisión |
|---|---|
| `MESA DE ENTREGA` + `Ajustes de exportación` + `Previsualización en Vivo` (tres bloques) | **Se rehace** a la forma de `AGENTS.md` §1: columna única a la izquierda, formato/opciones/vista previa bajo toggle |
| `Selector de formato`, `PDF Compilado`, `Formato Oficial Editable` | **Se quedan** bajo el toggle de formato, con una línea ≤50 ch cada uno |
| Resumen de hallazgos / estadísticas | **No se repiten acá** (ya se vieron en su fase) |

### Carga / Inicio
| Control de hoy | Decisión |
|---|---|
| `Seleccionar o arrastrar documento .docx` | **Se queda**: es la acción del comodín |
| `Nuevo documento en blanco` | **Se queda**, secundaria |
| Tabla de recientes (`Nombre` / `Modificado`) | **Pasa a lista plegable**: no compite con la acción |
| `Cerrar error` | Se queda (es el estado de error) |

---

## 6-bis. Fuera de las fases: dónde más aplica «pocos controles, categorizados» (revisado 2026-09-29)

Superficies que **no** son una fase del editor: barra, menús, modales y ajustes.
Mismo principio de §6 y de `plan-correccion-por-fases-design.md` §8-bis.2: si una
UI tiene N controles sueltos, se agrupan en dos categorías declaradas, no en N
botones.

Revisado contra el código de hoy. Todo lo que ya estaba hecho o no aplicaba se
borró de la lista (queda anotado en §6-bis.4 para que nadie lo re-descubra).
Los tres puntos que seguían abiertos **se ejecutaron el 2026-09-29**.

### 6-bis.1 Módulos APA — el caso exacto de «N controles, dos categorías» (HECHO)

Lo que había:

- `src/components/toolbar/APAModuleToggles.tsx` — cinco módulos en checklist
  plano: Párrafos & Sangrías, Jerarquía de Títulos, Tablas APA 7, Figuras &
  Ilustraciones, Referencias & Fuentes.
- `src/components/quick/ExpressQuickTransformModal.tsx` — los mismos alcances
  otra vez, con otra taxonomía (fusionaba todo el texto en un solo ítem).
- Ninguna constante compartida.

**Y un defecto que el inventario destapó:** el motor solo entiende tres alcances
(`VALID_SCOPES = ("texto", "tablas_imagenes", "bibliografia")` en
`python/modules/scoped_apply.py:29`) y **rechaza** cualquier otro con
`ValueError`. Los cinco módulos finos no eran más control: apagar «Párrafos &
Sangrías» mandaba `["titulos", …]`, el backend lo rechazaba y
`documentSlice.exportDocx` caía al formato completo con un aviso. La pantalla
prometía una parte y el `.docx` salía entero.

Decisión ejecutada: **una** fuente declarada, `src/lib/modulosApa.ts`, con los
**tres** módulos del motor en dos categorías.

| Categoría | Módulo | Alcance del motor |
|---|---|---|
| Texto | Texto y títulos | `texto` |
| Objetos y fuentes | Tablas y figuras | `tablas_imagenes` |
| Objetos y fuentes | Referencias y fuentes | `bibliografia` |

Se unificó del lado del motor, no de la pantalla: un control más fino que el
alcance real es una mentira con forma de checkbox. La consumen
`APAModuleToggles`, `ExpressQuickTransformModal` y —para no volver a mandar
alcances crudos— `documentSlice.exportDocx`, que ahora traduce con `alcancesDe`
antes de llamar a `scopedApply`. Misma regla que `RULE_SCOPES`
(`python/modules/phase_scope.py`): el dato se declara una sola vez.

### 6-bis.2 Menú de desborde de la barra (HECHO)

`ToolbarOverflowMenu.tsx` tenía ocho entradas y dos paneles inline separados por
tres `Separador` sin nombre: nada decía qué era «documento» y qué era «app».
Ahora son dos grupos con nombre —**Documento** (Inicio · Deshacer · Rehacer ·
Copiar PDF para WhatsApp) y **Sistema** (Puntuación APA · Módulos APA ·
Complemento de Word · Actualización · Tema · Ajustes)—, cada uno con
`role="group"` y `aria-label`. El panel de módulos se quedó inline y etiquetado:
convertirlo en un popover dentro de un popover habría sido peor que el defecto.

### 6-bis.3 Configuración de formato en Inicio (HECHO)

`Step0QuickStart.tsx` repetía en la portada de Inicio la misma configuración de
Ajustes: un **segundo** selector de perfil (además del atajo de la barra) y el
tipo de portada, que ya viven en Ajustes → Documento y Ajustes → Formato. El
bloque se borró; el atajo de perfil del primer paso se queda, que es lo que sirve
antes de subir un documento. Mismos datos, un solo lugar de edición.

### 6-bis.4 Ya hecho — no volver a inventariar

Revisado contra el código de hoy; **borrado** de la lista de candidatos.

| Superficie | Por qué no aplica |
|---|---|
| `inspector/ImageEditPanel.tsx` | Ya tiene cuatro pestañas (`:385-389`): Formato · Texto · Estilo · Revisión. Categorizado. |
| `chat/DocumentAIChat.tsx` | Ya tiene dos pestañas y chips por categoría (Todas · Figuras · Tablas, `:660-709`). |
| `project/ProjectFolderModal.tsx` | Ya está partido en «Sección de Documentos» y «Sección de Recursos e Imágenes», cada una con su propio agregar (`:250`, `:357`). |
| `layout/FileMenu.tsx` | Sidebar de cinco páginas más secciones nombradas («Acciones rapidas», «Estructura del documento»). |
| `settings/*` | Hub de cinco pestañas; ningún tab pasa de cuatro botones. Formato ya son siete secciones plegables. |
| `validator/ValidatorView.tsx` | Los botones son acciones por fila (`Ir al documento`, sugerencia IA), no un volcado de controles. |
| `canvas/InlineAILens.tsx` | Una barra contextual de cuatro acciones; es el patrón correcto. |
| `wizard/CoverStrategyCard.tsx` | Es una tarjeta con sus acciones, no una barra de controles. |
| `shared/NIMDiagnosticsModal.tsx` | Ya tiene tres pestañas. |
| `wizard/CoverEditorPanel.tsx` | Ya son tres secciones plegables (F3). |

Y las fases F5–F9 (Figuras, Referencias, Revisión, Exportar) ya están en §6; no se
re-inventarían acá.

### 6-bis.5 Invariante (ahora con guarda)

Una categoría de controles se declara **una vez** y la consumen todas las
pantallas que la muestran. `src/lib/modulosApa.ts` es la fuente, y
`src/__tests__/modulosApa.test.ts` es la guarda, con dos mitades:

- espeja `VALID_SCOPES` a mano: si el motor suma un alcance, el test y la fuente
  tienen que moverse juntos o se cae;
- prohíbe que `APAModuleToggles.tsx` o `ExpressQuickTransformModal.tsx` vuelvan
  a escribir la lista: lee el fuente y rechaza el literal de un alcance.

`src/__tests__/modulosApaMontados.test.tsx` cierra el círculo: agrega un módulo a
`MODULOS_APA` y las dos pantallas tienen que dibujarlo. El tercer consumidor es
`documentSlice.exportDocx`, cubierto por `exportAlcancesValidos.test.ts`.

---

## 7. F4 — la superficie única de Estructura (diseño de ejecución)

Decidido con el usuario el 2026-09-29: **la barra sigue a la selección**. Esto es
el diseño que se ejecuta. El código todavía no está tocado.

### 7.1 Lo que hay hoy, y el defecto exacto

Dos selectores apilados para la misma fase:

| Selector | Dónde vive | Qué ofrece |
|---|---|---|
| `StructureTabBar` | `App.tsx:152` | `Esquema Jerárquico` / `Revisor de Títulos APA 7` / `Editor de Prosa` |
| `VistaEstructura` | `IndiceEstructura.tsx:69` | `ver el índice` / `ver el documento` / `ver el mapa` |

El defecto no es «hay muchos botones»: es que **de las tres pestañas, dos son el
mismo lienzo con otra barra de herramientas**. `Step2HeadingsWizard` y
`Step5BodyWizard` montan los dos `PaperCanvas`. Peor: la pestaña `Esquema
Jerárquico` ya monta el lienzo adentro (`documento={<Step2HeadingsWizard />}`,
`App.tsx:706`), así que el «Revisor de Títulos» está **dos veces**: como pestaña
y como vista interna del índice.

Segundo hallazgo, y es el que achica el trabajo: la pestaña «Editor de Prosa»
**casi no tiene herramientas por selección**. Tiene un panel de solo lectura
(`Reglas aplicadas`: sangría de primera línea, enumeración de listas, márgenes y
tipografía), un selector documental (`Interlineado`) y los controles de revisión
de escritura. No hay una sola acción «sobre el párrafo elegido». O sea: la barra
contextual es mayoritariamente la de títulos, y el resto es documental.

### 7.2 La superficie

Una superficie, `EscritorioEstructura`, con UN selector arriba:

    [ Índice ]   [ Documento ]   [ Mapa ]

- **Índice** — las filas, el inspector de rama y `FaltasApa7`. Igual que hoy.
- **Documento** — el lienzo con la barra de 7.3.
- **Mapa** — el `MapaEstructura` de hoy.

Muere `StructureTabBar`. Muere `structureTab`. La vista elegida pasa al store
(7.6).

### 7.3 La vista Documento: la barra sigue a la selección

Una sola barra, con dos bloques. El primero cambia con lo que hay seleccionado:

1. **Bloque de selección.**
   - Encabezado elegido → `Nivel 1` / `Nivel 2` / `Nivel 3` / `No es título`,
     con el conteo cuando hay selección múltiple (`Aplicar a los 4 títulos`).
     Es el `MiniToolbar` de hoy, mudado, no reescrito.
   - Párrafo elegido → no hay acción de párrafo hoy, y **no se inventa**. El
     bloque dice qué sí se puede sobre un párrafo y lleva al Bloque 2.
   - Nada elegido → dice qué hacer (`role="status"`), no un hueco.
2. **Bloque documento**, plegable, siempre en el mismo lugar:
   - `Interlineado` (Doble APA / 1.5 / Sencillo) — documental, se queda.
   - `Auto-organizar títulos con IA`, `Insertar índice`, `Aprobar todos los
     títulos` — documentales, hoy viven dentro del lienzo de títulos.
   - `Reglas aplicadas` — **plegado y de solo lectura**. Es un informe: se ve si
     se abre, no compite con el trabajo (misma lección que el pulso).
   - Los controles de revisión de escritura (`Abrir Revisor`, `Revisar ahora`,
     `Corregir todo lo seguro`) **se van de esta fase**. Son de Revisión (F7),
     que ya tiene los mismos con su «un párrafo a la vez» y su «Aceptar todas»
     por motor. Retenerlos acá es la duplicación del pulso, otra vez.

### 7.4 Qué se muda

| Pieza de hoy | Origen | Destino |
|---|---|---|
| `MiniToolbar` de niveles | `Step2HeadingsWizard:203-207` | Bloque 1, mudado |
| `Revisor de títulos` (panel: anterior/siguiente dudoso, atajos `1`/`2`/`3`/`P`) | `Step2HeadingsWizard:460-544` | Bloque 1, panel del bloque de selección |
| `Auto-organizar títulos con IA` | `Step2HeadingsWizard:256` | Bloque 2, plegable |
| `Insertar índice` / `Índice detectado` | `Step2HeadingsWizard:278` | Bloque 2, plegable |
| `Aprobar todos los títulos` | `Step2HeadingsWizard:283` | Bloque 2, plegable |
| `Interlineado` | `Step5BodyWizard:152-156` | Bloque 2, plegable |
| `Reglas aplicadas` | `Step5BodyWizard:134-145` | Bloque 2, plegado por omisión |
| `Abrir Revisor` / `Revisar ahora` / `Corregir todo lo seguro` | `Step5BodyWizard:188-281` | **F7** — fuera de Estructura |

`Step2HeadingsWizard` y `Step5BodyWizard` **no se borran de entrada**: quedan
reducidos a lo que son —el lienzo y la lógica— mientras la barra se extrae. El
archivo que muere es la barra de pestañas, no los wizards.

### 7.5 La guarda reescrita

`focoNoBarraElSelector.test.tsx` **no se borra: cambia de sujeto**, de «que el
modo foco no se lleve el selector» a «que cada vista quede alcanzable, con foco y
sin foco». El riesgo es el mismo —una vista inalcanzable es una vista perdida—
pero el portador del selector ya no es una barra aparte, así que la guarda tiene
que apuntar al selector nuevo y, además, **prohibir la barra vieja**:

```
vistasDeEstructura.test.tsx

  1. la fase abre en Índice, y la vista activa se DECLARA (aria-pressed),
     no solo se colorea

  2. con el foco prendido, las TRES vistas siguen siendo alcanzables
     (el caso que se perdía, ahora sobre el selector nuevo)

  3. NO existe una segunda barra de pestañas en la fase
     (negativa: impide reintroducir el defecto)

  4. el foco sigue apagando lo que SÍ es suyo (el panel lateral), y sin foco
     el panel está
```

La 3 es la que hace el trabajo: la guarda vieja **protegía** la barra; la nueva
**la prohíbe**. Sin ella, mañana alguien la vuelve a agregar y las otras tres
pasan igual.

### 7.6 Dónde vive el estado

`vistaEstructura: 'indice' | 'documento' | 'mapa'` en el store, no un `useState`
local dentro del índice. Dos razones concretas: `ValidatorView.tsx:51` ya salta
al editor de prosa con `setStructureTab('body')` y necesita un destino
equivalente, y el rail tiene que poder volver a una vista.

El `key` del contenedor de la fase se mantiene (`key={...vistaEstructura}`) para
que cambiar de vista no deje las dos montadas.

### 7.7 Qué se toca, y qué lo verifica

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Fuera `StructureTabBar` (139-178) y sus dos mounts (703, 738); el paso 2 monta la superficie una sola vez |
| `src/components/structure/EscritorioEstructura.tsx` | Es la superficie: recibe la vista, monta Índice / Documento / Mapa |
| `src/components/structure/IndiceEstructura.tsx` | El selector local sube a la superficie; deja de tener su propio `useState` de vista |
| `src/components/structure/BarraContextualDocumento.tsx` | **Nuevo**: los dos bloques de 7.3 |
| `src/components/wizard/Step2HeadingsWizard.tsx` | Pierde barra y panel: cede la lógica |
| `src/components/wizard/Step5BodyWizard.tsx` | Pierde panel e interlineado; pierde los controles de revisión (van a F7) |
| `src/store/types.ts`, `src/store/slices/uiSlice.ts` | `structureTab` → `vistaEstructura` + `irAlDocumento()` |
| `src/components/validator/ValidatorView.tsx:51` | `setStructureTab('body')` → `irAlDocumento()` |

Guardas que cambian de sujeto, no de intención:

| Guarda | Qué le pasa |
|---|---|
| `focoNoBarraElSelector.test.tsx` | Pasa a `vistasDeEstructura.test.tsx` (7.5) |
| `estructuraEstaMontada.test.tsx:221` | Su assertion de fuente cruda (`structureTab === 'indice' ? ...`) apunta al mount viejo |
| `flagsDeUiSinLector.test.ts:92` | La bandera cambia de nombre |
| `wordapa7_features.test.ts:200` (`R3: Structural Revision Panel`) | Monta `Step2HeadingsWizard` para probar los controles de títulos: si los controles se mudan, la prueba se muda con ellos, no se borra |
| `step5BodyOpcionesAvanzadas.test.tsx` | Monta `Step5BodyWizard` y además lee su fuente con `?raw`; hay que re-apuntar las dos cosas |

Criterio de aceptación de F4: con foco prendido y apagado, las tres vistas se
alcanzan; el índice conserva sus filas, su inspector y sus faltas; los controles
de títulos siguen funcionando desde la barra nueva; ninguna prueba quedó borrada
(las que cambian de sujeto se reescriben y se explica por qué).

