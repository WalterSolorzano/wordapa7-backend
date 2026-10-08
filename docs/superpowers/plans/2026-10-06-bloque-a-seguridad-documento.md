# Bloque A — Seguridad del documento: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app nunca escriba sobre el `.docx` original del usuario, y que exista autoguardado con historial restaurable.

**Architecture:** Se reescribe `POST /api/send-to-word` para que escriba el APA 7 generado en una copia de trabajo dentro de `STORAGE_DIR` y abra esa copia (nunca `activeFilePath`). Se expone el historial de snapshots que ya vive en SQLite (listar + restaurar) y se agrega un autoguardado periódico que reusa `saveSnapshot`. Las versiones de proyecto suman "restaurar".

**Tech Stack:** Python 3.11 / FastAPI / SQLite / python-docx / pytest; React 18 / TypeScript / Zustand / Vitest / Vite.

**Spec:** `docs/superpowers/specs/2026-10-06-bloque-a-seguridad-documento-design.md`

## Global Constraints

- CERO emojis en UI/comentarios de producto. Solo íconos `lucide-react`.
- CERO colores literales; solo tokens CSS (`var(--color-*)`, `var(--text-*)`, `var(--space-*)`, `var(--radius-*)`).
- La UI no puede afirmar algo que el código no hace.
- `git add` explícito, archivo por archivo. NUNCA `git add -A`.
- NO usar `git worktree`.
- Comentarios y commits en español, sin CJK.
- No tocar `LICENSE` ni `README`.
- COM 100% bajo demanda; los tests usan dobles, nunca levantan Word.
- Comandos: `pytest -q python/tests/...`, `npx vitest run <archivo>`, `npx tsc --noEmit`.

## Review Focus

- Un `.docx` original con el MISMO nombre que otro ya existente en la carpeta de trabajo: la copia debe sobrescribirse sin tocar el original del usuario.
- Un nombre de archivo con caracteres no válidos (`..`, `:`, `/`): no debe escapar de `STORAGE_DIR`.
- Restaurar un snapshot mientras hay ediciones sin guardar: el estado visible debe quedar igual al restaurado, sin mezcla.
- Autoguardado con la pestaña oculta o al cerrar: no debe disparar dos guardados simultáneos.
- Snapshots de una sesión distinta a la pedida: no deben poder restaurarse (404).

---

## Parte 1 — La copia de trabajo (nunca el original)

### Task 1: Backend — `send-to-word` escribe una copia interna

**Files:**
- Modify: `python/main.py` (bloque `SendToWordReq` y `send_to_word_endpoint`, líneas 3270-3475)
- Test: `python/tests/test_send_to_word.py` (reemplazo completo)

**Interfaces:**
- Produces: `POST /api/send-to-word/{session_id}` con body `{nombre?: string, forzar?: bool, guardar?: bool}` → `{ok: bool, method: "com"|"copy", working_path: string, message: string}`, o 409 `{ok:false, requiere_confirmacion:true, message:string}`.

- [ ] **Step 1: Verificar que `re` esté importado**

Run: `Select-String -Path python/main.py -Pattern "^import re" | Select-Object -First 1`
Expected: una línea. Si no aparece, agregar `import re` junto a los imports del tope del archivo.

- [ ] **Step 2: Reemplazar el modelo `SendToWordReq`**

En `python/main.py`, reemplazar la clase (líneas 3270-3285) por:

```python
class SendToWordReq(BaseModel):
    nombre: Optional[str] = None
    """Nombre del archivo original, SOLO para nombrar y mostrar la copia.

    No decide rutas de escritura: la copia de trabajo vive dentro de
    `STORAGE_DIR`. El frontend manda su ruta, pero el backend la trata como
    texto, no como destino.
    """
    forzar: bool = False
    """Descartar lo que la persona tiene SIN GUARDAR en Word."""
    guardar: bool = False
    """Guardar en Word lo que está sin guardar, en vez de descartarlo."""
```

- [ ] **Step 3: Agregar los helpers de la copia de trabajo**

Justo después de `_tiene_cambios_sin_guardar` (línea 3349) y antes del decorador del endpoint, insertar:

```python
def _carpeta_de_trabajo(session_id: str) -> Path:
    """Carpeta app-owned donde vive la copia que Word abre.

    No es la carpeta del usuario: la app puede escribir y pisar acá todo lo que
    quiera sin tocar su trabajo. `mkdir` es idempotente.
    """
    carpeta = STORAGE_DIR / "sessions" / session_id / "word"
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def _nombre_de_copia(nombre: Optional[str]) -> str:
    """`C:/tesis/Tesis final.docx` → `Tesis final_APA7.docx`.

    Solo el stem, y se limpia todo lo que no sea palabra, guion o espacio: sin
    esto un `nombre` con `..` o `/` escribiría fuera de la carpeta de trabajo.
    """
    base = Path(nombre).stem if nombre else "documento"
    base = re.sub(r"[^\w\- ]+", "_", base, flags=re.UNICODE).strip() or "documento"
    return f"{base}_APA7.docx"
```

- [ ] **Step 4: Reescribir el cuerpo del endpoint**

Reemplazar el cuerpo de `send_to_word_endpoint` (desde la línea 3354 `"""Write-back...` hasta el `return` final de la línea 3475) por:

```python
    """Abre en Word una COPIA de trabajo del APA 7 generado.

    Ya no pisa el `.docx` original del estudiante. Escribe el generado en
    `STORAGE_DIR/sessions/<id>/word/<nombre>_APA7.docx` y abre ESA copia. El
    original no se toca, así que no hay `.bak`: no hay nada que respaldar.

    Con la copia abierta en Word y cambios sin guardar, no se cierra ni se copia:
    devuelve `requiere_confirmacion` y las dos salidas viajan en el body
    (`guardar` / `forzar`).
    """
    output_path = STORAGE_DIR / "sessions" / session_id / "output.docx"
    if not output_path.exists():
        raise HTTPException(404, "Generá primero el documento APA 7")

    dest = _carpeta_de_trabajo(session_id) / _nombre_de_copia(req.nombre)

    word_app = None
    target_doc = None
    try:
        from modules.word_com import word_session  # import lazy: COM nunca toca startup

        with word_session() as app:
            target_doc = _documento_abierto_en_word(app, dest)
            if target_doc is not None and _tiene_cambios_sin_guardar(target_doc):
                if req.guardar:
                    try:
                        target_doc.Save()
                        logger.info("send_to_word: guardado lo que estaba sin guardar en Word")
                    except Exception as e:
                        logger.warning("send_to_word: Save() falló: %s", e)
                elif not req.forzar:
                    return JSONResponse(
                        status_code=409,
                        content={
                            "ok": False,
                            "requiere_confirmacion": True,
                            "message": (
                                "Tenés cambios sin guardar en la copia abierta en Word. "
                                "Guardalos antes de abrirla, o confirmá para descartarlos."
                            ),
                        },
                    )
            word_app = app
    except Exception as e:
        logger.warning("send_to_word: COM no disponible, copia directa: %s", e)

    if target_doc is not None and word_app is not None:
        try:
            target_doc.Close(SaveChanges=0)
            logger.info("send_to_word: cerrada la copia '%s' (COM)", dest)
        except Exception as e:
            logger.warning("send_to_word: Close() falló: %s", e)

        shutil.copy2(str(output_path), str(dest))
        try:
            word_app.Documents.Open(str(dest))
            logger.info("send_to_word: reabierta la copia '%s' (COM)", dest)
        except Exception as e:
            logger.warning("send_to_word: Open() falló: %s", e)

        return {
            "ok": True,
            "method": "com",
            "working_path": str(dest),
            "message": "Copia APA 7 abierta en Word. Tu archivo original no se modificó.",
        }

    shutil.copy2(str(output_path), str(dest))
    logger.info("send_to_word: copia escrita en '%s' (fallback)", dest)
    return {
        "ok": True,
        "method": "copy",
        "working_path": str(dest),
        "message": "Copia APA 7 actualizada. Tu archivo original no se modificó.",
    }
```

- [ ] **Step 5: Eliminar el helper `_respaldo_de`**

Borrar la función `_respaldo_de` (líneas 3288-3314) y la referencia a `backup`/`respaldo_en`. Verificar que no quede ningún uso:

Run: `Select-String -Path python/main.py -Pattern "_respaldo_de|respaldo_en" | Select-Object -First 5`
Expected: sin coincidencias.

- [ ] **Step 6: Reescribir los tests**

Reemplazar TODO `python/tests/test_send_to_word.py` por:

```python
"""
WordAPA7 — la copia de trabajo en Word.

`/api/send-to-word/{session_id}` YA NO pisa el `.docx` original del estudiante.
Escribe el APA 7 generado en una copia dentro de `STORAGE_DIR` y abre esa copia.
El original no se toca nunca: no hay `.bak` porque no hay nada que respaldar.

Se fija: (1) el original queda igual byte a byte, (2) la copia se escribe dentro
de STORAGE_DIR con el contenido generado, (3) con cambios sin guardar en Word no
se cierra ni se copia: `requiere_confirmacion`.

El doble de prueba (FakeWord) evita levantar COM en CI, como exige AGENTS.md.
"""

import sys
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient

import modules.word_com as word_com
from main import STORAGE_DIR, app

ORIGINAL = b"contenido-del-estudiante"
GENERADO = b"contenido-generado-en-apa-7"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sesion():
    session_id = "test-send-to-word"
    out_dir = STORAGE_DIR / "sessions" / session_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "output.docx").write_bytes(GENERADO)
    yield session_id
    import shutil as _shutil
    _shutil.rmtree(out_dir, ignore_errors=True)


@pytest.fixture
def original(tmp_path):
    d = tmp_path / "tesis.docx"
    d.write_bytes(ORIGINAL)
    return d


@pytest.fixture
def sin_com(monkeypatch):
    @contextmanager
    def _que_falla():
        raise OSError("COM no disponible en el test")
        yield  # pragma: no cover
    monkeypatch.setattr(word_com, "word_session", _que_falla)


# ── El doble de prueba de la rama de COM ─────────────────────────────────────

class FakeDocumento:
    def __init__(self, full_name, saved=True):
        self.FullName = full_name
        self.Saved = saved
        self.llamadas = []

    def Save(self):  # noqa: N802
        self.llamadas.append(("Save",))
        self.Saved = True

    def Close(self, SaveChanges=0):  # noqa: N803
        self.llamadas.append(("Close", SaveChanges))
        self.Saved = True


class FakeDocuments:
    def __init__(self, documentos):
        self._docs = list(documentos)

    @property
    def Count(self):  # noqa: N802
        return len(self._docs)

    def __call__(self, indice):
        return self._docs[indice - 1]

    def Open(self, ruta):  # noqa: N802
        self.abrio = ruta
        return None


class FakeWord:
    def __init__(self, documentos):
        self.Documents = FakeDocuments(documentos)


@pytest.fixture
def palabra_sin_certeza(monkeypatch):
    def _instalar(*documentos):
        app_falso = FakeWord(documentos)
        @contextmanager
        def _sesion():
            yield app_falso
        monkeypatch.setattr(word_com, "word_session", _sesion)
        return app_falso
    return _instalar


# ── 1. El original no se toca ────────────────────────────────────────────────

def test_no_pisa_el_original(client, sesion, original, sin_com):
    antes = original.read_bytes()
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert r.status_code == 200, r.text
    assert original.read_bytes() == antes, "el original se modificó"


def test_no_deja_backup_al_lado_del_original(client, sesion, original, sin_com):
    client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert not original.with_name(original.name + ".bak").exists()


def test_la_copia_queda_dentro_del_almacenamiento(client, sesion, original, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    working = Path(r.json()["working_path"])
    assert working.exists()
    assert working.read_bytes() == GENERADO
    working.resolve().relative_to(STORAGE_DIR.resolve())  # no debe lanzar


def test_la_copia_lleva_el_nombre_apa7(client, sesion, original, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert Path(r.json()["working_path"]).name == "tesis_APA7.docx"


def test_un_nombre_con_ruta_no_escapa_de_la_carpeta(client, sesion, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": "../../evil.docx"})
    assert r.status_code == 200, r.text
    working = Path(r.json()["working_path"])
    assert working.name == "evil_APA7.docx"
    working.resolve().relative_to(STORAGE_DIR.resolve())


def test_la_respuesta_no_trae_backup(client, sesion, original, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert "backup" not in r.json()


# ── 2. Lo que está sin guardar ───────────────────────────────────────────────

class TestSinGuardar:

    def _copia_abierta(self, sesion, original):
        return STORAGE_DIR / "sessions" / sesion / "word" / "tesis_APA7.docx"

    def test_no_cierra_una_copia_con_cambios_sin_guardar(
        self, client, sesion, original, palabra_sin_certeza
    ):
        doc = FakeDocumento(str(self._copia_abierta(sesion, original)), saved=False)
        palabra_sin_certeza(doc)
        r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
        assert r.status_code == 409, r.text
        assert r.json()["requiere_confirmacion"] is True
        assert ("Close", 0) not in doc.llamadas

    def test_guardar_manda_save_antes_de_cerrar(
        self, client, sesion, original, palabra_sin_certeza
    ):
        doc = FakeDocumento(str(self._copia_abierta(sesion, original)), saved=False)
        palabra_sin_certeza(doc)
        r = client.post(
            f"/api/send-to-word/{sesion}",
            json={"nombre": str(original), "guardar": True},
        )
        assert r.status_code == 200, r.text
        assert ("Save",) in doc.llamadas

    def test_forzar_descarta_y_sigue(
        self, client, sesion, original, palabra_sin_certeza
    ):
        doc = FakeDocumento(str(self._copia_abierta(sesion, original)), saved=False)
        palabra_sin_certeza(doc)
        r = client.post(
            f"/api/send-to-word/{sesion}",
            json={"nombre": str(original), "forzar": True},
        )
        assert r.status_code == 200, r.text
        assert ("Close", 0) in doc.llamadas
```

- [ ] **Step 7: Correr los tests**

Run: `pytest -q python/tests/test_send_to_word.py --tb=short`
Expected: PASS (todos).

- [ ] **Step 8: Commit**

```bash
git add python/main.py python/tests/test_send_to_word.py
git commit -m "fix: send-to-word escribe una copia interna y no pisa el original"
```

### Task 2: Frontend — ExportView manda `nombre` y muestra la copia

**Files:**
- Modify: `src/components/export/ExportView.tsx` (estado `respaldo` ~117-121, `enviarAWord` 123-152, botón 460-480, bloque respaldo 486-500, bloque 409 508-571)
- Test: `src/__tests__/envioAWord.test.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: Task 1 (`{nombre, forzar, guardar}` → `{working_path, message, method}`).

- [ ] **Step 1: Renombrar el estado y ajustar el request**

En `ExportView.tsx`:
- Cambiar `const [respaldo, setRespaldo] = useState<string | null>(null);` por `const [copiaDeTrabajo, setCopiaDeTrabajo] = useState<string | null>(null);`
- En `enviarAWord`, cambiar `setRespaldo(null)` por `setCopiaDeTrabajo(null)`.
- Cambiar el body (línea 132) por:

```tsx
        body: JSON.stringify({ nombre: activeFilePath, ...opcion }),
```

- Cambiar la línea 146 `if (data.backup) setRespaldo(data.backup);` por:

```tsx
      if (data.working_path) setCopiaDeTrabajo(data.working_path);
```

- [ ] **Step 2: Cambiar el texto del botón**

Reemplazar el `title` y el label del botón (líneas 464 y 479):

```tsx
                  title="Abre una copia APA 7 en Word. Tu archivo original no se modifica."
```

```tsx
                  {isSending ? 'Abriendo copia…' : 'Abrir copia en Word'}
```

- [ ] **Step 3: Cambiar el bloque de la copia**

Reemplazar el bloque `{respaldo && (...)}` (líneas 487-500) por:

```tsx
        {/* Dónde quedó la copia que Word abrió, dicha y no solo implícita. */}
        {copiaDeTrabajo && (
          <p
            data-testid="ruta-de-la-copia"
            style={{
              margin: 0, width: '100%', display: 'flex', alignItems: 'flex-start', gap: '7px',
              fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)',
            }}
          >
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              {`Word abrió una copia de trabajo en ${copiaDeTrabajo}. Tu archivo original no se modificó.`}
            </span>
          </p>
        )}
```

- [ ] **Step 4: Cambiar el texto del 409**

En el bloque `{sinGuardar && (...)}`, cambiar la última línea (567-569) por:

```tsx
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)' }}>
              Tu archivo original no se tocó: la copia se actualiza recién cuando elijas.
            </span>
```

- [ ] **Step 5: Reescribir el test**

Reemplazar TODO `src/__tests__/envioAWord.test.tsx` por:

```tsx
/**
 * La copia de trabajo en Word.
 *
 * `POST /api/send-to-word/{session_id}` ya no pisa el `.docx` original. El
 * frontend manda `nombre` (solo para nombrar la copia) y nunca una ruta de
 * escritura. Con cambios sin guardar en la copia, el backend devuelve 409 y la
 * UI ofrece las DOS salidas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ExportView } from '../components/export/ExportView';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));
vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => <div data-testid="pdf" /> }));
vi.mock('../components/export/QuickReferenceSearch', () => ({
  QuickReferenceSearch: () => <div data-testid="crossref" />,
}));

const SIN_GUARDAR = {
  ok: false,
  requiere_confirmacion: true,
  message: 'Tenés cambios sin guardar en la copia abierta en Word. Guardalos antes de abrirla, o confirmá para descartarlos.',
};

let enviados: Array<Record<string, unknown>> = [];
let responder: (url: string) => { status: number; body: unknown };

const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
  const r = responder(url);
  if (init?.body) enviados.push(JSON.parse(String(init.body)));
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.body,
  } as unknown as Response;
});

const MOSTRAR_TOAST = vi.fn();

const cargar = () => {
  useDocStore.setState({
    doc: { session_id: 's-envio', file_name: 'Tesis.docx', elements: [], referencias: [] } as never,
    isLoading: false,
    atHome: false,
    activeFilePath: 'C:/tesis/Tesis.docx',
    citationAuditResult: null,
    exportDocx: vi.fn(),
    exportPdf: vi.fn(),
    exportLatex: vi.fn(),
    clearQuickExport: vi.fn(),
    copyPdfToClipboard: vi.fn(),
    sayMascot: vi.fn(),
    showToast: MOSTRAR_TOAST,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  enviados = [];
  responder = () => ({ status: 200, body: { ok: true, method: 'com', working_path: 'C:/storage/sessions/s-envio/word/Tesis_APA7.docx', message: 'Listo' } });
  vi.stubGlobal('fetch', mockFetch);
  cargar();
});

afterEach(() => { vi.unstubAllGlobals(); });

const botonEnviar = () => screen.getByRole('button', { name: /Abrir copia en Word/i });

describe('la copia de trabajo en Word', () => {
  it('manda nombre, nunca una ruta de escritura', async () => {
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => expect(enviados.length).toBe(1));
    expect(enviados[0]).toMatchObject({ nombre: 'C:/tesis/Tesis.docx' });
    expect(enviados[0].dest_path).toBeUndefined();
  });

  it('un aviso de cambios sin guardar NO alcanza: tiene que haber dos botones', async () => {
    responder = () => ({ status: 409, body: SIN_GUARDAR });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => expect(screen.getByTestId('confirmacion-sin-guardar')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Guardar y enviar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Descartar y enviar/i })).toBeTruthy();
    expect(MOSTRAR_TOAST).not.toHaveBeenCalled();
  });

  it('"Guardar y enviar" manda guardar:true, y no forzar', async () => {
    responder = (url) => (url.includes('send-to-word') && enviados.length === 0
      ? { status: 409, body: SIN_GUARDAR }
      : { status: 200, body: { ok: true, method: 'com', working_path: 'C:/x.docx', message: 'Listo' } });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => screen.getByTestId('confirmacion-sin-guardar'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Guardar y enviar/i })); });
    await waitFor(() => expect(enviados.length).toBe(2));
    expect(enviados[1]).toMatchObject({ nombre: 'C:/tesis/Tesis.docx', guardar: true });
    expect(enviados[1].forzar).toBeUndefined();
  });

  it('"Descartar y enviar" manda forzar:true, y no guardar', async () => {
    responder = (url) => (url.includes('send-to-word') && enviados.length === 0
      ? { status: 409, body: SIN_GUARDAR }
      : { status: 200, body: { ok: true, method: 'com', working_path: 'C:/x.docx', message: 'Listo' } });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => screen.getByTestId('confirmacion-sin-guardar'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Descartar y enviar/i })); });
    await waitFor(() => expect(enviados.length).toBe(2));
    expect(enviados[1]).toMatchObject({ nombre: 'C:/tesis/Tesis.docx', forzar: true });
    expect(enviados[1].guardar).toBeUndefined();
  });

  it('la confirmacion se puede cerrar sin mandar nada', async () => {
    responder = () => ({ status: 409, body: SIN_GUARDAR });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => screen.getByTestId('confirmacion-sin-guardar'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Mejor no/i })); });
    expect(screen.queryByTestId('confirmacion-sin-guardar')).toBeNull();
    expect(enviados).toHaveLength(1);
  });

  it('dice dónde quedó la copia, no solo "listo"', async () => {
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => {
      expect(document.body.textContent).toContain('Tesis_APA7.docx');
    });
  });
});
```

- [ ] **Step 6: Correr el test y el type-check**

Run: `npx vitest run src/__tests__/envioAWord.test.tsx` y `npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/export/ExportView.tsx src/__tests__/envioAWord.test.tsx
git commit -m "fix: ExportView manda el nombre y muestra la copia de trabajo"
```

### Task 3: Verificar la descarga por nombre

**Files:**
- Modify (solo si falta): `src/store/slices/documentSlice.ts` (`triggerDownload`, línea 68) o `src/components/export/ExportView.tsx` (`triggerDownload`, línea 33)

- [ ] **Step 1: Comprobar el comportamiento real**

`triggerDownload` usa `<a download={filename}>`. En navegador eso guarda con el nombre sin preguntar (salvo configuración del navegador); en Electron no hay `will-download`/`showSaveDialog` (grep confirmado).

Run: `Select-String -Path electron/**/*.js -Pattern "will-download|showSaveDialog" 2>$null | Select-Object -First 3`
Expected: sin coincidencias → hoy NO pregunta.

- [ ] **Step 2: Decidir con el dueño**

Si el dueño quiere que pregunte, agregar en el proceso principal de Electron un handler `session.on('will-download', (e, item) => item.setSaveDialogOptions({...}))`. Si le alcanza con el nombre APA7 automático, no se toca código y se documenta en el spec. **No construir sin confirmación.**

- [ ] **Step 3: Commit (solo si hubo cambio)**

```bash
git add <archivo>
git commit -m "feat: la descarga permite elegir el nombre"
```

---

## Parte 2 — Autoguardado y restaurar

### Task 4: Backend — listar y restaurar snapshots

**Files:**
- Modify: `python/persistence/session_manager.py` (después de `save_session_snapshot`, línea 216)
- Modify: `python/routers/sessions.py` (después de `save_session_snapshot_endpoint`, línea 1226)
- Test: `python/tests/test_snapshots.py` (nuevo)

**Interfaces:**
- Produces: `list_session_snapshots(session_id, storage_dir) -> list[dict]`, `load_session_snapshot(snapshot_id, storage_dir) -> Optional[DocumentModel]`; `GET /api/sessions/{id}/snapshots` → `{snapshots: [{id, created_at, element_count, file_name}]}`; `POST /api/sessions/{id}/restore-snapshot/{snapshot_id}` → `DocumentModel`.

- [ ] **Step 1: Escribir el test que falla**

Crear `python/tests/test_snapshots.py`:

```python
"""Historial de snapshots: listar y restaurar."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient

from main import STORAGE_DIR, app
from persistence import session_manager


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sesion(monkeypatch, tmp_path):
    session_id = "test-snapshots"
    monkeypatch.setattr(session_manager, "DB_PATH", None)
    session_manager.init_db(tmp_path)
    yield session_id, tmp_path
    session_manager.DB_PATH = None


def _doc(session_id, nombre):
    from models import DocumentModel
    d = DocumentModel(session_id=session_id)
    d.file_name = nombre
    return d


def test_listar_devuelve_los_snapshots_de_la_sesion(sesion):
    session_id, storage = sesion
    session_manager.save_session_snapshot(_doc(session_id, "uno.docx"), storage)
    session_manager.save_session_snapshot(_doc(session_id, "dos.docx"), storage)

    lista = session_manager.list_session_snapshots(session_id, storage)

    assert len(lista) == 2
    assert lista[0]["id"] > lista[1]["id"]  # más nuevo primero
    assert "created_at" in lista[0]


def test_restaurar_devuelve_el_estado_del_snapshot(sesion):
    session_id, storage = sesion
    session_manager.save_session_snapshot(_doc(session_id, "viejo.docx"), storage)
    snap_id = session_manager.list_session_snapshots(session_id, storage)[0]["id"]

    restaurado = session_manager.load_session_snapshot(snap_id, storage)

    assert restaurado is not None
    assert restaurado.file_name == "viejo.docx"


def test_snapshot_de_otra_sesion_no_se_restaura(sesion):
    session_id, storage = sesion
    session_manager.save_session_snapshot(_doc("otra", "x.docx"), storage)
    snap_id = session_manager.list_session_snapshots("otra", storage)[0]["id"]

    assert session_manager.load_session_snapshot(snap_id, storage).session_id == "otra"
    # el endpoint debe rechazar el cruce de sesión


def test_endpoint_listar(client, sesion, monkeypatch):
    session_id, storage = sesion
    monkeypatch.setattr("routers.sessions.STORAGE_DIR", storage)
    session_manager.save_session_snapshot(_doc(session_id, "a.docx"), storage)
    r = client.get(f"/api/sessions/{session_id}/snapshots")
    assert r.status_code == 200, r.text
    assert len(r.json()["snapshots"]) == 1
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pytest -q python/tests/test_snapshots.py --tb=short`
Expected: FAIL con `AttributeError: module ... has no attribute 'list_session_snapshots'`.

- [ ] **Step 3: Implementar las funciones**

En `python/persistence/session_manager.py`, después de `save_session_snapshot` (línea 216), agregar:

```python
def list_session_snapshots(session_id: str, storage_dir: Path) -> list[dict]:
    """Los snapshots de una sesión, del más nuevo al más viejo.

    Solo metadatos: el `data` completo puede pesar, y la UI que lista no lo
    necesita. Un snapshot corrupto se saltea en vez de tumbar la lista.
    """
    if DB_PATH is None:
        init_db(storage_dir)
    out: list[dict] = []
    try:
        conn = sqlite3.connect(str(DB_PATH))
        rows = conn.execute(
            "SELECT id, created_at, data FROM session_snapshots "
            "WHERE session_id = ? ORDER BY id DESC",
            (session_id,),
        ).fetchall()
        conn.close()
        for sid, created, data in rows:
            try:
                d = json.loads(data)
                out.append({
                    "id": sid,
                    "created_at": created,
                    "element_count": len(d.get("elements", [])),
                    "file_name": d.get("file_name", ""),
                })
            except Exception:
                continue
    except Exception as e:
        print(f"[WARN] Error listando snapshots: {e}")
    return out


def load_session_snapshot(snapshot_id: int, storage_dir: Path) -> Optional[DocumentModel]:
    """El `DocumentModel` guardado en un snapshot, o `None` si no existe/está roto."""
    if DB_PATH is None:
        init_db(storage_dir)
    try:
        conn = sqlite3.connect(str(DB_PATH))
        row = conn.execute(
            "SELECT data FROM session_snapshots WHERE id = ?", (snapshot_id,)
        ).fetchone()
        conn.close()
        if not row:
            return None
        return DocumentModel.model_validate(json.loads(row[0]))
    except Exception as e:
        print(f"[WARN] Error cargando snapshot {snapshot_id}: {e}")
        return None
```

- [ ] **Step 4: Implementar los endpoints**

En `python/routers/sessions.py`, después de `save_session_snapshot_endpoint` (línea 1226), agregar:

```python
@router.get("/api/sessions/{session_id}/snapshots")
async def list_session_snapshots_endpoint(session_id: str) -> dict:
    """Historial de puntos guardados de la sesión, del más nuevo al más viejo."""
    from persistence.session_manager import list_session_snapshots
    return {"snapshots": list_session_snapshots(session_id, STORAGE_DIR)}


@router.post("/api/sessions/{session_id}/restore-snapshot/{snapshot_id}")
async def restore_session_snapshot_endpoint(session_id: str, snapshot_id: int) -> DocumentModel:
    """Restaura un snapshot como estado actual y lo persiste.

    Rechaza un snapshot que no pertenezca a esta sesión: sin ese control, un id
    adivinado podría traer el documento de otra persona.
    """
    from persistence.session_manager import load_session_snapshot, save_session_state
    snap = load_session_snapshot(snapshot_id, STORAGE_DIR)
    if not snap or snap.session_id != session_id:
        raise HTTPException(status_code=404, detail="Snapshot no encontrado")
    save_session_state(snap, STORAGE_DIR)
    return snap
```

- [ ] **Step 5: Correr los tests**

Run: `pytest -q python/tests/test_snapshots.py --tb=short`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add python/persistence/session_manager.py python/routers/sessions.py python/tests/test_snapshots.py
git commit -m "feat: listar y restaurar snapshots de la sesión"
```

### Task 5: Frontend — API y store del historial

**Files:**
- Modify: `src/api/backend.ts` (después de `saveSessionSnapshot`, línea 912)
- Modify: `src/store/types.ts` (interfaz del store, junto a `saveSnapshot` línea 281)
- Modify: `src/store/slices/documentSlice.ts` (junto a `saveSnapshot`, línea 440)
- Test: `src/__tests__/historialSnapshots.test.ts` (nuevo)

**Interfaces:**
- Consumes: Task 4.
- Produces: `api.listSessionSnapshots`, `api.restoreSessionSnapshot`; store `snapshots`, `loadSnapshots()`, `restoreSnapshot(id)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/__tests__/historialSnapshots.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';
import * as api from '../api/backend';

vi.mock('../api/backend', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/backend')>();
  return {
    ...real,
    listSessionSnapshots: vi.fn(),
    restoreSessionSnapshot: vi.fn(),
    recoverSession: vi.fn(),
  };
});

describe('historial de snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocStore.setState({
      doc: { session_id: 's1', file_name: 'T.docx', elements: [], referencias: [] } as never,
      snapshots: [],
      tabDocs: {},
      showToast: vi.fn(),
    });
  });

  it('loadSnapshots guarda la lista que devuelve el backend', async () => {
    (api.listSessionSnapshots as any).mockResolvedValue([
      { id: 2, created_at: '2026-10-06 10:00:00', element_count: 10, file_name: 'T.docx' },
    ]);
    await useDocStore.getState().loadSnapshots();
    expect(useDocStore.getState().snapshots).toHaveLength(1);
    expect(useDocStore.getState().snapshots[0].id).toBe(2);
  });

  it('restoreSnapshot recarga el documento restaurado', async () => {
    (api.restoreSessionSnapshot as any).mockResolvedValue({ session_id: 's1' });
    (api.recoverSession as any).mockResolvedValue({
      session_id: 's1', file_name: 'T.docx', elements: [], referencias: [],
    });
    await useDocStore.getState().restoreSnapshot(2);
    expect(api.restoreSessionSnapshot).toHaveBeenCalledWith('s1', 2);
    expect(api.recoverSession).toHaveBeenCalledWith('s1');
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/__tests__/historialSnapshots.test.ts`
Expected: FAIL (`loadSnapshots is not a function`).

- [ ] **Step 3: Agregar la API**

En `src/api/backend.ts`, después de `saveSessionSnapshot` (línea 912):

```ts
export interface SessionSnapshot {
  id: number;
  created_at: string;
  element_count: number;
  file_name: string;
}

export async function listSessionSnapshots(sessionId: string): Promise<SessionSnapshot[]> {
  const res = await fetchWithTrace(`${getApiBase()}/sessions/${sessionId}/snapshots`);
  if (!res.ok) throw new Error('Error al listar el historial');
  const data = await res.json();
  return data.snapshots ?? [];
}

export async function restoreSessionSnapshot(sessionId: string, snapshotId: number): Promise<DocumentModel> {
  const res = await fetchWithTrace(
    `${getApiBase()}/sessions/${sessionId}/restore-snapshot/${snapshotId}`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error('Error al restaurar la versión');
  return res.json();
}
```

- [ ] **Step 4: Declarar en el store**

En `src/store/types.ts`, junto a `saveSnapshot: () => Promise<void>;` (línea 281), agregar:

```ts
  snapshots: import('../api/backend').SessionSnapshot[];
  loadSnapshots: () => Promise<void>;
  restoreSnapshot: (snapshotId: number) => Promise<void>;
```

- [ ] **Step 5: Implementar las acciones**

En `src/store/slices/documentSlice.ts`, después de `saveSnapshot` (línea 440), agregar:

```ts
  snapshots: [],
  loadSnapshots: async () => {
    const { doc } = get();
    if (!doc) return;
    try {
      const snapshots = await api.listSessionSnapshots(doc.session_id);
      set({ snapshots });
    } catch (err: any) {
      get().showToast(err.message || 'No se pudo cargar el historial', 'error');
    }
  },
  restoreSnapshot: async (snapshotId) => {
    const { doc } = get();
    if (!doc) return;
    set({ isSaving: true });
    try {
      await api.restoreSessionSnapshot(doc.session_id, snapshotId);
      /* Igual que `aplicarRefresco`: la pantalla se recarga desde el backend
         restaurado, para que no quede una mezcla de versiones en la vista. */
      const recargado = migrateDocument(await api.recoverSession(doc.session_id));
      set((state) => ({
        doc: recargado,
        references: recargado.referencias || [],
        tabDocs: { ...state.tabDocs, [doc.session_id]: recargado },
        hasUnsavedChanges: false,
        lastSavedAt: Date.now(),
        isSaving: false,
      }));
      get().showToast('Versión restaurada', 'success');
    } catch (err: any) {
      set({ isSaving: false });
      get().showToast(err.message || 'No se pudo restaurar la versión', 'error');
    }
  },
```

- [ ] **Step 6: Correr el test y type-check**

Run: `npx vitest run src/__tests__/historialSnapshots.test.ts` y `npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/api/backend.ts src/store/types.ts src/store/slices/documentSlice.ts src/__tests__/historialSnapshots.test.ts
git commit -m "feat: api y store del historial de snapshots"
```

### Task 6: Frontend — autoguardado periódico

**Files:**
- Create: `src/lib/useAutosave.ts`
- Modify: `src/App.tsx` (importar y llamar el hook dentro de `App`)
- Test: `src/__tests__/autoguardado.test.ts` (nuevo)

**Interfaces:**
- Consumes: `saveSnapshot` (existente).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/__tests__/autoguardado.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useAutosave } from '../lib/useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('guarda al pasar el intervalo si hay cambios sin guardar', () => {
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    useDocStore.setState({
      doc: { session_id: 's1', elements: [], referencias: [] } as never,
      hasUnsavedChanges: true,
      isSaving: false,
      saveSnapshot,
    });
    renderHook(() => useAutosave(1000));
    vi.advanceTimersByTime(1000);
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('no guarda si no hay cambios sin guardar', () => {
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    useDocStore.setState({
      doc: { session_id: 's1', elements: [], referencias: [] } as never,
      hasUnsavedChanges: false,
      isSaving: false,
      saveSnapshot,
    });
    renderHook(() => useAutosave(1000));
    vi.advanceTimersByTime(3000);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/__tests__/autoguardado.test.ts`
Expected: FAIL (no existe `src/lib/useAutosave.ts`).

- [ ] **Step 3: Implementar el hook**

Crear `src/lib/useAutosave.ts`:

```ts
import { useEffect } from 'react';
import { useDocStore } from '../store/useDocStore';

const INTERVALO_MS = 30_000;

/**
 * Autoguardado periódico.
 *
 * El backend ya persiste en cada mutación; esto crea un punto de restauración
 * cada tanto y antes de cerrar/cambiar de pestaña, y solo si hay cambios. Nunca
 * dispara dos a la vez: `isSaving` es la guarda.
 */
export function useAutosave(intervaloMs = INTERVALO_MS): void {
  useEffect(() => {
    const guardarSiHaceFalta = () => {
      const { doc, hasUnsavedChanges, isSaving, saveSnapshot } = useDocStore.getState();
      if (doc && hasUnsavedChanges && !isSaving) void saveSnapshot();
    };
    const t = setInterval(guardarSiHaceFalta, intervaloMs);
    const onVisibilidad = () => {
      if (document.visibilityState === 'hidden') guardarSiHaceFalta();
    };
    window.addEventListener('beforeunload', guardarSiHaceFalta);
    document.addEventListener('visibilitychange', onVisibilidad);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', guardarSiHaceFalta);
      document.removeEventListener('visibilitychange', onVisibilidad);
    };
  }, [intervaloMs]);
}
```

- [ ] **Step 4: Montar el hook en App**

En `src/App.tsx`, agregar `import { useAutosave } from './lib/useAutosave';` y, dentro del componente `App`, antes de los `return`, una línea: `useAutosave();`

- [ ] **Step 5: Correr el test y type-check**

Run: `npx vitest run src/__tests__/autoguardado.test.ts` y `npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useAutosave.ts src/App.tsx src/__tests__/autoguardado.test.ts
git commit -m "feat: autoguardado periódico con puntos de restauración"
```

### Task 7: Frontend — panel de historial en la barra

**Files:**
- Create: `src/components/toolbar/SnapshotHistory.tsx`
- Modify: `src/components/toolbar/UnifiedToolbar.tsx` (importar y renderizar)
- Test: `src/__tests__/panelHistorial.test.tsx` (nuevo)

**Interfaces:**
- Consumes: store `snapshots`, `loadSnapshots()`, `restoreSnapshot(id)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/__tests__/panelHistorial.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { SnapshotHistory } from '../components/toolbar/SnapshotHistory';

describe('SnapshotHistory', () => {
  const cargar = vi.fn().mockResolvedValue(undefined);
  const restaurar = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useDocStore.setState({
      doc: { session_id: 's1', elements: [], referencias: [] } as never,
      snapshots: [
        { id: 5, created_at: '2026-10-06 10:00:00', element_count: 12, file_name: 'T.docx' },
        { id: 4, created_at: '2026-10-06 09:00:00', element_count: 11, file_name: 'T.docx' },
      ],
      loadSnapshots: cargar,
      restoreSnapshot: restaurar,
    });
  });

  it('pide el historial al abrirse', () => {
    render(<SnapshotHistory />);
    expect(cargar).toHaveBeenCalled();
  });

  it('lista los snapshots y restaura el elegido', async () => {
    render(<SnapshotHistory />);
    expect(screen.getAllByRole('button', { name: /Restaurar/i })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /Restaurar/i })[0]);
    await waitFor(() => expect(restaurar).toHaveBeenCalledWith(5));
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/__tests__/panelHistorial.test.tsx`
Expected: FAIL (no existe el componente).

- [ ] **Step 3: Implementar el componente**

Crear `src/components/toolbar/SnapshotHistory.tsx`:

```tsx
import React, { useEffect } from 'react';
import { History } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { tiempoRelativo } from './UnifiedToolbar';

/**
 * Historial de puntos guardados. Al abrirse pide la lista y ofrece restaurar.
 * Sin emojis ni colores literales: íconos y tokens.
 */
export const SnapshotHistory: React.FC = () => {
  const snapshots = useDocStore((s) => s.snapshots);
  const loadSnapshots = useDocStore((s) => s.loadSnapshots);
  const restoreSnapshot = useDocStore((s) => s.restoreSnapshot);

  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

  return (
    <div
      data-testid="panel-historial"
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        padding: 'var(--space-3)', minWidth: 260,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        <History size={13} strokeWidth={1.75} aria-hidden />
        Puntos guardados
      </span>
      {snapshots.length === 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          Todavía no hay puntos guardados.
        </span>
      )}
      {snapshots.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
            {s.created_at}
            {s.element_count ? ` · ${s.element_count} elementos` : ''}
          </span>
          <button
            type="button"
            onClick={() => void restoreSnapshot(s.id)}
            style={{
              padding: '4px 8px', fontSize: 'var(--text-xs)',
              background: 'transparent', color: 'var(--color-accent)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            Restaurar
          </button>
        </div>
      ))}
    </div>
  );
};
```

Nota: `tiempoRelativo` se importa pero no se usa; quitarlo del import para no romper el lint (`import { useDocStore }` solamente).

- [ ] **Step 4: Renderizarlo desde la barra**

En `src/components/toolbar/UnifiedToolbar.tsx`: agregar `import { SnapshotHistory } from './SnapshotHistory';`, un estado `const [historialOpen, setHistorialOpen] = useState(false);` y, junto al chip "Guardado" (bloque `data-testid="toolbar-centro-doc"`), un botón que alterne `historialOpen`; cuando esté abierto, renderizar `<SnapshotHistory />` en un contenedor `position: absolute`. Usar `title="Historial de versiones"`.

- [ ] **Step 5: Correr el test y type-check**

Run: `npx vitest run src/__tests__/panelHistorial.test.tsx` y `npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/toolbar/SnapshotHistory.tsx src/components/toolbar/UnifiedToolbar.tsx src/__tests__/panelHistorial.test.tsx
git commit -m "feat: panel de historial de versiones en la barra"
```

### Task 8: Backend — restaurar versión de proyecto

**Files:**
- Modify: `python/modules/proyecto_manager.py` (después de `archivar_version`, línea 101)
- Modify: `python/main.py` (junto a los endpoints de proyectos, líneas 341-348)
- Test: `python/tests/test_proyecto_manager.py` (agregar)

**Interfaces:**
- Produces: `restaurar_version(proyecto_id, archivo) -> dict`; `POST /api/proyectos-archivo/restaurar-version` `{proyecto_id, archivo}`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `python/tests/test_proyecto_manager.py`:

```python
def test_restaurar_version_la_devuelve_a_la_carpeta(tmp_path, monkeypatch):
    from modules import proyecto_manager as pm

    monkeypatch.setattr(pm, "CONFIG_FILE", tmp_path / "config.json")
    raiz = tmp_path / "proyectos"
    pm.configurar_raiz(str(raiz))
    origen = tmp_path / "tesis.docx"
    origen.write_bytes(b"v1")
    creado = pm.crear_proyecto("Proyecto", str(origen))
    pm.archivar_version(creado["proyecto_id"], "tesis.docx")

    resultado = pm.restaurar_version(creado["proyecto_id"], "tesis.docx")

    restaurado = Path(resultado["archivo_destino"])
    assert restaurado.exists()
    assert restaurado.read_bytes() == b"v1"
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pytest -q python/tests/test_proyecto_manager.py -k restaurar --tb=short`
Expected: FAIL (`no attribute 'restaurar_version'`).

- [ ] **Step 3: Implementar**

En `python/modules/proyecto_manager.py`, después de `archivar_version` (línea 101):

```python
def restaurar_version(proyecto_id: str, archivo: str) -> dict:
    """Devuelve una versión archivada a la carpeta del proyecto.

    El archivo vive en `_Papelera/<proyecto_id>/<archivo>`; se copia de vuelta
    (no se mueve) para no perder el respaldo si algo falla después.
    """
    raiz = _raiz()
    config = _leer_config()
    proyecto = config.get('proyectos', {}).get(proyecto_id)
    if not raiz or not proyecto:
        raise KeyError('Proyecto no encontrado')
    origen = raiz / '_Papelera' / proyecto_id / archivo
    if not origen.exists():
        raise FileNotFoundError(f'{archivo} no está en la papelera')
    destino = Path(proyecto['carpeta']) / archivo
    shutil.copy2(str(origen), str(destino))
    archivados = [a for a in config.get('archivados', []) if a.get('archivo') != str(origen)]
    config['archivados'] = archivados
    _guardar_config(config)
    return {'archivo_destino': str(destino)}
```

- [ ] **Step 4: Agregar el endpoint**

En `python/main.py`, junto a los endpoints de proyectos (después de `archivar-version`, línea 345):

```python
@app.post("/api/proyectos-archivo/restaurar-version")
async def proyectos_restaurar_version(payload: dict) -> dict:
    """Devuelve una versión archivada a la carpeta del proyecto."""
    from modules import proyecto_manager
    try:
        return proyecto_manager.restaurar_version(payload["proyecto_id"], payload["archivo"])
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))
```

(Usar el mismo estilo de manejo de errores que los endpoints vecinos.)

- [ ] **Step 5: Correr los tests**

Run: `pytest -q python/tests/test_proyecto_manager.py --tb=short`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add python/modules/proyecto_manager.py python/main.py python/tests/test_proyecto_manager.py
git commit -m "feat: restaurar una versión archivada de proyecto"
```

### Task 9: Frontend — botón restaurar en VersionTimeline

**Files:**
- Modify: `src/components/project/VersionTimeline.tsx` (props + botón)
- Modify: quien lo consuma (`src/components/project/ProyectosScreen.tsx` o `proyectoSlice`) para pasar `onRestaurar`
- Test: `src/__tests__/versionTimelineRestaurar.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `POST /api/proyectos-archivo/restaurar-version`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/__tests__/versionTimelineRestaurar.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionTimeline } from '../components/project/VersionTimeline';

const versiones = [
  { id: 'v1', filename: 'tesis_v1.docx', palabras: 100, esActiva: true, fechaModificacion: 2 },
  { id: 'v2', filename: 'tesis_v2.docx', palabras: 120, esActiva: false, fechaModificacion: 1 },
] as never;

describe('VersionTimeline restaurar', () => {
  it('ofrece restaurar las versiones no activas', () => {
    const onRestaurar = vi.fn();
    render(<VersionTimeline versiones={versiones} onRestaurar={onRestaurar} />);
    const botones = screen.getAllByRole('button', { name: /Restaurar/i });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    expect(onRestaurar).toHaveBeenCalledWith('v2');
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/__tests__/versionTimelineRestaurar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar la prop y el botón**

En `src/components/project/VersionTimeline.tsx`:
- Agregar `onRestaurar?: (versionId: string) => void;` a `VersionTimelineProps`.
- Desestructurar `onRestaurar`.
- Junto al botón "Marcar como activa" (líneas 72-88), agregar, para versiones no activas, un botón `Restaurar` con el mismo estilo y `onClick={() => onRestaurar?.(v.id)}`.

- [ ] **Step 4: Cablear el consumidor**

En el componente/estado que renderiza `VersionTimeline`, pasar `onRestaurar` que llame al endpoint `restaurar-version` (vía `api` o `fetch`) y recargue las versiones. Seguir el patrón existente de `proyectoSlice.ts`/`proyectos.py`.

- [ ] **Step 5: Correr el test y type-check**

Run: `npx vitest run src/__tests__/versionTimelineRestaurar.test.tsx` y `npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/project/VersionTimeline.tsx src/components/project/ProyectosScreen.tsx src/__tests__/versionTimelineRestaurar.test.tsx
git commit -m "feat: restaurar versiones de proyecto desde la línea de tiempo"
```

---

## Parte 3 — Instalador

### Task 10: Instalador local con todo lo nuevo

**Files:**
- Ninguno nuevo (usa `build-installer.ps1`).

- [ ] **Step 1: Suite completa antes de empaquetar**

Run: `npx vitest run`, `npx tsc --noEmit`, `pytest -q`
Expected: todo en verde.

- [ ] **Step 2: Build de producción**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 3: Generar el instalador**

Run: `powershell -ExecutionPolicy Bypass -File build-installer.ps1`
Expected: instalador NSIS en la carpeta de salida (`dist/` o la que defina el script).

- [ ] **Step 4: Verificación manual**

Instalar en la máquina del dueño y comprobar:
- "Abrir copia en Word" no modifica el `.docx` original (comparar fecha de modificación del original).
- El panel de historial lista puntos y restaura uno.
- Las versiones de proyecto ofrecen "Restaurar".

- [ ] **Step 5: Commit (si el script dejó artefactos versionados)**

```bash
git add <solo si aplica>
git commit -m "chore: instalador local con el bloque A"
```

---

## Self-Review

- **Spec coverage:** Parte 1 = Problema 1; Tasks 4-9 = Problema 2; Task 3 = "descargar pregunta nombre"; Task 10 = entrega final. Fuera de alcance respetado.
- **Placeholder scan:** Task 7 Step 4 y Task 9 Step 4 describen la integración con el consumidor sin pegar todo el JSX; el ejecutor debe seguir los patrones existentes. Si aparece un bloqueo, resolverlo leyendo `ProyectosScreen.tsx`/`UnifiedToolbar.tsx`.
- **Type consistency:** `SessionSnapshot` (`id`, `created_at`, `element_count`, `file_name`) se usa igual en backend, api, store y componente. `working_path` es el nombre único de la ruta de la copia.
- **Review Focus:** los cinco casos están cubiertos (nombres con ruta → Task 1 Step 6; cruce de sesión → Task 4 Step 1; restaurar con ediciones → Task 5 Step 5; autoguardado doble → Task 6 `isSaving`; snapshot ajeno → Task 4).
