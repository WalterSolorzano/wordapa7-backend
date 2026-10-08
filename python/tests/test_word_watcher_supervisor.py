"""Tests del supervisor del nucleo en word_watcher.py (bug crash-loop al boot)."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import word_watcher as ww


class TestBackoff:
    def test_delays_grow_and_cap(self):
        assert ww.SUPERVISOR_DELAYS[0] == 10
        assert ww.SUPERVISOR_DELAYS[1] == 30
        assert ww.SUPERVISOR_DELAYS[2] == 60

    def test_delay_for_attempt_caps_at_last(self):
        assert ww.delay_for_attempt(0) == 10
        assert ww.delay_for_attempt(5) == 60

    def test_failed_restart_increments_backoff(self):
        """Un reinicio fallido NO debe resetear el backoff (fin del 'intento 1' eterno)."""
        st = ww.SupervisorState()
        st.note_spawn_failed()
        st.note_spawn_failed()
        assert st.attempt == 2

    def test_healthy_resets_backoff(self):
        st = ww.SupervisorState()
        st.attempt = 3
        st.note_healthy()
        assert st.attempt == 0


class TestAdoption:
    def test_adopt_when_port_healthy(self):
        """Si algo ya responde en :8742, el supervisor NO debe spawnear otro backend."""
        st = ww.SupervisorState()
        action = ww.decide_supervisor_action(port_healthy=True, our_proc=None)
        assert action == "adopt"

    def test_respawn_only_if_nothing_healthy(self):
        action = ww.decide_supervisor_action(port_healthy=False, our_proc=None)
        assert action == "spawn"

    def test_keep_untracked_proc_out_of_state(self):
        """Proc muerto se descarta; no se reusa."""
        st = ww.SupervisorState()
        st.our_proc = None
        assert st.live_proc() is None


class TestChildLog:
    def test_child_streams_go_to_file_not_devnull(self):
        """Los hijos deben loguear a archivo para diagnosticar binds fallidos."""
        p = ww.child_log_file()
        assert str(p).endswith("backend-child.log")
