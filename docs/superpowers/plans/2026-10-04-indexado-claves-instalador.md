# Indexado de claves en el instalador — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las 4 claves hoy huérfanas (`modelscope`, `sambanova`, `dashscope`, `agnes_ai`) viajen como proveedores reales de primera clase, que el build **falle** si el payload embebido sale vacío, y que `core_server.py` cargue la misma cascada de claves que `main.py`.

**Architecture:** El catálogo de proveedores deja de estar duplicado: `python/persistence/ai_keys.py` sigue siendo la única fuente y las 4 entradas nuevas se agregan ahí y en `python/classification/llm_classifier.py` (`PROVIDER_CAPACITY` + `_get_active_providers`) y en `src/lib/proveedoresIA.ts`. La carga de claves se centraliza en una función única `load_all_key_sources()` que `main.py` y `core_server.py` invocan; `embed_payload.py` pasa a ser fail-closed; `build-installer.ps1` verifica el payload.

**Tech Stack:** Python 3.11, pytest, TypeScript/React 18, Vitest, PowerShell (build), NSIS.

**Spec:** `docs/superpowers/specs/2026-10-04-indexado-claves-instalador-design.md`

## Global Constraints

- Cero emojis en cualquier cadena, UI, comentario o plantilla. Íconos solo `lucide-react`.
- Colores solo por tokens CSS (`var(--...)`); prohibido hex.
- `pytest.ini`: `testpaths=python/tests`, `pythonpath=python`. Tests `def test_*` síncronos que envuelven código async con `asyncio.run(...)` (no hay pytest-asyncio).
- Paridad obligatoria: `VARIABLES_DE_CLAVE` (backend) y `PROVEEDORES_IA` (frontend) deben exponer el mismo conjunto de variables. Hoy son 14; con las 4 nuevas, **18**.
- Un commit atómico por tarea, con tests verdes antes de commitear.
- No tocar `.env` real ni `.env.example` (los placeholders se quedan como están).

## Review Focus

1. **Instalación limpia sin `.env`**: el build debe **fallar** con mensaje claro, no producir un instalador mudo.
2. **Usuario con clave propia en la UI**: su clave debe ganar sobre la embebida (orden de la cascada intacto).
3. **`core_server.py` arrancado solo por el autostart de NSIS**: debe ver las mismas claves que `main.py`, no cero.
4. **Proveedor nuevo sin modelo declarado**: debe caer a su modelo por defecto, no romper el arranque.
5. **Paridad rota entre backend y frontend**: el test de paridad debe fallar nombrando la variable faltante.

Cada línea de arriba queda fijada por un test en la tarea que posee el código.

---

## Estructura de archivos

- `python/persistence/ai_keys.py` — **modificar**. Agregar 4 proveedores a `VARIABLES_DE_CLAVE`, `VARIABLES_DE_MODELO`, `VARIABLES_DE_CLAVE_POR_ID`, `PROVIDER_ENV_VARS`.
- `python/classification/llm_classifier.py` — **modificar**. Agregar 4 entradas a `PROVIDER_CAPACITY` y 4 ramas en `_get_active_providers`.
- `src/lib/proveedoresIA.ts` — **modificar**. Agregar 4 entradas a `PROVEEDORES_IA`.
- `python/key_loader.py` — **nuevo**. `load_all_key_sources()` centraliza dotenv + ai_keys + embedded.
- `python/main.py` — **modificar**. Reemplazar la cascada inline por `load_all_key_sources()`.
- `python/core_server.py` — **modificar**. Llamar `load_all_key_sources()` al arranque.
- `python/embed_payload.py` — **modificar**. Fail-closed si no hay ninguna clave.
- `build-installer.ps1` — **modificar**. Verificar `_embedded_payload.json` en el runtime.
- `python/tests/test_key_catalog_parity.py` — **nuevo**. Paridad catálogo + proveedores nuevos.
- `python/tests/test_key_loader.py` — **nuevo**. Cascada de carga.
- `python/tests/test_embed_payload_failclosed.py` — **nuevo**. Fail-closed.
- `src/lib/__tests__/proveedoresIA.test.ts` — **nuevo**. Paridad frontend 18 variables.

---

### Task 1: Los 4 proveedores nuevos en el catálogo backend

**Files:**
- Modify: `python/persistence/ai_keys.py:31-92`
- Modify: `python/classification/llm_classifier.py:52-71` y `:105-328`
- Test: `python/tests/test_key_catalog_parity.py`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `VARIABLES_DE_CLAVE: List[str]` con 18 entradas (las 14 actuales + `MODELSCOPE_API_KEY`, `SAMBANOVA_API_KEY`, `DASHSCOPE_API_KEY`, `AGNES_AI_API_KEY`).
  - `VARIABLES_DE_MODELO: List[str]` con 17 entradas (13 + `MODELSCOPE_MODEL`, `SAMBANOVA_MODEL`, `DASHSCOPE_MODEL`, `AGNES_AI_MODEL`).
  - `VARIABLES_DE_CLAVE_POR_ID: Dict[str, List[str]]` con 17 ids.
  - `PROVIDER_ENV_VARS = VARIABLES_DE_CLAVE + VARIABLES_DE_MODELO`.

- [ ] **Step 1: Escribir el test que falla (proveedores nuevos presentes y con modelo)**

```python
# python/tests/test_key_catalog_parity.py
import persistence.ai_keys as ai_keys


PROVEEDORES_NUEVOS = {
    "modelscope": ["MODELSCOPE_API_KEY", "MODELSCOPE_MODEL"],
    "sambanova": ["SAMBANOVA_API_KEY", "SAMBANOVA_MODEL"],
    "dashscope": ["DASHSCOPE_API_KEY", "DASHSCOPE_MODEL"],
    "agnes_ai": ["AGNES_AI_API_KEY", "AGNES_AI_MODEL"],
}


def test_catalogo_incluye_los_cuatro_proveedores_nuevos():
    for pid, (var_clave, var_modelo) in PROVEEDORES_NUEVOS.items():
        assert pid in ai_keys.VARIABLES_DE_CLAVE_POR_ID, f"falta id {pid}"
        assert var_clave in ai_keys.VARIABLES_DE_CLAVE, f"falta {var_clave}"
        assert var_modelo in ai_keys.VARIABLES_DE_MODELO, f"falta {var_modelo}"
        assert var_clave in ai_keys.VARIABLES_DE_CLAVE_POR_ID[pid]


def test_catalogo_tiene_dieciniueve_variables_de_clave():
    # 14 originales + 4 nuevas + 1 (Cloudflare aporta CLOUDFLARE_ACCOUNT_ID aparte)
    # El contrato exacto lo fija el numero: si cambia, este test obliga a actualizarlo.
    assert len(ai_keys.VARIABLES_DE_CLAVE) == 18, (
        f"VARIABLES_DE_CLAVE debe tener 18, tiene {len(ai_keys.VARIABLES_DE_CLAVE)}: "
        f"{ai_keys.VARIABLES_DE_CLAVE}"
    )


def test_provider_env_vars_es_la_union_sin_duplicados():
    assert ai_keys.PROVIDER_ENV_VARS == (
        ai_keys.VARIABLES_DE_CLAVE + ai_keys.VARIABLES_DE_MODELO
    )
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_key_catalog_parity.py -q`
Expected: FAIL con "falta id modelscope".

- [ ] **Step 3: Agregar los 4 proveedores en `ai_keys.py`**

En `VARIABLES_DE_CLAVE` (tras `HUGGINGFACE_API_KEY`) agregar:

```python
    "MODELSCOPE_API_KEY",
    "SAMBANOVA_API_KEY",
    "DASHSCOPE_API_KEY",
    "AGNES_AI_API_KEY",
```

En `VARIABLES_DE_MODELO` (tras el modelo de huggingface) agregar:

```python
    "MODELSCOPE_MODEL",
    "SAMBANOVA_MODEL",
    "DASHSCOPE_MODEL",
    "AGNES_AI_MODEL",
```

En `VARIABLES_DE_CLAVE_POR_ID` agregar:

```python
    "modelscope": ["MODELSCOPE_API_KEY"],
    "sambanova": ["SAMBANOVA_API_KEY"],
    "dashscope": ["DASHSCOPE_API_KEY"],
    "agnes_ai": ["AGNES_AI_API_KEY"],
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_key_catalog_parity.py -q`
Expected: PASS.

- [ ] **Step 5: Registrar los 4 proveedores en el clasificador**

En `python/classification/llm_classifier.py`, dentro de `PROVIDER_CAPACITY` (tras la entrada `huggingface`) agregar:

```python
    # ModelScope (Alibaba) - API OpenAI-compatible, sin doc publica de RPM.
    "modelscope": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 6},
    # SambaNova Cloud - free tier conservador.
    "sambanova": {"timeout": 20, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 4},
    # DashScope (Alibaba Qwen) - OpenAI-compatible, limpieza conservadora.
    "dashscope": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 6},
    # Agnes AI - proveedor propio del autor, limites desconocidos -> conservador.
    "agnes_ai": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 5},
```

- [ ] **Step 6: Agregar las 4 ramas en `_get_active_providers`**

Siguiendo el patrón exacto de la rama `huggingface` existente (bloque que lee `os.getenv("<VAR>")`, arma `url`/`headers`/`model` y hace `append`), agregar cuatro bloques análogos con estos valores. La URL es OpenAI-compatible (`/v1/chat/completions`) salvo donde se indique:

```python
    # --- ModelScope ---
    ms_key = os.getenv("MODELSCOPE_API_KEY", "")
    if ms_key and not any(p["id"] == "modelscope" for p in proveedores):
        proveedores.append({
            "id": "modelscope",
            "name": "ModelScope",
            "model": os.getenv("MODELSCOPE_MODEL", "Qwen/Qwen2.5-72B-Instruct"),
            "key": ms_key,
            "url": "https://api-inference.modelscope.cn/v1/chat/completions",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # --- SambaNova ---
    sn_key = os.getenv("SAMBANOVA_API_KEY", "")
    if sn_key and not any(p["id"] == "sambanova" for p in proveedores):
        proveedores.append({
            "id": "sambanova",
            "name": "SambaNova",
            "model": os.getenv("SAMBANOVA_MODEL", "Meta-Llama-3.3-70B-Instruct"),
            "key": sn_key,
            "url": "https://api.sambanova.ai/v1/chat/completions",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # --- DashScope ---
    ds_key = os.getenv("DASHSCOPE_API_KEY", "")
    if ds_key and not any(p["id"] == "dashscope" for p in proveedores):
        proveedores.append({
            "id": "dashscope",
            "name": "DashScope",
            "model": os.getenv("DASHSCOPE_MODEL", "qwen-plus"),
            "key": ds_key,
            "url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # --- Agnes AI ---
    ag_key = os.getenv("AGNES_AI_API_KEY", "")
    if ag_key and not any(p["id"] == "agnes_ai" for p in proveedores):
        proveedores.append({
            "id": "agnes_ai",
            "name": "Agnes AI",
            "model": os.getenv("AGNES_AI_MODEL", "gpt-4o-mini"),
            "key": ag_key,
            "url": "https://api.agnes.ai/v1/chat/completions",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })
```

- [ ] **Step 7: Test de que el proveedor nuevo entra a la cola cuando hay clave**

Agregar a `python/tests/test_key_catalog_parity.py`:

```python
def test_proveedor_nuevo_entra_a_la_cola_con_clave(monkeypatch):
    import classification.llm_classifier as lc
    monkeypatch.setenv("MODELSCOPE_API_KEY", "ms-fake")
    proveedores = lc._get_active_providers(None, None, False, None)
    ids = [p["id"] for p in proveedores]
    assert "modelscope" in ids
    ms = next(p for p in proveedores if p["id"] == "modelscope")
    assert ms["model"]  # cae al default si no hay MODELSCOPE_MODEL
```

- [ ] **Step 8: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_key_catalog_parity.py -q`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add python/persistence/ai_keys.py python/classification/llm_classifier.py python/tests/test_key_catalog_parity.py
git commit -m "feat(keys): integrar modelscope, sambanova, dashscope y agnes_ai como proveedores reales"
```

---

### Task 2: Paridad del catálogo frontend (18 variables)

**Files:**
- Modify: `src/lib/proveedoresIA.ts:47-113`
- Test: `src/lib/__tests__/proveedoresIA.test.ts`

**Interfaces:**
- Consumes: el contrato de 18 variables de Task 1.
- Produces: `PROVEEDORES_IA` con 17 entradas (`variablesClave`/`variableModelo` por proveedor).

- [ ] **Step 1: Escribir el test que falla**

```typescript
// src/lib/__tests__/proveedoresIA.test.ts
import { describe, expect, it } from 'vitest';
import { PROVEEDORES_IA } from '../proveedoresIA';

const NUEVOS = ['modelscope', 'sambanova', 'dashscope', 'agnes_ai'];

describe('catalogo de proveedores IA', () => {
  it('incluye los cuatro proveedores nuevos', () => {
    const ids = PROVEEDORES_IA.map((p) => p.id);
    for (const id of NUEVOS) {
      expect(ids).toContain(id);
    }
  });

  it('expone 18 variables de clave en total (Cloudflare aporta dos)', () => {
    const total = PROVEEDORES_IA.reduce(
      (n, p) => n + p.variablesClave.length,
      0,
    );
    expect(total).toBe(18);
  });

  it('cada proveedor nuevo declara su variable de modelo', () => {
    for (const id of NUEVOS) {
      const p = PROVEEDORES_IA.find((x) => x.id === id);
      expect(p?.variableModelo).toMatch(/_MODEL$/);
    }
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/__tests__/proveedoresIA.test.ts`
Expected: FAIL (faltan ids).

- [ ] **Step 3: Agregar las 4 entradas a `PROVEEDORES_IA`**

Tras la última entrada (huggingface), agregar:

```typescript
  {
    id: 'modelscope',
    etiqueta: 'ModelScope',
    variablesClave: ['MODELSCOPE_API_KEY'],
    variableModelo: 'MODELSCOPE_MODEL',
    modeloPorDefecto: 'Qwen/Qwen2.5-72B-Instruct',
  },
  {
    id: 'sambanova',
    etiqueta: 'SambaNova',
    variablesClave: ['SAMBANOVA_API_KEY'],
    variableModelo: 'SAMBANOVA_MODEL',
    modeloPorDefecto: 'Meta-Llama-3.3-70B-Instruct',
  },
  {
    id: 'dashscope',
    etiqueta: 'DashScope',
    variablesClave: ['DASHSCOPE_API_KEY'],
    variableModelo: 'DASHSCOPE_MODEL',
    modeloPorDefecto: 'qwen-plus',
  },
  {
    id: 'agnes_ai',
    etiqueta: 'Agnes AI',
    variablesClave: ['AGNES_AI_API_KEY'],
    variableModelo: 'AGNES_AI_MODEL',
    modeloPorDefecto: 'gpt-4o-mini',
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/__tests__/proveedoresIA.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que el guardrail existente sigue verde**

Run: `npx vitest run src/__tests__/conexionNoMiente.test.ts`
Expected: PASS (usa `VARIABLES_DE_CLAVE` del backend; si estaba fijado a 14, actualizarlo a 18 en el mismo commit).

- [ ] **Step 6: Commit**

```bash
git add src/lib/proveedoresIA.ts src/lib/__tests__/proveedoresIA.test.ts src/__tests__/conexionNoMiente.test.ts
git commit -m "feat(keys): catalogo frontend con los cuatro proveedores nuevos (paridad 18)"
```

---

### Task 3: Función única de carga de claves (`load_all_key_sources`)

**Files:**
- Create: `python/key_loader.py`
- Modify: `python/main.py:26-48`
- Modify: `python/core_server.py`
- Test: `python/tests/test_key_loader.py`

**Interfaces:**
- Consumes: `persistence.ai_keys.load_provider_keys_into_env`, `embedded_secrets.load_embedded_into_env`.
- Produces:
  - `load_all_key_sources(repo_root: Optional[Path] = None) -> Dict[str, str]` — aplica dotenv, luego `ai_keys.json`, luego embedded; respeta "no pisar" `os.environ`; devuelve un dict `{fuente: cantidad_de_vars_aplicadas}`.

- [ ] **Step 1: Escribir el test que falla (el usuario gana sobre embedded)**

```python
# python/tests/test_key_loader.py
import os

import key_loader


def test_usuario_gana_sobre_embedded(tmp_path, monkeypatch):
    # ai_keys.json define GROQ_API_KEY de usuario
    (tmp_path / "ai_keys.json").write_text(
        '{"GROQ_API_KEY": "usuario-123"}', encoding="utf-8"
    )
    monkeypatch.setattr(key_loader, "_keys_dir", lambda: tmp_path, raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "")
    os.environ.pop("GROQ_API_KEY", None)
    # embedded intenta poner otra
    monkeypatch.setattr(
        key_loader, "load_embedded_into_env",
        lambda: {"GROQ_API_KEY": "embedded-999"}, raising=False,
    )
    key_loader.load_all_key_sources()
    assert os.environ["GROQ_API_KEY"] == "usuario-123"


def test_no_pisa_lo_ya_presente_en_entorno(monkeypatch):
    os.environ["NVIDIA_API_KEY"] = "pre-existente"
    monkeypatch.setattr(
        key_loader, "load_embedded_into_env",
        lambda: {"NVIDIA_API_KEY": "embedded"}, raising=False,
    )
    key_loader.load_all_key_sources()
    assert os.environ["NVIDIA_API_KEY"] == "pre-existente"
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_key_loader.py -q`
Expected: FAIL con "No module named 'key_loader'".

- [ ] **Step 3: Crear `python/key_loader.py`**

```python
"""Carga unica de claves de IA para cualquier proceso (main.py y core_server.py).

Orden, primero gana (todos respetan "si no esta en os.environ"):
  1. .env de la raiz del repo (solo dev; en el instalador no existe)
  2. %APPDATA%\\WordAPA7\\storage\\ai_keys.json  (lo escribe la UI: gana sobre embedded)
  3. _embedded_payload.json                      (viaja en el instalador)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv

from embedded_secrets import load_embedded_into_env
from persistence.ai_keys import load_provider_keys_into_env


def _keys_dir() -> Path:
    # Se inyecta en tests; en produccion es el STORAGE_DIR real de ai_keys.
    from config import STORAGE_DIR

    return Path(STORAGE_DIR)


def load_all_key_sources(repo_root: Optional[Path] = None) -> Dict[str, str]:
    aplicadas: Dict[str, str] = {}
    raiz = Path(repo_root) if repo_root else Path(__file__).resolve().parent.parent
    env_file = raiz / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        aplicadas["dotenv"] = "aplicado"

    antes = set(k for k, v in os.environ.items() if v)
    load_provider_keys_into_env(_keys_dir() / "ai_keys.json")
    aplicadas["ai_keys"] = str(len([k for k in os.environ if k not in antes]))

    antes = set(k for k, v in os.environ.items() if v)
    load_embedded_into_env()
    aplicadas["embedded"] = str(len([k for k in os.environ if k not in antes]))
    return aplicadas
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_key_loader.py -q`
Expected: PASS.

- [ ] **Step 5: Usar la función en `main.py`**

Reemplazar el bloque inline de `python/main.py:26-48` por:

```python
from key_loader import load_all_key_sources

load_all_key_sources()
```

(Si el bloque actual importa `load_dotenv`, `load_provider_keys_into_env` y `load_embedded_into_env` solo para esto, quitar los imports ahora huérfanos.)

- [ ] **Step 6: Usar la función en `core_server.py`**

Al inicio del arranque de `core_server.py` (antes de montar rutas), agregar:

```python
from key_loader import load_all_key_sources

load_all_key_sources()
```

- [ ] **Step 7: Verificar que los tests existentes de arranque siguen verdes**

Run: `python -m pytest python/tests/test_instalacion_limpia.py python/tests/test_ai_keys.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add python/key_loader.py python/main.py python/core_server.py python/tests/test_key_loader.py
git commit -m "feat(keys): carga unica de claves compartida por main y core_server"
```

---

### Task 4: `embed_payload.py` fail-closed

**Files:**
- Modify: `python/embed_payload.py:46-67`
- Test: `python/tests/test_embed_payload_failclosed.py`

**Interfaces:**
- Consumes: `persistence.ai_keys.VARIABLES_DE_CLAVE` (18 tras Task 1).
- Produces: `embed_payload.build_payload(env: Dict[str, str], *, allow_empty: bool = False) -> Dict[str, str]` separado de `main()`, para poder testearlo sin tocar disco.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_embed_payload_failclosed.py
import pytest

import embed_payload


def test_payload_vacio_aborta():
    with pytest.raises(SystemExit):
        embed_payload.build_payload({}, allow_empty=False)


def test_payload_con_una_clave_pasa():
    payload = embed_payload.build_payload(
        {"GROQ_API_KEY": "gsk_x"}, allow_empty=False
    )
    assert payload  # al menos una entrada ofuscada


def test_allow_empty_permite_vacio():
    assert embed_payload.build_payload({}, allow_empty=True) == {}
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_embed_payload_failclosed.py -q`
Expected: FAIL con "module has no attribute 'build_payload'".

- [ ] **Step 3: Refactor de `embed_payload.py`**

Extraer la lógica de ofuscación a `build_payload(env, *, allow_empty=False)`: recorre `VARIABLES_DE_CLAVE`, ofusca las presentes; si el resultado queda vacío y `allow_empty` es False, imprime un error claro (`"ERROR: _embedded_payload.json saldria vacio. Revisa .env antes de construir el instalador."`) y hace `raise SystemExit(1)`. `main()` llama `build_payload(load_env(ROOT / ".env"))` y escribe el archivo.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_embed_payload_failclosed.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/embed_payload.py python/tests/test_embed_payload_failclosed.py
git commit -m "fix(build): embed_payload falla si el payload embebido sale vacio"
```

---

### Task 5: Verificación del payload en `build-installer.ps1`

**Files:**
- Modify: `build-installer.ps1:128-144`

**Interfaces:**
- Consumes: el archivo `dist-python/python-runtime/python/_embedded_payload.json` producido por `build_embedded.py`.
- Produces: nada (verificación de build).

- [ ] **Step 1: Agregar la verificación tras el bloque fail-closed existente**

```powershell
# Verificacion: el payload embebido debe existir y no estar vacio.
$payloadPath = "dist-python\python-runtime\python\_embedded_payload.json"
if (-not (Test-Path $payloadPath)) {
    Write-Error "FAIL-CLOSED: falta $payloadPath. El instalador saldria sin claves."
    exit 1
}
$payloadRaw = Get-Content $payloadPath -Raw
if ($payloadRaw.Trim() -eq "{}" -or $payloadRaw.Trim() -eq "") {
    Write-Error "FAIL-CLOSED: $payloadPath esta vacio. Corre embed_payload.py con un .env valido."
    exit 1
}
Write-Host "OK: _embedded_payload.json presente y no vacio."
```

- [ ] **Step 2: Verificación manual del script (sintaxis)**

Run: `powershell -Command "Get-Content build-installer.ps1 | Out-Null; Write-Host 'sintaxis OK'"`
Expected: sin error de parseo.

- [ ] **Step 3: Commit**

```bash
git add build-installer.ps1
git commit -m "fix(build): verificar _embedded_payload.json en el runtime antes de empaquetar"
```

---

## Criterios de aceptación (del spec)

- [ ] `VARIABLES_DE_CLAVE` tiene 18 entradas y `PROVEEDORES_IA` expone esas 18 (paridad testeada).
- [ ] Los 4 proveedores nuevos entran a la cola del router cuando su clave está presente.
- [ ] `core_server.py` y `main.py` cargan la misma cascada (`load_all_key_sources`).
- [ ] `embed_payload.py` aborta con payload vacío.
- [ ] `build-installer.ps1` falla si el payload falta o está vacío.
- [ ] Tests: `python -m pytest python/tests/test_key_catalog_parity.py python/tests/test_key_loader.py python/tests/test_embed_payload_failclosed.py -q` verde; `npx vitest run src/lib/__tests__/proveedoresIA.test.ts` verde.
