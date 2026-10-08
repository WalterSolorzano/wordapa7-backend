# Catálogo de revisión: 58 reglas de objetivos y universales

> **Estado: decisiones tomadas, listo para plan.** Sustituye el motor de
> objetivos muerto (`audit_objective` / `audit_objectives_hierarchy`) y llena la
> capa de reglas generales que `phase_scope` ya declaraba.

## El defecto que este ciclo viene a cerrar

En `proactive_auditor.py` hay un motor de objetivos escrito y **muerto**:
`audit_objective`, `audit_objectives_hierarchy` y `find_bloom_level`, con su
propio catálogo `BLOOM_VERBS` ("Mega-Set"). Nadie los llama: no hay router, no
hay endpoint, no hay vista. Solo se llaman entre ellos y con sus tests.

Además tienen los dos defectos que este repositorio ya elimino una vez:

```python
# audit_objective
if v in obj_lower:             # subcadena del verbo sobre el objetivo ENTERO
# find_bloom_level
if v.lower() in verb_lower:    # subcadena del verbo
```

Es `any(kw in low_t for kw in ("objetivo", ..., "meta"))` otra vez, y ya sabemos
cómo termina: "meta" está dentro de "metodología", así que un párrafo sobre
metodología disparaba la regla de objetivos. Además su `recommendation` trae
`✓`, `✗` y `⚠`, que violan la regla de cero emojis de `AGENTS.md` §1 en el
momento en que alguien lo enchufe.

Y el catálogo que traen es **peor que incompleto**: `BLOOM_VERBS` tiene verbos
repetidos entre niveles (`ilustrar` en *entender* y *aplicar*; `comparar`,
`contrastar` y `distinguir` en dos niveles cada uno). `find_bloom_level` itera el
diccionario y gana el primer match, así que **el nivel depende del orden de
inserción, no del verbo**: `ilustrar` siempre devuelve *entender*.

## D1 — El vocabulario de §5 y §6 reemplaza a los dos catálogos

La lista negra de verbos no observables (§5) y el catálogo de Bloom (§6) pasan
a ser **datos** en `phase_scope`, no listas sueltas en dos módulos distintos.

`VAGUE_VERBS` actual: 10 verbos. El de §5 es superconjunto y trae la tabla de
reemplazo. El `BLOOM_VERBS` actual (11 verbos por nivel, con duplicados) se
borró; el de §6 (≈20 por nivel) lo reemplaza, y cada verbo se asigna a **un
único nivel canónico**, como el propio §6 exige.

`find_bloom_level` deja de iterar en orden de inserción: el mapa es
`VERB → nivel`, construido una vez. Un verbo no está o tiene un nivel, no tiene
"el que salió primero".

**Consecuencia directa:** R-X01, R-X03, R-X04 y R-X05 salen casi gratis, porque
el motor ya sabe el verbo rector y su nivel canónico de cada objetivo.

## D2 — La comparación de §5 y §6 no puede ser lookup puro

§11 del documento lo dice: "apreciar" está permitido en *Evaluar* pero prohibido
como sinónimo vago, y los verbos con doble clasificación se resuelven **por el
complemento**, no por el verbo aislado. Un lookup sobre la palabra sola es
heurística, y las heurísticas sobre palabras solas ya nos mordieron con `"meta"`.

Por eso el motor tiene que poder decir **"no sé"**. `find_bloom_level` devuelve
`None` cuando no reconoce el verbo, y `None` no es un nivel: es "esto lo tiene
que resolver la capa semántica". Nunca se infiere un nivel por descarte.

## D3 — R-X04 se reactiva; el motor muerto se borra

`audit_objectives_hierarchy` implementa R-X04 (el nivel del general ≥ el máximo
de los específicos) y funciona. Se **reimplementa dentro de la fase
`objetivos`**, no se conserva el módulo viejo: su forma de detectar el verbo es
la que está rota, así que conservarlo significa arrastrar el defecto.

Lo que se conserva es la idea: la auditoría de objetivos es *relacional*, y por
eso vive en la fase y no en el corrector de párrafo.

## D4 — No hay perfil institucional

R-G81 a R-G85 se vuelven reglas fijas contra APA 7, que es lo que
`APAFormat` y `FormattingConfig` ya codifican. El "perfil institucional
configurable" del §12.8 se elimina del catálogo: es un eje entero de
configuración que nadie configura, y una portada, un pie de página o un interlineado
tienen una respuesta en APA 7, no una por universidad.

La maquinaria de `apa_validator.py` y del editor in-place ya cubre la mayor
parte de R-G81 a R-G84. Lo que falta es **exponerla como hallazgos de Revisión**,
no implementarla.

## D5 — El score es señal de backend, no un número pintado

El score existe, se calcula, y es reproducible. Lo que no existe es un "58/100"
en pantalla: es tedioso para quien lee y no dice qué hacer.

La forma del score en la interfaz, cuando exista, es el **veredicto como
frase** — "Requiere reescritura parcial" — y lo que lo acompaña es **qué reglas
lo bajaron**, no cuánto. El score cumple su función alimentando una *prioridad*:
qué se revisa primero, y que incumplimientos se listan aparte de la cola normal.

## D6 — El veredicto es la peor de las dos señales

§8.3 del documento fuente tiene una ambigüedad que hay que corregir antes de
implementar la fórmula. Dice que cualquier Crítica incumplida "fuerza el
veredicto a 'Requiere reescritura parcial' como mínimo, independientemente del
score numérico". Pero el mismo §8.3 dice que score < 50 es "Rechazado —
reescritura completa", que es **más grave**. Leído literal, un score de 20 con
una sola crítica se *mejora*.

La regla correcta:

```
veredicto = peor(veredicto_por_score, piso_por_criticas)
```

Nunca el mejor de los dos. El piso de §12.9 (las Críticas de ortografía,
registro, citación, plagio y persona se listan siempre y no se diluyen) se
mantiene: es el mismo criterio, y la razón por la que el score solo nunca
alcanza para decidir.

## D7 — El sistema juzga la IA, y dice por qué

El §12.6 del documento fuente dice que ninguna regla de esa subcategoría debe
usarse sola para calificar "esto lo escribió una IA", y que deben reportarse
como sugerencias de redacción. **El usuario descarta esa nota**: el producto
juzga, y "parece IA" es una salida válida.

Lo que se mantiene, porque es lo que hace que la afirmación sea defendible:

- El veredicto es **"parece IA"**, con las señales que lo sostienen a la vista.
  Nunca "esto lo escribió una IA", que es una acusación que el motor no puede
  sostener.
- `AGENTS.md` §1 intacto: el motor probabilístico **solo ofrece "Marcar para
  revisar"**, nunca "Aceptar". Juzgar y aplicar son cosas distintas, y el
  producto solo aplica las reglas deterministas.
- R-G6x **no es un detector nuevo**: son señales adicionales que entran al canal
  probabilístico que ya existe (`ai_score`, `ai_category`, los seis índices de
  `ai_indices`, `burstiness_score`). Cada una con su evidencia. Eso es
  estrictamente más útil que un número opaco.

## D8 — La UI de la IA entra después, y ya tiene una restricción

El mapa de calor del documento va en Revisión más adelante, no en este ciclo.
Queda anotada su restricción desde ahora, porque `AGENTS.md` §1 ata el diseño:
**no puede ser una tercera columna ni un minimapa**, y la revisión sigue siendo
un párrafo a la vez.

Punto de partida que ya existe: `useReviewWorkbench` publica
`marks: Map<number, MinimapMark>`, que tiñe cada página con el color del motor
dominante. Un mapa de calor es esa misma estructura con una dimensión más, y
por eso no es una pantalla nueva: es un dato nuevo en un lugar que ya existe.

## Recuento real

El documento fuente aparenta unas 50 reglas. Son **58**:

| Familia | IDs | Cantidad |
|---|---|---|
| Forma (objetivo aislado) | R-F01 a R-F09 | 9 |
| Semántica (objetivo aislado, LLM) | R-S01 a R-S05 | 5 |
| Relacional (entre objetivos) | R-X01 a R-X08 | 8 |
| **Subtotal objetivos** | | **22** |
| Redacción y ritmo | R-G11 a R-G14 | 4 |
| Cohesión | R-G21 a R-G25 | 5 |
| Ortografía y terminología | R-G31 a R-G35 | 5 |
| Estructura de párrafo | R-G41 a R-G44 | 4 |
| Registro y tono | R-G51 a R-G53 | 3 |
| Patrones de texto generado | R-G61 a R-G65 | 5 |
| Cita, evidencia, originalidad | R-G71 a R-G75 | 5 |
| Formato tipográfico | R-G81 a R-G85 | 5 |
| **Subtotal universales** | | **36** |

## Estado de las 36 universales contra el código

| Estado | Reglas |
|---|---|
| **Ya existen** | R-G12 (`ngram_repetition`), R-G22 (`first_person`), R-G24 (`muletilla` con conteo global), R-G31 (`ortografia`), R-G41 (`paragraph_words`, ahora por fase), R-G43 (`layoutCuts` de `com_reader`), R-G73 (citas fantasma y huérfanas), R-G81/R-G84 (`apa_validator` + `FormattingConfig`), R-G83 (`runProactiveAutoCaptioning`) |
| **Baratas: regex o conteo** | R-G11 (σ de longitud de oración), R-G34 (sigla sin definir), R-G35 (unidades mezcladas), R-G51 (registro coloquial), R-G52 (exclamaciones), R-G53 (segunda persona al lector), R-G61 (tríadas), R-G63 (densidad de conectores) |
| **Maquinaria nueva** | R-G13 (estructura sintáctica: necesita POS), R-G33 (consistencia terminológica: necesita embeddings) |
| **Necesitan LLM** | R-G14, R-G23, R-G25, R-G32, R-G42, R-G44, R-G62, R-G64, R-G71, R-G72, R-G74, R-G75 |

**Las dos que más valen y no existen: R-G71 y R-G74.** Afirmación con cifra sin
cita, y similitud con la fuente. Son Críticas, son las que un revisor humano
detecta de entrada, y son las que el producto no tiene hoy.

## D9 — Las reglas de LLM no necesitan cola: el router ya es la cola

El usuario asume que hace falta un sistema de colas. **No hay ninguna, y
no hace falta.** Lo que existe es mejor:

- `modules/ai_client.execute_with_specialty(prompt, system_prompt, specialty, ...)`:
  router con **caché por hash del prompt**, **failover automático** entre
  proveedores, `json_mode` y `return_provider_info`. Sus especialidades ya
  están mapeadas y sanas: `FAST → groq`, `HEAVY → gemini`,
  `REASONING → nvidia_nim`, los tres en `good`.
- `proactive_auditor.refine_with_llm(findings, elements, api_key)`: el patrón
  ya establecido para "reglas locales primero, LLM después". Nunca lanza: ante
  cualquier error devuelve los hallazgos intactos y `False`.

`refine_with_llm` es un **filtro** (quita falsos positivos de lo local). Las 12
reglas de LLM son **detectores** (agregan hallazgos). Son formas distintas y no
se pueden compartir la función, pero sí el contrato: la capa local corre
siempre y sin red, y la de LLM es **estrictamente aditiva** — nunca puede quitar
un hallazgo local: un motor que se cae no puede borrar evidencia que el código
ya encontró y que la persona tiene que ver.

## D10 — El LLM CONFIRMA lo que las reglas baratas marcaron; no escanea

Esta decisión cambió después de medir los límites reales (sonda del 2026-09-27,
`tools/llm_probe.py`).

**Lo que se pensó primero y está mal:** una llamada de LLM por párrafo, con todas
las reglas que le corresponden. Doce reglas por párrafo es además inviable por
costo, pero el motivo real es peor.

**Lo que manda el dato:** los RPM declarados en `PROVIDER_CAPACITY` van de **10 a
30 por minuto**. Una tesis de 300 párrafos son 300 llamadas: diez veces la cuota
del proveedor más generoso. Y el único modelo que responde sin pagar
(`z-ai/glm-4.6v-flash-free`) dio 429 en la misma sonda: un endpoint free
compartido se estrangula con facilidad. Un barrido por párrafo no es una decisión
de calidad, es aritmética.

**La arquitectura correcta es la inversa:** las reglas baratas, que son deterministas y gratis, **marcan**; el LLM **confirma o descarta** lo marcado, con
la evidencia a la vista. Es la forma que `refine_with_llm` ya tiene, y por eso no
hay que inventar nada.

Consecuencias:

- Un documento con 40 hallazgos son 40 llamadas, no 300. La cuota aguanta.
- El LLM nunca ve prosa que las reglas dejaron pasar: recibe el hallazgo, su tramo y
  su regla, y juzga **eso**.
- La salida es auditable: "esta frase no es coloquial, es una cita" es una
  decisión que se puede leer, no un barrido opaco.
- R-G14, R-G23, R-G25, R-G32, R-G33, R-G42, R-G44, R-G62, R-G64, R-G71, R-G72 y
  R-G75 dejan de necesitar "una regla por párrafo" y pasan a ser **el filtro de
  las que ya dispararon algo**.

## D10-bis — El presupuesto de llamadas es explícito, no implícito

Toda pasada de LLM lleva un tope de llamadas por documento, y si lo alcanza lo
dice. Un motor que se calla en silencio es indistinguible de uno que no encontró
nada, y esa es la peor falla posible en una herramienta de revisión: le dice a la
persona que su tesis está limpia cuando lo que pasó es que se quedó sin cuota.

El número sale de `PROVIDER_CAPACITY[proveedor]["requests_per_minute"]`, que ya
existe y que este trabajo había leído y no estaba usando. Un documento que exceda
el tope **reporta cuántos quedaron sin verificar**, igual que el corrector ya
reporta `used_llm`.


## D11 — Tres reglas no son de LLM

El §12 del documento fuente las cuenta como LLM y no lo son:

- **R-G74 (similitud con la fuente)** es una **comparación**, no un juicio: el
  propio documento dice "n-gramas / embeddings contra los textos fuente
  indexados". No necesita modelo; necesita que las fuentes estén indexadas.
- **R-G33 (consistencia terminológica)** y **R-G25 (transición entre
  párrafos)** son relaciones **entre** párrafos, así que van en una pasada
  **por sección**, no por párrafo.

El numero de llamadas lo fija D10: una por hallazgo marcado, no una por parrafo.

## D12 — El veredicto del LLM es un aviso, no un dictamen

Una salida del LLM se reporta como `source: "llm"` y con la acción de **marcar**,
igual que el detector de IA. `AGENTS.md` §1: el motor probabilístico no aplica.
R-G71 y R-G74 son Críticas en el catálogo, pero Crítica significa "se listan
siempre y no se diluyen" (§12.9), no "se aplican sin revisión".


## Orden de ejecución

1. **Universales baratas** (8 reglas, sin LLM). Da sensación inmediata de
   cobertura y es todo en `phase_scope` con ámbito `global`.
2. **R-G71 y R-G74.** Las dos Críticas caras. Requieren resolver citas y
   fuentes indexadas.
3. **Objetivos §1-8**: catálogo de §5 y §6, extractor de verbo rector, y
   R-X01, R-X03, R-X04, R-X05. Reactiva el motor muerto con el verbo correcto.
4. **El score**, al final, cuando las reglas que lo alimentan existan. Un score
   sobre veinte reglas es un número inventado.

## Restricciones que sigue mandando

- `AGENTS.md` §1: el detector de IA es probabilístico y solo ofrece "Marcar para
  revisar". El score no se pinta como número.
- `AGENTS.md` §1: cero emojis, solo variables CSS, `strokeWidth` = `--icon-stroke`.
- `AGENTS.md` §2: un hallazgo aparece en dos canales y ambos dicen lo mismo. Una
  regla nueva entra por `auditItems.ts` y llega a los dos.
- La revisión sigue siendo un párrafo a la vez. El mapa de calor no puede ser
  una tercera columna.
- Toda regla nueva declara su ámbito en `RULE_SCOPES` y tiene implementación:
  `test_rule_scopes.py` falla si falta cualquiera de las dos.
- El verdict es la peor de las dos señales, nunca la mejor.
