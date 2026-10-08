/**
 * WordAPA7 Add-in — PostCSS config
 *
 * El add-in usa CSS plano (taskpane.css) y NO necesita Tailwind.
 * Sin este archivo local, Vite hereda el postcss.config.js del
 * directorio raíz (que incluye tailwindcss) y genera la advertencia:
 *   "The `content` option in your Tailwind CSS configuration is missing or empty."
 *
 * Al definir este archivo con solo autoprefixer, el add-in procesa
 * su CSS sin arrastrar Tailwind ni sus advertencias.
 */
module.exports = {
  plugins: {
    autoprefixer: {},
  },
}
