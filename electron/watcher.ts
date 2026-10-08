/**
 * WordAPA7 — Watcher + Autoinicio
 * ================================
 *
 * En lugar de arrancar la app Electron completa al inicio de sesión
 * (~150MB RAM), usamos un watcher ligero en Python (~10MB) que detecta
 * cuando Word se abre y arranca el backend solo entonces.
 *
 * El watcher se registra en HKCU\\...\\Run por:
 *   - install.bat (desarrollo)
 *   - el instalador NSIS (producción)
 *   - ESTE módulo (safety net: si la app Electron se abre y el watcher
 *     no está registrado todavía, lo registra y lo arranca enseguida)
 *
 * La app Electron sigue funcionando normalmente cuando el usuario la
 * abre manualmente: detecta si el backend ya está corriendo (arrancado
 * por el watcher) y se conecta a él sin duplicar procesos.
 */

import { app } from 'electron'
import path from 'path'
import { log } from './logger'

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const WATCHER_NAME = 'WordAPA7Watcher'

/**
 * Registra el watcher en el inicio de sesión de Windows.
 *
 * En desarrollo: usa pythonw.exe con word_watcher.py
 * En producción: usa python.exe (embebido, oficial de python.org) con main.py --watcher
 *
 * Es idempotente: si la entrada ya existe con el mismo valor, no hace nada.
 */
export function registerWatcher(): void {
  if (process.platform !== 'win32') return

  const { execSync } = require('child_process')

  let command: string

  if (app.isPackaged) {
    // ── Python embebido (reemplaza PyInstaller) ────────────────────────
    // El runtime oficial viaja en resources/python-runtime/.
    // Usamos python.exe (firmado por PSF) en lugar de python-backend.exe
    // (PyInstaller, que Windows Defender flaggea como malware).
    const runtimeDir = path.join(process.resourcesPath, 'python-runtime')
    const pythonExe = path.join(runtimeDir, 'python.exe')
    const mainScript = path.join(runtimeDir, 'python', 'main.py')
    command = `"${pythonExe}" "${mainScript}" --watcher`
  } else {
    // Desarrollo: pythonw.exe word_watcher.py
    const scriptPath = path.join(app.getAppPath(), 'python', 'word_watcher.py')
    const venvPythonw = path.join(app.getAppPath(), 'venv', 'Scripts', 'pythonw.exe')
    const pythonw = require('fs').existsSync(venvPythonw) ? venvPythonw : 'pythonw'
    command = `"${pythonw}" "${scriptPath}"`
  }

  try {
    // Limpiar entrada vieja del Electron auto-start (si existía de versiones anteriores)
    execSync(`reg delete "${RUN_KEY}" /v WordAPA7 /f`, { stdio: 'ignore' })
  } catch {
    // Normal si no existe
  }

  try {
    execSync(`reg add "${RUN_KEY}" /v ${WATCHER_NAME} /t REG_SZ /d "${command}" /f`, {
      stdio: 'ignore',
    })
    log('info', 'watcher', `Watcher registrado en inicio de Windows: ${command}`)
  } catch (err) {
    log('warn', 'watcher', `No se pudo registrar el watcher: ${String(err)}`)
  }
}

/**
 * Inicia el watcher inmediatamente (sin esperar al reinicio de sesión).
 * Lo arranca en background, sin ventana de consola.
 *
 * Esto es importante porque:
 *   - Tras instalar la app, el usuario no debería tener que reiniciar Windows
 *     para que el watcher empiece a funcionar.
 *   - Si el proceso del watcher crasheó o fue cerrado por el usuario, se
 *     reinicia automáticamente la próxima vez que se abre la app Electron.
 */
export function startWatcherNow(): void {
  if (process.platform !== 'win32') return

  const { spawn, execSync } = require('child_process')

  // No arrancar si ya está corriendo.
  //
  // El chequeo busca el SCRIPT, no solo el nombre del proceso: en desarrollo
  // el watcher corre como `pythonw.exe` y el chequeo anterior preguntaba por
  // `name='python.exe'`, así que NUNCA lo veía y cada `npm run dev` sumaba un
  // watcher más. Varios watchers = varios dueños del puerto 8742 y churn de
  // backends; justo lo que este comentario de arriba dice querer evitar.
  //
  // Se usa PowerShell/CIM en vez de wmic (deprecado y ausente en algunos
  // Windows 11). Si falla, se acepta el riesgo de un duplicado: el propio
  // watcher adopta el núcleo existente y no spawnea otro backend.
  try {
    const result = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name='python.exe' OR Name='pythonw.exe'\\").CommandLine"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 }
    ).toLowerCase()
    if (result.includes('word_watcher.py') || result.includes('--watcher')) {
      log('info', 'watcher', 'Watcher ya está corriendo (word_watcher.py / --watcher detectado)')
      return
    }
  } catch {
    // PowerShell no disponible o falló — continuar y arrancar el watcher
  }

  try {
    if (app.isPackaged) {
      // ── Python embebido ──────────────────────────────────────────────
      const runtimeDir = path.join(process.resourcesPath, 'python-runtime')
      const pythonExe = path.join(runtimeDir, 'python.exe')
      const mainScript = path.join(runtimeDir, 'python', 'main.py')

      // Fail-closed: si el intérprete no está (instalador viejo/roto), NO
      // intentamos spawnear. Un spawn ENOENT emite 'error' de forma asíncrona
      // y, sin listener, tumba el proceso main con un "Uncaught Exception".
      if (!require('fs').existsSync(pythonExe)) {
        log('error', 'watcher', `Runtime embebido ausente: no existe ${pythonExe}. Watcher no iniciado.`)
        return
      }

      const child = spawn(pythonExe, [mainScript, '--watcher'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: path.join(runtimeDir, 'python'),
      })
      child.on('error', (err) => {
        log('warn', 'watcher', `No se pudo iniciar el watcher: ${String(err)}`)
      })
      child.unref()
    } else {
      const scriptPath = path.join(app.getAppPath(), 'python', 'word_watcher.py')
      const venvPythonw = path.join(app.getAppPath(), 'venv', 'Scripts', 'pythonw.exe')
      const pythonw = require('fs').existsSync(venvPythonw) ? venvPythonw : 'pythonw'
      const child = spawn(pythonw, [scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: path.join(app.getAppPath(), 'python'),
      })
      child.on('error', (err) => {
        log('warn', 'watcher', `No se pudo iniciar el watcher: ${String(err)}`)
      })
      child.unref()
    }
    log('info', 'watcher', 'Watcher iniciado en background')
  } catch (err) {
    log('warn', 'watcher', `No se pudo iniciar el watcher: ${String(err)}`)
  }
}

/**
 * Conveniencia: registra el watcher en el inicio de sesión y lo arranca
 * inmediatamente. Llamado desde main.ts cuando la app Electron arranca
 * (tanto en modo normal como en modo --hidden).
 *
 * Esto garantiza que el watcher siempre esté registrado y corriendo, incluso
 * si el usuario instala la app y la abre sin reiniciar Windows.
 */
export function ensureWatcherRunning(): void {
  registerWatcher()
  startWatcherNow()
}
