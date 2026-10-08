# Cumplimiento, privacidad y transparencia de cuota en el motor de IA

> **Estado: diseño aprobado, listo para plan.** Completa lo que el Spec 2 arregla
> por el lado técnico: aquí se le dice al usuario, en la cara, a dónde va su
> texto, cuánta cuota le queda y cómo elegir no salir de su máquina.

## El defecto que este ciclo viene a cerrar

El motor ya envía el texto del documento a proveedores externos:
`execute_with_specialty` recibe `prompt` con texto real de párrafos
(`llm_classifier.py` L508-529, `ai_client.py` L378-386). Existe un diálogo de
consentimiento (`LLMConsentDialog.tsx`) que lo menciona al ejecutar una acción IA,
pero:

- **L1 — La pestaña Conexión no avisa que el texto sale a terceros.** Solo tiene
  una nota sobre claves en texto plano (`ConexionTab.tsx` L247-265). El usuario
  que configura una clave ahí no lee en esa pantalla a dónde va su documento.
- **L2 — No hay política por proveedor registrada.** No existe ningún documento
  versionado con las condiciones de uso y retención de cada proveedor, con fuente
  y fecha. Sin eso, "cumplir las leyes" es una intención sin respaldo.
- **L3 — No hay visibilidad de cuota.** El usuario no puede ver "llevás X de Y
  hoy" ni "al proveedor Z le queda W". Los cooldowns viven solo en memoria del
  backend (`ai_client.py` L76, L283-306) y no se exponen.
- **L4 — El modo local es un campo de URL genérico.** `useLocal` acepta un
  endpoint OpenAI-compatible (`ConexionTab.tsx` L236-237) pero no hay una opción
  clara de "Ollama local" con detección, ni se distingue del proveedor de nube
  `ollama_cloud` que aparece en el mismo catálogo (`proveedoresIA.ts` L103-107),
  lo cual confunde: dos "Ollama" con semántica distinta.

## D1 — Aviso de envío de texto en la pestaña Conexión

La pestaña Conexión (`src/components/settings/tabs/ConexionTab.tsx`) suma, junto
a la nota de seguridad de claves, un aviso claro de privacidad:

- Qué se envía: el texto de los párrafos que la IA analiza.
- A quién: el proveedor configurado y, en failover, los de la cadena.
- Que existe una alternativa que no envía nada: el modo local / heurístico.
- Sin emojis; solo íconos `lucide-react` y tokens CSS.

El aviso es complementario al `LLMConsentDialog` existente; no lo reemplaza. El
diálogo pide permiso al ejecutar; la pestaña informa al configurar.

## D2 — Documento versionado de políticas por proveedor

Se crea (y versiona) un documento de políticas con, por proveedor:

- Condiciones de uso y política de privacidad (URL).
- Política de retención y entrenamiento con datos enviados, si la declara.
- Límites oficiales y su fuente (enlaza con la tabla del Spec 2, D1).
- Fecha de última verificación.

El doc vive con fuentes fechadas porque las políticas cambian. El plan decide su
ubicación (`docs/` o un módulo de datos que la UI pueda leer para mostrar un
enlace por proveedor).

## D3 — UI de cuota y estado por proveedor

Los datos que el Spec 2 empieza a producir (consumo diario local, cuota real de
OpenRouter, cooldowns que respetan `Retry-After`, headers `x-ratelimit-*`) se
exponen en la UI:

- **En la pestaña Conexión**, por proveedor: "X/Y hoy · restante del proveedor: Z"
  cuando se conoce, o "consumo local: X hoy" cuando el proveedor no expone cuota.
- **Estado de cooldown visible**: un proveedor en espera por 429 o por cupo
  agotado se muestra como tal, con el motivo legible que ya existe
  (`_MOTIVO_DE_ESTADO`, `main.py` L1227-1232), en vez de solo fallar al probarlo.
- **`AIBatteryIndicator`** hoy muestra salud por especialidad (FAST/HEAVY/lógico),
  no por proveedor. El plan decide si la cuota entra ahí o en la pestaña Conexión;
  la recomendación es la pestaña, que es donde se administran las claves.

Nada de esto expone el valor de la clave, solo su estado y su consumo.

## D4 — Modo local explícito, con Ollama claro

La opción de modo local se vuelve explícita:

- Etiqueta clara de "procesamiento local" frente a "proveedor en la nube".
- Detección o sugerencia de Ollama en `localhost:11434` (el puerto por defecto),
  sin obligar a saber la URL.
- Desambiguar `ollama_cloud` (proveedor de nube del catálogo) del Ollama local:
  son dos cosas distintas y la UI debe nombrarlas como tales.

El modo local se mantiene como endpoint OpenAI-compatible (no se ata a un solo
motor), pero deja de ser un campo de URL huérfano.

## Reglas innegociables que aplican

- **Cero emojis en toda la UI**; solo íconos vectoriales `lucide-react`.
- **Solo variables CSS** (`var(--accent-primary)`, `var(--text-main)`,
  `var(--border-subtle)`, `var(--paper-white)`, `var(--paper-ink)`); prohibido
  hex hardcodeado.
- La telemetría existente (`src/telemetry/client.ts`) sigue siendo opt-in y sigue
  **sin enviar contenido de documento ni prompts**; este ciclo no la toca.

## Fuera de alcance

- Cifrado de claves en reposo o puente IPC para secretos (mencionado en
  `docs/superpowers/plans/2026-09-28-f8-llm.md` L475-479 como pendiente). Es otro
  ciclo.
- Registro histórico de qué prompt fue a qué proveedor. Solo se expone estado y
  consumo, no un log de contenido.

## Criterios de aceptación

1. La pestaña Conexión muestra un aviso claro de que el texto del documento se
   envía a terceros, con alternativa local, sin emojis ni hex.
2. Existe un documento versionado de políticas por proveedor, con URL y fecha.
3. La UI muestra consumo y cuota por proveedor cuando se conocen, y el estado de
   cooldown con motivo legible.
4. El modo local se presenta como opción explícita y distingue Ollama local de
   `ollama_cloud`.
5. Tests de UI (Vitest) cubren el aviso y la visualización de cuota; `npm test`
   en verde.
