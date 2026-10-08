import json
import subprocess
import sys
from pathlib import Path

from docx import Document


def test_cli_builds_docx(tmp_path):
    payload_path = tmp_path / "payload.json"
    payload_path.write_text(
        json.dumps({"content": [{"h1": "Método"}, {"p": "Cuerpo."}]}),
        encoding="utf-8",
    )
    out = tmp_path / "out.docx"
    python_dir = Path(__file__).resolve().parents[1]
    res = subprocess.run(
        [sys.executable, "-m", "content", str(payload_path), "-o", str(out)],
        cwd=str(python_dir),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, res.stderr
    assert out.exists()
    assert len(Document(str(out)).paragraphs) > 0
