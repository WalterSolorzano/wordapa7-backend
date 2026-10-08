# WordAPA7-Web: Mega Plan de Correcciones y Adaptación Responsive / Móvil

> Ubicación del Proyecto Objetivo: `C:\Users\--X\.gemini\antigravity\scratch\wordapa7-web`
> Repositorio Remoto: `https://github.com/WalterSolorzano/wordapa7-backend.git`
> Despliegue Objetivo: Frontend en Vercel + Backend en Render (Docker/Linux)

---

## Diagnóstico en `wordapa7-web`
`wordapa7-web` ya tiene avances para desacople cloud (Docker, Render, headless en `word_com.py`, `build:web` en package.json), pero mantiene las mismas restricciones y fallos de la versión desktop:
1. **Layout Desktop Fijo (>1280px)**:
   - `PaperCanvas.tsx`: Gutters de comentarios fijos de 250px a ambos lados (`minWidth > 1316px`). Desborda severamente en teléfonos y tablets.
   - `UnifiedToolbar.tsx`: Columnas con `max-content` y sin menú móvil/hamburguesa.
   - `Step5AuditIAWizard.tsx`: Grids multi-columna de 3-4 columnas fijas (`RevisionRoom.tsx`, `RevisionGate.tsx`).
   - `AppShell.tsx`: IconRail lateral de 56px fijo + StatusBar sin Bottom Navigation táctil.
2. **Botones Inertes / Rotos / Hardcodeados**:
   - `FileMenu.tsx`: Botón *"Documento en blanco"* resetea estado en lugar de llamar a `startBlankDocument()`.
   - Diálogos nativos del navegador (`window.prompt`, `window.confirm`, `alert`) en `PaperCanvas.tsx` y `UploadDropzone.tsx`.
   - Botones de Windows local en `ExportView.tsx` ("Abrir en Word", "Enviar a Word", "Ver en Word") que fallan con 500 en la web.
   - `ToolbarOverflowMenu.tsx`: Opción de "Instalar actualización" que invoca IPC Electron inexistente en el navegador.

---

## Mega Plan de Implementación para `wordapa7-web`

### Tarea 1: Limpieza de Botones y Stubs en `wordapa7-web`
- [ ] **1.1 Corregir botón "Documento en blanco"**: En `src/components/layout/FileMenu.tsx`, conectar la acción a `startBlankDocument()` de `useDocStore.ts` y sustituir `window.confirm` por modal institucional de confirmación.
- [ ] **1.2 Erradicar `window.prompt` y `alert`**:
  - En `src/components/layout/PaperCanvas.tsx:759`, sustituir `window.prompt` por popover/input inline o enlazar con el Copiloto IA.
  - En `src/components/upload/UploadDropzone.tsx`, reemplazar `alert` por `showToast()`.
- [ ] **1.3 Ocultar acciones exclusivas de Windows local en `ExportView.tsx`**:
  - Ocultar botones "Ver en Word", "Abrir en Word" y "Enviar a Word" cuando corre en web (`WEB_ONLY` / navegador).
  - Dejar como acciones estelares "Descargar .docx" y "Descargar .pdf".
- [ ] **1.4 Limpiar `ToolbarOverflowMenu.tsx`**: Ocultar "Instalar actualización" en entorno web.

### Tarea 2: Adaptación Responsive del Shell y Navegación
- [ ] **2.1 Mobile Bottom Navigation en `src/components/shell/AppShell.tsx`**:
  - En pantallas `<768px`, ocultar el `IconRail` lateral izquierdo y el `StatusBar`.
  - Renderizar barra de navegación inferior fija (*Bottom Navigation Bar*) con iconos táctiles de 44px para las fases: *Inicio, Portada, Estructura, Referencias, Revisión, Exportar*.
- [ ] **2.2 TopBar Fluida en `src/components/toolbar/UnifiedToolbar.tsx`**:
  - Reemplazar el grid rígido `max-content` por layout responsive con `flex justify-between items-center`.
  - En pantallas pequeñas: mostrar título centrado, botón de Copiloto IA y menú colapsable (dropdown/drawer) para acciones secundarias.

### Tarea 3: Adaptación del Visor y Páginas (`PaperCanvas.tsx`)
- [ ] **3.1 Hoja fluida con escalado automático**:
  - Calcular escala dinámica en base al ancho de pantalla disponible: `zoom = Math.min(1, (containerWidth - 32) / 816)`.
  - Prevenir scroll horizontal accidental forzando `overflow-x-hidden` en el contenedor padre móvil.
- [ ] **3.2 Drawer de Comentarios Móvil**:
  - En pantallas `<1024px`, ocultar gutters laterales de comentarios fijos (250px).
  - Los comentarios se muestran mediante un botón flotante / chip indicador que despliega un *Bottom Sheet* deslizable con los hallazgos del párrafo activo.

### Tarea 4: Responsive en Asistentes y Wizards
- [ ] **4.1 Auditoría & Revisión (`Step5AuditIAWizard.tsx`)**:
  - En móviles y tablets, pasar de grid de columnas a flujo Master-Detail (Lista de hallazgos apilada -> Al pulsar un hallazgo, tarjeta en pantalla completa para "Aceptar" o "Revisar").
- [ ] **4.2 Portadas y Referencias (`CoverCarouselStudio.tsx`, `Step5ReferencesWizard.tsx`)**:
  - Reemplazar split-views horizontales por pestañas (*Tabs: Diseñar / Previsualizar*) o disposición vertical.
- [ ] **4.3 Copiloto IA Móvil (`DocumentAIChat.tsx`)**:
  - En móviles, desplegar el chat como modal/sheet a pantalla completa con soporte de `safe-area-inset-bottom`.
