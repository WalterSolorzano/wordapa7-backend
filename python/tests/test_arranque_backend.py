"""Espera al nucleo: sondeo con techo, no un `sleep` fijo.

Dos defectos medidos en la misma funcion, y el segundo explica el primero.

1. `BACKEND_STARTUP_WAIT` quedo indefinido al fusionarse su linea con el
   comentario de la anterior (`...detener backendBACKEND_STARTUP_WAIT = 3`).
   Un `NameError` en el camino de arranque del watcher no es cosmetico: es lo
   que deja la app abierta y muerta.

2. El valor, cuando existia, era 3 segundos. El arranque en frio medido ronda
   los 45 (imports + SSL + montaje del add-in), asi que la constante chica
   convertia "lento" en "cayo": `watcher.log` lo dice con todas las letras,
   "El backend no respondio tras el startup inicial", y despues el backend
   respondia igual.

Un `sleep` fijo no puede arreglar el punto 2 sin elegir entre esperar de mas
siempre o fallar cuando tarda. Por eso se sondea: se corta en cuanto responde.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import word_watcher as ww

FUENTE = (pathlib.Path(__file__).resolve().parents[1] / "word_watcher.py").read_text(
    encoding="utf-8"
)


class TestConstantesDeArranque:
    def test_el_techo_de_espera_cubre_el_arranque_en_frio(self):
        """90 s contra ~45 medidos: margen para una maquina lenta, no infinidad."""
        assert ww.BACKEND_READY_TIMEOUT >= 60

    def test_la_primera_sonda_no_bloquea(self):
        """La sonda rapida sigue existiendo: no todo espera se vuelve larga."""
        assert ww.BACKEND_STARTUP_WAIT <= 5


class TestWaitForBackend:
    def test_corta_en_cuanto_responde(self):
        """Si responde al tercer intento, no se sondea 90 veces."""
        llamadas: list[int] = []

        def responde_al_tercero() -> bool:
            llamadas.append(1)
            return len(llamadas) >= 3

        original = ww.is_backend_running
        ww.is_backend_running = responde_al_tercero
        try:
            assert ww.wait_for_backend(timeout=2.0, interval=0.01) is True
        finally:
            ww.is_backend_running = original
        assert len(llamadas) == 3

    def test_devuelve_false_cuando_se_agota_el_techo(self):
        """Nunca responde: se corta por techo y no miente diciendo que si."""
        original = ww.is_backend_running
        ww.is_backend_running = lambda: False
        try:
            assert ww.wait_for_backend(timeout=0.05, interval=0.01) is False
        finally:
            ww.is_backend_running = original


class TestElWatcherNoVuelveAlSleepFijo:
    def test_ningun_punto_de_arranque_duerme_una_constante_fija(self):
        """El workaround viejo no puede volver: esperar y creer que alcanza.

        Se miran SENTENCIAS, no prosa: el docstring de `wait_for_backend` nombra
        el `sleep` viejo para explicar por que se fue, y citarlo no es usarlo.
        """
        sentencias = [linea.strip() for linea in FUENTE.splitlines()]
        assert not [s for s in sentencias if s.startswith("time.sleep(BACKEND_STARTUP_WAIT)")]

    def test_la_espera_larga_es_la_que_usa_el_camino_de_arranque(self):
        assert FUENTE.count("wait_for_backend(") >= 3
