# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Estudiantes universitarios, investigadores académicos y tesistas que redactan informes, tesis y artículos en Microsoft Word y necesitan cumplir de forma infalible con las normas APA 7ma edición, a menudo colaborando en equipo con versiones fragmentadas (`doc (1).docx`, capítulos sueltos).

## Product Purpose

WordAPA7 es un entorno de escritorio editorial híbrido (React + Electron + FastAPI + Word COM) que estandariza automáticamente documentos académicos a formato APA 7 estricto (títulos, interlineado, sangrías, tablas, leyendas de figuras y citas/referencias cruzadas) respetando intacta la portada original y permitiendo trabajar en vivo y en paralelo con Microsoft Word.

## Positioning

A diferencia de los gestores bibliográficos pasivos (Mendeley, Zotero) o formateadores web destructivos, WordAPA7:
1. Opera directamente sobre archivos físicos `.docx` mediante edición in-place respetando estilos preexistentes y portadas oficiales.
2. Posee sincronización bidireccional reactiva en paralelo con Word (File Watcher de 600ms).
3. Permite copiar el archivo físico `.pdf` formateado directamente al portapapeles de Windows (`CF_HDROP`) para compartir al instante en WhatsApp o Telegram con `Ctrl + V`.
4. Incluye auditorías proactivas en segundo plano que detectan citas huérfanas, referencias sin cita y frases generadas por IA.

## Operating Context

- **Entorno**: Aplicación de escritorio Windows (Electron + Vite + FastAPI local en puerto 8742).
- **Herramienta principal del usuario**: Microsoft Word ejecutándose simultáneamente.
- **Canales de intercambio**: WhatsApp Web/Desktop, Google Drive, correos y memorias USB.
- **Modo**: `Operate` (herramienta de alta densidad, edición y precisión académica).

## Capabilities and Constraints

- **Cero emojis**: Prohibido el uso de caracteres emoji en la interfaz; se emplean exclusivamente iconos vectoriales SVG limpios.
- **Tokens de diseño**: Prohibido hardcodear colores hex; uso mandatorio de tokens (`var(--accent-primary)`, `var(--border-subtle)`, `var(--paper-white)`).
- **Fidelidad de papel**: El canvas de edición mantiene siempre fondo blanco papel puro (`#ffffff`) con tinta de alto contraste (`#111827`) independientemente de si la aplicación está en modo claro u oscuro.
- **Portadas protegidas**: La portada original del usuario (`use_original_cover: true`) es indivisible y jamás se altera.
- **Toggles modulares**: El usuario puede activar/desactivar selectivamente qué módulos formatear (texto, títulos, tablas, imágenes, referencias).

## Brand Commitments

- Tono académico, profesional, sobrio y libre de clichés visuales de inteligencia artificial ("AI slop", sin side-tabs gruesos ni rebotes elásticos).
- Interfaz Fluent / Desktop moderna y ágil.

## Product Principles

1. **No romper jamás el trabajo del estudiante**: Preservación absoluta de la estructura y portadas existentes; el formateo es aditivo y respetuoso.
2. **Cero fricción de importación/exportación**: Sincronización en vivo con Word y copia nativa al portapapeles para mensajería instantánea.
3. **Claridad sobre automatización ciega**: El usuario siempre mantiene el control de qué partes normalizar (checks modulares).
4. **Fidelidad 1:1 con la salida final**: Lo que se previsualiza en el visor PDF es idéntico a lo que exporta Word COM.
