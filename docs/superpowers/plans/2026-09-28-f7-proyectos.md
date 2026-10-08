# F7 — Proyectos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que "proyecto" sea algo en vez de un prefijo del nombre del archivo.

**Architecture:** Hoy no hay entidad proyecto. `parseDocumentVersion` saca el nombre del
prefijo del nombre del archivo (`"Tesis_v2.docx"` → `{projectName: 'Tesis',
versionLabel: 'v2'}`), `projectImages` es un array de `URL.createObjectURL` en memoria
que muere con la pestaña, y el acceso es un kebab de dos niveles. Esta fase le da un
modelo, persistencia, una entrada en el rail, y arregla la subida en serie.

**Tech Stack:** React 18, TypeScript, Vitest, Zustand + `persist`, FastAPI, SQLite
(existente), `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §11.

## Global Constraints

- **⛔ `LICENSE` y `README.md` NO se tocan.** Un subagente cambió la licencia de MIT a
  CC BY-NC-SA 4.0 sin autorización; fue revertido. Es decisión legal del dueño.
- **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales.** R3 corre sobre doce directorios **sin deuda**; si metés un
  literal, cae el build. Los alias legacy (`--surface-elevated`, `--sidebar-bg`,
  `--text-main`, `--text-secondary`, `--text-muted`, `--accent-primary`, `--surface-bg`,
  `--surface-alt`, `--surface-hover`) **no existen**.
- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, OBLIGATORIO.
- **Leer fuentes en tests:** `?raw` para `.ts`/`.tsx` **funciona**. Para **`.css` devuelve
  0 caracteres** (`css: false`): usá el rodeo de variable de specifier de
  `src/__tests__/designTokens.test.ts:12-27`.
- `DEUDA_MEDIDA` **no existe**; un guardián falla si el nombre vuelve.
- **`Set-Content` de PowerShell DESTRUYE el archivo.** Usá la herramienta de edición.
- **NO uses `git worktree` para verificar nada.**
- `git add` explícito archivo por archivo. **NUNCA `git add -A`.**
- `Select-String -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'` después de cada escritura.
  Comentarios y commits **en español, sin CJK**. Contá los bytes de lo que escribas.
- **Mutar cada guardián que escribas.** En este repo aparecieron **cinco** guardas que
  "vigilaban" y no lo hacían. En F6, dos de las nuevas: un `toBeFalsy()` que dejaba pasar
  banderas cruzadas, y un glob de PowerShell que no bajaba a la raíz de `src/` y no
  contaba `App.tsx`.
- **`App.tsx` es el archivo que los guardiánes de montaje tienen que mirar.** Y el glob
  de Vite (`import.meta.glob`) sí incluye la raíz; el de PowerShell a veces no.

**Baseline**: `npx vitest run` → **1434 passed, 0 failed** (123 archivos).
`npx tsc --noEmit` → limpio. `pytest python/tests/ -q` → **820 passed, 14 skipped**.
`npm run build` → sin error.

## El orden que el usuario fijó, y por qué importa

> Migrar `projectImages` de blob URL a `asset_id` de `/api/assets` **ANTES** de tocar el
> modelo de `Proyecto`.

Si se cambia el modelo primero, la migración del campo viejo no tiene contra qué
verificarse: no hay forma de comprobar que lo que estaba guardado se convirtió bien. Es el
mismo error que el `findRack` de F0.

**Task 1 antes que Task 3, sin excepción.**

## Review Focus

1. **Cerrar y reabrir la app con un proyecto.** Si el nombre del proyecto y su carpeta no
   sobreviven, no hay entidad, hay una etiqueta. El test tiene que montar el store, meter
   un proyecto, **simular un reinicio** y afirmar que vuelve. → Task 3
2. **Cerrar y reabrir con imágenes.** Hoy `partialize` guarda un `URL.createObjectURL` que
   **muere con la pestaña**: sobrevive como string muerto. El test tiene que afirmar que
   después del reinicio **las imágenes están y se ven**, no que hay un array con un string
   que no resuelve. → Task 1
3. **Una carpeta de 20 capítulos.** Hoy `ProjectFolderModal.tsx:55-59` sube un `.docx`
   **por archivo, en serie**, cada uno con su auditoría completa y su `isLoading`: son
   20 pantallas de carga. El test tiene que afirmar que es **una** operación con
   progreso. → Task 4
4. **`removeProjectImage` no hace `revokeObjectURL`.** Es una **fuga de memoria**: cada
   imagen borrada deja su blob vivo hasta que muere la pestaña. Con muchos proyectos
   accumulates. El test tiene que afirmar que el blob se libera. → Task 1
5. **Sin documentos, el Explorador es inalcanzable.** `ProjectTabs.tsx:47` hace
   `if (tabs.length === 0) return null`. El test tiene que afirmar que con cero documentos
   **el rail igual ofrece el acceso**. → Task 5

---

### Task 1: Las imágenes dejan de morir con la pestaña

**Files:**
- Modify: `src/store/slices/uiSlice.ts:206-214` (`projectImages`, `addProjectImage`,
  `removeProjectImage`)
- Modify: `src/types/index.ts` (el tipo de la imagen de proyecto)
- Modify: `src/api/backend.ts` (**verificá si ya existe** un `uploadProjectImage`; si no,
  agregalo siguiendo el patrón de los otros assets)
- Test: `src/__tests__/imagenesDeProyecto.test.ts` (nuevo)

**Interfaces:**
- Consumes: el endpoint de assets existente. **Buscá primero**: `Select-String -Path 'src/api/backend.ts' -Pattern 'assets|upload'`.
- Produce:
  ```ts
  export type ImagenProyecto = { id: string; name: string; assetId: string; previewUrl: string };
  export function addProjectImage(file: File): Promise<string>;   // devuelve el id
  export function removeProjectImage(id: string): void;           // revoca el blob
  ```
  **El `File` desaparece del store.** Hoy se guarda el `File` y un blob URL; a partir de
  acá solo queda el `assetId` en disco y una URL de `/api/assets`.

- [ ] **Step 1: Escribí el test que falla**

```ts
describe('imagenes de proyecto', () => {
  it('la imagen sobrevive a un reinicio del store', async () => {
    // El defecto: projectImages guarda un URL.createObjectURL, y ese blob muere
    // con la pestaña. Lo que sobrevive en localStorage es un string que no
    // resuelve. Cerrar y reabrir la app deja la lista llena de imagenes rotas.
    await addProjectImage(archivo('logo.png'));
    const antes = rehidratar();               // simula el reinicio
    expect(antes[0].assetId).toBeTruthy();
    expect(antes[0].previewUrl).toContain('/api/assets/');
    expect(antes[0].previewUrl).not.toContain('blob:');
  });

  it('el File no queda guardado en el store', () => {
    // El File en el store es lo que hace que la imagen no se pueda volver a
    // subir y ocupa memoria del archivo entero por cada imagen.
    expect(JSON.stringify(estado().projectImages)).not.toContain('lastModified');
  });

  it('borrar una imagen libera el blob', () => {
    // removeProjectImage filtra y nada mas: la fuga de memoria de este repo.
    const revocado = espiarRevokeObjectURL();
    removeProjectImage(algunaId());
    expect(revocado).toHaveBeenCalled();
  });

  it('borrar una imagen que ya no existe no tira', () => {
    expect(() => removeProjectImage('no-existe')).not.toThrow();
  });
});

it('nada guarda un blob: en el store de proyecto no hay blob:', () => {
  // El guard de la fase: ningun objeto persistido puede llevar un blob:.
  expect(JSON.stringify(estado().projectImages)).not.toContain('blob:');
});
```

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/imagenesDeProyecto.test.ts`
Expected: FAIL. Hoy hay `blob:` y un `File` en el store.

`rehidratar()` y `espiarRevokeObjectURL()` los escribís. Para rehidratar sin montar todo
el store, serializá el estado con el mismo `partialize` que usa `useDocStore` y volvé a
parsearlo: **así el test mide la persistencia real, no una simulación**.

- [ ] **Step 3: La subida y el tipo**

`addProjectImage` pasa a ser `async`: sube a `/api/assets`, guarda el `assetId`, y arma
`previewUrl` con la URL del asset, **no** con un blob. Si el store ya expone algo para
resolver URLs de assets (`resolveAssetUrl` está en `src/api/backend.ts`), usalo: es el
mismo mecanismo que usa el resto de la app y evita inventar un segundo camino.

`removeProjectImage` **revoca el object URL antes de filtrar**, y no tira si el id no
existe.

**Losblob viejo que ya están en `localStorage` de quien use la app**: son
`previewUrl: 'blob:...'`. **No los mires**: cuando no hay `assetId`, la imagen está
perdida de todas formas y la UI tiene que decirlo, no fingir que existe. Si el blob
todavía está vivo en la misma sesión, se puede re-subir al vuelo; si no, se descarta
avisando.

- [ ] **Step 4: Verificación y commit**

Run: `npx vitest run` → no baja de 1434. `npx tsc --noEmit` → limpio.

```bash
git add src/store/slices/uiSlice.ts src/types/index.ts src/api/backend.ts src/__tests__/imagenesDeProyecto.test.ts
git commit -m "proyectos: las imagenes dejan de morir con la pestana

addProjectImage hacia un URL.createObjectURL y guardaba el File en el store. El blob
muere con la pestana, y el string que sobrevive en localStorage no resuelve: cerrar y
reabrir la app deja la lista llena de imagenes rotas que parecen cargadas.

Ahora se suben a /api/assets y queda el assetId, con la URL del asset y no un blob. El
File desaparece del store, que era lo que ocupaba la memoria del archivo entero por cada
imagen.

Y removeProjectImage revoca el object URL antes de filtrar. No lo hacia, y eso es una
fuga de memoria: cada imagen borrada dejaba su blob vivo hasta que moria la pestana.

Los blob viejos de las instalaciones existentes no se migran: cuando no hay assetId la
imagen esta perdida igual, y la UI lo dice en vez de fingir que esta."
```

---

### Task 2: El modelo `Proyecto`

**Files:**
- Create: `src/lib/proyecto.ts`
- Create: `python/persistence/proyectos.py` (o el módulo de persistencia que ya exista)
- Modify: `python/models.py` (**solo** si el modelo Pydantic necesita el tipo; buscá primero
  cómo están los otros modelos de sesión)
- Test: `src/__tests__/proyecto.test.ts`, `python/tests/test_proyectos.py` (nuevos)

**Interfaces:**
- Produce:
  ```ts
  export type Proyecto = {
    id: string; nombre: string; raiz: string | null;
    documentos: string[];      // session_ids
    figuras: ImagenProyecto[];
    creado: string;            // ISO
  };
  export function projectKeyDe(nombreArchivo: string, raiz: string | null): string;
  ```
  Y en Python: `GET /api/proyectos`, `POST /api/proyectos`, `POST /api/proyectos/{id}/sync`
  (**sync = releer el disco**). Buscá primero cómo se registran los routers:
  `python/main.py:234-236`.

- [ ] **Step 1: El test de Python**

```python
def test_un_proyecto_sobrevive_a_reiniciar_el_servidor(tmp_path):
    # Sin esto, 'proyecto' es un prefijo del nombre del archivo: renombrar el
    # archivo rompe el proyecto y el nombre del archivo es la unica clave.
    p = crear(nombre="Mi tesis", raiz=str(tmp_path))
    assert listar()[0].nombre == "Mi tesis"


def test_sync_relee_el_disco_y_no_duplica(tmp_path):
    (tmp_path / "cap1.docx").write_bytes(b"x")
    (tmp_path / "cap2.docx").write_bytes(b"x")
    sync(p)
    assert len(docs(p)) == 2
    sync(p)                      # idempotente
    assert len(docs(p)) == 2
```

- [ ] **Step 2: Corré y verificá que falla**

Run: `pytest python/tests/test_proyectos.py -v`
Expected: FAIL: no existe el modelo.

- [ ] **Step 3: El modelo y los endpoints**

**Reusá el mecanismo de persistencia que ya existe** para las sesiones. No inventes un
almacén nuevo: el proyecto tiene que vivir donde viven las sesiones, porque un proyecto
es un conjunto de sesiones.

**`sync` tiene que ser idempotente**: releer la carpeta dos veces no puede duplicar
documentos. Es el test del paso 1.

- [ ] **Step 4: `projectKeyDe`**

`parseDocumentVersion` (`src/lib/projectUtils.ts:18-61`) **se queda como está**: sirve
para sugerir un nombre a partir del archivo, que es lo que hace. Lo que cambia es que ese
nombre ya no **es** la identidad: la identidad es el `id` del proyecto.

`groupTabsByProject` (`projectUtils.ts:66-76`) **hoy no lo usa nadie** (solo el test).
Con el modelo real, se usa para agrupar pestañas por proyecto. Si el criterio de
agrupación pasa a ser el `id` y no el prefijo, **decílo y actualizá el test**, que hoy
consagra el criterio viejo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proyecto.ts python/persistence/proyectos.py python/models.py python/main.py src/lib/projectUtils.ts src/__tests__/proyecto.test.ts python/tests/test_proyectos.py
git commit -m "proyectos: una entidad con persistencia, no un prefijo del archivo

parseDocumentVersion saca el nombre del prefijo del nombre del archivo, y eso era la
identidad: renombrar el archivo rompia el proyecto. Ahora hay un Proyecto con id,
nombre, raiz, documentos y figuras, que sobrevive a reiniciar el servicio.

El proyecto vive donde viven las sesiones, porque un proyecto es un conjunto de
sesiones. Y sync relee el disco de forma idempotente: llamarlo dos veces no duplica
documentos.

parseDocumentVersion no se borra: sirve para sugerir un nombre a partir del archivo.
Lo que cambia es que ese nombre ya no es la identidad, y por eso groupTabsByProject
agrupa por id y no por prefijo."
```

---

### Task 3: El store persiste el proyecto

**Files:**
- Modify: `src/store/slices/documentSlice.ts` o el slice de sesiones (**buscá**), y
  `src/store/slices/uiSlice.ts` (donde hoy vive `projectImages`)
- Test: `src/__tests__/proyectoSobrevive.test.ts` (nuevo)

- [ ] **Step 1: El test que falla**

```ts
it('el proyecto y su carpeta sobreviven a un reinicio', () => {
  setProyecto({ id: 'p1', nombre: 'Mi tesis', raiz: 'C:\\tesis' });
  rehidratar();                                   // simula el reinicio
  expect(estado().proyecto?.nombre).toBe('Mi tesis');
  expect(estado().proyecto?.raiz).toBe('C:\\tesis');
});

it('sin proyecto seleccionado, el chrome de proyecto no se monta', () => {
  // Hoy, sin pestaña activa, el título dice literalmente 'Proyecto APA 7': un
  // nombre inventado en pantalla.
  montar();
  expect(document.body.textContent).not.toContain('Proyecto APA 7');
});
```

- [ ] **Step 2: Implementar, con el orden de §"El orden que el usuario fijó"**

Como Task 1 ya migró las imágenes, acá se puede tocar el modelo del store sin perder la
verificación de la migración.

**`'Proyecto APA 7'` desaparece.** Si no hay proyecto, el chrome **no se monta**: no
hay un nombre de relleno en pantalla.

- [ ] **Step 3: `activeFilePath`**

`activeFilePath` (`store/types.ts:423`) es `null` por defecto y **nunca se establece**, así
que el botón "Abrir carpeta" (`ProjectFolderModal.tsx:148-173`) **no aparece nunca**.

**Establecelo en el camino de carga del documento** y agregá el test: `activeFilePath`
no es `null` después de cargar, y el botón existe. Es un botón que lleva tiempo muerto y
nadie lo notó porque nadie lo vio.

- [ ] **Step 4: Commit**

```bash
git add src/store/ src/components/project/ src/__tests__/proyectoSobrevive.test.ts
git commit -m "proyectos: el proyecto sobrevive al reinicio, y deja de inventar su nombre

El nombre del proyecto vivia en la pestaña activa, y sin pestaña el título decía
literalmente 'Proyecto APA 7'. Un nombre inventado en pantalla es peor que no tener
chrome: ahora, sin proyecto, el chrome no se monta.

Y activeFilePath queda establecido en el camino de carga. Es null por defecto y nunca se
establecia en ningun lado, asi que el boton 'Abrir carpeta' no aparecia nunca. Nadie lo
noto porque nadie lo vio, que es el modo de fallo que mas caro sale."
```

---

### Task 4: Una carpeta es una operación

**Files:**
- Modify: `src/components/project/ProjectFolderModal.tsx:40-66` (el `<input
  webkitdirectory>`), `:348` (`slice(0, 8)`), `:364` (`objectFit: 'cover'`), `:93`
  (backdrop inline), `:106` (`var(--surface-bg, #ffffff)`), `:268` (`'#fff'`)
- Modify: `src/components/project/ProjectImagesDrawer.tsx`
- Test: `src/__tests__/carpetaDeProyecto.test.tsx` (nuevo)

**Interfaces:**
- Consumes: el backend de Task 2 (sync) y el de Task 1 (subida de imágenes).

- [ ] **Step 1: El test que falla**

```tsx
it('una carpeta de 20 capitulos es una operacion, no 20', async () => {
  // El defecto: ProjectFolderModal sube un .docx por archivo, en serie, cada uno
  // con su auditoria completa y su isLoading. Veinte capitulos son veinte
  // pantallas de carga seguidas.
  await abrirCarpetaCon(20);
  expect(vecesQueSeSubioUnDocumento()).toBe(1);
});

it('el progreso dice cual va y cuantas faltan', async () => {
  await abrirCarpetaCon(20);
  expect(textoDeProgreso()).toMatch(/20/);
});

it('todas las imagenes se ven, no las primeras ocho', () => {
  // :348 hace slice(0, 8) sin ningun 'ver mas'. Las imagenes de la novena en
  // adelante existen en el store, no se ven, y nadie lo dice.
  cargarProyectoCon(12);
  expect(galeria().children.length).toBe(12);
});

it('el logo de la galeria no se recorta', () => {
  // :364 usa objectFit: cover, que de un logo vertical deja una banda.
  const img = galeria().querySelector('img')!;
  expect(getComputedStyle(img).objectFit).toBe('contain');
});
```

- [ ] **Step 2: Corré, implementá, verificá**

Una carpeta es **una** llamada a sync con la raíz, y el backend devuelve qué encontró. El
overlay de carga (F1) ya tiene la prop `que`, así que el progreso sale por ahí: "Subiendo
capítulo 3 de 20". **Usá esa prop en vez de escribir un progreso nuevo.**

Las doce imágenes se ven: si no entran, un carrusel o un grupo con "ver las 12". Y
`objectFit: 'cover'` a `contain` con fondo.

Los literales de `:93`, `:106` y `:268` van a token (`--scrim-overlay` existe, y `--color-bg-surface`).
**`var(--surface-bg, #ffffff)` es especialmente peligroso**: el fallback tapa el token
roto, que se ve bien en claro y mal en oscuro.

- [ ] **Step 3: Commit**

```bash
git add src/components/project/ src/__tests__/carpetaDeProyecto.test.tsx
git commit -m "proyectos: una carpeta es una operacion con progreso

El modal subia un .docx por archivo, en serie, cada uno con su auditoria completa y su
isLoading. Una carpeta de veinte capitulos eran veinte pantallas de carga seguidas, y el
overlay de carga de F1 no decia que estaba pasando.

Ahora es una llamada a sync con la raiz, y el progreso va por la prop que del overlay.
Usar la que ya existe en vez de escribir un segundo progreso.

Y la galeria: slice(0, 8) sin ver mas dejaba las imagenes de la novena en adelante
existentes en el store e invisibles, y objectFit cover recortaba un logo vertical a una
banda."
```

---

### Task 5: El acceso, y el guardián

**Files:**
- Modify: `src/components/shell/railItems.ts:48-53` (las 6 fases del editor) y `:71-76`
  (las 4 de Inicio)
- Modify: `src/components/project/ProjectTabs.tsx:47` (el `return null`), `:190-208`
  (el kebab)
- Modify: `src/lib/railPending.ts` (**el conteo derivado, no uno local**)
- Test: `src/__tests__/proyectoEstaAccesible.test.tsx` (nuevo)

**Interfaces:**
- Produce: una entrada `proyecto` en el rail, con su conteo de pendientes derivado de
  `lib/railPending.ts` sobre la lista compartida, **nunca de un conteo local**
  (`AGENTS.md`: el conteo se deriva una sola vez).

- [ ] **Step 1: El test que falla**

```tsx
it('con cero documentos, el Explorador igual se alcanza', () => {
  // ProjectTabs.tsx:47 hace if (tabs.length === 0) return null, y con cero
  // documentos no hay barra y el Explorador es inalcanzable. Un modulo que
  // AGENTS.md lista como principal, que no se puede abrir.
  tabs = [];
  montar();
  expect(rail().textContent).toMatch(/proyecto/i);
});

it('el conteo de proyectos sale de la lista compartida', () => {
  // Un conteo local en el rail es un conteo que no puede contradecir a la
  // pantalla a la que lleva.
  expect(conteoDelRail()).toBe(conteoDeRailPending());
});

it('un clic en proyecto vuelve a viewMode edit', () => {
  // Un destino del rail es una fase del editor.
});
```

- [ ] **Step 2: Implementar, mutar, verificar**

- [ ] **Step 3: Verificación final de la fase**

Run: `npx vitest run` && `npx tsc --noEmit` && `pytest python/tests/ -q` && `npm run build`
Expected: frontend ≥1434, Python ≥820.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/railItems.ts src/components/project/ProjectTabs.tsx src/lib/railPending.ts src/__tests__/proyectoEstaAccesible.test.tsx
git commit -m "proyectos: el Explorador entra al rail, y existe aunque no haya documentos

ProjectTabs hacia return null con cero documentos, asi que no habia barra y el
Explorador era inalcanzable. AGENTS.md lo lista como modulo principal: un modulo que
no se puede abrir no es un modulo.

Con un documento, la barra entera era un kebab sin etiqueta con dos niveles de clic
dentro. El rail tiene tres destinos de configuracion en un solo lugar desde la fase de
Ajustes, y el proyecto entra por ahi.

El conteo sale de railPending, que es la misma lista que usa el resto del rail. Un
conteo local es un conteo que no puede contradecir a la pantalla a la que lleva."
```

---

## Self-Review

**1. Cobertura del spec §11.** Las siete salidas: entidad + persistencia (Task 2 y 3),
imágenes a disco (Task 1), entrada en el rail (Task 5), `ProjectTabs` deja de esconder
(Task 5), subida en serie (Task 4), `activeFilePath` (Task 3), el nombre inventado
(Task 3), `slice(0,8)` y `objectFit: cover` (Task 4).

**2. El orden que el usuario fijó está respetado:** Task 1 (imágenes a `asset_id`) antes
de Task 3 (tocar el modelo del store). Está escrito arriba con el motivo.

**3. Lo que este plan puede no cerrar.** Si la persistencia de proyectos necesita una
**migración de la base de sesiones existente** (agregar tablas, no solo leer), eso es un
trabajo de esquema que puede que exceeda la fase. **Si lo encontrás, decilo y hacé lo
que se pueda sin migración destructiva**: un proyecto nuevo que no convive con el viejo es
mejor que una migración que tira datos.

**4. Review Focus.** Los cinco tienen test: (1) Task 3, reinicio; (2) Task 1, imagen tras
reinicio; (3) Task 4, 20 capítulos; (4) Task 1, `revokeObjectURL`; (5) Task 5, cero
documentos.

**5. El riesgo de esta fase es el alcance.** Entidad nueva + endpoints + migración +
rail + subida en serie es mucho en una fase. **Si te queda largo, priorizá en este orden:
Task 1 (fuga de memoria y datos rotos), Task 3 (el nombre inventado y el botón muerto),
Task 5 (el acceso), Task 2 y Task 4.** La Task 1 sola ya arregla dos bugs reales y es
media hora de trabajo. **Decí qué te quedó sin hacer, con el motivo.**
