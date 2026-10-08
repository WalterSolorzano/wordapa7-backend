import { app, Menu, BrowserWindow } from 'electron'

export function createMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // { role: 'appMenu' }
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: 'Acerca de WordAPA7' },
            { type: 'separator' },
            { role: 'services', label: 'Servicios' },
            { type: 'separator' },
            { role: 'hide', label: 'Ocultar' },
            { role: 'hideOthers', label: 'Ocultar otros' },
            { role: 'unhide', label: 'Mostrar todo' },
            { type: 'separator' },
            { role: 'quit', label: 'Salir' }
          ]
        }]
      : []) as Electron.MenuItemConstructorOptions[],
    // { role: 'fileMenu' }
    {
      label: 'Archivo',
      submenu: [
        { 
          label: 'Nuevo Documento',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
             const wins = BrowserWindow.getAllWindows();
             if(wins.length > 0) wins[0].webContents.send('menu-action', 'wordapa7-start-blank');
          }
        },
        { 
          label: 'Abrir Documento...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
             const wins = BrowserWindow.getAllWindows();
             if(wins.length > 0) wins[0].webContents.send('menu-action', 'trigger-upload');
          }
        },
        { type: 'separator' },
        { 
          label: 'Exportar a DOCX',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
             const wins = BrowserWindow.getAllWindows();
             if(wins.length > 0) wins[0].webContents.send('menu-action', 'trigger-export');
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Cerrar' } : { role: 'quit', label: 'Salir' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle', label: 'Pegar sin formato' },
              { role: 'delete', label: 'Eliminar' },
              { role: 'selectAll', label: 'Seleccionar todo' },
              { type: 'separator' },
              {
                label: 'Ortografía',
                submenu: [
                  { role: 'showGuessPanel', label: 'Mostrar panel de ortografía' },
                  { role: 'checkSpelling', label: 'Revisar ortografía ahora' }
                ]
              }
            ]
          : [
              { role: 'delete', label: 'Eliminar' },
              { type: 'separator' },
              { role: 'selectAll', label: 'Seleccionar todo' }
            ]) as Electron.MenuItemConstructorOptions[]
      ]
    },
    /* Preferencias. UNA sola entrada, y abre lo mismo que las otras seis: el hub
       de Ajustes. Antes se llamaba "Configuración de APA 7...", que prometía un
       editor de formato y entregaba un estudio con cinco pestañas que no tenían
       nada que ver entre sí. El nombre tiene que decir la pantalla. */
    {
      label: 'Preferencias',
      submenu: [
        {
          label: 'Ajustes...',
          click: () => {
             const wins = BrowserWindow.getAllWindows();
             if(wins.length > 0) wins[0].webContents.send('menu-action', 'trigger-preferences');
          }
        }
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'Vista',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño original' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: 'Traer al frente' },
              { type: 'separator' },
              { role: 'window', label: 'Ventana' }
            ]
          : [
              { role: 'close', label: 'Cerrar ventana' }
            ]) as Electron.MenuItemConstructorOptions[]
      ]
    },
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [
        {
          label: 'Normas APA 7ma Edición',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://apastyle.apa.org/')
          }
        },
        {
          label: 'Acerca de WordAPA7',
          click: async () => {
            const { dialog, app } = require('electron')
            dialog.showMessageBox({
              title: 'Acerca de WordAPA7',
              message: `WordAPA7 v${app.getVersion()}\n\nHerramienta de automatización y formateo de documentos según las normas APA 7ma Edición.`,
              buttons: ['Aceptar'],
              type: 'info'
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
