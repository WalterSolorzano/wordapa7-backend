# WordAPA7 — Word Add-in (Office.js)

Add-in de Microsoft Word que integra el **Asistente APA 7 en Vivo** **dentro de
Word** como un panel lateral. Mientras escribís o pegás contenido, el asistente
audita el documento en tiempo real: detecta y guarda citas, aplica formato APA 7
al vuelo y **numera automáticamente las figuras y tablas cuando las pegás**.

## Qué hace el asistente en vivo

El panel "En Vivo" es el corazón del add-in. Una vez activado:

- **Chupa citas**: detecta `(Autor, Año)` y `Autor (Año)` mientras escribís, las
  guarda en la bibliografía y te avisa *"¡Cita procesada con éxito!"*.
- **Formato al vuelo**: aplica Times New Roman 12pt, doble interlineado y
  sangría 0.5" al párrafo que estás editando.
- **Caption automático de figuras**: cuando **pegás una imagen**, el asistente le
  inserta automáticamente `Figura N` (negrita) + título en cursiva + `Nota.` al
  pie, con numeración consecutiva. No tenés que hacer nada.
- **Caption automático de tablas**: cuando **pegás una tabla**, le inserta
  `Tabla N` + título en cursiva + nota, igual que con las figuras.
- **Mascota**: un búho que va rotando tips y confirma cada acción.

Todo esto funciona **incluso sin backend**: la detección de citas y el formato
APA se hacen localmente con Office.js. Si el backend de Python (WordAPA7) está
corriendo, además persiste las citas y arma la bibliografía.

## Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│  Microsoft Word                                          │
│  ┌────────────────────────┬───────────────────────────┐ │
│  │                        │  TASK PANE (React)         │ │
│  │  Documento en edición  │  ─────────────────────────  │ │
│  │                        │  • En Vivo (asistente)     │ │
│  │  Office.js inserta     │  • Insertar (tabla/figura) │ │
│  │  el contenido aquí     │  • Referencias             │ │
│  │                        │  • Portada                 │ │
│  │                        │  • Comentarios             │ │
│  │                        │          ↓ HTTP             │ │
│  │                        │  [Python backend local]     │ │
│  └────────────────────────┴───────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## Inicio rápido (desarrollo)

### Prerrequisitos

1. **Node.js** 18+ instalado
2. **Word Desktop** (Windows o Mac) o **Word Online** (office.com)
3. El **backend de Python** de WordAPA7 corriendo (`start.bat` en la raíz del
   proyecto, o `python python/main.py`). *Opcional:* sin backend el asistente
   igual funciona en modo local.

### Pasos

1. **Lanzar el add-in** (instala dependencias la primera vez y levanta el
   servidor HTTPS):

   Hacé doble clic en **`start-addin.bat`** (dentro de `word-addin/`), o:

   ```bash
   cd word-addin
   npm install        # solo la primera vez
   npm run dev
   ```

   Esto levanta un servidor HTTPS en `https://localhost:3000`. Los certificados
   se generan automáticamente con `vite-plugin-mkcert` (certificado de confianza
   de desarrollo; la primera vez puede pedir instalar la CA local).

2. **Sideload del add-in en Word:**

   **Opción A — Word Desktop (Windows)**
   - Abrir Word → pestaña **Insertar** → **Mis complementos** (o "Add-ins")
   - Click en **Cargar mi complemento** ("Upload My Add-in")
   - Seleccionar el archivo `manifest.xml` del directorio `word-addin/`
   - Aparece una pestaña **WordAPA7** en el ribbon; al pulsarla se abre el panel.

   **Opción B — Word Online (office.com)**
   - Abrir un documento → pestaña **Insertar** → **Office Add-ins**
   - Click en **Upload My Add-in** → subir el `manifest.xml`

3. **Usar el add-in:**
   - Activá el asistente en la pestaña **En Vivo** (botón ON).
   - Escribí o pegá imágenes/tablas: el asistente las formatea y numera en APA 7.
   - Cada acción aparece como un mensaje en la pestaña **Comentarios**.

## Estructura del proyecto

```
word-addin/
├── manifest.xml              # Manifest del add-in (sideload en Word)
├── start-addin.bat           # Lanzador del servidor de desarrollo
├── package.json
├── vite.config.ts            # Build HTTPS (puerto 3000, mkcert)
├── taskpane.html             # HTML host del panel
├── commands.html             # HTML host de funciones del ribbon
├── public/assets/            # Iconos del add-in (16/32/80 px)
└── src/
    └── taskpane/
        ├── index.tsx         # Entry point (inicializa Office.js)
        ├── App.tsx           # Componente principal con pestañas
        ├── liveAssistant.ts  # MOTOR del asistente en vivo (scan, auto-caption)
        ├── citationDetector.ts  # Detector local de citas APA 7
        ├── api/backend.ts    # Cliente HTTP al backend de Python
        ├── office/wordHelper.ts  # Wrapper de Office.js (insertar, formatear, captionear)
        └── components/       # Paneles: En Vivo, Insertar, Referencias, Portada, Comentarios
```

## Pestañas del panel

### En Vivo (asistente)
- Toggle ON/OFF del asistente en vivo.
- Estadísticas: palabras, figuras, tablas y citas detectadas.
- Automatismos configurables: *chupar citas*, *formato al vuelo*, *caption de
  figuras/tablas*.
- Botón **Auditar documento ahora** para un escaneo manual.

### Insertar
- **Tabla APA 7**: encabezados, filas, título (cursiva) y nota. Inserta `Tabla N`
  + bordes horizontales + nota. Numeración automática.
- **Figura APA 7**: drag-drop de imagen, título, nota, texto alternativo y ancho.
  Inserta `Figura N` + imagen centrada + nota. Numeración automática.
- **Título APA 7**: niveles 1-5 con vista previa del formato.
- **Análisis APA 7**: analiza la selección o todo el documento (score 0-100).

### Referencias
- Bibliografía sugerida construida a partir de las citas detectadas.
- **Re-extraer** escanea el documento, detecta citas y arma la lista APA 7.
- **Insertar bibliografía** al final del documento (sangría francesa).
- Marcado de referencias *borrador* (falta completar) vs. *completas*.

### Portada
- Sugiere los 5 campos de la portada estudiante APA 7 (Título, Nombre,
  Institución, Curso, Fecha) a partir del documento.
- Vista previa e inserción al inicio del documento.

### Comentarios
- Feed estilo chat con todas las acciones del asistente (citas procesadas,
  figuras/tablas numeradas, formato aplicado, errores).

## Endpoints del backend Python

El add-in se comunica con el backend en `127.0.0.1:PUERTO` (por defecto 8742):

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/addin/health` | GET | Health check del backend |
| `/api/addin/extract-citations` | POST | Detecta citas, las guarda y devuelve el conteo |
| `/api/addin/references` | GET | Lista las referencias guardadas (store local) |
| `/api/addin/build-bibliography` | POST | Re-extrae (si recibe texto) y arma la bibliografía APA 7 |
| `/api/addin/save-reference` | POST | Crea/actualiza una referencia |
| `/api/addin/reference/{id}` | DELETE | Elimina una referencia |
| `/api/addin/clear-references` | DELETE | Vacía el store de referencias |
| `/api/addin/suggest-cover` | POST | Sugiere los campos de portada APA 7 |
| `/api/addin/detect-headings` | POST | Sugiere niveles de título por estructura |
| `/api/addin/analyze-selection` | POST | Analiza texto y reporta problemas APA 7 |
| `/api/addin/suggest-caption` | POST | Sugiere caption APA para figura/tabla |
| `/api/addin/validate-fragment` | POST | Valida un fragmento contra APA 7 |
| `/api/addin/next-figure-number` | POST | Calcula el próximo número de figura |
| `/api/addin/next-table-number` | POST | Calcula el próximo número de tabla |

Estos endpoints están en `python/routers/addin.py` y se registran automáticamente
en `main.py` cuando arranca el servidor.

## Build para producción

```bash
cd word-addin
npm run build
```

El output se genera en `word-addin/dist/` (incluye `taskpane.html`,
`commands.html`, `taskpane.js`, `commands.js` y los iconos). Para servirlo desde
el backend de Python, copiar los archivos a `dist/addin/` y actualizar el
`manifest.xml` para apuntar a `http://127.0.0.1:PUERTO/addin/taskpane.html`.

## Notas técnicas

- **Office.js** se carga desde el CDN de Microsoft
  (`https://appsforoffice.microsoft.com/lib/1/host/office.js`).
- El panel es una **app React** que corre dentro del iframe de Office.
- **CORS**: el backend de Python ya tiene `allow_origins=["*"]` configurado.
- **HTTPS obligatorio**: Office.js requiere HTTPS incluso en localhost.
  `vite-plugin-mkcert` genera los certificados automáticamente.
- **Compatibilidad**: funciona en Word Desktop (Windows/Mac) y Word Online.
- **Manifest**: el `<Id>` es un GUID válido (requerido por Word para el sideload)
  y define una pestaña de ribbon "WordAPA7" con un botón que abre el panel.
