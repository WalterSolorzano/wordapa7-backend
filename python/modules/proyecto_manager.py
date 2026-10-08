import os
import json
import uuid
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

CONFIG_FILE = Path(os.environ.get('APPDATA', Path.home())) / 'WordAPA7' / 'wordapa7_config.json'
DIAS_RETENCION = 30


def _leer_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {}


def _guardar_config(config: dict) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')


def configurar_raiz(ruta: str) -> dict:
    path = Path(ruta)
    creada = not path.exists()
    path.mkdir(parents=True, exist_ok=True)
    config = _leer_config()
    config['raiz_proyectos'] = str(path)
    _guardar_config(config)
    return {'ruta': str(path), 'creada': creada}


def _raiz() -> Optional[Path]:
    config = _leer_config()
    raiz = config.get('raiz_proyectos')
    return Path(raiz) if raiz else None


def crear_proyecto(nombre: str, archivo_origen: str) -> dict:
    raiz = _raiz()
    if not raiz:
        raise ValueError('raiz_proyectos no configurada')
    carpeta = raiz / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / 'Exportados').mkdir(exist_ok=True)
    origen = Path(archivo_origen)
    destino = carpeta / origen.name
    if destino.exists():
        raise FileExistsError(f'{destino} ya existe')
    shutil.copy2(str(origen), str(destino))
    proyecto_id = str(uuid.uuid4())
    config = _leer_config()
    proyectos = config.get('proyectos', {})
    proyectos[proyecto_id] = {
        'nombre': nombre,
        'carpeta': str(carpeta),
        'creado_en': datetime.now().isoformat(),
    }
    config['proyectos'] = proyectos
    _guardar_config(config)
    return {
        'proyecto_id': proyecto_id,
        'carpeta': str(carpeta),
        'archivo_destino': str(destino),
    }


def agregar_version(proyecto_id: str, archivo_origen: str) -> dict:
    config = _leer_config()
    proyecto = config.get('proyectos', {}).get(proyecto_id)
    if not proyecto:
        raise KeyError(f'Proyecto {proyecto_id} no encontrado')
    carpeta = Path(proyecto['carpeta'])
    origen = Path(archivo_origen)
    destino = carpeta / origen.name
    if destino.exists():
        raise FileExistsError(f'{destino} ya existe')
    shutil.copy2(str(origen), str(destino))
    return {'archivo_destino': str(destino)}


def archivar_version(proyecto_id: str, archivo: str) -> dict:
    raiz = _raiz()
    config = _leer_config()
    proyecto = config.get('proyectos', {}).get(proyecto_id)
    if not raiz or not proyecto:
        raise KeyError('Proyecto no encontrado')
    origen = Path(proyecto['carpeta']) / archivo
    papelera = raiz / '_Papelera' / proyecto_id
    papelera.mkdir(parents=True, exist_ok=True)
    destino = papelera / archivo
    shutil.move(str(origen), str(destino))
    archivados = config.get('archivados', [])
    archivados.append({'archivo': str(destino), 'fecha': datetime.now().isoformat()})
    config['archivados'] = archivados
    _guardar_config(config)
    return {'movido_a': str(destino)}


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


def purgar_papelera() -> dict:
    config = _leer_config()
    archivados = config.get('archivados', [])
    limite = datetime.now() - timedelta(days=DIAS_RETENCION)
    eliminados = 0
    restantes = []
    for item in archivados:
        fecha = datetime.fromisoformat(item['fecha'])
        if fecha < limite:
            try:
                Path(item['archivo']).unlink(missing_ok=True)
                eliminados += 1
            except Exception:
                restantes.append(item)
        else:
            restantes.append(item)
    config['archivados'] = restantes
    _guardar_config(config)
    return {'eliminados': eliminados}
