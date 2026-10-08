# Contrato de Diseño WordAPA7

Documento de referencia obligatoria para toda pantalla nueva o modificada. Si una vista necesita un color o espaciado nuevo, primero debe justificarse como token del sistema, no como estilo aislado.

## 1. Tokens de Color del Sistema (src/styles/design-system.css & fluent.css)

La aplicación utiliza el tema **Claro nativo de Microsoft Word 365** por defecto, perfectamente integrado con la interfaz de Word Desktop y su canvas de hoja blanca:

| Token | Valor (Light default) | Uso |
|---|---|---|
| `--color-bg-canvas` / `--canvas-bg` | `#f5f6f8` / `#e6e6e6` | Fondo general de trabajo / backdrop de Word |
| `--color-bg-surface` / `--sidebar-bg` | `#ffffff` | Paneles laterales, tarjetas, ribbon, modales |
| `--color-bg-surface-alt` / `--surface-subtle` | `#f1f5f9` / `#eef0f4` | Fondos de chips, cards secundarias |
| `--color-paper` / `--paper-bg` | `#ffffff` | Hoja de trabajo del documento (preview y edición) |
| `--color-text-primary` / `--text-main` | `#1a1a2e` / `#201f1e` | Texto primario de alto contraste |
| `--color-text-secondary` / `--text-secondary` | `#4a4a5e` / `#605e5c` | Texto secundario y explicativo |
| `--color-text-tertiary` / `--text-muted` | `#6b6b80` / `#8a8886` | Texto atenuado y placeholders |
| `--color-border-subtle` | `#e2e8f0` / `rgba(0, 0, 0, 0.09)` | Bordes sutiles de paneles y cards |
| `--color-border-strong` | `#cbd5e1` / `rgba(0, 0, 0, 0.15)` | Bordes de inputs y separadores |
| `--color-accent` / `--accent-primary` | `#4f7cff` | Color de marca WordAPA7: acciones primarias y selección |
| `--color-accent-hover` | `#3867f6` | Hover de acción primaria |
| `--color-success` | `#2f855a` / `#3f9c6d` | Semántico: estados exitosos y conformes a APA 7 |
| `--color-warning` | `#c0562e` / `#e08a63` | Semántico: advertencias y observaciones (terracota; dejó de ser amarillo) |
| `--color-danger` | `#d4382e` / `#dc2626` | Semántico: errores de validación y destrucción |

> **Canonicidad semántica:** `--color-success`, `--color-warning` y `--color-danger` son los únicos nombres válidos. Los alias `--accent-success`, `--accent-warning` y `--accent-danger` fueron eliminados; no usarlos en código nuevo.

## 2. Componentes Cerrados (src/components/ui/wordapa7.tsx)

- `Card`: Superficie blanca elevada con borde sutil.
- `Panel`: Contenedor principal con sombra fluida.
- `Badge`: Etiquetas de estado (`accent`, `success`, `warning`, `danger`, `muted`).
- `Modal`: Diálogos modales con backdrop.
- `StepperItem`: Indicador de etapas del flujo.
- `InputField` / `TextAreaField`: Entradas de texto estilizadas.

## 3. Principios de Integración en Microsoft Word Desktop
- El complemento de Word (`word-addin`) se integra de manera homogénea con el fondo blanco y limpio de Microsoft Word 365.
- Acciones proactivas de 1 clic en el panel lateral y comandos directos en el Ribbon superior (Pestaña **Inicio** y pestaña **WordAPA7**).
