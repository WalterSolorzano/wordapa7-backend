"""
WordAPA7 — AI Live Document Editor Engine (Action DSL)
Traduce instrucciones conversacionales en lenguaje natural a mutaciones estructuradas
deterministas sobre el DocumentModel, optimizado para modelos livianos y gratuitos.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional
from models import DocumentModel, ElementModel, ElementType
from modules.ai_client import execute_with_specialty

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres el Copiloto Editorial experto en Normas APA 7ma edición de WordAPA7.
Tu misión es asistir al usuario editando y mejorando su documento académico en vivo.

REGLAS DE SALIDA:
Debes responder SIEMPRE en formato JSON válido estricto, sin texto antes ni después del bloque JSON.

ESTRUCTURA DEL JSON:
{
  "reply": "Explicación breve y amigable en español de lo que hiciste o tu respuesta a la consulta.",
  "actions": [
    {
      "type": "update_text",
      "element_id": "elem_id_aqui",
      "text": "Nuevo texto corregido o reescrito"
    },
    {
      "type": "set_type",
      "element_id": "elem_id_aqui",
      "element_type": "paragraph" | "heading" | "block_quote" | "bullet" | "numbered_list",
      "level": 1
    },
    {
      "type": "insert_citation",
      "element_id": "elem_id_aqui",
      "citation": "(González, 2021)"
    },
    {
      "type": "add_reference",
      "reference": "González, P. (2021). Entornos virtuales de aprendizaje. Fondo Editorial."
    },
    {
      "type": "set_caption",
      "element_id": "elem_id_aqui",
      "caption": "Título breve en cursiva"
    },
    {
      "type": "set_note",
      "element_id": "elem_id_aqui",
      "note": "Nota. Elaboración propia a partir de los datos."
    },
    {
      "type": "add_diagram",
      "element_id": "elem_id_aqui",
      "diagram": {
        "kind": "flow" | "tree" | "net",
        "dsl": "A > B\\nB >|sí| C",
        "caption": "Título breve de la figura",
        "note": "Nota. Elaboración propia.",
        "style": "standard"
      }
    }
  ]
}

DIAGRAMAS: cuando el usuario pida un diagrama, flujo, árbol, red o esquema, usa la acción
"add_diagram" con el DSL compacto (una regla por línea):
- flow: "A > B" (flecha) y "A >|etiqueta| B" (flecha etiquetada).
- tree: primera línea la raíz, luego "- Hijo", "-- Nieto" (guiones = profundidad).
- net: "A -- B" (no dirigido) y "A -> B" (dirigido).
Nunca dibujes el diagrama tú: solo describe el DSL y el backend lo renderiza.

Si el usuario solo hace una pregunta teórica de APA 7 o no solicita cambios en el texto, el array "actions" debe estar vacío [].
Cuando modifiques un texto, conserva rigurosamente las citas existentes a menos que el usuario pida explícitamente cambiarlas.
"""

def extract_json_payload(raw: str) -> Dict[str, Any]:
    """Extrae y parsea el payload JSON incluso si el modelo incluye delimitadores markdown."""
    text = raw.strip()
    # Intentar parseo directo
    try:
        return json.loads(text)
    except Exception:
        pass

    # Buscar bloque de código ```json ... ```
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # Buscar llaves balanceadas
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    return {
        "reply": text.replace("```json", "").replace("```", "").strip(),
        "actions": []
    }

async def process_live_document_chat(
    document: DocumentModel,
    user_instruction: str,
    selected_element_id: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    api_key: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Procesa una petición conversacional del usuario y retorna la respuesta con las acciones sugeridas."""
    # Construir resumen del contexto del documento
    context_lines = []
    selected_elem_obj = None

    for elem in document.elements:
        if elem.type in ("page_break", "empty"):
            continue
        is_selected = (elem.id == selected_element_id)
        prefix = "-> [SELECCIONADO] " if is_selected else ""
        text_preview = (elem.text or "").strip()
        if len(text_preview) > 140:
            text_preview = text_preview[:137] + "..."
        context_lines.append(f"{prefix}[ID:{elem.id}] [{elem.type}] {text_preview}")
        if is_selected:
            selected_elem_obj = elem

    context_str = "\n".join(context_lines[:60]) # Primeros elementos relevantes

    selected_detail = ""
    if selected_elem_obj:
        selected_detail = (
            f"\nELEMENTO ACTUALMENTE SELECCIONADO POR EL USUARIO:\n"
            f"ID: {selected_elem_obj.id}\n"
            f"Tipo: {selected_elem_obj.type}\n"
            f"Texto completo:\n{selected_elem_obj.text}\n"
        )

    history_str = ""
    if history:
        for turn in history[-4:]:
            role = "Usuario" if turn.get("role") == "user" else "Copiloto"
            history_str += f"{role}: {turn.get('content', '')}\n"

    prompt = (
        f"ESTRUCTURA DEL DOCUMENTO:\n{context_str}\n"
        f"{selected_detail}\n"
        f"HISTORIAL RECIENTE:\n{history_str}\n"
        f"INSTRUCCIÓN DEL USUARIO:\n{user_instruction}\n\n"
        f"Responde con el JSON estricto requerido."
    )

    try:
        raw_response = await execute_with_specialty(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            specialty="REASONING",
            api_key=api_key,
            provider_id=provider_id,
            temperature=0.2,
            max_tokens=1500,
            use_cache=False,
        )
        parsed = extract_json_payload(raw_response)

        # Enriquecimiento Ghostwriter con Crossref: si se insertó una cita y no hay add_reference
        from modules.referencias_module import search_crossref_by_author_year
        actions = parsed.get("actions", [])
        has_add_ref = any(a.get("type") == "add_reference" for a in actions)

        if not has_add_ref:
            for act in actions:
                if act.get("type") == "insert_citation" and act.get("citation"):
                    cit = act["citation"]
                    # Extraer autor y año: ej "(Hernández et al., 2018)" o "(Kahneman, 2011)"
                    match = re.search(r"\(?([A-Za-zÁÉÍÓÚáéíóúñÑ\-]+)(?:\s+et\s+al\.?)?,?\s*(\d{4})\)?", cit)
                    if match:
                        author_q = match.group(1)
                        year_q = match.group(2)
                        try:
                            cross_res = await search_crossref_by_author_year([author_q], year_q)
                            if cross_res and cross_res.get("formatted_apa"):
                                actions.append({
                                    "type": "add_reference",
                                    "reference": cross_res["formatted_apa"]
                                })
                        except Exception:
                            pass

        from config import STORAGE_DIR
        _resolve_diagram_actions(document, parsed, STORAGE_DIR)
        return parsed
    except Exception as e:
        logger.warning(f"[LiveChat] Motor LLM externo no disponible ({e}). Activando fallback editorial determinista.")
        return _deterministic_chat_fallback(document, user_instruction, selected_element_id)


def _resolve_diagram_actions(
    document: DocumentModel,
    result: Dict[str, Any],
    storage_dir,
) -> Dict[str, Any]:
    """Resuelve las acciones `add_diagram` del LLM: renderiza el DSL a PNG en
    `sessions/<sid>/images/` y reemplaza la acción por una `add_diagram` con la
    imagen ya lista (mismos campos que `ImageModel`). La numeración continúa la
    serie de figuras existente (`captions.scan_existing`), nunca reinicia."""
    from diagrams.render import render_diagram
    from modules.captions import scan_existing

    texts: List[str] = []
    for e in document.elements:
        if e.text:
            texts.append(e.text)
        if e.image_info and e.image_info.caption:
            texts.append(e.image_info.caption)
        if e.table_info and e.table_info.caption:
            texts.append(e.table_info.caption)
    figure_number = scan_existing(texts)["max_figure"] + 1

    for action in result.get("actions", []):
        if action.get("type") != "add_diagram":
            continue
        spec = action.get("diagram") or {}
        rendered = render_diagram(spec.get("kind", "flow"), spec.get("dsl", ""))
        filename = f"diagrama_{figure_number}_{document.session_id[:8]}.png"
        images_dir = storage_dir / "sessions" / document.session_id / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        (images_dir / filename).write_bytes(rendered.png)
        action.pop("diagram", None)
        action["image"] = {
            "file_path": str(images_dir / filename),
            "filename": filename,
            "relative_url": f"/api/images/{document.session_id}/{filename}",
            "caption": spec.get("caption", ""),
            "note": spec.get("note"),
            "figure_number": figure_number,
            "design_style": spec.get("style", "standard"),
            "width_cm": spec.get("width_cm", 12.0),
            "height_cm": spec.get("height_cm", 8.0),
        }
        figure_number += 1
    return result


def _deterministic_chat_fallback(
    document: DocumentModel,
    user_instruction: str,
    selected_element_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fallback editorial determinista para cuando no hay conexión a internet,
    los proveedores de LLM no tienen clave configurada o hay errores de timeout/red.
    Ejecuta transformaciones APA 7 confiables basadas en reglas locales.
    """
    instruction_lower = user_instruction.lower()
    actions: List[Dict[str, Any]] = []

    # 0. Petición de diagrama: sin LLM no hay DSL que interpretar.
    if any(w in instruction_lower for w in ["diagrama", "esquema", "flujo", "organigrama", "árbol", "arbol", "mermaid", "flowchart", "mindmap"]):
        return {
            "reply": (
                "Para insertar un diagrama necesito el lenguaje compacto (DSL). "
                "Por ejemplo: 'flow\\nInicio > Proceso > Fin' o 'tree\\nRaíz\\n- Hijo'. "
                "Pásame el DSL y el tipo (flow, tree o net)."
            ),
            "actions": [],
        }

    # 1. Rotulación de tablas / figuras
    if any(w in instruction_lower for w in ["rotular", "caption", "tabla", "figura"]):
        t_count = 1
        f_count = 1
        for elem in document.elements:
            if elem.type == ElementType.TABLE and elem.table_info:
                if not elem.table_info.caption:
                    actions.append({
                        "type": "set_caption",
                        "element_id": elem.id,
                        "caption": f"Resumen y datos analizados de la tabla {t_count}"
                    })
                    if not elem.table_info.note:
                        actions.append({
                            "type": "set_note",
                            "element_id": elem.id,
                            "note": "Nota. Elaboración propia a partir de los datos recopilados."
                        })
                t_count += 1
            elif elem.type == ElementType.IMAGE and elem.image_info and not elem.is_cover_section:
                if not elem.image_info.caption:
                    actions.append({
                        "type": "set_caption",
                        "element_id": elem.id,
                        "caption": f"Diagrama e ilustración visual de la figura {f_count}"
                    })
                    if not elem.image_info.note:
                        actions.append({
                            "type": "set_note",
                            "element_id": elem.id,
                            "note": "Nota. Adaptado para fines ilustrativos según normas APA 7."
                        })
                f_count += 1
        return {
            "reply": f"He generado leyendas y notas académicas formales para los elementos del documento según los estándares APA 7ma edición.",
            "actions": actions
        }

    # 2. Pulir redacción académica / pronombres ambiguos / primera persona
    if any(w in instruction_lower for w in ["pulir", "redacción", "redaccion", "estilo", "informal", "ambiguo", "primera persona"]):
        from modules.proactive_auditor import audit_text_proactive
        modified = 0
        for elem in document.elements:
            if elem.type in (ElementType.PARAGRAPH, ElementType.BLOCK_QUOTE) and elem.text:
                findings = audit_text_proactive(elem.text, elem.id)
                new_text = elem.text
                for f in findings:
                    if f.suggestion and f.pattern in new_text:
                        new_text = new_text.replace(f.pattern, f.suggestion)
                if new_text != elem.text:
                    actions.append({
                        "type": "update_text",
                        "element_id": elem.id,
                        "text": new_text
                    })
                    modified += 1
                if modified >= 5:
                    break
        if actions:
            return {
                "reply": f"Se aplicaron mejoras de estilo formal y desambiguación en {len(actions)} párrafos del documento siguiendo criterios de redacción APA 7.",
                "actions": actions
            }
        else:
            return {
                "reply": "No encontré expresiones informales o errores críticos pendientes de pulir en los párrafos actuales.",
                "actions": []
            }

    # 3. Revisar jerarquía de títulos
    if any(w in instruction_lower for w in ["jerarquía", "jerarquia", "título", "titulo", "h1", "h2", "h3"]):
        from modules.phase_scope import PORTADA_KEY, match_phase_exact

        # Un H1 de esa fase ya presente: promover otro la duplicaría. Antes se
        # comparaba el título contra una lista de SUBCADENAS y se promovía
        # "Resultados de la encuesta" que el autor anidó bajo "Método" a
        # propósito, aplanando la jerarquía que él mismo había construido.
        # Ahora solo se promueve un título que ES el nombre de la fase: un
        # calificador ("de la encuesta") es la señal de que el autor quiso
        # decir algo concreto, no la fase genérica.
        fases = {
            match_phase_exact(e.text or "") for e in document.elements
            if e.type == ElementType.HEADING and (e.heading_level or 1) == 1
        }
        fases.discard(None)

        for elem in document.elements:
            if elem.type != ElementType.HEADING or elem.is_cover_section:
                continue
            if (elem.heading_level or 1) == 1:
                continue
            fase = match_phase_exact(elem.text or "")
            if fase is None or fase in fases:
                continue
            # La portada es zona protegida: `use_original_cover` no la muta y
            # `computePages` la trata como bloque indivisible (AGENTS.md §1).
            if fase == PORTADA_KEY:
                continue
            fases.add(fase)
            actions.append({"type": "set_type", "element_id": elem.id,
                            "element_type": "heading", "level": 1})
        return {
            "reply": (
                f"Se ajustaron {len(actions)} encabezados principales al Nivel 1 "
                f"centrado según APA 7."
                if actions else
                "La jerarquía de títulos ya respeta los Niveles 1 de APA 7; no hubo ajustes."
            ),
            "actions": actions,
        }

    # 4. Respuesta general instructiva APA 7
    return {
        "reply": (
            "El motor de reglas editoriales APA 7 procesó tu consulta. "
            "Para explicaciones conversacionales avanzadas con modelos generativos (NVIDIA NIM, Groq, Cerebras, OpenRouter), "
            "puedes vincular una clave de API gratuita en la sección de Configuraciones."
        ),
        "actions": []
    }

