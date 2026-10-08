# WordAPA7 — imagen para Azure Container Apps (consumption, scale-to-zero).
# Multi-stage: compila el frontend (node) y arma el runtime (python + LibreOffice).

FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python-is-python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.node.json vite.config.ts postcss.config.js tailwind.config.js index.html ./
COPY public ./public
COPY src ./src
COPY electron ./electron
COPY python/build_manifest.py python/build_manifest.py
RUN npm run build

FROM python:3.10-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=7860 WORDAPA7_STORAGE_DIR=/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/azure/requirements-linux.txt requirements-linux.txt
RUN pip install --no-cache-dir -r requirements-linux.txt
COPY python ./python
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860} --app-dir python"]
