# Especificación de Diseño: Rediseño Integral de Figuras, Tablas y Ecuaciones (Taller Gráfico APA 7)

**Fecha:** 2026-10-03  
**Estado:** Aprobado para Planificación  
**Ruta:** `docs/superpowers/specs/2026-10-03-redisenio-figuras-tablas-design.md`

---

## 1. Visión y Propósito
Transformar el Paso 3 (Figuras y Tablas) de una pantalla gris y oculta en un **Taller Gráfico y Editorial de Alto Rendimiento**:
1. **Ergonomía de Selección (Rail Vertical de Iconos):** En lugar de botones horizontales o pestañas arriba, un micro-rail vertical de iconos vectoriales propios a la izquierda (`Figuras`, `Tablas`, `Ecuaciones`) con badges de conteo.
2. **Lienzo Editorial Continuo (Sin Cards Saturadas):** Adiós a las tarjetas abultadas con sombras difusas. El diseño adopta una superficie continua con **líneas divisorias limpias de 1px** y **contrastes en azul marino profundo (`#0f172a` / `#1e293b`)** que le otorgan carácter de imprenta técnica.
3. **Tipografía Editorial de Alta Gama:** Párrafos de contexto anterior y posterior en tipografía serif de libro académico (`Charter`, `Cormorant Garamond`, `Baskerville`) con kerning óptico y escala de lectura cómoda.
4. **Controles Directos en el Activo:** Rotación en 90°, sustitución de archivo y escala precisa en centímetros sin entrar a menús enterrados.
5. **Sugerencia Automática de Leyenda por IA:** Bloque contextual inferior integrado en la lectura con 1-clic para aplicar como título normativo APA 7.
6. **Inspector por Pestañas Técnicas (Formato, Texto, Estilo, Calidad):** Reorganización limpia de los 7 presets visuales (estándar, científico, multipanel, etc.) y controles de escala en centímetros.

---

## 2. Criterios Estrictos de Diseño
- **Cero Emojis:** Todos los iconos se renderizan con SVG vectoriales (`lucide-react` o componentes SVG nativos del sistema: `Image`, `Table2`, `Pi`, `RotateCw`, `Upload`, `Sliders`, `Palette`, `CheckCircle2`).
- **Paleta de Contraste y Tokens:** 
  - Azul marino profundo (`--color-navy: #0f172a`, `--color-navy-surface: #1e293b`).
  - Divisores arquitectónicos nítidos de 1px (`var(--border-subtle)` / `--border-contrast`).
  - Acento interactivo (`var(--accent-primary, #0284c7)`).
  - Cero cards abultadas con sombras desenfocadas; paneles planos con líneas estructurales puras.
- **Micro-interacciones Snappy:** Transiciones de 100-150ms.

---

## 3. Arquitectura de Componentes

| Componente | Archivo | Responsabilidad |
|---|---|---|
| `TallerFigurasView.tsx` | `src/components/figures/TallerFigurasView.tsx` | Contenedor principal de la fase 3 que reemplaza a `Step3FiguresTablesWizard.tsx`. |
| `RailTipoActivos.tsx` | `src/components/figures/RailTipoActivos.tsx` | Micro-rail vertical a la extrema izquierda con selector de iconos (Figuras / Tablas / Ecuaciones). |
| `GaleriaActivosColumna.tsx` | `src/components/figures/GaleriaActivosColumna.tsx` | Lista de elementos del tipo activo con miniaturas de 52x42px e indicador de estado APA. |
| `LienzoEditorialActivo.tsx` | `src/components/figures/LienzoEditorialActivo.tsx` | Centro amplio con prosa editorial (serif), imagen a escala en cm, rotación/reemplazo directo y sugerencia IA. |
| `InspectorActivoTabs.tsx` | `src/components/figures/InspectorActivoTabs.tsx` | Panel derecho estructurado por pestañas (Formato, Texto, Estilo, Calidad) sin cards abultadas. |
