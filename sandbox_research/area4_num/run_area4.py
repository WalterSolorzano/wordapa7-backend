"""AREA 4 — Integridad de numeracion OOXML.

Evidencias que produce:
  1) checker de integridad referencial (numId->num->abstractNum)
     corrido sobre corpus original + salidas del pipeline;
  2) PoC de colision/secuestro: numId=1 ya usado por el usuario;
  3) preservacion de vinetas Symbol/Wingdings in-place.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
CORPUS = Path(__file__).resolve().parents[1] / "corpus"
EVID = Path(__file__).resolve().parents[1] / "evidence"


def _parts(path: Path):
    with __import__("zipfile").ZipFile(path) as z:
        names = z.namelist()
        doc = etree.fromstring(z.read("word/document.xml"))
        num = etree.fromstring(z.read("word/numbering.xml")) if "word/numbering.xml" in names else None
    return doc, num


def integrity_check(path: Path) -> dict:
    """Cada w:numId en parrafos debe resolver a w:num y su abstractNum existir."""
    doc, num = _parts(path)
    nums, absnums = {}, {}
    if num is not None:
        for n in num.findall(f"{{{W}}}num"):
            nid = n.get(f"{{{W}}}numId")
            aid = n.find(f"{{{W}}}abstractNumId").get(f"{{{W}}}val")
            nums[nid] = aid
        for a in num.findall(f"{{{W}}}abstractNum"):
            absnums[a.get(f"{{{W}}}abstractNumId")] = a
    used_numids, missing_num, missing_abs, fmt_hijack = [], [], [], []
    for numPr in doc.iter(f"{{{W}}}numPr"):
        el = numPr.find(f"{{{W}}}numId")
        if el is None:
            continue
        val = el.get(f"{{{W}}}val")
        used_numids.append(val)
        if num is None:
            missing_num.append(val); continue
        if val not in nums:
            missing_num.append(val); continue
        aid = nums[val]
        if aid not in absnums:
            missing_abs.append((val, aid)); continue
        fmt_el = absnums[aid].find(f".//{{{W}}}lvl/{{{W}}}numFmt")
        fmt = fmt_el.get(f"{{{W}}}val") if fmt_el is not None else "?"
        fmt_hijack.append(fmt)
    return {
        "file": path.name,
        "has_numbering_part": num is not None,
        "defined_nums": sorted(nums),
        "used_numids": sorted(set(used_numids)),
        "missing_num_refs": sorted(set(missing_num)),
        "missing_abstract": sorted(set(missing_abs)),
        "resolved_formats": sorted(set(fmt_hijack)),
    }


def poc_hijack() -> dict:
    """Original del usuario YA usa numId=1 como lista DECIMAL multinivel.
    El pipeline (bullet_engine) inyecta vineta con numId=1 fijo."""
    from generation.bullet_engine import apply_bullet_from_template
    num_part_xml = (
        f'<w:numbering {nsdecls_w()}>'
        '<w:abstractNum w:abstractNumId="9"><w:multiLevelType w:val="multilevel"/>'
        '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>'
        '<w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum>'
        '<w:num w:numId="1"><w:abstractNumId w:val="9"/></w:num>'
        '</w:numbering>'
    )
    out = CORPUS / "poc_hijack.docx"
    # base sin plantilla-default que contamine, luego inyecto decimal y REABRO
    __import__("docx").Document().save(str(out))
    _inject_numbering(out, num_part_xml)
    import docx as pydocx
    d = pydocx.Document(str(out))
    p_user = d.add_paragraph("Elemento usuario uno"); _num(p_user, 1)
    p_user2 = d.add_paragraph("Elemento usuario dos"); _num(p_user2, 1)

    # ahora el pipeline formatea una vineta nueva POR LA RUTA PRODUCTIVA
    # (format_bullet_item -> get_or_create_list_num_id, FASE 1.1)
    from generation.bullet_engine import format_bullet_item
    p_new = d.add_paragraph("")
    format_bullet_item(p_new, "Vineta APA nueva del pipeline", level=1)
    d.save(str(out))
    chk = integrity_check(out)
    # La vineta del pipeline comparte numId=1 con la lista DECIMAL del usuario:
    # resuelve al mismo abstractNum decimal -> se renderiza como NUMERO, no viñeta.
    chk["pipeline_item_expected_fmt"] = "bullet"
    chk["pipeline_item_actual_fmt"] = chk["resolved_formats"][0] if chk["resolved_formats"] else None
    chk["misformat_confirmed"] = (
        len(chk["resolved_formats"]) == 1
        and chk["resolved_formats"][0] != "bullet"
    )
    return chk


def poc_wingdings_inplace() -> dict:
    """Vinieta original con fuente Symbol/Wingdings: sobrevive al pipeline in-place?"""
    from modules.scoped_apply import apply_scopes
    import io as _io
    numxml = (
        f'<w:numbering {nsdecls_w()}>'
        '<w:abstractNum w:abstractNumId="5"><w:multiLevelType w:val="hybridMultilevel"/>'
        '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>'
        '<w:lvlText w:val="\uf0b7"/><w:lvlJc w:val="left"/>'
        '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>'
        '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>'
        '</w:abstractNum>'
        '<w:num w:numId="7"><w:abstractNumId w:val="5"/></w:num>'
        '</w:numbering>'
    )
    d = docx_document_with_symbol_bullet(numxml)
    src = CORPUS / "poc_wingdings.docx"
    d.save(str(src))
    before_font = _bullet_font(src)

    raw = src.read_bytes()
    out_bytes, _summary = apply_scopes(raw, ["texto"], {})
    dst = CORPUS / "poc_wingdings_after.docx"
    dst.write_bytes(out_bytes)
    after_font = _bullet_font(dst)
    return {"before_bullet_font": before_font, "after_bullet_font": after_font,
            "preserved": before_font == after_font}


# ── helpers ───────────────────────────────────────────────────────────────────

def nsdecls_w():
    from docx.oxml.ns import nsmap
    return f'xmlns:w="{nsmap["w"]}"'


def _inject_numbering(docx_path: Path, numbering_xml: str):
    import zipfile, shutil
    tmp = docx_path.with_suffix(".tmp.docx")
    replaced = False
    with zipfile.ZipFile(docx_path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = zin.read(item)
            if item == "word/numbering.xml":
                data = numbering_xml.encode()  # REEMPLAZAR (no duplicar entrada)
                replaced = True
            zout.writestr(item, data)
        if not replaced:
            zout.writestr("word/numbering.xml", numbering_xml)
            # plantillas sin numbering necesitan ContentType+rel; las que ya lo
            # tienen ya los traen.
            with zipfile.ZipFile(docx_path) as z0:
                ct = z0.read("[Content_Types].xml")
                rels = z0.read("word/_rels/document.xml.rels")
            if b"numbering+xml" not in ct:
                with zipfile.ZipFile(tmp, "a", zipfile.ZIP_DEFLATED) as z2:
                    pass  # zip append no permite editar; caso cubierto abajo
    shutil.move(tmp, docx_path)


def _num(p, num_id: int):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    pPr = p._p.get_or_add_pPr()
    numPr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl"); ilvl.set(qn("w:val"), "0")
    nid = OxmlElement("w:numId"); nid.set(qn("w:val"), str(num_id))
    numPr.append(ilvl); numPr.append(nid); pPr.append(numPr)


def docx_document_with_symbol_bullet(numxml: str):
    import docx as pydocx
    d = pydocx.Document()
    out_tmp = CORPUS / "_tmp_empty.docx"
    d.save(str(out_tmp))
    _inject_numbering(out_tmp, numxml)
    d2 = pydocx.Document(str(out_tmp))
    p = d2.add_paragraph("Item con vineta Symbol del usuario")
    _num(p, 7)
    return d2


def _bullet_font(path: Path):
    _, num = _parts(path)
    if num is None:
        return None
    rf = num.find(f".//{{{W}}}lvl/{{{W}}}rPr/{{{W}}}rFonts")
    if rf is None:
        return None
    return (rf.get(f"{{{W}}}ascii"), rf.get(f"{{{W}}}hint"))


def main():
    results = {"integrity_corpus": [], "poc_hijack": None, "poc_wingdings": None}
    targets = sorted(list(CORPUS.glob("*.docx")))
    for f in targets:
        try:
            results["integrity_corpus"].append(integrity_check(f))
        except Exception as e:
            results["integrity_corpus"].append({"file": f.name, "error": repr(e)[:150]})
    try:
        results["poc_hijack"] = poc_hijack()
    except Exception as e:
        results["poc_hijack"] = {"error": repr(e)[:200]}
    try:
        results["poc_wingdings"] = poc_wingdings_inplace()
    except Exception as e:
        results["poc_wingdings"] = {"error": repr(e)[:200]}
    EVID.mkdir(exist_ok=True)
    (EVID / "area4.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
