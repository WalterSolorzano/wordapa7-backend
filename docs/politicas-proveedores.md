# Políticas de los proveedores de IA

Última revisión: 2026-10-04.

Este documento dice qué hace cada proveedor con el texto que se le envía. Los
límites son los del plan gratuito vigente a la fecha de revisión; cambian sin
aviso, así que la app los trata como referencia y respeta lo que el proveedor
devuelva en cada respuesta (headers de cuota y `Retry-After`).

| Proveedor | Política / límites | Retención de datos | Fecha |
|---|---|---|---|
| Groq | https://console.groq.com/docs/rate-limits | Ver términos del proveedor; no se declara retención fija en la doc de límites | 2026-10-04 |
| OpenRouter | https://openrouter.ai/docs/api-reference/limits | Depende del modelo subyacente enrutado | 2026-10-04 |
| Cerebras | https://inference-docs.cerebras.ai/support/rate-limits | Ver términos del proveedor | 2026-10-04 |
| Google Gemini | https://ai.google.dev/gemini-api/docs/rate-limits | Sujeta a las políticas de uso de Google | 2026-10-04 |
| Cloudflare Workers AI | https://developers.cloudflare.com/workers-ai/platform/limits/ | Ver términos del proveedor | 2026-10-04 |
| NVIDIA NIM | https://build.nvidia.com | Ver términos del proveedor | 2026-10-04 |
| HuggingFace | https://huggingface.co/docs/api-inference/rate-limits | Ver términos del proveedor | 2026-10-04 |
| Mistral | https://docs.mistral.ai | Ver términos del proveedor | 2026-10-04 |
| ModelScope | https://modelscope.cn/docs | Ver términos del proveedor | 2026-10-04 |
| SambaNova | https://docs.sambanova.ai | Ver términos del proveedor | 2026-10-04 |
| DashScope | https://help.aliyun.com/zh/dashscope | Ver términos del proveedor | 2026-10-04 |
| Agnes AI | (proveedor propio del autor) | Sin terceros | 2026-10-04 |

## Qué envía la app

Al usar una función con IA (auditoría, captions, copiloto), el texto del párrafo
o el prompt viaja al proveedor elegido. La app **no** envía: imágenes originales
salvo que la función sea de visión, ni el archivo completo. La telemetría es
opt-in y nunca incluye contenido del documento.
