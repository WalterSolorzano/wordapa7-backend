# Diseño — Mapa de IA como perfil completo del documento (fase Revisión & IA)

Fecha: 2026-10-05
Estado: propuesta para revisión del usuario
Rama: `feat/motor-render-fase1`
Mockup fuente de verdad: `docs/superpowers/mockups/2026-10-05-mapa-ia-A-vs-B.html` (opción B elegida)
Prompt de diseño reutilizable: `docs/superpowers/mockups/2026-10-05-mapa-ia-design-prompt.md`

## 1. Objetivo

Que el mapa de IA deje de ser un subproducto de los hallazgos y pase a ser **el perfil real
del documento**: todos los párrafos medidos, ubicados por fase a lo largo del eje 0–100,
en un único lenguaje visual que no puede contradecir al hero ni a la lista de Revisión.

Éxito medible:

- El hero, el mapa y la lista de hallazgos cuentan **lo mismo** porque derivan del mismo dato.
- Ningún párrafo medido queda sin representar ni rotulado como "sin medición".
- El autor ve de un vistazo qué fases concentran voz sintética y puede saltar al párrafo.

## 2. Intención del usuario (verbatim)

- Ante "¿Qué hago con la fase Revisión & IA?": **"1 y 3"** — (1) arreglar la causa raíz del mapa,
  (3) rediseño visual versionando primero un mockup como fuente de verdad y recién después implementar.
- Ante la forma del mapa: **"Perfil completo del documento"** — el mapa representa **todos** los
  párrafos medidos (score 0–100) por fase, no solo las alertas.
- Ante A vs B: **"me quedo con B"** — A descartada por ineficiente en vertical (filas de ~34px
  para dar solo conteos frente a las ~21px de B, que además dan la posición exacta de cada párrafo).

## 3. Causa raíz (verificada, con líneas)

El backend **no** omite `ai_score`: `analyze_ai_risk` calcula `score` y `category` juntos
(`python/classification/ai_detector.py:843-857`); el endpoint los copia juntos
(`python/main.py:2941-2942,2977-2978`). El mapa está incompleto por **tres desajustes**:

1. **Fuente equivocada.** El mapa se arma desde `AuditItem[]` (solo hallazgos), no desde
   `reviewResult.paragraphs[]` (documento completo). `AiHierarchy.tsx:253-263` pasa a
   `construirHeatmap` solo los `findings` de las subsecciones.
2. **Piso de banda mal puesto.** `RANGOS_IA = [45,60,75,90]` (`src/lib/aiHeatmap.ts:3`); todo
   `score < 45` va a `sinMedir` (`:32-35`). Pero el motor categoriza **MEDIUM desde 20**
   (`ai_detector.py:846-849`) y el filtro de hallazgos admite cualquier MEDIUM
   (`src/lib/auditItems.ts:258`). Los párrafos 20–44 entran como alerta en el hero y el mapa
   los tira como "sin medición" — falso: tienen score, está bajo 45.
3. **Etiqueta mentirosa.** `AiHeatmap.tsx:41-45` rotula "N párrafos sin medición numérica
   (clasificados sin score)".

Además, el hero usa una fórmula distinta: `(total − flaggeados)/total`
(`AiHierarchy.tsx:287-290`) y `chapterIaScore = items/párrafos` (`:231-236`), que no es el
score del párrafo. Con tres fuentes, la contradicción es estructural, no un bug puntual.

## 4. Contrato de datos — fuente única

Un selector nuevo `perfilIA` (en `src/lib/`), construido **solo** desde
`reviewResult.paragraphs[]` (score `ai_score` 0..100 y `ai_category`) + `elements`
(para mapear cada párrafo a su H1). Reusa el mapeo ya existente:
`seccionesDeElementos` (`src/lib/jerarquia.ts:541-558`) o `construirJerarquia`
(`:419-474`), no una agrupación inline nueva.

Forma:

```
PerfilIA = {
  filas: FilaPerfilIA[];   // una por H1, en orden documental; sin H1 → una fila "Documento completo"
  maxParrafosEnBanda: number;
  total: number;           // párrafos medidos
  porBanda: [number, number, number, number];
  rigidezMedia: number;    // round(media de scores 0..100)
}
FilaPerfilIA = {
  h1Id: string; titulo: string; fase: string | null;
  parrafos: { elementId: string; index: number; score: number; categoria: 'LOW'|'MEDIUM'|'HIGH';
              excerpt: string; findingId?: string }[];
  porBanda: [number, number, number, number];
}
```

Hero, mapa y la severidad de la lista leen de `perfilIA`. Ninguna vista vuelve a
recalcular conteos por su cuenta.

**Escala:** el único lugar donde se normaliza `ai_score` es este selector, y se documenta que
`AIReviewParagraph.ai_score` es 0..100 mientras `ElementModel.ai_score` es 0..1
(homónimos; `python/models.py:499` vs `src/api/backend.ts:907`). El perfil usa la escala 0..100
del revisor.

## 5. Bandas y umbrales — unificación

Verdad del motor: LOW `<20`, MEDIUM `≥20`, HIGH `≥50`. Bandas del perfil, alineadas a eso:

| Banda | Rango | Color (tokens) |
|---|---|---|
| Baja | 0–19 | `--color-text-tertiary` |
| Media | 20–49 | `--color-engine-ia-a40` |
| Alta | 50–74 | `--color-engine-ia-a65` |
| Crítica | 75–100 | `--color-engine-ia` |

Se elimina el `45` como umbral de bucketing. Definiciones que hoy chocan y quedan unificadas:
`AI_PARAGRAPH_THRESHOLD = 45` (`auditItems.ts:204`), `flagged_count >= 40` (`main.py:2982`),
inspector 50/20 (`ProactiveSuggestionCard.tsx:71`). **Alerta** pasa a significar `score ≥ 50`
(Alta o Crítica), de modo que el número de alertas del hero sea, por construcción, el de las
bandas Alta+Crítica del mapa.

## 6. Cambios por componente

- **`src/lib/aiPerfil.ts` (nuevo).** El selector `perfilIA` + `bandaDe(score)` + constantes de bandas.
  Fuente de la normalización.
- **`src/components/review/AiProfile.tsx` (nuevo).** Opción B: una fila por fase; pista 0–100 con
  marcas en 20/50/75; un punto por párrafo (color = banda, `title` = extracto, clic = salta al
  párrafo); etiqueta derecha con `n` en Alta+Crítica. Sin cards, sin barras.
- **`src/components/review/AiHierarchy.tsx` (editar).** Reemplaza el bloque heatmap+grid por
  `<AiProfile>`; hero lee de `perfilIA`; al abrir una fase usa el `AiChapterFocus` existente.
- **`src/components/review/AiRoom.tsx` (editar).** Revivir `segmentsFromParagraphs` (`:19-41`,
  hoy código muerto) o delegar en el selector; deja de ser solo puerta de vacío.

Eliminar:

- `src/components/review/AiHeatmap.tsx` (opción A, rechazada).
- `src/components/review/AiChapterGrid.tsx` (sus barras horizontales violan la regla del proyecto).
- `src/lib/aiHeatmap.ts` + `src/__tests__/aiHeatmap.test.ts`.
- La etiqueta "sin medición numérica".

## 7. Hero

Derivado de `perfilIA`, mismo dato que el mapa:

- Voz humana = `100 − rigidezMedia`.
- Rigidez media = media de `ai_score` (0..100).
- Párrafos medidos = `total`.
- Con rigidez alta (≥50) = bandas Alta+Crítica.

Cambia la semántica actual (`(total − flaggeados)/total`). Se elige la media porque es monótona
con el eje del mapa; la fórmula vieja puede bajar aunque un párrafo empeore.

## 8. Casos borde

- **Párrafos <15 chars:** el motor no los mide (`main.py:2938-2939`); se excluyen del perfil y no
  se cuentan en `total`. No se rotula nada como "sin medición".
- **Fase sin párrafos** (p. ej. Bibliografía sin texto medido): fila presente, pista vacía, `0`.
- **Documento sin H1:** una sola fila "Documento completo" (comportamiento de `segmentsFromParagraphs`).
- **Colisión de puntos:** si una fase supera ~40 párrafos en una banda, la pista se ensancha en
  subcarriles (2–3 filas) al seleccionar la fase; no se cambia el tamaño del punto. A definir en el plan.
- **Portada:** zona protegida; solo se mide, nunca se escribe (coherente con las reglas de fase).

## 9. Testing

- **Paridad hero↔mapa:** mismo `perfilIA` → contar bandas del mapa == números del hero. Es el test
  que fija la causa raíz.
- **Nada se pierde:** todo párrafo de `reviewResult.paragraphs` (len≥15) cae en exactamente una
  fila y una banda; cero "sin medición".
- **Bordes de banda:** 19/20/49/50/74/75.
- **Escala:** `ai_score` 0..100 se usa directo; un valor fracción (0..1) no se multiplica por 100.
- Actualizar/eliminar los tests que fijan 45 o las 4 columnas viejas.

## 10. Fuera de alcance

- Tocar el motor de detección (`ai_detector.py`) o los umbrales LOW/MEDIUM/HIGH.
- El Action DSL del copiloto y las pantallas distintas del mapa.
- Cambiar `ReviewGate` (matriz fase×motor): ya es correcta.

## 11. Decisiones (aprobadas 2026-10-05)

1. **Alerta = score ≥ 50** (Alta+Crítica). **CONFIRMADO.**
2. **Voz humana basada en la media del score.** Aprobado.
3. **Eliminar `AiChapterGrid`** y dejar `AiChapterFocus` como detalle. Aprobado.

## 12. Reglas de presentación (del usuario — vinculantes para este rediseño)

1. **Sin listas.** El perfil es una superficie visual (puntos sobre eje), no una lista de filas con
   texto. Los números viven en el hero y en la etiqueta de cada fase.
2. **No volcar información que exige atención.** Nunca mostrar a la vez el párrafo + hallazgo +
   sugerencia + contexto. Un elemento a la vez; el detalle se abre solo cuando se pide.
3. **Icono antes que texto.** Donde un icono de `lucide-react` ahorre una palabra, va el icono. La
   leyenda de bandas usa swatch de color, no rótulos largos; la etiqueta "sin medición numérica"
   desaparece (además de falsa, es texto).
4. **Animación para que no pese.** Transición de bandas, aparición de puntos y foco con movimiento
   sutil; respetar `prefers-reduced-motion`.
5. **De lo general a lo específico.** Hero (documento entero) → perfil por fase → párrafo. Cada
   nivel agrega detalle; ninguno repite lo del nivel anterior.
6. **Desplegables cerrados por defecto.** Si el detalle de fase se usa como recurso, no se abre solo;
   el autor lo abre.

Alcance: estas reglas rigen el mapa de IA. "Usar todos los motores" se lee como el conjunto de la
superficie de Revisión (ortografía, Bloom, estructura, citas, IA) con este mismo lenguaje
general→específico; **este spec no agrega motores nuevos al mapa** (fuera de alcance, §10).
