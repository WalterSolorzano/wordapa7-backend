"""
Tests unitarios para DocxStressLab, AI Document Editor y Proactive Auto-Captioning.
"""

import os
from pathlib import Path
import pytest
from docx import Document
from tools.stress_doc_generator import (
    generate_stress_citations_doc,
    generate_stress_headings_and_structure_doc,
    generate_stress_tables_and_figures_doc,
    generate_all_stress_docs,
)
from modules.ai_document_editor import extract_json_payload, SYSTEM_PROMPT
from parsing.docx_parser import parse_docx_bytes

def test_stress_doc_generator_creates_valid_docx():
    docs = generate_all_stress_docs()
    assert "citations" in docs
    assert "headings" in docs
    assert "tables_figures" in docs

    for key, path_str in docs.items():
        assert os.path.exists(path_str)
        doc = Document(path_str)
        assert len(doc.paragraphs) > 0 or len(doc.tables) > 0

def test_extract_json_payload_direct():
    raw = '{"reply": "Texto corregido", "actions": [{"type": "update_text", "element_id": "e1", "text": "Hola"}]}'
    parsed = extract_json_payload(raw)
    assert parsed["reply"] == "Texto corregido"
    assert len(parsed["actions"]) == 1
    assert parsed["actions"][0]["type"] == "update_text"

def test_extract_json_payload_markdown_fenced():
    raw = '```json\n{"reply": "Listo", "actions": []}\n```'
    parsed = extract_json_payload(raw)
    assert parsed["reply"] == "Listo"
    assert parsed["actions"] == []

def test_extract_json_payload_fallback():
    raw = 'Solo una respuesta de texto sin JSON'
    parsed = extract_json_payload(raw)
    assert "Solo una respuesta de texto" in parsed["reply"]
    assert parsed["actions"] == []

def test_stress_citations_parsing(tmp_path):
    path = generate_stress_citations_doc()
    with open(path, "rb") as f:
        bytes_data = f.read()
    model = parse_docx_bytes(bytes_data, "stress_citations.docx", session_id="test_session", storage_dir=tmp_path)
    assert model is not None
    assert len(model.elements) > 0
    # Comprobar que detecta párrafos y referencias
    para_elements = [e for e in model.elements if e.type == "paragraph"]
    assert len(para_elements) >= 4
