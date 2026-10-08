# Mega-Set de Criterios para Motor de Detección IA y Auditoría Académica

> **Versión**: 1.0 · **Stack target**: WordAPA7 (`python/modules/proactive_auditor.py` + `useDocStore.ts`)
> **Uso**: alimentar `runProactiveAudits()` y `runProofreadBatch()` con reglas accionables, medibles y anti-falso-positivo.
> **Convención**: cada criterio incluye `(a) definición, (b) cómo medirlo, (c) umbral, (d) falso positivo conocido`.

---

## Tabla de contenidos

1. [Criterios estructurales por sección académica](#1-criterios-estructurales-por-sección-académica)
2. [Taxonomía de Bloom — verbos objetivos medibles](#2-taxonomía-de-bloom--verbos-objetivos-medibles)
3. [Patrones léxicos de IA (n-gramas, frases cliché)](#3-patrones-léxicos-de-ia-n-gramas-frases-cliché)
4. [Patrones sintácticos de IA](#4-patrones-sintácticos-de-ia)
5. [Patrones semánticos de IA](#5-patrones-semánticos-de-ia)
6. [Indicadores cuantitativos (burstiness, perplejidad proxy)](#6-indicadores-cuantitativos)
7. [Criterios APA 7 estructurales](#7-criterios-apa-7-estructurales)
8. [Falsos positivos conocidos y mitigación](#8-falsos-positivos-conocidos-y-mitigación)
9. [Esquema Pydantic para integración](#9-esquema-pydantic-para-integración)
10. [Metodología de detección propuesta (pipeline multi-capa)](#10-metodología-de-detección-propuesta-pipeline-multi-capa)
11. [Bibliografía y referencias técnicas](#11-bibliografía-y-referencias-técnicas)
12. [Jerarquía de objetivos — coherencia Bloom general vs específicos](#12-jerarquía-de-objetivos--coherencia-bloom-general-vs-específicos)
13. [LLM para detección de incoherencias sutiles](#13-llm-para-detección-de-incoherencias-sutiles)

---

## 1. Criterios estructurales por sección académica

Cada sección de un trabajo académico tiene longitudes esperadas. Desviaciones grandes (especialmente **por debajo**) son señal de IA: los modelos tienden a producir secciones homogéneas en longitud y densidad.

### 1.1 Longitud por sección (tesis/proyecto, ~80-120 páginas)

| Sección | % del total | Palabras (100 pág) | Palabras (40 pág) | Umbral crítico |
|---|---|---|---|---|
| **Portada + preliminares** | 3-5% | — | — | n/a |
| **Resumen / Abstract** | 0.5-1% | 150-250 | 100-200 | >300 o <100 |
| **Introducción** | 8-12% | 1,500-2,500 | 600-1,200 | <500 (sospecha IA superficial) |
| **Marco teórico / Estado del arte** | 25-35% | 6,000-10,000 | 2,500-4,000 | <1,500 (sospecha IA sin revisión) |
| **Metodología** | 10-15% | 2,500-4,000 | 1,000-1,500 | <800 (incompleto) |
| **Resultados** | 25-35% | 6,000-10,000 | 2,500-4,000 | <1,500 (no reporta datos) |
| **Discusión** | 15-20% | 3,500-5,000 | 1,500-2,000 | <1,000 (sin análisis) |
| **Conclusiones** | 5-8% | 1,000-2,000 | 400-800 | >2,500 (redundante con discusión) |
| **Referencias** | 3-5% | 15-30 fuentes | 8-15 fuentes | <5 fuentes (sospecha IA sin revisión) |

**Cómo medirlo**:
```python
def section_length_ratio(section_words: int, total_words: int, expected_range: tuple) -> float:
    """Devuelve desviación respecto al rango esperado. 0 = óptimo."""
    low, high = expected_range
    expected_pct = (low + high) / 2 / 100  # promedio como fracción
    actual_pct = section_words / total_words
    if low/100 <= actual_pct <= high/100:
        return 0.0
    return abs(actual_pct - expected_pct) / expected_pct
```

**Falso positivo conocido**: ensayos cortos (1,000-3,000 palabras) no aplican estos ratios. Usar tabla separada para ensayos:

| Sección ensayo (2,000 palabras) | Palabras | % |
|---|---|---|
| Introducción | 200-300 | 10-15% |
| Cuerpo (3-5 párrafos) | 1,400-1,600 | 70-80% |
| Conclusión | 200-300 | 10-15% |

### 1.2 Longitud de párrafo (APA 7)

- **Mínimo**: 3 oraciones (resumen, definiciones)
- **Esperado**: 100-200 palabras, 5-8 oraciones
- **Máximo**: 250 palabras (más = partir)
- **Umbral crítico IA**: párrafos homogéneos de 120-150 palabras todos (varianza <10%)

**Señal IA**: si la desviación estándar de longitud de párrafos es <15 palabras → sospecha.

### 1.3 Longitud de oración

- **Promedio académico**: 15-25 palabras (APA 7)
- **Mínimo legible**: 8 palabras
- **Máximo recomendado**: 40 palabras (más = partir, pero permitido en definiciones técnicas)
- **Umbral IA**: 90% de oraciones entre 18-22 palabras (varianza baja = sospecha)

```python
def sentence_length_variance(sentences: list[str]) -> dict:
    lengths = [len(s.split()) for s in sentences]
    avg = sum(lengths) / len(lengths)
    variance = sum((l - avg) ** 2 for l in lengths) / len(lengths)
    std = variance ** 0.5
    cv = std / avg if avg > 0 else 0  # coeficiente variación
    return {
        'avg': avg, 'std': std, 'cv': cv,
        'ai_suspect': cv < 0.20,  # varianza baja = sospecha IA
        'human_typical': 0.30 <= cv <= 0.55,
        'too_chaotic': cv > 0.70,  # escritura pobre
    }
```

### 1.4 Densidad de citas por sección

| Sección | Citas esperadas / 1,000 palabras | Umbral crítico |
|---|---|---|
| Introducción | 3-6 | <2 (IA sin revisión) |
| Marco teórico | 8-15 | <5 (IA sin revisión) |
| Metodología | 2-5 | 0 (plagio metodológico) |
| Resultados | 2-4 (si compara con otros) | 0 esperado |
| Discusión | 5-10 | <3 (opinión sin base) |
| Conclusiones | 1-3 (síntesis) | >8 (redundante) |

**Falso positivo**: metodología propia (autor desarrolla su método) puede tener 0 citas esperadas. Detectar "primera persona" + verbos metodológicos ("diseñé", "implementé", "validé").

---

## 2. Taxonomía de Bloom — verbos objetivos medibles

La Taxonomía de Bloom (revisada por Anderson & Krathwohl, 2001) tiene 6 niveles cognitivos. Los **objetivos** de un trabajo académico deben usar verbos del nivel apropiado. Verbos vagos ("entender", "conocer", "aprender") no son medibles.

### 2.1 Los 6 niveles con verbos accionables

#### Nivel 1 — Recordar (Remember)
**Definición**: recuperar información de la memoria sin transformación.
**Verbos**: citar, definir, describir, enumerar, identificar, listar, nombrar, recordar, reconocer, reproducir, señalar.
**Producto esperado**: lista, definición, hecho.

#### Nivel 2 — Entender (Understand)
**Definición**: comprender el significado e interpretarlo.
**Verbos**: clasificar, comparar, contrastar, discutir, explicar, expresar, identificar, ilustrar, interpretar, parafrasear, resumir, traducir.
**Producto esperado**: resumen, explicación, esquema.

#### Nivel 3 — Aplicar (Apply)
**Definición**: usar conocimiento en situaciones nuevas o concretas.
**Verbos**: aplicar, calcular, demostrar, dramatizar, emplear, ejecutar, escoger, ilustrar, interpretar, practicar, resolver, usar, utilizar.
**Producto esperado**: solución, cálculo, demostración.

#### Nivel 4 — Analizar (Analyze)
**Definición**: descomponer en partes, identificar relaciones.
**Verbos**: analizar, categorizar, comparar, contrastar, diferenciar, distinguir, examinar, investigar, relacionar, separar, subdividir.
**Producto esperado**: diagrama, esquema, distinción.

#### Nivel 5 — Evaluar (Evaluate)
**Definición**: emitir juicios basados en criterios o estándares.
**Verbos**: argumentar, defender, evaluar, justificar, validar, valorar, verificar, criticar, priorizar, recomendar, seleccionar.
**Producto esperado**: juicio, decisión, evaluación.

#### Nivel 6 — Crear (Create)
**Definición**: combinar elementos para formar algo nuevo.
**Verbos**: asumir, combinar, compilar, componer, construir, diseñar, desarrollar, formular, generar, integrar, inventar, planear, planificar, proponer, sintetizar.
**Producto esperado**: plan, diseño, obra nueva.

### 2.2 Tabla de evaluación de objetivos

```python
BLOOM_VERBS = {
    'recordar':   ['citar','definir','describir','enumerar','identificar','listar','nombrar','recordar','reconocer','reproducir','señalar'],
    'entender':   ['clasificar','comparar','contrastar','discutir','explicar','expresar','ilustrar','interpretar','parafrasear','resumir','traducir'],
    'aplicar':    ['aplicar','calcular','demostrar','dramatizar','emplear','ejecutar','escoger','ilustrar','practicar','resolver','usar','utilizar'],
    'analizar':   ['analizar','categorizar','comparar','contrastar','diferenciar','distinguir','examinar','investigar','relacionar','separar','subdividir'],
    'evaluar':    ['argumentar','defender','evaluar','justificar','validar','valorar','verificar','criticar','priorizar','recomendar','seleccionar'],
    'crear':      ['asumir','combinar','compilar','componer','construir','diseñar','desarrollar','formular','generar','integrar','inventar','planear','planificar','proponer','sintetizar'],
}

# Verbos prohibidos (no medibles) en objetivos académicos
VAGUE_VERBS = ['conocer', 'entender', 'aprender', 'saber', 'comprender', 'estudiar',
               'familiarizarse', 'tener idea de', 'estar al tanto de', 'darse cuenta de']

def audit_objective(objective: str) -> dict:
    """Evalúa un objetivo contra Bloom."""
    obj_lower = objective.lower()
    found_level = None
    found_verb = None
    for level, verbs in BLOOM_VERBS.items():
        for v in verbs:
            if v in obj_lower:
                found_level = level
                found_verb = v
                break
        if found_level:
            break

    vague_found = [v for v in VAGUE_VERBS if v in obj_lower]

    return {
        'objective': objective,
        'bloom_level': found_level,
        'verb_detected': found_verb,
        'is_measurable': found_level is not None and not vague_found,
        'vague_verbs_used': vague_found,
        'severity': 'high' if vague_found else ('ok' if found_level else 'medium'),
        'recommendation': (
            f"✓ Verbo '{found_verb}' válido (nivel {found_level})" if found_level and not vague_found
            else f"✗ Verbos vagos: {', '.join(vague_found)}. Reemplazar por verbos medibles."
            if vague_found
            else "⚠ No se detectó verbo de Bloom. Considerar reformular."
        )
    }
```

### 2.3 Distribución esperada de niveles en un trabajo

| Tipo de trabajo | Niveles esperados (objetivos generales) |
|---|---|
| Tesis de licenciatura | Analizar + Evaluar + Crear |
| Tesis de maestría | Analizar + Evaluar (Crear si es investigación-acción) |
| Tesis doctoral | Crear (principal) + Evaluar |
| Ensayo argumentativo | Analizar + Evaluar |
| Trabajo monográfico | Entender + Analizar |
| Informe técnico | Aplicar + Analizar |

**Señal de IA**: objetivos que solo dicen "analizar" pero el trabajo es descriptivo. O todos los objetivos en nivel "Recordar" (lista de definiciones).

### 2.4 Cómo integrar Bloom con detección de IA

```python
def bloom_consistency_check(objectives: list[str], body_text: str) -> dict:
    """Verifica si el cuerpo del trabajo cumple los objetivos declarados."""
    levels_declared = []
    for obj in objectives:
        result = audit_objective(obj)
        if result['bloom_level']:
            levels_declared.append(result['bloom_level'])

    # Verbos cognitivos esperados en el cuerpo según niveles declarados
    expected_verbs = []
    for level in levels_declared:
        expected_verbs.extend(BLOOM_VERBS[level])

    # Contar apariciones en el cuerpo
    body_lower = body_text.lower()
    verbs_found = sum(1 for v in expected_verbs if v in body_lower)

    return {
        'levels_declared': levels_declared,
        'expected_verb_density': len(expected_verbs) / len(body_text.split()) * 1000,
        'actual_verb_count': verbs_found,
        'consistency_score': min(1.0, verbs_found / max(1, len(expected_verbs))),
        'warning': 'Objetivos declaran nivel alto pero el cuerpo usa verbos de nivel bajo'
                   if verbs_found < len(expected_verbs) * 0.3 else None
    }
```

---

## 3. Patrones léxicos de IA (n-gramas, frases cliché)

Los LLM (GPT, Claude, Llama, etc.) generan texto con patrones recurrentes. Estos son los más comunes en español académico.

### 3.1 Frases de cierre IA (las más comunes)

**Crítico**: aparición de 2+ en un documento de menos de 5,000 palabras es señal fuerte de IA.

| Frase | Frecuencia en IA | Frecuencia en humano académico | Score IA |
|---|---|---|---|
| "En conclusión" | 85% | 35% | 0.7 |
| "En resumen" | 75% | 30% | 0.7 |
| "Para concluir" | 70% | 25% | 0.75 |
| "En síntesis" | 65% | 20% | 0.75 |
| "En definitiva" | 60% | 25% | 0.6 |
| "Como hemos visto" | 55% | 15% | 0.75 |
| "A modo de cierre" | 50% | 10% | 0.8 |
| "Para finalizar" | 60% | 20% | 0.7 |
| "En última instancia" | 50% | 15% | 0.7 |
| "En conjunto, estos resultados" | 45% | 5% | 0.85 |
| "Estos hallazgos sugieren que" | 55% | 8% | 0.85 |
| "Cabe destacar que" | 65% | 25% | 0.6 |
| "Es importante señalar que" | 70% | 20% | 0.7 |
| "Vale la pena mencionar que" | 60% | 15% | 0.7 |
| "Es relevante destacar" | 55% | 10% | 0.8 |

### 3.2 Frases de transición IA

| Frase | Score IA | Notas |
|---|---|---|
| "Por otro lado" | 0.5 | También humano, pero IA lo usa en cada párrafo |
| "Por otra parte" | 0.5 | Idem |
| "Adicionalmente" | 0.75 | Menos común en humanos |
| "En este sentido" | 0.7 | Casi siempre redundante |
| "En este contexto" | 0.7 | Idem |
| "Cabe mencionar que" | 0.65 | Filler |
| "Es necesario destacar que" | 0.7 | Filler |
| "Como se mencionó anteriormente" | 0.6 | IA lo usa mucho para "continuidad" |
| "Como se ha discutido" | 0.7 | Mismo patrón |
| "En este marco" | 0.7 | Academicismo vacío |
| "Bajo esta perspectiva" | 0.75 | Idem |
| "Desde esta óptica" | 0.75 | Idem |
| "En consecuencia" | 0.4 | Humano también, pero IA lo abusa |
| "Por lo tanto" | 0.3 | Común en ambos |
| "De esta manera" | 0.5 | Muy frecuente en IA |
| "De este modo" | 0.5 | Idem |
| "Es así como" | 0.6 | IA loves this |
| "De acuerdo con lo anterior" | 0.7 | Filler |
| "En relación con lo anterior" | 0.75 | Filler |
| "Tomando en cuenta lo anterior" | 0.65 | Filler |

### 3.3 Vocabulario "IA-típico"

Palabras que aparecen con frecuencia desproporcionada en texto generado por IA:

| Palabra/frase | Score IA | Razón |
|---|---|---|
| "crucial" | 0.7 | IA lo usa para enfatizar sin sustento |
| "fundamental" | 0.6 | Sobreusado |
| "esencial" | 0.6 | Sobreusado |
| "relevante" | 0.5 | Filler neutro |
| "significativo" | 0.4 | Ambiguo (¿estadístico o cualitativo?) |
| "notable" | 0.7 | IA loves this |
| "destacable" | 0.7 | Idem |
| "importante" | 0.3 | Demasiado común en ambos |
| "complejo" | 0.6 | IA loves this |
| "multifacético" | 0.8 | Casi exclusivo IA |
| "intrincado" | 0.75 | Idem |
| "dinámica" (como adjetivo) | 0.6 | IA loves this |
| "robusto" | 0.6 | IA loves this en análisis |
| "innovador" | 0.6 | Cliché IA |
| "paradigma" | 0.7 | Cliché académico IA |
| "enfoque integral" | 0.75 | Filler IA |
| "perspectiva holística" | 0.85 | Casi exclusivo IA |
| "marco conceptual" | 0.5 | Humano también |
| "cuerpo teórico" | 0.7 | IA loves this |
| "panorama general" | 0.65 | IA cliché |
| "panorama amplio" | 0.75 | Idem |
| "contexto más amplio" | 0.7 | IA loves this |
| "un análisis profundo" | 0.7 | Cliché |
| "una mirada detallada" | 0.75 | Cliché |
| "un enfoque exhaustivo" | 0.8 | Casi exclusivo IA |
| "una comprensión más profunda" | 0.8 | Idem |
| "en el ámbito de" | 0.5 | Filler |
| "en el contexto de" | 0.4 | Común en ambos |
| "en el marco de" | 0.5 | Común en ambos |

### 3.4 Aperturas y cierres típicos de IA (en sección)

| Patrón | Score IA |
|---|---|
| "El presente trabajo/trabajo/estudio..." | 0.6 |
| "En el presente artículo..." | 0.5 |
| "Este documento aborda..." | 0.6 |
| "El siguiente texto analiza..." | 0.7 |
| "A continuación se presenta..." | 0.6 |
| "En las siguientes líneas..." | 0.75 |
| "En las próximas páginas..." | 0.8 |
| "Como punto de partida..." | 0.7 |
| "A modo de introducción..." | 0.7 |
| "En términos generales..." | 0.6 |
| "De manera general..." | 0.6 |

### 3.5 Muletillas de cierre por sección

```python
IA_SECTION_CLOSERS = [
    # Conclusión general
    "En conclusión,", "En resumen,", "Para concluir,", "En síntesis,",
    "En definitiva,", "A modo de cierre,", "Para finalizar,",

    # Cierre de párrafo
    "Estos hallazgos sugieren que", "Esto demuestra que",
    "Esto evidencia que", "Esto ilustra cómo",
    "Esto subraya la importancia de", "Esto pone de relieve",

    # Transición a siguiente sección
    "A continuación se examinará", "A continuación se analizará",
    "A continuación se discutirá", "El siguiente apartado abordará",
    "La siguiente sección presentará",

    # Síntesis redundante
    "En otras palabras,", "Dicho de otra forma,",
    "Para decirlo de manera simple,", "En términos sencillos,",

    # Justificación vacía
    "Es por ello que", "Por esta razón,", "Por tal motivo,",
    "Por consiguiente,", "De ahí que", "Es así como",
]
```

### 3.6 Patrones de listas generadas por IA

Las IAs generan listas con patrones específicos:

| Patrón | Score IA | Descripción |
|---|---|---|
| 3 elementos exactos | 0.6 | IA loves 3s ("primero... segundo... tercero...") |
| 5 elementos con bullet perfecto | 0.7 | Estructura idéntica por bullet |
| Numeración con gerundios paralelos | 0.7 | "1. Identificando... 2. Analizando... 3. Implementando..." |
| Párrafo introductorio + lista de 5 + párrafo de cierre | 0.8 | Plantilla típica IA |
| Bullets que empiezan con adverbio | 0.7 | "• Principalmente... • Adicionalmente... • Finalmente..." |

### 3.7 Estructura canónica IA "five-paragraph"

La IA ama la estructura de 5 párrafos:
1. Introducción con thesis statement
2. Párrafo de argumento 1
3. Párrafo de argumento 2
4. Párrafo de argumento 3 (a menudo "contra-argumento" débil)
5. Conclusión que repite la intro con otras palabras

**Cómo detectar**: si el documento tiene exactamente 5 párrafos y cada párrafo de cuerpo empieza con "En primer lugar" / "En segundo lugar" / "Por último" → 0.85 score IA.

---

## 4. Patrones sintácticos de IA

### 4.1 Estructura de oración homogénea

**Métrica**: desviación estándar de longitud de oraciones. IA tiende a `std < 5 palabras`. Humano típico: `std 8-15`.

```python
def syntactic_homogeneity(sentences: list[str]) -> dict:
    """Detecta homogeneidad sospechosa."""
    lengths = [len(s.split()) for s in sentences]
    if len(lengths) < 5:
        return {'score': 0, 'reason': 'pocas oraciones'}

    avg = sum(lengths) / len(lengths)
    std = (sum((l - avg) ** 2 for l in lengths) / len(lengths)) ** 0.5
    cv = std / avg if avg > 0 else 0

    return {
        'avg_length': round(avg, 1),
        'std_length': round(std, 1),
        'cv': round(cv, 2),
        'ai_suspect': cv < 0.20,
        'human_typical': 0.30 <= cv <= 0.55,
        'score': max(0, 1 - cv / 0.30),  # >0.7 = sospechoso
    }
```

### 4.2 Patrones de inicio de oración

**IA** tiende a iniciar oraciones de forma repetitiva:

| Apertura | Score IA |
|---|---|
| "El autor..." / "La autora..." | 0.3 (común en ambos) |
| "Este estudio..." | 0.5 |
| "Los resultados..." | 0.4 |
| "Es importante..." | 0.7 |
| "Cabe destacar..." | 0.7 |
| "En este sentido..." | 0.7 |
| "Por lo tanto..." | 0.5 |
| "Adicionalmente..." | 0.75 |
| Sustantivo + verbo ser | 0.4 (común) |
| Adverbio + verbo | 0.5 (común) |

**Señal IA**: si más del 40% de las oraciones empiezan con la misma estructura sintáctica (ej. todas con "El/Los/La/Las + sustantivo").

### 4.3 Uso excesivo de oraciones compuestas vs simples

| Ratio oraciones simples/compuestas | Interpretación |
|---|---|
| >0.7 | Estilo simple, escritura infantil o IA con temperatura baja |
| 0.4-0.7 | Estilo normal académico |
| 0.2-0.4 | Estilo académico denso (típico IA con temperatura media) |
| <0.2 | Estilo sobrecargado (mala escritura o IA con prompt complejo) |

### 4.4 Conectivos lógicos

**Densidad esperada**: 8-15 conectivos por 1,000 palabras en español académico.
**IA suele usar**: 15-25 conectivos (sobre-conexión artificial).

| Conectivo | Frecuencia IA (por 1000 palabras) | Frecuencia humana | Score IA si supera umbral |
|---|---|---|---|
| "Por otro lado" | 4-8 | 1-3 | 0.7 si >5 |
| "Sin embargo" | 6-12 | 2-5 | 0.5 si >7 |
| "Por lo tanto" | 5-10 | 2-4 | 0.5 si >6 |
| "En consecuencia" | 3-6 | 1-2 | 0.6 si >4 |
| "Adicionalmente" | 4-8 | 0-1 | 0.8 si >3 |
| "En este sentido" | 3-6 | 1-2 | 0.7 si >3 |
| "Cabe mencionar" | 3-5 | 0-1 | 0.8 si >2 |

### 4.5 Estructura paralela excesiva

La IA ama la estructura paralela en series:

```
✗ "Este enfoque permite identificar problemas, analizar causas y proponer soluciones."
✗ "El sistema facilita la gestión, optimiza los recursos y mejora los resultados."
```

**Cómo detectar**: 3+ verbos en gerundio o 3+ sustantivos + adjetivo en serie dentro de la misma oración. Score IA si aparece 4+ veces por 1,000 palabras.

### 4.6 Uso de voz pasiva vs activa

**Español académico** debería usar ~10-20% voz pasiva (más bajo que inglés).
**IA** suele usar 25-40% voz pasiva (calco del inglés académico).

```python
def passive_voice_ratio(text: str) -> dict:
    """Detecta voz pasiva perifrástica (ser + participio)."""
    import re
    passive_patterns = [
        r'\b(es|son|fue|fueron|era|eran|ha sido|han sido|será|serán)\s+\w+(ado|ido|to|so|cho)\b',
        r'\bse\s+\w+(a|an|ó|aron|aba|aban)\b',  # pasiva refleja
    ]
    matches = 0
    for pat in passive_patterns:
        matches += len(re.findall(pat, text, re.IGNORECASE))

    total_sentences = len(re.split(r'[.!?]+', text))
    ratio = matches / max(1, total_sentences)

    return {
        'passive_count': matches,
        'passive_ratio': round(ratio, 2),
        'ai_suspect': ratio > 0.30,  # >30% pasiva
        'human_typical': 0.10 <= ratio <= 0.25,
    }
```

---

## 5. Patrones semánticos de IA

### 5.1 Generalidades sin datos específicos

**IA** generaliza sin ejemplos concretos. **Humano** específica.

| Señal | Score IA | Ejemplo |
|---|---|---|
| Sin números concretos en resultados | 0.6 | "se observaron mejoras significativas" |
| Sin fechas específicas en marco teórico | 0.5 | "estudios recientes demuestran..." |
| Sin nombres propios en ejemplos | 0.6 | "diversos autores sugieren..." |
| Sin citas a páginas específicas | 0.6 | "(García, 2020)" sin pag. |
| "Varios estudios" / "múltiples investigaciones" sin citar | 0.8 | Cliché IA |
| "Como es bien sabido" sin citar | 0.85 | Cliché IA |
| "Tradicionalmente se ha considerado" sin citar | 0.7 | Cliché IA |
| Definiciones sin fuente | 0.6 | "Se entiende por X..." sin origen |

### 5.2 Equilibrio artificial de opiniones

**IA** presenta "ambos lados" de manera balanceada y poco comprometida:

- "Por un lado X, por otro lado Y..."
- "Si bien algunos argumentan A, otros sostienen B..."
- "Aunque existe debate, se puede concluir que..."

**Score IA**: 0.7 si aparece 3+ veces en secciones de discusión.

### 5.3 Falta de primera persona (cuando es metodología)

En español académico, la metodología propia usa 1ª persona o "nosotros":
- ✓ "Diseñé un cuestionario..." / "Diseñamos un cuestionario..."
- ✗ "Se diseñó un cuestionario..." (pasiva refleja — IA la prefiere)

**Score IA**: 0.6 si en la sección Metodología hay 0 verbos en 1ª persona.

### 5.4 Definiciones "diccionario" al inicio

**IA** suele empezar secciones con definiciones tipo diccionario:
- "Se define X como..."
- "X se entiende como..."
- "Por X se entiende..."

**Score IA**: 0.7 si la primera oración de 3+ secciones sigue este patrón.

### 5.5 Tautologías y circularidad

**IA** repite conceptos con palabras ligeramente diferentes:
- "Este proceso es importante porque es fundamental."
- "Los resultados muestran que los hallazgos evidencian..."

**Cómo detectar**: cosine similarity entre oraciones consecutivas >0.7 pero sin repetir palabras idénticas → paráfrasis circular.

### 5.6 Ausencia de duda legítima

**Humano académico** admite limitaciones, dudas, contra-ejemplos. **IA** es excesivamente confiada.

| Señal de duda esperada | Score IA si ausente |
|---|---|
| "sin embargo, este estudio tiene limitaciones..." | 0.5 |
| "no se puede afirmar con certeza que..." | 0.6 |
| "se requieren más estudios para..." | 0.6 |
| "estos resultados deben interpretarse con cautela..." | 0.6 |
| "es posible que otros factores..." | 0.5 |

**Score IA global**: si 0 señales de duda en >3,000 palabras de discusión → 0.7.

---

## 6. Indicadores cuantitativos

### 6.1 Burstiness (variación de longitud de oraciones)

**Concepto**: los humanos escriben en "ráfagas" — oraciones cortas mezcladas con largas. La IA produce longitud más uniforme.

```python
def burstiness_score(sentences: list[str]) -> dict:
    """Mayor score = más humano (más burstiness)."""
    if not sentences:
        return {'score': 0, 'interpretation': 'sin oraciones'}

    lengths = [len(s.split()) for s in sentences]
    if len(lengths) < 5:
        return {'score': 0.5, 'interpretation': 'texto muy corto'}

    avg = sum(lengths) / len(lengths)
    std = (sum((l - avg) ** 2 for l in lengths) / len(lengths)) ** 0.5
    cv = std / avg if avg > 0 else 0

    # Burstiness humano típico: CV entre 0.30 y 0.60
    # IA típico: CV < 0.20
    if cv < 0.15:
        score = 0.1  # muy probable IA
    elif cv < 0.20:
        score = 0.3
    elif cv < 0.30:
        score = 0.5
    elif cv <= 0.60:
        score = 0.9  # muy probable humano
    else:
        score = 0.6  # caótico, escritura pobre

    return {
        'burstiness_score': score,
        'cv': round(cv, 3),
        'avg_length': round(avg, 1),
        'std_length': round(std, 1),
        'interpretation': {
            0.1: 'Muy probable IA (homogéneo)',
            0.3: 'Posible IA',
            0.5: 'Indeterminado',
            0.9: 'Probable humano (variación natural)',
            0.6: 'Texto caótico (escritura pobre)',
        }.get(score, 'Indeterminado')
    }
```

### 6.2 Perplejidad proxy (sin modelo de lenguaje)

Sin acceso a un LLM, podemos aproximar la perplejidad con métricas de diversidad léxica:

```python
def perplexity_proxy(text: str) -> dict:
    """Aproximación de perplejidad usando type-token ratio y rareza."""
    words = text.lower().split()
    if len(words) < 50:
        return {'score': 0.5, 'reason': 'texto muy corto'}

    # TTR: type-token ratio (mayor = más diverso)
    unique_words = set(words)
    ttr = len(unique_words) / len(words)

    # TTR corregido por longitud (STTR)
    import math
    sttr = ttr * math.sqrt(len(words) / 100)

    # Densidad de palabras "raras" (no en top-100 español)
    common_words = set("el la los las un una unos unas de del a en y o que se le lo al su sus para por con no es son fue fueron más mas pero como cuando donde si sí no".split())
    rare_words = sum(1 for w in words if w not in common_words and len(w) > 5)
    rare_ratio = rare_words / len(words)

    # Score: alta diversidad + baja rareza extrema = humano típico
    # IA: baja diversidad (TTR < 0.55) + rareza moderada-alta
    if ttr < 0.45:
        diversity_score = 0.2  # IA típico (repite vocabulario)
    elif ttr < 0.55:
        diversity_score = 0.4
    elif ttr < 0.65:
        diversity_score = 0.7
    elif ttr < 0.80:
        diversity_score = 0.9  # humano típico
    else:
        diversity_score = 0.6  # demasiado variado = poético o traducción

    return {
        'ttr': round(ttr, 3),
        'sttr': round(sttr, 3),
        'rare_ratio': round(rare_ratio, 3),
        'perplexity_proxy_score': diversity_score,
        'interpretation': 'humano típico' if diversity_score >= 0.7 else 'sospechoso IA' if diversity_score <= 0.4 else 'indeterminado'
    }
```

### 6.3 Densidad de números y datos específicos

| Densidad (números / 1,000 palabras) | Interpretación |
|---|---|
| 0 | Sospechoso IA (sin datos empíricos) |
| 1-3 | Bajo, ensayo teórico |
| 4-10 | Normal académico |
| 11-20 | Alto, metodología cuantitativa |
| >20 | Estadístico puro |

```python
def data_density(text: str) -> dict:
    """Detecta densidad de datos numéricos."""
    import re
    # Números: dígitos, porcentajes, años, rangos
    numbers = re.findall(r'\b\d+([.,]\d+)?%?\b', text)
    years = re.findall(r'\b(19|20)\d{2}\b', text)
    percentages = re.findall(r'\b\d+([.,]\d+)?%', text)
    stats = re.findall(r'\b(p\s*[<=>]\s*0?\.\d+|r\s*=\s*-?\d|χ²|t\s*=|F\s*=|M\s*=|SD\s*=)\b', text)

    word_count = len(text.split())
    density = (len(numbers) / max(1, word_count)) * 1000

    return {
        'numbers': len(numbers),
        'years': len(years),
        'percentages': len(percentages),
        'stats': len(stats),
        'density_per_1000': round(density, 1),
        'interpretation': (
            'sospechoso IA (sin datos)' if density < 1 else
            'bajo' if density < 4 else
            'normal académico' if density < 11 else
            'alto cuantitativo'
        )
    }
```

### 6.4 Densidad de citas

```python
def citation_density(text: str) -> dict:
    """Detecta densidad de citas APA 7."""
    import re
    # Patrón APA 7: (Autor, año) o Autor (año)
    paren_citations = re.findall(r'\([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+(?:et\s+al\.?|y\s+[A-ZÁÉÍÓÚ][a-záéíóú]+))?,\s*\d{4}[a-z]?\)', text)
    narrative_citations = re.findall(r'\b[A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+(?:et\s+al\.?|y\s+[A-ZÁÉÍÓÚ][a-záéíóú]+))?\s*\(\d{4}[a-z]?\)', text)
    page_citations = re.findall(r'\(p\.\s*\d+(-\d+)?\)', text)

    total_citations = len(paren_citations) + len(narrative_citations)
    word_count = len(text.split())
    density = (total_citations / max(1, word_count)) * 1000

    return {
        'paren_citations': len(paren_citations),
        'narrative_citations': len(narrative_citations),
        'page_specific': len(page_citations),
        'density_per_1000': round(density, 1),
        'expected_range': '5-15 por 1000 en marco teórico',
        'interpretation': (
            'sospechoso IA (sin citas)' if density < 2 else
            'bajo' if density < 5 else
            'normal' if density < 15 else
            'alto (revisar plagio)'
        )
    }
```

### 6.5 Repetición de estructura temática

```python
def thematic_repetition(sentences: list[str]) -> dict:
    """Detecta si las oraciones siguen estructura temática idéntica (IA loves this)."""
    import re
    structures = []
    for s in sentences:
        # Extraer patrón: Sustantivo + Verbo + Objeto + Modificador
        # Simplificado: si empieza con mismo tipo de palabra
        first_word = s.split()[0] if s.split() else ''
        first_pos = 'DET' if re.match(r'(el|la|los|las|un|una|unos|unas)', first_word.lower()) else \
                    'CONJ' if re.match(r'(y|o|pero|sin|por|para|aunque)', first_word.lower()) else \
                    'ADV' if first_word.lower().endswith('mente') else \
                    'OTHER'
        structures.append(first_pos)

    # Si >50% de oraciones empiezan con mismo tipo → sospechoso
    from collections import Counter
    counts = Counter(structures)
    most_common = counts.most_common(1)[0]
    if most_common[1] / len(structures) > 0.5:
        return {
            'dominant_structure': most_common[0],
            'dominant_ratio': round(most_common[1] / len(structures), 2),
            'ai_suspect': True,
            'score': 0.7
        }
    return {'ai_suspect': False, 'score': 0.3}
```

---

## 7. Criterios APA 7 estructurales

### 7.1 Jerarquía de títulos (H1-H5)

| Nivel | Formato APA 7 | Caso de uso típico |
|---|---|---|
| **H1** | Centrado, negrita, Title Case | Capítulo: "1. Introducción" |
| **H2** | Izquierda, negrita, Title Case | "1.1. Contexto del estudio" |
| **H3** | Izquierda, negrita cursiva, Title Case | "1.1.1. Antecedentes históricos" |
| **H4** | Sangría 1.27cm, negrita, termina con punto, Title Case | Párrafo comienza en misma línea |
| **H5** | Sangría 1.27cm, negrita cursiva, termina con punto | Sub-sub-sección dentro de H4 |

**Validaciones automáticas**:
- ✗ Saltos de nivel (H1 → H3 sin H2 intermedio)
- ✗ H1 sin numeración cuando otros H1 sí la tienen
- ✗ H4 o H5 sin texto corrido después (deben ser subtítulos de párrafo)
- ✗ Más de 5 niveles de jerarquía (en cualquier trabajo <200 páginas)

### 7.2 Validación de secciones obligatorias

```python
REQUIRED_SECTIONS_APA7 = {
    'tesis_profesional': ['portada', 'resumen', 'introduccion', 'marco_teorico',
                         'metodologia', 'resultados', 'discusion', 'conclusiones',
                         'referencias'],
    'ensayo_academico': ['introduccion', 'cuerpo', 'conclusiones', 'referencias'],
    'articulo_cientifico': ['resumen', 'introduccion', 'metodologia', 'resultados',
                           'discusion', 'conclusiones', 'referencias'],
}

def validate_sections(found_sections: list[str], doc_type: str) -> dict:
    """Valida que el documento tenga las secciones esperadas."""
    required = REQUIRED_SECTIONS_APA7.get(doc_type, [])
    found_lower = [s.lower() for s in found_sections]
    missing = [s for s in required if s not in found_lower]
    extra = [s for s in found_lower if s not in required]
    return {
        'missing': missing,
        'extra': extra,
        'completeness': 1 - len(missing) / len(required),
        'severity': 'high' if len(missing) > 0 else 'ok'
    }
```

### 7.3 Tablas APA 7

- ❌ Líneas verticales prohibidas
- ✅ Solo 3 líneas horizontales: superior, inferior, y bajo el encabezado
- ✅ Bordes de 0.5-0.75pt
- ✅ Encabezados en negrita
- ✅ Títulos en cursiva arriba de la tabla
- ✅ Notas al pie con "Nota." en cursiva

### 7.4 Citas

- **Corta (<40 palabras)**: entre comillas, dentro del párrafo
- **Larga (≥40 palabras)**: bloque independiente, sin comillas, sangría 1.27cm izquierda
- **Cita narrativa**: Autor (año) dice que "..."
- **Cita parentética**: (Autor, año, p. X)
- **3+ autores**: "et al." desde la primera cita (cambio APA 7 vs APA 6)

### 7.5 Referencias

- Orden alfabético por apellido del primer autor
- Sangría francesa de 1.27cm
- DOI en formato URL: `https://doi.org/10.xxxx/xxxxx`
- Itálicas en título de revista/libro, no en título de artículo

---

## 8. Falsos positivos conocidos y mitigación

Esta es la sección más crítica. Un sistema que marca como IA el texto de un estudiante inocente es peor que no detectar nada.

### 8.1 Tipologías de falsos positivos

#### 8.1.1 Textos académicos muy formales
**Síntoma**: alto uso de conectivos, voz pasiva, vocabulario "IA-típico".
**Causa**: el estudiante aprendió a escribir formalmente.
**Mitigación**:
- No marcar solo por densidad de conectivos si el estudiante tiene historial de escritura formal
- Verificar si hay variación natural en longitud de oraciones (burstiness alto)
- Cruzar con datos: si el texto tiene citas específicas + números + ejemplos concretos, es humano

#### 8.1.2 Estudiantes no nativos
**Síntoma**: estructura sintáctica calco del inglés, vocabulario limitado, repeticiones.
**Causa**: traducción literal o dominio limitado del español.
**Mitigación**:
- Detectar anglicismos (`"realizar una decisión"` en vez de `"tomar una decisión"`)
- Si la densidad de anglicismos >5 por 1,000 palabras → reducir score IA en 0.2
- El TTR bajo de un no-nativo es normal, no necesariamente IA

#### 8.1.3 Textos técnicos con terminología
**Síntoma**: baja diversidad léxica (TTR bajo) por repetición de términos técnicos.
**Causa**: el campo exige vocabulario especializado.
**Mitigación**:
- Calcular TTR excluyendo términos técnicos (lista blanca por dominio)
- Si el texto es de Ingeniería/Medicina/Derecho, ajustar TTR esperado a 0.50-0.60 (no 0.65-0.80)

#### 8.1.4 Resúmenes ejecutivos y abstracts
**Síntoma**: estructura predecible, frases hechas, sin variación.
**Causa**: el género exige comprimir y formalizar.
**Mitigación**:
- No aplicar reglas de detección IA a la sección "Resumen" o "Abstract"
- El abstract es por definición "formulaico" — no penalizar

#### 8.1.5 Traducciones
**Síntoma**: estructuras calcadas del inglés, frases que en español suenan extrañas.
**Causa**: traducción automática o manual de otro idioma.
**Mitigación**:
- Detectar traducción antes de aplicar reglas IA
- Señales de traducción: orden de adjetivos no idiomático, falsos amigos, calcos sintácticos
- Si es traducción, las reglas IA no aplican (es texto humano, solo traducido)

#### 8.1.6 Citas textuales largas
**Síntoma**: trozos de texto con patrones IA dentro de un documento humano.
**Causa**: el autor está citando a otro autor (posiblemente IA o anterior a IA).
**Mitigación**:
- Detectar bloques entre comillas o con sangría de cita en bloque
- Excluir estos bloques del análisis de IA
- Marcarlos como "cita externa, no analizable"

#### 8.1.7 Plantillas institucionales
**Síntoma**: secciones con texto pre-escrito que el estudiante solo rellena.
**Causa**: la universidad exige cierta redacción canónica.
**Mitigación**:
- Mantener lista de plantillas conocidas (portadas, metodologías estándar)
- Hash exacto o fuzzy match → excluir del análisis
- Reportar como "texto institucional, no analizable"

#### 8.1.8 Listas y enumeraciones
**Síntoma**: alta frecuencia de estructuras paralelas.
**Causa**: el contenido es por naturaleza una lista.
**Mitigación**:
- No aplicar reglas de paralelismo a texto dentro de `<ul>` o `<ol>`
- Las listas son legítimamente estructuradas

#### 8.1.9 Textos muy cortos
**Síntoma**: cualquier métrica estadística es ruidosa con <200 palabras.
**Mitigación**:
- Si el texto tiene <200 palabras, NO emitir veredicto IA
- Mostrar advertencia: "Texto demasiado corto para análisis confiable"

#### 8.1.10 Textos muy densos en datos
**Síntoma**: bajo TTR, alta repetición.
**Causa**: reportes estadísticos, resultados cuantitativos.
**Mitigación**:
- Detectar sección "Resultados" o "Análisis estadístico"
- En estas secciones, ajustar umbrales (TTR esperado 0.40-0.55)
- No penalizar por baja diversidad léxica

### 8.2 Matriz de atenuación

```python
FALSE_POSITIVE_FACTORS = {
    'is_translation': -0.20,           # texto traducido
    'is_non_native': -0.15,            # autor no nativo
    'is_technical_domain': -0.10,      # dominio técnico
    'is_abstract_section': -0.20,      # sección abstract
    'is_results_section': -0.15,       # sección resultados
    'is_institutional_template': -0.30,# plantilla institucional
    'is_quoted_block': -0.50,          # cita textual
    'is_list_block': -0.20,             # dentro de lista
    'text_too_short': -0.50,            # <200 palabras
    'has_specific_data': -0.10,         # tiene números, fechas, nombres concretos
    'has_first_person_methodology': -0.15,  # metodología en 1a persona
    'has_page_specific_citations': -0.10,   # citas con pag.
}

def adjust_for_false_positives(ia_score: float, text: str, section: str, context: dict) -> dict:
    """Ajusta el score IA por factores de falso positivo."""
    adjustments = []

    if context.get('is_translation'):
        ia_score += FALSE_POSITIVE_FACTORS['is_translation']
        adjustments.append('traducción detectada (-0.20)')

    if context.get('is_non_native'):
        ia_score += FALSE_POSITIVE_FACTORS['is_non_native']
        adjustments.append('autor no nativo (-0.15)')

    if section in ('abstract', 'resumen'):
        ia_score += FALSE_POSITIVE_FACTORS['is_abstract_section']
        adjustments.append('sección abstract (-0.20)')

    if section in ('results', 'resultados'):
        ia_score += FALSE_POSITIVE_FACTORS['is_results_section']
        adjustments.append('sección resultados (-0.15)')

    word_count = len(text.split())
    if word_count < 200:
        ia_score += FALSE_POSITIVE_FACTORS['text_too_short']
        adjustments.append(f'texto corto ({word_count} palabras, -0.50)')

    # Datos específicos presentes
    import re
    if re.search(r'\b(19|20)\d{2}\b', text) and re.search(r'\b\d+([.,]\d+)?%?\b', text):
        ia_score += FALSE_POSITIVE_FACTORS['has_specific_data']
        adjustments.append('datos específicos presentes (-0.10)')

    if re.search(r'\(p\.\s*\d+', text):
        ia_score += FALSE_POSITIVE_FACTORS['has_page_specific_citations']
        adjustments.append('citas con página (-0.10)')

    # 1a persona en metodología
    if section in ('methodology', 'metodologia') and re.search(r'\b(diseñé|implementé|validé|realicé|desarrollé|elaboré|construí)\b', text, re.IGNORECASE):
        ia_score += FALSE_POSITIVE_FACTORS['has_first_person_methodology']
        adjustments.append('1a persona en metodología (-0.15)')

    return {
        'adjusted_score': max(0, min(1, ia_score)),
        'adjustments': adjustments,
        'original_score': ia_score + sum(FALSE_POSITIVE_FACTORS[k] for k in
                                          ['is_translation','is_non_native','is_abstract_section',
                                           'is_results_section','text_too_short','has_specific_data',
                                           'has_page_specific_citations','has_first_person_methodology']
                                          if context.get(k) or (k == 'text_too_short' and word_count < 200)
                                          or (k == 'has_specific_data' and re.search(r'\b(19|20)\d{2}\b', text)))
    }
```

### 8.3 Reglas anti-falso-positivo (no marcar IA si...)

```python
NEVER_FLAG_AS_IA_IF = [
    # 1. El texto contiene anécdotas personales específicas
    lambda text: bool(re.search(r'(mi (madre|padre|hermano|profesor)|cuando yo tenía|en mi (pueblo|colegio|infancia))', text, re.IGNORECASE)),

    # 2. Hay números muy específicos que la IA no inventaría (carnets, IDs)
    lambda text: bool(re.search(r'\b\d{4}-\d{4}[A-Z]\b', text)),  # formato carnet UNI

    # 3. Errores ortográficos comunes en humanos (la IA casi no comete)
    lambda text: bool(re.search(r'\b(aika|aún|aun|hay|ay|allá|alla|haya|halla)\b', text, re.IGNORECASE)
                   and len(re.findall(r'(  |,\s*,|\.\s*\.|;\s*;)', text)) > 2),

    # 4. Abreviaturas locales no estándar
    lambda text: bool(re.search(r'\b(Sr\.|Sra\.|Lic\.|Ing\.|Arq\.|Dra\.|Prof\.)\s+[A-Z]', text)),

    # 5. Expresiones idiomáticas regionales
    lambda text: bool(re.search(r'(pucha|diablo|caramba|válame|madre mía|por dicha|qué vergüenza)', text, re.IGNORECASE)),

    # 6. Referencias a eventos locales con fechas específicas
    lambda text: bool(re.search(r'(terremoto|sismo|inundación|protesta|huelga)\s+(de|del)\s+\d{4}', text, re.IGNORECASE)),
]
```

### 8.4 Estrategia de "defensa en profundidad"

Nunca marcar IA basado en UN solo indicador. El score final debe combinar:

1. **Burstiness** (peso 0.20)
2. **Patrones léxicos IA** (peso 0.25)
3. **TTR / diversidad léxica** (peso 0.15)
4. **Homogeneidad sintáctica** (peso 0.15)
5. **Densidad de conectivos** (peso 0.10)
6. **Ausencia de datos específicos** (peso 0.10)
7. **Estructura canónica IA** (peso 0.05)

**Umbral final**:
- `score > 0.85` → "Muy probable IA" (rojo)
- `0.65 < score ≤ 0.85` → "Posible IA, revisar" (amarillo)
- `0.40 < score ≤ 0.65` → "Indeterminado" (gris)
- `score ≤ 0.40` → "Probable humano" (verde)

---

## 9. Esquema Pydantic para integración

Reemplaza o complementa tu `models.py` existente.

```python
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional, List, Dict, Any

class Severity(str, Enum):
    CRIT = "crit"   # bloquea entrega
    HIGH = "high"   # recomendado resolver
    MEDIUM = "med"  # estilo/mejora
    LOW = "low"     # sugerencia cosmética
    OK = "ok"       # sin problema

class AuditCategory(str, Enum):
    AI_DETECTION = "ai_detection"
    GRAMMAR = "grammar"
    STRUCTURE = "structure"
    APA7_FORMAT = "apa7_format"
    BLOOM_OBJECTIVES = "bloom_objectives"
    CITATIONS = "citations"
    STYLE = "style"

class AuditFinding(BaseModel):
    id: str = Field(..., description="UUID único del hallazgo")
    category: AuditCategory
    severity: Severity
    title: str = Field(..., max_length=80, description="Resumen corto ≤80 chars")
    description: str = Field(..., description="Por qué es un problema")
    recommendation: str = Field(..., description="Qué hacer al respecto")
    page: Optional[int] = None
    paragraph: Optional[int] = None
    sentence_index: Optional[int] = None
    excerpt: Optional[str] = Field(None, max_length=200, description="Cita textual si aplica")
    score: float = Field(0.0, ge=0, le=1, description="Confianza 0-1")
    false_positive_check: Optional[str] = Field(None, description="Si fue atenuado, por qué")

class IAAnalysisResult(BaseModel):
    overall_score: float = Field(..., ge=0, le=1)
    burstiness: Dict[str, Any]
    perplexity_proxy: Dict[str, Any]
    lexical_patterns: List[Dict[str, Any]]
    syntactic_patterns: Dict[str, Any]
    semantic_patterns: List[Dict[str, Any]]
    data_density: Dict[str, Any]
    citation_density: Dict[str, Any]
    false_positive_adjustments: List[str]
    final_verdict: str  # "probable_ia" | "possible_ia" | "indeterminate" | "probable_human"

class BloomAuditResult(BaseModel):
    objectives_analyzed: int
    measurable: int
    vague: int
    levels_detected: List[str]
    consistency_score: float = Field(..., ge=0, le=1)

class StructureAuditResult(BaseModel):
    sections_found: List[str]
    sections_missing: List[str]
    heading_hierarchy_ok: bool
    heading_jumps: List[Dict[str, Any]]
    paragraph_lengths: Dict[str, Any]  # avg, std, min, max
    sentence_lengths: Dict[str, Any]

class FullAuditReport(BaseModel):
    document_id: str
    document_type: str  # "tesis", "ensayo", "articulo"
    total_words: int
    sections_analyzed: List[str]
    ia_analysis: IAAnalysisResult
    bloom_audit: BloomAuditResult
    structure_audit: StructureAuditResult
    findings: List[AuditFinding]
    summary: str = Field(..., description="Narrativa accionable para el usuario")
    generated_at: str  # ISO datetime
```

### 9.1 Integración con `proactive_auditor.py`

```python
class ProactiveAuditor:
    """Extiende tu proactive_auditor.py existente."""

    def run_full_audit(self, document: Document) -> FullAuditReport:
        """Ejecuta todas las auditorías y devuelve un reporte consolidado."""
        sections = self._split_by_sections(document.text)

        findings = []
        ia_scores = []
        bloom_results = []

        for section_name, section_text in sections.items():
            # 1. IA Detection
            ia_result = self._analyze_ia(section_text, section_name)
            ia_scores.append(ia_result.overall_score)
            findings.extend(self._ia_to_findings(ia_result, section_name))

            # 2. Grammar check (delegado a language_tool_python)
            grammar_findings = self._check_grammar(section_text, section_name)
            findings.extend(grammar_findings)

            # 3. APA 7 structural
            apa_findings = self._check_apa7_structure(section_text, section_name)
            findings.extend(apa_findings)

            # 4. Bloom (solo en objetivos)
            if section_name in ('objetivos', 'objectives'):
                bloom = self._audit_bloom(section_text)
                bloom_results.append(bloom)

        # 5. Document-wide
        overall_ia = sum(ia_scores) / max(1, len(ia_scores))
        structure = self._check_global_structure(sections)

        return FullAuditReport(
            document_id=document.id,
            document_type=document.type,
            total_words=len(document.text.split()),
            sections_analyzed=list(sections.keys()),
            ia_analysis=self._aggregate_ia(ia_scores, document.text),
            bloom_audit=self._aggregate_bloom(bloom_results),
            structure_audit=structure,
            findings=sorted(findings, key=lambda f: {'crit': 0, 'high': 1, 'med': 2, 'low': 3, 'ok': 4}[f.severity.value]),
            summary=self._build_narrative(overall_ia, len(findings), structure),
            generated_at=datetime.now().isoformat(),
        )

    def _build_narrative(self, ia_score: float, finding_count: int, structure: StructureAuditResult) -> str:
        """Genera NarrativeScore para el panel."""
        crit_count = sum(1 for f in self.findings if f.severity == Severity.CRIT)
        if crit_count > 0:
            return (f"Estás al {100 - int(ia_score*100)}% APA. "
                    f"Faltan {crit_count} ajustes críticos para llegar a 100%.")
        elif ia_score > 0.65:
            return (f"Tu documento tiene {finding_count} observaciones. "
                    f"Score IA: {int(ia_score*100)}% (posible IA, revisar).")
        else:
            return (f"Documento en buen estado. {finding_count} observaciones menores. "
                    f"Score IA: {int(ia_score*100)}% (bajo).")
```

---

## 10. Metodología de detección propuesta (pipeline multi-capa)

### 10.1 Arquitectura del pipeline

```
Documento .docx
     │
     ▼
[1] Parser XML (lxml, ya existe en WordAPA7)
     │ extrae texto plano + estructura
     ▼
[2] Heurística local (rápida, sin red)
     │ - burstiness
     │ - TTR
     │ - patrones léxicos IA (regex)
     │ - estructura canónica
     ▼
[3] ¿Confianza alta? ── SÍ ──► Devolver resultado
     │
     NO (ambiguo)
     ▼
[4] AI Router (ya existe en WordAPA7)
     │ - Ollama local (offline)
     │ - Groq/Cerebras (rápido)
     │ - NVIDIA NIM (preciso)
     ▼
[5] LLM evaluación contextual
     │ - perplejidad real
     │ - coherencia semántica
     │ - detección de patrones sutiles
     ▼
[6] Fusión de scores + ajuste por falsos positivos
     │
     ▼
[7] Reporte consolidado (FullAuditReport)
```

### 10.2 Capa 1: Heurística local (always-on)

**Latencia**: <500ms por documento.
**Recursos**: CPU only.
**Output**: score preliminar + flag de confianza.

```python
def heuristic_layer(text: str) -> dict:
    """Capa 1: heurística rápida local."""
    sentences = split_sentences(text)

    burst = burstiness_score(sentences)
    perp = perplexity_proxy(text)
    lex_patterns = detect_lexical_ia_patterns(text)
    syntactic = syntactic_homogeneity(sentences)
    data_dens = data_density(text)
    citation_dens = citation_density(text)
    thematic = thematic_repetition(sentences)

    # Score preliminar (sin LLM)
    score = (
        (1 - burst['burstiness_score']) * 0.25 +
        (1 - perp['perplexity_proxy_score']) * 0.20 +
        lex_patterns['score'] * 0.25 +
        syntactic['score'] * 0.15 +
        (1 if data_dens['density_per_1000'] < 2 else 0) * 0.10 +
        (1 if citation_dens['density_per_1000'] < 2 else 0) * 0.05
    )

    confidence = 'high' if (score > 0.85 or score < 0.25) else 'medium' if (score > 0.65 or score < 0.45) else 'low'

    return {
        'preliminary_score': round(score, 2),
        'confidence': confidence,
        'metrics': {
            'burstiness': burst,
            'perplexity_proxy': perp,
            'lexical_patterns': lex_patterns,
            'syntactic': syntactic,
            'data_density': data_dens,
            'citation_density': citation_dens,
        }
    }
```

### 10.3 Capa 2: LLM contextual (solo si confianza = medium/low)

```python
async def llm_layer(text: str, heuristics: dict, ai_router) -> dict:
    """Capa 2: solo si la heurística es ambigua."""
    if heuristics['confidence'] == 'high':
        return {'llm_score': None, 'reason': 'heurística suficiente'}

    # Solo enviar 1,500 palabras representativas (no todo el doc)
    sample = sample_representative_text(text, max_words=1500)

    prompt = f"""Analiza si el siguiente texto fue generado por IA. Considera:
- Variación natural de longitud de oraciones
- Uso de vocabulario específico vs. genérico
- Presencia de anécdotas o referencias personales
- Errores menores típicos de humanos
- Patrones que solo un humano escribiría

Heurísticas preliminares: burstiness={heuristics['metrics']['burstiness']['burstiness_score']},
TTR={heuristics['metrics']['perplexity_proxy']['ttr']}, lexical_score={heuristics['metrics']['lexical_patterns']['score']}

Texto:
{sample}

Responde en JSON: {{"score": 0.0-1.0, "reason": "...", "false_positive_risk": "low|medium|high"}}"""

    response = await ai_router.route_completion(prompt, prefer_local=True)
    return {
        'llm_score': response.score,
        'llm_reason': response.reason,
        'false_positive_risk': response.false_positive_risk,
    }
```

### 10.4 Capa 3: Ajuste por falsos positivos (always-on)

Aplica la matriz de atenuación de la sección 8.2.

### 10.5 Umbral adaptativo por tipo de documento

```python
THRESHOLDS_BY_DOC_TYPE = {
    'ensayo_argumentativo': {'crit': 0.85, 'high': 0.70, 'medium': 0.50},
    'tesis_profesional': {'crit': 0.80, 'high': 0.65, 'medium': 0.45},
    'articulo_cientifico': {'crit': 0.80, 'high': 0.65, 'medium': 0.45},
    'resumen_academico': {'crit': 0.90, 'high': 0.80, 'medium': 0.60},  # más laxo
    'informe_tecnico': {'crit': 0.85, 'high': 0.70, 'medium': 0.50},
}

def verdict(score: float, doc_type: str) -> str:
    thresholds = THRESHOLDS_BY_DOC_TYPE.get(doc_type, THRESHOLDS_BY_DOC_TYPE['tesis_profesional'])
    if score >= thresholds['crit']:
        return 'very_likely_ia'
    elif score >= thresholds['high']:
        return 'possible_ia'
    elif score >= thresholds['medium']:
        return 'indeterminate'
    else:
        return 'likely_human'
```

### 10.6 Metodología de scoring ponderado (propuesta final)

```python
def final_ia_score(heuristics: dict, llm_result: dict, false_positive_adjustment: float) -> dict:
    """Combina heurística + LLM + ajuste por falsos positivos."""
    h_score = heuristics['preliminary_score']

    if llm_result['llm_score'] is not None:
        # LLM confirmó o refutó heurística
        l_score = llm_result['llm_score']
        # Si discrepan mucho, dar más peso al LLM (más contexto)
        if abs(h_score - l_score) > 0.25:
            combined = l_score * 0.7 + h_score * 0.3
        else:
            combined = (l_score + h_score) / 2
    else:
        combined = h_score

    # Aplicar ajuste de falsos positivos
    adjusted = combined + false_positive_adjustment
    adjusted = max(0, min(1, adjusted))

    return {
        'final_score': round(adjusted, 2),
        'heuristic_score': round(h_score, 2),
        'llm_score': round(llm_result['llm_score'], 2) if llm_result['llm_score'] else None,
        'adjustment': round(false_positive_adjustment, 2),
        'confidence': heuristics['confidence'],
    }
```

---

## 11. Bibliografía y referencias técnicas

### 11.1 Investigación base sobre detección de IA

- **GPTZero** (Tian, E. & Wolf, C., 2023): introdujo el concepto de "burstiness" como métrica principal para detección de IA en texto.
- **Mitchell et al. (2023)**: "DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature". Propone curvatura de probabilidad del modelo como indicador.
- **Gehrmann et al. (2019)**: "GLTR: Statistical Detection and Visualization of Generated Text". Visualización de patrones de generación.
- **Ippolito et al. (2020)**: "Automatic Detection of Generated Text is Easiest when Humans are Tricked". Demuestra que la detección es más difícil cuando la IA está bien "tuneada" para parecer humana.

### 11.2 Sobre taxonomía de Bloom

- **Anderson, L. W., & Krathwohl, D. R. (2001)**: "A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's Taxonomy of Educational Objectives". Longman.
- **Bloom, B. S. (1956)**: "Taxonomy of Educational Objectives, Handbook I: The Cognitive Domain". David McKay Co Inc.
- **Krathwohl, D. R. (2002)**: "A Revision of Bloom's Taxonomy: An Overview". Theory Into Practice, 41(4), 212-218.

### 11.3 Sobre APA 7

- **American Psychological Association (2020)**: "Publication Manual of the American Psychological Association" (7th ed.).
- **Purdue OWL**: Guías de referencia APA 7 actualizadas (https://owl.purdue.edu).

### 11.4 Patrones léxicos y sintácticos en español académico

- **Real Academia Española (2010)**: "Nueva gramática de la lengua española". Espasa.
- **Bosque, I. & Demonte, V. (dirs.) (1999)**: "Gramática descriptiva de la lengua española". Espasa.
- **Cassany, D. (1995)**: "La cocina de la escritura". Anagrama. Sobre estilo académico en español.

### 11.5 Datasets para entrenar/validar el detector

- **HC3 (Human ChatGPT Comparison Corpus)**: 37K preguntas respondidas por humanos y ChatGPT. Útil para entrenar clasificadores binarios.
- **MAGE (Massive AI-generated Text Detection Evaluation)**: benchmark con 13 dominios.
- **MULTITUDE (Spanish subset)**: textos humanos vs IA en español, multi-dominio.

### 11.6 Implementación práctica

- **language_tool_python**: wrapper de LanguageTool para detección gramatical offline en español.
- **spaCy (es_core_news_lg)**: NLP pipeline para tokenización, POS tagging, parsing sintáctico.
- **transformers (HuggingFace)**: modelos pre-entrenados como `roberta-base-openai-detector` (en inglés, adaptable).

---

## 12. Jerarquía de objetivos — coherencia Bloom general vs específicos

Regla pedagógica fundamental: **los objetivos específicos NO pueden tener un nivel cognitivo Bloom superior al objetivo general**. Si el general es "Analizar" (nivel 4), los específicos pueden ser "Recordar" (1), "Entender" (2), "Aplicar" (3) o "Analizar" (4), pero NUNCA "Evaluar" (5) ni "Crear" (6). Los específicos descomponen el general, no lo superan.

### 12.1 Principio pedagógico subyacente

El objetivo general enuncia la **meta cognitiva final** del trabajo. Los objetivos específicos son los **pasos incrementales** para alcanzarla. Si un específico exige un nivel cognitivo superior al general, significa que:
- El general está mal redactado (muy bajo para lo que pide el trabajo real)
- El específico está mal formulado (pide algo que excede el alcance declarado)
- Hay incoherencia de diseño instruccional

Esto es algo que un revisor humano cansado pasa por alto, pero un programa puede atrapar sistemáticamente.

### 12.2 Matriz de coherencia general → específicos

```
Nivel del OBJETIVO GENERAL    │ Niveles PERMITIDOS en específicos
─────────────────────────────┼──────────────────────────────────
Recordar (1)                  │ Recordar (1)
Entender (2)                  │ Recordar (1), Entender (2)
Aplicar (3)                   │ Recordar (1), Entender (2), Aplicar (3)
Analizar (4)                  │ Recordar (1), Entender (2), Aplicar (3), Analizar (4)
Evaluar (5)                   │ 1, 2, 3, 4, Evaluar (5)
Crear (6)                     │ 1, 2, 3, 4, 5, Crear (6) — cualquier nivel
```

**Línea roja**: si un específico tiene nivel SUPERIOR al general → `severity = 'high'`.

### 12.3 Otros casos de incoherencia entre objetivos

#### 12.3.1 Todos los específicos en el mismo nivel (deben variar)

Si el general es "Analizar" y los 5 específicos son todos "Analizar" → sospecha de plantilla copiada o IA. Lo esperado: 2-3 niveles diferentes entre los específicos (uno de recordar datos, otro de aplicar método, otro de analizar resultados).

#### 12.3.2 Específicos que no cubren el verbo del general

Si el general es "Evaluar la eficacia del método X", pero ningún específico incluye verbos de evaluación (juzgar, valorar, criticar, justificar), hay un vacío: el general no se cumple.

```python
def coverage_check(general_verb: str, specific_verbs: list[str]) -> dict:
    """Verifica que los específicos cubran el nivel del general."""
    general_level = find_bloom_level(general_verb)
    if not general_level:
        return {'ok': True, 'reason': 'general no tiene verbo Bloom claro'}

    # ¿Algún específico está al mismo nivel o adyacente?
    specific_levels = [find_bloom_level(v) for v in specific_verbs if find_bloom_level(v)]
    same_level = general_level in specific_levels
    adjacent_lower = (general_level - 1) in specific_levels

    return {
        'general_level': general_level,
        'specific_levels': specific_levels,
        'covers_general': same_level or adjacent_lower,
        'severity': 'medium' if not (same_level or adjacent_lower) else 'ok',
        'recommendation': (
            f"Ningún específico está al nivel del general ({general_level}). "
            f"Agrega al menos uno con verbo de nivel {general_level}."
            if not (same_level or adjacent_lower) else None
        )
    }
```

#### 12.3.3 Específicos sin progresión

Si los específicos son "1. Recordar, 2. Recordar, 3. Recordar" → no hay progresión cognitiva. Lo esperado: una secuencia que asciende gradualmente.

```python
def progression_check(specific_verbs: list[str]) -> dict:
    """Detecta si hay progresión cognitiva entre específicos."""
    levels = [find_bloom_level(v) for v in specific_verbs if find_bloom_level(v)]
    if len(levels) < 2:
        return {'progression': 'insufficient_data'}

    # Calcular tendencia: ¿asciende, desciende, es plana o caótica?
    deltas = [levels[i+1] - levels[i] for i in range(len(levels)-1)]
    ascendant = all(d >= 0 for d in deltas)
    descendant = all(d <= 0 for d in deltas)
    flat = all(d == 0 for d in deltas)

    if flat:
        severity = 'medium'
        msg = 'Sin progresión: todos los específicos en el mismo nivel Bloom'
    elif ascendant:
        severity = 'ok'
        msg = 'Progresión ascendente adecuada'
    elif descendant:
        severity = 'medium'
        msg = 'Progresión descendente — ¿revisar orden de los específicos?'
    else:
        severity = 'low'
        msg = 'Progresión errática entre niveles'

    return {
        'levels': levels,
        'deltas': deltas,
        'pattern': 'ascendant' if ascendant else 'descendant' if descendant else 'flat' if flat else 'erratic',
        'severity': severity,
        'recommendation': msg
    }
```

#### 12.3.4 Objetivo general sin verbo Bloom medible

Si el general dice "Comprender el proceso X" — "comprender" es verbo vago, no medible. El general debe usar verbo Bloom accionable: "Analizar el proceso X", "Describir el proceso X", etc.

#### 12.3.5 General con dos o más verbos mezclados

Si el general dice "Analizar y proponer mejoras al proceso X" → combina "Analizar" (4) con "Proponer" (6). Esto es problemático: el general debe tener un nivel cognitivo único dominante. Si hay 2, el nivel es el más alto (6 en este caso), pero debería reformularse como 2 objetivos generales o uno solo con el verbo superior.

### 12.4 Implementación completa

```python
from typing import List, Optional, Tuple

BLOOM_LEVELS = {
    'recordar': 1, 'entender': 2, 'aplicar': 3,
    'analizar': 4, 'evaluar': 5, 'crear': 6,
}

def find_bloom_level(verb: str) -> Optional[int]:
    """Devuelve el nivel Bloom (1-6) de un verbo, o None si no se encuentra."""
    verb_lower = verb.lower().strip()
    for level, verbs in BLOOM_VERBS.items():
        if verb_lower in [v.lower() for v in verbs]:
            return BLOOM_LEVELS[level]
    # Coincidencia parcial (ej. "analizar" en "analizar críticamente")
    for level, verbs in BLOOM_VERBS.items():
        for v in verbs:
            if v.lower() in verb_lower:
                return BLOOM_LEVELS[level]
    return None

def audit_objectives_hierarchy(general: str, specifics: List[str]) -> dict:
    """Auditoría completa de coherencia entre objetivo general y específicos."""
    findings = []

    # 1. Extraer verbos
    general_verbs = extract_main_verbs(general)
    general_levels = [find_bloom_level(v) for v in general_verbs if find_bloom_level(v)]

    if not general_levels:
        findings.append({
            'severity': 'high',
            'title': 'Objetivo general sin verbo Bloom medible',
            'description': f'No se detectó verbo Bloom en: "{general}"',
            'recommendation': 'Reformular con verbo accionable (analizar, evaluar, diseñar, proponer, etc.)'
        })
        general_level = None
    else:
        general_level = max(general_levels)  # si hay varios, el dominante es el más alto
        if len(general_levels) > 1:
            findings.append({
                'severity': 'medium',
                'title': 'Objetivo general con múltiples verbos Bloom',
                'description': f'Niveles detectados: {general_levels}. El general debería tener un único nivel cognitivo dominante.',
                'recommendation': 'Considerar dividir en 2 objetivos generales o reformular con un solo verbo principal.'
            })

    # 2. Auditar cada específico
    specific_results = []
    for i, spec in enumerate(specifics, 1):
        spec_verbs = extract_main_verbs(spec)
        spec_levels = [find_bloom_level(v) for v in spec_verbs if find_bloom_level(v)]
        spec_level = max(spec_levels) if spec_levels else None

        result = {
            'index': i,
            'text': spec,
            'verbs_detected': spec_verbs,
            'bloom_level': spec_level,
            'is_measurable': spec_level is not None,
        }

        if spec_level is None:
            result['severity'] = 'high'
            result['issue'] = 'Sin verbo Bloom medible'
        elif general_level and spec_level > general_level:
            result['severity'] = 'high'
            result['issue'] = f'Específico nivel {spec_level} supera al general ({general_level})'
            findings.append({
                'severity': 'high',
                'title': f'Objetivo específico #{i} supera el nivel cognitivo del general',
                'description': f'El específico "{spec}" usa un verbo de nivel Bloom {spec_level}, pero el general está en nivel {general_level}. Los específicos descomponen el general, no lo superan.',
                'recommendation': f'Reformular el específico con verbo de nivel ≤{general_level}, o elevar el general a nivel {spec_level}.'
            })
        else:
            result['severity'] = 'ok'

        specific_results.append(result)

    # 3. Verificar cobertura del general
    if general_level:
        coverage = coverage_check_by_level(general_level, [r['bloom_level'] for r in specific_results if r['bloom_level']])
        if not coverage['covers']:
            findings.append({
                'severity': 'medium',
                'title': 'Ningún objetivo específico alcanza el nivel del general',
                'description': f'El general está en nivel {general_level} pero ningún específico lo cubre.',
                'recommendation': f'Agregar al menos un específico con verbo de nivel {general_level} o {general_level-1}.'
            })

    # 4. Verificar progresión
    progression = progression_check([r['bloom_level'] for r in specific_results if r['bloom_level']])
    if progression['severity'] != 'ok':
        findings.append({
            'severity': progression['severity'],
            'title': 'Sin progresión cognitiva entre específicos',
            'description': progression['recommendation'],
            'recommendation': 'Reordenar específicos para que asciendan gradualmente en nivel Bloom.'
        })

    return {
        'general_level': general_level,
        'specific_results': specific_results,
        'findings': findings,
        'summary': f"{len(findings)} hallazgos · {sum(1 for f in findings if f['severity']=='high')} críticos"
    }
```

### 12.5 Casos de prueba típicos

#### Caso 1 — Incoherencia (específico supera al general) ❌

```
GENERAL: "Analizar el proceso de producción de la empresa X"  (nivel 4)
ESPECÍFICOS:
  1. "Describir las etapas del proceso"   (nivel 1 - Recordar/Describir) ✓
  2. "Comparar con estándares ISO"        (nivel 4 - Analizar) ✓
  3. "Proponer un nuevo modelo de gestión" (nivel 6 - Crear) ❌ SUPERA AL GENERAL
```
→ Hallazgo `high`: el específico 3 pide crear algo, pero el general solo pide analizar. Reformular el general a "Analizar y proponer mejoras..." o cambiar el específico 3 a "Identificar oportunidades de mejora" (nivel 4).

#### Caso 2 — Sin progresión ❌

```
GENERAL: "Evaluar la eficacia del método X"  (nivel 5)
ESPECÍFICOS:
  1. "Listar las características del método"   (nivel 1)
  2. "Definir el contexto de aplicación"        (nivel 1)
  3. "Enumerar los beneficios reportados"       (nivel 1)
```
→ Hallazgo `medium`: los específicos están todos en nivel 1, pero el general exige evaluación (nivel 5). Falta un específico que efectivamente evalúe.

#### Caso 3 — Vago ⚠

```
GENERAL: "Comprender el impacto de la IA en la educación"  (sin nivel Bloom)
```
→ Hallazgo `high`: "comprender" es verbo vago. Reformular a "Analizar el impacto..." o "Evaluar el impacto...".

#### Caso 4 — Coherente ✓

```
GENERAL: "Diseñar un sistema de gestión documental para la empresa X"  (nivel 6 - Crear)
ESPECÍFICOS:
  1. "Identificar los requerimientos del usuario"   (nivel 1) ✓
  2. "Analizar las soluciones existentes"            (nivel 4) ✓
  3. "Proponer la arquitectura del sistema"          (nivel 6) ✓ (igual al general)
  4. "Validar el prototipo con usuarios"             (nivel 5) ✓
```
→ Sin hallazgos. Progresión 1→4→6→5 (ascendente con retroceso válido hacia la validación final).

---

## 13. LLM para detección de incoherencias sutiles

Heurísticas y reglas capturan el 70% de los problemas. El 30% restante requiere razonamiento contextual: fechas que no cuadran, números inconsistentes, citas que mencionan autores ausentes de la bibliografía, metodología que no corresponde a los resultados. Esta sección contiene **prompts LLM listos** para tus modelos (Ollama local, Groq, Cerebras, NVIDIA NIM) que detectan lo que un humano cansado deja pasar.

### 13.1 Categorías de incoherencia que solo un LLM detecta bien

#### 13.1.1 Incoherencias numéricas

| Tipo | Ejemplo | Por qué es difícil para reglas |
|---|---|---|
| Suma que no cuadra | "Se encuestó a 50 personas: 30 hombres y 25 mujeres" (deberían ser 55) | Requiere razonamiento aritmético contextual |
| Porcentaje mal calculado | "El 80% de 200 respuestas fueron positivas (150 en total)" | 80% de 200 = 160, no 150 |
| Fechas contradictorias | "El estudio se realizó en 2023 (publicado en 2021)" | Requiere entender que "realizado" > "publicado" es imposible |
| Edad inconsistente | "Participante N, nacido en 1995, tenía 25 años al momento del estudio (2020)" | Debería tener 25, sí — pero "28 años" sería error. Requiere cálculo |
| Rangos solapados | "El rango de edad fue 18-25 años" y luego "participantes de 27 años" | Coherencia interna |

#### 13.1.2 Incoherencias de autoría y citas

| Tipo | Ejemplo |
|---|---|
| Cita sin entrada en bibliografía | "(Smith, 2022)" en el texto, pero no hay entrada "Smith" en referencias |
| Bibliografía sin cita | Entrada "García, M. (2025)" en referencias, pero "(García, 2025)" no aparece en el texto |
| Año inconsistente | "(López, 2024)" en texto, entrada dice "López, R. (2023)" |
| Inicial de autor cambiada | "(García, M., 2025)" vs entrada "García, J. (2025)" |
| Cita a página imposible | "(Smith, 2022, p. 45)" pero la fuente solo tiene 30 páginas |
| "et al." mal usado | "(García et al., 2025)" cuando García es autor único |

#### 13.1.3 Incoherencias de método y resultados

| Tipo | Ejemplo |
|---|---|
| Mención de técnica no aplicada | "Se utilizó regresión lineal" pero los resultados reportan correlaciones no significativas sin mostrar coeficiente |
| Tamaño muestral inconsistente | "n=100" en metodología, "se analizaron 85 respuestas válidas" en resultados (debería justificar el filtro) |
| Variables que desaparecen | "Las variables independientes fueron edad, género y nivel socioeconómico" pero los resultados solo reportan edad |
| Hipótesis no contrastada | "Hipótesis: X afecta a Y" pero no hay prueba estadística que lo confirme/refute |
| Escala de medida mezclada | "Likert 1-5" en método, pero resultados reportan media 6.2 |

#### 13.1.4 Incoherencias temporales y lógicas

| Tipo | Ejemplo |
|---|---|
| Orden cronológico erróneo | "En 2020 se implementó... posteriormente, en 2019, se evaluó..." |
| Causa-efecto invertido | "El aumento de ventas se debió a la campaña publicitaria lanzada un mes después" |
| Tensión verbal mezclada | "El estudio demuestra (pasado: demostró) que el método es eficaz" |
| Estado del arte obsoleto | "Hasta la fecha no existen estudios sobre X" cuando hay citas de 2023 sobre X |

#### 13.1.5 Incoherencias terminológicas

| Tipo | Ejemplo |
|---|---|
| Sinónimo introducido sin definición | "El constructo X" vs "El concepto X" vs "La variable X" sin aclarar si son lo mismo |
| Acrónimo no introducido | "El ANOVA mostró..." sin haber definido "ANOVA" antes |
| Definición contradictoria | Define "aprendizaje significativo" de una forma en marco teórico y de otra en discusión |
| Confusión de términos técnicos | "Muestra" vs "Población" usados indistintamente |

### 13.2 Prompts LLM estructurados por categoría

Cada prompt está diseñado para tu infraestructura multi-provider (Ollama local → Groq → Cerebras → NVIDIA NIM). El formato de salida es **JSON estructurado** para integrarse directo en `AuditFinding`.

#### Prompt A — Incoherencias numéricas

```python
PROMPT_NUMERICAL_CONSISTENCY = """Eres un auditor académico. Analiza el siguiente fragmento de un trabajo universitario en busca de INCOHERENCIAS NUMÉRICAS.

Busca específicamente:
1. Sumas que no cuadran (ej: "30 hombres + 25 mujeres = 50" debería ser 55)
2. Porcentajes mal calculados (ej: "80% de 200 = 150" debería ser 160)
3. Fechas contradictorias (estudios realizados después de publicados, edades que no cuadran con año de nacimiento)
4. Rangos solapados o imposibles (rango 18-25 pero se menciona participante de 27)
5. Estadísticas inconsistentes (media reportada fuera del rango posible de la escala)

FRAGMENTO:
{chunk}

Responde ÚNICAMENTE en JSON con este esquema:
{{
  "inconsistencies": [
    {{
      "type": "suma|porcentaje|fecha|rango|estadistica",
      "excerpt": "frase exacta del problema",
      "description": "por qué es inconsistente",
      "correct_value": "valor correcto si se puede inferir",
      "severity": "high|medium"
    }}
  ],
  "summary": "Resumen de 1 línea del análisis"
}}

Si no hay inconsistencias, devuelve: {{"inconsistencies": [], "summary": "Sin inconsistencias numéricas detectadas."}}"""
```

#### Prompt B — Incoherencias de autoría y citas

```python
PROMPT_CITATION_CONSISTENCY = """Eres un auditor APA 7. Tienes un texto académico y su lista de referencias. Debes detectar CITAS HUÉRFANAS y REFERENCIAS HUÉRFANAS, además de inconsistencias entre citas y referencias.

Texto del documento:
{body_text}

Lista de referencias (extraídas):
{references_list}

Analiza:
1. CITAS HUÉRFANAS: "(Autor, año)" en el texto que NO tienen entrada en la lista de referencias
2. REFERENCIAS HUÉRFANAS: entradas en la lista que NO aparecen citadas en el texto
3. INCONSISTENCIA DE AÑO: cita dice (García, 2024) pero referencia dice García (2023)
4. INCONSISTENCIA DE INICIAL: cita "(García, M.)" pero referencia "García, J."
5. "ET AL." MAL USADO: "García et al." cuando García es autor único, o al revés
6. PÁGINA IMPOSIBLE: "(Smith, 2022, p. 45)" cuando la fuente solo tiene 30 páginas

Responde en JSON:
{{
  "orphan_citations": [
    {{"citation": "(Romero, 2022)", "location": "pág. 8, párrafo 3", "suggestion": "Agregar entrada a bibliografía o eliminar cita"}}
  ],
  "orphan_references": [
    {{"reference": "López, R. (2024). Título...", "suggestion": "Citar en el texto o eliminar de bibliografía"}}
  ],
  "inconsistencies": [
    {{"type": "año|inicial|et_al|pagina", "citation": "(García, 2024)", "reference": "García, M. (2023)...", "description": "El año difiere"}}
  ],
  "summary": "X citas huérfanas, Y referencias huérfanas, Z inconsistencias"
}}"""
```

#### Prompt C — Coherencia método ↔ resultados

```python
PROMPT_METHOD_RESULTS_COHERENCE = """Eres un auditor metodológico. Analiza si los RESULTADOS reportados son coherentes con la METODOLOGÍA declarada.

METODOLOGÍA:
{methodology_section}

RESULTADOS:
{results_section}

Verifica:
1. VARIABLES DECLARADAS vs REPORTADAS: si la metodología menciona 3 variables independientes, los resultados deben reportar las 3
2. TÉCNICAS DECLARADAS vs APLICADAS: si dice "regresión lineal", los resultados deben mostrar coeficientes, R², p-values
3. TAMAÑO MUESTRAL: si "n=100" en método, los resultados deben sumar 100 (o justificar exclusiones)
4. ESCALAS: si "Likert 1-5" en método, las medias reportadas deben estar entre 1 y 5
5. HIPÓTESIS: si se plantearon hipótesis, los resultados deben contrastarlas (confirmar/refutar)
6. INSTRUMENTOS: si se declaró un cuestionario de 20 ítems, los resultados deben analizar esos 20 ítems (o justificar reducción)

Responde en JSON:
{{
  "missing_in_results": [
    {{
      "declared_in_method": "Variable: nivel socioeconómico",
      "missing_in_results": "No se reportan resultados para esta variable",
      "severity": "high"
    }}
  ],
  "undeclared_in_results": [
    {{
      "found_in_results": "Se reporta análisis de varianza",
      "not_in_method": "No se declaró ANOVA en metodología",
      "severity": "medium"
    }}
  ],
  "numeric_inconsistencies": [
    {{
      "issue": "n=100 en método pero se analizan 85 sin justificación",
      "severity": "high"
    }}
  ],
  "hypotheses_untested": [
    "Hipótesis 1 no fue contrastada estadísticamente"
  ],
  "coherence_score": 0.0-1.0,
  "summary": "..."
}}"""
```

#### Prompt D — Coherencia terminológica y de definiciones

```python
PROMPT_TERMINOLOGICAL_CONSISTENCY = """Eres un auditor terminológico. Detecta inconsistencias en el uso de términos técnicos a lo largo del documento.

DOCUMENTO COMPLETO:
{full_text}

Busca:
1. TÉRMINOS USADOS COMO SINÓNIMOS SIN ACLARACIÓN: "constructo X" vs "concepto X" vs "variable X" — ¿son lo mismo?
2. ACRÓNIMOS NO INTRODUCIDOS: "ANOVA" o "TIC" sin haber definido su significado al primer uso
3. DEFINICIONES CONTRADICTORIAS: si "aprendizaje significativo" se define de una forma en marco teórico y de otra en discusión
4. CONFUSIÓN DE TÉRMINOS: "muestra" vs "población", "validez" vs "confiabilidad", "método" vs "metodología" usados indistintamente
5. CAMBIO DE TERMINOLOGÍA A MITAD DEL DOCUMENTO: empieza usando "participantes" y cambia a "sujetos" sin justificación

Responde en JSON:
{{
  "synonym_conflicts": [
    {{
      "terms": ["constructo", "concepto", "variable"],
      "first_appearance": "pág. 12",
      "issue": "Usados como sinónimos sin aclarar si refieren a lo mismo"
    }}
  ],
  "undefined_acronyms": ["ANOVA", "TIC"],
  "contradictory_definitions": [
    {{
      "term": "aprendizaje significativo",
      "definition_1": "pág. 23: '...'",
      "definition_2": "pág. 78: '...'",
      "conflict": "Las dos definiciones no son equivalentes"
    }}
  ],
  "terminology_drift": [
    {{
      "original_term": "participantes",
      "later_term": "sujetos",
      "first_change_location": "pág. 45"
    }}
  ],
  "summary": "..."
}}"""
```

#### Prompt E — Coherencia cronológica y lógica

```python
PROMPT_TEMPORAL_LOGICAL_CONSISTENCY = """Eres un auditor de coherencia narrativa. Detecta incoherencias temporales y lógicas en el documento.

DOCUMENTO:
{full_text}

Busca:
1. ORDEN CRONOLÓGICO ERRÓNEO: eventos mencionados en orden inverso a su sucesión real
2. CAUSA-EFECTO INVERTIDO: consecuencias mencionadas antes que sus causas
3. TENSIÓN VERBAL INCONSISTENTE: mezcla de presente/passado para el mismo evento sin razón
4. ESTADO DEL ARTE OBSOLETO: "no existen estudios sobre X" cuando hay citas de años posteriores
5. AFIRMACIONES CONTRADICTORIAS: dice X en una sección y no-X en otra
6. TESIS NO SOSTENIDA POR LOS RESULTADOS: la conclusión afirma algo que los resultados no demostraron

Responde en JSON:
{{
  "temporal_inconsistencies": [...],
  "causal_inversions": [...],
  "tense_inconsistencies": [...],
  "obsolete_claims": [...],
  "contradictions": [
    {{
      "claim_1": {{"location": "pág. 12", "text": "..."}},
      "claim_2": {{"location": "pág. 78", "text": "..."}},
      "conflict": "Una afirma X, la otra niega X"
    }}
  ],
  "unsupported_conclusions": [
    {{
      "conclusion": "...",
      "missing_evidence": "No se encontró en resultados un hallazgo que soporte esta afirmación"
    }}
  ],
  "summary": "..."
}}"""
```

#### Prompt F — Detección de "trampas de IA" en coherencia

```python
PROMPT_AI_COHERENCE_TRAPS = """Eres un detector de IA especializado en COHERENCIA SEMÁNTICA. Los modelos de IA generan texto que suena coherente pero tiene micro-incoherencias que un humano no escribiría.

Analiza el siguiente texto:

{chunk}

Busca estos patrones típicos de IA:
1. AFIRMACIONES VAGAS SIN SUSTENTO: "estudios recientes demuestran..." sin citar cuáles estudios
2. GENERALIZACIONES INJUSTIFICADAS: "la mayoría de los autores coinciden en..." sin evidencia
3. EQUILIBRIO ARTIFICIAL: "por un lado X, por otro lado Y" repetido 3+ veces en la misma sección
4. SÍNTESIS REDUNDANTE: "en otras palabras", "dicho de otra forma", "es decir" — paráfrasis circular del mismo punto
5. EJEMPLOS GENÉRICOS: menciona "diversos autores", "múltiples estudios", "varios investigadores" sin nombres propios
6. DEFINICIONES TIPO DICCIONARIO AL INICIO DE CADA SECCIÓN: "Se define X como..."
7. TRANSICIONES MECÁNICAS: "En primer lugar... En segundo lugar... Por último..." en cada párrafo
8. CONCLUSIÓN DE PÁRRAFO REDUNDANTE: la última oración repite lo que ya se dijo en la primera

Responde en JSON:
{{
  "ai_coherence_traps": [
    {{
      "type": "afirmacion_vaga|generalizacion|equilibrio_artificial|sintesis_redundante|ejemplo_generico|definicion_diccionario|transicion_mecanica|conclusion_redundante",
      "excerpt": "frase exacta",
      "location": "párrafo N",
      "explanation": "por qué es trampa típica de IA",
      "human_alternative": "cómo lo escribiría un humano"
    }}
  ],
  "ai_score": 0.0-1.0,
  "summary": "..."
}}"""
```

### 13.3 Estrategia de chunking para LLM

Los LLMs tienen ventanas de contexto limitadas (Ollama local suele ser 4-8K tokens; Groq/Cerebras 32K; NVIDIA NIM hasta 128K). Para documentos largos (100+ páginas), se debe dividir estratégicamente:

```python
STRATEGIC_CHUNKING = {
    'abstract_resumen': {'max_tokens': 500, 'cross_reference': False},
    'introduccion': {'max_tokens': 2000, 'cross_reference': True},
    'marco_teorico': {'max_tokens': 3000, 'cross_reference': True, 'by_subsection': True},
    'metodologia': {'max_tokens': 1500, 'cross_reference': False},
    'resultados': {'max_tokens': 2000, 'cross_reference': True, 'pair_with': 'metodologia'},
    'discusion': {'max_tokens': 2000, 'cross_reference': True, 'pair_with': 'resultados'},
    'conclusiones': {'max_tokens': 1000, 'cross_reference': True, 'pair_with': 'introduccion'},
    'referencias': {'max_tokens': 5000, 'cross_reference': True, 'pair_with': 'full_body_for_orphan_check'},
}

def chunk_for_llm(text: str, section: str, max_tokens: int = 3000) -> list[str]:
    """Divide texto en chunks respetando límites semánticos."""
    paragraphs = text.split('\n\n')
    chunks = []
    current_chunk = ""
    current_tokens = 0

    for para in paragraphs:
        para_tokens = len(para.split()) * 1.3  # aprox: 1 palabra ~1.3 tokens en español
        if current_tokens + para_tokens > max_tokens and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = para
            current_tokens = para_tokens
        else:
            current_chunk += "\n\n" + para
            current_tokens += para_tokens

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks
```

### 13.4 Estrategia cross-section (comparar secciones)

Algunas incoherencias solo se detectan comparando 2 secciones. Implementar pares estratégicos:

```python
CROSS_SECTION_PAIRS = [
    ('metodologia', 'resultados', PROMPT_METHOD_RESULTS_COHERENCE),
    ('introduccion', 'conclusiones', PROMPT_INTRO_CONCLUSION_ALIGNMENT),
    ('objetivos', 'conclusiones', PROMPT_OBJECTIVES_CONCLUSION_FULFILLMENT),
    ('marco_teorico', 'discusion', PROMPT_THEORY_DISCUSSION_ALIGNMENT),
    ('full_body', 'referencias', PROMPT_CITATION_CONSISTENCY),
]

async def run_cross_section_audit(sections: dict, ai_router) -> list:
    """Ejecuta auditorías cross-section con LLM."""
    findings = []

    for section_a, section_b, prompt_template in CROSS_SECTION_PAIRS:
        if section_a not in sections or section_b not in sections:
            continue

        # Solo si ambas secciones tienen contenido suficiente
        if len(sections[section_a].split()) < 100 or len(sections[section_b].split()) < 100:
            continue

        prompt = prompt_template.format(
            methodology_section=sections[section_a],
            results_section=sections[section_b],
            # ... otros campos según el prompt
        )

        try:
            response = await ai_router.route_completion(
                prompt,
                prefer_local=True,  # Ollama primero (offline, gratis)
                temperature=0.1,    # baja temperatura para análisis riguroso
                max_tokens=2000,
            )
            parsed = parse_llm_json(response)
            findings.extend(convert_to_audit_findings(parsed, section=f"{section_a}↔{section_b}"))
        except Exception as e:
            # Si falla el LLM, no romper todo el flujo
            findings.append({
                'severity': 'low',
                'title': f'Análisis LLM {section_a}↔{section_b} no disponible',
                'description': f'Error: {str(e)}',
                'recommendation': 'Reintentar más tarde o revisar manualmente.'
            })

    return findings
```

### 13.5 Prompt G — Alineación objetivos ↔ conclusiones

Verifica que las conclusiones efectivamente respondan a los objetivos planteados. Muy común: objetivos dicen "analizar X" pero las conclusiones resumen "Y" sin tocar X.

```python
PROMPT_OBJECTIVES_CONCLUSION_FULFILLMENT = """Eres un auditor académico. Verifica si las CONCLUSIONES efectivamente responden a los OBJETIVOS planteados.

OBJETIVOS (general + específicos):
{objectives}

CONCLUSIONES:
{conclusions}

Para cada objetivo (general y específicos):
1. ¿Se aborda en las conclusiones? (sí/no/parcialmente)
2. Si no se aborda, ¿es un objetivo secundario o crítico?
3. Si se aborda parcialmente, ¿qué falta?

También detecta:
- Conclusiones que afirman cosas no planteadas en los objetivos (objetivos fantasma)
- Conclusiones que solo repiten el resumen sin cerrar los objetivos
- Objetivos que piden "evaluar" pero las conclusiones solo "describen"

Responde en JSON:
{{
  "objective_fulfillment": [
    {{
      "objective": "Analizar el proceso X",
      "addressed": "no|parcial|si",
      "where_in_conclusions": "párrafo N o 'no encontrado'",
      "gap": "La conclusión describe X pero no lo analiza como pedía el objetivo"
    }}
  ],
  "phantom_conclusions": [
    "La conclusión menciona Y que no estaba en los objetivos"
  ],
  "fulfillment_score": 0.0-1.0,
  "summary": "X de Y objetivos respondidos en las conclusiones"
}}"""
```

### 13.6 Prompt H — Detección de "párrafos huecos"

Párrafos que parecen decir algo pero no aportan información nueva. Típicos de relleno de IA.

```python
PROMPT_HOLLOW_PARAGRAPHS = """Eres un editor académico. Detecta PÁRRAFOS HUECOS: aquellos que parecen decir algo pero no aportan información nueva, evidencia, ejemplo, cita o dato concreto.

PÁRRAFOS A ANALIZAR:
{paragraphs}

Un párrafo es HUECO si:
- Repite lo dicho en el párrafo anterior con otras palabras
- Hace afirmaciones generales sin ejemplos ("es importante que las empresas innoven")
- Usa frases hechas sin sustento ("como es bien sabido", "tradicionalmente se ha considerado")
- No contiene ninguna cita, número, nombre propio, fecha, o ejemplo específico
- Su eliminación NO afectaría la comprensión del texto

Responde en JSON:
{{
  "hollow_paragraphs": [
    {{
      "paragraph_index": N,
      "excerpt": "primera frase...",
      "reason": "por qué es hueco",
      "suggestion": "agregar ejemplo / citar fuente / eliminar párrafo"
    }}
  ],
  "filler_ratio": 0.0-1.0,
  "summary": "X de Y párrafos son huecos"
}}"""
```

### 13.7 Prompt I — Detección de inconsistencias en escalas y unidades

```python
PROMPT_UNITS_CONSISTENCY = """Eres un auditor técnico. Detecta inconsistencias en escalas y unidades de medida.

DOCUMENTO:
{full_text}

Busca:
1. UNIDADES MEZCLADAS: "10 cm" vs "100 mm" en el mismo contexto sin conversión
2. ESCALAS INCOMPATIBLES: porcentajes que suman más de 100%, probabilidades >1
3. PRECISION INCONSISTENTE: "23.4567 m" vs "20 m" — ¿por qué un valor tan preciso y otro redondo?
4. UNIDADES SIN ESPECIFICAR: "peso de 50" sin decir kg, g, o lb
5. ESCALAS DE MEDIDA MAL REPORTADAS: media 6.2 en escala Likert 1-5 (imposible)
6. NOTACIÓN CIENTÍFICA INCONSISTENTE: "1.5e3" en un lugar, "1500" en otro, sin aclarar

Responde en JSON con lista de inconsistencias y severidad."""
```

### 13.8 Prompt J — Detección de inconsistencias en autores citados

```python
PROMPT_AUTHOR_IDENTITY_CONSISTENCY = """Eres un auditor bibliográfico. Detecta inconsistencias en cómo se cita a un mismo autor a lo largo del documento.

LISTA DE CITAS DETECTADAS (con su ubicación):
{citations_with_location}

Busca:
1. AUTOR CITADO CON INICIAL DIFERENTE: "(García, M., 2024)" vs "(García, J., 2024)" en distinto lugar
2. AUTOR CON APELLIDO COMPUESTO MAL FORMATEADO: "(García López, 2024)" vs "(García, 2024)"
3. "ET AL." MAL USADO: "García et al." cuando es autor único, o "García" cuando son varios
4. ORDEN DE AUTORES CAMBIADO: "(García y López, 2024)" vs "(López y García, 2024)"
5. ABREVIATURA INCONSISTENTE: "Organización Mundial de la Salud" vs "OMS" sin haber introducido el acrónimo

Responde en JSON con cada inconsistencia y sugerencia de corrección."""
```

### 13.9 Integración con tu infraestructura multi-provider

```python
class LLMAuditor:
    """Wrapper que usa tu ai_client.py con failover inteligente."""

    def __init__(self, ai_router):
        self.router = ai_router
        self.cache = {}  # hash → resultado (evita re-análisis de texto idéntico)

    async def audit_chunk(self, text: str, prompt_template: str, section: str) -> dict:
        """Ejecuta un prompt contra el texto, con failover y cache."""
        # 1. Hash para cache
        import hashlib
        text_hash = hashlib.sha256(f"{prompt_template}{text}".encode()).hexdigest()[:16]
        if text_hash in self.cache:
            return {'from_cache': True, **self.cache[text_hash]}

        # 2. Chunking si excede ventana de contexto del modelo
        chunks = chunk_for_llm(text, section, max_tokens=self._get_max_tokens())
        if len(chunks) > 1:
            return await self._audit_multi_chunk(chunks, prompt_template, section)

        # 3. Ejecutar con failover: Ollama → Groq → Cerebras → NVIDIA NIM
        prompt = prompt_template.format(chunk=text, body_text=text, full_text=text)
        try:
            response = await self.router.route_completion(
                prompt,
                prefer_local=True,
                temperature=0.1,
                max_tokens=2000,
                response_format='json',  # si el modelo lo soporta
            )
            parsed = self._parse_json_response(response)
            self.cache[text_hash] = parsed
            return parsed
        except Exception as e:
            return {'error': str(e), 'findings': []}

    def _get_max_tokens(self) -> int:
        """Max tokens según el provider activo."""
        provider = self.router.get_active_provider()
        return {
            'ollama': 4000,      # Llama 3.1 8B local
            'groq': 6000,        # Llama 3.1 70B
            'cerebras': 8000,    # Llama 3.1 70B rápido
            'nvidia_nim': 16000, # Llama 3.1 70B
        }.get(provider, 4000)

    async def _audit_multi_chunk(self, chunks: list, prompt_template: str, section: str) -> dict:
        """Si el texto excede el contexto, analiza cada chunk y fusiona."""
        results = []
        for chunk in chunks:
            result = await self.audit_chunk(chunk, prompt_template, section)
            if 'error' not in result:
                results.append(result)

        # Fusionar listas de hallazgos
        return self._merge_results(results, section)
```

### 13.10 Estrategia de costo/beneficio por provider

No todos los prompts necesitan el modelo más potente. Asignar según complejidad:

| Prompt | Provider recomendado | Razón |
|---|---|---|
| A — Numérico | Ollama local | Razonamiento simple, no requiere contexto enorme |
| B — Citas | Ollama local | Pattern matching, local es suficiente |
| C — Método↔Resultados | Groq/Cerebras | Requiere comparar 2 secciones largas, 32K contexto |
| D — Terminológico | NVIDIA NIM | Requiere contexto completo del documento |
| E — Cronológico/lógico | NVIDIA NIM | Requiere razonamiento causal profundo |
| F — Trampas IA | Groq | Llama 3.1 70B es excelente detectando su propio output |
| G — Objetivos↔Conclusiones | Cualquiera | Texto corto, cualquier provider funciona |
| H — Párrafos huecos | Ollama local | Análisis párrafo a párrafo, no necesita contexto global |
| I — Unidades | Ollama local | Pattern matching simple |
| J — Autores | Ollama local | Pattern matching simple |

```python
PROMPT_PROVIDER_MAPPING = {
    'numerical': 'ollama',
    'citations': 'ollama',
    'method_results': 'groq',     # o cerebras
    'terminological': 'nvidia_nim',
    'temporal_logical': 'nvidia_nim',
    'ai_coherence_traps': 'groq',
    'objectives_conclusions': 'auto',  # cualquiera
    'hollow_paragraphs': 'ollama',
    'units': 'ollama',
    'author_identity': 'ollama',
}
```

### 13.11 Falsos positivos específicos de los LLMs

Los LLMs también se equivocan. Mitigaciones:

#### 13.11.1 Alucinación de inconsistencias

El LLM puede afirmar "esta cifra es incorrecta" cuando en realidad es correcta. **Mitigación**: cuando el LLM reporta una inconsistencia numérica, ejecutar una validación local (Python) que confirme antes de mostrar al usuario.

```python
def verify_llm_numerical_claim(claim: dict, original_text: str) -> dict:
    """Confirma con Python que la inconsistencia detectada por el LLM es real."""
    if claim['type'] == 'suma':
        # Extraer números del excerpt y verificar
        numbers = re.findall(r'\d+', claim['excerpt'])
        if len(numbers) >= 2:
            reported_total = int(numbers[-1])
            actual_sum = sum(int(n) for n in numbers[:-1])
            if reported_total == actual_sum:
                return {'verified': False, 'reason': 'LLM se equivocó, la suma sí cuadra'}
    return {'verified': True}
```

#### 13.11.2 Sensibilidad al chunking

El LLM puede perder contexto si se divide mal. **Mitigación**: para prompts cross-section (C, G), enviar siempre las dos secciones juntas en el mismo prompt, no procesarlas por separado.

#### 13.11.3 Latencia y timeout

Documentos largos con 10+ chunks por prompt pueden tardar minutos. **Mitigación**: paralelizar los prompts independientes (A, B, H, I, J) y secuenciar los dependientes (C, G, E).

```python
async def run_all_llm_audits(document: Document) -> dict:
    """Pipeline paralelo para optimizar latencia."""
    independent_prompts = ['numerical', 'citations', 'hollow_paragraphs', 'units', 'author_identity']
    dependent_prompts = ['method_results', 'objectives_conclusions', 'temporal_logical', 'terminological', 'ai_coherence_traps']

    # Fase 1: prompts independientes en paralelo
    independent_tasks = [
        llm_auditor.audit_chunk(document.text, PROMPT_TEMPLATES[p], p)
        for p in independent_prompts
    ]
    independent_results = await asyncio.gather(*independent_tasks, return_exceptions=True)

    # Fase 2: prompts dependientes (cross-section) en paralelo entre sí
    dependent_tasks = [
        cross_section_audit(sections, p)
        for p in dependent_prompts
    ]
    dependent_results = await asyncio.gather(*dependent_tasks, return_exceptions=True)

    return merge_all_results(independent_results, dependent_results)
```

---

## Apéndice A: Checklist de implementación rápida

Para integrar este mega-set en tu `proactive_auditor.py` existente:

- [ ] **Semana 1**: Implementar `burstiness_score()`, `perplexity_proxy()`, `data_density()`, `citation_density()`. Son puros Python, sin dependencias externas.
- [ ] **Semana 1**: Crear el catálogo de frases IA (`IA_SECTION_CLOSERS`, vocabulario "IA-típico") como módulo JSON.
- [ ] **Semana 2**: Implementar `BLOOM_VERBS` y `audit_objective()`. Integrar con `pre_classifier.py` para validación de objetivos.
- [ ] **Semana 2**: Implementar `audit_objectives_hierarchy()` (Sección 12) — detecta específicos que superan al general, sin progresión, o sin cobertura del nivel del general. Casos de prueba en §12.5.
- [ ] **Semana 2**: Implementar `false_positive_check()` con la matriz de atenuación.
- [ ] **Semana 3**: Pipeline multi-capa (heurística → LLM si ambiguo). Reutilizar tu `ai_client.py` con failover Ollama → Groq → NVIDIA NIM.
- [ ] **Semana 3**: Implementar los 10 prompts LLM de la Sección 13 (A-J) con `LLMAuditor` class y `PROMPT_PROVIDER_MAPPING` para asignar cada prompt al provider óptimo por costo/beneficio.
- [ ] **Semana 3**: Implementar `run_cross_section_audit()` para los 5 pares estratégicos (método↔resultados, intro↔conclusiones, objetivos↔conclusiones, marco↔discusión, body↔referencias).
- [ ] **Semana 3**: Implementar `verify_llm_numerical_claim()` — validación local Python que confirma inconsistencias numéricas reportadas por el LLM antes de mostrarlas al usuario (mitiga alucinaciones).
- [ ] **Semana 3**: Integrar `FullAuditReport` con tu `useDocStore.ts` (Zustand).
- [ ] **Semana 4**: UI: reemplazar toasts por ActivityPanel, mostrar NarrativeScore en vez de donut dual, SeverityGroups en Referencias.
- [ ] **Semana 4**: Testing con 50+ documentos humanos (estudiantes reales) + 50+ documentos IA para calibrar umbrales.
- [ ] **Semana 4**: Calibración cruzada: comparar los 10 prompts LLM contra los mismos 50+ documentos para medir precisión/recall de cada prompt y ajustar `PROMPT_PROVIDER_MAPPING` si algún prompt rinde mejor en otro provider.

---

## Apéndice B: Glosario

- **Burstiness**: variación en longitud/estructura de oraciones. Alto = humano, bajo = IA.
- **Perplejidad (perplexity)**: medida de cuán "sorpresa" es el texto para un modelo de lenguaje. IA produce baja perplejidad (texto "esperado").
- **TTR (Type-Token Ratio)**: palabras únicas / total de palabras. Bajo = repetición (IA).
- **STTR (Standardized TTR)**: TTR corregido por longitud, comparable entre documentos.
- **Coeficiente de Variación (CV)**: desviación estándar / media. Bajo = homogeneidad sospechosa.
- **Passive Voice Ratio**: % de oraciones en voz pasiva. Alto = calco del inglés = IA probable.
- **NarrativeScore**: reemplazo de KPIs numéricos duales por una frase accionable con siguiente paso.
- **SeverityGroup**: agrupación automática de hallazgos por severidad (Critical/High/Medium/Low/OK).
- **CompactCard**: card de 1 línea con chip de severidad + frase resumen + meta + "Revisar".
- **AnchorLine**: conector visual entre marca en el texto y card en panel lateral.
- **ActivityPanel**: panel fijo que reemplaza toasts flotantes, con historial scrollable.
- **Jerarquía Bloom general↔específicos**: regla pedagógica que prohíbe que un objetivo específico tenga nivel cognitivo Bloom superior al general. Los específicos descomponen el general, no lo superan.
- **Cobertura de objetivos**: verificación de que al menos un objetivo específico alcanza el nivel Bloom del general.
- **Progresión cognitiva**: orden ascendente de niveles Bloom entre objetivos específicos (Recordar → Aplicar → Analizar → Evaluar). Plano o descendente = sospechoso.
- **Cross-section audit**: análisis LLM que compara dos secciones del documento (método↔resultados, objetivos↔conclusiones) para detectar incoherencias que no son visibles sección por sección.
- **Párrafo hueco**: párrafo que parece decir algo pero no aporta información nueva, evidencia, ejemplo, cita o dato concreto. Típico de relleno de IA.
- **Trampa de coherencia IA**: micro-incoherencias que la IA produce y un humano no escribiría (afirmaciones vagas sin sustento, equilibrio artificial, ejemplos genéricos, transiciones mecánicas, conclusiones redundantes).
- **Verify-before-show**: patrón anti-alucinación donde las afirmaciones del LLM se validan localmente con Python antes de mostrarse al usuario.
- **PROMPT_PROVIDER_MAPPING**: tabla que asigna cada prompt LLM al provider óptimo por costo/beneficio (Ollama para pattern matching, Groq para coherencia IA, NVIDIA NIM para razonamiento causal profundo).
- **Strategic chunking**: división de texto en chunks respetando límites semánticos por sección, con configuración específica de max_tokens según la ventana de contexto del provider activo.

---

*Documento generado para WordAPA7 · v1.0 · paleta oficial `#4F7CFF` · MIT License compatible.*
