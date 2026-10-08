# AGENTS.md — Directrices Técnicas y Reglas del Proyecto

## 1. Reglas Estrictas de Producto y Diseño (Innegociables)
- **Cero Emojis en toda la App**: Queda estrictamente PROHIBIDO usar emojis en cadenas de texto de la UI, botones, toasts, diálogos, comentarios de IA o plantillas. Usar exclusivamente íconos vectoriales SVG de `lucide-react`.
- **Paleta y Design Tokens**: Usar únicamente variables CSS (`var(--accent-primary)`, `var(--text-main)`, `var(--border-subtle)`, `var(--paper-white)`, `var(--paper-ink)`). Prohibido hardcodear colores hex.
- **Fidelidad de Papel APA 7**: En Modo Claro y Modo Oscuro, el fondo de la hoja (`--paper-white`) es siempre papel blanco puro (`#ffffff`) con tinta nítida (`--paper-ink: #111827`). El fondo exterior (*canvas backdrop*) adopta `--canvas-bg`.
- **Protección e Indivisibilidad de Portada Original**:
  - `use_original_cover: true` jamás debe mutar ni dañar la portada del documento original del usuario.
  - En el lienzo (`PaperCanvas.tsx`), `computePages` debe agrupar **todos** los elementos con `is_cover_section` o `portada_block` en la Página 1 de forma indivisible (nunca partirlos en página 2).
- **Control COM de Microsoft Word**:
  - Word COM debe inicializarse **100% bajo demanda (*lazy on-demand*)**, NUNCA de forma ansiosa en el startup lifespan de FastAPI.
  - Toda instancia COM debe mantener `Visible = False` y `DisplayAlerts = 0`.
- **Reasignación de Espacio (LAYOUT POR TAREA)**:
  - Vista **Revisión & IA** (`Step5AuditIAWizard.tsx`): son **dos salas separadas** con patrón dashboard→detalle. La **puerta** (`ReviewGate`) combina revisión e IA en un único % 70/30; la **Sala de Revisión** (motores objetivos) y la **Sala de IA** (detector probabilístico) NO mezclan sus hallazgos. Una superficie de nivel N navega al nivel N+1, no lo renderiza dentro.
  - Motores **objetivos** (ortografía, Bloom, estructura, citas) → "Aceptar / Aceptar todas"; motor **probabilístico** (detector de IA) → SOLO "Marcar para revisar", nunca "Aceptar". La portada (`read_only`) no ofrece botón de aceptar.
  - Vista **final de exportación** (`ExportView.tsx`): columna única alineada a la IZQUIERDA, orden icono → título → una línea ≤50ch → dos botones pegados (sólida + fantasma). Sin listas, tarjetas, columnas ni scroll; formato/opciones/vista previa bajo toggle. NUNCA repetir aquí resúmenes de hallazgos ni estadísticas.
- **El rail no puede contradecir la pantalla a la que lleva**: el conteo de pendientes de cada fase se deriva UNA sola vez (`lib/railPending.ts`, sobre la lista de `lib/auditItems.ts`, que es la MISMA que abre el workbench de Revisión) y lo consumen el rail, su flyout y el atajo de teclado. Si se agrega un motor a la pantalla de Revisión, entra a esa lista compartida, nunca a un conteo local. Igual con la geometría: un destino del rail es una fase del editor, así que un clic en él también vuelve a `viewMode: 'edit'`.
- **Ámbitos de fase y reglas de dos capas** (spec: `docs/superpowers/specs/2026-09-27-taxonomia-por-fase-design.md`):
  - Los títulos de **nivel 1 son las fases** del documento. Cada fase tiene sus propios criterios; el resto del documento tiene reglas generales (el detector de IA entre otras). El ámbito de una regla es un **dato declarado** en `RULE_SCOPES` (`python/modules/phase_scope.py`), y `test_rule_scopes.py` falla si el auditor emite un `kind` sin declarar.
  - **NUNCA** decidir el ámbito de un elemento buscando palabras en su texto. `proactive_auditor.py` lo hacía con `any(kw in low_t ...)` y `"meta"` estaba dentro de "me·ta·dología", así que un párrafo sobre metodología disparaba la regla de objetivos. La comparación ocurre **solo sobre el título de un H1** (`match_phase`), nunca sobre el cuerpo de un párrafo.
  - Un **H2 hereda** el ámbito de su H1 ancestro: no abre ámbito propio ni endurece criterios. El mapa de ámbitos se construye solo con H1, así que no hay anidamiento ambiguo. Antes del primer H1, el ámbito es `portada`.
  - Para **corregir niveles de título** el editor usa `match_phase_exact`, no `match_phase`: un H2 que dice "Resultados" a secas es una fase mal nivelada y se promueve, pero "Resultados de la encuesta" lleva un calificador que avisa de que el autor quiso decir algo concreto, y se deja quieto.
  - La **Portada se mide pero no se escribe**: sus criterios son de solo lectura, llegan a Revisión con `read_only=True`, nunca traen `suggestion` y **no ofrecen botón de aceptar** ni en masa ni individual. Que sea zona protegida significa que nadie *escribe* en ella, no que nadie la mire. `use_original_cover` no puede mutar la portada original y `computePages` la trata como bloque indivisible; ninguna regla de fase puede romper ninguna de las dos. Los criterios de título exigen `is_cover=True`: el ámbito `portada` también cubre "todo lo anterior al primer H1", y sin esa guarda cada párrafo terminado en punto se reportaría como un título mal escrito.
  - La revisión nombra la fase como **línea de contexto** y la deja filtrar por chip. El filtro de fase se intersecta en `visibles` (`useReviewWorkbench.ts`), no en la vista, para que "Siguiente hallazgo" lo respete por construcción. Los conteos de los chips salen de `allPhases` (derivados de los hallazgos completos), nunca de un re-derivado en la tira. El modo de lectura ya no es "un párrafo a la vez": la vista es un dashboard con detalle, y el layout de tres columnas dejó de estar prohibido.

## 2. Metodología de IA Proactiva y Copiloto Editorial
- **Copiloto Editorial IA (`LiveChatDrawer.tsx` / `ai_document_editor.py`)**: Asistente conversacional siempre disponible en la barra superior (`UnifiedToolbar.tsx`) que ejecuta transformaciones en tiempo real mediante un Action DSL seguro.
- **Auditorías Proactivas en Background**:
  - Al cargar un documento (`uploadFile` en `useDocStore.ts`), se disparan automáticamente en segundo plano:
    1. `runProactiveAudits()`: Auditoría de citas fantasmas y referencias huérfanas.
    2. `runProactiveAutoCaptioning()`: Detección y sugerencia de leyendas APA 7 (Figura N / Tabla N / Nota) para imágenes y tablas sin rotular.
    3. `runProofreadBatch()`: Detección de patrones y frases generadas por IA, texto pegado sin formato y errores ortográficos.
  - **Sincronización de Comentarios**: un hallazgo se muestra en DOS canales a la vez — el subrayado inline del texto y la burbuja del gutter — y tienen que decir lo mismo. Ambos leen el mismo contexto: lo construye `buildCommentContext` (`src/lib/commentContext.ts`) y lo consumen `ReadingText` (`src/components/review/ReadingText.tsx`, único responsable de los resaltados inline; los colores salen de `MARK_STYLE`, solo tokens) y `WhatsAppComment`. **Regla para quien toque cualquiera de los dos**: nada de normalizar `commentCtx` en el punto de uso (eso vive en `buildCommentContext`), nada de decidir "este tipo de elemento no lleva subrayado" solo en un canal, y nada de descartar (`dismissComment`) por un lado y no por el otro. Si agregás un resaltado inline, va por `ReadingText`; si agregás un tipo de comentario, verificá que `ReadingText` lo subraye y que `ReadingText` no subraye nada que no tenga burbuja.
  - La **fase** de un hallazgo viaja en `ProofreadFinding.phase` y llega a la vista por `AuditItem.phase`. Deliberadamente **no** se agrega a `WhatsAppContext`: la burbuja recibe la bandera `styleAuditRun`, no los hallazgos, y no nombra fases. Eso es correcto, porque una burbuja que no nombra la fase no puede contradecir al subrayado. Lo que sí tiene que seguir siendo cierto es que un hallazgo de fase **se anuncie** en la burbuja como cualquier otro (lo fija `commentContext.test.ts`): si las reglas de fase tomaran un camino propio y dejaran de habilitar `styleAuditRun`, el hallazgo quedaría subrayado en un canal y mudo en el otro, que es exactamente lo que el párrafo anterior prohíbe.

## 3. Stack Tecnológico
- **Frontend**: React 18, TypeScript, Vite 5, Zustand (`useDocStore.ts`), Lucide React.
- **Backend**: Python 3.11+, FastAPI (puerto 8742), `python-docx`, `uvicorn`.
- **Multi-Provider AI**: Router balanceado (`python/modules/ai_client.py`) con soporte para NIM, Groq, Cerebras y Ollama con failover automático.
- **Instalador NSIS**: `electron-builder.yml` asistido (`oneClick: false`) que instala la App de escritorio y registra el Complemento de Word, con purga de caché `Wef` en la desinstalación.

## 4. Comandos de Desarrollo y Verificación
```bash
# Backend
python python/main.py
# Frontend dev (proxy /api a :8742)
npm run dev
# Tests
npm test              # Vitest (frontend: 125 tests)
pytest python/tests/  # pytest (backend: 514 tests)
# Build de producción e instalador
npm run build
powershell -ExecutionPolicy Bypass -File build-installer.ps1
```

## 5. Navegación Arquitectónica con Graphify y Ahorro de Tokens
- **Activación Prioritaria de Skills**: Si se solicita ahorrar tokens o usar skills, consultar primero con `view_file` el `SKILL.md` pertinente (p. ej. `token-saver`, `systematic-debugging`) antes de cualquier comando o inspección.
- **Consulta Obligatoria al Grafo Antes de Leer Código**: PROHIBIDO leer archivos completos para ubicar componentes, funciones o callers. Antes de inspeccionar cualquier flujo, consultar Graphify vía MCP (`query_graph`, `get_node`, `shortest_path`) o CLI (`graphify query "<concepto>"`).
- **Lectura Quirúrgica y Ahorro de Tokens**:
  - Jamás escanear carpetas o parsear documentos enteros para deducir relaciones.
  - Con el subgrafo devuelto por Graphify, leer únicamente el rango de líneas exacto (`StartLine`-`EndLine`) del símbolo involucrado.
  - Tras modificar código en la sesión, ejecutar `graphify update .` (extracción local AST gratis, 0 tokens) para mantener el grafo sincronizado.
- **Metodología de Ingeniería: Ciclo Quirúrgico 4-1**:
  1. *Fase 1 (Ubicar)*: MCP Graphify (`query_graph`) antes de abrir archivos; cero volcados a ciegas.
  2. *Fase 2 (Plan)*: Plan estricto de ≤5 líneas explicando cambios y esperando OK en tareas complejas.
  3. *Fase 3 (Micro-Diffs)*: Cambios pequeños (≤40 líneas) con `replace_file_content`. Prohibido reescribir archivos enteros.
  4. *Fase 4 (Verificación Aislada)*: Correr tests focalizados (`npm test -- -t "Nombre"`, `pytest -q python/tests/test_x.py`). La suite completa solo se ejecuta antes del commit final.
- **Protocolo de Ahorro Masivo de Tokens**:
  - `MEMORY.md`: Consultar solo líneas 1–45 (~800 tokens vs 5,000+ de git log) para saber estado de ramas y fases completadas.
  - `AGENTS.md`: Leer exclusivamente la sección puntual necesaria (§1 Producto, §2 Copiloto, §4 Comandos) por rangos de líneas.
  - `mega_set_deteccion_ia.md` (102 KB): Prohibido leer completo; buscar con `Select-String` o rangos específicos de Bloom/reglas.
  - `graphify-out/GRAPH_REPORT.md` (57 KB): Prohibido volcarlo; usar MCP `query_graph(token_budget=1000)`.
  - Rol de Orquestador: El agente principal opera como Orquestador Hub & Spoke. Toda investigación, lectura multi-archivo (>2 archivos) o análisis de errores se delega obligatoriamente a subagentes `research` (modelo `flash`), manteniendo la ventana de contexto principal limpia y rápida (<15k tokens).
  - Commits atómicos: tras cada micro-cambio con tests en verde, commit inmediato; si hay regresión persistente, `git restore` inmediato.
  - Terminal: filtros estrictos (`Select-Object -First 25`, `pytest -q --tb=short`, `npm test -- --reporter=dot`).
  - Modo Caveman: comunicación técnica ultra-concisa (`[cosa] [acción] [razón]. [siguiente paso]`).

## 6. Estructura y Módulos Principales
| Módulo | Ruta | Función |
|---|---|---|
| **FastAPI Server** | `python/main.py` | Hub de integración y endpoints REST (Lazy COM) |
| **Modelos Pydantic** | `python/models.py` | Única fuente de verdad de datos |
| **In-place Engine** | `python/generation/inplace_editor.py` | Edición APA 7 respetando formato original |
| **Multi-Provider AI** | `python/modules/ai_client.py` | Router balanceado (NIM, Groq, Cerebras, Ollama) |
| **Live AI Editor** | `python/modules/ai_document_editor.py` | Intérprete conversacional y Action DSL |
| **Proactive Auditor** | `python/modules/proactive_auditor.py` | Detección de patrones de IA, estilo y ortografía |
| **Lienzo APA 7** | `src/components/layout/PaperCanvas.tsx` | Renderizador interactivo en vivo, paginador y chips editoriales |
| **Carrusel de Portadas** | `src/components/wizard/CoverCarouselStudio.tsx` | Carrusel visual interactivo con miniaturas esqueleto y navegación |
| **Explorador de Proyecto** | `src/components/project/ExploradorProyecto.tsx` | Panel inline (no modal): carpeta de trabajo, múltiples .docx y figuras asociadas, dentro de `ProyectosScreen` |
| **Zustand Store** | `src/store/useDocStore.ts` | Estado reactivo central y disparador de auditorías |
| **Barra Unificada** | `src/components/toolbar/UnifiedToolbar.tsx` | Navegación, botón Inicio y Copiloto IA |
