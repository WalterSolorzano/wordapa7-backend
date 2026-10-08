import persistence.ai_keys as ai_keys


PROVEEDORES_NUEVOS = {
    "modelscope": ["MODELSCOPE_API_KEY", "MODELSCOPE_MODEL"],
    "sambanova": ["SAMBANOVA_API_KEY", "SAMBANOVA_MODEL"],
    "dashscope": ["DASHSCOPE_API_KEY", "DASHSCOPE_MODEL"],
    "agnes_ai": ["AGNES_AI_API_KEY", "AGNES_AI_MODEL"],
}


def test_catalogo_incluye_los_cuatro_proveedores_nuevos():
    for pid, (var_clave, var_modelo) in PROVEEDORES_NUEVOS.items():
        assert pid in ai_keys.VARIABLES_DE_CLAVE_POR_ID, f"falta id {pid}"
        assert var_clave in ai_keys.VARIABLES_DE_CLAVE, f"falta {var_clave}"
        assert var_modelo in ai_keys.VARIABLES_DE_MODELO, f"falta {var_modelo}"
        assert var_clave in ai_keys.VARIABLES_DE_CLAVE_POR_ID[pid]


def test_catalogo_tiene_dieciniueve_variables_de_clave():
    # 14 originales + 4 nuevas. (Cloudflare aporta dos, ya contadas en las 14.)
    # El contrato exacto lo fija el numero: si cambia, este test obliga a actualizarlo.
    assert len(ai_keys.VARIABLES_DE_CLAVE) == 18, (
        f"VARIABLES_DE_CLAVE debe tener 18, tiene {len(ai_keys.VARIABLES_DE_CLAVE)}: "
        f"{ai_keys.VARIABLES_DE_CLAVE}"
    )


def test_provider_env_vars_es_la_union_sin_duplicados():
    assert ai_keys.PROVIDER_ENV_VARS == (
        ai_keys.VARIABLES_DE_CLAVE + ai_keys.VARIABLES_DE_MODELO
    )


def test_proveedor_nuevo_entra_a_la_cola_con_clave(monkeypatch):
    import classification.llm_classifier as lc
    monkeypatch.setenv("MODELSCOPE_API_KEY", "ms-fake")
    proveedores = lc._get_active_providers(None, None, False, None)
    ids = [p["id"] for p in proveedores]
    assert "modelscope" in ids
    ms = next(p for p in proveedores if p["id"] == "modelscope")
    assert ms["model"]  # cae al default si no hay MODELSCOPE_MODEL
