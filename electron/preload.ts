import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  addRecentDocument: (path: string) => ipcRenderer.send('add-recent-document', path),
  setTheme: (theme: 'light' | 'dark') => ipcRenderer.send('set-theme', theme),
  onMenuAction: (callback: (event: any, action: string) => void) => ipcRenderer.on('menu-action', callback),
  // Emitido por PythonManager cuando el backend ha terminado de arrancar
  onPythonReady: (callback: () => void) => {
    ipcRenderer.on('python-ready', callback)
    // Return a cleanup function
    return () => ipcRenderer.removeListener('python-ready', callback)
  },
  // Watchdog: el backend crasheo / se esta reiniciando
  onPythonCrashed: (callback: () => void) => {
    ipcRenderer.on('python-crashed', callback)
    return () => ipcRenderer.removeListener('python-crashed', callback)
  },
  onPythonRestarting: (callback: () => void) => {
    ipcRenderer.on('python-restarting', callback)
    return () => ipcRenderer.removeListener('python-restarting', callback)
  },
  // Emitido por PythonManager cuando el Add-in de Word se configuro
  // automaticamente (manifiesto + registro de Windows + catalogo compartido).
  // El renderer puede mostrar un toast al usuario diciendole que reinicie
  // Word para ver el complemento.
  onAddinSideloaded: (callback: (data: {
    status: string
    hint: string
    manifest_path?: string
    registry_key?: string
    ssl_cert_installed?: boolean
  }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('addin-sideloaded', listener)
    return () => ipcRenderer.removeListener('addin-sideloaded', listener)
  },
  getBackendPort: () => ipcRenderer.sendSync('get-backend-port'),
  // Abre una URL externa en el navegador del sistema (fallback de descarga manual)
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  // Actualizaciones: estado + acciones del menu de update
  getAppVersion: () => ipcRenderer.sendSync('get-app-version'),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateStatus: (callback: (status: any) => void) => {
    const listener = (_event: any, status: any) => callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  expandToFullEditor: () => ipcRenderer.send('expand-to-full-editor'),
  showItemInFolder: (path: string) => ipcRenderer.send('show-item-in-folder', path),
  openPath: (path: string) => ipcRenderer.send('open-path', path),
  onDownloadCompleted: (callback: (data: { path: string; filename: string }) => void) => {
    const listener = (_event: any, data: { path: string; filename: string }) => callback(data)
    ipcRenderer.on('download-completed', listener)
    return () => ipcRenderer.removeListener('download-completed', listener)
  },
  // ── Context Menu integration ──────────────────────────────────────────
  // Recibe un archivo .docx desde el menu contextual de Windows
  // (click derecho -> "Convertir a APA 7 con WordAPA7").
  // El main process lee el archivo del disco y envia { fileName, buffer, isQuick, filePath }.
  onOpenFileFromOS: (callback: (data: { fileName: string; buffer: Uint8Array; isQuick?: boolean; filePath?: string }) => void) => {
    const listener = (_event: any, data: { fileName: string; buffer: Uint8Array; isQuick?: boolean; filePath?: string }) => callback(data)
    ipcRenderer.on('open-file-from-os', listener)
    return () => ipcRenderer.removeListener('open-file-from-os', listener)
  },
  // ── Copiar archivo físico al portapapeles (WhatsApp Ctrl+V) ─────────────
  copyFileToClipboard: (filePath: string) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  // ── Live File Watcher (Sincronización paralela con Word) ────────────────
  watchDocumentFile: (filePath: string, callback: (data: { filePath: string; fileName: string; timestamp: number }) => void) => {
    ipcRenderer.send('watch-document-file', filePath)
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('document-file-changed', listener)
    return () => {
      ipcRenderer.removeListener('document-file-changed', listener)
      ipcRenderer.send('unwatch-document-file')
    }
  },
  unwatchDocumentFile: () => ipcRenderer.send('unwatch-document-file'),
})
