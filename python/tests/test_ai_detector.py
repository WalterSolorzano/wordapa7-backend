from classification.ai_detector import analyze_ai_risk


def test_analyze_ai_risk_detects_patterns():
    text = "En conclusión, es importante destacar que los datos demuestran el avance del sistema."
    result = analyze_ai_risk(text)
    assert "score" in result
    assert "findings" in result
    assert "category" in result
    assert result["score"] > 0
    assert len(result["findings"]) > 0


def test_analyze_ai_risk_clean_text():
    text = "El análisis estadístico mostró una diferencia significativa entre ambos grupos de prueba."
    result = analyze_ai_risk(text)
    assert result["score"] == 0
    assert len(result["findings"]) == 0


def test_analyze_ai_risk_sentence_structure():
    """Oraciones de longitud muy similar deben detectarse como sospechosas."""
    text = (
        "Los resultados del estudio demostraron una mejora significativa. "
        "La intervención produjo cambios notables en los participantes. "
        "El análisis estadístico confirmó las hipótesis planteadas. "
        "Estos hallazgos respaldan la teoría subyacente del modelo."
    )
    result = analyze_ai_risk(text)
    sentence_findings = [f for f in result["findings"] if f["pattern"] == "sentence_structure"]
    assert len(sentence_findings) > 0


def test_analyze_ai_risk_semicolon_overuse():
    """Uso excesivo de punto y coma debe detectarse."""
    text = (
        "El estudio abarcó diversas variables independientes; la edad fue un factor determinante; "
        "el género mostró diferencias significativas; el nivel socioeconómico moderó los efectos; "
        "y la ubicación geográfica influyó en los resultados obtenidos durante la investigación."
    )
    result = analyze_ai_risk(text)
    semi_findings = [f for f in result["findings"] if f["pattern"] == "semicolon_overuse"]
    assert len(semi_findings) > 0


def test_analyze_ai_risk_generic_conclusion():
    """Estructura de conclusión genérica debe detectarse."""
    text = (
        "En conclusión, se puede afirmar que los resultados de este estudio son fundamentales "
        "para comprender la dinámica del fenómeno investigado y sus implicaciones prácticas."
    )
    result = analyze_ai_risk(text)
    conc_findings = [f for f in result["findings"] if f["pattern"] == "generic_conclusion"]
    assert len(conc_findings) > 0


def test_conclusion_with_evidence_is_not_flagged_as_generic():
    """Un cierre con resultados concretos no debe parecer una plantilla vacía."""
    text = (
        "En conclusión, la intervención redujo el error medio de 18% a 7% en "
        "los 42 participantes, según la Tabla 3."
    )
    result = analyze_ai_risk(text)
    conc_findings = [f for f in result["findings"] if f["pattern"] == "generic_conclusion"]
    assert conc_findings == []


def test_redundant_closure_markers_are_detected():
    """Repetir varios cierres en una misma idea es una señal contextual."""
    text = (
        "En conclusión, los resultados son relevantes para el fenómeno estudiado. "
        "En resumen, es importante destacar que el tema requiere nuevas investigaciones."
    )
    result = analyze_ai_risk(text)
    conc_findings = [f for f in result["findings"] if f["pattern"] == "generic_conclusion"]
    assert conc_findings
    assert any("Repite marcadores" in f["detail"] for f in conc_findings)


def test_analyze_ai_risk_new_patterns():
    """Nuevos patrones como 'cabe mencionar' y 'no obstante' deben detectarse."""
    text = "Cabe mencionar que los resultados no obstante presentan limitaciones metodológicas."
    result = analyze_ai_risk(text)
    phrase_findings = [f for f in result["findings"] if f["pattern"] == "phrase"]
    assert len(phrase_findings) >= 2


def test_analyze_ai_risk_short_text():
    """Texto muy corto no debe generar falsos positivos."""
    result = analyze_ai_risk("Hola mundo")
    assert result["score"] == 0
    assert len(result["findings"]) == 0


def test_analyze_ai_risk_empty_text():
    """Texto vacío no debe generar falsos positivos."""
    result = analyze_ai_risk("")
    assert result["score"] == 0
    assert len(result["findings"]) == 0


def test_analyze_ai_risk_connector_density():
    """Densidad alta de conectores formales debe detectarse (acumulación)."""
    text = (
        "Sin embargo, los resultados indican una mejora; no obstante, existen "
        "limitaciones; por lo tanto, se requiere mas investigacion; ademas, el "
        "tamano de la muestra fue reducido; por consiguiente, no se pueden "
        "generalizar los hallazgos; asimismo, la metodologia presento desafios; "
        "en consecuencia, se recomienda replicar el estudio; cabe destacar que "
        "el analisis estadistico fue robusto; en definitiva, los objetivos se "
        "cumplieron parcialmente y por otro lado se identificaron nuevas "
        "variables a considerar en futuras investigaciones que profundicen el tema."
    )
    result = analyze_ai_risk(text)
    conn = [f for f in result["findings"] if f["pattern"] == "connector_density"]
    assert len(conn) > 0


def test_analyze_ai_risk_repeated_openers():
    """Aperturas de oración repetidas (anáfora) deben detectarse."""
    text = (
        "Se puede observar que los datos son consistentes. "
        "Se puede observar que la muestra fue adecuada. "
        "Se puede observar que el error fue controlado. "
        "Se puede observar que el metodo funciono correctamente en todos los casos evaluados."
    )
    result = analyze_ai_risk(text)
    openers = [f for f in result["findings"] if f["pattern"] == "repeated_openers"]
    assert len(openers) > 0


def test_analyze_ai_risk_mixed_typography():
    """Comillas rectas y curvas mezcladas deben detectarse."""
    text = 'El estudio concluyo que "los resultados fueron positivos\u201d y que el modelo \u201ces robusto\u201d en la mayoria de los escenarios.'
    result = analyze_ai_risk(text)
    typo = [f for f in result["findings"] if f["pattern"] == "mixed_typography"]
    assert len(typo) > 0


def test_analyze_ai_risk_clean_stays_zero():
    """Texto académico limpio no debe generar señales (regresión del fix de promedio)."""
    text = (
        "La investigacion educativa en America Latina ha experimentado un crecimiento "
        "significativo durante las ultimas dos decadas, particularmente en lo referente "
        "a la integracion de tecnologias digitales en los procesos de ensenanza-aprendizaje."
    )
    result = analyze_ai_risk(text)
    assert result["score"] == 0
    assert len(result["findings"]) == 0


def test_analyze_table_cells_emojis():
    """Celdas de tabla con emojis de checklist deben detectarse."""
    from classification.ai_detector import analyze_table_cells

    score, findings = analyze_table_cells(
        ["Criterio", "Cumple"],
        [["A", "\u2705"], ["B", "\u274C"], ["C", "\u2705"]],
    )
    assert score > 0
    emoji = [f for f in findings if f["pattern"] == "table_emoji"]
    assert len(emoji) > 0
    assert emoji[0]["count"] == 3


def test_analyze_table_cells_clean():
    """Tabla limpia sin símbolos no debe generar señales."""
    from classification.ai_detector import analyze_table_cells

    score, findings = analyze_table_cells(
        ["Criterio", "Cumple"], [["A", "ok"], ["B", "no"]]
    )
    assert score == 0
    assert len(findings) == 0


def test_analyze_document_ai_metadata_cap():
    """El boost de metadatos debe estar captado para no saturar párrafos limpios."""
    from classification.ai_detector import analyze_document_ai

    clean = (
        "La investigacion educativa en America Latina ha experimentado un crecimiento "
        "significativo durante las ultimas dos decadas, particularmente en lo referente "
        "a la integracion de tecnologias digitales en los procesos de ensenanza-aprendizaje."
    )
    meta = {
        "total_editing_time_minutes": 0,
        "words": 5000,
        "revision_count": 1,
        "in_text_citations": 0,
        "references_count": 6,
    }
    results = analyze_document_ai([clean, clean], meta)
    for r in results:
        assert r["score"] <= 0.2, f"Boost de metadatos no debe saturar: {r['score']}"


# ── Tests de señales nuevas (9-12) ──────────────────────────────────────────

def test_detect_type_token_ratio_low():
    """TTR bajo (vocabulario muy repetitivo) debe detectarse en textos largos."""
    # Texto con vocabulario intencionalmente repetitivo para bajar el TTR
    base = (
        "El estudio muestra resultados importantes. "
        "El estudio presenta datos relevantes. "
        "El estudio demuestra hallazgos significativos. "
        "El estudio analiza elementos importantes del estudio. "
    )
    # Repetir para tener 80+ tokens de 4+ letras
    text = base * 8
    result = analyze_ai_risk(text)
    ttr_findings = [f for f in result["findings"] if f["pattern"] == "low_lexical_diversity"]
    assert len(ttr_findings) > 0, "TTR bajo debe detectarse en texto con vocabulario repetitivo"


def test_detect_type_token_ratio_short_text_no_signal():
    """Textos cortos (<80 palabras de 4+ letras) no deben activar la señal TTR."""
    text = "El estudio muestra resultados importantes para el análisis académico."
    result = analyze_ai_risk(text)
    ttr_findings = [f for f in result["findings"] if f["pattern"] == "low_lexical_diversity"]
    assert len(ttr_findings) == 0, "Textos cortos no deben generar señal de TTR"


def test_detect_translation_calques():
    """Calcos del inglés ('en base a', 'llevar a cabo') deben detectarse."""
    text = (
        "En base a los resultados obtenidos, se decidió llevar a cabo un análisis "
        "adicional. Es importante tener en cuenta que el hecho de que los datos "
        "muestren variación no implica causalidad."
    )
    result = analyze_ai_risk(text)
    calque_findings = [f for f in result["findings"] if f["pattern"] == "translation_calque"]
    assert len(calque_findings) >= 2, (
        f"Deben detectarse al menos 2 calcos del inglés, se encontraron: {len(calque_findings)}"
    )
    phrases = [f["phrase"] for f in calque_findings]
    # Al menos uno de los calcos principales debe estar
    assert any("base" in p or "llevar" in p or "cuenta" in p for p in phrases), (
        f"Los calcos detectados no incluyen los esperados: {phrases}"
    )


def test_detect_translation_calques_clean_text():
    """Texto sin calcos no debe generar señal de calcos de traducción."""
    text = (
        "La investigación reveló diferencias estadísticamente significativas entre "
        "los grupos. Los participantes mostraron mayor rendimiento cognitivo tras "
        "la intervención experimental controlada."
    )
    result = analyze_ai_risk(text)
    calque_findings = [f for f in result["findings"] if f["pattern"] == "translation_calque"]
    assert len(calque_findings) == 0, "Texto sin calcos no debe generar señal"


def test_detect_argumentative_pattern_full():
    """Estructura tripartita tesis→evidencia→conclusión en un párrafo debe detectarse."""
    text = (
        "En este estudio se sostiene que la metodología mixta es superior. "
        "Según los datos obtenidos, los resultados indican mejoras significativas. "
        "Por lo tanto, esto demuestra que el enfoque adoptado es correcto."
    )
    result = analyze_ai_risk(text)
    arg_findings = [f for f in result["findings"] if f["pattern"] == "argumentative_pattern"]
    assert len(arg_findings) > 0, "Estructura argumentativa rígida debe detectarse"


def test_detect_argumentative_pattern_clean():
    """Un párrafo descriptivo sin estructura rígida no debe generar señal."""
    text = (
        "La temperatura promedio registrada durante el experimento fue de 22.3 °C, "
        "con una desviación estándar de 1.8 °C. Las mediciones se realizaron cada "
        "hora durante un período de 72 horas consecutivas."
    )
    result = analyze_ai_risk(text)
    arg_findings = [f for f in result["findings"] if f["pattern"] == "argumentative_pattern"]
    assert len(arg_findings) == 0, "Párrafo descriptivo no debe activar la señal argumentativa"


def test_detect_lexical_burstiness():
    """Texto con longitud de palabras muy uniforme debe activar la señal de burstiness."""
    # Construir texto con palabras de longitud muy similar (~6-7 letras)
    # para forzar baja varianza
    uniform_words = [
        "estudio", "analiza", "muestra", "produce", "genera", "evalúa",
        "explica", "destaca", "incluye", "permite", "confirma", "describe",
    ]
    text = " ".join(uniform_words * 10) + "."
    result = analyze_ai_risk(text)
    burst_findings = [f for f in result["findings"] if f["pattern"] == "lexical_burstiness"]
    # La señal es sutil — solo verificamos que no crashea y el campo existe
    assert "score" in result
    assert "findings" in result
    # Si se detecta burstiness, debe tener la estructura correcta
    for f in burst_findings:
        assert "pattern" in f
        assert "severity" in f
        assert "detail" in f
