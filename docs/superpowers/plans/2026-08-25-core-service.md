# Plan — Núcleo Permanente (Core Service): artillería pesada sin interfaz

> Idea del usuario: si el complemento necesita el motor central, ¿por qué depender
> de la app con UI? Respuesta corta: **sí, es mejor**. Este plan lo materializa.

## Realidad actual vs objetivo

| Hoy | Objetivo |
|---|---|
| Watcher arranca el MONOLITO (`main.py`) al abrir Word: parsea generación, plantillas, PDF… ~2-4 s y RAM grande | Un **núcleo ligero permanente** (`core_server.py`, <60 MB, <1.5 s) con SOLO la inteligencia del add-in, vivo desde el login |
| Si abres la app, otro backend compite por 8742 | Reparto limpio por puertos, cero guerras |

## Arquitectura de dos niveles

```
LOGIN ──► pythonw core_server.py :8742   (SIEMPRE, ~50MB, sin ventana)
            ├─ format-plan / captions-plan      ← plan_engine, captions
            ├─ resolve-ghost-citation           ← Crossref directo
            ├─ suggest-caption (heurística+IA)  ← apa_rules
            ├─ heartbeat / sideload-status-v2 / client-log / diagnostics-lite
            └─ TLS https://localhost:8742 (misma llave/pem existentes)

ABRES LA APP ──► detecta núcleo en 8742 (capable=false para /api/upload…)
            └─ lanza main.py COMPLETO en :8743 (bajo demanda, muere al cerrar app)
               frontend usa getApiBaseAsync() → descubre 8743 automáticamente
ADD-IN ───────► SIEMPRE 8742 (núcleo). Jamás depende de que abras la app.
WATCHER ─────► supervisor: si el núcleo murió, lo revive; log a %APPDATA%.
```

Por qué dos puertos y no uno: el monolito carga parsing/generación/templates
(pesado, lento); el núcleo solo cerebro. Forzar uno solo obligaría a lazy-imports
de todo main.py (refactor riesgoso). Dos puertos = hoy funciona, mañana migramos.

## Task A — `core_server.py` (el núcleo)
- FastAPI mínimo; imports: logger, apa_rules, plan_engine, captions,
  auditor local, cliente Crossref, TLS. PROHIBIDO importar parsing/generation/main.
- Endpoints: los listados arriba + `/api/core/status` (uptime, ram, versión).
- Reusa `storage/ssl/localhost.pem` existente (cero diálogos de certificado).
- Single-instance por puerto; si 8742 ocupado por el monolito (modo viejo),
  hace handshake y sale limpio.
- Test: arranque <2 s, RAM medida, todos los endpoints del add-in responden.

## Task B — Watcher supervisor
- En vez de "arranca backend cuando abre Word": **garantiza núcleo vivo SIEMPRE**
  (login) y lo reviva si muere (backoff 5/15/60 s).
- Deja de matarlo cuando cierras Word (antes ahorraba RAM matando; ahora el
  núcleo pesa menos que un tab de Chrome y mantenerlo caliente da latencia 0).

## Task C — App bajo demanda en :8743
- `main.py --port 8743` cuando la app arranca y el núcleo no cubre un endpoint.
- `getApiBaseAsync()`: consulta `/api/core/status`; si falta capacidad → usa 8743.
- Al cerrar la app: shutdown graceful de 8743; el núcleo sigue.

## Task D — Instalador
- Run key: `pythonw.exe core_server.py --port 8742` (núcleo, sin consola).
- El watcher queda como supervisor (también en Run, ya está).
- Desinstalador: mata núcleo + watcher (ya filtra por python-runtime).

## Task E — Telemetría mínima
- Cada operación del add-in → `client-log` (componente addin-core): qué plan se
  aplicó, cuántas ops, fallos capturados. Base para diagnosticarte sin pedirme pantallazos.

## Métricas de éxito
1. Abres PC → núcleo vivo sin ventanas, RAM < 60 MB.
2. Abres Word → botón responde INSTANTÁNEO (0 s de espera de backend).
3. Cierras la app → el complemento sigue con artillería completa.
4. Matas el núcleo a propósito → revive solo en <10 s.

## Orden
1.0.59: Tasks A+B (núcleo + supervisor) · 1.0.60: Task C (app en 8743) ·
1.0.61: Task D+E pulido instalador/telemetría. Gates completos cada versión +
verificación unpacked (core_server presente, Run key apuntando a core).
