"""embed_payload: el payload embebido no puede salir vacio en silencio.

Si el .env del build no tiene ninguna clave, el instalador viajaria mudo: la IA
no tendria con que hablarle a ningun proveedor y nadie se enteraria hasta que un
usuario reporte que "no funciona la IA". Ese caso tiene que abortar el build.
"""

import embed_payload


def test_payload_vacio_aborta():
    try:
        embed_payload.build_payload({}, allow_empty=False)
    except SystemExit:
        return
    raise AssertionError("un payload vacio debe abortar con SystemExit")


def test_payload_con_una_clave_pasa():
    payload = embed_payload.build_payload(
        {"GROQ_API_KEY": "gsk_x"}, allow_empty=False
    )
    assert payload  # al menos una entrada ofuscada


def test_allow_empty_permite_vacio():
    assert embed_payload.build_payload({}, allow_empty=True) == {}
