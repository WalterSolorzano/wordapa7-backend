"""
WordAPA7 — Validador Estructural APA 7

Compara las citas parentéticas/narrativas del texto principal con la lista
de Referencias bibliográficas para asegurar coherencia bidireccional:
1. Alerta si un autor está citado en el texto pero no aparece en las Referencias.
2. Alerta si una referencia bibliográfica no fue citada en el cuerpo del texto.
3. Opcional: verificación LLM para matches inciertos (requiere API key).
"""

import asyncio
import json
import re
import unicodedata
from typing import List, Optional

from models import (
    CitationModel,
    DocumentModel,
    ElementType,
    ReferenciaModel,
    ValidationIssueModel,
    ValidationStatus,
)

from modules.citation_engine import extract_citations_from_text, normalize_surname_key

# ── Helpers de normalización ──────────────────────────────────────────────────

def _strip_accents(text: str) -> str:
    """Minúsculas y sin tildes, para comparaciones insensibles a acentos."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _surnames_match(a: str, b: str) -> bool:
    """
    Compara dos apellidos ya normalizados (minúsculas, sin tildes).
    Tolera apellidos compuestos: "garcia" empareja "garcia lopez".
    También detecta acrónimos: "oit" empareja "organizacion internacional del trabajo (oit)".
    """
    a = a.strip()
    b = b.strip()
    if not a or not b:
        return False
    if a == b or b.startswith(a + " ") or a.startswith(b + " "):
        return True
    # Acrónimo: extraer el texto entre paréntesis de la referencia ("(OIT)")
    import re as _re
    m = _re.search(r'\(([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,8})\)', b)
    if m and _strip_accents(m.group(1)) == a:
        return True
    # A la inversa: la cita lleva el acrónimo, la referencia el nombre completo
    if _re.search(r'\([A-ZÁÉÍÓÚÑ]{2,8}\)', a):
        return False
    return False


# Tipos de elementos cuyo texto es candidato a revisión científica
_PARANA_LIKE_TYPES = (
    ElementType.PARAGRAPH,
    ElementType.HEADING,
    ElementType.BULLET,
    ElementType.NUMBERED_LIST,
    ElementType.BLOCK_QUOTE,
)

# Tipos que nunca contienen citas del cuerpo (no son texto legible)
_SKIP_TYPES = (
    ElementType.IMAGE,
    ElementType.TABLE,
    ElementType.PAGE_BREAK,
    ElementType.SECTION_BREAK,
    ElementType.EMPTY,
    ElementType.PORTADA_BLOCK,
    ElementType.TOC,
    ElementType.CAPTION,
)


def validate_apa_integrity(doc: DocumentModel, references: List[ReferenciaModel]) -> List[ValidationIssueModel]:
    """
    Ejecuta la validación cruzada entre citas del documento y lista de referencias,
    y añade verificaciones científicas APA 7 (resumen, palabras clave, notación
    estadística, figuras/tablas, running head, niveles de título y formato de
    referencias). Cada verificación es independiente: si una falla, las demás
    siguen ejecutándose.
    """
    issues: List[ValidationIssueModel] = []

    # 1. Extraer todas las citas en el documento
    all_citations: List[CitationModel] = []
    for elem in doc.elements:
        # Excluir los items de la seccion de referencias: no son citas del cuerpo,
        # sino las entradas mismas de la bibliografia (evita falsas "citas fantasma").
        if getattr(elem, "pre_classifier_rule", None) == "reference_item":
            continue
        if elem.type in _SKIP_TYPES:
            continue
        if elem.text:
            cits = extract_citations_from_text(elem.text, elem.id)
            all_citations.extend(cits)

    # 2. Normalizar autores y años citados
    cited_keys = set()
    for c in all_citations:
        for author in c.authors:
            surname = normalize_surname_key(author)
            year = c.year or ""
            if surname:
                cited_keys.add((surname, year))

    # 3. Normalizar referencias bibliográficas
    ref_keys = set()
    for r in references:
        year = r.year or ""
        for author in (r.authors or []):
            surname = normalize_surname_key(author)
            if surname:
                ref_keys.add((surname, year))

    # 4. Chequeo 1: Cita en texto sin Referencia correspondiente
    for (surname, year) in cited_keys:
        if surname and not any(_surnames_match(surname, r_sur) for (r_sur, r_yr) in ref_keys):
            issues.append(ValidationIssueModel(
                rule_id="missing_reference",
                severity=ValidationStatus.WARNING,
                message=f"La cita '{surname.capitalize()} ({year})' está en el texto pero no aparece en la lista de Referencias.",
                suggestion="Agregue la referencia completa al final del documento."
            ))

    # 5. Chequeo 2: Referencia sin Cita en el cuerpo del texto
    for (surname, year) in ref_keys:
        if surname and not any(_surnames_match(c_sur, surname) for (c_sur, c_yr) in cited_keys):
            issues.append(ValidationIssueModel(
                rule_id="uncited_reference",
                severity=ValidationStatus.WARNING,
                message=f"La referencia '{surname.capitalize()} ({year})' no ha sido citada en ninguna parte del texto.",
                suggestion="Cite esta fuente en el texto o elimínela de la lista de Referencias."
            ))

    # ── Verificaciones científicas APA 7 (cada una aislada y segura) ──────────
    _check_abstract_and_keywords(doc, issues)
    _check_statistical_notation(doc, issues)
    _check_figure_table_references(doc, issues)
    _check_running_head(doc, issues)
    _check_heading_levels(doc, issues)
    _check_reference_format(references, issues)

    if not issues:
        issues.append(ValidationIssueModel(
            rule_id="all_clear",
            severity=ValidationStatus.OK,
            message="Coherencia perfecta: todas las citas coinciden con las referencias bibliográficas.",
            suggestion=""
        ))

    return issues


# ── Verificación 1: Resumen / Palabras clave ──────────────────────────────────

def _check_abstract_and_keywords(doc: DocumentModel, issues: List[ValidationIssueModel]) -> None:
    try:
        has_abstract = False
        has_keywords = False
        for elem in doc.elements:
            if not elem.text:
                continue
            t = _strip_accents(elem.text).strip()
            if t in ("resumen", "abstract"):
                has_abstract = True
            if t.startswith("palabras clave") or t.startswith("keywords"):
                has_keywords = True

        if not has_abstract:
            issues.append(ValidationIssueModel(
                rule_id="missing_abstract",
                severity=ValidationStatus.WARNING,
                message="No se detectó la sección de Resumen/Abstract.",
                suggestion="Incluya un resumen (Resumen) al inicio del documento, antes del cuerpo principal."
            ))
        if not has_keywords:
            issues.append(ValidationIssueModel(
                rule_id="missing_keywords",
                severity=ValidationStatus.WARNING,
                message="No se detectaron palabras clave (Palabras clave:).",
                suggestion="Agregue una línea 'Palabras clave: ...' después del resumen."
            ))
    except Exception as err:
        print(f"[WARN] Error en verificación de resumen/palabras clave: {err}")


# ── Verificación 2: Notación estadística ───────────────────────────────────────

# p < 0.05 (cero inicial prohibido por APA: debe ser p < .05)
_REGEX_P_LEADING_ZERO = re.compile(r"\bp\s*(?:<|>|=|≤|≥|~)?\s*0\.\d+", re.IGNORECASE)
# Símbolo estadístico sin espacio antes del operador: M=12 -> M = 12
_REGEX_STAT_SPACING = re.compile(r"(?<![A-Za-z0-9])(?:M|SD|SE|SEM|N|p|F|t|r|R|χ|χ²)(?=[=<>≤≥~])")
# SD en minúsculas (debe ser mayúsculas)
_REGEX_LOWER_SD = re.compile(r"\bsd\b(?=\s*(?:=|\(|:|<|>))")


def _check_statistical_notation(doc: DocumentModel, issues: List[ValidationIssueModel]) -> None:
    try:
        for elem in doc.elements:
            if elem.type not in _PARANA_LIKE_TYPES or not elem.text:
                continue
            text = elem.text
            for m in _REGEX_P_LEADING_ZERO.finditer(text):
                issues.append(ValidationIssueModel(
                    rule_id="p_value_leading_zero",
                    severity=ValidationStatus.ERROR,
                    message=f"Valor p con cero a la izquierda: '{m.group(0).strip()}'. En APA el valor p se escribe sin cero inicial.",
                    suggestion="Reemplace 'p < 0.05' por 'p < .05' (elimine el cero antes del punto)."
                ))
            for m in _REGEX_STAT_SPACING.finditer(text):
                issues.append(ValidationIssueModel(
                    rule_id="stat_symbol_spacing",
                    severity=ValidationStatus.WARNING,
                    message=f"Símbolo estadístico sin espacio antes del operador: '{m.group(0)}'. En APA se usa espacio (M = 12).",
                    suggestion="Agregue espacios alrededor del operador: 'M = 12'."
                ))
            for m in _REGEX_LOWER_SD.finditer(text):
                issues.append(ValidationIssueModel(
                    rule_id="sd_not_capitalized",
                    severity=ValidationStatus.WARNING,
                    message="'SD' (desviación estándar) debe escribirse en mayúsculas.",
                    suggestion="Reemplace 'sd' por 'SD'."
                ))
    except Exception as err:
        print(f"[WARN] Error en verificación de notación estadística: {err}")


# ── Verificación 3: Referencias cruzadas Figura / Tabla ────────────────────────

_REGEX_FIGURE_TABLE_REF = re.compile(r"\b(?:figura|tabla|cuadro)\s+(\d+)\b", re.IGNORECASE)


def _check_figure_table_references(doc: DocumentModel, issues: List[ValidationIssueModel]) -> None:
    try:
        actual_figures = set()
        actual_tables = set()
        for elem in doc.elements:
            if elem.type == ElementType.IMAGE and elem.image_info and elem.image_info.figure_number:
                actual_figures.add(elem.image_info.figure_number)
            elif elem.type == ElementType.TABLE and elem.table_info and elem.table_info.table_number:
                actual_tables.add(elem.table_info.table_number)

        referenced_figures = set()
        referenced_tables = set()
        for elem in doc.elements:
            if not elem.text or elem.type in (ElementType.IMAGE, ElementType.TABLE):
                continue
            for m in _REGEX_FIGURE_TABLE_REF.finditer(elem.text):
                word = _strip_accents(m.group(0).split()[0])
                num = int(m.group(1))
                if word.startswith("figura"):
                    referenced_figures.add(num)
                elif word.startswith("tabla") or word.startswith("cuadro"):
                    referenced_tables.add(num)

        for num in sorted(referenced_figures - actual_figures):
            issues.append(ValidationIssueModel(
                rule_id="figure_referenced_missing",
                severity=ValidationStatus.ERROR,
                message=f"Se referencia a Figura {num} pero no existe.",
                suggestion="Corrija el número de figura referenciado o agregue la figura faltante."
            ))
        for num in sorted(actual_figures - referenced_figures):
            issues.append(ValidationIssueModel(
                rule_id="figure_not_cited",
                severity=ValidationStatus.WARNING,
                message=f"La Figura {num} no se menciona en el texto.",
                suggestion="Mencione la figura en el cuerpo del texto (p. ej., 'en la Figura {num}')."
            ))
        for num in sorted(referenced_tables - actual_tables):
            issues.append(ValidationIssueModel(
                rule_id="table_referenced_missing",
                severity=ValidationStatus.ERROR,
                message=f"Se referencia a Tabla {num} pero no existe.",
                suggestion="Corrija el número de tabla referenciado o agregue la tabla faltante."
            ))
        for num in sorted(actual_tables - referenced_tables):
            issues.append(ValidationIssueModel(
                rule_id="table_not_cited",
                severity=ValidationStatus.WARNING,
                message=f"La Tabla {num} no se menciona en el texto.",
                suggestion="Mencione la tabla en el cuerpo del texto (p. ej., 'en la Tabla {num}')."
            ))
    except Exception as err:
        print(f"[WARN] Error en verificación de figuras/tablas: {err}")


# ── Verificación 4: Running head ───────────────────────────────────────────────

def _check_running_head(doc: DocumentModel, issues: List[ValidationIssueModel]) -> None:
    try:
        portada = doc.portada if isinstance(doc.portada, dict) else {}
        fields = portada.get("fields", {}) if isinstance(portada.get("fields", {}), dict) else {}
        running_head = (fields.get("running_head") or portada.get("running_head") or "").strip()
        if not running_head:
            return
        if running_head != running_head.upper():
            issues.append(ValidationIssueModel(
                rule_id="running_head_not_uppercase",
                severity=ValidationStatus.WARNING,
                message="El running head debe ir en MAYÚSCULAS.",
                suggestion=f"Use '{running_head.upper()}' en lugar de '{running_head}'."
            ))
        if len(running_head) > 50:
            issues.append(ValidationIssueModel(
                rule_id="running_head_too_long",
                severity=ValidationStatus.WARNING,
                message=f"El running head supera los 50 caracteres (tiene {len(running_head)}).",
                suggestion="Acorte el running head a un máximo de 50 caracteres."
            ))
    except Exception as err:
        print(f"[WARN] Error en verificación de running head: {err}")


# ── Verificación 5: Niveles de título APA ──────────────────────────────────────

def _check_heading_levels(doc: DocumentModel, issues: List[ValidationIssueModel]) -> None:
    try:
        seen_levels = set()
        first_heading = True
        for elem in doc.elements:
            if elem.is_cover_section or elem.type != ElementType.HEADING:
                continue
            level = elem.heading_level or 1
            if level < 1:
                level = 1
            if first_heading:
                if level != 1:
                    issues.append(ValidationIssueModel(
                        rule_id="first_heading_not_level1",
                        severity=ValidationStatus.WARNING,
                        message=f"El primer título del documento no es Nivel 1 (se detectó Nivel {level}).",
                        suggestion="En APA el primer título del cuerpo debe ser Nivel 1."
                    ))
                seen_levels.add(level)
                first_heading = False
                continue
            missing = [m for m in range(1, level) if m not in seen_levels]
            if missing:
                issues.append(ValidationIssueModel(
                    rule_id="heading_level_skip",
                    severity=ValidationStatus.WARNING,
                    message=f"Se salta de nivel de título: aparece Nivel {level} sin Nivel {missing[0]} anterior.",
                    suggestion="No omita niveles de título en APA; cada nivel requiere el nivel inmediatamente anterior."
                ))
            seen_levels.add(level)
    except Exception as err:
        print(f"[WARN] Error en verificación de niveles de título: {err}")


# ── Verificación 6: Formato de referencias ─────────────────────────────────────

def _check_reference_format(references: List[ReferenciaModel], issues: List[ValidationIssueModel]) -> None:
    try:
        for r in references:
            text = (r.raw_text or r.formatted_apa or "").strip()
            if not text:
                continue
            first_char = text[0]
            if first_char in ("•", "-", "–", "—", "*") or first_char.isdigit():
                issues.append(ValidationIssueModel(
                    rule_id="reference_starts_with_bullet",
                    severity=ValidationStatus.WARNING,
                    message=f"La referencia comienza con un símbolo de viñeta o número ('{first_char}').",
                    suggestion="Las referencias APA no llevan viñetas ni numeración; comienzan con el apellido del autor."
                ))
    except Exception as err:
        print(f"[WARN] Error en verificación de formato de referencias: {err}")


# ── Optional LLM-Powered Citation Validation ────────────────────────────────

async def validate_citations_with_llm(
    doc: DocumentModel,
    references: List[ReferenciaModel],
    api_key: Optional[str] = None,
    nim_url: Optional[str] = None,
    use_local: bool = False,
) -> List[ValidationIssueModel]:
    """
    Optional LLM-powered citation validation. Takes uncertain citation matches
    and asks the LLM to verify if a citation really matches a reference.
    Only runs if the user provides an API key and explicit consent.
    Ahora utiliza ai_client y chunking adaptativo.
    """
    issues: List[ValidationIssueModel] = []

    # Collect all citations from the document
    all_citations: List[CitationModel] = []
    for elem in doc.elements:
        if elem.text:
            cits = extract_citations_from_text(elem.text, elem.id)
            all_citations.extend(cits)

    if not all_citations or not references:
        return issues

    ref_summaries = []
    for r in references:
        ref_summaries.append({
            "id": r.id,
            "authors": r.authors,
            "year": r.year,
            "title": r.title[:80] if r.title else "",
        })

    ref_json = json.dumps(ref_summaries, ensure_ascii=False, indent=2)

    system_prompt = (
        "Eres un asistente experto en normas APA 7ma edicion. "
        "Verifica la coherencia entre las citas en el texto y las referencias bibliograficas proporcionadas.\n"
        "Para cada cita, indica si tiene una referencia correspondiente y senala cualquier problema.\n\n"
        "RESPONDE unicamente con JSON valido:\n"
        '[{"citation_text": "(Garcia, 2023)", "has_match": true, "matched_ref_id": "ref_001", "issues": [], "confidence": 0.95}]'
    )


    CHUNK_SIZE = 20
    batches = [all_citations[i:i + CHUNK_SIZE] for i in range(0, len(all_citations), CHUNK_SIZE)]

    for i, batch in enumerate(batches):
        citation_summaries = []
        for c in batch:
            citation_summaries.append({
                "text": c.raw_text,
                "authors": c.authors,
                "year": c.year,
                "type": c.citation_type.value if hasattr(c.citation_type, 'value') else str(c.citation_type),
            })

        user_prompt = (
            "Citas encontradas en el texto:\n"
            f"{json.dumps(citation_summaries, ensure_ascii=False, indent=2)}\n\n"
            "Referencias bibliograficas disponibles:\n"
            f"{ref_json}"
        )

        try:
            from modules.ai_client import execute_with_specialty
            content = await execute_with_specialty(
                prompt=user_prompt,
                system_prompt=system_prompt,
                specialty="HEAVY",
                api_key=api_key,
                nim_url=nim_url,
                use_local=use_local,
                temperature=0.1,
                max_tokens=2000,
                use_cache=True
            )

            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]

            results = json.loads(content.strip())
            for item in results:
                if not item.get("has_match", True):
                    issues.append(ValidationIssueModel(
                        rule_id="llm_unmatched_citation",
                        severity=ValidationStatus.WARNING,
                        message=(
                            f"Verificacion IA: la cita '{item.get('citation_text', '')}' "
                            f"no tiene una referencia que coincida. {item.get('issues', '')}"
                        ),
                        suggestion="Revise la ortografia del autor o agrege la referencia correspondiente."
                    ))

        except Exception as err:
            print(f"[WARN] Error en validacion LLM de citas (Batch {i+1}): {err}")

        # Delay to prevent rate limiting
        if i < len(batches) - 1:
            await asyncio.sleep(1.5)

    return issues
