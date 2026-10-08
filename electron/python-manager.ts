import { spawn, ChildProcess, execSync } from 'child_process'
import { app, BrowserWindow } from 'electron'
import http from 'http'
import https from 'https'
import path from 'path'
import net from 'net'
import { log } from './logger'

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
}

export class PythonManager {
  private static pythonProcess: ChildProcess | null = null
  public static port: number = 8742

  /** Si el nucleo permanente vive en 8742, la app completa usa 8743. */
  private static async _pickPort(): Promise<void> {
    for (const proto of ['https', 'http']) {
      try {
        const ctl = new AbortController();
        setTimeout(() => ctl.abort(), 1200);
        const r = await fetch(`${proto}://127.0.0.1:8742/api/version`, { signal: ctl.signal });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j && j.mode === 'core') {
            PythonManager.port = 8743;
            log('info', 'python-manager', '8742 lo ocupa el nucleo (mode=core): la app usa 8743 y levanta su backend', { version: j.version })
            return
          }
          // Backend completo ya corriendo en 8742 (nuestro main.py o el watcher).
          PythonManager.port = 8742;
          log('info', 'python-manager', '8742 lo ocupa un backend completo (mode=main): se reutiliza', { version: j?.version })
          return
        }
      } catch { /* siguiente proto */ }
    }
    PythonManager.port = 8742
  }
  /** mtime más reciente de los `.py` bajo `python/`, en ms. 0 si no se pudo leer. */
  private static newestPythonMtimeMs(): number {
    const root = path.join(app.getAppPath(), 'python')
    const fs = require('fs')
    let newest = 0
    const walk = (dir: string, depth: number): void => {
      if (depth > 5) return
      let entries: Array<{ name: string; isDirectory: () => boolean }>
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== '__pycache__') walk(full, depth + 1); continue }
        if (!e.name.endsWith('.py')) continue
        try {
          const s = fs.statSync(full)
          if (s.mtimeMs > newest) newest = s.mtimeMs
        } catch { /* archivo borrado en el medio: ignorar */ }
      }
    }
    walk(root, 0)
    return newest
  }

  /**
   * Hora de arranque del PID, en ms epoch. `null` si no se pudo leer.
   *
   * Se pide `StartTime.ToFileTimeUtc()` (entero de 100ns desde 1601) y se
   * convierte: así no hay que parsear formatos de fecha localizados, que
   * cambiarían con el idioma de Windows.
   */
  private static processStartMs(pid: number): number | null {
    try {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()"`,
        { encoding: 'utf-8', timeout: 8000 }
      ).trim()
      const ft = BigInt(out)
      return Number((ft - 116444736000000000n) / 10000n)
    } catch { return null }
  }

  /**
   * PID que escucha en ese puerto, o `null`.
   *
   * Se usa `netstat` (viene con Windows, no necesita permisos) y se ancla el
   * patrón a `:PUERTO` seguido de espacios: sin el anclaje, buscar 8742 dentro
   * de la salida también matchea 87420 y se mataría el proceso equivocado.
   */
  private static listenerPid(port: number): number | null {
    try {
      const out = execSync('netstat -ano -p TCP', { encoding: 'utf-8', timeout: 8000 })
      const re = new RegExp(`[:.]${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(re)
        if (m) return Number(m[1])
      }
    } catch { /* netstat no disponible */ }
    return null
  }

  private static restartCount: number = 0
  private static readonly MAX_RESTARTS = 5
  private static stopped = false
  private static addinSideloaded = false
  /**
   * Indica si el backend ya estaba corriendo cuando PythonManager.start()
   * fue llamado (arrancado por el watcher externo word_watcher.py).
   * Si es true, NO matamos el proceso en stop() — el watcher gestiona
   * su ciclo de vida (lo detiene cuando Word se cierra).
   */
  private static externalBackend = false

  /**
   * Protocolo detectado del backend durante el polling.
   *
   * El backend Python puede correr en HTTP o HTTPS. Cuando hay certificados
   * SSL disponibles (generados por ssl_cert_gen.py para el Word Add-in),
   * el backend arranca con HTTPS. El modulo ``http`` de Node.js NO soporta
   * HTTPS, asi que necesitamos saber que protocolo usar para las peticiones
   * del main process (polling de readiness + auto-setup del add-in).
   *
   * Se descubre durante ``pollBackend`` probando HTTPS primero y cayendo a
   * HTTP si no responde.
   */
  private static backendProtocol: 'https' | 'http' = 'https'

  static async start(): Promise<void> {
    this.port = 8742
    this.stopped = false
    this.restartCount = 0
    this.addinSideloaded = false
    this.externalBackend = false
    this.backendProtocol = 'https'

    log('info', 'python-manager', `Iniciando backend Python...`, { port: this.port })

    return this.spawnAndPoll()
  }

  /**
   * Hace una peticion GET al backend intentando HTTPS primero, luego HTTP.
   *
   * Node.js tiene modulos separados para HTTP y HTTPS (``http`` y ``https``).
   * No podemos usar ``fetch`` aqui porque estamos en el main process (Node),
   * no en el renderer (Chromium). El ``setCertificateVerifyProc`` solo aplica
   * a Chromium, no a Node.js, asi que para HTTPS necesitamos
   * ``rejectUnauthorized: false`` para aceptar el cert auto-firmado.
   *
   * Retorna ``true`` si el backend respondio con status 200.
   */
  private static pingBackend(): Promise<boolean> {
    return new Promise((resolve) => {
      const tryHttps = () => {
        const req = https.get(
          `https://127.0.0.1:${this.port}/api/version`,
          { rejectUnauthorized: false, timeout: 2000 },
          (res) => {
            if (res.statusCode === 200) {
              this.backendProtocol = 'https'
              resolve(true)
            } else {
              resolve(false)
            }
            // Drenar el response para evitar que el socket se quede colgado
            res.resume()
          }
        )
        req.on('error', () => {
          // HTTPS fallo — intentar HTTP como fallback
          tryHttp()
        })
        req.on('timeout', () => {
          req.destroy()
          tryHttp()
        })
      }

      const tryHttp = () => {
        const req = http.get(
          `http://127.0.0.1:${this.port}/api/version`,
          { timeout: 2000 },
          (res) => {
            if (res.statusCode === 200) {
              this.backendProtocol = 'http'
              resolve(true)
            } else {
              resolve(false)
            }
            res.resume()
          }
        )
        req.on('error', () => {
          resolve(false)
        })
        req.on('timeout', () => {
          req.destroy()
          resolve(false)
        })
      }

      tryHttps()
    })
  }

  /**
   * Configuracion automatica del Add-in de Word en una sola llamada.
   *
   * Llama al endpoint GET /api/addin/auto-setup del backend, que hace TODO:
   *   1. Genera el manifiesto XML con URLs HTTPS correctas
   *   2. Lo registra en el registro de Windows (HKCU\...\Wef\Developer\WordAPA7)
   *   3. Copia el manifiesto a una carpeta de catalogo compartido (fallback)
   *   4. Verifica que el certificado SSL este instalado
   *
   * No requiere intervention del usuario: todo es silencioso y automatico.
   * El usuario solo necesita instalar la app y reiniciar Word.
   *
   * Tiene logica de reintentos: si falla, reintenta hasta 3 veces con 3s
   * de delay entre intentos. Esto es necesario porque el backend puede tardar
   * unos segundos en tener el manifiesto listo despues de responder al
   * health check.
   *
   * Si la operacion es exitosa, envia el evento IPC 'addin-sideloaded' al
   * renderer para que muestre un toast informando al usuario.
   *
   * Usa el protocolo detectado durante ``pingBackend`` (HTTPS o HTTP).
   */
  private static autoSetupAddin(): void {
    if (this.addinSideloaded) return
    if (process.platform !== 'win32') return

    const proto = this.backendProtocol
    const url = `${proto}://127.0.0.1:${this.port}/api/addin/auto-setup`
    log('info', 'python-manager', 'Auto-setup del Add-in de Word...', { url, proto })

    const requestLib = proto === 'https' ? https : http
    const options = proto === 'https'
      ? { rejectUnauthorized: false, timeout: 10000 }
      : { timeout: 10000 }

    const maxRetries = 3
    let attempt = 0

    const trySetup = () => {
      attempt++
      log('info', 'python-manager', `Auto-setup intento ${attempt}/${maxRetries}`)

      requestLib.get(url, options, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try {
            const result = JSON.parse(body)
            if (result.status === 'ok' || result.status === 'partial') {
              this.addinSideloaded = true
              log('info', 'python-manager', 'Add-in configurado automaticamente', {
                status: result.status,
                steps: result.steps,
                manifest_path: result.manifest_path,
                registry_key: result.registry_key,
                ssl_cert_installed: result.ssl_cert_installed,
              })
              // Notificar al renderer para que muestre un toast
              BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('addin-sideloaded', {
                  status: result.status,
                  hint: result.hint,
                  manifest_url: result.manifest_path,
                })
              })
            } else if (attempt < maxRetries) {
              log('warn', 'python-manager', `Auto-setup intento ${attempt} fallo, reintentando en 3s...`)
              setTimeout(trySetup, 3000)
            } else {
              log('warn', 'python-manager', 'Auto-setup fallo despues de todos los intentos', { result })
            }
          } catch {
            if (attempt < maxRetries) {
              log('warn', 'python-manager', `Auto-setup respuesta no-JSON (intento ${attempt}), reintentando en 3s...`)
              setTimeout(trySetup, 3000)
            } else {
              log('warn', 'python-manager', 'Auto-setup: respuesta no era JSON valido tras todos los intentos')
            }
          }
        })
      }).on('error', (err) => {
        if (attempt < maxRetries) {
          log('warn', 'python-manager', `Auto-setup error (intento ${attempt}): ${String(err)}, reintentando en 3s...`)
          setTimeout(trySetup, 3000)
        } else {
          log('warn', 'python-manager', 'No se pudo auto-configurar el Add-in', { error: String(err) })
        }
      })
    }

    // Pequeno delay inicial para que el backend termine de arrancar
    setTimeout(trySetup, 1500)
  }

  private static async spawnAndPoll(): Promise<void> {
    // PRIMERO se elige el puerto, DESPUÉS se decide si se adopta. El orden
    // anterior —adoptar y luego `_pickPort()`— hacía INALCANZABLE la rama
    // "núcleo en 8742 → la app completa usa 8743": si algo respondía en 8742,
    // `pingBackend()` daba true, se adoptaba como "backend externo" y el
    // `_pickPort()` de más abajo nunca corría.
    //
    // Eso importa porque en 8742 puede estar el `core_server.py` de la app
    // INSTALADA (Run key `WordAPA7Core`): reporta `mode: 'core'` y es código
    // viejo. Adoptarlo deja el frontend nuevo hablando con python viejo, que
    // es exactamente lo que se ve como "otra vez la versión vieja". Nuestro
    // backend reporta `mode: 'main'`; el núcleo, `mode: 'core'`.
    await PythonManager._pickPort()

    const alreadyUp = await this.pingBackend()
    if (alreadyUp) {
      if (!app.isPackaged) {
        // ── Desarrollo: sólo se reutiliza un backend que traiga el código de AHORA
        //
        // Un `main.py` que ya responde carga sus módulos AL ARRANCAR y no los
        // refresca: si arrancó antes del último cambio en `python/`, sirve
        // código viejo para siempre, sin importar que el frontend sea el de
        // ahora. Eso es lo que se ve como "otra vez la versión vieja".
        //
        // La regla es verificable y no pisa a nadie: si el backend arrancó
        // después del último `.py` tocado, se adopta (puede ser el que levantó
        // el watcher, o el de otra sesión que acaba de reiniciar). Si es más
        // viejo, se le deja su puerto y la app levanta el suyo en uno libre. En
        // producción se adopta siempre, porque ahí el watcher y la app son el
        // mismo build.
        const pid = PythonManager.listenerPid(this.port)
        const arranco = pid ? PythonManager.processStartMs(pid) : null
        const ultimoCambio = PythonManager.newestPythonMtimeMs()
        const traeCodigoDeAhora = arranco !== null && ultimoCambio > 0 && arranco >= ultimoCambio - 2000

        if (traeCodigoDeAhora) {
          this.externalBackend = true
          log('info', 'python-manager', 'Backend del puerto elegido arrancó DESPUÉS del último cambio en python/: se reutiliza', { port: this.port, pid })
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('python-ready')
          })
          this.autoSetupAddin()
          return
        }

        log('warn', 'python-manager', 'En desarrollo se evita el backend levantado: arrancó ANTES del último cambio en python/, así que sirve código viejo', {
          port: this.port, pid, arranco, ultimoCambioEnPython: ultimoCambio,
        })
        // NO se mata: matar y volver a levantar en el MISMO puerto hace que la
        // app y el watcher compitan por el bind — se vio [Errno 10048] en la
        // práctica. Se elige un puerto libre y la app levanta el suyo; el otro
        // queda para el add-in, que es lo único que lo necesita.
        this.port = await getFreePort()
        log('info', 'python-manager', 'La app usa un puerto libre para su backend propio', { port: this.port })
      } else {
        // En producción: verificar que el backend coincide con la versión de la app
        let backendVersion: string | null = null;
        for (const proto of ['https', 'http']) {
          try {
            const ctl = new AbortController();
            setTimeout(() => ctl.abort(), 1500);
            const r = await fetch(`${proto}://127.0.0.1:${this.port}/api/version`, { signal: ctl.signal });
            if (r.ok) {
              const j = await r.json().catch(() => null);
              if (j?.version) { backendVersion = j.version; break; }
            }
          } catch { /* siguiente proto */ }
        }

        const appVer = app.getVersion();
        const coincideVersion = !backendVersion || backendVersion === appVer;

        if (coincideVersion) {
          this.externalBackend = true
          log('info', 'python-manager', 'Backend ya estaba corriendo en el puerto elegido y coincide la versión', { port: this.port, version: backendVersion })
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('python-ready')
          })
          this.autoSetupAddin()
          return
        }

        log('warn', 'python-manager', 'Backend corriendo es de versión vieja, no se adopta', {
          port: this.port, backendVersion, appVersion: appVer
        })
        const pid = PythonManager.listenerPid(this.port);
        if (pid) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { timeout: 4000 });
            log('info', 'python-manager', `Terminado backend zombie versión vieja (PID ${pid})`);
            await new Promise(r => setTimeout(r, 1200));
          } catch (e) {
            log('warn', 'python-manager', `No se pudo terminar PID ${pid}, usando puerto libre`, { error: String(e) });
            this.port = await getFreePort();
          }
        } else {
          this.port = await getFreePort();
        }
      }
    }
    return new Promise((resolve, reject) => {
      let command = 'python'
    let args: string[] = []
      let cwd: string | undefined

      if (app.isPackaged) {
        // ── Python embebido (reemplaza PyInstaller) ────────────────────────
        // El runtime de Python oficial viaja en resources/python-runtime/.
        // Usamos python.exe (firmado por Python Software Foundation) en lugar
        // de un exe custom de PyInstaller que Windows Defender flaggea.
        //
        // Layout:
        //   resources/python-runtime/python.exe   (interprete oficial)
        //   resources/python-runtime/python/main.py  (codigo fuente)
        const runtimeDir = path.join(process.resourcesPath, 'python-runtime')
        command = path.join(runtimeDir, 'python.exe')
        const mainScript = path.join(runtimeDir, 'python', 'main.py')
        args = [mainScript, '--port', String(this.port)]
        cwd = path.join(runtimeDir, 'python')
      } else {
        const scriptPath = path.join(app.getAppPath(), 'python', 'main.py')
        // En desarrollo preferir el venv del repo; si no existe, el python del PATH.
        const venvPython = path.join(app.getAppPath(), 'venv', 'Scripts', 'python.exe')
        if (require('fs').existsSync(venvPython)) {
          command = venvPython
        }
        args = [scriptPath, '--port', String(this.port)]
        cwd = path.join(app.getAppPath(), 'python')
      }

      // Kill any zombie backend from a previous session.
      // Con el Python embebido no podemos hacer taskkill /IM python-backend.exe
      // (ya no existe). En su lugar, el pingBackend() anterior ya verifica si
      // el backend esta corriendo y se conecta a el. Si no responde, no hay
      // zombie que matar.
      //
      // NOTA: No hacemos taskkill /IM python.exe porque podriamos matar otros
      // procesos Python del usuario que no tienen nada que ver con WordAPA7.

      this.pythonProcess = spawn(command, args, {
        env: {
          ...process.env,
          APP_USERDATA: app.getPath('userData'),
        },
        windowsHide: true,
        cwd,
      })

      if (this.pythonProcess.stdout) {
        this.pythonProcess.stdout.on('data', (data) => {
          log('info', 'python-stdout', data.toString().trim())
        })
      }

      // El backend puede tardar varios segundos en arrancar (importar FastAPI,
      // cargar modelos, generar certificados SSL). Hacemos polling del API.
      // IMPORTANTE: usamos pingBackend() que prueba HTTPS primero y cae a HTTP.
      let retries = 0;
      const SOFT_TIMEOUT = 90; // Loguear advertencia a los 90s pero seguir intentando
      const pollBackend = async () => {
        if (this.stopped) return
        retries++;
        if (retries === SOFT_TIMEOUT) {
          log('warn', 'python-manager', `Backend tardo mas de ${SOFT_TIMEOUT}s — seguimos esperando...`)
        }
        const ok = await this.pingBackend()
        if (ok) {
          log('info', 'python-manager', 'Backend Python listo y respondiendo', {
            retries,
            protocol: this.backendProtocol,
          })
          // Notify all renderer windows that Python is ready
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('python-ready')
          })
          // Auto-setup del Add-in de Word: registrar el manifiesto en el
          // registro de Windows + generar manifest + catalogo compartido.
          this.autoSetupAddin()
          return resolve()
        } else {
          setTimeout(pollBackend, 1000)
        }
      }
      setTimeout(pollBackend, 1000)

      this.pythonProcess.stderr?.on('data', (data) => {
        log('error', 'python-stderr', data.toString().trim())
      })

      // Watchdog: si el backend crashea, reiniciarlo automaticamente (con tope)
      this.pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`)
        if (this.stopped) return
        if (this.restartCount >= this.MAX_RESTARTS) {
          log('error', 'python-manager', 'Backend crasheo demasiadas veces, se detiene el watchdog')
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('python-crashed')
          })
          return
        }
        this.restartCount++
        log('warn', 'python-manager', `Backend crasheo (codigo ${code}), reiniciando en 2s (intento ${this.restartCount})`)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('python-restarting')
        })
        setTimeout(() => {
          if (!this.stopped) {
            this.spawnAndPoll().catch(err => {
              log('error', 'python-manager', `Reintento fallido: ${err}`)
            })
          }
        }, 2000)
      })

      this.pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process', err)
        reject(err)
      })
    })
  }

  static stop() {
    this.stopped = true
    // If the backend was started by the watcher (not by us),
    // do NOT kill it — the watcher manages its lifecycle.
    if (this.pythonProcess && !this.externalBackend) {
      this.pythonProcess.kill()
    }
    this.pythonProcess = null
  }
}
