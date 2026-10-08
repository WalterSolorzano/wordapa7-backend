# Bloque B — Renumeración proactiva de figuras y tablas (spec)

## 1. Meta

Que la numeración de figuras y tablas quede siempre en orden de aparición y que
sus rótulos (caption) y las menciones en el texto ("ver Figura 3") no se
desincronicen solos. Hoy la app **detecta** el cruce (`apa_validator`,
`doc_auditor`) pero **no lo corrige**: no existe ninguna función de renumeración
sobre el modelo vivo.

## 2. Decisiones del dueño (fuente de verdad)

- **Disparo: automático proactivo.** Se renumera solo después de insertar,
  borrar o reordenar una figura/tabla, y después de auto-rotular. Sin botón
  manual.
- **Alcance de la corrección: rótulo + menciones en texto.** Se corrige el
  número guardado, el rótulo de la caption y las menciones en los párrafos.

## 3. Refinamiento respecto del diseño conversacional (revisar)

En el chat propuse una función pura en `src/lib/renumerar.ts` (frontend). Al
verificar el guardado, se confirmó que **el frontend no puede persistir un
cambio local**: cada mutación llama a su propio endpoint y el autoguardado
(`useAutosave`) solo crea un *snapshot del estado del servidor*
(`saveSessionSnapshot`), no empuja el documento local. Guardar la
renumeración con `N` llamadas por elemento sería lento, no atómico y cada
llamada dispara un snapshot.

Por eso la lógica vive en **Python** (`python/modules/renumerar.py`, pura y
testeable) y se expone en **un solo endpoint atómico** que persiste el estado y
devuelve el documento actualizado. El frontend solo llama, aplica el resultado,
registra el historial y avisa. Mismo resultado visible para el usuario; una sola
escritura y una sola fuente de verdad. Si preferís la lógica en TypeScript, se
puede cambiar antes de implementar.

## 4. Alcance

- Numeración **separada** por tipo (figuras: 1..N; tablas: 1..M), en orden de
  aparición, para **todo el documento** (APA 7).
- Se numeran **todas** las imágenes y tablas del cuerpo, tengan o no caption
  (el número es independiente del rótulo).
- Se excluye la portada (`is_cover_section == True`): ni se numera ni se toca su
  texto.
- Se reescribe el rótulo **solo si la caption ya empieza con una etiqueta**
  (`Figura N` / `Tabla N`). No se inventan rótulos.
- Se reescriben las menciones en párrafos del cuerpo: `Figura N`, `Fig. N`,
  `Tabla N`, `Tab. N` (sin distinguir mayúsculas). Se cambia **solo el número**,
  conservando la forma y el formato.

### Fuera de alcance

- Ecuaciones (`EquationConfig.number` es `string` y se numera aparte).
- Subfiguras (`Figura 1a`).
- Cuadros y anexos.
- Inventar captions faltantes (eso ya lo hace el motor de estructura) o resolver
  referencias a números inexistentes (eso lo reporta `apa_validator`).
- Reescribir la "Lista de figuras/tablas" (no existe hoy).

## 5. Comportamiento

### 5.1 Función pura `renumerar(doc: DocumentModel) -> ResultadoRenumeracion`

Recorre `doc.elements` en orden:

1. Para cada `type == "image"` (no portada) asigna el correlativo de figura;
   para cada `type == "table"` (no portada) el correlativo de tabla. Guarda el
   número anterior (`image_info.figure_number` / `table_info.table_number`).
2. Construye un mapa `viejo -> nuevo` por tipo.
   - Un `viejo` en `0`/ausente no entra al mapa (no pudo ser referenciado).
   - Si dos elementos comparten el mismo `viejo`, ese número queda **ambiguo**:
     no se reescriben sus menciones.
3. Reescribe el rótulo de la caption con regex
   `^(\s*(?:figura|tabla)\s+)(\d+)` (ignora mayúsculas) sustituyendo solo el
   número; el resto del texto queda intacto.
4. Recorre los párrafos del cuerpo (`type == "paragraph"`, no portada) y
   sustituye menciones con `\b(figura|fig\.?)\s+(\d+)\b` y
   `\b(tabla|tab\.?)\s+(\d+)\b` (ignora mayúsculas): si el número está en el
   mapa del tipo, no es ambiguo y cambia, se reemplaza el número.

Devuelve:

```
ResultadoRenumeracion:
  doc: DocumentModel                 # copia con los cambios aplicados
  cambios: list[Cambio]              # { clase: "numero"|"caption"|"mencion",
                                     #   tipo: "figura"|"tabla",
                                     #   element_id, de, a }
  ambiguos: list[Ambiguo]            # { tipo, numero }
  resumen: { figuras, tablas, menciones }
```

Sin cambios → `cambios` vacío y `doc` igual al original.

### 5.2 Endpoint `POST /api/renumerar-figuras-tablas/{session_id}`

- Carga el estado (`load_session_state`); 404 si no existe.
- Corre `renumerar`, **guarda** (`save_session_state`) y devuelve
  `{ doc, cambios, ambiguos, resumen }`.
- Es idempotente: correrlo dos veces no cambia nada la segunda vez.

### 5.3 Acción de store `renumerarProactivo()`

- Guarda si no hay `doc.session_id`.
- Llama al endpoint; si `cambios` está vacío no avisa ni toca el historial.
- Si hay cambios: `pushHistory(docActual)` (una sola entrada, el deshacer
  funciona), luego `set({ doc: actualizado, hasUnsavedChanges: false,
  lastSavedAt: Date.now() })`.
- Aviso de éxito: `Se renumeraron X figuras, Y tablas y Z menciones`.
- Si hay `ambiguos`: aviso aparte (advertencia) `Hay números de figura/tabla
  repetidos; no se corrigieron sus menciones`.

### 5.4 Disparo proactivo

Se llama a `renumerarProactivo()` después de:

- `insertImageElement` (insertar imagen),
- `reorderElements` (reordenar),
- `autoCaptionAll` (auto-rotular).

No hay acción de borrado de imagen/tabla en el store hoy; si se agrega, se
suma aquí. No se agrega botón manual.

## 6. Archivos

- Crear: `python/modules/renumerar.py` (función pura + dataclasses).
- Crear: `python/tests/test_renumerar.py`.
- Modificar: `python/routers/sessions.py` (endpoint, junto a
  `reorder-elements`).
- Modificar: `python/tests/` del endpoint (test de integración nuevo).
- Modificar: `src/api/backend.ts` (`renumerarFigurasTablas`).
- Modificar: `src/store/types.ts` (declarar `renumerarProactivo`).
- Modificar: `src/store/slices/documentSlice.ts` (implementar + disparos en
  `insertImageElement`, `reorderElements`).
- Modificar: `src/store/slices/auditSlice.ts` (disparo en `autoCaptionAll`).
- Crear: `src/__tests__/renumerarProactivo.test.ts`.

## 7. Casos borde

- Documento sin figuras ni tablas → no-op.
- Una sola figura con número ya correcto → no-op.
- Figura sin caption → se numera, no se toca ningún rótulo.
- Caption sin etiqueta (`"Descripción"`) → no se le agrega etiqueta.
- Menciones a un número inexistente → se dejan (las reporta la auditoría).
- Números repetidos → menciones de ese número no se tocan; se reportan.
- `Fig. 2` y `fig 2` → se reescriben conservando la forma.
- Portada → intacta (números, captions y texto).
- Ecuaciones → intactas.

## 8. Criterios de aceptación

1. Insertar una figura entre la 1 y la 2 renumera la 2 y las siguientes, y
   actualiza sus captions y menciones.
2. Reordenar dos figuras intercambia sus números en captions y menciones.
3. Ninguna regla toca la portada (`is_cover_section`).
4. Números repetidos → no se reescriben sus menciones y hay aviso.
5. Deshacer (una entrada de historial) revierte todo el cambio.
6. Recargar la sesión mantiene la numeración (está persistida).
7. Las ecuaciones no cambian.
8. `pytest`, `vitest` y `tsc --noEmit` verdes; suite previa sin regresiones
   nuevas (los rojos preexistentes de `src/components/figures/**` del dueño
   quedan igual).

## 9. Constraintes globales (del proyecto)

- Cero emojis; solo íconos `lucide-react`.
- Cero colores literales; solo tokens CSS.
- La UI no afirma lo que el código no hace.
- `git add` explícito por archivo, nunca `-A`.
- No usar `git worktree`.
- Comentarios y commits en español, sin caracteres CJK.
- No tocar `LICENSE` ni `README`.
