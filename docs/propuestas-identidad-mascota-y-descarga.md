# Propuestas de identidad para la mascota y la descarga

## Diagnóstico

La mascota actual funciona como un sello de validación: una hoja rectangular, líneas de texto y un check. Eso comunica precisión y control, pero no comunica el humor editorial que ya existe en WordAPA7. Se siente más como un icono corporativo que como un personaje con criterio propio.

La fase de descarga también necesita personalidad, pero sin convertirse en una pantalla de celebración genérica ni repetir auditorías, porcentajes o estados APA.

## Dirección recomendada: la hoja con criterio

Una hoja de papel APA convertida en personaje editorial:

- Cuerpo de hoja blanca, reconocible incluso a tamaño pequeño.
- Ojos y cejas que cambian según la situación.
- Boca y brazos mínimos, con expresiones legibles sin texto.
- Un pequeño lápiz como accesorio ocasional, no como decoración permanente.
- Gestos secos y académicos: cansancio después de revisar, alivio al exportar, sospecha ante una cita huérfana y curiosidad al abrir la previsualización.
- Nada de mascota infantil, mascota tecnológica ni robot.

La personalidad sería la de un editor de tesis que ya ha visto demasiados documentos con títulos en negrita incorrecta, pero sigue ayudando.

## Familia de mascotas

La identidad puede vivir mejor como un equipo editorial que como un único personaje que cambia de forma. Comparten contorno oscuro, ojos con brillo, brazos mínimos, expresiones claras y humor seco; cada uno tiene una función concreta:

- **La resaltadora intensa**: detecta, marca y reacciona con entusiasmo.
- **La regla con criterio**: cuida márgenes, alineación y proporción; su humor es seco.
- **La cita de referencia**: una nota morada con comillas y una cola de referencia, no una nube fantasma; aparece cuando el vínculo entre texto y bibliografía no está claro.
- **El tachón dramático**: cruza errores de estilo o texto y sale de escena con exageración controlada.

La familia completa está prototipada en `public/mascot-family-mockup.html`.

### Expresiones sugeridas

| Momento | Expresión | Movimiento |
|---|---|---|
| Estado normal | Mirada atenta | Respiración muy leve |
| Exportación lista | Alivio | Rebote corto y brazos arriba |
| Cita huérfana | Sospecha | Ceja levantada y leve inclinación |
| Revisión pesada | Agotamiento | Parpadeo lento, hombros bajos |
| Previsualización | Curiosidad | Se asoma detrás de la hoja |
| Error | “Esto no me convence” | Retroceso corto, sin dramatismo |

## Otras direcciones posibles

### 1. El corrector agotado

Una hoja con ojeras, lápiz detrás de la oreja y expresiones de cansancio. Es la opción más cómica y cercana, pero puede volver demasiado infantil una herramienta académica.

### 2. El sello burocrático

Un sello APA con ojos, fechador y gestos secos. Tiene mucho potencial para estados de aprobación y rechazo, pero representa peor la edición cotidiana del documento.

### 3. La nota al margen

Una anotación adhesiva que aparece, se estira y hace comentarios breves. Es flexible y muy expresiva, aunque menos propia de la identidad de papel APA.

## Propuesta para la fase de descarga

Mantener la columna izquierda funcional y usar el espacio derecho como una **mesa de entrega**:

- La mascota aparece junto a una hoja de salida, no dentro de una tarjeta.
- La hoja cambia de inclinación suavemente.
- La mascota reacciona al formato elegido.
- Un botón abre la previsualización real del documento.
- No se agregan listas de validación, métricas ni frases repetidas.
- Después de descargar, las acciones “Abrir archivo” y “Mostrar en carpeta” aparecen junto al resultado.

La escena debe sentirse como una pausa con personalidad, no como un dashboard vacío ni como una pantalla de marketing.

## Microcopy sugerido

La mascota no debería hablar siempre. Cuando hable, una sola línea y con humor seco:

- “Ya está. Esta vez los márgenes no se escaparon.”
- “El documento salió presentable. Puedes respirar.”
- “PDF listo. Word también, si todavía quieres editarlo.”
- “Encontré una cita sospechosa, pero no voy a detener la entrega.”
- “La portada sigue intacta. Como debe ser.”

Estas frases deben aparecer en momentos concretos, no como texto permanente de la pantalla.

## Recomendación de implementación

1. Rediseñar `DocumentMascot` como personaje de hoja con rostro y extremidades mínimas.
2. Mantener la misma API de `expression` para no romper `MascotBubble`, comentarios ni pantallas de carga.
3. Añadir animaciones CSS por expresión y una variante `reduced-motion` estática.
4. Usar el personaje en la mesa de entrega, en la burbuja de mensajes y en estados de revisión.
5. Evitar que la mascota aparezca en todas las pantallas: debe ser un evento editorial, no un logo permanente.

## Qué no hacer

- No usar emojis.
- No añadir un robot, un cerebro o un asistente holográfico.
- No usar ojos gigantes, rebotes constantes ni confeti.
- No llenar la descarga de tarjetas, porcentajes o resúmenes.
- No convertir cada acción en un chiste: el humor funciona mejor cuando aparece con moderación.
