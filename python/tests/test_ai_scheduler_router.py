from fastapi import FastAPI
from fastapi.testclient import TestClient

import modules.ai_scheduler as ai_scheduler
from routers import ai as ai_router


def _client():
    app = FastAPI()
    app.include_router(ai_router.router)
    return TestClient(app)


def test_demand_encola_y_jobs_reporta(monkeypatch):
    sched = ai_scheduler.Scheduler()
    monkeypatch.setattr(ai_router, "get_scheduler", lambda: sched)

    async def runner(job):
        return {"ok": job.element_id}

    ai_scheduler.register_runner("proofread", runner)
    cliente = _client()
    resp = cliente.post("/api/ai/demand", json={
        "session_id": "s1", "element_ids": ["p1"],
        "texts": {"p1": "texto uno"}, "motors": ["proofread"],
    })
    assert resp.status_code == 200
    assert resp.json()["ids"]
    ai_scheduler._RUNNERS.clear()
