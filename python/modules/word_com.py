"""Sesiones COM de Word propias: singleton con cleanup garantizado.

Reglas (investigadas):
* DispatchEx crea instancia NUEVA por llamada -> usar UNA por proceso.
* Quit() en finally SIEMPRE si la instancia es nuestra.
* Jamás matar WINWORD globales: solo registrar y cerrar lo que abrimos.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager

log = logging.getLogger("wordapa7.word_com")

_app = None
_pid_mine = None


def get_word_app():
    """Devuelve instancia única (creándola si no existe) y anota su PID. En Linux/Web retorna None limpiamente."""
    global _app, _pid_mine
    if _app is None:
        try:
            import win32com.client
            _app = win32com.client.DispatchEx("Word.Application")
            try:
                _app.Visible = False
                _app.DisplayAlerts = 0
                _app.WindowState = 2
            except Exception:
                pass
            try:
                _pid_mine = int(_app.process_id)
            except Exception:
                _pid_mine = None
            log.info("Word COM iniciado (pid=%s)", _pid_mine)
        except (ImportError, Exception) as e:
            log.info("Word COM no disponible (entorno web/Linux o sin Word instalado): %s", e)
            return None
    return _app


@contextmanager
def word_session():
    """with word_session() as app: ... — cierra SOLO si la abrimos nosotros."""
    app = get_word_app()
    ours = _app is app
    docs_before = 0
    try:
        docs_before = app.Documents.Count
    except Exception:
        pass
    yield app
    if ours:
        try:
            # Cerrar solo los docs que abrimos en esta sesión
            while app.Documents.Count > docs_before:
                app.Documents(app.Documents.Count).Close(SaveChanges=0)
        except Exception:
            pass


def release_word_app(force: bool = False) -> None:
    """Cierra nuestra instancia al apagar el backend. Nunca toca otras."""
    global _app, _pid_mine
    if _app is None:
        return
    try:
        if _app.Documents.Count == 0 or force:
            _app.Quit(SaveChanges=0)
            log.info("Word COM cerrado (pid=%s)", _pid_mine)
    except Exception as e:
        log.warning("Quit falló: %s", e)
    finally:
        _app = None
        _pid_mine = None
