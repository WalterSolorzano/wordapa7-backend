# WordAPA7 — Despliegue en Oracle Cloud (Always Free, Ampere A1 ARM).
# Igual que deploy/hf pero con puerto parametrizable y sin asumir /data:
# el storage se monta por docker-compose como volumen persistente.

FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# LibreOffice headless para docx -> pdf (lo_service + fallback).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-linux.txt .
RUN pip install --no-cache-dir -r requirements-linux.txt

COPY python/ ./python/
COPY dist/ ./dist/
RUN mkdir -p /data

EXPOSE 7860

# $PORT lo define docker-compose (7860 interno). El storage lo monta un volumen.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860} --app-dir python"]
