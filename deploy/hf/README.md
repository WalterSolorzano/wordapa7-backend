---
title: WordAPA7
colorFrom: indigo
colorTo: blue
sdk: docker
pinned: false
license: mit
---

# WordAPA7 — Formato APA 7 online

Convierte documentos `.docx` a formato APA 7ª edición desde el navegador:
subís el Word, revisás la clasificación (títulos, párrafos, tablas, figuras),
completás portada y referencias, y descargás el `.docx` formateado.

## Uso
1. Abrí la app (este Space).
2. Subí un documento `.docx`.
3. Revisá las etapas y descargá el resultado.

## Datos y privacidad
- Los documentos subidos se guardan en el **disco persistente** del Space
  (`/data`) y se borran automáticamente tras expirar.
- La clasificación IA es **opcional**: sin API key usa reglas heurísticas
  locales. Nada sale de este servidor a menos que configures una key de IA.

## Deploy local
```bash
# 1. Compilar frontend y preparar la carpeta del Space
.\deploy\hf\prepare.ps1

# 2. Subir la carpeta deploy\hf\space al repo del Space
git clone https://huggingface.co/spaces/USUARIO/wordapa7-web
# copiar el contenido de deploy\hf\space\ y pushear
```
