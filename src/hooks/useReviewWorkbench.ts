/* WordAPA7 — review: capa de DERIVACIÓN del workbench.
   Todo lo que antes eran 20 useState y 300 líneas de memos dentro del
   componente. Sin JSX, para poder probar el filtrado, el agrupado, la
   paginación real y la honestidad de las métricas sin DOM.

   Este archivo DERIVA: qué hallazgos hay, cómo se agrupan, qué página es cuál,
   cuántas marcas hay. La mitad que ESCRIBE —aceptar, marcar, descartar, el
   alcance de cada acción— está en `useReviewActions`, que es donde vive cada
   defecto de este módulo: el que escribe en el documento no es el mismo código
   que el que decide qué se ve. El contrato público no cambió al partirlo.

   Tres reglas que este módulo no negocia:
   1. El detector de IA es PROBABILÍSTICO: propone, la persona decide. Ninguna
      ruta de este archivo aplica una sugerencia suya (ver `aceptaDeIA`), ni
      aunque la vista llame a `runGroupAction` con el grupo entero.
   2. Un motor que no ha corrido no produce números: `compliance` es `null`
      hasta que los tres motores dejaron resultados, y un motor que falló en
      esta sesión vuelve a `null` (ver `lastRunState`).
   3. Las páginas salen de `usePageIndex` (la paginación real del lienzo). Un
      elemento que no está en el índice devuelve `null`, nunca un número
      estimado: la heurística de 1800 caracteres por página que convivía con
      esta fuente murió con `Step5AuditIAWizard`, que ahora es un envoltorio de
      `ReviewWorkbench`. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useDocStore } from '../store/useDocStore';
import { usePageIndex } from './usePageIndex';
import {
  summarizeScanOutcomes,
  toReason,
  type EngineScanOutcome,
  type ScanEngineId,
} from '../components/wizard/scanOutcome';
import { useReviewActions } from './useReviewActions';
import { reviewItems, PHASE_ORDER, phaseLabel, type AuditItem, type EngineId, type Severity } from '../lib/auditItems';
import { rotuloDeSubtipo } from '../lib/rotulos';
import { contarParrafos, cumplimiento } from '../lib/informeRevision';

/* La tabla de rótulos y la de reglas viven en `lib/rotulos`, y no acá. Este hook
   las consumía y las declaraba a la vez, que es lo que dejó al slice del store sin
   puerta de entrada y con su propia tabla de diez filas: un slice no puede importar
   de un hook. Se reexportan porque son parte del contrato público de este archivo. */
export { rotuloDeSubtipo, SUBTYPE_LABELS, ROTULO_GENERICO } from '../lib/rotulos';

/* La LISTA de hallazgos vive en `lib/auditItems` porque el rail necesita contar
   la misma que esta vista abre. Estos `export type` siguen siendo su puerta:
   media app importa `AuditItem` desde acá y no tiene por qué saber dónde se
   escribieron los tipos. */
export type { AuditItem, EngineId, Severity };
export type EngineFilter = EngineId | 'all';
/** Ortogonal al filtro de motor: la fase y el motor se acotan a la vez. */
export type PhaseFilter = string | 'all';
export type SubtypeAction = 'accept' | 'mark' | 'resolveGhosts' | 'autoCaption' | 'none';

export interface SubtypeGroup {
  key: string;
  label: string;
  items: AuditItem[];
  action: SubtypeAction;
  massLabel: string;
}

export interface EngineGroup {
  engine: EngineId;
  title: string;
  chip: string;
  count: number;
  criticalHigh: number;
  groups: SubtypeGroup[];
  massAction: SubtypeAction;
  massLabel: string;
  /**
   * Las dos mitades de "hasta dónde llega la acción en masa", publicadas JUNTO
   * con `massAction` porque las dos las produce la misma regla: la cabecera
   * actúa solo sobre los subtipos que comparten su acción (ver
   * `runGroupAction`). `covered` = hallazgos de esos subtipos, `count` = los
   * del motor entero. Con las dos mitades a la vista, quien pinta el aviso no
   * puede equivocarse: si la vista las re-derivara por su cuenta, un cambio de
   * alcance en el hook dejaría el número del rack diciendo una cosa y el aviso
   * de cobertura otra, y la que se ve es la que miente.
   */
  covered: number;
}

export interface ReviewWorkbenchApi {
  /** Hallazgos no descartados, en el orden en que los produjo cada motor */
  items: AuditItem[];
  /** Grupos de lo que el FILTRO deja ver: el rack de acciones y la semilla de
   *  `openEngines` los quieren estrechos. NO los confundas con `allGroups`. */
  groups: EngineGroup[];
  /** Un grupo por motor sobre TODOS los hallazgos, sin filtro. Es lo que
   *  necesitan los chips de la barra: un chip por motor que se pierde cuando
   *  hay un filtro activo no deja volver a "Todo" ni elegir otro motor. */
  allGroups: EngineGroup[];
  /** `items.length > 0`: hay hallazgos en el documento, filtrados o no. Derivarlo
   *  de `groups` haría que un filtro dejara la barra pensando que no hay nada. */
  hasFindings: boolean;
  /** Cuántos hallazgos deja ver el FILTRO ACTIVO, que es el conjunto exacto
   *  que recorre `nextFinding`. La vista lo necesita para no dejar "Siguiente
   *  hallazgo" encendido cuando el filtro se queda sin destino, y no lo
   *  re-deriva: el predicado del filtro es de acá, no de quien lo mira. */
  visibleCount: number;
  /** El NOMBRE del filtro de motor activo, o `null` si no hay ninguno. Vive acá
   *  y no en la vista por la misma razón que `visibleCount`: la vista no puede
   *  comparar `filter` con nada, porque el predicado del filtro es de este
   *  archivo. Y el nombre importa de verdad —el estado vacío de "el filtro dejó
   *  la pantalla vacía" tiene que NOMBRAR el filtro, o deja al usuario adivinando
   *  cuál de los cinco sacar—. */
  filterLabel: string | null;
  /** Ids de elemento con ALGÚN hallazgo, ya recortados por el filtro. Es lo que
   *  el lienzo usa para teñir de acento los bloques con hallazgos en el modo
   *  Hoja (`reviewHighlightIds`). Sale de `visibles` y no de `items`: el
   *  conjunto que se cuenta es el mismo que `visibleCount` y el que
   *  recorre `nextFinding`. */
  highlightIds: Set<string>;
  filter: EngineFilter;
  setFilter: (f: EngineFilter) => void;
  /** Filtro de fase, ortogonal al de motor. */
  phaseFilter: PhaseFilter;
  setPhaseFilter: (p: PhaseFilter) => void;
  /** Fases con hallazgo, en orden de documento, SIN filtro. Alimenta los chips:
   *  un chip que desaparece al activarlo deja al usuario sin salida. */
  allPhases: { key: string; label: string; pending: number }[];
  totalPages: number;
  currentPage: number;
  goToPage: (p: number) => void;
  selected: AuditItem | null;
  select: (id: string | null) => void;
  elegirHallazgo: (id: string) => void;
  nextFinding: () => void;
  openEngines: EngineId[];
  setOpenEngines: Dispatch<SetStateAction<EngineId[]>>;
  openSubtypes: string[];
  setOpenSubtypes: Dispatch<SetStateAction<string[]>>;
  acceptOne: (item: AuditItem) => Promise<void>;
  /** El LOTE, no el botón: aplica la corrección a varios hallazgos objetivo de
   *  una vez, en secuencia, con el cerrojo de `isApplying`. No hay ninguna
   *  vista que la llame directamente —la vista pregunta con `runGroupAction` y
   *  el hook despacha— pero es la mitad observable de esa ruta: si `acceptMany`
   *  se comiera un hallazgo de IA, la prueba de "el detector de IA nunca
   *  acepta" que la cubre no podría ejercitar el mecanismo que de verdad
   *  escribe. Por eso se publica y no se borra. */
  acceptMany: (items: AuditItem[]) => Promise<void>;
  markForReview: (item: AuditItem) => void;
  /**
   * Ejecuta la acción de un grupo (cabecera de motor o fila de subtipo). La
   * vista pinta el rótulo y llama acá: no decide qué acción hay, ni cómo se
   * hace. `'none'` no ejecuta nada y lo dice.
   */
  runGroupAction: (group: EngineGroup | SubtypeGroup) => Promise<void>;
  dismiss: (item: AuditItem) => void;
  /** Las marcas de "para revisar". La vista las PINTA (el rótulo del detalle
   *  pasa a "Marcado para revisar" y se apaga), así que ya no es estado que
   *  nadie lee. */
  markedIds: string[];
  scanAll: () => Promise<void>;
  isScanning: boolean;
  /** Hay GLOBOS corriendo: los que se disparan solos al abrir un documento, no
   *  este escaneo. Sale del store y no de un `useState` de acá, que es lo que
   *  hacía que la pantalla afirmara "todavía no corrió ningún motor" mientras
   *  tres motores corrían. Los NOMBRES van aparte porque el estado vacío tiene
   *  que decir cuáles, no un "cargando" mudo. */
  isAuditing: boolean;
  motoresAuditando: string[];
  /** Hay una escritura al documento en curso. La UI se apaga con esto: la
   *  acción en masa es SECUENCIAL y hace una llamada de red por hallazgo, así
   *  que sin cerrojo un segundo "Aceptar todas" duplica la tanda. */
  isApplying: boolean;
  /** `compliance` es `null` hasta que los tres motores dejaron resultados (ver
   *  `threeEnginesRan`): un motor sin correr no produce un número. */
  metrics: { total: number; compliance: number | null };
  viewMode: 'focus' | 'canvas' | 'ia';
  setViewMode: (m: 'focus' | 'canvas' | 'ia') => void;
}

/** Orden de motores para grupos, chips y minimapa. El motor probabilístico
 *  va al final: es el que menos se ofrece a resolver solo. */
export const ENGINE_ORDER: EngineId[] = ['spelling', 'structure', 'citations', 'style', 'ai'];

export const ENGINE_META: Record<EngineId, { title: string; chip: string; color: string }> = {
  spelling: { title: 'Ortografía', chip: 'Ortografía', color: 'var(--color-danger)' },
  structure: { title: 'Estructura', chip: 'Estructura', color: 'var(--color-info)' },
  citations: { title: 'Citas', chip: 'Citas', color: 'var(--color-success)' },
  style: { title: 'Redacción', chip: 'Redacción', color: 'var(--color-warning)' },
  ai: { title: 'Patrones IA', chip: 'Patrones IA', color: 'var(--color-engine-ia)' },
};

/* Motores que corre el "Escanear" global, en el orden de Promise.allSettled.
   labels = nombre corto usado en el toast de fallo (chip de la UI). */
const SCAN_ENGINES: { id: ScanEngineId; label: string }[] = [
  { id: 'ai', label: 'IA' },
  { id: 'proofread', label: 'Ortografía' },
  { id: 'citations', label: 'Citas' },
];

/** Acción masiva por subtipo: qué tan objetiva es la corrección del motor. */
const SUBTYPE_ACTION: Record<string, SubtypeAction> = {
  parrafo_ia: 'mark',
  frase_ia: 'mark',
  muletilla: 'mark',
  repeticion: 'mark',
  /* Hallazgos que el motor DETECTA pero no puede corregir solo: cuáles de las
     tres repeticiones cortar, a qué antecedente se refiere "esto", cómo
     partir una oración de 60 palabras. Se marcan; no se aplican. */
  palabra_repetida: 'mark',
  pronombre_ambiguo: 'mark',
  voz_pasiva: 'mark',
  oracion_larga: 'mark',
  idea_incompleta: 'mark',
  /* La portada: se informa y no se aplica. `AGENTS.md` §1 dice que la portada
     original no se muta, y acá la regla no depende de que el `readOnly` que
     viaja siga siendo correcto. */
  portada: 'mark',
  largo_parrafo: 'mark',
  tiempo_verbal: 'mark',
  parafrasis: 'mark',
  /* Los dos criterios de fase que entraban por el fallback. 'mark': el motor
     propone la variable que falta o el detalle que falta, y escribirlo es
     decidir por el autor qué van a medir. */
  objetivo_generico: 'mark',
  objetivo_verbo: 'mark',
  metodo_generico: 'mark',
  /* Las ocho universales del spec §12. 'mark' todas: el motor detecta y la
     persona corrige. Una reescritura automática de prosa argumental sería
     decidir por el usuario. */
  registro_coloquial: 'mark',
  segunda_persona: 'mark',
  sigla_sin_definir: 'mark',
  ritmo_oracion: 'mark',
  exclamacion: 'mark',
  unidad_mixta: 'mark',
  triada: 'mark',
  densidad_conectores: 'mark',
  cifra_sin_cita: 'mark',
  verbatim_sin_comillas: 'mark',
  otro: 'mark',
  primera_persona: 'accept',
  mezcla_personas: 'accept',
  verbo_bloom: 'accept',
  ortografia: 'accept',
  texto_pegado: 'accept',
  forma_apa: 'accept',
  cita_fantasma: 'resolveGhosts',
  referencia_huerfana: 'none',
  encabezado: 'none',
  figura: 'autoCaption',
  tabla: 'autoCaption',
};

/**
 * Copy del botón masivo, y el UNICO lugar donde se decide.
 *
 * AGENTS.md §1 es el MARCO: los motores OBJETIVOS (ortografía, Bloom,
 * estructura, citas) ofrecen una corrección en bloque, y el motor
 * PROBABILÍSTICO (detector de IA) SOLO marca para revisar. Qué palabra usa cada
 * objetivo lo afinó T16, y lo que manda es esto:
 *
 * - "Aceptar" es la corrección OBJETIVA y POR HALLAZGO. Solo la usa la acción
 *   `accept`, la única que escribe el texto de alguien.
 * - Estructura redacta leyendas y Citas resuelve referencias ausentes: los dos
 *   mecanismos trabajan sobre TODO el documento, así que su rótulo nombra el
 *   mecanismo y su alcance ("Rotular todo el documento", "Resolver citas del
 *   documento"). Antes ambos se llamaban "Aceptar todas", lo que prometía
 *   corregir el texto de un hallazgo —que no es lo que pasa— y además
 *   contradecía al control de la aparición, en la misma tarjeta, que dice
 *   "Rotular todo" / "Resolver citas" y hace lo mismo.
 *
 * El MECANISMO lo elige `runGroupAction` (autoResolveGhosts, autoCaptionAll,
 * updateElementText); aquí vive solo la palabra.
 */
export const MASS_LABELS: Record<Exclude<SubtypeAction, 'none'>, string> = {
  accept: 'Aceptar todas',
  mark: 'Marcar todos',
  resolveGhosts: 'Resolver citas del documento',
  autoCaption: 'Rotular todo el documento',
};

/** `'none'` no tiene rotulo: sin correccion que ofrecer, no hay boton. */
const massLabelFor = (action: SubtypeAction): string =>
  action === 'none' ? '' : MASS_LABELS[action];

/**
 * El ORDEN de gravedad, y con él la severidad más grave de un grupo. Es la
 * única definición en el código, y vive aquí porque el hook es quien ordena los
 * subtipos y quien decide qué motor tiñe cada página del minimapa.
 * `EngineGroupCard` la importa para el badge: dos copias de esta tabla serían
 * dos verdades, y con un nivel nuevo en el vocabulario de severidad la del
 * badge se quedaría atrás mientras el orden cambiaba, sin que nada lo dijera.
 *
 * El tipo es lo que hace que agregar un nivel NO sea un cambio silencioso: la
 * compilación falla en esta tabla y en el `Record<AuditItem['severity'], string>`
 * del color del badge, que son los dos únicos sitios donde el vocabulario se
 * escribe.
 */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Acción masiva de la cabecera de un motor. El motor probabilístico NUNCA
 *  acepta: marca. Estructura rotula, no "corrige": las leyendas las redacta
 *  `autoCaptionAll`, no una cadena inventada aquí. */
const engineAction = (engine: EngineId): SubtypeAction => {
  if (engine === 'ai') return 'mark';
  if (engine === 'citations') return 'resolveGhosts';
  if (engine === 'structure') return 'autoCaption';
  return 'accept';
};

/* ── Agrupación por motor y por subtipo ────────────────────────────────────
   Función pura y fuera del hook: la usan las DOS listas que publica la API
   (`groups`, filtrada, y `allGroups`, completa). Que sea la misma función es
   lo que garantiza que un chip por motor y una fila del rack digan el mismo
   número: si se escribieran por separado, uno de los dos mentiría. */
function agruparHallazgos(visibles: AuditItem[]): EngineGroup[] {
  const porMotor = new Map<EngineId, AuditItem[]>();
  for (const it of visibles) {
    const arr = porMotor.get(it.category);
    if (arr) arr.push(it);
    else porMotor.set(it.category, [it]);
  }
  return ENGINE_ORDER.filter((e) => porMotor.has(e)).map((engine) => {
    const propios = porMotor.get(engine)!;
    const porSubtipo = new Map<string, AuditItem[]>();
    for (const it of propios) {
      const arr = porSubtipo.get(it.subtype);
      if (arr) arr.push(it);
      else porSubtipo.set(it.subtype, [it]);
    }
    const subgrupos: SubtypeGroup[] = [...porSubtipo.entries()].map(([key, susItems]) => {
      // Sin subtipo conocido, la acción es la del motor: un motor IA jamás
      // cae en 'accept' aunque el subtipo no esté en la tabla.
      let action = SUBTYPE_ACTION[key] || engineAction(engine);
      // Un grupo donde TODO es de solo lectura no ofrece acción. La portada es
      // el caso: `AGENTS.md` §1 dice que no se muta, así que un botón que
      // dice "aceptar" sobre material intocable es la forma más directa de
      // romperlo. Va acá y no en un sitio aparte para que `covered` y
      // `massLabel` lo respeten por derivación y no puedan mentir.
      if (action !== 'none' && susItems.every((i) => i.readOnly)) action = 'none';
      return {
        key: `${engine}:${key}`,
        label: rotuloDeSubtipo(key),
        items: susItems,
        action,
        massLabel: massLabelFor(action),
      };
    });
    subgrupos.sort((a, b) => {
      const ra = Math.min(...a.items.map((i) => SEVERITY_RANK[i.severity]));
      const rb = Math.min(...b.items.map((i) => SEVERITY_RANK[i.severity]));
      return ra - rb || b.items.length - a.items.length;
    });
    /* La acción en masa del MOTOR. Un motor cuyos hallazgos son todos de solo
       lectura no ofrece "Aceptar todas": el botón que promete aplicar sobre
       material intocable es la forma más directa de romper `AGENTS.md` §1. Con
       un documento cuya única falla sea la portada, la tarjeta de redacción
       mostraba el botón y al pulsarlo salía un toast de que no había nada. */
    /* La acción en masa del MOTOR. Un motor cuyos hallazgos son todos de solo
       lectura no ofrece "Aceptar todas": el botón que promete aplicar sobre
       material intocable es la forma más directa de romper `AGENTS.md` §1. Con
       un documento cuya única falla sea la portada, la tarjeta de redacción
       mostraba el botón y al pulsarlo salía un toast de que no había nada. */
    const massAction = propios.every((i) => i.readOnly) ? 'none' : engineAction(engine);
    return {
      engine,
      title: ENGINE_META[engine].title,
      chip: ENGINE_META[engine].chip,
      count: propios.length,
      criticalHigh: propios.filter((i) => i.severity === 'critical' || i.severity === 'high').length,
      groups: subgrupos,
      massAction,
      massLabel: massLabelFor(massAction),
      /* La MISMA regla que usa `runGroupAction` para decidir a quién toca,
         contada aquí: los subtipos que comparten la acción del motor. Publicar
         las dos mitades (estas y `count`) es lo que permite que la cabecera
         diga hasta dónde llega sin re-derivar nada. */
      covered: subgrupos
        .filter((g) => g.action === massAction)
        .reduce((n, g) => n + g.items.length, 0),
    };
  });
}

/* ── Fase ───────────────────────────────────────────────────────────────────
   Los H1 son las fases del documento (spec D1) y cada una tiene sus criterios.
   La vista las AGRUPA y las FILTRA; no las usa como eje de navegación, porque
   la revisión sigue siendo un párrafo a la vez (AGENTS.md §1).

   El conteo sale de los propios hallazgos, nunca de un re-derivado: si un día
   el rail y esta función contaran cada una por su lado, uno de los dos
   mentiría, que es el mismo modo de fallo que ya arregló `railPending.ts`. */

export interface PhaseGroup {
  key: string;
  label: string;
  items: AuditItem[];
  count: number;
  action: SubtypeAction;
  massLabel: string;
}

/** La acción que corresponde a un conjunto de hallazgos. */
function accionDeItems(items: AuditItem[]): SubtypeAction {
  // Lo de solo lectura no cuenta: no hay nada que aplicar. Un grupo con una
  // mezcla ofrece la acción de lo que SÍ se puede tocar.
  const aplicables = items.filter((i) => !i.readOnly);
  if (aplicables.length === 0) return 'none';
  // El motor IA es probabilístico y jamás se "acepta" (AGENTS.md §1).
  if (aplicables.every((i) => i.category === 'ai')) return 'mark';
  return 'accept';
}

/**
 * La acción de UN hallazgo, con la MISMA tabla que agrupa los subtipos
 * (`SUBTYPE_ACTION` + `engineAction`). Es la puerta que usa la superficie
 * secuencial para decidir qué botón ofrece el hallazgo seleccionado, y existe
 * para que la vista no re-derive el predicado: si el subtipo no está en la
 * tabla, cae en la acción del motor (nunca `accept` para IA). Un hallazgo de
 * solo lectura no ofrece acción —la portada no se muta (AGENTS.md §1)—.
 */
export function accionDeItem(item: AuditItem): SubtypeAction {
  if (item.readOnly) return 'none';
  return SUBTYPE_ACTION[item.subtype] || engineAction(item.category);
}

export function agruparHallazgosPorFase(items: AuditItem[]): PhaseGroup[] {
  const porFase = new Map<string, AuditItem[]>();
  for (const it of items) {
    const k = it.phase ?? 'global';
    const arr = porFase.get(k);
    if (arr) arr.push(it);
    else porFase.set(k, [it]);
  }
  const conocidas = PHASE_ORDER as readonly string[];
  const orden = [
    ...conocidas.filter((k) => porFase.has(k)),
    // Una fase que el backend agrego y este archivo no conoce: se muestra
    // con su etiqueta genérica en vez de desaparecer. Un hallazgo que no se
    // ve es peor que uno con el nombre feo.
    ...[...porFase.keys()].filter((k) => !conocidas.includes(k) && k !== 'global'),
    // Las reglas generales van al final: no pertenecen a ninguna fase.
    ...(porFase.has('global') ? ['global'] : []),
  ];
  return orden.map((key) => {
    const susItems = porFase.get(key)!;
    const action = accionDeItems(susItems);
    return {
      key,
      label: phaseLabel(key === 'global' ? null : key),
      items: susItems,
      count: susItems.length,
      action,
      massLabel: massLabelFor(action),
    };
  });
}

/** Una página dentro del rango real del documento. `totalPages` 0 (documento sin
 *  páginas) recorta a 1, no a 0: el 0 es "no hay páginas", no "la página 0". */
const clipPage = (page: number, totalPages: number): number => {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, totalPages));
};

export function useReviewWorkbench(): ReviewWorkbenchApi {
  const doc = useDocStore((s) => s.doc);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const aiIndices = useDocStore((s) => s.aiIndices);
  const setSelectedElementId = useDocStore((s) => s.setSelectedElementId);
  const setScrollTargetId = useDocStore((s) => s.setScrollTargetId);
  /* Los DOS canales de descarte. `dismiss` de esta vista y estas dos funciones
     tienen que ir juntos: una saca el hallazgo de la lista, la otra la burbuja y
     su subrayado, y son el mismo hallazgo. Los descartes viven en el STORE —no
     en un `useState` local— porque el rail cuenta la MISMA lista (`reviewItems`
     con `dismissedFindingIds`): si vivieran acá, la pantalla y el rail podrían
     discrepar. */
  const dismissComment = useDocStore((s) => s.dismissComment);
  const dismissedFindingIds = useDocStore((s) => s.dismissedFindingIds);
  const dismissFinding = useDocStore((s) => s.dismissFinding);
  const runAIReview = useDocStore((s) => s.runAIReview);
  const runProofreadBatch = useDocStore((s) => s.runProofreadBatch);
  const runCitationAudit = useDocStore((s) => s.runCitationAudit);
  const autoResolveGhosts = useDocStore((s) => s.autoResolveGhosts);
  const autoCaptionAll = useDocStore((s) => s.autoCaptionAll);
  const updateElementText = useDocStore((s) => s.updateElementText);
  const showToast = useDocStore((s) => s.showToast);

  const { totalPages, pages, pageOf } = usePageIndex();
  const [filter, setFilter] = useState<EngineFilter>('all');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [viewMode, setViewMode] = useState<'focus' | 'canvas' | 'ia'>('focus');
  const [openEngines, setOpenEngines] = useState<EngineId[]>([]);
  const [openSubtypes, setOpenSubtypes] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markedIds, setMarkedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  /* Los GLOBOS no se miden acá: se miden en el store, porque se disparan al
     abrir un documento y sobreviven a que esta vista se desmonte. Un `useState`
     local de "algo corre" es un flag que solo sabe de lo que él encendió, y por
     eso decía que no había corrido nada mientras los tres globos andaban. */
  const isAuditing = useDocStore((s) => s.isAuditing);
  const motoresAuditando = useDocStore((s) => s.motoresAuditando);
  const seeded = useRef(false);

  /* La página actual SIEMPRE vive en el rango real del documento. Es un
     `useState` crudo, y el rango se mueve solo: una edición que fusiona
     elementos, o un documento que encoge bajo la vista, dejaban "Página 2 de
     1" y una flecha anterior que caminaba por páginas que ya no existen. */
  useEffect(() => {
    setCurrentPage((prev) => clipPage(prev, totalPages));
  }, [totalPages]);

  /* Último escaneo observado por motor (dentro de esta vista): guarda los
     resultados de store en el momento de correr. Si los refs no cambiaron,
     ese sigue siendo el último resultado (éxito o fallo); si cambiaron, un
     éxito posterior — desde cualquier vista — limpia el fallo registrado. */
  const lastScanRef = useRef<Partial<Record<ScanEngineId, { ok: boolean; snap: unknown }>>>({});

  const elements = useMemo(() => doc?.elements || [], [doc]);
  const parrafos = useMemo(() => contarParrafos(elements), [elements]);

  /* La lista la construye `reviewItems` de `lib/auditItems` — la MISMA función
     que cuenta el rail: lo que esta vista abre y lo que el rail promete tienen
     que ser el mismo conjunto, o el punto verde de Revisión & IA miente.
     `pageOf` y los descartes del store son lo único que esta vista le aporta:
     los descartes son del documento, no de la vista, y por eso viven en el
     store y no en un `useState` que se perdía al desmontar. */
  const items = useMemo<AuditItem[]>(
    () => reviewItems(
      { elements, reviewResult, proofreadFindings, citationAuditResult },
      pageOf,
      dismissedFindingIds,
    ),
    [reviewResult, proofreadFindings, citationAuditResult, elements, dismissedFindingIds, pageOf],
  );

  /* El resumen COMPLETO, sin filtro: es lo que pinta los chips. El conjunto
     estrecho sale de aquí, no al revés, para que los dos coincidan siempre. */
  const allGroups = useMemo(() => agruparHallazgos(items), [items]);

  /* Lo que el FILTRO deja ver, en una sola expresión. La usan los grupos
     estrechos, `nextFinding` y el `visibleCount` que la vista usa para no
     dejar "Siguiente hallazgo" encendido sin destino: si el predicado estuviera
     escrito en la vista también, cambiarlo aquí encendería el botón y lo
     dejaría inerte, que es el defecto que esta cuenta existe para evitar.

     El filtro de FASE se intersecta acá y no en la vista, por el mismo motivo:
     dos filtros escritos en dos sitios se desincronizan. `allGroups` sigue
     siendo sin filtro, para que los chips de motor no pierdan a los demás
     motores al filtrar por fase. */
  const visibles = useMemo(() => {
    // `items` ya viene sin los descartes, así que acá solo se acota.
    let out = items;
    if (filter !== 'all') out = out.filter((i) => i.category === filter);
    if (phaseFilter !== 'all') out = out.filter((i) => (i.phase ?? 'global') === phaseFilter);
    return out;
  }, [items, filter, phaseFilter]);

  const groups = useMemo(
    () => (filter === 'all' && phaseFilter === 'all' ? allGroups : agruparHallazgos(visibles)),
    [allGroups, visibles, filter, phaseFilter],
  );

  /* Los chips de fase, derivados de los hallazgos COMPLETOS y sin filtro: si
     un chip desapareciera al activarlo, no habría forma de desactivarlo. */
  const allPhases = useMemo(
    () => agruparHallazgosPorFase(items).map((g) => ({ key: g.key, label: g.label, pending: g.count })),
    [items],
  );

  /* Los bloques con hallazgo, en el mismo conjunto que cuenta `visibleCount`. */
  const highlightIds = useMemo(
    () => new Set(visibles.map((i) => i.element_id).filter(Boolean)),
    [visibles],
  );

  /* La siembra es POR DOCUMENTO, y el documento se identifica por su sesión,
     no por la identidad del objeto: `updateElementText` (aceptar una
     corrección) reemplaza el `doc` entero en el store, así que con `[doc]`
     cada corrección aceptada borraba la siembra y el panel volvía a
     desplegarse solo, tirándose abajo lo que la persona acababa de abrir.
     Un documento nuevo es otra `session_id` (las pestañas del Explorador de
     Proyecto son sesiones distintas), así que reiniciar por `session_id`
     conserva el comportamiento de "otro documento, otros grupos" sin el
     efecto colateral. */
  const sessionId = doc?.session_id;
  useEffect(() => {
    seeded.current = false;
    /* Las marcas SON de un documento. Un id de hallazgo es estable dentro de
       una sesión (id de elemento + tipo + rango, el texto citado, la
       referencia), así que sobreviven a un reescaneo del MISMO documento —que es
       lo que deben hacer— pero no tienen nada que ver con los hallazgos de otro.
       Los descartes NO se reinician acá: viven en el store (`dismissedFindingIds`)
       porque son la lista que también cuenta el rail, y un id de otra sesión no
       colisiona con el de ésta. */
    setMarkedIds([]);
    /* El filtro de FASE también es de un documento. Un chip de "Objetivos"
       activo en la tesis anterior deja el rack vacío al abrir la siguiente, y
       la fila de chips no se renderiza si el documento nuevo no tiene
       hallazgos de fase: sin salida visible, un callejón sin salida. El
       filtro de MOTOR no se reinicia y es un problema real preexistente, pero
       no lo toco acá: cambiarlo es otro cambio de comportamiento. */
    setPhaseFilter('all');
  }, [sessionId]);

  /* Solo el grupo más crítico abre por defecto, una vez por sesión de datos. */
  useEffect(() => {
    if (seeded.current || !groups.length) return;
    seeded.current = true;
    const masCritico = [...groups].sort(
      (a, b) => b.criticalHigh - a.criticalHigh || b.count - a.count,
    )[0];
    if (masCritico) setOpenEngines([masCritico.engine]);
  }, [groups]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const item = items.find((i) => i.id === id);
      if (item?.element_id) {
        setSelectedElementId(item.element_id);
        setScrollTargetId(item.element_id);
      }
    },
    [items, setSelectedElementId, setScrollTargetId],
  );

  const goToPage = useCallback(
    (page: number) => {
      // "Página X de N" se lee de `currentPage`: sin recorte, un clic fuera de
      // rango dejaría la lectura apuntando a una hoja que no existe.
      const destino = clipPage(page, totalPages);
      const el = pages[destino - 1]?.find((e) => e?.id && e.type !== 'page_break');
      if (el) {
        setSelectedElementId(el.id);
        setScrollTargetId(el.id);
      }
      setCurrentPage(destino);
    },
    [pages, totalPages, setSelectedElementId, setScrollTargetId],
  );

  /* Elegir un hallazgo: seleccionarlo Y abrir el grupo donde vive.
   *
   * Las dos cosas van juntas, y por eso viven juntas. Seleccionar sin abrir
   * deja la tarjeta de lectura mostrando un párrafo mientras el rack sigue
   * contraído: la pantalla dice dos cosas a la vez, que es exactamente lo que
   * `AGENTS.md` §1 prohíbe ("el rail no puede contradecir la pantalla a la que
   * lleva"). Además, sin el grupo abierto el detalle no pinta las flechas de
   * aparición, así que la persona lee un hallazgo del que no puede navegar. */
  const elegirHallazgo = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setOpenEngines((prev) => (prev.includes(item.category) ? prev : [...prev, item.category]));
    const subkey = `${item.category}:${item.subtype}`;
    setOpenSubtypes((prev) => (prev.includes(subkey) ? prev : [...prev, subkey]));
    select(id);
  }, [items, select]);

  /* La SIEMBRA de la lectura: si hay hallazgos a la vista y nada está
   * seleccionado, se elige el primero.
   *
   * Antes la pantalla arrancaba vacía. El mensaje "Sin hallazgo seleccionado"
   * es honesto sobre su causa —no hay nada seleccionado— pero con un archivo
   * que tiene muchas correcciones, lo primero que veía la persona era un
   * centro en blanco con una instrucción, y la conclusión razonable era
   * "está roto" o "no encontró nada". Ninguna de las dos era cierta, y las
   * dos hacen que la persona empiece a buscar el problema en el programa.
   *
   * La clave es que NO es un efecto de montaje. Las auditorías corren en
   * segundo plano (`AGENTS.md` §2), así que al abrir el paso 5 la lista
   * todavía no está: una siembra que solo mira el montaje deja la pantalla
   * en blanco justo en el caso que la dispara. Por eso mira `visibles` y se
   * vuelve a ejecutar cuando llega.
   *
   * Y sembra DENTRO de los grupos que ya están abiertos, sin abrirlos. La
   * regla "abre solo el grupo más crítico" es una decisión deliberada de la
   * pantalla, y esta siembra no la sustituye: la siembra no le abre un segundo
   * grupo, se desarma. Lo que hace es que la tarjeta de lectura muestre un
   * hallazgo del grupo que el rack tiene a la vista —que es lo que evita que
   * la pantalla diga dos cosas a la vez— y si no hay ninguno abierto, no
   * siembra: antes un centro con instrucción que un texto de un grupo
   * escondido.
   *
   * Y NO pisa lo que la persona ya está leyendo: si hay selección, no hace
   * nada. Resembrar siempre —por ejemplo cuando una auditoría termina y
   * agrega hallazgos— le saltaría el contenido bajo los pies, que es peor
   * que arrancar vacío. */
  useEffect(() => {
    if (selectedId || !visibles.length || !openEngines.length) return;
    const porPagina = [...visibles].sort(
      (a, b) => (a.pageNumber ?? 999) - (b.pageNumber ?? 999),
    );
    const primero = porPagina.find((i) => openEngines.includes(i.category));
    if (primero) select(primero.id);
  }, [visibles, selectedId, openEngines, select]);

  const nextFinding = useCallback(() => {
    // "Siguiente hallazgo" recorre lo que el filtro deja ver: saltar a un
    // hallazgo de un motor apagado sería aterrizar fuera de la lista. Es el
    // MISMO conjunto que cuenta `visibleCount`.
    if (!visibles.length) return;
    const ordenada = [...visibles].sort((a, b) => (a.pageNumber ?? 999) - (b.pageNumber ?? 999));
    const i = ordenada.findIndex((x) => x.id === selectedId);
    const siguiente = ordenada[(i + 1) % ordenada.length];
    /* Por `elegirHallazgo`, no a mano: seleccionar y abrir el grupo es una sola
       decisión, y duplicarla acá es la forma de que las dos cosas se separen
       en el próximo cambio (y fue justo lo que pasó con la siembra). */
    elegirHallazgo(siguiente.id);
    // `pageOf` solo devuelve páginas del índice, así que el recorte no cambia
    // el resultado HOY: es la misma defensa que aplica `goToPage`, puesta aquí
    // para que ningún camino que salta de página quede sin recortar.
    if (siguiente.pageNumber) setCurrentPage(clipPage(siguiente.pageNumber, totalPages));
  }, [visibles, selectedId, elegirHallazgo, totalPages]);

  /* La capa EFECTIVA vive en `useReviewActions`: escribir en el documento,
     llamar a la red, descartar por los dos canales. Este archivo se queda con
     lo que se DERIVA, que es lo que se puede probar sin DOM. El contrato
     público no cambia: los cinco verbos y `isApplying` se publican igual, y
     quien importa este hook no tiene que saber que ahora hay dos archivos. */
  const { acceptOne, acceptMany, markForReview, runGroupAction, dismiss, isApplying } =
    useReviewActions(
      { doc, updateElementText, autoResolveGhosts, autoCaptionAll, dismissComment, dismissFinding, showToast, accionDeItem },
      { setMarkedIds, setSelectedId },
    );

  const scanAll = useCallback(async () => {
    setIsScanning(true);
    showToast('Iniciando escaneo integral con IA y heurística local…', 'info');
    try {
      /* Los motores del store tragan sus errores internos: además del catch,
         comprobamos si cada motor dejó resultados NUEVOS en el store. Sin esa
         comprobación, un fallo total parecería un escaneo exitoso. */
      const before = {
        review: useDocStore.getState().reviewResult,
        findings: useDocStore.getState().proofreadFindings,
        indices: useDocStore.getState().aiIndices,
        citations: useDocStore.getState().citationAuditResult,
      };
      const settleEngine = async (
        run: () => Promise<void>,
        producedFreshResult: () => boolean,
      ): Promise<void> => {
        await run();
        if (!producedFreshResult()) throw new Error('sin resultados nuevos');
      };

      const settled = await Promise.allSettled([
        settleEngine(runAIReview, () => useDocStore.getState().reviewResult !== before.review),
        settleEngine(runProofreadBatch, () => {
          const state = useDocStore.getState();
          return state.proofreadFindings !== before.findings || state.aiIndices !== before.indices;
        }),
        settleEngine(runCitationAudit, () => useDocStore.getState().citationAuditResult !== before.citations),
      ]);

      const outcomes: EngineScanOutcome[] = SCAN_ENGINES.map((engine, index) => {
        const result = settled[index];
        return {
          ...engine,
          ok: result.status === 'fulfilled',
          reason: result.status === 'rejected' ? toReason(result.reason) : undefined,
        };
      });

      /* Registrar el último resultado observado por motor: los motores OK
         actualizan sus resultados y un fallo deja de aplicar en cuanto un
         éxito posterior cambie el resultado en el store. */
      const state = useDocStore.getState();
      outcomes.forEach((outcome) => {
        const snap =
          outcome.id === 'ai'
            ? state.reviewResult
            : outcome.id === 'proofread'
              ? ([state.proofreadFindings, state.aiIndices] as const)
              : state.citationAuditResult;
        lastScanRef.current[outcome.id] = { ok: outcome.ok, snap };
      });

      const toast = summarizeScanOutcomes(outcomes);
      showToast(toast.message, toast.type);
    } finally {
      setIsScanning(false);
    }
  }, [runAIReview, runProofreadBatch, runCitationAudit, showToast]);

  /* ── Estado honesto por motor ───────────────────────────────────────────
     "Sin datos" = el motor nunca corrió en esta sesión, O su último
     resultado fue un fallo. Un resultado real — aunque malo — se muestra
     tal cual; solo se elimina el número inventado. */
  const snapMatches = (id: ScanEngineId, snap: unknown): boolean => {
    if (id === 'ai') return snap === reviewResult;
    if (id === 'citations') return snap === citationAuditResult;
    const snapProofread = snap as readonly [typeof proofreadFindings, typeof aiIndices];
    return snapProofread[0] === proofreadFindings && snapProofread[1] === aiIndices;
  };

  const lastRunState = (id: ScanEngineId): 'ok' | 'failed' | null => {
    const record = lastScanRef.current[id];
    if (!record || !snapMatches(id, record.snap)) return null;
    return record.ok ? 'ok' : 'failed';
  };

  const threeEnginesRan =
    reviewResult !== null &&
    lastRunState('ai') !== 'failed' &&
    (aiIndices !== null || proofreadFindings.length > 0) &&
    lastRunState('proofread') !== 'failed' &&
    citationAuditResult !== null &&
    lastRunState('citations') !== 'failed';

  const total = items.length;
  /* `metrics.critical` se fue: lo leía una prueba y ninguna vista. El conteo
     de gravedad que sí se usa vive donde se ve —`EngineGroup.criticalHigh`, que
     la tarjeta de motor pinta y la siembra de apertura ordena— y duplicarlo acá
     era una segunda cuenta de lo mismo que nadie mostraba. */

  return {
    items,
    groups,
    allGroups,
    hasFindings: items.length > 0,
    visibleCount: visibles.length,
    filterLabel: filter === 'all' ? null : ENGINE_META[filter].title,
    highlightIds,
    filter,
    setFilter,
    phaseFilter,
    setPhaseFilter,
    allPhases,
    totalPages,
    currentPage,
    goToPage,
    selected,
    select,
    elegirHallazgo,
    nextFinding,
    openEngines,
    setOpenEngines,
    openSubtypes,
    setOpenSubtypes,
    acceptOne,
    acceptMany,
    markForReview,
    runGroupAction,
    dismiss,
    markedIds,
    scanAll,
    isScanning,
    isAuditing,
    motoresAuditando,
    isApplying,
    metrics: {
      total,
      compliance: threeEnginesRan ? cumplimiento(total, parrafos) : null,
    },
    viewMode,
    setViewMode,
  };
}
