# Estado de la corrección — WordAPA7

Planes de referencia:
- `docs/superpowers/specs/2026-09-29-plan-correccion-por-fases-design.md` — plan
  por fases (F0–F10) + §8-bis con tus directivas.
- `docs/superpowers/specs/2026-09-29-fases-sagradas-design.md` — **qué vive en
  cada pantalla**, la decisión 3-vs-1 y el **inventario de controles por fase**
  (§6: control por control, qué hay hoy y qué se decide con cada uno).

## Lo que quedó hecho

| Commit | Qué | Verificación |
|---|---|---|
| `25182ff` | **F0** base verde (las 7 guardas + `beautifulsoup4`) | vitest · tsc · pytest 1025/15 |
| `f8cccc8` | **F4** el índice sin banda navy ni borde azul | vitest · tsc |
| `80c28a9` | **F3** la tira de portada se borra; el carrusel es la única superficie | vitest · tsc |
| `2b8bec5` | **F3** el editor de portada en secciones plegables | vitest · tsc |
| `efbd194` | **plan** fases sagradas + decisión 3-vs-1 | — |
| `f80d645` | **F4** el general de objetivos sale del documento, no de la posición | vitest · tsc |
| `7d61902` | **test** viñetas del H2 son del H2 y el H1 las suma (motor clavado) | vitest · tsc |
| `987e7ac` | **F4** el inspector general se va; el panel no se abre solo | vitest · tsc · build |
| `2c2b636` | **ecuaciones** el editor vuelve como destino propio | vitest · tsc · build |
| `6a3e9ec` | **F4** el pulso de 5 números se va de Estructura | vitest · tsc · build |

Todo verde: vitest **1561**, tsc limpio, build OK.

## Tus preguntas, respondidas

**«¿Razonaste las interfaces, fases y botones? ¿Está en el plan?»**
Sí, y quedó por escrito en `fases-sagradas-design.md`. Ese documento tiene las
nueve fases (comodín / entra / no entra / agrupación), la decisión 3-vs-1 de
Estructura (§2), el caso Objetivos (§2.4) y ahora, además, el **inventario de
controles por fase** (§6) que es lo que faltaba: control por control, lo que hay
HOY en pantalla y la decisión de cada uno. Salió de leer el código, no de
recordarlo.

Lo que salió de ese razonamiento, en corto:
- **Estructura = una sola superficie.** Las tres pestañas no son tres trabajos;
  dos violan la prueba de pertenencia. Promover/renombrar/diagnosticar pasan a
  ser acciones del nodo. La guarda `focoNoBarraElSelector` se reescribe, no se
  borra.
- **Objetivos**: la vista se adapta a lo que hay —general y específicos sacados
  del documento, con nivel de Bloom, calidad y variantes—, no texto plano.
- **Referencias**: `Nueva referencia` está **tres veces** (líneas 360, 411 y 610
  de `Step5ReferencesWizard.tsx`) y hay tres verbos de guardado para lo mismo.
  Queda uno de cada.
- **Exportar**: sigue con `MESA DE ENTREGA` + ajustes + vista previa en tres
  bloques, contra la regla de columna única de `AGENTS.md`. Se rehace en F9.
- **Figuras y tablas** pasa a ser **Figuras, tablas y ecuaciones**.

**«El pulso»**
Borrado (`6a3e9ec`), como pediste: no se ve utilidad ahí. Cada dato duplicaba
algo que ya vive donde se acciona —figuras sin leyenda en su fase, referencias
sin citar en el rail, fases que faltan en `FaltasApa7`—, y palabras y balance
son métricas sin acción. La guarda ahora exige que la tira NO esté, para que
nadie la reintroduzca muda. Si querés métricas con iconos y color de la paleta,
van como **superficie propia**, no como tira arriba del trabajo.

**«Las ecuaciones son prioridad»**
Restauradas (`2c2b636`). Al borrar el inspector se había ido con él la ÚNICA UI
de numeración de ecuación; ahora es un editor propio, con el mismo patrón que el
editor de figura: aparece al seleccionar una ecuación. Tiene numeración (mostrar
número, formato, número fijo), alineación con `aria-pressed` y tipografía de
apoyo; el XML (OMML) no se toca. La persistencia es una action propia
(`updateElementEquation`) que entra en el deshacer, no un reuso de
`updateElementType`. El control responde al instante y el guardado va detrás.

## Próximo paso

1. **F4**: ejecutar la superficie única de Estructura —reescribiendo la guarda
   `focoNoBarraElSelector`— + la vista de Objetivos de §2.4. Para la reescritura
   de la guarda te voy a mostrar la propuesta antes de tocarla.
2. **F5**: plegar el editor de ecuación dentro de la fase de figuras (que pasa a
   ser «Figuras, tablas y ecuaciones»).
3. F3 (miniatura real a escala), F6 (referencias: dedupe), F7 (revisión), F8
   (proyectos), F9 (exportar), F2 (carga), F10 (IA).
