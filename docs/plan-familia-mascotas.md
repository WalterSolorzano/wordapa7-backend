# Plan de implementación: familia de mascotas WordAPA7

## Objetivo

Convertir las cuatro mascotas en un pequeño equipo editorial que acompañe momentos concretos de la aplicación sin convertirse en decoración permanente ni interrumpir el trabajo.

La familia comparte lenguaje visual: contorno oscuro, colores sólidos, ojos con brillo, brazos mínimos, expresiones legibles y animaciones breves. Cada personaje tiene una responsabilidad y una forma de hablar distinta.

## Familia y responsabilidades

| Mascota | Rol | Personalidad | No debe hacer |
|---|---|---|---|
| **La resaltadora intensa** | Detectar, marcar y celebrar hallazgos | Entusiasta, rápida, un poco exagerada | No aparecer en cada subrayado del documento |
| **La regla con criterio** | Márgenes, alineación, espaciado y estructura | Seca, precisa, ligeramente crítica | No juzgar el contenido académico |
| **La cita de referencia** | Conectar citas del texto con bibliografía | Misteriosa, irónica, insistente | No usar la forma de nube fantasma actual |
| **El tachón dramático** | Corregir errores objetivos y retirar texto inválido | Teatral, contundente, breve | No borrar contenido sin acción del usuario |

## Mapa de ubicación

### 1. Inicio y carga

**Mascota principal:** La resaltadora intensa.

**Dónde:** `LoadingTips` y estados de preparación después de cargar un documento.

**Qué hará:**

- Subrayar visualmente una línea ficticia mientras el sistema analiza.
- Cambiar entre espera, curiosidad y entusiasmo según la fase.
- Hacer un único gesto de rebote cuando el análisis termina.

**Texto opcional:** Una frase breve de carga, nunca una explicación larga.

**Límite:** No aparecer junto a `MascotBubble` al mismo tiempo para evitar duplicación.

### 2. Figuras y tablas

**Mascota principal:** La regla con criterio.

**Dónde:** Encabezado contextual de `Step3FiguresTablesWizard` y estados de advertencia de tamaño/alineación.

**Qué hará:**

- Medir con una pequeña línea de referencia cuando se selecciona una figura o tabla.
- Inclinarse ligeramente cuando el elemento no está centrado.
- Volver a posición recta cuando el usuario aplica un preset.

**Texto opcional:** “Eso no está centrado.” / “Así sí entra.”

**Límite:** La regla acompaña la decisión visual; no reemplaza los controles ni agrega otro panel.

### 3. Citas y referencias

**Mascota principal:** La cita de referencia.

**Dónde:** `ReferencesPanel`, `Step5ReferencesWizard`, burbujas de citas huérfanas y búsqueda Crossref/DOI.

**Qué hará:**

- Aparecer junto a una cita huérfana con el hilo visual apuntando al problema.
- Mostrar una cara de alerta cuando falta la referencia.
- Cambiar a alivio cuando la referencia queda vinculada.
- Asomarse brevemente durante la búsqueda Crossref/DOI.

**Texto opcional:** “¿Y la referencia?” / “Ahora sí aparezco en la bibliografía.”

**Límite:** No aparecer por cada cita correcta; solo en estados de problema, resolución o búsqueda activa.

### 4. Revisión y auditoría

**Mascotas principales:** La resaltadora intensa y el tachón dramático.

**Dónde:** `ReviewWorkbench`, `Step5AuditIAWizard` y acciones de corrección objetiva.

**Qué harán:**

- La resaltadora señala el hallazgo activo y reacciona al avanzar al siguiente.
- El tachón aparece únicamente al aceptar una corrección objetiva.
- El tachón hace un desplazamiento corto y desaparece; no borra ni altera por sí mismo.
- En detector de IA no se usa el tachón, porque esa acción no es una corrección objetiva.

**Texto opcional:** “Esto sí lo marco.” / “Eso no lo firma nadie.”

**Límite:** Una sola mascota visible por hallazgo activo.

### 5. Exportación y descarga

**Mascota principal:** La resaltadora intensa como anfitriona; la regla y el tachón como apariciones secundarias.

**Dónde:** Mesa de entrega de `ExportView`.

**Qué hará:**

- La resaltadora aparece junto a la hoja de salida y hace un rebote de alivio al entrar.
- Si el usuario elige PDF, la regla puede aparecer un instante junto a la vista previa de página.
- Si se detecta una cita fantasma antes de descargar, aparece la cita de referencia, no el tachón.
- Después de una descarga correcta, la resaltadora levanta el brazo una sola vez.

**Texto opcional:** “Esto sí lo marco.” / “El documento salió presentable.”

**Límite:** La mesa de entrega no debe mostrar las cuatro mascotas juntas salvo en una animación de entrada muy breve.

### 6. Errores y estados de recuperación

**Mascota principal:** El tachón dramático.

**Dónde:** Toasts de error recuperable, fallos de exportación y acciones que requieren volver a intentar.

**Qué hará:**

- Retroceder ligeramente y quedarse quieto.
- Señalar visualmente el estado de error, sin animaciones cómicas cuando el problema sea grave.
- Desaparecer cuando el usuario reintenta.

**Texto opcional:** “Eso no salió.”

**Límite:** Nunca usar humor si hay pérdida, corrupción o riesgo para el documento.

## Sistema de expresiones

| Estado | Resaltadora | Regla | Cita | Tachón |
|---|---|---|---|---|
| Normal | Atenta | Recta | Dormida | Quieto |
| Procesando | Impaciente | Midiendo | Buscando | Preparado |
| Éxito | Eufórica | Satisfecha | Aliviada | Victoria breve |
| Advertencia | Nerviosa | Ceja levantada | Alerta | Tenso |
| Error | Apagada | Inclinada | Oculta | Retroceso |

## Reglas de movimiento

- Duración normal: entre 1.2 y 3 segundos.
- Entrada: desplazamiento corto o inclinación, nunca rebote elástico exagerado.
- Éxito: un único gesto; no mantener celebración infinita.
- Error: movimiento reducido y sobrio.
- `prefers-reduced-motion`: mostrar la pose final estática.
- No usar confeti, explosiones, parpadeo rápido ni cambios de escala agresivos.

## Arquitectura técnica propuesta

### Fase 1: sistema compartido

Crear un componente `EditorialMascot` con:

- `kind`: `highlighter | ruler | reference | strike`.
- `expression`: `neutral | curious | alert | tired | relieved | excited | worried`.
- `motion`: `idle | enter | success | warning | exit`.
- Tamaños `sm`, `md` y `lg`.
- Soporte de `prefers-reduced-motion`.
- SVG o CSS vectorial sin emojis.

Mantener un adaptador temporal para que `DocumentMascot` y `MascotBubble` no se rompan durante la migración.

### Fase 2: integración por superficie

1. `LoadingTips` y carga inicial.
2. `Step3FiguresTablesWizard`.
3. `ReferencesPanel` y referencias huérfanas.
4. `ReviewWorkbench` y acciones de auditoría.
5. `ExportView` y mesa de entrega.
6. Toasts y estados de error.

### Fase 3: textos y frecuencia

Centralizar las frases en un catálogo por mascota y situación. El store debe seguir controlando el rate limit de mensajes para que una mascota no hable repetidamente durante una misma acción.

## Cronograma por días completos

| Día | Trabajo | Resultado verificable |
|---|---|---|
| **Día 1** | Crear `EditorialMascot`, tokens de tamaño, expresiones y motion states | Componente aislado renderiza las cuatro mascotas |
| **Día 2** | Implementar las cuatro ilustraciones y poses del mockup | Cada mascota tiene silueta y cara propia |
| **Día 3** | Integrar carga inicial y `LoadingTips` | La resaltadora acompaña el análisis sin duplicar burbujas |
| **Día 4** | Integrar figuras y tablas | La regla aparece solo en selección y problemas visuales |
| **Día 5** | Integrar referencias y citas huérfanas | La cita de referencia acompaña búsqueda y resolución |
| **Día 6** | Integrar revisión y tachón | El tachón solo acompaña correcciones objetivas |
| **Día 7** | Integrar `ExportView` y mesa de entrega | La descarga tiene personalidad y acciones funcionales |
| **Día 8** | Catálogo de frases, rate limit y accesibilidad | No hay repetición molesta ni mensajes duplicados |
| **Día 9** | Pruebas de estados, tema claro/oscuro y reduced motion | Todas las poses son legibles y no rompen layout |
| **Día 10** | Revisión visual de escritorio y móvil, limpieza y documentación | Familia lista para aprobación final |

## Criterio de aprobación

La familia se considera lista cuando:

- Cada mascota se reconoce por su silueta sin leer su nombre.
- Cada una tiene una función concreta dentro del flujo.
- Las caras se entienden a 32px y 64px.
- Las animaciones no distraen de la escritura ni del documento.
- Ningún estado repite frases de validación ya mostradas en otra pantalla.
- La mascota nunca muta el documento por sí misma.
- Las pruebas existentes de revisión, descarga y `DocumentMascot` siguen pasando.
