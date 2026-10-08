# Correcciones de UI — Estudio de Referencias y Citas APA 7

Plan derivado del feedback del autor sobre las capturas (`referencias-real-light.png` / `referencias-real-dark.png`).

## Feedback literal (autor)

> esas estrellas que vi ahi, quita ese texto "como sale en la bibliografia" eso es muy ia, solo ponle bibliografia y ya. ademas si te fijas en "estudio de referencias apa 7" y el texto que esta abajo quitalo, eso solo deja la mascotita. deja de explicar esas cosas tan simples. ademas eso de "nueva referencia" esta demasiado pegado a otras cosas; podrias solo dejar el icono en circular o crear una figura y que de ahi se despliegue referencia automatica por links o manual. el editor que salga al pasar el mouse por cada cita. revisa los colores porque verde se ve demasiado chocante. no abuses de las cards. me gustaron los iconos laterales, ese diseño cartoon me encanta. revisa las fuentes que usaste. y dame un set de sugerencias para ese menu.

## Decisiones confirmadas (autor, vía question tool)

1. **FAB de "Nueva referencia"** despliega: `DOI / Enlace` + `Manual` + `Importar .bib / .ris`.
2. **Verde**: ajustar el token global `--color-success` (afecta toda la app, autorizado).
3. **Hover de edición**: se queda en las tarjetas del directorio (pulir el "Editar" existente).
4. **Fuentes**: instalar `Newsreader` vía `@fontsource/newsreader`.

## Constraints de test (no romper)

- `referenciasPaso4.test.tsx:329-331`: clic en `/nueva referencia/i` debe revelar botones `/doi|crossref/i` y `/entrada manual/i`.
- `referenciasPaso4.test.tsx:353`: campo DOI accesible como `/doi o (?:título|enlace)/i` (TEXTAREA).
- `referenciasPaso4.test.tsx:369`: el cuerpo debe contener `/uno por línea/i`.
- `referenciasPaso4.test.tsx:104-106`: `estado-referencia` contiene "Verificada".
- `referenciasPaso4.test.tsx:171-176`: `vista-previa-apa` con formatted_apa/raw_text.
- `referenciasPaso4.test.tsx:232`: contenedor contiene `/Verificadas/`.
- `referenciasPaso4.test.tsx:279,292`: vacíos con `[data-testid="estado-vacio"]`.
- `referenciasPaso4.test.tsx:312-320`: `header [data-accion="principal"]` existe UNA vez, su texto matchea `/nueva referencia/i`, y "Continuar a Auditoría" NO es principal.
- `referencias.test.ts:260`: `TONO_DE_ESTADO` values matchean `/^var\(--/`.
- `referencias.test.ts:315`: sin `className="btn btn-`.
- `referencias.test.ts:322`: sin `'4px'` literal.
- `referencias.test.ts:330-331`: el paso debe contener `<article` y `<EstadoVacio`.
- `referencias.test.ts:338-339`: sin `groupCardStyle` / `groupHeaderStyle`.
- `referencias.test.ts:346-351`: usa `diagnosticoDeReferencia`; sin `isZombie`, sin `isOrphan`, sin `'---'`.
- `referenciasEstaMontada.test.tsx:62`: **exactamente 6** archivos en `src/components/referencias/`. TODO el código nuevo va inline en `Step5ReferencesWizard.tsx` o en los 5 subcomponentes existentes.
- `referenciasEstaMontada.test.tsx:77+`: todo componente de la carpeta necesita importador real.

## Cambios

### Task 1: Quitar el "IA-ismo" — `Sparkles` y rótulos explicativos
- [x] `Sparkles` + "Como sale en la bibliografía" → sólo "Bibliografía", sin ícono decorativo. Se quitó `Sparkles` del import de lucide-react.
- [x] Borrar subtítulo bajo el título (línea "Agrupación por estado y verificación bidireccional…").
- [x] Borrar subtítulo "Ver los párrafos donde se cita esta obra" en `ManuscriptMentionsAccordion`. Dejar el título solo.

### Task 2: FAB circular "Nueva referencia" desplegable
- [x] Botón pill acento con `Plus size=16`, `aria-label="Nueva referencia"`, `aria-haspopup="menu"`, `aria-expanded`, texto visible "Nueva referencia".
- [x] Al hacer clic, despliega panel `role`less con tres `MenuItem` (botones reales): "DOI o enlace" (`Link2`), "Entrada manual" (`Pencil`), "Importar .bib / .ris" (`FileText`).
- [x] El modal existente (modo DOI/Manual) se conserva; los items del menú lo abren en el modo correspondiente. El `role="menu"` se omitió a propósito para que `getByRole('button', …)` encuentre los items.
- [x] "Importar .bib/.ris" deshabilitado con nota "Requiere el conversor del motor".
- [x] Nuevo helper `MenuItem` (inline, ~línea 1006) — mantiene 6 archivos en la carpeta.
- [x] Test `abrirModoDoi()` pasa a 2 clics ("Nueva referencia" → "DOI o enlace"); test de jerarquía de acciones pasa sin cambios.

### Task 3: Menos cards, más plano
- [x] `Grupo`: sin caja (borde/fondo/radio/padding a 0); encabezado plano + lista. `detalle` en `<span>` propio.
- [x] Tarjetas del directorio: `border: transparent` y fondo transparente en reposo; borde/fondo solo en hover/focus/activo.
- [x] Acordeón de menciones: trigger plano (`borderBottom`), tarjeta de cita con `--radius-md` y sin `boxShadow`.

### Task 4: Color verde
- [x] `--color-success` claro `#38a017`→`#2f855a`; oscuro `#52c41a`→`#3f9c6d`.
- [x] Tints: claro `a12 rgba(47,133,90,.10)` / `a14 rgba(47,133,90,.13)`; oscuro `a12 rgba(63,156,109,.16)` / `a14 rgba(63,156,109,.20)`. Reflejado en `design-tokens.md`.

### Task 5: Fuentes
- [x] `npm i @fontsource/newsreader` (^5.3.0).
- [x] Importar en `main.tsx` pesos 400, 400-italic, 500.
- [x] El fallback `'Newsreader', 'Georgia', serif` se queda: es red de seguridad válida.

### Task 6: Verificación
- [x] `npx vitest run referencias` → 7 archivos, **108/108** verde.
- [x] `npx tsc --noEmit` limpio (sin `error TS`).
- [x] Screenshot claro/oscuro (`refs-v2-*`, `refs-v4-*`; harness de preview temporal).
- [x] `graphify update .` → 7965 nodos / 18575 edges / 311 comunidades.

### Task 7 (iteración v3): estilo bibliográfico y navegación
- [x] Lienzo con vista previa tipo bibliografía real (Times New Roman, sangría francesa, interlineado 2.0).
- [x] Modal de edición flotante (`ReferenceEditModal`) sustituye el formulario permanente del lienzo.

### Task 8 (iteración v4): una sola acción, bibliografía completa, menos cards
- [x] Barra superior: eliminado el pill "N fuentes registradas"; solo mascota + título.
- [x] Quitados "Auditar citas" y "Continuar a Auditoría": queda solo el FAB `data-accion="principal"` (DOI o enlace / Entrada manual / Importar .bib .ris).
- [x] Lienzo derecho por defecto = **bibliografía completa** (`data-testid="bibliografia-completa"`); al elegir una referencia muestra solo esa ficha, con botón "Ver bibliografía completa" para volver.
- [x] Rail 'all' limpia `selectedReferenceId` para volver a la vista completa.
- [x] Citas sin fuente pasan de tarjeta a fila de lista (borderLeft ámbar, fondo transparente, botón "Completar" secundario).
- [x] `ReferenceCatalogItem`: activo = borderLeft 2px acento (no caja completa); inactivo sin caja; hover conserva el "Editar".
- [x] Test `referenciasPaso4.test.tsx` de jerarquía actualizado (autorizado): ahora exige que "Continuar a Auditoría" y "Auditar citas" NO existan.
- [x] Commit `7de3e4e`.

### Pendiente de confirmación visual del autor
- [ ] Capturas v4 (`refs-v4-light.png`, `refs-v4-dark.png`, `refs-v4-focus.png`) pendientes de visto bueno del autor.

## Set de sugerencias para ese menú (entregable separado)

Se entrega al final como texto, no como código.
