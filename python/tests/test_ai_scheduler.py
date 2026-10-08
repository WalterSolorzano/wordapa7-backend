import asyncio
import time

import pytest

import modules.ai_client as ai_client
import modules.ai_scheduler as ai_scheduler


async def _esperar(sched, session_id, timeout=2.0):
    """Espera a que no haya jobs queued/running de la sesion."""
    fin = time.time() + timeout
    while time.time() < fin:
        jobs = sched.status(session_id)["jobs"]
        if not any(j["state"] in ("queued", "running") for j in jobs):
            return
        await asyncio.sleep(0.01)
    raise AssertionError("el scheduler no drena")


@pytest.fixture
def cache_aislada(tmp_path, monkeypatch):
    """Aisla la cache durable en un archivo temporal y sin cargar del disco."""
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", tmp_path / "ai_cache.json")
    monkeypatch.setattr(ai_client, "_cache", {})
    monkeypatch.setattr(ai_client, "_cache_cargada", True)
    monkeypatch.setattr(ai_client, "_profundidad_de_lote", 0)
    yield
    ai_scheduler._RUNNERS.clear()


def test_hash_estable_ignora_espacios_y_distingue_motor_y_fase():
    a = ai_scheduler.content_hash("captions", "Hola   mundo\n")
    b = ai_scheduler.content_hash("captions", "Hola mundo")
    assert a == b
    assert a != ai_scheduler.content_hash("proofread", "Hola mundo")
    assert a != ai_scheduler.content_hash("captions", "Hola mundo", phase="resultados")


def test_segundo_encolado_del_mismo_contenido_no_reejecuta(cache_aislada):
    sched = ai_scheduler.Scheduler()
    llamadas = []

    async def runner(job):
        llamadas.append(job.element_id)
        return {"valor": job.element_id}

    ai_scheduler.register_runner("captions", runner)

    async def flujo():
        j1 = await sched.enqueue("s1", "captions", "p1", "texto uno")
        await _esperar(sched, "s1")
        j2 = await sched.enqueue("s1", "captions", "p1", "texto uno")
        await _esperar(sched, "s1")
        return j1, j2

    j1, j2 = asyncio.run(flujo())
    assert llamadas == ["p1"]
    assert sched.status("s1")["jobs"][0]["state"] == "done"


def test_reabrir_en_otra_sesion_reusa_la_cache_y_solo_reejecuta_lo_cambiado(cache_aislada):
    sched = ai_scheduler.Scheduler()
    llamadas = []

    async def runner(job):
        llamadas.append(job.element_id)
        return {"valor": job.element_id}

    ai_scheduler.register_runner("captions", runner)

    async def flujo():
        await sched.enqueue("s1", "captions", "p1", "parrafo uno")
        await sched.enqueue("s1", "captions", "p2", "parrafo dos")
        await _esperar(sched, "s1")
        # Reabrir en sesion nueva: p1 igual, p2 cambiado.
        await sched.enqueue("s2", "captions", "p1", "parrafo uno")
        await sched.enqueue("s2", "captions", "p2", "parrafo dos CAMBIADO")
        await _esperar(sched, "s2")

    asyncio.run(flujo())
    # p1 no se reejecuta (cache), p2 si (contenido distinto).
    assert llamadas == ["p1", "p2", "p2"]
    estados_s2 = {j["element_id"]: j["state"] for j in sched.status("s2")["jobs"]}
    assert estados_s2 == {"p1": "done", "p2": "done"}
    assert sched.status("s2")["jobs"][0]["result"] == {"valor": "p1"}


def test_deadline_deja_el_job_pendiente_no_colgado(cache_aislada):
    sched = ai_scheduler.Scheduler()

    async def lento(job):
        await asyncio.sleep(5)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", lento)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto", deadline_s=0.05)
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    job = sched.status("s1")["jobs"][0]
    assert job["state"] == "pending"


def test_resume_pending_reejecuta(cache_aislada):
    sched = ai_scheduler.Scheduler()
    intentos = {"n": 0}

    async def falla_una_vez(job):
        intentos["n"] += 1
        if intentos["n"] == 1:
            return None
        return {"ok": True}

    ai_scheduler.register_runner("proofread", falla_una_vez)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto")
        await _esperar(sched, "s1")
        assert sched.status("s1")["jobs"][0]["state"] == "pending"
        reencolados = await sched.resume_pending("s1")
        assert reencolados == 1
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert sched.status("s1")["jobs"][0]["state"] == "done"
    assert intentos["n"] == 2


def test_copiloto_se_despacha_antes_que_un_lote(cache_aislada):
    sched = ai_scheduler.Scheduler()
    orden = []

    async def runner(job):
        orden.append(job.motor)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)
    ai_scheduler.register_runner("copilot", runner)

    async def flujo():
        for i in range(4):
            await sched.enqueue("s1", "proofread", f"p{i}", f"texto {i}")
        await sched.enqueue("s1", "copilot", "sel", "instruccion",
                            priority=ai_scheduler.PRIORITY_COPILOT)
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert orden[0] == "copilot"


def test_cancel_session_drena_la_cola_y_no_reejecuta(cache_aislada):
    sched = ai_scheduler.Scheduler()
    llamadas = []

    async def runner(job):
        llamadas.append(job.element_id)
        await asyncio.sleep(0.05)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        for i in range(5):
            await sched.enqueue("s1", "proofread", f"p{i}", f"texto {i}")
        cancelados = await sched.cancel_session("s1")
        await asyncio.sleep(0.2)
        estados = [j["state"] for j in sched.status("s1")["jobs"]]
        return cancelados, estados

    cancelados, estados = asyncio.run(flujo())
    assert cancelados >= 1
    assert "queued" not in estados
    assert len(llamadas) < 5


def test_cancel_no_ejecuta_jobs_ya_despachados(cache_aislada):
    sched = ai_scheduler.Scheduler()
    arrancados = []

    async def runner(job):
        arrancados.append(job.element_id)
        await asyncio.sleep(0.1)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        for i in range(4):
            await sched.enqueue("s1", "proofread", f"p{i}", f"texto {i}")
        await asyncio.sleep(0.01)  # deja que el dispatcher despache
        await sched.cancel_session("s1")
        await asyncio.sleep(0.3)
        return arrancados

    arrancados = asyncio.run(flujo())
    assert len(arrancados) <= 1


def test_error_al_guardar_resultado_no_deja_running(cache_aislada):
    sched = ai_scheduler.Scheduler()

    async def runner(job):
        return {"no_serializable": {1, 2, 3}}  # un set no es JSON

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto")
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert sched.status("s1")["jobs"][0]["state"] in ("pending", "failed")


def test_reencolar_pending_no_duplica(cache_aislada):
    sched = ai_scheduler.Scheduler()
    intentos = {"n": 0}

    async def runner(job):
        intentos["n"] += 1
        return None if intentos["n"] == 1 else {"ok": True}

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto")
        await _esperar(sched, "s1")
        assert len(sched.status("s1")["jobs"]) == 1
        await sched.enqueue("s1", "proofread", "p1", "texto")
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert len(sched.status("s1")["jobs"]) == 1
    assert sched.status("s1")["jobs"][0]["state"] == "done"
    assert intentos["n"] == 2


def test_prune_limita_jobs_por_sesion(cache_aislada, monkeypatch):
    monkeypatch.setattr(ai_scheduler, "_MAX_JOBS_POR_SESION", 10)
    sched = ai_scheduler.Scheduler()

    async def runner(job):
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        for i in range(30):
            await sched.enqueue("s1", "proofread", f"p{i}", f"texto {i}")
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert len(sched.status("s1")["jobs"]) <= 12


def test_health_reporta_estado(cache_aislada):
    sched = ai_scheduler.Scheduler()

    async def runner(job):
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto")
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    salud = sched.health()
    assert salud["sesiones"] == 1
    assert salud["jobs"].get("done") == 1
