# Diseño — Bloque A: Seguridad del documento

Fecha: 2026-10-06
Estado: propuesto, pendiente de revisión del dueño.
Autor: orquestador (DeepSeek V4.1 Flash). Implementación prevista: subagente en modelo más barato.

## Contexto

Decisiones del dueño (registradas en `docs/notas/2026-10-06-decisiones-producto-10-10.md`):

- Los **originales** se guardan en una carpeta interna de la app.
- "Abrir en Word" debe abrir **un archivo distinto al original**.
- Al **descargar, la app pregunta el nombre**.
- Prioridad 1 = datos a salvo (eje 1).

## Problema 1 — "Enviar a Word" pisa el original

**Hoy:** `POST /api/send-to-word/{session_id}` (`python/main.py:3352`) recibe
`dest_path` = `activeFilePath` (el archivo real del usuario, `ExportView.tsx:132`),
le hace un único `.bak` (`_respaldo_de`, `main.py:3288`) y hace
`shutil.copy2(output, dest)` (`:3448`). **Escribe sobre el original.** Hay 409 si el
documento está abierto con cambios sin guardar (`:3411`).

**Decisión de diseño:** el original nunca se escribe. La app ya guarda una copia en
`STORAGE_DIR/sessions/<id>/original.docx` y el generado en
`STORAGE_DIR/sessions/<id>/output.docx`.

**Cambio propuesto:**

1. `send_to_word_endpoint` deja de escribir en `req.dest_path`. Escribe el generado en
   una **copia de trabajo interna**:
   `STORAGE_DIR/sessions/<id>/word/<stem_del_original>_APA7.docx`
   (copia de `output.docx`), y abre **esa** en Word.
2. `SendToWordReq` (`main.py:3270`) pierde `dest_path` como destino de escritura; se
   conserva solo como **nombre para mostrar**. El frontend no decide rutas de escritura.
3. Se reutiliza el guardián existente `validate_open_in_word_path` (`config.py:68`) —
   solo `.docx` dentro de `STORAGE_DIR`. Se extiende a la carpeta `word/`.
4. La respuesta pasa a `{ok, method, working_path, message}`. `backup` deja de aplicar al
   original (si se conserva por compatibilidad, va en `null`).
5. La UI de `ExportView.tsx` (`:462-480`) cambia el texto destructivo
   ("Reemplazar … deja una copia .bak") por "Abrir copia en Word (tu original no se
   modifica)". El bloque 409 (`:508-571`) se conserva para la copia de trabajo.
6. `verEnWord` (`:181`) se mantiene como camino no destructivo equivalente; se unifica el
   mensaje.

**Nota:** el botón "Abrir en Word" (`abrirEnWord` → `connectWord(activeFilePath)`,
`ExportView.tsx:159`) abre el original sin escribirlo. Es solo lectura, se conserva.

## Problema 2 — No se puede autoguardar ni volver atrás

**Hoy:**

- El estado se persiste en cada mutación (`save_session_state`, `session_manager.py:81`),
  pero **no hay temporizador**.
- Existe tabla `session_snapshots` con retención de últimos 5 (`:71`, `:193`) y endpoint
  `POST /api/sessions/{id}/snapshot` (`routers/sessions.py:1215`), pero **no hay listar ni
  restaurar**.
- `documentSlice.saveSnapshot` (`documentSlice.ts:425`) está implementado y **sin caller**.
- Versiones de proyecto: `agregar_version` / `archivar_version` / `purgar_papelera`
  (`proyecto_manager.py:72,86,104`) pero **sin restaurar**.

**Cambio propuesto:**

### Backend
1. `session_manager.py`: agregar
   - `list_session_snapshots(session_id) -> list[dict]` (id, created_at, resumen).
   - `load_session_snapshot(snapshot_id) -> Optional[DocumentModel]`.
2. `routers/sessions.py`:
   - `GET /api/sessions/{id}/snapshots` → lista.
   - `POST /api/sessions/{id}/restore-snapshot/{snapshot_id}` → carga el snapshot, lo
     escribe como estado actual (`save_session_state`) y devuelve el `DocumentModel`.
3. `proyecto_manager.py` + `main.py:316-350`:
   - `POST /api/proyectos-archivo/restaurar-version` `{proyecto_id, archivo}` → recupera de
     la papelera/versión y la deja como versión activa.

### Frontend
4. **Autoguardado periódico:** hook (en `App.tsx` o store) que, si
   `hasUnsavedChanges`, llama `saveSnapshot` cada N segundos (N = 30) y en
   `visibilitychange` / `beforeunload`. Se reusa el `saveSnapshot` existente.
5. **UI de historial:** panel/menú desde el chip de `UnifiedToolbar` (`:183-201`) que lista
   snapshots (fecha + hora relativa) con acción "Restaurar". Cero emojis, íconos
   `lucide-react`, tokens.
6. **Restaurar versión de proyecto** en `VersionTimeline.tsx`.

### Testing
- Backend: extender `test_send_to_word.py` (nuevo destino interno, nunca escribe el
  original) y agregar tests de listar/restaurar snapshot.
- Frontend: extender `envioAWord.test.tsx` (ya no manda `dest_path` como escritura) y
  tests del autoguardado y del historial.

## Fuera de alcance (explícito)

- Unificar los dos sistemas de proyecto (#17, otro bloque).
- Renumeración de figuras/tablas (#3, otro bloque).
- Cifrado de claves.
- "Descargar pregunta nombre": si el flujo de export ya delega en el diálogo del navegador,
  se documenta; si no, se agrega un prompt de nombre como tarea del mismo bloque.

## Criterio de aceptación

- Ejecutar "Enviar/Abrir en Word" **no modifica** el archivo del usuario; se verifica con
  un test que compara el hash del original antes/después.
- El usuario puede listar snapshots y restaurar uno; el estado vuelve y se persiste.
- El autoguardado periódico se dispara solo cuando hay cambios.
- `npx vitest run`, `npx tsc --noEmit`, `pytest -q`, `npm run build` en verde.

## Entrega final (pedido del dueño)

Al terminar el bloque, construir el **instalador local con todo lo nuevo**:

- `npm run build` y luego `powershell -ExecutionPolicy Bypass -File build-installer.ps1`
  (NSIS asistido, `oneClick: false`, registra el complemento de Word).
- El instalador se guarda como artefacto local para probar en la máquina del dueño.
- Esto aplica a cada bloque terminado, no solo al primero.
