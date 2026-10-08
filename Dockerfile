FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8742

# Instalar dependencias del sistema y LibreOffice headless para exportación/conversión de alta fidelidad
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer-nogpu \
    libreoffice-calc-nogpu \
    fonts-liberation \
    fonts-dejavu-core \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código fuente
COPY python/ ./python/

EXPOSE 8742

# Arrancar FastAPI
CMD ["uvicorn", "python.main:app", "--host", "0.0.0.0", "--port", "8742"]
