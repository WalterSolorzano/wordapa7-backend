/* WordAPA7 — Análisis y auditoría del Título del Documento (APA 7 / Académico).
 * Evalúa longitud, mayúsculas (Title Case), ausencia de punto final, variables
 * y delimitación sin mutar el texto original.
 */
import type { ElementModel } from '../types';

export interface CriterioTitulo {
  id: string;
  nombre: string;
  cumple: boolean;
  detalle: string;
  severidad: 'critical' | 'high' | 'medium' | 'low';
}

export interface AnalisisTitulo {
  titulo: string;
  elementoId: string | null;
  palabrasCount: number;
  puntaje: number;
  criterios: CriterioTitulo[];
  sugerencia: string | null;
  estado: 'optimo' | 'mejorable' | 'critico' | 'sin_titulo';
  veredicto: string;
}

const PREPOSICIONES_CONJUNCIONES = new Set([
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'del', 'al', 'desde', 'durante', 'en', 'entre',
  'hacia', 'hasta', 'mediante', 'para', 'por', 'segun', 'según', 'sin', 'so', 'sobre', 'tras',
  'versus', 'via', 'vía', 'y', 'e', 'ni', 'o', 'u', 'pero', 'mas', 'sino', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'
]);

const MULETILLAS_INICIO = [
  /^(un|una)\s+estudio\s+(sobre|acerca\s+de)\s+/i,
  /^(una|un)\s+investigaci[oó]n\s+(sobre|acerca\s+de)\s+/i,
  /^(an[aá]lisis\s+de\s+)/i,
  /^(ensayo\s+sobre\s+)/i,
];

const DELIMITADORES_CONTEXTO = [
  /\ben\s+(estudiantes|docentes|alumnos|profesores|empresas|pacientes|usuarios|hospitales|escuelas|universidades|am[eé]rica|per[uú]|m[eé]xico|colombia|chile|españa|lima|bogot[aá])\b/i,
  /\bcaso\s+de\b/i,
  /\bperiodo\s+\d{4}/i,
  /\bdurante\s+el\s+a[nñ]o\b/i,
  /\bentro\s+de\b/i,
  /\bcontexto\s+de\b/i,
  /\bdel\s+distrito\b/i,
  /\bde\s+la\s+ciudad\b/i,
];

export function extraerTituloPrincipal(elements: readonly ElementModel[]): { texto: string; elementoId: string | null } {
  // 1. Elemento explícito de portada
  const portadaTitle = elements.find(
    (e) => ((e as any).is_cover || (e as any).is_cover_section) && (e.type === 'heading' || (e as any).portada_role === 'title')
  );
  if (portadaTitle && portadaTitle.text.trim()) {
    return { texto: portadaTitle.text.trim(), elementoId: portadaTitle.id };
  }

  // 2. Elemento marcado como cover
  const primerCover = elements.find((e) => (e as any).is_cover && e.text.trim());
  if (primerCover) {
    return { texto: primerCover.text.trim(), elementoId: primerCover.id };
  }

  // 3. Primer Heading H1
  const primerH1 = elements.find((e) => (e.type === 'heading' || (e as any).heading_level === 1) && e.text.trim());
  if (primerH1) {
    return { texto: primerH1.text.trim(), elementoId: primerH1.id };
  }

  // 4. Primer párrafo relevante antes de cualquier capítulo
  const primerP = elements.find((e) => e.text.trim().length > 10);
  if (primerP) {
    return { texto: primerP.text.trim(), elementoId: primerP.id };
  }

  return { texto: '', elementoId: null };
}

export function analizarTitulo(texto: string, elementoId: string | null = null): AnalisisTitulo {
  const limpio = texto.trim();
  if (!limpio) {
    return {
      titulo: '',
      elementoId,
      palabrasCount: 0,
      puntaje: 0,
      criterios: [],
      sugerencia: null,
      estado: 'sin_titulo',
      veredicto: 'No se detectó un título principal en el documento',
    };
  }

  const palabras = limpio.split(/\s+/).filter(Boolean);
  const count = palabras.length;
  const criterios: CriterioTitulo[] = [];

  // Regla 1: Longitud APA 7 (Idealmente <= 15 palabras, máximo 20, mínimo 4)
  const longitudOk = count >= 4 && count <= 15;
  const longitudCritica = count < 3 || count > 22;
  criterios.push({
    id: 'longitud',
    nombre: 'Longitud concisa (APA 7)',
    cumple: longitudOk,
    detalle: count < 4
      ? `Muy corto (${count} palabras). Se recomiendan entre 8 y 15 palabras.`
      : count > 15
        ? `Extenso (${count} palabras). APA 7 recomienda idealmente un máximo de 12–15 palabras.`
        : `${count} palabras (rango óptimo de concisión APA 7).`,
    severidad: longitudCritica ? 'critical' : longitudOk ? 'low' : 'medium',
  });

  // Regla 2: Sin punto final
  const tienePuntoFinal = limpio.endsWith('.');
  criterios.push({
    id: 'sin_punto',
    nombre: 'Puntuación final',
    cumple: !tienePuntoFinal,
    detalle: tienePuntoFinal
      ? 'Los títulos en APA 7 nunca deben llevar punto final.'
      : 'Correcto: no tiene punto final.',
    severidad: tienePuntoFinal ? 'high' : 'low',
  });

  // Regla 3: Capitalización / Title Case (No todo mayúsculas ni todo minúsculas)
  const esTodoMayus = limpio === limpio.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(limpio) && limpio.length > 5;
  const esTodoMinus = limpio === limpio.toLowerCase() && /[a-záéíóúñ]/.test(limpio);
  const capitalizacionOk = !esTodoMayus && !esTodoMinus;
  criterios.push({
    id: 'capitalizacion',
    nombre: 'Capitalización APA 7 (Title Case)',
    cumple: capitalizacionOk,
    detalle: esTodoMayus
      ? 'El título está completamente en MAYÚSCULAS. En APA 7 debe usar mayúsculas iniciales.'
      : esTodoMinus
        ? 'El título está completamente en minúsculas.'
        : 'Uso adecuado de mayúsculas y minúsculas.',
    severidad: esTodoMayus || esTodoMinus ? 'high' : 'low',
  });

  // Regla 4: Muletillas iniciales de relleno ("Un estudio sobre...", "Análisis de...")
  const tieneMuletilla = MULETILLAS_INICIO.some((rx) => rx.test(limpio));
  criterios.push({
    id: 'sin_muletillas',
    nombre: 'Precisión y enfoque',
    cumple: !tieneMuletilla,
    detalle: tieneMuletilla
      ? 'Evita muletillas al inicio como "Un estudio sobre..." o "Investigación de...". Sé directo.'
      : 'Directo y enfocado sin fórmulas de relleno iniciales.',
    severidad: tieneMuletilla ? 'medium' : 'low',
  });

  // Regla 5: Delimitación o contexto de estudio
  const tieneDelimitacion = DELIMITADORES_CONTEXTO.some((rx) => rx.test(limpio)) || /:\s+[A-ZÁÉÍÓÚ]/.test(limpio);
  criterios.push({
    id: 'delimitacion',
    nombre: 'Delimitación contextual o subtítulo',
    cumple: tieneDelimitacion,
    detalle: tieneDelimitacion
      ? 'Delimita el contexto, población o subtítulo adecuadamente.'
      : 'Considera especificar el contexto, ámbito de aplicación o población de estudio.',
    severidad: 'medium',
  });

  // Cálculo de puntaje
  let puntos = 100;
  if (!longitudOk) puntos -= count > 20 || count < 4 ? 25 : 15;
  if (tienePuntoFinal) puntos -= 20;
  if (!capitalizacionOk) puntos -= 25;
  if (tieneMuletilla) puntos -= 15;
  if (!tieneDelimitacion) puntos -= 10;
  puntos = Math.max(0, Math.min(100, puntos));

  // Generar sugerencia depurada
  let sugerenciaTexto = limpio;
  if (tienePuntoFinal) {
    sugerenciaTexto = sugerenciaTexto.replace(/\.+$/, '');
  }
  for (const m of MULETILLAS_INICIO) {
    sugerenciaTexto = sugerenciaTexto.replace(m, '');
  }
  if (sugerenciaTexto.length > 0) {
    sugerenciaTexto = sugerenciaTexto.charAt(0).toUpperCase() + sugerenciaTexto.slice(1);
  }

  // Corregir Title Case si estaba todo en mayúsculas
  if (esTodoMayus) {
    sugerenciaTexto = sugerenciaTexto
      .toLowerCase()
      .split(/\s+/)
      .map((pal, idx) => {
        if (idx > 0 && PREPOSICIONES_CONJUNCIONES.has(pal)) return pal;
        return pal.charAt(0).toUpperCase() + pal.slice(1);
      })
      .join(' ');
  }

  let estado: 'optimo' | 'mejorable' | 'critico' = 'optimo';
  if (puntos < 60) estado = 'critico';
  else if (puntos < 85) estado = 'mejorable';

  const veredicto =
    puntos >= 90
      ? 'Título con excelente formulación y cumplimiento APA 7'
      : puntos >= 70
        ? 'El título es claro pero tiene detalles de formato o concisión por ajustar'
        : 'El título requiere ajustes importantes de formato o extensión';

  return {
    titulo: limpio,
    elementoId,
    palabrasCount: count,
    puntaje: puntos,
    criterios,
    sugerencia: sugerenciaTexto !== limpio ? sugerenciaTexto : null,
    estado,
    veredicto,
  };
}
