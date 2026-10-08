from typing import Any, Dict, List


class AITextDetector:
    """
    Detector de texto generado por IA.

    Desde la unificación de detectores, `analyze_document` delega en el
    pipeline único `classification.ai_detector.analyze_document_ai`, que
    combina el análisis por párrafo (analyze_ai_risk) con señales globales
    (metadatos forenses, varianza sintáctica). El score es 0-1, idéntico al
    que calcula el Revisor — ambos usan el mismo algoritmo.

    `analyze_paragraph` se mantiene solo para compatibilidad de scripts
    existentes y retorna un score 0-100 con los matches.
    """

    def __init__(self, strictness_threshold: int = 40):
        self.strictness_threshold = strictness_threshold

    def analyze_paragraph(self, text: str, has_shading_residue: bool = False) -> Dict[str, Any]:
        """Compatibilidad: analiza un párrafo con el pipeline unificado,
        retornando score 0-100 y matches."""
        from classification.ai_detector import analyze_ai_risk

        text = text or ""
        if not text.strip() or len(text.strip()) < 15:
            return {"score": 0, "is_ai_generated": False, "matches": [], "length": 0}

        r = analyze_ai_risk(text)
        if has_shading_residue:
            r["score"] = min(1.0, r["score"] + 0.3)
            if not any(f.get("pattern") == "shading_residue" for f in r["findings"]):
                r["findings"].insert(0, {
                    "pattern": "shading_residue",
                    "severity": "MEDIUM",
                    "detail": "Residuos de formato web (sombreado sospechoso)",
                    "count": 1,
                    "phrase": "",
                })

        score_100 = int(round(r.get("score", 0.0) * 100))
        return {
            "score": score_100,
            "is_ai_generated": score_100 >= self.strictness_threshold,
            "matches": [f.get("detail", "") for f in r.get("findings", [])],
            "length": len(text.split()),
        }

    def analyze_document(
        self,
        paragraphs: List[str],
        forensic_metadata: Dict[str, Any] = None,
        paragraph_shading: List[bool] = None,
        paragraph_web_shading: List[bool] = None,
    ) -> List[Dict[str, Any]]:
        """
        Pipeline unificado a nivel documento. Retorna un dict por párrafo:
          {score: 0-1, category, findings, matches}
        """
        from classification.ai_detector import analyze_document_ai

        if paragraph_shading is None:
            paragraph_shading = [False] * len(paragraphs)
        if paragraph_web_shading is None:
            paragraph_web_shading = [False] * len(paragraphs)

        return analyze_document_ai(
            paragraphs,
            forensic_metadata,
            paragraph_shading,
            paragraph_web_shading,
        )


_detector = AITextDetector(strictness_threshold=40)


def get_ai_text_detector(strictness_threshold: int = 40) -> AITextDetector:
    if _detector.strictness_threshold != strictness_threshold:
        return AITextDetector(strictness_threshold)
    return _detector
