"""
WordAPA7 — Auditor Estructural (Engine V3)

Dos capas de auditoría:

1. Heurística local (audit_document_heuristic) — cero latencia, cero API key:
   - Salto de niveles de heading (H1 → H3 sin H2)
   - Running head > 50 caracteres
   - Abstract fuera del rango APA 7 (150-250 palabras)
   - Headings numerados (1., 2., 2.1.) — no permitidos en APA 7
   - Referencias antes del cuerpo del documento
   - Figuras/tablas sin caption
   - Imágenes que desbordan la página (overflow/bleed) — altura > página útil
   - Citas huérfanas (en texto pero sin referencia en bibliografía)

2. LLM global (audit_document_structure) — enriquece con IA cuando hay API key.
   Si no hay API key, retorna el resultado heurístico en lugar de un error vacío.

Uso:
    from modules.doc_auditor import audit_document_structure
    result = await audit_document_structure(doc_model, api_key)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class DocAuditResult(BaseModel):
    """Resultado estructurado de la auditoría global del documento."""

    heading_issues: List[str] = Field(default_factory=list)
    missing_sections: List[str] = Field(default_factory=list)
    reference_issues: List[str] = Field(default_factory=list)
    format_suggestions: List[str] = Field(default_factory=list)
    overall_assessment: str = "needs_review"
    summary: str = ""

    @property
    def is_clean(self) -> bool:
        return self.overall_assessment == "good" and not any(
            [self.heading_issues, self.missing_sections, self.reference_issues]
        )


# ── AUDITOR HEURÍSTICO LOCAL ──────────────────────────────────────────────────

def audit_document_heuristic(doc_model: Any) -> DocAuditResult:
    """
    Audita la estructura del documento con checks puramente locales, sin LLM.

    Retorna un DocAuditResult parcial con los problemas detectados por heurística.
    Es el primer nivel siempre ejecutado, independientemente de la API key.

    Checks incluidos:
    - Salto de niveles de heading (H1 → H3 sin H2 intermedio) — APA 7 §2.27
    - Running head > 50 caracteres — APA 7 §2.8
    - Abstract fuera de rango 150-250 palabras — APA 7 §3.3
    - Headings numerados (1., 2., 2.1.) — no APA 7 — APA 7 §2.27
    - Referencias antes del cuerpo — APA 7 §2.4
    - Figuras/tablas sin caption — APA 7 §7.10
    - Imágenes que desbordan la página (overflow/bleed) — APA 7 §7.22
    - Citas huérfanas (en texto sin referencia) — APA 7 §8.4
    """
    try:
        from models import ElementType
    except ImportError:
        ElementType = None

    heading_issues: List[str] = []
    missing_sections: List[str] = []
    reference_issues: List[str] = []
    format_suggestions: List[str] = []

    elements = getattr(doc_model, 'elements', []) or []

    # ── 1. Jerarquía de headings: salto de niveles ────────────────────────────
    heading_elements = []
    for elem in elements:
        t = str(getattr(elem, 'type', '') or '').lower()
        if hasattr(elem, 'type') and hasattr(elem.type, 'value'):
            t = str(elem.type.value).lower()
        if t in ('heading', 'head'):
            lvl = getattr(elem, 'heading_level', 1) or 1
            text = (getattr(elem, 'text', '') or '').strip()
            heading_elements.append((lvl, text))

    prev_level = 0
    for lvl, text in heading_elements:
        if prev_level > 0 and lvl > prev_level + 1:
            heading_issues.append(
                f"Salto de nivel de heading: H{prev_level} → H{lvl} "
                f"(falta H{prev_level + 1} antes de '{text[:60]}')"
            )
        # Heading numerado: "1.", "2.", "2.1." al inicio
        if re.match(r'^\d+(\.\d+)*\.?\s', text):
            heading_issues.append(
                f"Heading numerado no permitido en APA 7: '{text[:60]}' "
                "(los títulos APA no llevan numeración)"
            )
        prev_level = lvl

    # ── 2. Running head > 50 caracteres ──────────────────────────────────────
    portada = getattr(doc_model, 'portada', None) or {}
    if isinstance(portada, dict):
        running_head = portada.get('running_head', '') or portada.get('title', '') or ''
    else:
        running_head = (
            getattr(portada, 'running_head', '') or
            getattr(portada, 'title', '') or ''
        )
    if running_head and len(running_head) > 50:
        format_suggestions.append(
            f"Running head demasiado largo ({len(running_head)} caracteres): "
            "APA 7 §2.8 establece máximo 50 caracteres en mayúsculas"
        )

    # ── 3. Abstract: conteo de palabras ──────────────────────────────────────
    abstract_text = ''
    for elem in elements:
        t = str(getattr(elem, 'type', '') or '').lower()
        if hasattr(elem, 'type') and hasattr(elem.type, 'value'):
            t = str(elem.type.value).lower()
        text = (getattr(elem, 'text', '') or '').strip()
        # Detectar abstract por tipo o por heading "Abstract" / "Resumen"
        if t == 'abstract':
            abstract_text += ' ' + text
        elif t in ('heading', 'head') and re.search(r'\b(abstract|resumen)\b', text.lower()):
            # El siguiente párrafo es el abstract — lo buscamos
            pass
    # También buscar bloque de texto que sigue a heading "Abstract"
    found_abstract_heading = False
    for elem in elements:
        t = str(getattr(elem, 'type', '') or '').lower()
        if hasattr(elem, 'type') and hasattr(elem.type, 'value'):
            t = str(elem.type.value).lower()
        text = (getattr(elem, 'text', '') or '').strip()
        if t in ('heading', 'head') and re.search(r'\b(abstract|resumen)\b', text.lower()):
            found_abstract_heading = True
            continue
        if found_abstract_heading and t in ('paragraph', 'para'):
            abstract_text = text
            found_abstract_heading = False

    if abstract_text.strip():
        word_count = len(abstract_text.split())
        if word_count < 150:
            format_suggestions.append(
                f"Abstract demasiado corto ({word_count} palabras): "
                "APA 7 §3.3 establece 150-250 palabras"
            )
        elif word_count > 250:
            format_suggestions.append(
                f"Abstract demasiado largo ({word_count} palabras): "
                "APA 7 §3.3 establece 150-250 palabras"
            )

    # ── 4. Orden de secciones: Referencias antes del cuerpo ──────────────────
    refs_idx = None
    body_last_idx = None
    for i, elem in enumerate(elements):
        t = str(getattr(elem, 'type', '') or '').lower()
        if hasattr(elem, 'type') and hasattr(elem.type, 'value'):
            t = str(elem.type.value).lower()
        text = (getattr(elem, 'text', '') or '').strip().lower()
        if t in ('heading', 'head') and re.search(r'\b(referencias|references|bibliograf[ií]a)\b', text):
            if refs_idx is None:
                refs_idx = i
        elif t in ('paragraph', 'bullet', 'numbered', 'block_quote'):
            body_last_idx = i

    if refs_idx is not None and body_last_idx is not None and refs_idx < body_last_idx:
        reference_issues.append(
            "La sección de Referencias aparece antes de párrafos del cuerpo: "
            "APA 7 §2.4 exige Referencias al final del documento"
        )

    # ── 5. Figuras y tablas sin caption ──────────────────────────────────────
    figures_without_caption = 0
    tables_without_caption = 0
    for elem in elements:
        t = str(getattr(elem, 'type', '') or '').lower()
        if hasattr(elem, 'type') and hasattr(elem.type, 'value'):
            t = str(elem.type.value).lower()
        caption = (getattr(elem, 'caption', '') or '').strip()
        alt_text = (getattr(elem, 'alt_text', '') or '').strip()
        if t in ('image', 'figure', 'img') and not caption and not alt_text:
            figures_without_caption += 1
        elif t == 'table':
            title = (getattr(elem, 'title', '') or '').strip()
            if not caption and not title:
                tables_without_caption += 1

    if figures_without_caption > 0:
        format_suggestions.append(
            f"{figures_without_caption} figura(s) sin caption: "
            "APA 7 §7.22 requiere 'Figura N' + título breve bajo la imagen"
        )
    if tables_without_caption > 0:
        format_suggestions.append(
            f"{tables_without_caption} tabla(s) sin título: "
            "APA 7 §7.10 requiere 'Tabla N' + título breve sobre la tabla"
        )

    # ── 5b. Imágenes que desbordan la página (overflow / bleed) ───────────────
    # APA 7 (§7.22) exige que cada figura entre completa en una sola página. En
    # A4 con márgenes estándar (~2.54 cm) la altura útil ronda los 24 cm; si una
    # imagen la supera, Word la corta o la empuja a la página siguiente y rompe
    # el diseño. Se advierte al usuario para que la reduzca o la divida. Se
    # omite el logotipo/elementos de portada (is_cover_section) porque esos no
    # siguen el flujo del cuerpo.
    PAGE_USABLE_H_CM = 24.0
    for elem in elements:
        t = str(getattr(elem, 'type', '') or '').lower()
        if hasattr(elem, 'type') and hasattr(elem.type, 'value'):
            t = str(elem.type.value).lower()
        if t != 'image':
            continue
        if getattr(elem, 'is_cover_section', False):
            continue
        info = getattr(elem, 'image_info', None)
        if not info:
            continue
        h_cm = getattr(info, 'height_cm', 0) or 0
        if h_cm > PAGE_USABLE_H_CM:
            format_suggestions.append(
                f"La figura mide {h_cm} cm de alto y no cabe en una pagina "
                f"(max ~{PAGE_USABLE_H_CM:.0f} cm). Reduzcala o divídala."
            )

    # ── 5c. Anclaje bidireccional en el texto (Cross-Linking de Figuras y Tablas) ──
    # APA 7 (§7.5 y §7.24) requiere que toda figura y tabla sea llamada en el texto.
    full_body_text = " ".join([
        (getattr(e, 'text', '') or '') for e in elements
        if str(getattr(e, 'type', '')).lower() in ('paragraph', 'bullet', 'numbered_list', 'block_quote')
    ]).lower()

    for elem in elements:
        t = str(getattr(elem, 'type', '') or '').lower()
        if t == 'table':
            num = getattr(getattr(elem, 'table_info', None), 'table_number', None)
            if num and not re.search(rf'\btabla\s+{num}\b', full_body_text):
                format_suggestions.append(
                    f"La Tabla {num} no está mencionada en el texto: "
                    f"APA 7 §7.5 requiere hacer referencia a cada tabla en el cuerpo del documento"
                )
        elif t == 'image' and not getattr(elem, 'is_cover_section', False):
            num = getattr(getattr(elem, 'image_info', None), 'figure_number', None)
            if num and not re.search(rf'\bfigura\s+{num}\b', full_body_text):
                format_suggestions.append(
                    f"La Figura {num} no está mencionada en el texto: "
                    f"APA 7 §7.24 requiere hacer referencia a cada figura en el cuerpo del documento"
                )

    # ── 6. Citas huérfanas (en texto sin referencia en bibliografía) ──────────
    citas = getattr(doc_model, 'citas_intext', None) or []
    refs = getattr(doc_model, 'referencias', None) or []
    if isinstance(citas, list) and citas and isinstance(refs, list) and refs:
        ref_authors_years: set = set()
        for r in refs:
            if isinstance(r, dict):
                authors = r.get('authors', []) or []
                year = str(r.get('year', '') or '')
            else:
                authors = getattr(r, 'authors', []) or []
                year = str(getattr(r, 'year', '') or '')
            for author in authors[:1]:
                last = str(author).split(',')[0].split()[-1].lower() if author else ''
                if last:
                    ref_authors_years.add(f"{last}_{year}")

        orphan_citas = []
        for cita in citas[:20]:  # muestra las primeras 20
            if isinstance(cita, dict):
                author = str(cita.get('author', '') or '')
                year = str(cita.get('year', '') or '')
            else:
                author = str(getattr(cita, 'author', '') or '')
                year = str(getattr(cita, 'year', '') or '')
            key = f"{author.split()[-1].lower()}_{year}" if author else ''
            if key and key not in ref_authors_years:
                orphan_citas.append(f"{author} ({year})")

        if orphan_citas:
            reference_issues.append(
                f"Citas en el texto sin referencia en bibliografía: "
                f"{', '.join(orphan_citas[:5])}"
                + (" y otras más" if len(orphan_citas) > 5 else "")
            )

    # ── 7. Referencias duplicadas ──────────────────────────────────────────────
    if isinstance(refs, list):
        duplicate_refs = []
        for r in refs:
            is_dup = r.get("is_duplicate") if isinstance(r, dict) else getattr(r, "is_duplicate", False)
            dup_cnt = r.get("duplicate_count", 1) if isinstance(r, dict) else getattr(r, "duplicate_count", 1)
            raw = r.get("raw_text", "") if isinstance(r, dict) else getattr(r, "raw_text", "")
            if is_dup or dup_cnt > 1:
                duplicate_refs.append(f"'{raw[:40]}...' (x{dup_cnt})")
        if duplicate_refs:
            reference_issues.append(
                f"Referencias duplicadas en la bibliografía: {', '.join(duplicate_refs[:3])}"
            )

    # ── Determinar evaluación general ─────────────────────────────────────────
    critical = bool(heading_issues or (len(reference_issues) > 1))
    if not heading_issues and not missing_sections and not reference_issues:
        overall = "good"
        summary = (
            "La estructura del documento cumple con los requisitos básicos de APA 7. "
            "Revisá el formato detallado (tipografía, márgenes, interlineado)."
        )
    elif critical:
        overall = "critical"
        summary = (
            "El documento tiene problemas estructurales que requieren corrección antes de entregar. "
            "Revisá la jerarquía de títulos y la consistencia de citas y referencias."
        )
    else:
        overall = "needs_review"
        summary = (
            "El documento tiene observaciones menores. "
            "Revisá las sugerencias de formato y la sección de referencias."
        )

    return DocAuditResult(
        heading_issues=heading_issues,
        missing_sections=missing_sections,
        reference_issues=reference_issues,
        format_suggestions=format_suggestions,
        overall_assessment=overall,
        summary=summary,
    )


def _build_structure_prompt(doc_model: Any) -> str:
    """Construye un resumen textual de la estructura del documento para el LLM."""
    from models import ElementType

    lines: List[str] = []

    # Element stats
    heading_count = 0
    heading_hierarchy: List[str] = []
    level_counts: Dict[int, int] = {}
    para_count = 0
    table_count = 0
    image_count = 0

    for elem in doc_model.elements:
        t = elem.type.value if hasattr(elem.type, 'value') else str(elem.type)
        t = str(t).lower()

        if t == 'heading' or t == 'head':
            lvl = elem.heading_level or 1
            level_counts[lvl] = level_counts.get(lvl, 0) + 1
            heading_count += 1
            text = (elem.text or "").strip()[:80]
            heading_hierarchy.append(f"  H{lvl}: {text}")
        elif t == 'table':
            table_count += 1
        elif t in ('image', 'figure', 'img'):
            image_count += 1
        elif t in ('paragraph', 'bullet', 'numbered', 'block_quote'):
            para_count += 1

    lines.append(f"Headings: {heading_count} total")
    for lvl in sorted(level_counts):
        lines.append(f"  H{lvl}: {level_counts[lvl]}")
    lines.append("Heading hierarchy (top-down):")
    lines.extend(heading_hierarchy[:60])  # limit to first 60

    lines.append(f"\nParagraphs: {para_count}")
    lines.append(f"Tables: {table_count}")
    lines.append(f"Figures/Images: {image_count}")

    # References and citations
    refs = getattr(doc_model, 'referencias', None) or []
    ref_count = len(refs) if isinstance(refs, list) else 0
    lines.append(f"\nReferences in bibliography: {ref_count}")
    if ref_count > 0 and isinstance(refs, list):
        for r in refs[:5]:
            authors = (r.get('authors') if isinstance(r, dict) else getattr(r, 'authors', [])) or []
            year = (r.get('year') if isinstance(r, dict) else getattr(r, 'year', '')) or ''
            title = (r.get('title') if isinstance(r, dict) else getattr(r, 'title', '')) or ''
            a_str = ", ".join(authors[:2])
            lines.append(f"  - {a_str} ({year}). {str(title)[:60]}")

    # Ghost / orphan counts (if available in the model's citation audit bits)
    citas = getattr(doc_model, 'citas_intext', None) or []
    if isinstance(citas, list) and citas:
        lines.append(f"\nIn-text citations found: {len(citas)}")

    # Cover info
    portada = getattr(doc_model, 'portada', None) or {}
    if portada:
        fields_found = []
        for f in ['title', 'author', 'institution', 'course', 'instructor']:
            if portada.get(f, ''):
                fields_found.append(f)
        lines.append(f"\nCover detected: {bool(portada.get('cover_com_detected') or portada.get('detected') or portada.get('body_start_paragraph_idx'))}")
        if fields_found:
            lines.append(f"Cover fields: {', '.join(fields_found)}")

    # Format profile
    rules = getattr(doc_model, 'apa_rules', None)
    if not rules:
        rules = getattr(doc_model, 'rules', None)
    if rules:
        lines.append(f"\nFormat: {getattr(rules, 'font_family', '?')} {getattr(rules, 'font_size_pt', '?')}pt, "
                      f"margins {getattr(rules, 'margins_cm', '?')}cm, "
                      f"spacing {getattr(rules, 'line_spacing', '?')}")

    return "\n".join(lines)


_AUDIT_SYSTEM_PROMPT = (
    "You are an APA 7th edition expert auditor. You analyze document STRUCTURE, not content. "
    "Return ONLY a valid JSON object (no markdown fences, no explanation) with these fields:\n"
    '{\n'
    '  "heading_issues": ["list of APA heading hierarchy problems"],\n'
    '  "missing_sections": ["list of required sections that seem missing"],\n'
    '  "reference_issues": ["citation/reference inconsistencies or warnings"],\n'
    '  "format_suggestions": ["concrete formatting suggestions for APA 7"],\n'
    '  "overall_assessment": "good" | "needs_review" | "critical",\n'
    '  "summary": "one-paragraph summary in Spanish for the student"\n'
    '}\n'
    "Rules for APA 7:\n"
    "- Headings: Level 1 (centered bold) → Level 2 (left bold) → Level 3 (left bold italic). "
    "No level should be skipped without content between them.\n"
    "- Required sections: Title page, Abstract (optional for students), Body, References.\n"
    "- Every in-text citation MUST have a corresponding reference in the bibliography.\n"
    "- Every reference in the bibliography must be cited in the text.\n"
    "- Titles should be descriptive and under 12 words (APA recommendation).\n"
    "- Abstract should be 150-250 words.\n"
    "Return ONLY the JSON object, nothing else."
)


def _merge_audit_results(heuristic: DocAuditResult, llm: DocAuditResult) -> DocAuditResult:
    """
    Fusiona el resultado heurístico con el del LLM, evitando duplicados.
    El LLM puede agregar hallazgos que la heurística no detectó, y viceversa.
    El overall_assessment más severo tiene prioridad.
    """
    severity_order = {"good": 0, "needs_review": 1, "critical": 2}
    h_sev = severity_order.get(heuristic.overall_assessment, 1)
    l_sev = severity_order.get(llm.overall_assessment, 1)
    final_assessment = heuristic.overall_assessment if h_sev >= l_sev else llm.overall_assessment

    # Fusionar listas sin duplicados exactos
    def merge_lists(a: List[str], b: List[str]) -> List[str]:
        seen = set(a)
        result = list(a)
        for item in b:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

    return DocAuditResult(
        heading_issues=merge_lists(heuristic.heading_issues, llm.heading_issues),
        missing_sections=merge_lists(heuristic.missing_sections, llm.missing_sections),
        reference_issues=merge_lists(heuristic.reference_issues, llm.reference_issues),
        format_suggestions=merge_lists(heuristic.format_suggestions, llm.format_suggestions),
        overall_assessment=final_assessment,
        # El summary del LLM es más rico; si no hay LLM, usa el heurístico.
        summary=llm.summary if llm.summary else heuristic.summary,
    )


async def audit_document_structure(
    doc_model: Any,
    api_key: str,
    provider_config: Optional[Dict[str, Any]] = None,
) -> DocAuditResult:
    """
    Auditoría completa del documento en dos capas:

    1. Heurística local (siempre, cero latencia): salto de headings, running head,
       abstract word count, headings numerados, orden de secciones, figuras sin
       caption, citas huérfanas.

    2. LLM global (solo si hay api_key): enriquece el resultado heurístico con
       análisis de estructura semántica, consistencia de referencias y sugerencias
       específicas de APA 7.

    Sin api_key → retorna el resultado heurístico (no un error vacío).

    Args:
        doc_model: DocumentModel (Pydantic) con elementos, referencias y portada.
        api_key: API key del proveedor de IA (puede estar vacío).
        provider_config: dict opcional con {nim_url, use_local, provider_id}.

    Returns:
        DocAuditResult con los hallazgos combinados de heurística + LLM.
    """
    # Capa 1: Heurística local (siempre ejecuta)
    heuristic_result = audit_document_heuristic(doc_model)

    # Capa 2: LLM (solo si hay clave de IA)
    if not api_key:
        logger.info("[DocAuditor] Sin API key — retornando resultado heurístico local")
        if not heuristic_result.summary:
            heuristic_result.summary = (
                "Auditoría heurística completada. "
                "Para un análisis más profundo, configurá una clave de IA en Ajustes."
            )
        return heuristic_result

    structure_text = _build_structure_prompt(doc_model)

    try:
        from modules.ai_client import execute_with_specialty

        # `provider_config` trae `provider_id` desde `sessions.py`, que lo lee
        # del body. Se recibia y no se pasaba: la eleccion de proveedor se perdia
        # en el ultimo tramo, y este es el mas caro —HEAVY, mil tokens, la
        # estructura entera del documento.
        #
        # Este comentario esta FUERA de la llamada a proposito. El guardian que
        # comprueba que la llamada lleva `provider_id` lee los argumentos
        # contando parentesis, asi que un comentario puesto entre los argumentos
        # es indistinguible de un argumento: el comentario se contaria a si
        # mismo y el guardian pasaria con el defecto puesto.
        response = await execute_with_specialty(
            prompt=structure_text,
            system_prompt=_AUDIT_SYSTEM_PROMPT,
            specialty="HEAVY",
            api_key=api_key,
            nim_url=(provider_config or {}).get("nim_url", ""),
            use_local=(provider_config or {}).get("use_local", False),
            provider_id=(provider_config or {}).get("provider_id") or None,
            temperature=0.2,
            max_tokens=1000,
            use_cache=True,
        )

        # Parse the JSON from LLM response
        json_text = str(response).strip()
        # Remove markdown fences if LLM included them anyway
        json_text = re.sub(r"^```(?:json)?\s*", "", json_text)
        json_text = re.sub(r"\s*```$", "", json_text)
        data = json.loads(json_text)

        llm_result = DocAuditResult(**data)
        return _merge_audit_results(heuristic_result, llm_result)

    except Exception as e:
        logger.warning(f"[DocAuditor] LLM audit failed: {e} — retornando resultado heurístico")
        # Si el LLM falla, al menos el resultado heurístico es válido
        if not heuristic_result.summary:
            heuristic_result.summary = (
                "La auditoría IA no pudo completarse. "
                "El análisis heurístico está disponible. Revisá manualmente los detalles."
            )
        return heuristic_result
