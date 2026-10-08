# MEGA PLAN — Post-mortem real + Blindaje Jarvis (1.0.56 → 1.0.58)

> Origen: primera batalla real. 9 fallos confirmados. Regla de oro que emerge:
> **"Ante la duda, no tocar."** El sistema debe ganar el derecho a tocar cada párrafo.

## Diagnóstico raíz (por qué pasó)

| Fallo reportado | Causa raíz |
|---|---|
| Bibliografía DUPLICADA (+ entradas "(borrador)") | Dos productores de referencias: el del usuario ya tenía "Bibliografía"; el add-in creó su propia zona "Referencias" con placeholders. No hay detección de sección existente con OTRO nombre |
| Título "V. Bibliografía" con sangría 1ª línea | `H1_ROMAN` clasifica bien, pero el branch de heading NO fuerza `firstLineIndent=0` en todos los caminos; y heredó lógica de lista por el "V." |
| Cuerpo sin sangría 1.27 cm / niveles de sangría perdidos | Branches intermedios (list_item, toc_line falsos positivos) se comen párrafos y zero-ean indents; se destruye indentación multinivel preexistente |
| Espacios de más | spaceBefore/After + inserciones; APA7 = spacing 0, solo interlineado doble |
| Portada TOCADA (cursiva) — GRAVE | Fallback offline: si backend no responde, corre el normalizador local completo; su regex de portada falla con portadas tipo UNAN ("Elaborado Por:", tabs, líneas cortas) → startIdx=0 |
| "Título descriptivo de la Tabla 1" huérfano | Caption placeholder sin flujo obligatorio de edición |
| Doble-clic .docx abrió WordAPA vacío | Verbo contextual + ventana quick: si backend ocupado/caído, queda hoja en blanco y el archivo "se lo comió" |
| "Sin clave: modo Reglas (heurístico)" asusta | Mensaje técnico expuesto al usuario final |
| Import dentro de la app falla | Probable crash frontend post-revert (ErrorBoundary) — revisar logs |

## Principio nuevo de arquitectura: **CONSENTIMIENTO POR ZONA**

El normalizador global pasa a ser un PLAN REVISABLE, no una acción ciega:

```
Analizar (siempre, gratis, sin tocar) → Plan por zonas → Usuario aprueba zonas
→ Ejecutar SOLO zonas aprobadas → Reporte de lo hecho
```

Zonas: Portada (NUNCA salvo orden explícita) · Índice · Títulos · Cuerpo ·
Tablas/Figuras · Referencias.

---

## Task 1 — Blindaje de portada (crítico, primero)
1. **Offline = no actúa sobre estructura**: sin respuesta del central, el fallback
   SOLO aplica fuente/tamaño a párrafos > floor-local, y floor-local pasa a ser
   conservador: primera línea que parezca título O cualquier línea >120 chars.
   Si duda → floor=0 y NO toca nada; muestra toast "Abre WordAPA7 para análisis completo".
2. **Portada sagrada incluso online**: si `floor` detecta cover pero las 3 primeras
   líneas no-blanco contienen metadatos universitarios, marcar zona [0..floor) como
   `locked_cover=true` y el ejecutor rechaza ops ahí (doble cerradura cliente+server).
3. Test: repro EXACTO del usuario (UNAN, "Elaborado Por:", tabs) → floor correcto,
   cero cambios en [0..floor).

## Task 2 — Un solo generador de referencias (mata el duplicado)
1. ANTES de crear zona "Referencias": buscar sección existente
   `Bibliografía|Referencias|Bibliography` → si existe, ESA es la zona; jamás crear otra.
2. Prohibido insertar placeholders "(borrador)" desde el add-in. Citas vivas solo
   agregan refs RESUELTAS (con datos reales). Si Crossref falla → cola sugerencias.
3. Merge: entradas existentes del usuario son fuente de verdad; las nuestras solo
   complementan las faltantes, dedupe por (primer autor, año).
4. Test: doc con "Bibliografía" poblada → 0 duplicados, 0 placeholders.

## Task 3 — Títulos intocables en indentación + jerarquía fiel
1. Todo rol heading*: `firstLineIndent=0, leftIndent=0, rightIndent=0, spaceBefore/After=0`
   SIEMPRE (una sola función `applyHeading(p, lvl)`).
2. `H1_ROMAN` deja de alimentar lógica de listas: los branches de lista ignoran
   texto que ya fue clasificado heading.
3. **Preservar indentación multinivel preexistente** en cuerpo: si el párrafo ya
   tiene leftIndent>0 propio (sub-niveles), solo ajustar firstLine relativo, no resetear.

## Task 4 — Cuerpo APA exacto
1. Sangría 1ª línea 0.5"/1.27cm en body ✓ pero SOLO si leftIndent==0 (no romper niveles).
2. `spaceBefore/After=0`, lineSpacing=2.0 — nunca insertar párrafos vacíos.
3. Auditoría anti-falso-positivo para toc_line/list_item antes de clasificar
   (exigir longitud mínima y contexto).

## Task 5 — Captions con consentimiento (UI nueva)
1. Placeholder actual reemplazado por estado "pendiente": caption gris `[Sin título]`.
2. **Panel contextual** (ver Task 8): al seleccionar tabla → tarjeta "Tabla 3 sin
   título" → input editable + botón "Sugerir con IA" (`suggest-caption`) +
   selector de estilo: **Compacta / Estándar / Extendida** (los 3 estilos del editor).
3. Nada se inserta sin Aplicar. Contador central reserva el número aunque esté pendiente.

## Task 6 — Asociación de archivos + quick window a prueba de tontos
1. Verbo "Convertir a APA 7": añadir `"ExtendedUserInvocation"`? No — mejor:
   asegurar que JAMÁS sea default: no escribir shell default value; añadir al comando
   flag `--quick` YA existe. Añadir en quick-window: banner "Abriendo: <nombre.docx>"
   + si backend caído → botón "Abrir en Word" (ShellExecute word /q /n "%1") y
   mensaje claro. Nunca pantalla vacía muda.
2. App principal: import roto → revisar `/api/upload` + logs renderer; añadir
   toast de error visible (no silencio) y retry.

## Task 7 — Mensajes humanos
- "Sin clave: modo Reglas" → ocultar tras setting avanzado; en UI: "Modo offline:
  reglas locales (recomendado añadir clave IA para sugerencias)".
- Todos los mensajes del add-in: tono Jarvis calmado, cero tecnicismos.

## Task 8 — Panel contextual inteligente (la joya)
Selección en Word (`onSelectionChanged`) → panel se adapta:
- Texto seleccionado → "¿Qué hago?" : [Formatear APA] [Clasificar título] [Quitar
  formato] + medidor "¿Qué tan APA está?" (score 0-100 con desglose) + sugerencias
  aplicables con [Aplicar] por ítem.
- Tabla seleccionada → Task 5 UI.
- Imagen → caption Figura N + leyenda IA.
- Sin selección → estado Jarvis normal.
Switch Jarvis sale de la UI (queda interno ON); se controla desde Configuración avanzada.

## Task 9 — Biblioteca de portadas
- Carpeta `%APPDATA%\WordAPA7\cover-templates\` + UI en app: subir .docx de portada
  propia → si al importar NO se detecta portada, ofrecer "Pegar plantilla X"
  (inserta la portada ANTES del contenido, intacta, y recalcula floor).

## Gates por versión
- **1.0.56**: Tasks 1+2+3 (blindajes críticos) + tests reproducción EXACTA del caso UNAN
- **1.0.57**: Tasks 4+5+6 (cuerpo fiel, captions consentidas, asociación segura)
- **1.0.58**: Tasks 7+8+9 (panel contextual, biblioteca, mensajes)
Cada versión: pytest+vitest+tsc+NSIS+manifest intacto verificado en unpacked.

## Investigación relacionada (riesgos vecinos detectados)
- Word JS `getRange('Start')+'Before'` en tablas anidadas puede lanzar InvalidArgument
  → envolver try por tabla (ya) + log a client-log para telemetría de fallos reales.
- Polling Jarvis sobre docs enormes (>300 párrafos): mover hash a `body.paragraphs.length`
  + último párrafo ya lo hace; añadir guard si >800 párrafos → poll 30 s.
- Múltiples instancias backend (app + watcher + quick) → single-instance lock por
  puerto ya existe; quick window debe REUSAR, nunca spawn segundo.
