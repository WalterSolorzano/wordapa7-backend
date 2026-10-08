# Plan de corrección por fases de WordAPA7 — documento maestro

- **Fecha**: 2026-09-29
- **Rama**: `feat/motor-render-fase1`
- **Estado**: esperando revisión
- **Reemplaza a**: `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md`
  (queda como historial, marcado como superado).
- **Alcance**: la app en ejecución, reportada pantalla por pantalla por el usuario.
  Este documento es diseño, no tareas. Al aprobarlo, `writing-plans` lo rompe en planes
  de fase ejecutables.

---

## 1. Por qué existe este documento

El usuario reportó, en una sola sesión, defectos de todas las superficies: la pantalla de
carga que se reinicia sola, mascotas con caras y animaciones rotas, un carrusel de portadas
que quedó a medias, un editor con demasiado chrome, una pantalla de Estructura con
jerarquía visualmente rota, referencias sin contraste, una revisión con controles que no
hacen nada, proyectos que dan error y una exportación que se achica mal en ventana pequeña.

No son diez problemas nuevos: son **un producto que quedó a mitad de un rediseño**. El
commit `f9f360f` lo dice por escrito — *"portada, referencias y estructura: el trabajo de la
otra sesión, con 7 guardas en rojo"* — y las capturas `menu_estructura_fase_navy.png` y
`captura_actual.png`, generadas por el usuario, muestran el estado real.

### 1.1 La regla que gobierna todo

> **Ninguna UI puede afirmar algo que el código no hace.**

Es la regla de `AGENTS.md` §1 y de `PRODUCT.md`. En la práctica:

- Si a un elemento no se le puede aplicar una corrección, la vista **lo dice** en vez de
  inventar un texto sobre el que tachar.
- Si un control no llega a su destino, se **cablea o se borra**. Un control decorativo es
  peor que uno ausente: ocupa el lugar de uno que sí funciona.
- Todo texto de interfaz tiene un test que falla si se rompe su contrato.

### 1.2 Qué se reemplaza y qué se conserva

- Se reemplaza el **documento maestro**, no las decisiones que ya tomó el usuario y que
  siguen vigentes: protección de la portada original, papel blanco puro en los dos temas,
  la revisión de un párrafo a la vez, el rail que nunca se colapsa por paso, la portada como
  bloque indivisible.
- Se **reordena** el trabajo: el master viejo arrancaba por el dato (F0) y la pantalla (F1).
  Este documento agrega, **antes de rediseñar cualquier superficie**, una fase de
  **estabilización de la base** y una de **sistema de diseño y shell**, porque el usuario
  pidió explícitamente que el editor "respire" y porque hoy la base está roja.

---

## 2. Decisiones tomadas con el usuario (2026-09-29)

Estas cuatro respuestas fijan el alcance. No se vuelven a preguntar.

1. **Relación con el master**: se escribe un **plan nuevo que reemplaza** al del 2026-09-27.
2. **Base rota**: **se estabiliza primero**. F0 = dejar verdes `vitest`, `tsc`, `pytest` y
   `build` antes de tocar diseño.
3. **Fundamento**: **el sistema de diseño y el shell colapsable van primero** (F1), y de ahí
   cuelgan todas las fases de superficie.
4. **UIs viejas**: se **cambian por funciones más útiles y alineadas al diseño**, o se
   rediseñan en su lugar. El usuario prefiere piezas nuevas y útiles antes que conservar
   interfaces de la generación anterior.
5. **Estructura, tres sub-modos**: decisión de diseño de este documento —
   **se fusionan en una sola superficie**. Ver §5 F4.5. Las acciones que hoy viven en
   "Revisor de Títulos APA 7" (promover y degradar nivel) pasan a ser acciones **del nodo**
   en el índice, con su motivo; "Editor de Prosa" pasa a ser **edición inline** del párrafo
   desde el toggle "ver el documento". La barra superior `MODO DE TRABAJO` desaparece. El
   criterio: el usuario pidió que la pantalla no se sienta sobrecargada, y tres pestañas
   que reparten un mismo eje (la jerarquía) sobrecaran sin agregar información. Es una
   decisión reversible: si al verla montada falta el modo, se recupera como destino del rail
   y no como barra superior.

---

## 3. La barra de calidad

Invariantes que no se negocian en ninguna fase. Son las del master viejo, y siguen vigentes.

1. **Cero emojis.** Solo `lucide-react`, `strokeWidth="var(--icon-stroke)"`.
2. **Cero colores literales** en TS/TSX/CSS. Solo tokens. `noHardcodedColors.test.ts` se
   **extiende** para cubrir los directorios que hoy se escapan (hoy quedan fuera
   `components/auditor`, `components/project`, `components/layout`, `components/upload`,
   `components/wizard`, `components/inspector`, `components/export`), no se relaja.
3. **Todo `var(--x)` sin fallback tiene que estar declarado** en `design-system.css`. Hoy
   `--accent-soft`, `--surface-bg` y `--surface-alt` se usan y no existen.
4. **Ningún identificador interno visible.** Ni `snake_case` de motor, ni `elem_`, ni
   `[placeholder]`. Un solo archivo de rótulos, derivado, con test que falla si un `kind`
   cae al crudo.
5. **Ningún control sin destino.** Si no llega al backend, se cablea o se borra.
6. **Ningún estado vacío mudo**, y el mensaje sobrevive a todas las combinaciones de layout
   (incluida ventana angosta).
7. **La app respira en ventana pequeña**: ningún layout se rompe por debajo de 1280x800, y
   los paneles colapsan, no se aplastan.
8. **Tests que muerden.** Todo subagente hace mutation testing: rompe el código a propósito
   y verifica que el test se cae.
9. **Palabras en español, sin CJK**, en código y en mensajes de commit.

### 3.1 Reglas de prueba que ya cobraron su costo

- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, obligatorio.
- Leer un fuente en un test: `.ts`/`.tsx` con `?raw`; `.css` **no** sirve con `?raw`
  (`css: false` devuelve cadena vacía) — se usa el rodeo del specifier en variable con
  `node:fs`, como ya hacen `designTokens.test.ts` y `noHardcodedColors.test.ts`.
- No crear `vitest.config.ts`. Pisa la config del repo.
- PowerShell no sirve para cirugía por índice de array en archivos largos. Editar por
  contenido.
- `git add` explícito archivo por archivo. **Nunca `git add -A`.**

---

## 4. Estado verificado hoy

### 4.1 La base está roja

El commit `f9f360f` dejó **7 guardas rojas**. F0 las enumera y las cierra antes de cualquier
rediseño. El número esperado de la base verde anterior al rediseño es el del master:
`vitest` 1024 passed / 0 failed, `pytest` 766 passed / 14 skipped, `tsc` limpio,
`build` sin error. **Ninguna fase puede quedar por debajo.**

### 4.2 Lo que muestran las capturas

`menu_estructura_fase_navy.png` (fase Estructura) confirma, leído además en el código:

- **Cada fila H1 es una banda azul marino con texto blanco, y lleva un borde azul de 4 px a
  la izquierda.** `NodoIndice.tsx:47-58` elige `backgroundColor: 'var(--color-navy-header)'`
  y `borderLeft: '4px solid var(--color-accent)'` para toda fila `nivel === 1` **y** para la
  seleccionada (`:74-78`). El resultado es el "borde azul izquierdo" que el usuario pidió
  tachar: se lee como estados de IA en un componente que no tiene nada que ver con IA.
- **El pulso del documento mete datos que no sirven en esa pantalla.** `PulsoDocumento.tsx`
  dibuja cinco tarjetas; la captura muestra `Balance 0 %` con borde verde superior
  (`:177`), `Fases que faltan`, `Figuras sin leyenda`, `Referencias sin citar`. El usuario
  preguntó para qué le sirven ahí.
- **La vista previa de contenido vomita el documento.** `InspectorRama` muestra los párrafos
  de la rama y repite el conteo (`157 palabras` dos veces en la captura).
- **Ruido repetido:** cada fila termina en un badge `sin elementos`.
- **Mensaje de estado barato:** la barra inferior muestra
  `contando cuántas veces cambiaste "determinar" por "analizar" en los objetivos.`

`captura_actual.png` (Inicio) confirma el hero con gradiente y una pregunta de cita
generada, y el dropzone con `Continuar documento reciente`.

### 4.3 Los "dos H1 sin nombre"

El usuario reportó que en una prueba se marcan dos H1 sin nombre. La causa más probable ya
está documentada en el master viejo §2.5: `aiMosaic.ts:379-381` indexa un mapa entre el texto
del H1 normalizado y los **valores** de `PHASE_LABELS`, con **match exacto**. Cualquier H1
que no sea literalmente uno de esos diez valores cae a `sin_fase`, y `:85` lo pinta
`'Seccion sin nombre'`. Es el mismo defecto que hace que `"1. Introducción"` no abra fase.
Se confirma en F4.

---

## 5. Las fases

Cada fase es **un commit**. Los tests de la fase anterior tienen que seguir pasando en el
commit de la siguiente, y el número de tests no baja.

### F0 — Base verde (bloqueante de todo)

**Por qué primera**: rediseñar sobre una base con guardas rojas es construir sobre un merge
que nadie puede verificar.

**Qué se hace**

- Correr y **enumerar** las 7 guardas rojas: `npx vitest run`, `npx tsc --noEmit`,
  `pytest python/tests/ -q`, `npm run build`, `cd word-addin; npm test`.
- Arreglar cada una. Si una debe bajar un test, es porque el test consignaba el defecto, y
  eso se explica en el mensaje del commit.
- Registrar en el commit la lista de las 7 y su causa, para que la fase siguiente no herede
  una suposición.

**Criterio de terminado**: las cinco corridas en verde, sin bajar del conteo de §4.1.

---

### F1 — Sistema de diseño y shell que respira (cimiento)

**Por qué segunda**: el usuario lo pidió así — el editor tiene demasiado chrome y demasiadas
cosas que deberían ser colapsables o de solo íconos. Arreglar los tokens y el shell después
significa retocar cada pantalla dos veces.

#### F1.1 Tokens y contraste

- **Declarar o renombrar los tokens fantasma**: `--accent-soft` → alias del que ya existe
  (`--color-accent-soft` / `--word-blue-light`); `--surface-bg` → `--color-bg-surface`;
  `--surface-alt` → `--color-bg-surface-subtle`. Los usos con fallback que hoy tapan el
  defecto (`MergeDocumentsModal.tsx:55`, `ProjectImagesDrawer.tsx:31,108`,
  `ProjectTabs.tsx:121`) pierden el fallback.
- **Extender R3** de `noHardcodedColors.test.ts` a los siete directorios listados en §3, más una
  regla nueva: todo `var(--x)` sin fallback en `src/**` está declarado en
  `design-system.css`.
- **Auditar contraste en los dos temas** con la paleta declarada, no a ojo. El caso que el
  usuario reportó —letra negra sobre fondo azul— es una combinación prohibida: cualquier
  fondo de acento lleva texto de su par de contraste, y hay un test que lo verifica para los
  pares declarados.
- **Los cuatro tonos de la rampa de IA** (`--ia-nivel-1..4`, `design-system.css:53-56`) dejan
  de ser cuatro rojos: una rampa monocroma roja se lee como error, no como intensidad.

#### F1.2 El shell

- `UnifiedToolbar.tsx`: el header deja de escribir `WordAPA7` en texto; queda el ícono, y el
  nombre del documento (`doc.file_name`) pasa a ser el título, centrado. El estado de guardado
  se conserva.
- **Densidad y colapsables reales**: el rail de 56 px y su flyout viven siempre (AGENTS.md §1),
  pero el resto del chrome se vuelve colapsable: las barras que hoy ocupan ancho y alto fijo
  pasan a poder plegarse, y las acciones de baja frecuencia viven en overflow con ícono.
  Un modo "enfoque" que esconde el chrome no esencial es bienvenido, siempre que el rail y su
  conteo de pendientes sigan visibles.
- **Muere el popup flotante de Estructura al pasar el mouse.** El `OnboardingTour.tsx`
  invasivo se apaga. Ningún tooltip cubre el área de trabajo por hover.
- **Muere la barra `MODO DE TRABAJO`** (ver F4) y, en el flujo de portada, **muere la tira
  superior** de `CoverCarouselStudio.tsx:73-97` (`Conservar original / APA 7 Estándar /
  Institucional UNI / Profesional APA / + Subir plantilla`) **y** el botón
  `Usar este diseño y Continuar` (`:217`). Esa tira es el flujo de selección de portada, y
  el flujo nuevo de F3 la reemplaza; no puede quedar montada durante la edición.
- **Los datos que no sirven en una pantalla se van de esa pantalla.** El pulso de cinco
  tarjetas de `PulsoDocumento` no vive arriba de Estructura con `Balance 0 %` y `Fases que
  faltan` sueltos (F4 los reubica o los borra).

#### F1.3 Responsive

- Ningún layout se rompe por debajo de 1280x800. Exportar y las vistas de fase tienen su
  comportamiento definido a ventana pequeña: colapsan paneles, no aplastan contenido.

**Tests**

- R3 cubre los siete directorios nuevos y la regla de tokens declarados pasa.
- Sin `var(--x)` fantasma.
- El header no contiene el literal `WordAPA7`.
- Con ventana de 800 px de ancho y 700 de alto, ninguna pantalla produce scroll horizontal
  del root ni contenido de 0 px de alto.

---

### F2 — Pantalla de carga estable y mascotas

**Por qué**: el usuario lo reportó primero: "el menú de carga se reinicia a cada rato" y las
mascotas tienen fallas de animación o de cara.

#### F2.1 El reinicio

- **Reproducir antes de tocar.** Candidatos verificados a mirar: `Step0QuickStart.tsx` (994
  líneas) y su `useEffect` de `isBackendReady` (`:224-231`, recarga sesiones), el montaje
  por paso en `App.tsx`, y cualquier `key` o remount del wizard. La causa se documenta en el
  commit con el síntoma medido, como se hizo en F1 del master viejo con el overlay morado.
- El estado de la pantalla de carga no se resetea por un re-render ni por el cambio de
  `isBackendReady`; el archivo pendiente y el progreso sobreviven.

#### F2.2 Las mascotas

- **Un solo componente de mascota**, con un conjunto declarado de estados (cargando, listo,
  error, vacío, escuchando) y caras vectoriales. Hoy están repartidas en `EditorialMascot.tsx`,
  `DocumentMascot.tsx`, `mascotDePestana.tsx`, `MascotBubble.tsx` y `HomeHero.tsx`, y cada una
  resuelve su cara y su animación por su cuenta.
- Las animaciones respetan `prefers-reduced-motion: reduce` y no usan emojis.
- Cero caras con estado incoherente: la cara es una función del estado, no una decisión local.

#### F2.3 El overlay de carga

- `LoadingTips.tsx` deja de ser un `position: fixed` a pantalla completa con `zIndex` inline;
  usa la escala de `z-index` del proyecto y respeta el rail y el workbench.
- La paleta horaria de `:380` se va: el fondo del overlay es un token, en los dos temas.
- `MIN_DISPLAY_MS = 3500` se reduce o se condiciona.
- El overlay dice qué está pasando ("Escaneando el documento", "Subiendo capítulo-3.docx
  (3 de 20)").

**Tests**

- La pantalla de carga no remonta ante un cambio de estado del backend.
- Un test por estado de mascota: cada estado tiene su cara y su `aria-label`.
- El overlay no tiene `position: fixed` ni `zIndex` inline.

---

### F3 — Portada y carrusel

Es la fase más delicada: es donde el usuario pidió el mayor cambio de comportamiento.

#### F3.1 El carrusel

- **La principal en grande, las vecinas en pequeño y de fondo.** `CarruselPortada.tsx` y
  `MiniaturasDeDiseno.tsx` se reconstruyen como un carrusel con la tarjeta activa al centro
  a escala grande, dos o tres vecinas por lado en pequeño con `perspective` y `rotateY`, y
  controles `<` y `>` explícitos, con teclado y con `aria`. Respeta `prefers-reduced-motion`.
- **Cada vista previa es el render REAL del diseño, no un esqueleto.** Hoy
  `CoverCarouselStudio.tsx:67-99` son cinco miniaturas dibujadas con `div` (`:511-573`), y
  `original` y `custom` caen a `PaperCanvas onlyCover` (`:607`). La miniatura pasa a ser el
  mismo componente que genera el `.docx`, a la escala de `portada/geometria.ts`. Si una
  miniatura no se parece a lo que sale, es que el diseño está mal, y ahora se ve.
- **La previsualización es 100 % fiel a Word**: la escala sale de la geometría real, no de
  constantes elegidas a ojo. Hoy `UNICoverPreview.tsx` pinta fuentes y logo entre 9 % y 20 %
  más chicos que el `.docx` (master viejo §2.11).

#### F3.2 Los datos del original entran al editor

Es el pedido explícito: **al seleccionar portada, la app "chupa" los datos que ya tenía el
Word subido y los pone en el editor.**

- El backend ya normaliza la portada (`portada_normalize.py`, `portada_module.py`) y el
  modelo `PortadaData` ya existe. Lo que falta es el camino: **extraer del `.docx` cargado
  autor, título, asignatura, institución, carrera, profesor asesor, comité, fecha e idioma**
  y **poblarlos como valores iniciales** del formulario de portada.
- Cada dato poblado se distingue de un dato inventado: si el original no lo traía, el campo
  queda **vacío y lo dice**, nunca con un placeholder con forma de dato.
- `AGENTS.md` §1 manda: `use_original_cover: true` **jamás** muta la portada original. Poblar
  el formulario no la muta; lo que se decide es dónde escribe el `.docx` cada dato según el
  modo (los del acta son metadatos del documento, ver §F3.4).

#### F3.3 Geometría única y página

- Un módulo único `src/lib/portada/geometria.ts` con la geometría de la hoja en milímetros y
  `escalaDePreview(anchoPx)` **derivada**. Ningún `fontSize` en px o pt escrito a mano en la
  preview.
- `portada_uni.py` y `cover_designer.py` dejan de heredar la hoja del original para el
  tamaño: aplican `section.page_width`/`page_height` desde `APARuleSet.page_size`. Decisión
  ya tomada por el usuario y registrada en el master viejo §6.2: el tamaño de página es
  propiedad de la **sección**, no del bloque protegido; aplicarlo no altera ni un carácter
  de la portada.
- El test de protección: el hash del bloque de portada original es **idéntico** antes y
  después de aplicar todo F3.

#### F3.4 Logos y acta

- `portada.logos: LogoPortada[]`, con `asset` que referencia `python/assets/logos/`, no una
  URL hardcodeada en el `.tsx`.
- La selección de institución pasa a estado controlado. Hoy `CoverEditorPanel.tsx:564-565`
  deriva "seleccionado" con `String.includes` sobre texto libre, y elegir dos universidades
  enciende las dos. El test del fallo: dos clics, exactamente una activa.
- Cada logo se dimensiona en fracción del ancho útil (el `Cm(5.2)` absoluto de
  `portada_uni.py:294` se deriva de la geometría).
- `_resolve_logo_path` resuelve por el asset pedido, no por el nombre fijo `logo_uni.png`.
  El 404 de `logo_anan.png` (debería ser `logo_unan.png`, `CoverEditorPanel.tsx:135` vs
  `main.py:1009-1026`) se arregla.
- El `onError` de `UNICoverPreview.tsx:83-85` deja de esconder el `<img>`: un logo pedido que
  no llega es un dato faltante, y se dice.
- El profesor asesor, el comité y el grupo dejan de perderse con `Conservar original`: viven
  fuera de `portada`, como metadatos del documento, y el `.docx` los escribe donde
  corresponda sin tocar la portada original.

#### F3.5 Se rematan las piezas viejas

- Confirmado que la tira de estrategias y `Usar este diseño y Continuar` se fueron en F1, el
  flujo queda: carrusel arriba, y al elegir un estilo entra la **hoja de datos** con solo los
  datos. Sin estilos duplicados y sin el panel que repite la misma información dos veces.
- Al salir de la fase y volver, la portada se vuelve a mostrar (hoy `wizardStep` no lo
  recuerda).

**Tests**

- La miniatura de `original` contiene el mismo árbol de nodos que el lienzo con el original
  activo.
- Elegir dos instituciones deja exactamente una activa.
- Con dos logos, los dos llegan al `.docx` con su fracción del ancho útil.
- Con el original activo, la portada queda byte a byte igual y el autor y el profesor sí
  llegan al `.docx`.
- Cargar un `.docx` con autor y profesor conocidos puebla esos campos del editor.

---

### F4 — Estructura: el escritorio de redacción

#### F4.1 Muere el borde azul y la banda navy

- `NodoIndice.tsx:47-58,74-78` deja de pintar `--color-navy-header` y el `borderLeft` de
  4 px. La jerarquía se comunica por **tipografía y sangría** con tokens suaves, no por una
  banda oscura por fila. Los estados de salud siguen dichos en palabras, como hoy.
- El badge `sin elementos` repetido se convierte en información solo cuando hay algo que decir.

#### F4.2 El H2 que hereda mal: triage motor vs UI

El usuario pidió revisar si es el motor o la UI.

- La **fuente de verdad** es `src/lib/jerarquia.ts`: `construirJerarquia` guarda en cada nodo
  su propio `titulo`, y `seccionesDeElementos` (`:539-556`) asigna `h1` y `h2` por separado;
  un H2 no escribe `h1`. Leído el código, **la biblioteca no tiene el defecto**.
- Los **sospechosos son los consumidores** que derivan la sección por su cuenta:
  `aiMosaic.ts:379-381` (match exacto contra `PHASE_LABELS`), `Step3FiguresTablesWizard.tsx`
  `sectionMap` indexado por `element.id` (posicional `elem_N`, que se pisa), `ListaContextual.tsx`
  y `FocusReadingCard.tsx`.
- **Se unifica en un solo camino**: la fase de un elemento sale de `AuditItem.phase` que ya
  calcula el backend, y la sección vigente de `seccionesDeElementos`. Ningún componente
  vuelve a derivarlo. El test reproduce el caso (un H2 bajo un H1 cuyo texto difiere) y
  afirma que el H2 recibe **su** texto como encabezado y su H1 como contexto.

#### F4.3 Los H1 sin nombre

- `aiMosaic.ts` deja el match exacto y cae a `AuditItem.phase`. Los H1 numerados
  (`"1. Introducción"`, `"CAPÍTULO 2: MARCO TEÓRICO"`) dejan de caer a `sin_fase` y de
  pintarse `'Seccion sin nombre'`.
- El test itera encabezados numerados y afirma que ninguno queda sin nombre.

#### F4.4 La vista previa deja de vomitar el documento

- La "vista previa de contenido" del inspector muestra un **resumen acotado** de la rama, no
  el texto completo, y **no repite** el conteo de palabras dos veces.
- Un título con miles de líneas dentro no vuelca su contenido: se colapsa y se dice cuánto
  hay.

#### F4.5 Se fusionan los tres sub-modos

- La barra `MODO DE TRABAJO` desaparece. El escritorio es **el índice** (la medida) y el
  documento es un toggle.
- **"Revisor de Títulos APA 7"** deja de ser una pantalla que "vomita toda la previsualización"
  con un botón viejo de "Siguiente" y botones que no hacen nada. Lo que servía se vuelve
  acciones del nodo: promover y degradar nivel **con el motivo** (`match_phase_exact`: un H2
  que dice "Resultados" a secas se promueve, "Resultados de la encuesta" se deja quieto y se
  explica por qué), y la lista de faltas APA.
- **"Editor de Prosa"** deja de ser una pestaña: la edición del párrafo es inline desde el
  toggle "ver el documento".
- **"Auto organizar"** —hoy "feo"—: si se conserva, es una acción del índice con alcance
  explícito ("esta rama" / "todo el documento") y previsualización de qué va a cambiar antes
  de aplicarlo. Si no se puede hacer honesta, se borra.
- El `MapaEstructura` deja de ser una capa flotante y sigue siendo un toggle; ningún nodo
  queda con su nombre solo en el hover.

#### F4.6 Se va el ruido del chrome

- Las tarjetas del pulso que no sirven en Estructura se reubican en la vista donde sí
  informan, o se borran. `Balance 0 %` con borde verde no puede quedar suelto arriba.
- El mensaje de la barra de estado (`contando cuántas veces cambiaste ...`) se reemplaza por
  estado real o se elimina.

**Tests**

- Ninguna fila del índice usa `--color-navy-header` ni un `borderLeft` de acento por nivel.
- Un H2 bajo un H1 muestra su propio título como encabezado y su H1 como contexto.
- Un H1 numerado nunca se pinta sin nombre.
- La vista previa no repite el conteo de palabras.
- No existe la barra `MODO DE TRABAJO`.

---

### F5 — Figuras y tablas

#### F5.1 El eje son las figuras, con jerarquía legible

- `EscenarioFigura.tsx` y `ListaContextual.tsx` se rediseñan: la lista tiene jerarquía
  visual clara (agrupada por sección), no un menú chiquito e ilegible. La función es que el
  editor agregue, edite, ponga diseño y vea figuras sin fricción.

#### F5.2 El contexto, legible y sin repetir

- El "párrafo anterior" de `ListaContextual.tsx:187-197` está hoy en `--text-xs` con
  `WebkitLineClamp: 3`: es el "párrafo super pequeño que no se ve" que reportó el usuario.
  Sube a tamaño legible y con corte por líneas, no por `clamp` microscópico.
- Deja de repetirse "abajo": el párrafo anterior aparece una sola vez, y el bloque duplicado
  se borra (`157 palabras` dos veces es el mismo defecto que en Estructura).

#### F5.3 La IA sugiere la leyenda

- `runProactiveAutoCaptioning` y `suggestCaption` se cablean de verdad a esta pantalla
  (`ai_proactive_captioner.py`, `captions.py`). Una figura o tabla sin rotular recibe la
  sugerencia y se puede aceptar desde acá.

#### F5.4 Editor general e inspector real

- El tamaño real en cm se muestra (hoy `ImageEditPanel.tsx:137-138` cae a `|| 12` / `|| 8`,
  valores inventados presentados como reales).
- Un **editor general de figura** que aplica el mismo criterio a todas, y un inspector con
  información seria. El inspector actual aparece al tocar una imagen y no dice nada útil; el
  usuario pidió que salga el editor general para aplicar el criterio a todas, o algo
  distinto y mejor. Se elige y se documenta.
- Se borran los botones del pie que no se ven y no hacen nada.
- Se cierra el tapado: todo contenedor con scroll tiene `min-height: 0` y `min-width: 0`;
  ningún header tiene `flexShrink: 0` sin `maxHeight`.

**Tests**

- Con ventana de 700 px de alto, la lista de figuras es scrolleable y no de 0 px (test de caja).
- El párrafo anterior aparece exactamente una vez.
- Una figura sin leyenda ofrece la sugerencia de IA, y aceptarla la escribe en `image_info.caption`.
- Una imagen sin `width_cm` no muestra un tamaño inventado.

---

### F6 — Referencias

Migrar `Step5ReferencesWizard.tsx` (1042 líneas) al criterio de diseño nuevo. No es un
rediseño de cero: es **dejar de ser de la generación anterior**.

- Paso por `Seccion` (`tabs/word/Seccion.tsx`), el molde de Conexión, Formato, Documento y
  Revisión.
- **Contraste real y sin combinaciones prohibidas**: se van los cuatro `rgba(0,0,0,...)`
  literales y `var(--paper-ink, #000)` (`:562`, cuyo fallback tapa el token roto). Los diez
  tamaños de fuente literales pasan a `var(--text-xs|sm|base)`. El `'4px'` literal (`:375`)
  pasa a `--radius-*`. Se ven los anchos inestables y las "fuentes raras": tipografía de la
  casa y anchos por token.
- Los grupos que el usuario vio —**"Sin contrastar contra una fuente"** y **"En texto, no en
  biblio"**— reciben diseño y jerarquía, no una lista blanca sin contraste.
- El archivo sale de `components/wizard/` a `components/referencias/`, que ya está en el
  alcance de R3 y por lo tanto entra al lint.
- `isZombie` (`:84-89`) deja de clasificar por longitud de título y verifica de verdad;
  `isOrphan` (`:321-324`) deja de hacer `s.includes(authors?.[0] || '---')`, que con `'---'`
  matchea cualquier cosa.
- Empty states con `EstadoVacio` de F1.
- Una **mascota** con la cara del estado real, como las otras pestañas.

**Tests**

- R3 cubre el archivo nuevo; los cuatro rgba no pueden volver.
- Una referencia sin autores no hace `isOrphan` verdadero ni lanza excepción.
- Ningún texto de contraste insuficiente en los pares declarados.

---

### F7 — Revisión

Es la fase que más le preocupa al usuario.

#### F7.1 El motor

- **"El texto ya no está en el documento"** (`FocusReadingCard.tsx:123`) es el síntoma de
  reconciliar hallazgos por `element.id`, que es posicional (`elem_N`) y se corre al
  refrescar. Se reconcilia **por posición y por contenido**, como ya se corrigió en el motor
  de refresco, y el mensaje solo aparece cuando de verdad ya no está.
- Se audita el motor completo (`useReviewWorkbench.ts`, `useReviewActions.ts`,
  `useReviewWorkbench.test.ts`): cada control llega a su destino o se borra.

#### F7.2 Los cuadrados sin sentido

- Los "botones cuadrados de colores que nadie sabe para qué son y que si los tocás no hacen
  nada" son el minimapa (`ReviewMinimap.tsx`, columna de 19 px con cuadrados de 4 px) y/o la
  `ReviewStrip.tsx`. Decisión: **se conserva la función, se reconstruye la presentación** —
  cada página con su número, el color del motor dominante **con su nombre** al hover y en el
  `aria-label`, altura mínima legible y contraste suficiente en tema claro. Si la ventana es
  demasiado angosta, desaparece y su función queda en el flyout del rail. **No vuelve la
  columna de tres paneles** (AGENTS.md §1).
- `ReviewMinimap.tsx` se muda de `components/wizard/` a `components/review/` (y hay que
  actualizar `src/__tests__/useReviewWorkbench.test.ts` y `railPending.test.ts`, que lo
  importan desde la ruta vieja, en el mismo commit).

#### F7.3 Contraste y empty states

- Colores de contraste en los dos temas para los estados de motor.
- Un `EstadoVacio` que **sobrevive a la ventana angosta**: con menos de 1180 px el rack no
  se renderiza, y hoy el mensaje de "sin hallazgos" vive dentro del rack y desaparece con él.
- La copia deja de describir posiciones que pueden no existir ("elegí uno en el panel de la
  derecha").

#### F7.4 Lo que no se toca

- La revisión sigue siendo **un párrafo a la vez**; el rail y su flyout viven siempre; los
  chips de motor y `Página X de N` y "Siguiente hallazgo" siguen en la barra superior. No se
  reintroduce `ReviewMinimap` en un layout de tres columnas.

**Tests**

- Con cero hallazgos se ve el mensaje, también con la ventana angosta.
- Un hallazgo cuyo elemento se corrió de posición sigue resolviendo, y no dice "ya no está".
- Ningún control de la pantalla es un no-op.

---

### F8 — Proyectos

- **Arreglar el error al abrir la fase.** Se reproduce primero (`ProjectFolderModal.tsx` y su
  `useEffect` de `cargarProyectos`, `uiSlice.ts:328-352`, `routers/proyectos.py`). El síntoma
  y la causa se documentan en el commit.
- **Entidad real**: `Proyecto` con `id`, `nombre`, `raiz`, `documentos`, `figuras`, `creado`;
  persistencia en el backend; acción de **sincronizar con la carpeta**.
- **Las imágenes se suben a disco** (`/api/assets`) y `removeProjectImage` hace
  `URL.revokeObjectURL`. Hoy el blob muere con la pestaña.
- **`activeFilePath` se establece en el camino de carga**, y "Abrir carpeta" aparece (hoy no
  aparece nunca).
- **Entrada en el rail**, con su conteo derivado de `lib/railPending.ts`, nunca de un conteo
  local.
- **`ProjectTabs.tsx:47`** deja de esconder el Explorador cuando no hay documentos.
- **Carpeta de 20 `.docx` = una operación con progreso**, no 20 subidas en serie con 20
  pantallas de carga.

**Tests**

- Un proyecto sobrevive cerrar y reabrir la app.
- Con imágenes en el proyecto, tras reabrir las imágenes están.
- Una carpeta de 20 `.docx` produce una operación de carga, no 20.
- Abrir el Explorador no lanza.

---

### F9 — Exportar

- **Responsive**: a ventana pequeña la vista no se achica mal; proporciones correctas y
  comportamiento definido por ancho.
- **El panel de ajustes avanzados se diseña y se construye** (hoy solo hay un link terciario
  que revela un checkbox): qué se incluye (portada, índice, figuras y tablas, referencias,
  apéndices) con switches que dicen qué pasa si se apagan; la hoja (tamaño heredado de
  Ajustes, márgenes, orientación); la tipografía derivada de `FormatoTab`; el idioma; las
  marcas de control de cambios; el nombre de archivo y los metadatos.
- **`format` sube al store** (hoy es `useState` local y se pierde al salir del paso, y
  `FileMenu.tsx:93-102` tiene sus propios botones).
- **Backup del write-back a Word** (`POST /api/send-to-word`, que sobrescribe el original del
  usuario): es la operación más destructiva de la app y hoy no deja `.bak`, cierra Word con
  `SaveChanges=0` (descarta trabajo sin guardar) y no tiene tests. Las tres cosas se
  arreglan **antes** del panel. No es pulido: una operación destructiva sin vuelta atrás y
  sin tests no está terminada.

**Tests**

- El panel existe y el botón lo abre.
- Salir del paso y volver conserva el formato elegido.
- El write-back deja un `.bak` y no descarta cambios sin guardar.

---

### F10 — Los cables de LLM

Detalle del master viejo §12, vigente.

- `proactive_auditor.refine_with_llm` (`:693-704`) pasa por `execute_with_specialty`, con el
  `api_key` del request, sin el `requests.post` síncrono dentro de un `async def` y sin el
  modelo quemado. Hoy es el único motor de ortografía del producto y el único que no pasa por
  el router.
- Las nueve variables de modelo dejan de ser un control mudo: `main.py:970-984` acepta los
  nueve modelos validándolos contra el catálogo, `ai_keys.py:18-32` los suma, y
  `llm_classifier.py:154,166,178,190` lee sus cuatro quemadas.
- `provider_id` viaja a los 17 endpoints. `api_key` se resuelve por proveedor; un proveedor
  sin su clave no entra en la cola en vez de disparar un 401 y un cooldown.
- `HUGGINGFACE_API_KEY` gana camino de la UI a `os.environ`.
- Un test por proveedor (URL, modelo, header, degradación sin clave) y un botón "Probar".
- Nota de seguridad: las claves viven en texto plano en `localStorage`, IndexedDB y
  `ai_keys.json`. F10 **no** lo arregla; queda anotado como decisión pendiente.

---

## 6. Orden y dependencias

```
F0  base verde                    sin dependencias        -> desbloquea todo
F1  diseño + shell                F0                      -> desbloquea F2..F9
F2  carga + mascotas              F1
F3  portada + carrusel            F1
F4  estructura                    F1
F5  figuras                       F1, geometría de F3
F6  referencias                   F1
F7  revisión                      F1
F8  proyectos                     F1 (overlay de F2)
F9  exportar                      F1
F10 LLM                           F1
```

- **F0 es bloqueante y corta.**
- **F2, F3, F4, F6, F7, F9 y F10 son paralelizables** entre sí después de F1.
- **F5 depende de la geometría de F3.**
- **F8 es el más caro y el más independiente**: puede ir último sin bloquear nada.

### 6.1 Colisiones conocidas

- `src/styles/design-system.css` lo tocan F1, F3, F6 y F7. Una sola vez cada una y en orden.
- `NodoIndice.tsx` lo toca F4; `--color-navy-header` lo puede retirar F1.
- `src/lib/auditItems.ts` lo tocan F4 y F7.
- `ReviewMinimap.tsx` cambia de carpeta en F7; actualizar sus importadores en el mismo commit.
- `src/store/slices/uiSlice.ts` lo tocan F2 y F8.
- `python/modules/portada_uni.py`, `cover_designer.py`, `models.py` los toca F3.
- `src/components/review/*` lo tocan F4 (consumidores) y F7.
- `FileMenu.tsx` lo tocan F9 y F8.

**Nunca `git add -A`.** Archivo por archivo.

---

## 7. Lo que NO se hace, y por qué

- **No se borra el rail ni su flyout.** Viven siempre (AGENTS.md §1).
- **No se vuelve a la revisión de tres columnas.** El layout secuencial es decisión de diseño.
- **No se toca la protección de la portada original.** F3 saca los datos del acta **fuera** de
  la portada, que es lo que la descongestiona sin romper la promesa.
- **No se toca el fondo de la hoja.** `--paper-white` blanco puro y `--paper-ink: #111827` en
  los dos temas.
- **No se agregan librerías de grafo**; el mapa es SVG a mano.
- **No se reescribe el canal de secretos** (queda anotado en F10).
- **No se separa `rules` por documento**; es un cambio de modelo que ninguna fase pide.

---

## 8. Suposiciones que hay que confirmar antes de ejecutar

Cada una se resuelve en vivo al arrancar su fase, antes de escribir código.

1. **El disparador del reinicio de la carga (F2).** `scanAll` usa `isScanning` local; el
   disparador real puede ser otro. No se toca la pantalla hasta reproducirlo.
2. **La causa exacta del error de Proyectos (F8).** `ProjectFolderModal` y `uiSlice` son
   candidatos; hay que verlo en vivo.
3. **El estado exacto del overlay de carga.** El master viejo registró un cambio sin commitear
   de `LoadingTips` (`position: fixed`, `zIndex: 9999`). Antes de tocar la paleta, decidir si
   ese cambio está en el árbol.
4. **La persistencia (`partialize`)** en `uiSlice.ts` y `useDocStore.ts`: F8 migra
   `projectImages` a una referencia por `asset_id` **antes** de tocar el modelo de `Proyecto`.

---

## 8-bis. Directivas del 2026-09-29 (segunda pasada del usuario)

Estas respuestas del usuario AMPLÍAN el alcance de las fases. Se registran acá
para que ninguna quede a interpretación.

### 8-bis.1 La tira de portada se BORRA

Confirmado: es la barra superior que lista las estrategias en texto
(`Conservar original / APA 7 Estándar / Institucional UNI / Profesional APA /
+ Subir plantilla`), `CoverStrategyStrip` en `CoverCarouselStudio.tsx`. **Se
borra**, y se reescriben las pruebas de `coverStudioChrome.test.tsx` que la
guardan por nombre. El estado se sigue eligiendo en el carrusel; el editor ya
tiene `Cambiar plantilla` en su encabezado.

### 8-bis.2 El principio de la FASE SAGRADA

> Cada fase es un comodín: un área dedicada a UNA cosa, con sus propios
> controles, y ningún control de otra fase se mezcla con los suyos.

- **Cero contaminación cruzada.** Un control de Estructura no aparece en
  Portada, ni uno de Figuras en Revisión. Antes de dejar un control en una
  pantalla, la pregunta es "¿esto es de esta fase?". Si no, se va o se reubica.
- **El Inspector se revisa fase por fase.** El usuario no le encontró uso y lo
  percibe como ruido visual en cada fase (`RightSidePanel` / `ElementInspector`,
  montado hoy en los pasos 1 a 3). Se decide por fase: donde no aporte, **no se
  monta**; donde aporte, se reescribe para ESA fase. No es un panel global.
- **Pocos controles, categorizados.** Si una UI tiene mil botones sueltos, se
  agrupan en desplegables / secciones colapsables. Se aplica primero a **Portada**
  (hoy tiene demasiados controles sueltos) y después a cada fase.
- **La información no se vomita.** Un panel no vuelca el documento: muestra lo
  que esa fase necesita, formateado para lo que ese contenido ES (ver 8-bis.3).

### 8-bis.3 El contenido se presenta según lo que es, no en texto plano

El caso concreto que reportó el usuario, en **Objetivos**:

- El H1 "Objetivos" tenía TODO el contenido y sus H2 ("Objetivo general",
  "Objetivos específicos") aparecían vacíos. Es el bug del H2 heredando, con la
  pantalla exacta ya identificada. Repro: un H1 con párrafos numerados abajo y
  H2 debajo de esos párrafos.
- Y más allá del bug: si la rama son OBJETIVOS, la vista no puede ser texto
  plano con la fuente de la interfaz. Tiene que:
  - presentarlos organizados (general / específicos, por nivel),
  - decir la CALIDAD de cada uno (¿es medible? ¿empieza con verbo en infinitivo?),
  - ofrecer VARIANTES/Sugerencias de la IA cuando un objetivo suena flojo.

Esto es un principio, no un caso: cada fase presenta su contenido adaptado a lo
que ese contenido es (objetivos, figuras, citas, hallazgos), con la fuente de la
casa y no un `<pre>` crudo.

### 8-bis.4 Se consulta la skill de diseño

Antes de cada rediseño de superficie se invoca la skill `impeccable` y se aplica
su checklist. No es opcional: el usuario la pidió explícitamente.

### 8-bis.5 Decidir 3 vs 1 modos: por razonamiento, no por guarda

Antes de fusionar o conservar los tres modos de Estructura, hay que razonar como
el usuario pidió: **si yo fuera un estudiante y esta fase fuera mi comodín, ¿qué
debería poder hacer SOLO acá?** Ese análisis decide el 3 o el 1, y el mismo
análisis se hace para las otras fases. La guarda `focoNoBarraElSelector` se
reescribe DESPUÉS de la decisión, no antes.

---

## 9. Cómo se sabe que terminó

Un solo criterio:

> Ninguna UI puede afirmar algo que el código no hace.

Verificable, fase por fase:

- `npx vitest run` → no baja de la base verde de F0
- `npx tsc --noEmit` → limpio
- `pytest python/tests/ -q` → no baja de la base verde de F0
- `npm run build` → sin error
- `cd word-addin; npm test` → verde
- R3 de `noHardcodedColors.test.ts` cubre los siete directorios nuevos
- La regla de tokens declarados pasa
- Cero `kind` sin rótulo, cero control sin destino
- La revisión es un párrafo a la vez, en ambos temas, en los tres anchos
- Ningún layout se rompe por debajo de 1280x800
- La portada original conserva su hash byte a byte con el original activo
- Los 13 proveedores: uno con key que llega, uno con modelo que llega, uno que degrada sin
  romper, uno que se puede probar

Y una prueba manual que no es un test: abrir la app, mirar las seis pantallas en los dos temas
y a tres anchos, y no encontrar ninguna afirmación que el código no sostenga.
