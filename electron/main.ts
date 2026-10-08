import { app, BrowserWindow, ipcMain, protocol, nativeTheme, dialog, shell, Tray, Menu, clipboard, session } from 'electron'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import { PythonManager } from './python-manager'
import { setupWindowControls } from './ipc/window-controls'
import { createMenu } from './menu'
import { RecentProjects } from './recent-projects'
import { log } from './logger'
import { registerWatcher, startWatcherNow } from './watcher'

let mainWindow: BrowserWindow | null = null

// ── Modo oculto (autoinicio en segundo plano, sin ventana) ──────────────────
// Permite que el Word Add-in funcione sin que el usuario abra la app: el backend
// arranca en background y queda en la bandeja del sistema. Así "instalar y ya
// está en Word" sin mostrar ventana ni consumir RAM de renderer.
const isHiddenLaunch = process.argv.includes('--hidden')
let tray: Tray | null = null

function startBackend() {
  PythonManager.start().catch(err => console.error('Failed to start python backend:', err))
}

function createSystray() {
  if (tray) return
  try {
    const iconPath = path.join(process.resourcesPath || __dirname, 'build', 'icon.ico')
    tray = new Tray(iconPath)
    tray.setToolTip('WordAPA7 (segundo plano)')
    const ctxMenu = Menu.buildFromTemplate([
      {
        label: 'Mostrar WordAPA7',
        click: () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow() },
      },
      { type: 'separator' },
      { label: 'Salir', click: () => { app.quit() } },
    ])
    tray.setContextMenu(ctxMenu)
    tray.on('double-click', () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow() })
  } catch (err) {
    log('warn', 'systray', 'No se pudo crear la bandeja', { error: String(err) })
  }
}

// ── Context Menu: detección de archivo .docx pasado como argumento ──────────
// Cuando el usuario hace click derecho → "Convertir a APA 7" sobre un .docx,
// Windows lanza WordAPA7.exe con la ruta del archivo como argumento.
// Esta función escanea argv buscando un argumento que termine en .docx.
function findDocxArg(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg && arg.toLowerCase().endsWith('.docx') && !arg.startsWith('--') && !arg.startsWith('-')) {
      try {
        if (fs.existsSync(arg)) return arg
      } catch { /* ignore */ }
    }
  }
  return null
}

// Lee el archivo del disco y lo envía al renderer como { fileName, buffer }.
// El renderer lo convierte a File y llama a uploadFile() — mismo flujo que
// arrastrar y soltar un archivo en la zona de drop.
function sendFileToRenderer(filePath: string) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    log('warn', 'context-menu', `Window not ready, cannot send file: ${filePath}`)
    return
  }
  try {
    const buffer = fs.readFileSync(filePath)
    const fileName = path.basename(filePath)
    const isQuick = process.argv.includes('--quick') || !!findDocxArg(process.argv)
    mainWindow.webContents.send('open-file-from-os', { fileName, buffer, isQuick, filePath })
    log('info', 'context-menu', `File sent to renderer: ${fileName} (${buffer.length} bytes, isQuick: ${isQuick})`)
  } catch (err) {
    log('error', 'context-menu', `Failed to read file: ${filePath}`, { error: String(err) })
  }
}

function createWindow() {
  // El tema se sincroniza desde la UI vía IPC 'set-theme' (light por defecto).
  nativeTheme.themeSource = 'light'

  const quickMode = !!findDocxArg(process.argv) || process.argv.includes('--quick')
  mainWindow = new BrowserWindow({
    width: quickMode ? 440 : 1200,
    height: quickMode ? 600 : 768,
    minWidth: quickMode ? 440 : 1024,
    minHeight: quickMode ? 600 : 640,
    resizable: !quickMode,
    center: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',        // --sidebar-bg claro (default de la app)
      symbolColor: '#1a1a2e'   // --text-main oscuro para los simbolos nativos
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // ── SSL: aceptar certificados auto-firmados de localhost ──────────────────
  // El backend Python genera un cert SSL auto-firmado (ssl_cert_gen.py) para
  // que el Word Add-in (Office.js) pueda cargar el panel por HTTPS, ya que
  // Office LO REQUIERE incluso en localhost. Chromium rechaza certificados
  // auto-firmados por defecto; aquí aceptamos SOLO los de 127.0.0.1/localhost
  // para que el renderer pueda hacer fetch() al backend HTTPS.
  mainWindow.webContents.session.setCertificateVerifyProc((request, callback) => {
    const { hostname } = request
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      // Aceptar certificados auto-firmados del backend local
      callback(0) // 0 = accept
    } else {
      // Usar verificación normal para todos los demás hostnames
      callback(-1) // -1 = use default verification
    }
  })

  // Load React UI immediately for instant startup feel
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.webContents.session.clearCache().catch(() => {})
    mainWindow.webContents.session.clearCodeCaches({}).catch(() => {})
    mainWindow.loadURL('app://-/index.html')
  }

  // Start python process in background after UI is loaded
  try {
    PythonManager.start().catch(err => {
      console.error('Failed to start python backend:', err)
    })
  } catch (error) {
    console.error('Failed to start python backend:', error)
  }

  // Zoom hardening: bloquear zoomLevel a 0 salvo acción explícita,
  // y acotarlo entre 0.5 y 2.0 para evitar el bug de zoom atascado en 235%.
  mainWindow.webContents.setZoomLevel(0);
  mainWindow.webContents.on('zoom-changed', (_event, zoomDirection) => {
    const current = mainWindow?.webContents.getZoomLevel() || 0;
    const next = zoomDirection === 'in' ? current + 0.5 : current - 0.5;
    if (next >= -0.5 && next <= 1.0) {
      mainWindow?.webContents.setZoomLevel(next);
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 3 ? 'error' : level === 2 ? 'warn' : level === 1 ? 'info' : 'debug';
    log(levelStr as any, 'renderer', message, { line, sourceId });
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log('error', 'renderer-fail-load', `${errorDescription} (${errorCode}) for ${validatedURL}`);
  });

  // ── Gestor de Descargas (will-download) ──────────────────────────────────
  // En Electron, los elementos <a download> y las solicitudes de descarga de archivos
  // generados por FastAPI deben capturarse para garantizar que se descarguen en la
  // carpeta de descargas del usuario o abran el diálogo de guardado sin cancelarse silenciosamente.
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    // Si ya tiene nombre sugerido, respetarlo
    const filename = item.getFilename();
    const downloadPath = path.join(app.getPath('downloads'), filename);
    // Configurar ruta por defecto en Descargas sin bloquear
    item.setSavePath(downloadPath);
    item.once('done', (_event, state) => {
      if (state === 'completed') {
        log('info', 'download', `Archivo descargado con éxito: ${downloadPath}`);
        webContents.send('download-completed', { path: downloadPath, filename });
      } else {
        log('warn', 'download', `Descarga no completada: ${state}`);
      }
    });
  });

  // ── Context Menu: procesar archivo si se pasó al arrancar ──────────────────
  // El usuario hizo click derecho → "Convertir a APA 7" y la app NO estaba
  // corriendo. El archivo viene en process.argv. Lo enviamos al renderer
  // DESPUÉS de que la UI terminó de cargar para que el listener esté activo.
  const startupFile = findDocxArg(process.argv)
  if (startupFile) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => sendFileToRenderer(startupFile), 500)
    })
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
])

// ── Single Instance Lock ─────────────────────────────────────────────────────
// Si la app ya está corriendo y el usuario hace click derecho en OTRO .docx,
// Windows lanza una segunda instancia. Este lock la intercepta: enfoca la
// ventana existente y le envía el archivo para procesarlo.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
    app.on('second-instance', (_event, argv, _cwd) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow()
        return
      }
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      const filePath = findDocxArg(argv)
      if (filePath) {
        setTimeout(() => sendFileToRenderer(filePath), 300)
      }
    })

  app.whenReady().then(() => {
    protocol.registerFileProtocol('app', (request, callback) => {
      try {
        const parsedUrl = new URL(request.url)
        let pathname = parsedUrl.pathname
        if (pathname.startsWith('/')) {
          pathname = pathname.substring(1)
        }
        callback({ path: path.normalize(path.join(__dirname, '../dist', pathname)) })
      } catch (e) {
        console.error('Failed to parse URL in protocol handler', e)
      }
    })

    setupWindowControls()

    ipcMain.on('add-recent-document', (event, filePath) => {
      RecentProjects.add(filePath)
    })

    ipcMain.on('set-theme', (_event, theme: 'light' | 'dark') => {
      nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
      if (mainWindow) {
        mainWindow.setTitleBarOverlay({
          color: theme === 'dark' ? '#18181c' : '#ffffff',
          symbolColor: theme === 'dark' ? '#e8e8ea' : '#1a1a2e',
        })
      }
    })

    ipcMain.on('get-backend-port', (event) => {
      event.returnValue = PythonManager.port
    })

    ipcMain.on('expand-to-full-editor', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setResizable(true)
        mainWindow.setSize(1200, 768)
        mainWindow.center()
      }
    })

    ipcMain.on('show-item-in-folder', (_event, filePath) => {
      if (filePath && typeof filePath === 'string') {
        shell.showItemInFolder(filePath)
      }
    })

    ipcMain.on('open-path', (_event, filePath) => {
      if (filePath && typeof filePath === 'string') {
        shell.openPath(filePath)
      }
    })

    ipcMain.on('open-external', (_event, url: string) => {
      if (typeof url === 'string' && /^https:\/\//.test(url)) {
        shell.openExternal(url).catch(() => {})
      }
    })

    // ── Copiar archivo al portapapeles de Windows (Compatible WhatsApp/Telegram Ctrl+V) ──
    ipcMain.handle('copy-file-to-clipboard', async (_event, filePath: string) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) {
          return false
        }
        // En Windows, ejecutar comando PowerShell ligero para setear el FileDropList en el Clipboard
        // Esto permite pegar el archivo .pdf directo con Ctrl+V en WhatsApp Desktop / Web
        if (process.platform === 'win32') {
          const resolved = path.resolve(filePath).replace(/'/g, "''")
          const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetFileDropList([string[]]@('${resolved}'))"`
          await new Promise<void>((resolve, reject) => {
            exec(psCommand, (err) => {
              if (err) reject(err)
              else resolve()
            })
          })
          return true
        } else {
          // Fallback a texto en otras plataformas
          clipboard.writeText(filePath)
          return true
        }
      } catch (err) {
        log('warn', 'clipboard', 'Error al copiar archivo al portapapeles', { error: String(err) })
        return false
      }
    })

    // ── Live File Watcher (Sincronización en Paralelo con Word) ──
    let activeDocWatcher: fs.FSWatcher | null = null
    let activeDocPath: string | null = null
    let watchDebounceTimer: NodeJS.Timeout | null = null

    ipcMain.on('watch-document-file', (event, filePath: string) => {
      if (!filePath || !fs.existsSync(filePath)) return
      if (activeDocWatcher) {
        try { activeDocWatcher.close() } catch { /* ignore */ }
        activeDocWatcher = null
      }
      activeDocPath = filePath
      try {
        activeDocWatcher = fs.watch(filePath, (eventType) => {
          if (eventType === 'change') {
            if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
            watchDebounceTimer = setTimeout(() => {
              try {
                if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                  event.sender.send('document-file-changed', {
                    filePath,
                    fileName: path.basename(filePath),
                    timestamp: Date.now()
                  })
                }
              } catch { /* best-effort */ }
            }, 600)
          }
        })
      } catch (err) {
        log('warn', 'watcher', 'No se pudo iniciar watcher de archivo', { error: String(err) })
      }
    })

    ipcMain.on('unwatch-document-file', () => {
      if (activeDocWatcher) {
        try { activeDocWatcher.close() } catch { /* ignore */ }
        activeDocWatcher = null
      }
      activeDocPath = null
      if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
    })

    // ── Actualizaciones ─────────────────────────────────────────────────────
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    const sendUpdateStatus = (status: Record<string, unknown>) => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w && !w.isDestroyed()) w.webContents.send('update:status', status)
    }

    const mainWin = () => BrowserWindow.getAllWindows()[0] || undefined

    autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking' }))
    autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'available', info }))
    autoUpdater.on('update-not-available', (info) => sendUpdateStatus({ state: 'not-available', info }))
    autoUpdater.on('download-progress', (p) => sendUpdateStatus({ state: 'downloading', progress: Math.round(p.percent * 10) / 10 }))
    autoUpdater.on('update-downloaded', (info) => {
      sendUpdateStatus({ state: 'downloaded', info })
      const w = mainWin()
      if (w && !w.isDestroyed()) {
        const v = (info as any)?.version || ''
        dialog.showMessageBox(w, {
          type: 'info',
          title: 'Actualización lista',
          message: `WordAPA7 v${v} se descargó correctamente.`,
          detail: '¿Querés reiniciar la app ahora para instalarla?',
          buttons: ['Reiniciar ahora', 'Después'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall()
        }).catch(() => {})
      }
    })
    autoUpdater.on('error', (err) => {
      console.error('auto-updater error:', err)
      let msg = err?.message || String(err)
      if (msg.includes('latest.yml')) {
        msg = 'No se encontró el manifiesto latest.yml en el release de GitHub.'
      }
      sendUpdateStatus({ state: 'error', message: msg })
    })

    ipcMain.on('get-app-version', (event) => {
      event.returnValue = app.getVersion()
    })
    ipcMain.on('update:check', () => {
      if (!app.isPackaged) {
        sendUpdateStatus({ state: 'not-available', message: `Estás en modo de desarrollo local (v${app.getVersion()})` })
        return
      }
      autoUpdater.checkForUpdates().catch((err) => {
        let msg = err?.message || String(err)
        if (msg.includes('latest.yml')) {
          msg = 'No se encontró el manifiesto latest.yml en GitHub Releases.'
        }
        sendUpdateStatus({ state: 'error', message: msg })
      })
    })
    ipcMain.on('update:install', () => {
      autoUpdater.quitAndInstall()
    })

    // ── Autoinicio en segundo plano (sin ventana) ─────────────────────────────
    // Al iniciar sesión Windows lanza la app con --hidden: el backend corre en
    // background y queda en la bandeja, para que el Word Add-in funcione sin que
    // el usuario abra la ventana. Si abre la app manualmente, se muestra la UI.
    try {
      app.setLoginItemSettings({ openAtLogin: false })
    } catch { /* best-effort */ }

    // ── Watcher ligero (red de seguridad) ─────────────────────────────────────
    // Registrar el watcher en el inicio de Windows (idempotente) y arrancarlo
    // inmediatamente si no está corriendo. Esto asegura que el complemento
    // funcione incluso si el usuario abre la app sin haber reiniciado Windows
    // tras la instalación, o si el instalador NSIS no lo registró todavía.
    //
    // El watcher es un proceso Python de bajísimo consumo (~8-12MB RAM, ~0% CPU)
    // que detecta cuando Word se abre y arranca el backend automáticamente.
    registerWatcher()

    if (isHiddenLaunch) {
      log('info', 'startup', 'Modo oculto: backend en segundo plano (sin ventana)')
      startBackend()
      createSystray()
      // En modo oculto el watcher podría ser quien nos arrancó — no duplicarlo
      // si el backend ya responde. startWatcherNow() verifica internamente.
      startWatcherNow()
    } else {
      // Arranque normal (usuario abrió la app): mostrar ventana y asegurar
      // que el watcher esté corriendo para cuando cierre la app y abra Word.
      createWindow()
      startWatcherNow()
    }

    // Chequeo inicial al arrancar solo en producción empaquetada
    const runCheck = () => {
      if (!app.isPackaged) return
      autoUpdater.checkForUpdates().catch(() => {})
    }
    try { runCheck() } catch { /* best-effort */ }
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { runCheck() } catch { /* best-effort */ }
      }
    }, 10000)

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('quit', () => {
    if (tray) { tray.destroy(); tray = null }
    PythonManager.stop()
  })
}
