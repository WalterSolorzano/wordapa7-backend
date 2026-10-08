# F7 — Proyectos: gestor de versiones colaborativas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Proyectos resuelva el problema real del usuario: tiene una carpeta con
múltiples versiones del mismo Word editadas en colaboración (`Tesis_final.docx`,
`Tesis_DEFINITIVO.docx`, `Tesis_DEFINITIVO_real.docx`) y no sabe cuál es la correcta
ni dónde quedaron los PDFs exportados.

**Lo que hace F7:**
1. Al importar un `.docx`, pregunta si crea un proyecto (no bloquea el flujo).
2. Si el usuario acepta: mueve el archivo a una carpeta organizada en `Documentos/WordAPA7/`.
3. Cuando llega otro `.docx` similar (mismo nombre base), pregunta si es una nueva versión.
4. La pantalla de Proyectos muestra la línea de tiempo de versiones.
5. Al exportar PDF, siempre va a `[carpeta del proyecto]/Exportados/`.
6. Las versiones archivadas van a una papelera interna de WordAPA7 que se purga sola.

**Lo que NO hace F7:**
- No toca la lógica de `uploadFile` antes de que el documento esté cargado.
- No bloquea el editor mientras el usuario decide sobre el proyecto.
- No mueve ni borra ningún archivo sin confirmación explícita del usuario.
- No reemplaza el flujo de importación actual: es una capa opcional encima.

**Dependency:** F0 y F1 mergeados. F7 usa `EstadoVacio` de F1 y `EditorialMascot`
existente (`kind: 'reference'`, `expression: 'curious'` para la notificación).

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §11.

---

## Global Constraints

Los mismos de F0, F1, F4, F5:

- **Cero emojis.** Solo `lucide-react` con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales.** Solo tokens `var(--...)`.
- `npx tsc --noEmit` obligatorio en cada tarea. `npx vitest run` no puede bajar.
- `git add` explícito. **Nunca `git add -A`.**
- Después de cada escritura: `Select-String -Path <archivos> -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`.
  Comentarios y commits **en español**.
- **El `uploadFile` existente no se modifica.** El hook de proyecto se engancha
  *después* de que `uploadFile` resuelve — nunca dentro de él.
- **Nunca mover ni borrar un archivo sin que el usuario lo confirmara** en un paso
  anterior. Las funciones de archivo del backend deben fallar ruidosamente
  (HTTP 409 o 422) si el archivo destino ya existe, antes de sobreescribir.
- **El rail vive siempre** (AGENTS.md §1).

**Baseline:** hereda el baseline de F0 + F1 al ejecutar.

---

## Glosario

| Término | Definición |
|---|---|
| **Proyecto** | Grupo de versiones de un mismo documento + carpeta en disco |
| **Versión activa** | El `.docx` sobre el que trabaja el editor actualmente |
| **Versión historial** | `.docx` anteriores del mismo proyecto, conservados pero no activos |
| **Carpeta raíz de WordAPA7** | `[Documentos del usuario]/WordAPA7/` — creada una vez al configurar |
| **Carpeta del proyecto** | `[Raíz]/[Nombre del proyecto]/` |
| **Carpeta de exportados** | `[Carpeta del proyecto]/Exportados/` |
| **Papelera interna** | `[Raíz]/_Papelera/` — archivos purgados al cerrar proyectos |

---

## Review Focus

1. **Usuario dice "Ahora no" al crear proyecto.** El archivo queda donde estaba, el
   editor sigue funcionando exactamente igual, y la notificación no vuelve a aparecer
   para ese mismo archivo en la misma sesión. → Task 2
2. **Dos archivos con nombres completamente distintos en la misma carpeta.** No se
   agrupan como versiones aunque estén juntos. El algoritmo de similitud usa el nombre
   base, no la ubicación. → Task 1
3. **Carpeta de WordAPA7 no existe todavía.** El backend la crea en el momento de
   confirmar el primer proyecto. No intenta crearla en el startup de FastAPI. → Task 3
4. **Archivo destino ya existe al mover.** El backend responde 409. El frontend muestra
   un toast de error y no deja la operación en estado inconsistente. → Task 3
5. **Exportar PDF sin proyecto activo.** El comportamiento es el de siempre: PDF va a
   donde el usuario elige (o a Descargas). Sin proyecto → sin carpeta organizada,
   sin fricción. → Task 5

---

### Task 1: Algoritmo de detección de versiones similares

Antes de tocar UI ni backend, la lógica de detección vive en una hoja pura
sin dependencias. Se puede testear sin montar nada.

**Files:**
- Create: `src/lib/versionDetector.ts`
- Test: `src/__tests__/versionDetector.test.ts`

**Algoritmo:**

Un par de archivos son "versiones del mismo documento" si su **nombre base normalizado**
es idéntico o tiene distancia de Levenshtein ≤ 2.

El nombre base normalizado se obtiene así:

```ts
export function normalizarNombreBase(filename: string): string {
  // 1. Quitar extensión
  let name = filename.replace(/\.docx$/i, '');
  // 2. Quitar sufijos numéricos de Windows: " (1)", " (2)", "(1)", etc.
  name = name.replace(/\s*\(\d+\)\s*$/, '');
  // 3. Quitar sufijos de versión comunes (case-insensitive)
  name = name.replace(/[_\s-]+(v\d+|final|definitivo|real|copia|editado|revisado|borrador|draft|nuevo|new|corregido|ultimo|last|\d{4}-\d{2}-\d{2}|\d{8})$/gi, '');
  // 4. Quitar nombre de persona al final: "_Juan", "_María", etc. (palabra con mayúscula)
  name = name.replace(/[_\s-]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/g, '');
  // 5. Normalizar: lowercase, trim, colapsar espacios/guiones/underscores
  return name.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

// Distancia de Levenshtein — solo para nombres cortos (< 50 chars)
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

export function sonVersionesSimilares(nombreA: string, nombreB: string): boolean {
  const a = normalizarNombreBase(nombreA);
  const b = normalizarNombreBase(nombreB);
  if (a.length < 3 || b.length < 3) return false; // nombres demasiado cortos → no comparar
  return a === b || levenshtein(a, b) <= 2;
}
```

**Steps:**

- [ ] **Step 1: Tests primero**

```ts
// src/__tests__/versionDetector.test.ts
import { normalizarNombreBase, sonVersionesSimilares } from '../lib/versionDetector';

// normalizarNombreBase
it('quita extensión .docx', () => {
  expect(normalizarNombreBase('Tesis.docx')).toBe('tesis');
});
it('quita sufijo Windows (1)', () => {
  expect(normalizarNombreBase('Tesis (1).docx')).toBe('tesis');
});
it('quita sufijo _final', () => {
  expect(normalizarNombreBase('Tesis_final.docx')).toBe('tesis');
});
it('quita sufijo _DEFINITIVO', () => {
  expect(normalizarNombreBase('Tesis_DEFINITIVO.docx')).toBe('tesis');
});
it('quita sufijo _v2', () => {
  expect(normalizarNombreBase('Tesis_v2.docx')).toBe('tesis');
});
it('quita nombre de persona al final', () => {
  expect(normalizarNombreBase('Tesis_EDITADO_Juan.docx')).toBe('tesis editado');
  // "_editado" no es un sufijo de versión, se conserva; "_Juan" sí se quita
});
it('no quita parte del nombre real si no es sufijo', () => {
  expect(normalizarNombreBase('Metodologia_final.docx')).toBe('metodologia');
});

// sonVersionesSimilares
it('mismo nombre → similares', () => {
  expect(sonVersionesSimilares('Tesis.docx', 'Tesis.docx')).toBe(true);
});
it('con sufijo (1) → similares', () => {
  expect(sonVersionesSimilares('Tesis.docx', 'Tesis (1).docx')).toBe(true);
});
it('_final vs _DEFINITIVO → similares', () => {
  expect(sonVersionesSimilares('Tesis_final.docx', 'Tesis_DEFINITIVO.docx')).toBe(true);
});
it('nombres distintos → NO similares', () => {
  expect(sonVersionesSimilares('Tesis.docx', 'Informe.docx')).toBe(false);
});
it('nombre demasiado corto → NO similares', () => {
  expect(sonVersionesSimilares('ab.docx', 'ac.docx')).toBe(false);
});
it('Levenshtein ≤ 2 → similares (typo)', () => {
  expect(sonVersionesSimilares('Tesiss.docx', 'Tesis.docx')).toBe(true);
});
it('Levenshtein > 2 → NO similares', () => {
  expect(sonVersionesSimilares('TesisA.docx', 'TesisXYZ.docx')).toBe(false);
});
```

- [ ] **Step 2: Implementar `versionDetector.ts`**

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/__tests__/versionDetector.test.ts
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/versionDetector.ts src/__tests__/versionDetector.test.ts
git commit -m "proyectos: algoritmo de deteccion de versiones similares

normalizarNombreBase quita sufijos (1), _final, _v2, _DEFINITIVO,
nombre de persona y fechas. sonVersionesSimilares con Levenshtein <= 2.
Sin dependencias externas, testeable en aislamiento."
```

---

### Task 2: Modelo de Proyecto en el store y notificación post-upload

Define el modelo `Proyecto` en el store y el mecanismo no intrusivo que pregunta
después de cada `uploadFile` exitoso.

**Files:**
- Create: `src/store/slices/proyectoSlice.ts`
- Create: `src/lib/proyectoStore.ts` (persistencia en localStorage)
- Modify: `src/store/types.ts` (agregar tipos y acciones)
- Create: `src/components/project/ProyectoNotificacion.tsx`
- Test: `src/__tests__/proyectoNotificacion.test.tsx`

**Modelo:**

```ts
// src/store/types.ts — agregar
export interface VersionDocumento {
  id: string;               // uuid
  filename: string;         // nombre original del archivo
  rutaEnDisco: string;      // ruta completa tras mover
  palabras: number;         // word count del documento al importar
  fechaModificacion: number; // timestamp de última modificación (File.lastModified)
  autor: string;            // de metadatos Word (doc.portada?.fields?.author || '')
  esActiva: boolean;
  archivadoEn?: number;     // timestamp de cuando se archivó (undefined = no archivado)
}

export interface Proyecto {
  id: string;               // uuid
  nombre: string;           // nombre legible (sin sufijos)
  carpeta: string;          // ruta absoluta en disco
  versiones: VersionDocumento[];
  creadoEn: number;         // timestamp
  cerrado: boolean;
}

// Acciones que se agregan al store
export interface ProyectoSlice {
  proyectos: Proyecto[];
  proyectoActivoId: string | null;
  // Notificación post-upload
  notificacionProyecto: {
    visible: boolean;
    filename: string;
    versionesDetectadas: string[];   // nombres de archivos similares encontrados
    modo: 'nuevo' | 'nueva-version'; // nuevo proyecto vs nueva versión de uno existente
    proyectoExistenteId?: string;    // si modo === 'nueva-version'
  } | null;
  // Acciones
  mostrarNotificacionProyecto: (payload: ProyectoSlice['notificacionProyecto']) => void;
  ocultarNotificacionProyecto: () => void;
  crearProyecto: (nombre: string, filename: string) => Promise<void>;
  agregarVersion: (proyectoId: string, filename: string) => Promise<void>;
  marcarVersionActiva: (proyectoId: string, versionId: string) => void;
  cerrarProyecto: (proyectoId: string) => void;
  limpiarVersionesAntiguas: (proyectoId: string) => Promise<void>;
}
```

**Hook post-upload:**

En `documentSlice.ts`, al final de `uploadFile` (después del `set(...)` que ya existe),
se llama `get().evaluarProyectoParaArchivo(file)`. Esta función **no existe todavía en
documentSlice**: se agrega en `proyectoSlice` y se expone como acción del store.

```ts
// proyectoSlice.ts
evaluarProyectoParaArchivo: async (file: File) => {
  const { proyectos, mostrarNotificacionProyecto } = get();

  // 1. ¿Ya pertenece a un proyecto existente?
  const yaEnProyecto = proyectos.some(p =>
    p.versiones.some(v => v.filename === file.name)
  );
  if (yaEnProyecto) return; // ya está gestionado

  // 2. ¿Hay un proyecto donde alguna versión es similar?
  const proyectoSimilar = proyectos.find(p =>
    p.versiones.some(v => sonVersionesSimilares(v.filename, file.name))
  );
  if (proyectoSimilar) {
    mostrarNotificacionProyecto({
      visible: true,
      filename: file.name,
      versionesDetectadas: proyectoSimilar.versiones.map(v => v.filename),
      modo: 'nueva-version',
      proyectoExistenteId: proyectoSimilar.id,
    });
    return;
  }

  // 3. ¿No hay proyecto? Mostrar propuesta de crear uno nuevo.
  // Solo si el archivo fue visto por primera vez en esta sesión.
  // No volver a preguntar por el mismo filename en la misma sesión.
  const yaPregunté = get()._archivosYaPreguntados?.has(file.name) ?? false;
  if (yaPregunté) return;
  get()._marcarArchivoComoYaPreguntado(file.name);

  mostrarNotificacionProyecto({
    visible: true,
    filename: file.name,
    versionesDetectadas: [],
    modo: 'nuevo',
  });
},
```

`_archivosYaPreguntados` es un `Set<string>` en el store que **no se persiste**
(vive solo en la sesión).

**`ProyectoNotificacion.tsx`:**

Card de esquina inferior derecha. Usa `EditorialMascot` con `kind="reference"` y
`expression="curious"`. Se monta con `position: fixed`, `bottom: 24px`, `right: 24px`,
`zIndex` en la escala del proyecto (no 9999 inline). Desaparece con X o con los botones.

```tsx
// Modo 'nuevo'
<card>
  <EditorialMascot kind="reference" expression="curious" size={40} />
  <div>
    <strong>¿Creamos un proyecto para este documento?</strong>
    <span>Esto organizará tus versiones y exportaciones en una carpeta.</span>
  </div>
  <X onClick={ocultarNotificacionProyecto} />
  <button onClick={handleAhoraNo}>Ahora no</button>
  <button onClick={handleCrearProyecto}>Crear proyecto</button>
</card>

// Modo 'nueva-version'
<card>
  <EditorialMascot kind="reference" expression="curious" size={40} />
  <div>
    <strong>Parece una nueva versión de "{proyectoNombre}"</strong>
    <span>¿La agregamos al proyecto como la versión más reciente?</span>
  </div>
  <X onClick={ocultarNotificacionProyecto} />
  <button onClick={handleAhoraNo}>Ahora no</button>
  <button onClick={handleAgregarVersion}>Agregar al proyecto</button>
</card>
```

**Steps:**

- [ ] **Step 1: Tests primero**

```ts
// src/__tests__/proyectoNotificacion.test.tsx

it('no aparece si notificacionProyecto es null', () => {
  // monta con store que tiene notificacionProyecto: null
  expect(screen.queryByText(/creamos un proyecto/i)).toBeNull();
});

it('modo nuevo muestra texto de crear proyecto', () => {
  // monta con notificacionProyecto: { visible: true, modo: 'nuevo', filename: 'Tesis.docx', ... }
  expect(screen.getByText(/creamos un proyecto/i)).toBeInTheDocument();
});

it('modo nueva-version muestra nombre del proyecto existente', () => {
  // monta con modo: 'nueva-version', proyectoExistenteId apuntando a un proyecto con nombre
  expect(screen.getByText(/versión de/i)).toBeInTheDocument();
});

it('X llama ocultarNotificacionProyecto', () => {
  const spy = vi.fn();
  // monta y hace click en X
  expect(spy).toHaveBeenCalledOnce();
});

it('la card tiene position fixed y zIndex menor a 1000', () => {
  // lee el fuente con ?raw y verifica que no hay zIndex inline > 999
  import src from '../components/project/ProyectoNotificacion.tsx?raw';
  expect(src).not.toMatch(/zIndex.*[1-9]\d{3,}/); // no hay 4+ dígitos
  expect(src).toMatch(/position.*fixed/);
});

it('mascota tiene kind reference y expression curious', () => {
  // monta y verifica que el SVG tiene las clases correctas
  expect(document.querySelector('.editorial-mascot-kind-reference')).not.toBeNull();
  expect(document.querySelector('.editorial-mascot-expression-curious')).not.toBeNull();
});
```

- [ ] **Step 2: Implementar `proyectoSlice.ts`**

El slice incluye: `proyectos`, `proyectoActivoId`, `notificacionProyecto`,
`_archivosYaPreguntados` (Set), todas las acciones del modelo.

`proyectos` se persiste en localStorage bajo la clave `wordapa7_proyectos_v1`.
`_archivosYaPreguntados` **no** se persiste.

La persistencia usa `JSON.parse`/`JSON.stringify` directo — no IndexedDB, no Zustand
`persist` (para no pisar el `partialize` existente del store principal).

```ts
// src/lib/proyectoStore.ts
const CLAVE = 'wordapa7_proyectos_v1';
export function cargarProyectos(): Proyecto[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || '[]');
  } catch { return []; }
}
export function guardarProyectos(proyectos: Proyecto[]): void {
  localStorage.setItem(CLAVE, JSON.stringify(proyectos));
}
```

- [ ] **Step 3: Enganchar al final de `uploadFile`**

En `documentSlice.ts`, al final del bloque `try` de `uploadFile` (después del `set`
que actualiza `doc`, `tabs`, etc.), agregar **una sola línea**:

```ts
// Al final del try de uploadFile, después del set(...):
setTimeout(() => get().evaluarProyectoParaArchivo(file), 800);
```

El `setTimeout` de 800 ms es intencional: deja que el editor termine de renderizarse
antes de mostrar la notificación. No es un spinner ni un bloqueo.

- [ ] **Step 4: Montar `ProyectoNotificacion` en `App.tsx`**

Agregar `<ProyectoNotificacion />` como último hijo del árbol de `App.tsx`, después de
los toasts existentes. Condicionado a `notificacionProyecto?.visible === true`.

- [ ] **Step 5: Verificar**

```bash
npx vitest run src/__tests__/proyectoNotificacion.test.tsx
npx tsc --noEmit
Select-String -Path 'src/components/project/ProyectoNotificacion.tsx' -Pattern 'zIndex.*[0-9]{4,}|rgba|#[0-9a-fA-F]{3,6}'
```

El segundo comando no debe tener salida.

- [ ] **Step 6: Commit**

```bash
git add src/store/slices/proyectoSlice.ts src/lib/proyectoStore.ts \
        src/lib/versionDetector.ts src/store/types.ts \
        src/components/project/ProyectoNotificacion.tsx \
        src/store/slices/documentSlice.ts src/App.tsx \
        src/__tests__/proyectoNotificacion.test.tsx
git commit -m "proyectos: modelo, notificacion post-upload y deteccion de versiones

ProyectoSlice con Proyecto, VersionDocumento y notificacion de esquina.
evaluarProyectoParaArchivo se llama 800ms despues del upload exitoso.
Mascota EditorialMascot kind=reference expression=curious.
No bloquea el editor. No pregunta dos veces por el mismo archivo."
```

---

### Task 3: Backend — endpoints de archivo y carpetas

Los dos endpoints que el frontend necesita para mover archivos y crear carpetas.
**Lazy, no en startup.** Toda operación de sistema de archivos va al backend — el
frontend no toca el sistema de archivos directamente.

**Files:**
- Create: `python/modules/proyecto_manager.py`
- Modify: `python/main.py` (3 endpoints nuevos)
- Test: `python/tests/test_proyecto_manager.py`

**Endpoints:**

```
POST /api/proyectos/configurar-raiz
  Body: { "ruta": "C:/Users/Juan/Documentos/WordAPA7" }
  Acción: crea la carpeta si no existe (os.makedirs). Guarda la ruta en
          un archivo de configuración local (wordapa7_config.json en AppData).
  Responde: { "ruta": "...", "creada": true|false }
  Error: 422 si la ruta no es un directorio válido.

POST /api/proyectos/crear
  Body: { "nombre": "Tesis de Maestría", "archivo_origen": "C:/Users/Juan/Descargas/Tesis_final.docx" }
  Acción:
    1. Lee la ruta raíz de la config.
    2. Crea [raíz]/[nombre]/ si no existe.
    3. Crea [raíz]/[nombre]/Exportados/ si no existe.
    4. Copia (no mueve) el archivo a [raíz]/[nombre]/[filename].
       NUNCA sobreescribe: si ya existe, responde 409.
    5. Registra el proyecto en wordapa7_config.json.
  Responde: { "proyecto_id": "uuid", "carpeta": "...", "archivo_destino": "..." }

POST /api/proyectos/agregar-version
  Body: { "proyecto_id": "uuid", "archivo_origen": "C:/..." }
  Acción: misma lógica de copia, dentro de la carpeta del proyecto existente.
  Responde: { "archivo_destino": "..." }

POST /api/proyectos/archivar-version
  Body: { "proyecto_id": "uuid", "archivo": "nombre.docx" }
  Acción: mueve el archivo a [raíz]/_Papelera/[proyecto_id]/[filename].
          Guarda la fecha de archivado en la config.
  Responde: { "movido_a": "..." }

GET /api/proyectos/purgar-papelera
  Acción: elimina archivos en _Papelera/ cuya fecha de archivado es
          > DIAS_RETENCION (30 días por defecto, configurable en config).
  Responde: { "eliminados": N }
```

**`proyecto_manager.py`:**

```python
# python/modules/proyecto_manager.py
import os, json, uuid, shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

CONFIG_FILE = Path(os.environ.get('APPDATA', Path.home())) / 'WordAPA7' / 'wordapa7_config.json'
DIAS_RETENCION = 30

def _leer_config() -> dict:
    if CONFIG_FILE.exists():
        try: return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        except: pass
    return {}

def _guardar_config(config: dict) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')

def configurar_raiz(ruta: str) -> dict:
    path = Path(ruta)
    creada = not path.exists()
    path.mkdir(parents=True, exist_ok=True)
    config = _leer_config()
    config['raiz_proyectos'] = str(path)
    _guardar_config(config)
    return {'ruta': str(path), 'creada': creada}

def _raiz() -> Optional[Path]:
    config = _leer_config()
    raiz = config.get('raiz_proyectos')
    return Path(raiz) if raiz else None

def crear_proyecto(nombre: str, archivo_origen: str) -> dict:
    raiz = _raiz()
    if not raiz: raise ValueError('raiz_proyectos no configurada')
    carpeta = raiz / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / 'Exportados').mkdir(exist_ok=True)
    origen = Path(archivo_origen)
    destino = carpeta / origen.name
    if destino.exists():
        raise FileExistsError(f'{destino} ya existe')
    shutil.copy2(str(origen), str(destino))
    proyecto_id = str(uuid.uuid4())
    config = _leer_config()
    proyectos = config.get('proyectos', {})
    proyectos[proyecto_id] = {
        'nombre': nombre, 'carpeta': str(carpeta), 'creado_en': datetime.now().isoformat()
    }
    config['proyectos'] = proyectos
    _guardar_config(config)
    return {'proyecto_id': proyecto_id, 'carpeta': str(carpeta), 'archivo_destino': str(destino)}

def agregar_version(proyecto_id: str, archivo_origen: str) -> dict:
    config = _leer_config()
    proyecto = config.get('proyectos', {}).get(proyecto_id)
    if not proyecto: raise KeyError(f'Proyecto {proyecto_id} no encontrado')
    carpeta = Path(proyecto['carpeta'])
    origen = Path(archivo_origen)
    destino = carpeta / origen.name
    if destino.exists():
        raise FileExistsError(f'{destino} ya existe')
    shutil.copy2(str(origen), str(destino))
    return {'archivo_destino': str(destino)}

def archivar_version(proyecto_id: str, archivo: str) -> dict:
    raiz = _raiz()
    config = _leer_config()
    proyecto = config.get('proyectos', {}).get(proyecto_id)
    if not raiz or not proyecto: raise KeyError('Proyecto no encontrado')
    origen = Path(proyecto['carpeta']) / archivo
    papelera = raiz / '_Papelera' / proyecto_id
    papelera.mkdir(parents=True, exist_ok=True)
    destino = papelera / archivo
    shutil.move(str(origen), str(destino))
    archivados = config.get('archivados', [])
    archivados.append({'archivo': str(destino), 'fecha': datetime.now().isoformat()})
    config['archivados'] = archivados
    _guardar_config(config)
    return {'movido_a': str(destino)}

def purgar_papelera() -> dict:
    config = _leer_config()
    archivados = config.get('archivados', [])
    limite = datetime.now() - timedelta(days=DIAS_RETENCION)
    eliminados = 0
    restantes = []
    for item in archivados:
        fecha = datetime.fromisoformat(item['fecha'])
        if fecha < limite:
            try:
                Path(item['archivo']).unlink(missing_ok=True)
                eliminados += 1
            except: restantes.append(item)
        else:
            restantes.append(item)
    config['archivados'] = restantes
    _guardar_config(config)
    return {'eliminados': eliminados}
```

**Steps:**

- [ ] **Step 1: Tests primero**

```python
# python/tests/test_proyecto_manager.py
import pytest, tempfile, os
from pathlib import Path

# Parchea CONFIG_FILE para que use un tempdir en cada test
@pytest.fixture(autouse=True)
def config_temporal(tmp_path, monkeypatch):
    import python.modules.proyecto_manager as pm
    monkeypatch.setattr(pm, 'CONFIG_FILE', tmp_path / 'config.json')
    yield

def test_configurar_raiz_crea_carpeta(tmp_path):
    from python.modules.proyecto_manager import configurar_raiz
    ruta = str(tmp_path / 'WordAPA7')
    resultado = configurar_raiz(ruta)
    assert Path(ruta).is_dir()
    assert resultado['creada'] is True

def test_configurar_raiz_no_falla_si_ya_existe(tmp_path):
    from python.modules.proyecto_manager import configurar_raiz
    ruta = str(tmp_path / 'WordAPA7')
    configurar_raiz(ruta)
    resultado = configurar_raiz(ruta)
    assert resultado['creada'] is False

def test_crear_proyecto_mueve_archivo(tmp_path):
    from python.modules.proyecto_manager import configurar_raiz, crear_proyecto
    raiz = str(tmp_path / 'WordAPA7')
    configurar_raiz(raiz)
    archivo = tmp_path / 'Tesis.docx'
    archivo.write_bytes(b'fake docx')
    resultado = crear_proyecto('Tesis de Maestria', str(archivo))
    assert Path(resultado['archivo_destino']).exists()
    assert (Path(resultado['carpeta']) / 'Exportados').is_dir()

def test_crear_proyecto_409_si_destino_existe(tmp_path):
    from python.modules.proyecto_manager import configurar_raiz, crear_proyecto
    raiz = str(tmp_path / 'WordAPA7')
    configurar_raiz(raiz)
    archivo = tmp_path / 'Tesis.docx'
    archivo.write_bytes(b'fake docx')
    crear_proyecto('Tesis de Maestria', str(archivo))
    archivo.write_bytes(b'fake docx 2')  # nuevo archivo con mismo nombre
    with pytest.raises(FileExistsError):
        crear_proyecto('Tesis de Maestria', str(archivo))

def test_archivar_y_purgar(tmp_path):
    from python.modules.proyecto_manager import configurar_raiz, crear_proyecto, archivar_version, purgar_papelera
    from datetime import datetime, timedelta
    import python.modules.proyecto_manager as pm
    raiz = str(tmp_path / 'WordAPA7')
    configurar_raiz(raiz)
    archivo = tmp_path / 'Tesis.docx'
    archivo.write_bytes(b'fake')
    resultado = crear_proyecto('Tesis', str(archivo))
    archivar_version(resultado['proyecto_id'], 'Tesis.docx')
    # Simular que pasaron 31 dias
    config = pm._leer_config()
    config['archivados'][0]['fecha'] = (datetime.now() - timedelta(days=31)).isoformat()
    pm._guardar_config(config)
    purga = purgar_papelera()
    assert purga['eliminados'] == 1
```

- [ ] **Step 2: Implementar `proyecto_manager.py`**

- [ ] **Step 3: Agregar endpoints en `main.py`**

```python
# Después de los imports existentes, agregar:
from python.modules.proyecto_manager import (
    configurar_raiz, crear_proyecto, agregar_version,
    archivar_version, purgar_papelera
)

@app.post("/api/proyectos/configurar-raiz")
async def endpoint_configurar_raiz(body: dict):
    ruta = body.get("ruta", "")
    if not ruta: raise HTTPException(422, "ruta requerida")
    return configurar_raiz(ruta)

@app.post("/api/proyectos/crear")
async def endpoint_crear_proyecto(body: dict):
    try:
        return crear_proyecto(body["nombre"], body["archivo_origen"])
    except FileExistsError as e:
        raise HTTPException(409, str(e))
    except (KeyError, ValueError) as e:
        raise HTTPException(422, str(e))

@app.post("/api/proyectos/agregar-version")
async def endpoint_agregar_version(body: dict):
    try:
        return agregar_version(body["proyecto_id"], body["archivo_origen"])
    except FileExistsError as e:
        raise HTTPException(409, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))

@app.post("/api/proyectos/archivar-version")
async def endpoint_archivar_version(body: dict):
    try:
        return archivar_version(body["proyecto_id"], body["archivo"])
    except KeyError as e:
        raise HTTPException(404, str(e))

@app.get("/api/proyectos/purgar-papelera")
async def endpoint_purgar_papelera():
    return purgar_papelera()
```

- [ ] **Step 4: Verificar**

```bash
pytest python/tests/test_proyecto_manager.py -v
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add python/modules/proyecto_manager.py python/tests/test_proyecto_manager.py python/main.py
git commit -m "proyectos: backend de archivo y carpetas

5 endpoints: configurar-raiz, crear, agregar-version, archivar-version,
purgar-papelera. shutil.copy2 (no move) al crear para no dejar el
original sin archivo si falla. 409 si el destino ya existe.
Papelera en _Papelera/ con purga automatica a 30 dias."
```

---

### Task 4: Pantalla de Proyectos

Reemplaza `ProjectFolderModal.tsx` (que hoy no hace nada útil) por la pantalla completa
de gestión de proyectos con lista + línea de tiempo de versiones.

**Files:**
- Create: `src/components/project/ProyectosScreen.tsx`
- Create: `src/components/project/VersionTimeline.tsx`
- Modify: `src/App.tsx` (agregar la entrada al rail y la pantalla)
- Modify: `src/lib/railItems.ts` (agregar entrada de Proyectos)
- Test: `src/__tests__/proyectosScreen.test.tsx`

**Layout (igual al mockup):**

```
[Rail 56px] | [Lista proyectos 240px] | [Detalle con versiones flex]
```

El rail tiene una nueva entrada `Folder` entre las fases del editor y los Ajustes.
Su conteo de pendientes (`railPending.ts`) es la cantidad de proyectos con versiones
sin revisar (donde no se ha marcado una versión activa). Si todos los proyectos tienen
versión activa → conteo 0, sin badge.

**`VersionTimeline.tsx`:** lista vertical de tarjetas, una por versión. La activa está
arriba con borde azul y chip "ACTIVA". Las demás muestran diferencia de palabras
(`-542 palabras vs activa`). Las versiones más antiguas que 3 se colapsan en
`+N versiones anteriores`.

**El diálogo de primera vez:** si `proyectos.length === 0` y no hay raíz configurada,
la pantalla muestra el diálogo de configuración de carpeta (no la lista). El diálogo
llama a `POST /api/proyectos/configurar-raiz` y guarda la respuesta en el store.
"Ahora no" cierra la pantalla sin cambiar nada.

**Steps:**

- [ ] **Step 1: Tests primero**

```ts
// src/__tests__/proyectosScreen.test.tsx

it('sin proyectos muestra diálogo de configuración de carpeta', () => {
  // monta con proyectos: [], raizConfigurada: false
  expect(screen.getByText(/organizar mis documentos/i)).toBeInTheDocument();
});

it('con proyectos muestra lista', () => {
  // monta con 2 proyectos
  expect(screen.getByText('Tesis de Maestría')).toBeInTheDocument();
  expect(screen.getByText('Trabajo Final')).toBeInTheDocument();
});

it('versión activa aparece en la posición más alta de la línea de tiempo', () => {
  // monta con un proyecto con 3 versiones, una activa
  const tarjetas = screen.getAllByRole('article');
  expect(tarjetas[0]).toHaveTextContent('ACTIVA');
});

it('versiones > 3 se colapsan', () => {
  // monta con 5 versiones
  expect(screen.getByText(/\+2 versiones anteriores/)).toBeInTheDocument();
});

it('entrada en el rail tiene ícono Folder', () => {
  // lee railItems.ts con ?raw
  import src from '../lib/railItems.ts?raw';
  expect(src).toMatch(/Folder/);
});
```

- [ ] **Step 2: Implementar `VersionTimeline.tsx`**

Componente puro: recibe `versiones: VersionDocumento[]` y callbacks. No tiene estado
de red. Diferencia de palabras: `v.palabras - activa.palabras`, con prefijo `+` o `-`.

- [ ] **Step 3: Implementar `ProyectosScreen.tsx`**

Monta `VersionTimeline`. El botón "Cerrar proyecto" llama `cerrarProyecto(id)` del store
(marca `cerrado: true`, no borra nada). Los proyectos cerrados aparecen con chip
"Cerrado" y sin línea de tiempo expandida.

- [ ] **Step 4: Agregar entrada al rail**

```ts
// src/lib/railItems.ts — agregar en la lista de fases del editor
{
  id: 'proyectos',
  icon: Folder,
  label: 'Proyectos',
  step: -1,           // no es un paso del wizard, es una vista propia
  pendingCount: () => get().proyectos.filter(p => !p.cerrado && !p.versiones.some(v => v.esActiva)).length,
}
```

- [ ] **Step 5: Verificar y commit**

```bash
npx vitest run src/__tests__/proyectosScreen.test.tsx
npx tsc --noEmit
git add src/components/project/ProyectosScreen.tsx \
        src/components/project/VersionTimeline.tsx \
        src/lib/railItems.ts src/App.tsx \
        src/__tests__/proyectosScreen.test.tsx
git commit -m "proyectos: pantalla con lista y linea de tiempo de versiones

Lista izquierda + timeline derecho. Diálogo de primera vez si no hay
raiz configurada. Versiones > 3 colapsadas. Entrada en el rail con
conteo de proyectos sin version activa. Proyectos cerrados con chip."
```

---

### Task 5: Exportación a carpeta organizada

Cuando el documento abierto pertenece a un proyecto, el PDF exportado va automáticamente
a `[carpeta del proyecto]/Exportados/` con nombre `[nombre_base]_APA7_[fecha].pdf`.

**Files:**
- Modify: `src/components/wizard/ExportView.tsx`
- Modify: `python/main.py` (endpoint `generate-pdf` — agregar parámetro `destino`)
- Test: `src/__tests__/exportDestino.test.tsx`

**Lógica:**

```ts
// En ExportView.tsx, antes de llamar al endpoint de exportación:
const proyectoActivo = proyectos.find(p =>
  p.versiones.some(v => v.filename === doc?.file_name && v.esActiva)
);

const destinoPDF = proyectoActivo
  ? `${proyectoActivo.carpeta}/Exportados/${nombreBase}_APA7_${fecha}.pdf`
  : null; // null = comportamiento actual (sin destino fijo)
```

Si `destinoPDF` no es null, se pasa al endpoint de generación para que el PDF se guarde
ahí directamente. Si es null, el flujo es exactamente el de hoy (descarga al navegador).

**Nota**: el endpoint `POST /api/generate-pdf` ya existe. Se le agrega un parámetro
opcional `destino_en_disco: Optional[str] = None`. Si está presente, después de generar
el PDF lo copia a esa ruta además de devolverlo por HTTP. El frontend recibe confirmación
de dónde quedó y muestra un toast: `"PDF guardado en Exportados/"`.

**Steps:**

- [ ] **Step 1: Test**

```ts
it('sin proyecto activo, destino es null y el flujo es el de siempre', () => {
  // store sin proyectos: destinoPDF debe ser null
});

it('con proyecto activo, destino incluye la carpeta Exportados', () => {
  // store con proyecto activo para el doc abierto
  // destinoPDF incluye 'Exportados' y termina en .pdf
  expect(destinoPDF).toMatch(/Exportados/);
  expect(destinoPDF).toMatch(/\.pdf$/);
});

it('el nombre del PDF incluye la fecha en formato YYYY-MM-DD', () => {
  expect(destinoPDF).toMatch(/\d{4}-\d{2}-\d{2}/);
});
```

- [ ] **Step 2: Implementar y verificar**

```bash
npx vitest run src/__tests__/exportDestino.test.tsx
pytest python/tests/ -q   # no puede bajar del baseline
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/wizard/ExportView.tsx python/main.py \
        src/__tests__/exportDestino.test.tsx
git commit -m "proyectos: exportar PDF a Exportados/ cuando hay proyecto activo

Si el doc abierto pertenece a un proyecto, el PDF se copia a
[carpeta]/Exportados/[nombre]_APA7_[fecha].pdf automaticamente.
Sin proyecto: comportamiento identico al actual, sin friccion."
```

---

### Task 6: Purga automática de la papelera

La papelera se purga automáticamente al iniciar el frontend, en background, sin bloquear.

**Files:**
- Modify: `src/store/slices/proyectoSlice.ts`
- Test: `src/__tests__/purgaPapelera.test.ts`

**Comportamiento:**

Al inicializar el store (`proyectoSlice`), si hay una raíz configurada, se hace un fetch
a `GET /api/proyectos/purgar-papelera`. Si la respuesta dice `eliminados > 0`, se
registra en un `activityEvent` (`pushActivityEvent('info', 'Papelera: N archivos
eliminados automáticamente')`). Si falla la red, no hace nada (no es crítico).

```ts
// En proyectoSlice, init:
inicializarPapelera: async () => {
  const raiz = get().raizConfigurada;
  if (!raiz) return;
  try {
    const resp = await fetch('/api/proyectos/purgar-papelera');
    const data = await resp.json();
    if (data.eliminados > 0) {
      get().pushActivityEvent('info', `Papelera: ${data.eliminados} archivo(s) eliminado(s) automáticamente`);
    }
  } catch { /* no crítico */ }
},
```

Esta función se llama una vez en el startup del store, no en un intervalo.

- [ ] **Step 1: Test**

```ts
it('no llama al endpoint si raizConfigurada es null', async () => {
  const fetchSpy = vi.spyOn(global, 'fetch');
  // inicializa store sin raiz
  expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('purgar'));
});

it('llama al endpoint si raizConfigurada existe', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ eliminados: 0 }) } as any);
  // inicializa store con raiz
  expect(global.fetch).toHaveBeenCalledWith('/api/proyectos/purgar-papelera');
});
```

- [ ] **Step 2: Implementar y verificar**

```bash
npx vitest run src/__tests__/purgaPapelera.test.ts
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/store/slices/proyectoSlice.ts src/__tests__/purgaPapelera.test.ts
git commit -m "proyectos: purga automatica de papelera al iniciar

Llama a purgar-papelera una vez en startup, solo si hay raiz
configurada. Silencioso si falla la red. Registra en activityEvent
si elimino archivos. Retencion: 30 dias (configurable en backend)."
```

---

## Self-Review

**1. El flujo es no destructivo.** `crear_proyecto` hace `shutil.copy2`, no `move`.
El archivo original no se toca. Si el usuario dice "Ahora no", literalmente nada cambia.

**2. Orden de ejecución.** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6.
Task 2 importa Task 1. Task 4 importa Task 2 (store). Task 5 necesita Task 4 (para saber
qué proyecto está activo). Task 6 es una adición final al slice de Task 2.

**3. Lo que no hace F7.** No detecta si el usuario pega un archivo nuevo en la carpeta
del proyecto mientras la app está abierta (File System Watcher). Eso es F8. Lo que sí
hace: la próxima vez que el usuario suba ese archivo a WordAPA7, la detección lo agrupa
con el proyecto existente (Task 2, `evaluarProyectoParaArchivo`).

**4. Review Focus respondido.** (1) Task 2 test "no pregunta dos veces por el mismo
archivo"; (2) Task 1 tests de `sonVersionesSimilares` con nombres distintos; (3) Task 3
test de configurar-raíz; (4) Task 3 test de 409 con destino existente; (5) Task 5 test
"sin proyecto, destino es null".

**5. La notificación respeta AGENTS.md §1.** `zIndex` de la notificación es de la escala
del proyecto (no 9999 inline). El rail vive siempre. El test de Task 2 lo verifica leyendo
el fuente con `?raw`.
