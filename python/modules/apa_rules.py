"""Fuente ?NICA de reglas APA 7 para todos los motores.
Consumida por: inplace_editor (export), scoped_apply y el add-in (format-plan).
Cambiar aqu? = cambia en todas partes."""
RULES = {
    "font": "Times New Roman",
    "size": 12,
    "line_spacing": 2.0,
    "first_line_indent_in": 0.5,
    "hanging_indent_in": 0.5,
    "headings": {
        "h1": {"align": "center", "bold": True, "italic": False, "size": 12},
        "h2": {"align": "left", "bold": True, "italic": False, "size": 12},
        "h3": {"align": "left", "bold": True, "italic": True, "size": 12},
    },
    "table_borders": {"top": True, "bottom": True, "header_row_bold": True},
}
