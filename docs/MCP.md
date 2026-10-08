# Servidor MCP de WordAPA7 y CLI sin tokens

## Para qué sirve

El servidor MCP `wordapa7-content` permite que un asistente de IA (Claude Desktop, OpenCode, Cursor o cualquier cliente compatible con el protocolo MCP) genere documentos `.docx` formateados a normas APA 7 directamente desde una conversación. El cliente invoca las herramientas del servidor; el servidor ejecuta el mismo motor de contenido que usa la aplicación (portada, cuerpo, tablas, diagramas, referencias) y devuelve la ruta del archivo emitido.

El CLI sin tokens ofrece la misma capacidad por línea de comandos, sin red ni claves de API, ideal para CI, scripts o verificación manual.

## Prerrequisitos

- Python 3.11 o superior.
- Repositorio de WordAPA7 clonado en disco.
- Paquete `mcp` instalado en el entorno de Python que ejecutará el servidor. Ya está declarado en `requirements.txt` y **viene incluido en el runtime embebido del instalador**; si trabajas desde el código fuente, instálalo con:

  ```bash
  pip install mcp
  ```

  Si falta, `python/mcp_server.py` lanza `RuntimeError: MCP no instalado`.
- Microsoft Word **no** es obligatorio: el servidor y el CLI aceptan `--no-com` / `try_com=False` para emitir sin COM.
- El módulo importa `config` (`import config`) y usa `config.STORAGE_DIR`, por lo que el directorio `python/` del repositorio debe estar en `PYTHONPATH` (o ser el directorio de trabajo) al ejecutar el servidor.

## Registro en un cliente MCP

Copia el contenido de `mcp.example.json` (raíz del repositorio) dentro de la configuración de tu cliente. Ejemplo (ajusta las rutas absolutas a tu clon):

```json
{
  "mcpServers": {
    "wordapa7-content": {
      "command": "python",
      "args": ["C:/ruta/al/repo/python/mcp_server.py"],
      "env": {
        "PYTHONPATH": "C:/ruta/al/repo/python"
      }
    }
  }
}
```

Notas de registro:

- `command` puede ser `python` o la ruta absoluta a tu intérprete (`python.exe` en Windows).
- `args` apunta al archivo del servidor con ruta absoluta (así el cliente no depende del directorio de trabajo).
- `env.PYTHONPATH` **debe** apuntar al directorio `python/` del repositorio: sin él, los imports `config`, `content.*` y `diagrams.*` fallan.
- El transporte es stdio (el cliente lanza el proceso y habla JSON-RPC por la entrada/salida estándar).

### App instalada (Windows)

Si instalaste WordAPA7 con el instalador, **no necesitas clonar el repositorio ni instalar `mcp` a mano**: el instalador bundlea el runtime de Python con `mcp_server.py` y la dependencia `mcp`, y además escribe una configuración lista en:

```
%APPDATA%\WordAPA7\mcp.json
```

Esa configuración apunta a:

- `command`: `%LOCALAPPDATA%\Programs\WordAPA7\resources\python-runtime\python.exe`
- `args`: `...\resources\python-runtime\python\mcp_server.py`
- `env.PYTHONPATH`: `...\resources\python-runtime\python`

Copia ese archivo (o su entrada `mcpServers`) dentro de tu cliente MCP. El instalador la regenera en cada instalación y la elimina al desinstalar.

## Herramientas expuestas

El servidor FastMCP (`FastMCP("wordapa7-content")`) registra cinco herramientas:

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `tool_content_schema` | ninguno | Dict con el esquema del payload (`schema`), los tipos de diagrama soportados (`diagram_kinds`: flow, tree, net) y los estilos de figura (`figure_styles`: standard, sidebar, scientific, corner, full_width, multipanel). |
| `tool_build_document` | `payload: dict` | Construye **y emite** el `.docx`. Devuelve `{session_id, elements, warnings, path}` donde `path` es la ruta final del archivo (por defecto bajo `STORAGE_DIR/sessions/<session_id>/`). |
| `tool_build_from_files` | `docx_path?`, `xlsx_path?`, `cover_mode?`, `title?`, `out_path?` | One-shot: toma rutas de `.docx`/`.xlsx` existentes y devuelve el `.docx` APA 7 formateado. |
| `tool_render_diagram` | `kind: str`, `dsl: str` | Devuelve los bytes PNG de un diagrama renderizado (para preview). |
| `tool_analyze_rubric` | `rubric_path: str`, `docx_path: str` | Traductor de Rúbrica: lee una rúbrica (`.docx`/`.xlsx`) y un documento, y devuelve un informe JSON de cumplimiento (`criterio -> peso -> puntaje -> evidencia`). Determinista, sin IA (0 tokens). |

Flujo típico de un agente: `tool_content_schema` para conocer el formato, `tool_build_document` para emitir el documento, `tool_build_from_files` para un Word/Excel existente, `tool_analyze_rubric` para medir el cumplimiento de una rúbrica y `tool_render_diagram` si necesita previsualizar un diagrama.

## CLI sin tokens

El entrypoint real del CLI es el paquete `content` (no existe ningún módulo `content.build`):

```bash
cd python
python -m content <payload.json> -o <salida.docx> [--no-com]
```

Ejemplo para este repositorio (desde la raíz):

```bash
cd python
python -m content ../mi_payload.json -o ../salida.docx --no-com
```

O bien desde la raíz del repositorio, añadiendo `PYTHONPATH`:

- Windows (PowerShell): `$env:PYTHONPATH="python"; python -m content mi_payload.json -o salida.docx --no-com`
- Linux/macOS: `PYTHONPATH=python python -m content mi_payload.json -o salida.docx --no-com`

Opciones y códigos de salida (definidos en `python/content/__main__.py`):

- `payload` (posicional): ruta al JSON de contenido. Si no existe, el proceso sale con código **2**.
- `-o` / `--output` (obligatorio): ruta del `.docx` de salida.
- `--no-com`: no usa Word COM aunque esté disponible (emisión pura, útil en CI/headless).
- JSON inválido: código de salida **1**. Éxito: código **0**. En éxito imprime por stdout la ruta final del archivo.

No requiere claves de API ni conectividad: todo el formateo es local.

## Formato del payload

El payload es un JSON con esta forma (resumen de `SCHEMA_HINT` en `python/mcp_server.py`):

```json
{
  "meta": {
    "title": "Título del documento",
    "author": "Autor",
    "institution": "Universidad",
    "course": "Curso",
    "date": "2026-01-01",
    "use_original_cover": false,
    "cover_mode": ""
  },
  "content": [
    { "h1": "Introducción" },
    { "p": "Párrafo de texto con APA 7." },
    { "cite": "Apellido, A. A. (Año)." },
    { "bullets": ["Punto uno", "Punto dos"] },
    { "numbered": ["Primero", "Segundo"] },
    { "table": { "caption": "Tabla 1", "note": "", "headers": ["Col A"], "rows": [["1"]] } },
    { "diagram": { "kind": "flow", "dsl": "A > B", "caption": "Figura 1", "style": "standard" } },
    { "page_break": true }
  ],
  "references": ["Apellido, A. A. (Año). Título. Editorial."]
}
```

- `cover_mode`: vacío decide por `use_original_cover`; `generate_uni_cover` = portada UNI; `generate_apa7_template` = portada APA sintética.
- DSL de diagramas: `flow` usa `A > B` y `A >|etiqueta| B`; `tree` usa `Raíz` luego `- Hijo` y `-- Nieto`; `net` usa `A -- B` (no dirigido) y `A -> B` (dirigido).

## Notas

- El servidor es **lazy**: no inicializa Word COM al arrancar; solo el camino de emisión lo usa, y con `--no-com` / `try_com=False` se omite por completo.
- Para mantener la dependencia opcional, instala `mcp` solo donde vayas a usar el servidor; el resto de la app no lo necesita.
- Documentación relacionada: guía rápida en `INSTALACION-RAPIDA.md`; arquitectura en `README.md`.
