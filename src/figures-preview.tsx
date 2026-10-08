/* Preview SOLO para captura visual del Taller de Figuras.
   Archivo temporal: se borra despues de la screenshot. No forma parte del producto. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import './styles/fluent.css';
import './styles/design-system.css';
import { TallerFigurasView } from './components/figures/TallerFigurasView';
import { useDocStore } from './store/useDocStore';

document.documentElement.setAttribute(
  'data-theme',
  new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light',
);

const grafico = (titulo: string, valores: number[], color: string) => {
  const barras = valores
    .map((v, i) => {
      const h = Math.round(v * 24);
      return `<rect x="${30 + i * 58}" y="${178 - h}" width="34" height="${h}" rx="3" fill="${color}"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="210" viewBox="0 0 520 210">
    <rect width="520" height="210" fill="#ffffff"/>
    <text x="26" y="28" font-family="Inter, sans-serif" font-size="15" font-weight="600" fill="#1e293b">${titulo}</text>
    <line x1="26" y1="180" x2="500" y2="180" stroke="#cbd5e1" stroke-width="1.5"/>
    ${barras}
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};

let n = 0;
const el = (o: Record<string, unknown>): Record<string, unknown> => ({
  id: `e${++n}`,
  style_name: '',
  alignment: 'left',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: false,
  is_italic: false,
  is_bullet: false,
  left_indent_cm: 0,
  confidence: 1,
  is_user_modified: false,
  cita_ids: [],
  needs_review: false,
  auto_applied: false,
  ...o,
});

const ELEMENTOS = [
  el({ type: 'heading', heading_level: 1, text: '2. Metodología' }),
  el({ type: 'paragraph', text: 'Se aplicó un cuestionario a doscientos estudiantes de tres cohortes durante el segundo semestre del periodo académico evaluado.' }),
  el({ type: 'image', text: 'Figura 1', image_info: { figure_number: 1, caption: 'Distribución de respuestas por cohorte', relative_url: grafico('Respuestas por cohorte', [3, 5, 4, 6], '#4f7cff'), width_cm: 14, height_cm: 9, alignment: 'center', design_style: 'standard' } }),
  el({ type: 'paragraph', text: 'Los resultados muestran una tendencia estable a lo largo del periodo evaluado.' }),
  el({ type: 'image', text: 'Figura 2', image_info: { figure_number: 2, caption: '', relative_url: grafico('Asistencia media', [4, 3, 6, 5], '#38a017'), width_cm: 12, height_cm: 8, alignment: 'center', design_style: 'scientific' } }),
  el({ type: 'paragraph', text: 'La asistencia se mantuvo alta en todas las cohortes medidas.' }),
  el({ type: 'table', text: 'Tabla 1', table_info: { table_number: 1, caption: 'Estadísticos descriptivos por variable', headers: ['Variable', 'M', 'DE'], rows: [['Asistencia', '4.6', '0.8'], ['Participación', '3.9', '1.1'], ['Satisfacción', '4.2', '0.7']] } }),
  el({ type: 'equation', text: 'x = media aritmética de la muestra', equation: { number: 1 } }),
];

useDocStore.setState({
  doc: { session_id: 'preview', file_name: 'Tesis.docx', elements: ELEMENTOS, referencias: [], meta: { page_count: 6 } },
  reviewResult: null,
  proofreadFindings: [],
  citationAuditResult: null,
  imagePanelOpen: false,
  selectedElementId: null,
} as never);

ReactDOM.createRoot(document.getElementById('root')!).render(<TallerFigurasView />);

const tabDeseada = new URLSearchParams(location.search).get('tab');
if (tabDeseada) {
  setTimeout(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLElement[];
    tabs.find((t) => (t.textContent || '').toLowerCase().includes(tabDeseada))?.click();
  }, 500);
}
