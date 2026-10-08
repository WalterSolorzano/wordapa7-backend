# Carrusel de portada: centro fijo y miniatura real

Plan de la tarea pedida tras la captura del 2026-09-29 23:54.

## Lo que se reportó

1. La tarjeta activa no queda al centro.
2. No hay controles para mover el carrusel.
3. Las tarjetas están mal formateadas: las lejanas salen como losas grises.
4. Las miniaturas no son el diseño real que sale en Word.

## Causa raíz (verificada)

- `CarruselPortada.tsx:341-347`: una tarjeta a más de `VECINAS_POR_LADO` de la
  activa recibe `transform: undefined` (tamaño completo) y, encima,
  `filter: brightness(0.48)` (líneas 349-353). El papel blanco se multiplica a
  un gris plano: la tarjeta se ve como una losa vacía.
- `MiniaturasDeDiseno.tsx` es un dibujo paralelo del diseño con `Times New
  Roman` y tamaños a mano; no usa los renders que sí usan el editor y el
  `.docx`.
- El defecto entró en `f9f360f` (21:18). Las capturas buenas son de las 20:09.
- La guarda `carruselPortada.test.tsx:164-177` clava el defecto: exige que las
  tarjetas lejanas pierdan el `transform`.

## Tareas

- [x] 1. RED: `carruselPortada.test.tsx` reescrito (14 pruebas, 6 en rojo por la
      razón correcta: sin render real, sin fila, y con `brightness`).
- [x] 2. `MiniaturaRealDePortada.tsx`: render real a escala
      (`UNICoverPreview` / `APACoverEditor` / `PaperCanvas onlyCover`).
- [x] 3. `APACoverEditor`: prop `soloLectura`, `data-testid="portada-apa-sheet"`
      y sin ids duplicados cuando dibuja la miniatura.
- [x] 4. `CarruselPortada.tsx`: fila al centro por índice, sin `filter`,
      flechas junto a la hoja, teclado y arrastre.
- [x] 5. GREEN: vitest 1589/1589, `tsc` limpio.
- [x] 6. Verificación en pantalla real (capturas `shot_1..3`) más el arreglo de
      un defecto que la captura destapó: `<button>` dentro de `<button>` (la hoja
      pasó a ser hermana del botón que elige).
- [x] 7. Instalador nuevo (1.0.66).

## Lo que queda a la vista

- Con el índice en el primero o el último, el lado que no tiene tarjetas queda
  vacío: es la consecuencia de centrar la activa en una lista finita. La vuelta
  circular (que la anterior de la primera sea la última) está descartada por la
  guarda que dice que un carrusel no es un portal; si se quiere, se discute
  aparte y se reescribe la guarda.
- `MiniaturasDeDiseno.tsx` se borró: era el dibujo paralelo que esta tarea
  reemplazó. La guarda de colores de portada (`portadaNoMiente`) ahora nombra
  `MiniaturaRealDePortada` y `APACoverEditor` en su lugar.

