# WordAPA7 — Sistema de Diseño (fuente maestra)

> **Jerarquía de lectura:** antes de construir una pantalla, mirá
> `design-system/wordapa7/pages/<pagina>.md`. Si existe, sus reglas **mandan**
> sobre este archivo. Si no, seguí este maestro al pie de la letra.
>
> Este maestro **refleja los tokens reales** de `src/styles/design-system.css`.
> No inventa una paleta: la que figura abajo es la que el código ya declara.

---

## 0 · Reglas duras (no negociables)

- **Cero emojis.** Solo íconos SVG de `lucide-react`, con
  `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales.** Ni `#hex` ni `rgba(...)` en `.tsx`: solo tokens
  `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`.
- **Fidelidad de papel APA 7.** `--paper-white` es blanco puro y `--paper-ink`
  tinta nítida en **ambos** temas. El atenuado de una tarjeta lejana se hace con
  escala y velo (`--scrim-overlay`), **nunca** con `filter: brightness`.
- **Ninguna UI puede afirmar algo que el código no hace.**
- **Fuente única de tokens:** `src/styles/design-system.css`. Contrato resumido:
  `src/styles/design-tokens.md`.
- `npx vitest` no type-chequea: correr `npx tsc --noEmit` aparte, siempre.

---

## 1 · Color

Acento **azul** en los dos temas; el teal es un **secundario** (nivel H2 del
diagrama de Estructura), no el acento. Semánticos: solo
`--color-success` / `--color-warning` / `--color-danger`.

| Rol | Token | Claro | Oscuro |
|---|---|---|---|
| Acento | `--color-accent` | `#4f7cff` | `#4f7cff` |
| Acento hover | `--color-accent-hover` | `#3b66e0` | `#7ba0ff` |
| Secundario (teal) | `--color-secondary` | `#0d9488` | `#0d9488` |
| Tinta editorial | `--color-ink` | `#1e3a5f` | `#1e3a5f` |
| Nivel 3 (indigo) | `--color-level-3` | `#6366f1` | `#6366f1` |
| Éxito (sage) | `--color-success` | `#2f855a` | `#2f855a` |
| Advertencia (terracota) | `--color-warning` | `#c0562e` | `#c0562e` |
| Peligro | `--color-danger` | `#d4382e` | `#d4382e` |
| Fondo canvas | `--color-bg-canvas` | `#f5f6f8` | `#0f0f11` |
| Superficie | `--color-bg-surface` | `#ffffff` | `#18181c` |
| Superficie alt | `--color-bg-surface-alt` | `#eef0f4` | `#202028` |
| Borde sutil | `--color-border-subtle` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.10)` |
| Borde fuerte | `--color-border-strong` | `rgba(0,0,0,.15)` | `rgba(255,255,255,.18)` |
| Texto primario | `--color-text-primary` | `#1a1a2e` | `#f2f2f5` |
| Texto secundario | `--color-text-secondary` | `#4a4a5e` | `#c4c4d4` |
| Texto terciario | `--color-text-tertiary` | `#6b6b80` | `#a0a0b4` |
| Papel | `--paper-white` / `--paper-ink` | `#ffffff` / `#111827` | `#ffffff` / `#111827` |

Los alias legacy (`--bg-base`, `--border-color`, `--word-blue`, `--app-bg` …)
**existen** en `design-system.css` por compatibilidad, pero el código nuevo usa
los nombres canónicos `--color-*`.

---

## 2 · Tipografía

| Rol | Token | Familia |
|---|---|---|
| UI | `--font-sans` | Inter → Segoe UI Variable → system |
| Títulos de interfaz | `--font-display` | Outfit → Inter → system |
| Cuerpo editorial (hoja) | `--font-editorial` | Newsreader → Georgia → serif |
| Código / cifras | `--font-mono` | JetBrains Mono |

Escala: `--text-xs` 11 · `--text-sm` 13 · `--text-base` 14 · `--text-lg` 16 ·
`--text-xl` 20 · `--text-2xl` 24 · `--text-3xl` 32. Interlineado:
`--leading-tight` 1.25 · `--leading-normal` 1.5 · `--leading-relaxed` 1.625.

---

## 3 · Espacio, radio, sombra, ícono, z y movimiento

- **Espacio:** `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 ·
  `-8` 32 · `-10` 40 · `-12` 48.
- **Radio:** `--radius-none/2xs/xs/sm/md/lg/xl/full`; el de la app es
  `--radius-md` (8px). Un radio fuera de la escala se acerca al escalón vecino.
- **Sombra:** `--shadow-sm/md/lg/card` · `--shadow-accent` · `--shadow-inset` ·
  `--scrim-overlay`.
- **Ícono:** `--icon-size-sm` 14 · `-md` 16 · `-lg` 20 · `-xl` 24 · `-2xl` 40;
  grosor único `--icon-stroke` 1.75.
- **Z:** `--z-base` 0 · `-dropdown` 100 · `-sticky` 200 · `-carga` 50 ·
  `-overlay` 900 · `-modal` 1000 · `-toast` 1200. Nada fuera de la escala.
- **Movimiento:** `--transition-fast` 120ms · `--transition-base` 200ms;
  respetar `prefers-reduced-motion`.

---

## 4 · Componentes canónicos

Cerrados en `src/components/ui/wordapa7.tsx`: `Card`, `Panel`, `Badge`,
`Modal`, `StepperItem`, `InputField` / `TextAreaField`. Reutilizarlos antes de
crear un patrón nuevo.

---

## 5 · Patrón por superficie (LAYOUT POR TAREA)

- **Revisión & IA:** un párrafo a la vez. Motores objetivos → "Aceptar /
  Aceptar todas"; detector de IA (probabilístico) → solo "Marcar para revisar".
- **Exportación:** columna única alineada a la izquierda; icono → título → una
  línea ≤50ch → dos botones (sólido + fantasma).
- **Rail:** 56px, siempre visible; no colapsa por paso.
- **Portada:** carrusel con **selector central fijo**. Ver
  `pages/portada.md`.

---

## 6 · Anti-patrones (no usar)

- Emojis como íconos.
- Colores literales (`#hex`, `rgba`) dentro de `.tsx`.
- `filter: brightness` sobre el papel.
- Hovers que mueven el layout.
- Texto por debajo de 4.5:1 de contraste.
- Cambios de estado instantáneos (todo con transición 120–200ms).
- Foco invisible.

---

## 7 · Checklist antes de entregar

- [ ] Cero emojis; íconos de `lucide-react` con `--icon-stroke`.
- [ ] Cero colores literales; solo tokens declarados en `design-system.css`.
- [ ] Contraste de texto ≥ 4.5:1 en claro **y** oscuro.
- [ ] Foco visible para teclado.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Probado a 375 / 768 / 1024 / 1440 px.
- [ ] Papel blanco puro, tinta nítida, en ambos temas.
- [ ] `npx vitest` verde **y** `npx tsc --noEmit` limpio.
