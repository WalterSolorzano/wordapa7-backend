# WordAPA7 — Despliegue web en Hugging Face Spaces (Docker).
#
# Multi-stage: el frontend ya viene compilado en dist/ (ver prepare.ps1),
# este Dockerfile solo instala Python + LibreOffice y corre FastAPI en :7860.

FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    WORDAPA7_STORAGE_DIR=/data

WORKDIR /app

# LibreOffice headless para la conversion docx -> pdf (lo_service + fallback).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Dependencias del backend (sin pywin32/docx2pdf, que son de Windows).
COPY requirements-linux.txt .
RUN pip install --no-cache-dir -r requirements-linux.txt

# Codigo del backend + frontend compilado + carpeta de datos (vacia o persistida).
COPY python/ ./python/
COPY dist/ ./dist/
RUN mkdir -p /data

EXPOSE 7860

# FastAPI sirve el frontend desde dist/ y la API bajo /api.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--app-dir", "python"]
