"""Endpoint atomico POST /api/spec: DSL JSON -> docx APA 7 en un llamado.

Enfoque A: reutiliza las rutas existentes de main.py como funciones
(start_blank_document, apply_cover_endpoint, generate_docx) + post-paso.
IMPORT: los imports de main van DENTRO del handler (circulo de import).
"""
from __future__ import annotations

from config import STORAGE_DIR
from fastapi import APIRouter, BackgroundTasks, Body, HTTPException
from models import PortadaData
from persistence.session_manager import maybe_run_gc, save_session_state
from preset_store import PresetNotFound, PresetTypeMismatch, get_preset
from spec_dsl import SpecDocument, expand_spec
from spec_postpass import append_equipment_cards, apply_heading_styles, apply_table_border_override

router = APIRouter(tags=["spec"])

# Ejemplos OpenAPI copiables por agentes (siempre validos contra el DSL;
# los presets y la portada referenciados son builtins que existen siempre)
_OPENAPI_EJEMPLOS = {
    "minimo": {
        "summary": "Especificacion minima",
        "description": "Un titulo y un parrafo: el camino corto.",
        "value": {
            "spec_version": "1",
            "elements": [
                {"type": "heading", "level": 1, "text": "1. Introduccion"},
                {"type": "paragraph", "text": "Parrafo de ejemplo."},
            ],
        },
    },
    "completo": {
        "summary": "Especificacion completa",
        "description": ("Documento con portada (template builtin), presets "
                        "de tabla/layout, tabla y referencias."),
        "value": {
            "spec_version": "1",
            "output": {"filename": "balance_energetico.docx"},
            "cover": {
                "template": "APA 7 Estudiante",
                "title": ("Balance del Consumo de Energia Electrica "
                          "de una Vivienda"),
                "author": "Walter Noel Solorzano Gaitan",
                "institution": "Universidad Nacional de Ingenieria",
                "course": "Tecnologia y Medio Ambiente",
                "instructor": "Ing. Eva Mairena",
                "date": "02 de octubre de 2026",
            },
            "presets": {"table": "tabla_apa_generica",
                        "layout": "layout_uni"},
            "elements": [
                {"type": "heading", "level": 1,
                 "text": "1. Introduccion"},
                {"type": "paragraph",
                 "text": ("El balance compara el medidor con las "
                          "potencias inventariadas.")},
                {"type": "table", "caption": "Tabla 1",
                 "title": "Consumo mensual",
                 "columns": ["Mes", "kWh"],
                 "rows": [["Enero", "133"], ["Febrero", "104"]]},
                {"type": "references", "items": [
                    {"apa": ("Instituto Nicaraguense de Energia. (2026). "
                             "Tarifa T-0. INE.")}]},
            ],
        },
    },
}

# Normalizacion para comparar texto del spec contra word/document.xml
# (Word convierte comillas rectas a tipograficas y guiones a rayas)
_TRANSLATION = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u201a": "'",
    "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-",
})


def _missing_texts(out_file, spec: SpecDocument) -> list[str]:
    """Textos del spec ausentes del docx generado (sanity gate vacio)."""
    import re
    import zipfile
    try:
        with zipfile.ZipFile(out_file) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
    except Exception:
        return ["<word/document.xml ilegible>"]
    text = re.sub(r"<[^>]+>", "", xml).translate(_TRANSLATION)
    missing: list[str] = []
    for el in spec.elements:
        if el.type in ("heading", "paragraph"):
            candidates = [el.text]
        elif el.type == "table":
            candidates = list(el.rows[0]) if el.rows else []
        else:
            candidates = []
        for c in candidates:
            if c and c.translate(_TRANSLATION) not in text:
                missing.append(c[:60])
    return missing


def _resolve_preset(name: str | None, expected_type: str):
    """Resuelve un preset nombrado y lo valida a su modelo de definicion.

    Devuelve TablePresetDef | HeadingPresetDef | LayoutPresetDef o None.
    404 con nombres disponibles; tipo incorrecto -> 422.
    """
    if not name:
        return None
    from preset_store import PRESET_TYPES
    try:
        rec = get_preset(name, STORAGE_DIR)
    except PresetNotFound as e:
        raise HTTPException(status_code=404,
                            detail={"detail": str(e), "available": e.available})
    if rec.type != expected_type:
        raise HTTPException(status_code=422,
                            detail=f"Preset '{name}' es tipo {rec.type}, "
                                   f"se esperaba {expected_type}.")
    return PRESET_TYPES[rec.type](**rec.definition)


def _check_cover(name: str | None) -> None:
    if not name:
        return
    from modules.cover_designer import list_cover_templates
    names = [t.name for t in list_cover_templates(STORAGE_DIR)]
    if name not in names:
        raise HTTPException(status_code=404,
                            detail={"detail": f"Portada '{name}' no existe.",
                                    "available": names})


@router.post("/api/spec")
async def generate_from_spec(
        background_tasks: BackgroundTasks,
        spec: SpecDocument = Body(..., openapi_examples=_OPENAPI_EJEMPLOS),
) -> dict:
    """Genera un docx APA 7 completo desde un spec JSON (un solo llamado)."""
    from main import (
        ApplyCoverRequest,
        GenerateRequest,
        apply_cover_endpoint,
        generate_docx,
    )
    from routers.sessions import start_blank_document

    # 1. Resolver presets y portada (404 con available)
    table_rec = _resolve_preset(spec.presets.table, "table")
    heading_rec = _resolve_preset(spec.presets.heading, "heading")
    layout_rec = _resolve_preset(spec.presets.layout, "layout")
    _check_cover(spec.cover.template if spec.cover else None)

    # 1b. Scratch: cover sin template exige al menos un dato que renderizar
    if spec.cover and not spec.cover.template and not any((
            spec.cover.title, spec.cover.author, spec.cover.institution,
            spec.cover.course, spec.cover.instructor, spec.cover.date)):
        raise HTTPException(
            status_code=422,
            detail="cover sin template ni datos: indique cover.template o "
                   "al menos un campo de la portada sintetica.")

    # 2. Expandir DSL (propaga PresetNotFound de presets por tabla)
    try:
        exp = await expand_spec(
            spec,
            table_def=table_rec,
            layout_def=layout_rec,
            heading_def=heading_rec,
            storage_dir=STORAGE_DIR)
    except PresetNotFound as e:
        raise HTTPException(status_code=404,
                            detail={"detail": str(e), "available": e.available})
    except PresetTypeMismatch as e:
        raise HTTPException(status_code=422, detail=str(e))

    warnings = list(exp.warnings)

    # 3. Sesion blank (template APA base)
    doc = await start_blank_document(background_tasks)
    doc.elements = exp.elements
    doc.file_name = exp.filename
    save_session_state(doc, STORAGE_DIR)

    try:
        # 4. Portada si se pidio: template con nombre o scratch sintetica.
        # Los datos SIEMPRE viajan en PortadaData: generator.py los lee del
        # param `portada` (el endpoint apply-cover solo guarda el id).
        portada_req: PortadaData | None = None
        if spec.cover:
            # El DISENO de la hoja va en `portada`; el QUIEN (autor y profesor
            # asesor) es metadata del documento y va en `meta`. Con una
            # plantilla de portada cargada, `use_original_cover` es True y el
            # bloque original no se toca: si el autor viviera en `portada`, no
            # habria de donde sacarlo y el `.docx` salia sin el.
            portada_req = PortadaData(
                title=spec.cover.title,
                institution=spec.cover.institution, course=spec.cover.course,
                date=spec.cover.date,
                use_original_cover=bool(spec.cover.template))
            doc.meta.autor = spec.cover.author or None
            if spec.cover.instructor:
                doc.meta.profesor_asesor = [spec.cover.instructor]
            if spec.cover.template:
                await apply_cover_endpoint(ApplyCoverRequest(
                    session_id=doc.session_id,
                    cover_template_name=spec.cover.template,
                    title=spec.cover.title, author=spec.cover.author,
                    institution=spec.cover.institution,
                    course=spec.cover.course,
                    instructor=spec.cover.instructor, date=spec.cover.date))

        # 5. Generar con el pipeline existente
        result = await generate_docx(GenerateRequest(
            session_id=doc.session_id, rules=exp.rules,
            portada=portada_req, meta=doc.meta,
            references=exp.references or None))

        # 6. Post-paso: headings nativos, bordes por caption, tarjetas de anexo
        out_dir = STORAGE_DIR / "sessions" / doc.session_id
        outs = sorted((p for p in out_dir.glob("*.docx")
                       if p.name != "original.docx"),
                      key=lambda p: p.stat().st_mtime, reverse=True)
        if not outs:
            raise HTTPException(status_code=500,
                                detail={"detail": "Sin archivo de salida tras "
                                                  "generar.",
                                        "session_id": doc.session_id})
        out_file = outs[0]
        if exp.heading_preset:
            apply_heading_styles(out_file, exp.heading_preset.levels)
        for ov in exp.table_overrides:
            if not apply_table_border_override(out_file, ov.caption_label,
                                               ov.border_style):
                warnings.append(f"Tabla '{ov.caption_label}' no localizada "
                                f"para aplicar preset de bordes.")
        try:
            append_equipment_cards(out_file, exp.equipment_cards, exp.rules)
        except Exception as e:  # anexos no deben romper la descarga
            warnings.append(f"Tarjetas de anexo fallaron: {e}")

        # 7. Sanity gate: nunca responder 200 con documento vacio
        # (los textos del spec deben aparecer en word/document.xml)
        missing = _missing_texts(out_file, spec)
        if missing:
            raise HTTPException(
                status_code=500,
                detail={"detail": "Documento generado sin el texto esperado "
                                  "(sanity gate).",
                        "missing": missing[:5],
                        "session_id": doc.session_id})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500,
                            detail={"detail": str(e),
                                    "session_id": doc.session_id})

    # 7. GC diferido (patron /api/upload); la sesion vive para la descarga
    background_tasks.add_task(maybe_run_gc, STORAGE_DIR)

    filename = (result.get("filename") or result.get("file_name")
                or exp.filename)
    return {"download_url": result.get("download_url",
                                       f"/api/download/{doc.session_id}"),
            "filename": filename, "session_id": doc.session_id,
            "warnings": warnings}
