#!/usr/bin/env python3
"""
WordAPA7 - Generador de iconos PNG para el Ribbon de Word
==========================================================

Genera iconos profesionales y distintos para cada boton del ribbon.
Cada icono tiene un fondo de color con esquinas redondeadas y un
simbolo blanco dibujado encima.

Tamanos: 16x16, 32x32, 80x80 pixeles (requeridos por Office).
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw

# -- Configuracion -----------------------------------------------------------

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "ribbon"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Paleta de colores (indigo principal, tonos distintos por funcion)
COLORS = {
    "panel":        "#4F46E5",  # indigo
    "audit":        "#DC2626",  # red
    "table":        "#0891B2",  # cyan
    "figure":       "#DB2777",  # pink
    "heading":      "#7C3AED",  # violet
    "citation":     "#EA580C",  # orange
    "bibliography": "#16A34A",  # green
    "cover":        "#2563EB",  # blue
    "ai":           "#9333EA",  # purple
    "refresh":      "#0D9488",  # teal
}

SIZES = [16, 32, 80]

# Radio de esquinas redondeadas (porcentaje del tamano)
CORNER_RADIUS_PCT = 0.22

WHITE = (255, 255, 255, 255)


def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rounded_rect_mask(size: int, radius: int) -> Image.Image:
    """Crea una mascara con un rectangulo de esquinas redondeadas."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=255,
    )
    return mask


def make_icon(name: str, color_hex: str, draw_symbol, size: int) -> Image.Image:
    """
    Crea un icono: fondo de color redondeado + simbolo blanco.

    draw_symbol recibe (draw, s) donde s = tamano del canvas.
    Debe dibujar el simbolo blanco en el centro.
    """
    color = hex_to_rgb(color_hex)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    radius = max(2, int(size * CORNER_RADIUS_PCT))

    # Fondo redondeado
    bg = Image.new("RGBA", (size, size), color + (255,))
    mask = rounded_rect_mask(size, radius)
    img.paste(bg, (0, 0), mask)

    # Simbolo blanco
    draw = ImageDraw.Draw(img)
    draw_symbol(draw, size)

    return img


# -- Funciones de dibujo de simbolos ------------------------------------------
# Cada funcion recibe (draw: ImageDraw, s: int) donde s = tamano del canvas.
# Coordenadas en escala 0..1 multiplicadas por s.

def sym_panel(draw, s):
    """Panel lateral con lineas."""
    m = s * 0.2
    lw = max(1, s // 16)
    # Marco exterior
    draw.rounded_rectangle([(m, m), (s - m, s - m)], radius=s * 0.08,
                           outline=WHITE, width=lw)
    # Linea vertical izquierda (separador del panel)
    xm = s * 0.38
    draw.line([(xm, m + lw), (xm, s - m - lw)], fill=WHITE, width=lw)
    # Lineas horizontales (contenido)
    for i, y_pct in enumerate([0.35, 0.50, 0.65]):
        y = s * y_pct
        x_start = xm + s * 0.06
        x_end = s - m - s * 0.05 if i == 0 else s * 0.72
        draw.line([(x_start, y), (x_end, y)], fill=WHITE, width=lw)


def sym_audit(draw, s):
    """Lupa con checkmark."""
    lw = max(1, s // 14)
    cx, cy, r = s * 0.42, s * 0.42, s * 0.22
    # Circulo de la lupa
    draw.ellipse(
        [(cx - r, cy - r), (cx + r, cy + r)],
        outline=WHITE, width=lw,
    )
    # Mango de la lupa
    bx, by = cx + r * 0.7, cy + r * 0.7
    draw.line(
        [(bx, by), (s * 0.82, s * 0.82)],
        fill=WHITE, width=lw + 1,
    )
    # Checkmark dentro del circulo
    draw.line(
        [(cx - r * 0.4, cy), (cx - r * 0.1, cy + r * 0.35)],
        fill=WHITE, width=lw,
    )
    draw.line(
        [(cx - r * 0.1, cy + r * 0.35), (cx + r * 0.45, cy - r * 0.3)],
        fill=WHITE, width=lw,
    )


def sym_table(draw, s):
    """Cuadricula de tabla."""
    m = s * 0.18
    lw = max(1, s // 16)
    w = s - 2 * m
    # Marco
    draw.rectangle([(m, m), (s - m, s - m)], outline=WHITE, width=lw)
    # Linea horizontal (encabezado)
    yh = m + w * 0.35
    draw.line([(m, yh), (s - m, yh)], fill=WHITE, width=lw)
    # Lineas verticales
    xv1 = m + w * 0.33
    xv2 = m + w * 0.66
    draw.line([(xv1, m), (xv1, s - m)], fill=WHITE, width=lw)
    draw.line([(xv2, m), (xv2, s - m)], fill=WHITE, width=lw)
    # Linea horizontal media
    ym = m + w * 0.68
    draw.line([(m, ym), (s - m, ym)], fill=WHITE, width=lw)


def sym_figure(draw, s):
    """Cuadro de imagen con montana + sol."""
    m = s * 0.18
    lw = max(1, s // 16)
    # Marco
    draw.rounded_rectangle([(m, m), (s - m, s - m)], radius=s * 0.06,
                           outline=WHITE, width=lw)
    # Sol (circulo pequeno)
    sx, sy, sr = s * 0.35, s * 0.38, s * 0.06
    draw.ellipse([(sx - sr, sy - sr), (sx + sr, sy + sr)], fill=WHITE)
    # Montanas
    pts = [
        (m + lw, s - m - lw),
        (s * 0.38, s * 0.58),
        (s * 0.55, s * 0.72),
        (s * 0.72, s * 0.52),
        (s - m - lw, s - m - lw),
    ]
    draw.line(pts + [pts[0]], fill=WHITE, width=lw, joint="curve")


def sym_heading(draw, s):
    """Texto con lineas (estilo encabezado)."""
    m = s * 0.18
    lw = max(1, s // 16)
    # Linea gruesa (titulo)
    draw.line([(m, m + s * 0.12), (s * 0.72, m + s * 0.12)],
              fill=WHITE, width=lw + 1)
    # Lineas finas (cuerpo)
    for i, y_pct in enumerate([0.35, 0.50, 0.65, 0.80]):
        y = s * y_pct
        x_end = s * 0.82 if i % 2 == 0 else s * 0.65
        draw.line([(m, y), (x_end, y)], fill=WHITE, width=lw)


def sym_citation(draw, s):
    """Comillas tipograficas."""
    m = s * 0.2
    w = s * 0.25
    h = s * 0.30
    # Comilla izquierda
    draw.rounded_rectangle(
        [(m, s * 0.55), (m + w, s * 0.55 + h)],
        radius=s * 0.04, fill=WHITE,
    )
    draw.polygon(
        [(m + w * 0.5, s * 0.55), (m + w, s * 0.42), (m + w * 0.8, s * 0.55)],
        fill=WHITE,
    )
    # Comilla derecha
    rx = s - m - w
    draw.rounded_rectangle(
        [(rx, s * 0.55), (rx + w, s * 0.55 + h)],
        radius=s * 0.04, fill=WHITE,
    )
    draw.polygon(
        [(rx + w * 0.5, s * 0.55), (rx + w, s * 0.42), (rx + w * 0.8, s * 0.55)],
        fill=WHITE,
    )


def sym_bibliography(draw, s):
    """Libro abierto."""
    lw = max(1, s // 16)
    cx = s * 0.5
    m = s * 0.15
    top = s * 0.28
    bot = s * 0.78
    # Pagina izquierda
    draw.polygon(
        [(m, top + s * 0.05), (cx - s * 0.02, top), (cx - s * 0.02, bot),
         (m, bot - s * 0.02)],
        outline=WHITE, width=lw, fill=None,
    )
    # Pagina derecha
    draw.polygon(
        [(s - m, top + s * 0.05), (cx + s * 0.02, top), (cx + s * 0.02, bot),
         (s - m, bot - s * 0.02)],
        outline=WHITE, width=lw, fill=None,
    )
    # Lineas de texto en pagina izquierda
    for y_pct in [0.45, 0.55, 0.65]:
        y = s * y_pct
        draw.line([(m + s * 0.06, y), (cx - s * 0.08, y)],
                  fill=WHITE, width=lw)
    # Lineas de texto en pagina derecha
    for y_pct in [0.45, 0.55, 0.65]:
        y = s * y_pct
        draw.line([(cx + s * 0.08, y), (s - m - s * 0.06, y)],
                  fill=WHITE, width=lw)


def sym_cover(draw, s):
    """Documento/pagina con lineas."""
    m = s * 0.2
    lw = max(1, s // 16)
    # Marco del documento
    draw.rounded_rectangle([(m, m), (s - m, s - m)], radius=s * 0.06,
                           outline=WHITE, width=lw)
    # Lineas de contenido
    for i, y_pct in enumerate([0.35, 0.48, 0.61, 0.74]):
        y = s * y_pct
        x_end = s * 0.75 if i % 2 == 0 else s * 0.60
        draw.line([(m + s * 0.08, y), (x_end, y)],
                  fill=WHITE, width=lw)


def sym_ai(draw, s):
    """Estrellas/chispas (AI)."""
    # Estrella grande
    draw_sparkle(draw, s * 0.5, s * 0.42, s * 0.20)
    # Estrella pequena arriba-derecha
    draw_sparkle(draw, s * 0.78, s * 0.28, s * 0.10)
    # Estrella pequena abajo-izquierda
    draw_sparkle(draw, s * 0.25, s * 0.72, s * 0.08)


def draw_sparkle(draw, cx, cy, r):
    """Dibuja una estrella de 4 puntas."""
    pts = [
        (cx, cy - r),
        (cx + r * 0.3, cy - r * 0.3),
        (cx + r, cy),
        (cx + r * 0.3, cy + r * 0.3),
        (cx, cy + r),
        (cx - r * 0.3, cy + r * 0.3),
        (cx - r, cy),
        (cx - r * 0.3, cy - r * 0.3),
    ]
    draw.polygon(pts, fill=WHITE)


def sym_refresh(draw, s):
    """Flechas circulares (actualizar)."""
    lw = max(1, s // 14)
    cx, cy = s * 0.5, s * 0.5
    r = s * 0.28
    # Arco
    bbox = [(cx - r, cy - r), (cx + r, cy + r)]
    draw.arc(bbox, start=30, end=300, fill=WHITE, width=lw)
    # Flecha en el extremo (arriba-derecha)
    ax = cx + r * math.cos(math.radians(30))
    ay = cy - r * math.sin(math.radians(30))
    draw.polygon(
        [(ax, ay - s * 0.04), (ax + s * 0.12, ay - s * 0.10), (ax + s * 0.04, ay + s * 0.06)],
        fill=WHITE,
    )
    # Flecha en el otro extremo (abajo-izquierda)
    bx = cx + r * math.cos(math.radians(210))
    by = cy - r * math.sin(math.radians(210))
    draw.polygon(
        [(bx, by + s * 0.04), (bx - s * 0.12, by + s * 0.10), (bx - s * 0.04, by - s * 0.06)],
        fill=WHITE,
    )


# -- Generar todos los iconos -------------------------------------------------

SYMBOLS = {
    "panel":        sym_panel,
    "audit":        sym_audit,
    "table":        sym_table,
    "figure":       sym_figure,
    "heading":      sym_heading,
    "citation":     sym_citation,
    "bibliography": sym_bibliography,
    "cover":        sym_cover,
    "ai":           sym_ai,
    "refresh":      sym_refresh,
}


def main():
    total = 0
    for name, color in COLORS.items():
        draw_fn = SYMBOLS[name]
        for size in SIZES:
            img = make_icon(name, color, draw_fn, size)
            filename = f"icon-{name}-{size}.png"
            filepath = OUTPUT_DIR / filename
            img.save(filepath, "PNG")
            total += 1
            print(f"  [OK] {filename} ({size}x{size})")

    print(f"\nDone: {total} icons generated in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
