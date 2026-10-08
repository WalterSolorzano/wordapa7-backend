# Design: Menú contextual de Windows + Modo Pro (WordAPA7)

**Fecha:** 2026-08-22
**Autor:** brainstorming session (WalterSolorzano / WordAPA7)
**Estado:** Aprobado para plan de implementación

## Resumen

Se añade integración con el Explorador de Windows (estilo WinRAR) al empaquetado
Electron de WordAPA7. Al hacer clic derecho sobre un `.docx` aparecen dos entradas:

1. **"Editar en APA 7"** — abre la app con el documento cargado en el asistente (revisión manual).
2. **"Convertir a APA 7 (Pro)"** — ejecuta el pipeline completo en segundo plano (headless),
   con IA (NVIDIA) si hay API key, o fallback heurístico si no, y produce el `.docx` convertido.

## Contexto / estado actual

El repo ya tiene andamiaje parcial en `electron/main.ts`:

- `findDocxArg(argv)` (líns ~50) detecta un `.docx` pasado como argumento.
- `sendFileToRenderer(filePath)` envía `open-file-from-os` al renderer.
- Single-instance lock (`second-instance`) para múltiples `.docx`.
- Modo `--hidden` (backend en background, sin ventana, con systray).

**Faltantes:**

- No existe ningún listener `open-file-from-os` en el renderer/preload → la entrada
  "Editar" no carga el archivo de verdad.
- No hay registro del menú contextual en Windows (ni en `build/installer.nsh` ni en runtime).
- No existe el "Modo Pro" (orquestación headless del pipeline con IA).

Build: `electron-builder.yml` usa NSIS `oneClick: true`, `perMachine: false`
(instala en `%LOCALAPPDATA%`, sin UAC) y ya incluye `build/installer.nsh` para
registrar el add-in de Word.

## Enfoque elegido

**A. Orquestación en el main process (headless).** El exe con `--pro archivo.docx`
arranca el backend Python (`PythonManager`, ya existente) y conduce la API HTTP
directamente: `POST /api/upload` → `/api/classify` → `/api/generate`, sin ventana
ni renderer. Coherente con el modo `--hidden` actual. El menú contextual se registra
vía verbo en `HKCU\Software\Classes` (per-user, sin UAC) escrito por el instalador NSIS
+ red de seguridad idempotente en primer arranque (patrón del `registerWatcher`).

## Diseño detallado

### 1. Registro del menú contextual (Windows)

Archivo: `build/installer.nsh` (sección `customInstall` y `customUnInstall`).

Escribir verbos en `HKCU\Software\Classes` (no requiere admin; se fusiona sobre HKLM):

- `HKCU\Software\Classes\.docx\shell\WordAPA7Edit`
  - `(Default)` = `Editar en APA 7`
  - `HKCU\...\WordAPA7Edit\command` = `"$APPDIR\WordAPA7.exe" "%1"`
- `HKCU\Software\Classes\.docx\shell\WordAPA7Pro`
  - `(Default)` = `Convertir a APA 7 (Pro)`
  - `HKCU\...\WordAPA7Pro\command` = `"$APPDIR\WordAPA7.exe" --pro "%1"`

En `customUnInstall`: borrar `WordAPA7Edit` y `WordAPA7Pro` bajo `.docx\shell`.

**Red de seguridad runtime:** en `app.whenReady()` de `electron/main.ts`, nueva función
`ensureContextMenu()` idempotente que re-escribe los verbos apuntando a
`app.getPath('exe')`. Se ejecuta en cada arranque (best-effort, envuelto en try/catch),
igual que `registerWatcher()`.

### 2. Entrada en `electron/main.ts`

- Nuevo flag: `const isProLaunch = process.argv.includes('--pro')`.
- En `createWindow()` (arranque con archivo): si `isProLaunch && startupFile`,
  llamar `runProMode(startupFile)` en vez de `sendFileToRenderer`.
- En handler `second-instance`: detectar `--pro` en `argv`; si presente, ejecutar
  `runProMode(filePath)` en la instancia viva (o crear ventana + pro si no existe).
- Mantener flujo actual para "Editar" (sin `--pro`).

### 3. Pipeline Pro — nuevo `electron/pro-mode.ts`

Función async `runProMode(filePath: string): Promise<void>`:

1. `await PythonManager.start()`; obtener puerto con `PythonManager.port`.
2. Leer buffer del `.docx`; `POST /api/upload` (multipart) → `session_id`.
3. `POST /api/classify/{session_id}`:
   - Si `process.env.NVIDIA_API_KEY` presente → usa IA.
   - Si no → backend hace fallback heurístico; enviar `Notification` "Pro sin IA".
4. Defaults de portada/referencias ya los aplican los endpoints; `POST /api/generate`
   → descarga del `.docx` resultante (URL de descarga devuelta por el backend).
5. Guardar como `<dir>/<base>_APA7.docx` (NO pisar el original).
6. `new Notification({ title: 'WordAPA7', body: 'Listo: <nombre>' })` +
   `shell.openPath(resultPath)`.
7. `app.quit()` al finalizar (modo headless efímero).

Funciones auxiliares internas para cada paso HTTP (reutilizan la misma forma que
`src/api/backend.ts`, pero en Node con `fetch` global, sin duplicar lógica de UI).

### 4. Manejo de errores

- Cualquier fallo en el pipeline → `Notification` de error (mensaje corto) +
  log vía `electron/logger.ts`. No abre ventana.
- Si falla el `upload` (archivo corrupto/ilegible), abrir el editor para que el
  usuario reintente manualmente (ruta de recuperación).
- Timeout de seguridad (5 min) que aborta y notifica.

### 5. "Editar en APA 7" — conectar el renderer

Hoy `main.ts` hace `webContents.send('open-file-from-os', { fileName, buffer })` pero
no hay listener. Agregar en `src/` (preload expone canal; store Zustand suscribe):

- Preload: exponer `ipcRenderer.on('open-file-from-os', ...)` → reenvía al store.
- Store: listener que convierte `{ fileName, buffer }` a `File` y llama a `uploadFile()`
  (mismo flujo que drag&drop en la zona de drop).

Así la entrada "Editar" carga el doc en el asistente para revisión manual.

### 6. Pruebas

- **Unit** (`electron/pro-mode` con backend mock): verificar orden
  upload → classify → generate y nombre de salida `<base>_APA7.docx`.
- **NSIS**: script que escribe/lee el registro y comprueba verbos en `HKCU`.
- **Manual**: compilar (`npm run electron:build`), clic derecho en `.docx`,
  verificar ambas entradas; "Pro" produce `<base>_APA7.docx` y lo abre.

## Fuera de alcance

- No se cambia el asistente UI existente (solo se conecta el listener de carga).
- No se toca la lógica de clasificación/generación del backend (ya existen los endpoints).
- Modo Pro no expone opciones de configuración en esta iteración (usa defaults).
