"""Contrato add-in ↔ motores.

Clase de bugs que este test mata:
  - "Motor central no disponible" (core_server sin endpoints que el add-in llama)
  - frontend llamando endpoints inexistentes (proofread-batch 404 silencioso)

Tiers:
  TIER_BOTH : el add-in puede llamarlos esperando respuesta util de CUALQUIER
              motor (core lite o monolito). Deben existir en los dos.
  TIER_MONO : solo el monolito los implementa; el add-in DEGRADA si faltan
              (fallback local). Deben existir en main.py.
"""
import pathlib
import re
import sys

import pytest

REPO = pathlib.Path(__file__).resolve().parents[2]
ADDIN_SRC = REPO / "word-addin" / "src" / "taskpane"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

# ── Superficie declarada ──────────────────────────────────────────────────────
TIER_BOTH = {
    "/api/version",
    "/api/addin/heartbeat",
    "/api/addin/build-info",       # anti-stale: existe en ambos desde hoy
    "/api/client-log",
    "/api/addin/format-plan",
    "/api/addin/captions-plan",
    "/api/addin/apa-score",
    "/api/addin/sideload-status-v2",
    "/api/open-in-word",
}
TIER_MONO = {
    "/api/addin/health",
    "/api/addin/document-zones",
    "/api/addin/scoped-apply-live",
    "/api/addin/auto-setup",
    # API para agentes IA (nuevo contrato, solo monolito)
    "/api/spec",
    "/api/presets",
    "/api/presets/{name}",
}


def _addin_api_paths() -> set[str]:
    """Todos los literales /api/... que el codigo fuente del add-in referencia."""
    paths: set[str] = set()
    pat = re.compile(r"/api/[A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)*")
    for f in ADDIN_SRC.rglob("*"):
        if f.suffix not in {".ts", ".tsx"} or ".test." in f.name:
            continue
        paths.update(m.group(0).rstrip("/.,'\"`") for m in pat.finditer(f.read_text(encoding="utf-8")))
    return paths


def _route_paths(app) -> set[str]:
    """Rutas como contrato publico via openapi.

    fastapi >= 0.141 deja objetos _IncludedRouter (sin atributo .path) en
    app.routes; el esquema openapi expone las rutas finales con sus
    templates ({name}) en ambas versiones, sin depender de internos.
    """
    return set(app.openapi()["paths"])


def _route_matches(route: str, called: str) -> bool:
    """El llamado matchea la ruta, incluido prefijo de template literal.

    La extraccion de `_addin_api_paths` corta en `${...}`: de
    `/api/addin/reference/${id}` queda `/api/addin/reference`, que debe
    matchear la ruta `/api/addin/reference/{ref_id}`.
    """
    route_rx = re.sub(r"\{[^}]+\}", "[^/]+", route) + "(?:/.*)?$"
    if re.fullmatch(route_rx, called):
        return True
    # llamado truncado: cada {param} final de la ruta es segmento opcional
    prefix_rx = re.sub(r"/\{[^}]+\}", "(?:/[^/]+)?", route) + "(?:/.*)?$"
    return re.fullmatch(prefix_rx, called) is not None


# Ruido conocido: 'api/backend' es ruta de IMPORT del modulo cliente, no HTTP.
_IMPORT_NOISE = {"/api/backend"}


@pytest.fixture(scope="module")
def mono_client():
    import main as main_mod
    return TestClient(main_mod.app)


@pytest.fixture(scope="module")
def core_client():
    import core_server as core_mod
    return TestClient(core_mod.app)


class TestContract:
    def test_every_addin_path_exists_in_monolith(self, mono_client):
        """Ninguna ruta que el add-in llama puede 404 en el monolito."""
        routes = _route_paths(mono_client.app)
        called = {p for p in _addin_api_paths() if "{" not in p} - _IMPORT_NOISE
        missing = sorted(
            p for p in called if not any(_route_matches(r, p) for r in routes)
        )
        assert not missing, (
            "El add-in llama rutas que NO existen en main.py "
            "(clase proofread-batch): " + ", ".join(missing)
        )

    def test_tier_both_present_in_core(self, core_client):
        routes = _route_paths(core_client.app)
        missing = sorted(TIER_BOTH - routes)
        assert not missing, "Faltan en core_server.py: " + ", ".join(missing)

    def test_tier_both_present_in_mono(self, mono_client):
        routes = _route_paths(mono_client.app)
        missing = sorted(TIER_BOTH - routes)
        assert not missing, "Faltan en main.py: " + ", ".join(missing)

    def test_tier_mono_present_in_mono(self, mono_client):
        """TIER_MONO debe existir en el monolito (antes declarado sin exigir)."""
        routes = _route_paths(mono_client.app)
        missing = sorted(TIER_MONO - routes)
        assert not missing, "Faltan en main.py: " + ", ".join(missing)


class TestBuildInfo:
    def test_build_info_shape_both(self, core_client, mono_client):
        for cli, mode in ((core_client, "core"), (mono_client, "app")):
            r = cli.get("/api/addin/build-info")
            assert r.status_code == 200, mode
            data = r.json()
            assert data["mode"] == mode
            assert isinstance(data.get("version"), str) and data["version"]

    def test_sideload_status_honest_in_core(self, core_client, tmp_path, monkeypatch):
        """El chip no debe mentir: active_in_word desconocido => null.

        AISLADO del APPDATA real: core_server construye la ruta del manifest
        DENTRO del handler (lectura por-request, sin cacheo al import), asi
        que basta redirigir APPDATA a tmp_path y crear el fixture ahi.
        """
        storage = tmp_path / "WordAPA7" / "storage"
        storage.mkdir(parents=True)
        (storage / "manifest.xml").write_text("<OfficeApp />", encoding="utf-8")
        monkeypatch.setenv("APPDATA", str(tmp_path))
        data = core_client.get("/api/addin/sideload-status-v2").json()
        assert data["active_in_word"] is None
        assert data["installed"] is True

    def test_sideload_without_manifest_reports_not_installed(self, core_client, tmp_path, monkeypatch):
        """Caso negativo: APPDATA aislado SIN manifest => installed False.

        Antes el test dependia del APPDATA real de la maquina: si existia un
        manifest.xml viejo, pasaba por accidente; si no, fallaba.
        """
        monkeypatch.setenv("APPDATA", str(tmp_path))  # tmp vacio, sin manifest
        data = core_client.get("/api/addin/sideload-status-v2").json()
        assert data["installed"] is False
        assert data["active_in_word"] is None


class TestLifespanShutdown:
    def test_no_on_event_deprecated(self):
        src = (pathlib.Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
        assert not re.search(r"^@app\.on_event", src, re.M), "migrar a lifespan_app (yield-section)"


class TestCorsRestricted:
    def test_cors_uses_allowlist(self):
        raw = (pathlib.Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
        code = "\n".join(l for l in raw.splitlines() if not l.lstrip().startswith("#"))
        assert not re.search(r"allow_origins\s*=\s*\[?\s*[\"']\*", code), (
            "usar _allowed_origins (el comentario ya lo promete)"
        )
