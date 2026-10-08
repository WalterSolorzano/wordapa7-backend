# Mapa de calor de IA: por sección, no por párrafo

> **Estado: diseño propuesto.** Tres decisiones abiertas al final, y son tuyas.
> Spec madre: `docs/superpowers/specs/2026-09-27-catalogo-revision-58-reglas-design.md`, D8.

## Lo que pediste, en tres niveles

1. **Cada título con su color, grande.** Vista de la tesis entera de un vistazo: qué secciones
   parecen más IA. No por párrafo, que es demasiado denso.
2. **Clic en un título → los párrafos con IA de esa sección, bien separados.** Y a un lado
   por qué tiene IA, qué porcentaje, colores.
3. **Un chat chico ahí mismo**: "podemos pedirle a la IA su opinión?", aceptás, y abajo se
   genera una propuesta para ese párrafo. Además, subrayar las palabras concretas que son IA
   dentro del párrafo.

Con una condición que pusiste vos y que es la difficult: **mucho color, pero que no se vea
cargado.** Simple y fácil de leer, porque el problema es corregir páginas inmensas de cosas.

## La regla que resuelve la tensión color/carga

**El color carga UNA sola dimensión: la intensidad. Todo lo demás es texto.**

Si el color además codifica el motor, la severidad y el tipo de problema, tres variables
compiten por el mismo canal y la vista se vuelve ilegible — que es el modo de falla clásico
de los mapas de calor. Entonces:

| | Cómo se muestra |
|---|---|
| Intensidad de IA | **color** (una rampa de 4 escalones) |
| Por qué | texto, en el panel lateral |
| Qué regla falló | texto, con su etiqueta de siempre |
| Motor | texto, nunca color |

**Cuatro escalones, no un degradado.** Un degradado continuo sobre doce secciones produce doce
matices distintos y el ojo no los ordena. Cuatro escalones se comparan de un vistazo. Los
cortes son por cuartiles de la distribución del documento, no absolutos: un documento entero
"medio IA" tiene que poder leerse neutro.

**La rampa son tokens nuevos**, porque `AGENTS.md` §1 prohíbe hex y `noHardcodedColors.test.ts`
vigila. Hoy tenés `--severity-*`; falta una rampa de intensidad con cuatro pasos que arranque
en "nada sospechoso" y termine en "esto hay que reescribirlo". Es la única pieza de design
system que hay que agregar.

## Lo que ya existe y no hay que inventar

Revisé los puntos de integración y esto sale más barato de lo que parecía:

- **`ReadingText` ya marca spans arbitrarios.** `MarkKind` incluye `'ai'`, y `ReadingMark` es
  `{start, end, kind, severity, title}`. **Subrayar palabras concretas ya está hecho**; lo que
  falta es que el análisis devuelva *cuáles* palabras, que es una pregunta de datos.
- **El panel lateral ya existe**: el rack de 400px de `ReviewWorkbench`. El mapa de calor no
  agrega una columna: **reagrupa el rack por sección** en vez de por motor, y ahí cabe el "por
  qué", el porcentaje y el chat. Es el mismo contenedor con otro eje.
- **`marks: Map<página, MinimapMark>` ya tiñe por página** con el motor dominante. El nivel 1
  usa el mismo mecanismo, con sección en vez de página.
- **La intensidad por párrafo ya se calcula gratis**: `ai_score` e `ai_category` vienen por párrafo
  del detector. Agregar el nivel 1 es agregar, no construir.

## El nivel 3 tiene una tensión con los límites, y tiene salida

Para subrayar *qué palabras* son IA hace falta un modelo que lo diga, y eso es una llamada por
párrafo — justo lo que los RPM (10 a 30) no aguantan en una tesis entera.

**La salida es el orden que ya está decidido** (D10 del spec madre): primero el detector
gratuito que ya corre y **puntúa** cada párrafo; después, el modelo **solo entra a los párrafos
que ya salieron altos** para decir qué palabras. Un documento con 40 párrafos sospechosos son 40
llamadas, no 300. Cabe en la cuota.

Y si se agota, **lo dice**: cuántos párrafos quedaron sin explicación. Un motor que se calla en
silencio es indistinguible de uno que no encontró nada, que es la peor falla posible acá.

## Por qué esto no contradice `AGENTS.md`

`AGENTS.md` §1 dice: la revisión es un párrafo a la vez, no reintroducir las tres columnas, y el
detector de IA es probabilístico con "Marcar para revisar" y nada más. El mapa de calor:

- **no es una columna nueva**: el rack reagrupado.
- **no es lectura en tabla sino navegacion**: el nivel 1 es un índice, el nivel 2 es el rack, y el
  nivel 3 es un párrafo — que es la lectura secuencial de siempre.
- **no aplica nada**: el chat genera una *propuesta*, y aceptarla es un acto explícito de la
  persona. Igual que hoy con cualquier corrección del corrector.

## Las tres decisiones que son tuyas

**1. ¿Dónde vive el nivel 1, la tira de secciones con color?**
Lo natural es arriba del rack, replacing el agrupado por motor cuando estás en modo mapa. La
alternativa es una tira horizontal arriba de todo. Recomiendo la primera: no compite con el
documento por el ancho y el rack ya es "la lista de lo que hay".

**2. ¿Qué mide la intensidad: el promedio del título, o la proporción de párrafos sospechosos?**
El promedio deja que un párrafo extremo painted de rojo toda una sección. La proporción es más
honesta y más comparable entre secciones. Recomiendo **proporción de párrafos sobre el
umbral**, que además ya es el número que muestra el panel lateral — no dos métricas distintas
para lo mismo.

**3. ¿El subrayado por palabras, en todo el documento o solo en la sección abierta?**
En todo el documento obliga a Calculating para los 300 párrafos que no vas a mirar hoy, y
sumado al presupuesto de llamadas es lo que lo hace inviable. Solo en la sección abierta lo hace
honesto y barato. Recomiendo **solo en la sección abierta**, y que el chat sea el que trae el
resto cuando lo pidás.
