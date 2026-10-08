"""Test: El auditor detecta imágenes que desbordan la página."""
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from modules.doc_auditor import audit_document_heuristic
from models import DocumentModel, ElementModel, ElementType, ImageModel


def _img(h):
    info = ImageModel(element_id='i1', file_path='', filename='', width_cm=12, height_cm=h)
    return ElementModel(id='i1', type=ElementType.IMAGE, text='', image_info=info)


def test_image_taller_than_page_flagged():
    doc = DocumentModel(session_id='s1', file_name='t.docx',
        elements=[_img(30)])
    result = audit_document_heuristic(doc)
    joined = ' '.join(result.format_suggestions).lower()
    assert 'figura' in joined or 'desborda' in joined or 'pagina' in joined or 'página' in joined, f'Expected overflow warning, got: {result.format_suggestions}'


def test_image_within_page_not_flagged():
    doc = DocumentModel(session_id='s2', file_name='t.docx',
        elements=[_img(10)])
    result = audit_document_heuristic(doc)
    joined = ' '.join(result.format_suggestions).lower()
    assert 'desborda' not in joined and 'no cabe' not in joined, f'Should not flag a normal image: {result.format_suggestions}'
