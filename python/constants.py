"""
WordAPA7 — Constantes compartidas del backend.

Centraliza URLs de proveedores de IA y valores por defecto para evitar
duplicación de literales entre módulos (llm_classifier, referencias, etc.).
"""

# NVIDIA NIM (OpenAI-compatible endpoint)
NVIDIA_NIM_URL: str = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_NIM_MODEL: str = "nvidia/nemotron-3-super-120b-a12b"
