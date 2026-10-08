# Prompt de diseño reutilizable — visualización de datos de Revisión & IA

Guardado a pedido del usuario. Es el prompt que produjo `2026-10-05-mapa-ia-A-vs-B.html`.
Copiarlo cuando un agente deba proponer una visualización de datos para la app, para que salga
en el idioma visual correcto y no reinvente el lenguaje.

---

**Rol.** Diseñás UI para la app de escritorio WordAPA7 (React 18 + Electron, fidelidad de papel APA 7).
**Tarea.** Proponer dos opciones de visualización para `<dato>` en un mockup HTML autocontenido, lado a lado.

**Reglas duras — violarlas invalida el mockup:**

- Cero emojis. En el producto real solo iconos SVG de `lucide-react`; en el mockup, texto.
- Solo tokens CSS: `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--text-*)`, `var(--ia-nivel-*)`.
  Prohibido hardcodear colores hex; la única excepción es copiar el **valor real** de un token en el bloque `:root` del mockup para que sea autocontenido.
- Nada de "cards" de contenido, nada de barras horizontales, nada de minimapa.
- Densidad alta; separar bloques con `--color-border-subtle` y radios `--radius-sm/md`, no con sombras grandes.
- **Una única fuente de datos** en JS: todas las opciones y el hero se derivan de ese array. El mockup debe demostrar que las vistas no pueden contradecirse.
- Incluir toggle claro/oscuro con los valores del bloque `[data-theme="dark"]`.
- Al pie, lista de decisiones técnicas abiertas para el spec.
- Idioma español, tono técnico, sin marketing.

**Tokens reales (copia fiel de `src/styles/design-system.css`):**

```
--color-bg-canvas:#f5f6f8; --color-bg-surface:#ffffff; --color-bg-surface-alt:#eef0f4; --color-bg-surface-hover:#e8eaf0;
--color-border-subtle:rgba(0,0,0,.09);
--color-text-primary:#1a1a2e; --color-text-secondary:#4a4a5e; --color-text-tertiary:#6b6b80;
--color-accent:#4f7cff; --color-warning:#c0562e; --color-danger:#d4382e; --color-success:#2f855a;
--color-engine-ia:#7c3aed; --color-engine-ia-a08/a12/a20/a40/a65;
--text-xs:11px; --text-sm:13px; --text-base:14px; --text-2xl:24px;
--space-1:4px … --space-8:32px; --radius-2xs:2px; --radius-sm:4px; --radius-md:8px; --radius-full:9999px;
--ia-nivel-1:ia-a08; --ia-nivel-2:ia-a20; --ia-nivel-3:ia-a40; --ia-nivel-4:ia full;
```

**Paleta de severidad (rampa de una sola tinta, no cuatro rojos):**
neutral `--color-text-tertiary` → `--color-engine-ia-a40` → `--color-engine-ia-a65` → `--color-engine-ia`.

**Idioma de layout aprobado en la app:** la puerta de Revisión usa una matriz fase × motor con celdas cuadradas. Reusar ese idioma antes que inventar uno nuevo.

**Salida:** un `.html` versionado en `docs/superpowers/mockups/YYYY-MM-DD-<tema>.html`.
