# Handoff de Rediseño: Revisión & IA (Paso 5 — WordAPA7)

> **Documento de Continuación Técnica e Implementación**  
> **Fecha:** 2026-09-30  
> **Estado:** Mockup de alta fidelidad aprobado en `src/components/review/mockup/ReviewMockupStudio.tsx`.  
> **Objetivo del nuevo chat:** Trasladar la arquitectura y diseño validados a los componentes productivos de la aplicación (`ReviewWorkbench.tsx`, `ReviewStrip.tsx`, `EngineGroupCard.tsx`, `AiMosaic.tsx` / `AiHierarchy.tsx`).

---

## 1. Resumen Ejecutivo y Decisiones Clave Aprobadas

1. **Mesa de Revisión por Lotes (Batch Actions)**:
   - Resuelve el cuello de botella de documentos extensos (100+ páginas).
   - Sustituye el flujo de "aceptar 1 a 1" por **resolución masiva en bloque** para motores objetivos (ortografía, tildes, mayúsculas en títulos).
   - Acciones individuales reflexivas ("Aceptar sugerencia", "Marcar para revisar", "Descartar") disponibles al inspeccionar cada regla.

2. **Navegación Ergonómica por Capítulos (Minimapa Izquierdo)**:
   - Se descartó la grilla abstracta de puntos de colores sueltos.
   - Navegación agrupada por **Capítulos / Fases (H1)** que cubre las 104 páginas con leyenda explícita de colores por motor.
   - Micro barras de calor (*heatbars*) que indican cantidad y tipo de incidencias por capítulo con salto instantáneo de página.

3. **Mapa y Dashboard de IA Jerárquico (H1 → H2 → H3)**:
   - Se descartó el histograma plano estático.
   - **Macro Dashboard**: Termómetro de integridad global (82% Voz Autoral Humana vs 18% Sintética), contador de párrafos analizados, párrafos críticos y capítulo con pico anómalo.
   - **Árbol de navegación interactivo**: Clic en un H1 despliega sus subsecciones H2 y H3 con su respectivo porcentaje de densidad de IA.
   - **Split Inspector anti-saturación**: Selector de alertas por pastillas en vez de volcado masivo de párrafos. Visor comparativo lado a lado (*Texto Original con fórmula LLM* vs *Propuesta de Autor Humano*) con botones `Reemplazar en Manuscrito` y `Copiar`.

4. **Estilo Visual del Manuscrito (Referencia Imagen de Usuario)**:
   - Tipografía editorial académica con interlineado riguroso.
   - Resaltados oracionales precisos con fondo suave y subrayado continuo (`border-bottom: 2px solid var(--color-accent)`) para fragmentos prioritarios, y subrayado punteado (`border-bottom: 2px dashed var(--color-text-secondary)`) para conclusiones o advertencias reflexivas.

5. **Integración de Mascota Editorial (`EditorialMascot.tsx`)**:
   - Uso activo de la mascota SVG nativa (`EditorialMascot`) con variantes de estado:
     - `kind="highlighter"` / `expression="curious"` o `expression="happy"` en la mesa de revisión.
     - `kind="strike"` para ortografía y mecánica.
     - `kind="ruler"` para jerarquía H1-H5.
     - `kind="reference"` para citas y bibliografía.
     - Expresiones reactivas al estado del documento (`happy` al aplicar correcciones, `worried` ante picos de IA >50%).

---

## 2. Los 5 Motores de Revisión en Orden Estricto de Prioridad

El orden de visualización y ejecución va de los más objetivos/deterministas a los probabilísticos:

| Prioridad | Motor | Engine ID | Detecciones | Tipo de Poder / Acción |
|---|---|---|---|---|
| **1 (Máxima)** | **Ortografía & Mecánica** | `spelling` | Faltas RAE, tildes diacríticas y esdrújulas, texto pegado sin espacios. | **Acción masiva segura (`acceptMany`)** o individual. Reemplazo determinista directo en el `.docx`. |
| **2** | **Estructura & Títulos APA 7** | `structure` | Jerarquía H1-H5 rota, mayúsculas sostenidas prohibidas (§2.27), tablas y figuras sin rotular. | **`autoCaptionAll`** para rotulado automático (*Tabla N / Figura N / Nota*). Portada protegida (`read_only`). |
| **3** | **Citas & Referencias** | `citations` | Citas fantasma en el cuerpo del texto, referencias huérfanas en bibliografía, cifras sin fuente. | **`autoResolveGhosts`** (búsqueda y generación automática de referencias). |
| **4** | **Redacción & Taxonomía de Bloom** | `style` | Verbos memorísticos en objetivos específicos (restringido a Fase Objetivos), voz pasiva acumulada, giros coloquiales, párrafos extensos. | **Revisión reflexiva (`mark`)** y reescritura asistida por IA (`api.rewriteText`). No aplica masivo a ciegas. |
| **5 (Reflexivo)** | **Detección de IA & Fórmulas LLM** | `ai` | Patrones sintéticos probabilísticos: oraciones espejo, muletillas de LLM, n-gramas repetitivos, monotonía de perplejidad. | **PROBABILÍSTICO**. Prohibido auto-aceptar a ciegas. Solo marcar (`mark`) y proponer paráfrasis con voz de autor humano. |

---

## 3. Estado Técnico del Código Actual

- **Mockup Funcional Aprobado**: `src/components/review/mockup/ReviewMockupStudio.tsx`
  - 100% libre de colores hex literales y radios arbitrarios.
  - Pasa con éxito todas las 29 pruebas de `noHardcodedColors.test.ts`.
  - Pasa validación de tipos `npx tsc --noEmit`.
  - Grafo de conocimiento de Graphify actualizado (`graphify update .`).
- **Servidor Web Activo**: `http://localhost:5173/` (`vite.config.ts` con `$env:WEB_ONLY="true"`).

---

## 4. Plan de Acción para el Nuevo Chat (Traslado a Producción)

Para ahorrar tokens y trabajar con máxima precisión, el nuevo chat debe ejecutar estos 4 pasos quirúrgicos:

1. **Paso 1: Barra Superior y Modos de Vista (`ReviewStrip.tsx` & `ReviewWorkbench.tsx`)**:
   - Integrar selector de 2 vistas en la cabecera: `Mesa por Lotes` vs `Mapa de IA Jerárquico`.
   - Conectar filtros de motor respetando el orden estricto de prioridades (1: Ortografía → 2: Estructura → 3: Citas → 4: Bloom/Estilo → 5: IA).
   - Incorporar `EditorialMascot` en la cabecera o estados vacíos.

2. **Paso 2: Conexión Real de Acciones Masivas (`useReviewActions.ts`)**:
   - Conectar el botón `Aplicar corrección masiva` a `acceptMany(items)` para el motor de ortografía y títulos APA 7.
   - Asegurar que el cerrojo `isApplying` impida dobles escrituras concurrentes.
   - Sincronizar descartes con el store (`dismissComment`) para limpiar tanto el rack como los subrayados y burbujas.

3. **Paso 3: Manuscrito Reactivo con Subrayados APA 7 (Imagen de Referencia)**:
   - Aplicar el estilo de resaltado continuo para alertas prioritarias y punteado para notas reflexivas.
   - Enlazar la selección en el rack con el scroll y foco del párrafo correspondiente en el lienzo/manuscrito.

4. **Paso 4: Componente Jerárquico de IA (`AiHierarchy.tsx`)**:
   - Reemplazar el antiguo `AiMosaic.tsx` por el nuevo `AiHierarchy.tsx` con navegación H1 → H2 → H3.
   - Conectar el visor split comparativo con el backend (`api.rewriteText` o paráfrasis asistida) con botones de `Reemplazar en documento` y `Copiar`.
