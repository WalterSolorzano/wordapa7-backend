import sys
from pathlib import Path

import pytest
import tempfile
import os
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(autouse=True)
def config_temporal(tmp_path, monkeypatch):
    import modules.proyecto_manager as pm
    monkeypatch.setattr(pm, 'CONFIG_FILE', tmp_path / 'config.json')
    yield


def test_configurar_raiz_crea_carpeta(tmp_path):
    from modules.proyecto_manager import configurar_raiz
    ruta = str(tmp_path / 'WordAPA7')
    resultado = configurar_raiz(ruta)
    assert Path(ruta).is_dir()
    assert resultado['creada'] is True


def test_configurar_raiz_no_falla_si_ya_existe(tmp_path):
    from modules.proyecto_manager import configurar_raiz
    ruta = str(tmp_path / 'WordAPA7')
    configurar_raiz(ruta)
    resultado = configurar_raiz(ruta)
    assert resultado['creada'] is False


def test_crear_proyecto_mueve_archivo(tmp_path):
    from modules.proyecto_manager import configurar_raiz, crear_proyecto
    raiz = str(tmp_path / 'WordAPA7')
    configurar_raiz(raiz)
    archivo = tmp_path / 'Tesis.docx'
    archivo.write_bytes(b'fake docx')
    resultado = crear_proyecto('Tesis de Maestria', str(archivo))
    assert Path(resultado['archivo_destino']).exists()
    assert (Path(resultado['carpeta']) / 'Exportados').is_dir()


def test_crear_proyecto_409_si_destino_existe(tmp_path):
    from modules.proyecto_manager import configurar_raiz, crear_proyecto
    raiz = str(tmp_path / 'WordAPA7')
    configurar_raiz(raiz)
    archivo = tmp_path / 'Tesis.docx'
    archivo.write_bytes(b'fake docx')
    crear_proyecto('Tesis de Maestria', str(archivo))
    archivo.write_bytes(b'fake docx 2')
    with pytest.raises(FileExistsError):
        crear_proyecto('Tesis de Maestria', str(archivo))


def test_archivar_y_purgar(tmp_path):
    from modules.proyecto_manager import configurar_raiz, crear_proyecto, archivar_version, purgar_papelera
    import modules.proyecto_manager as pm
    raiz = str(tmp_path / 'WordAPA7')
    configurar_raiz(raiz)
    archivo = tmp_path / 'Tesis.docx'
    archivo.write_bytes(b'fake')
    resultado = crear_proyecto('Tesis', str(archivo))
    archivar_version(resultado['proyecto_id'], 'Tesis.docx')
    config = pm._leer_config()
    config['archivados'][0]['fecha'] = (datetime.now() - timedelta(days=31)).isoformat()
    pm._guardar_config(config)
    purga = purgar_papelera()
    assert purga['eliminados'] == 1


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
