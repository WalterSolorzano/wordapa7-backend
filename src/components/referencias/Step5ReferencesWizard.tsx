/* WordAPA7 — Paso 4: Reference Studio (Rediseño de 2 Columnas + Progressive Disclosure)
   Criterios del documento de diseño:
   - Layout de 2 columnas (Lista Agrupada + Detalle) eliminando el formulario permanente.
   - Modal flotante "+ Nueva Referencia" (DOI / Manual) a la demanda.
   - Agrupación por estado: Válidas (verificadas DOI), Sin Verificar (zombie data / metadatos incompletos), Citas sin fuente ("En texto, no en biblio").
   - Badges accionables con tooltip ("Insertar en pág. X").
   - Paleta oficial WordAPA7 (tokens CSS, blanco papel) y cero emojis. */

import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { useDocStore } from '../../store/useDocStore';
import {
  Search, Plus, CheckCircle2, AlertTriangle, Link2, Loader2,
  Trash2, Copy, Check, Pencil, BadgeCheck,
  ArrowRight, ArrowDownAZ, X, HelpCircle, FileText
} from 'lucide-react';
import { sortReferences, detectCitationStyle } from '../../api/backend';
import { ReferenciaModel } from '../../types';
import {
  ROTULO_DE_ESTADO,
  TONO_DE_ESTADO,
  diagnosticoDeReferencia,
  expresionDeReferencias,
  parrafosQueCitan,
  particionarReferencias,
  type DiagnosticoReferencia,
} from '../../lib/referencias';
import { EditorialMascot } from '../layout/EditorialMascot';
import { EstadoVacio } from '../shared/EstadoVacio';
import { ReferenceRailFilter, ReferenceFilterType } from './ReferenceRailFilter';
import { ReferenceCatalogItem } from './ReferenceCatalogItem';
import { ManuscriptMentionsAccordion } from './ManuscriptMentionsAccordion';
import { ReferenceEditModal } from './ReferenceEditModal';
import { ReferenciaLinea } from './ReferenciaLinea';
import { APA_LISTA, APA_ENTRADA } from '../../lib/apaLayout';
import { formatearReferencia } from '../../lib/apaApi';
import { getPageGeometry, PT_TO_PX } from '../../lib/pageGeometry';
import type { PageRules } from '../layout/PaperCanvas';
import { estimarAltoReferencia, paginarReferencias } from '../../lib/paginarBibliografia';

/** Los grupos del catálogo, como pestañas cerradas: una lista a la vez.
 *  `sincitar` es un EJE DISTINTO del estado (una referencia verificada puede no
 *  citarse nunca), por eso convive con las otras pestañas y no las reemplaza. */
type GroupTab = 'verificadas' | 'pendientes' | 'sincitar' | 'texto';

/**
 * POR QUÉ esta referencia está en el estado en que está.
 *
 * Tres ramas, y son tres hechos distintos:
 *
 *  - Le falta un campo: se nombran los campos. Sin autores o sin título no hay
 *    nada que escribir en el documento, y eso es un problema de captura.
 *  - Tiene todo y no está verificada: el motivo NO es un campo que falta, es
 *    que nadie la contrastó contra una fuente. Agregarla a mano no la verifica,
 *    y por eso el texto nombra `fuente_verificacion` cuando existe: "contrastada
 *    contra el DOI" y "nadie la contrastó" son afirmaciones distintas.
 *  - Está verificada: no hay nada que reportar. Se nombra la fuente contra la
 *    que se contrastó y se dice, porque una ficha sin explanation no se puede
 *    auditar después.
 */
function porQueDeLaReferencia(
  diagnostico: DiagnosticoReferencia,
  ref: ReferenciaModel | null,
): string {
  if (diagnostico.faltantes.length > 0) {
    const campos = diagnostico.faltantes.join(' y ');
    return `Faltan ${campos}: sin ${campos} no hay nada que escribir en el documento.`;
  }
  if (diagnostico.estado === 'verificada') {
    const fuente = ref?.fuente_verificacion?.trim();
    return fuente
      ? `Contrastada contra ${fuente}.`
      : 'Contrastada contra una fuente externa.';
  }
  return 'Nadie la contrastó contra una fuente: tiene los datos, pero su exactitud está sin comprobar.';
}

/** El texto completo de una entrada, en el mismo orden que la hoja. */
function textoDeReferencia(r: ReferenciaModel): string {
  if (r.formatted_apa) return r.formatted_apa;
  if (r.raw_text) return r.raw_text;
  return [r.authors?.join(', '), r.year ? `(${r.year})` : '', r.title]
    .filter(Boolean)
    .join(' ');
}

/**
 * La bibliografía como la página que va al documento: hojas carta reales.
 *
 * Antes era una tarjeta de 720px sin alto de página ni saltos: no se veía ni
 * que fuera carta ni dónde terminaba una hoja. Aquí cada hoja usa la geometría
 * del propio documento (`getPageGeometry`: 8.5x11in, margen de 1in, doble
 * espacio) y el contenido se reparte sin partir una entrada; cuando pasa de una
 * hoja, el salto se dibuja.
 */
const HojaBibliografia: React.FC<{
  referencias: ReferenciaModel[];
  rules?: PageRules;
}> = ({ referencias, rules }) => {
  const geom = useMemo(() => getPageGeometry(rules || {}), [rules]);
  const [alturas, setAlturas] = useState<number[]>([]);
  const medidorRef = useRef<HTMLDivElement | null>(null);

  /* Se miden las entradas de verdad a la anchura útil de la hoja. En las
     pruebas (jsdom) la medida es 0 y entra la estimación determinista, así que
     el reparto no depende del navegador. */
  useLayoutEffect(() => {
    const nodos = medidorRef.current?.children;
    if (!nodos || nodos.length === 0) return;
    setAlturas(
      Array.from(nodos).map((n) => (n as HTMLElement).getBoundingClientRect().height),
    );
  }, [referencias, geom.contentW]);

  const fontPx = PT_TO_PX(rules?.font_size_pt ?? 12);
  const alturasEfectivas = useMemo(
    () =>
      referencias.map((r, i) => {
        const medida = alturas[i];
        if (medida && medida > 0) return medida;
        return estimarAltoReferencia(textoDeReferencia(r), geom.contentW, geom.lineHeightPx, fontPx);
      }),
    [referencias, alturas, geom, fontPx],
  );

  const paginas = useMemo(
    () => paginarReferencias(referencias, alturasEfectivas, geom.contentH),
    [referencias, alturasEfectivas, geom.contentH],
  );

  return (
    <>
      {/* Capa de medición: invisible, a la anchura útil real. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
          left: '-99999px', top: 0, width: geom.contentW,
        }}
      >
        {/* El `ref` va en el bloque que contiene UNA entrada por hijo: si vive en
            el wrapper, `medidorRef.current.children` devuelve un solo nodo (la
            lista entera) y `alturas` queda como [altoTotal], con lo que el
            paginador cree que la primera referencia mide toda la bibliografía. */}
        <div ref={medidorRef} style={{ ...APA_LISTA }}>
          {referencias.map((r) => <ReferenciaLinea key={r.id} referencia={r} />)}
        </div>
      </div>

      {paginas.map((pagina, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <div
              data-testid="salto-de-pagina"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                width: '100%', color: 'var(--color-text-tertiary)',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}
            >
              <span style={{ flex: 1, height: '1px', background: 'var(--color-border-subtle)' }} />
              <span>Salto de página</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--color-border-subtle)' }} />
            </div>
          )}
          <article
            data-testid="bibliografia-hoja"
            style={{
              width: geom.pageW, maxWidth: '100%', minHeight: geom.pageH,
              boxSizing: 'border-box', padding: geom.marginPx,
              backgroundColor: 'var(--paper-white)', color: 'var(--paper-ink)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ ...APA_LISTA }}>
              {pagina.map((r) => <ReferenciaLinea key={r.id} referencia={r} />)}
            </div>
          </article>
        </React.Fragment>
      ))}
    </>
  );
};

export const Step5ReferencesWizard: React.FC = () => {
  const {
    doc, references, selectedReferenceId, setSelectedReferenceId, setSelectedElementId,
    addReference, removeReference, updateReferences, resolveDoiReference, resolveDoisBlock, isLoading,
    verifyReferences,
    citationAuditResult, runCitationAudit, resolveGhostCitation, showToast,
    setScrollTargetId, rules,
  } = useDocStore();

  const [doiQuery, setDoiQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMode, setAddMode] = useState<'doi' | 'manual'>('doi');
  const [resolvingGhostIdx, setResolvingGhostIdx] = useState<number | null>(null);

  // Formulario manual guiado dentro de Modal
  const [refType, setRefType] = useState<'journal' | 'book' | 'thesis' | 'web'>('journal');
  const tipoSeleccionado =
    refType === 'journal' ? 'articulo' : refType === 'book' ? 'libro' : refType === 'thesis' ? 'tesis' : 'web';
  const [formAuthors, setFormAuthors] = useState('');
  const [formYear, setFormYear] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formDoi, setFormDoi] = useState('');

  /* Pestaña activa del catálogo. Los tres grupos —Verificadas, Pendientes y
     "En texto, no en biblio"— dejaron de ser encabezados plegables apilados
     (donde todo el texto competía a la vez) para ser pestañas cerradas: se lee
     UNA lista a la vez y la categoría se elige, no se adivina. */
  const [activeGroup, setActiveGroup] = useState<GroupTab>('verificadas');

  // Filtro de rail, buscador del directorio y modal de edición
  const [railFilter, setRailFilter] = useState<ReferenceFilterType>('all');
  const [query, setQuery] = useState('');
  const [editingRef, setEditingRef] = useState<ReferenciaModel | null>(null);

  // Reference activa
  const selectedRef = useMemo(() => {
    return references.find((r) => r.id === selectedReferenceId) || null;
  }, [references, selectedReferenceId]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auditoría al entrar
  useEffect(() => {
    if (!citationAuditResult && doc) {
      runCitationAudit();
    }
  }, [citationAuditResult, doc, runCitationAudit]);

  /* Estilo de cita del cuerpo. Es un AVISO, no una conversión: unificar estilos
     exige los metadatos de cada fuente y eso no vive acá. Si la consulta falla,
     el aviso simplemente no aparece: es accesorio, no bloquea la pantalla. */
  const [estiloMezclado, setEstiloMezclado] = useState(false);
  useEffect(() => {
    if (!doc?.session_id) return;
    let activo = true;
    detectCitationStyle(doc.session_id)
      .then((r) => { if (activo) setEstiloMezclado(Boolean(r?.mixed)); })
      .catch(() => { if (activo) setEstiloMezclado(false); });
    return () => { activo = false; };
  }, [doc?.session_id]);

  const [reordering, setReordering] = useState(false);
  /* Reordenar es una operación de LISTA: el orden lo calcula el backend con la
     clave APA respetando las referencias que el usuario tiene cargadas en el cliente.
     Si el backend devolviera vacío o fallara, se usa fallback local para jamás
     borrar las referencias de la pantalla. */
  const handleReorder = async () => {
    if (!references.length || reordering) return;
    setReordering(true);
    const ordenarLocal = () => {
      const clave = (r: ReferenciaModel) =>
        ((r.authors?.[0] || '').split(',')[0] || r.title || r.raw_text || '').trim().toLowerCase();
      return [...references].sort((a, b) => clave(a).localeCompare(clave(b), 'es'));
    };

    try {
      if (doc?.session_id) {
        const ordenadas = await sortReferences(doc.session_id, references);
        if (ordenadas && ordenadas.length > 0) {
          updateReferences(ordenadas);
        } else {
          updateReferences(ordenarLocal());
        }
      } else {
        updateReferences(ordenarLocal());
      }
      showToast('Bibliografía reordenada alfabéticamente', 'success');
    } catch {
      updateReferences(ordenarLocal());
      showToast('Bibliografía reordenada alfabéticamente', 'success');
    } finally {
      setReordering(false);
    }
  };


  /* Verificar es una operacion de LISTA, como reordenar: contrasta cada ficha
     contra su fuente y deja el veredicto en el store. El spinner es local para
     no bloquear toda la pantalla con el `isLoading` global. */
  const [verificando, setVerificando] = useState(false);
  const handleVerificarBibliografia = async () => {
    if (!references.length || verificando) return;
    setVerificando(true);
    try {
      await verifyReferences();
    } finally {
      setVerificando(false);
    }
  };

  const ghosts = citationAuditResult?.ghost_citations || [];
  const orphans = citationAuditResult?.orphan_references || [];

  /* El conjunto de HUÉRFANAS sale del backend y de nada más.
   *
   * `citation_matcher.py:162` calcula `never_cited` y devuelve el modelo
   * completo de cada referencia en `orphan_references`. La versión vieja de esta
   * pantalla re-derivaba lo mismo en el cliente con
   * `s.includes(refItem.authors?.[0] || '---')`, y eso tenía dos fallos: con
   * autores vacíos comparaba contra la cadena `'---'`, y con autores presentes
   * comparaba el NOMBRE COMPLETO contra un texto donde lo que está es el
   * apellido. Re-derivarlo acá además de ser otra verdad, sería una sin la
   * normalización sin tildes y sin el emparejamiento tolerante del backend. */
  /* `undefined` —no un conjunto vacío— cuando la auditoría NO corrió. Es la
   * diferencia entre "miré y no encontré" y "nadie miró", y un conjunto vacío
   * no la expresa: `diagnosticoDeReferencia` con un `Set` devuelve siempre un
   * booleano, y entonces la pantalla afirma que la referencia está citada cuando
   * lo único que hay es que nadie buscó. */
  const huerfanas = useMemo(() => {
    if (!citationAuditResult) return undefined;
    const ids = new Set<string>();
    for (const o of orphans) {
      /* El backend manda el modelo entero, así que el `id` está. La defensiva
         con la cadena es porque `ghostText` ya la tenía y una respuesta vieja
         puede venir como texto: sin `id` no hay dato, y una referencia sin dato
         no se marca. */
      const id = typeof o === 'string' ? '' : (o?.id ?? '');
      if (id) ids.add(String(id));
    }
    return ids;
  }, [orphans, citationAuditResult]);

  /* Las dos listas salen de `src/lib/referencias.ts`, no de un `useMemo` con
     heurísticas. La razón es la misma que movió los contextos de figura a
     `lib/figuras.ts` en F4: una verdad que vive dentro de un `useMemo` no se
     puede probar, y la segunda copia diverge el primer día que cambia. */
  const { verificadas: validReferences, pendientes: unverifiedReferences } = useMemo(
    () => particionarReferencias(references),
    [references],
  );

  const diagnostico = useMemo(
    () => (selectedRef ? diagnosticoDeReferencia(selectedRef, { huerfanas }) : null),
    [selectedRef, huerfanas],
  );

  /* El buscador filtra las tres listas por autor, año, título o fuente. Es un
     filtro de LECTURA: no toca `references`, así que lo que el documento recibe
     no depende de lo que alguien escriba acá. */
  const queryNorm = query.trim().toLowerCase();
  const coincide = (r: ReferenciaModel) =>
    !queryNorm ||
    [(r.title || ''), (r.authors || []).join(' '), (r.year || ''), (r.source || '')]
      .join(' ').toLowerCase().includes(queryNorm);
  const validFiltradas = validReferences.filter(coincide);
  const pendientesFiltradas = unverifiedReferences.filter(coincide);
  /* `sincitar` cruza el eje del estado: una referencia verificada puede no
     citarse en el cuerpo. El conjunto lo manda el backend (`huerfanas`) y es
     `undefined` cuando la auditoría no corrió —por eso la pestaña solo existe
     cuando hay un dato, y no como una lista vacía que finge haber mirado. */
  const sinCitarFiltradas = huerfanas
    ? references.filter((r) => huerfanas.has(String(r.id))).filter(coincide)
    : null;
  const ghostsFiltrados = queryNorm
    ? ghosts.filter((g: unknown) => ghostText(g).toLowerCase().includes(queryNorm))
    : ghosts;

  /* Las tres pestañas con su conteo. Una sola está activa: la lista lee UNA
     categoría a la vez, y el rail decide cuáles están disponibles. Las
     etiquetas y los conteos son los mismos del rail y del vacío de cada
     grupo: una verdad, no tres copias. */
  const tabs: { id: GroupTab; titulo: string; detalle: string; conteo: number; Icon: typeof CheckCircle2 }[] = [
    { id: 'verificadas', titulo: 'Verificadas', detalle: 'Contrastadas contra una fuente real.', conteo: validFiltradas.length, Icon: CheckCircle2 },
    { id: 'pendientes', titulo: 'Pendientes', detalle: 'Faltan datos o falta contrastarlas contra una fuente.', conteo: pendientesFiltradas.length, Icon: HelpCircle },
    /* La pestaña existe sólo cuando la auditoría corrió (`sinCitarFiltradas`
       null si no). Un grupo vacío que nadie pudo llenar sería otra afirmación
       sin dato. */
    ...(sinCitarFiltradas
      ? [{ id: 'sincitar' as const, titulo: 'Sin citar', detalle: 'Están en la bibliografía pero no se citan en el cuerpo.', conteo: sinCitarFiltradas.length, Icon: FileText }]
      : []),
    { id: 'texto', titulo: 'En texto, no en biblio', detalle: 'Citas que aparecen en el cuerpo y no tienen ficha.', conteo: ghostsFiltrados.length, Icon: AlertTriangle },
  ];
  const tabsVisibles = tabs.filter(
    (t) =>
      railFilter === 'all' ||
      (railFilter === 'verified' && t.id === 'verificadas') ||
      (railFilter === 'issues' && t.id !== 'verificadas'),
  );

  /* El badge del rail cuenta ELEMENTOS ÚNICOS bajo "por revisar": referencias
     sin verificar ∪ referencias sin citar, más las citas del texto sin ficha
     (que no son fichas). Una referencia que está sin verificar Y sin citar se
     cuenta UNA vez, así el badge nunca miente por sumar dos vistas del mismo
     dato. */
  const issuesCount = (() => {
    const ids = new Set<string>(unverifiedReferences.map((r) => r.id));
    if (huerfanas) for (const r of references) if (huerfanas.has(String(r.id))) ids.add(r.id);
    return ids.size + ghosts.length;
  })();
  const tabActiva: GroupTab = tabsVisibles.some((t) => t.id === activeGroup)
    ? activeGroup
    : tabsVisibles[0]?.id ?? 'verificadas';

  /* La bibliografía completa es la página del documento, y en APA 7 va en
     orden alfabético por el apellido del primer autor (o por el título si no
     hay autor). El catálogo ya ordena cada grupo con `particionarReferencias`;
     acá el orden es el del documento, que es otra verdad. */
  const referenciasOrdenadas = useMemo(() => {
    const clave = (r: ReferenciaModel) =>
      ((r.authors?.[0] || '').split(',')[0] || r.title || '').trim().toLowerCase();
    return [...references].sort((a, b) => clave(a).localeCompare(clave(b), 'es'));
  }, [references]);

  const handleResolveDoi = async () => {
    if (!doiQuery.trim()) return;
    const query = doiQuery.trim();
    setDoiQuery('');
    /* UN campo, DOS informes. Lo que decide la rama no es el tamaño del código
     * que se ejecuta sino qué le llega a la persona.
     *
     *  - Una sola línea es el caso de siempre, y conserva el mensaje del
     *    servidor: "eso no parece un DOI" con la forma que acepta
     *    (`python/routers/references.py:102-106`). Por un campo mal pegado, un
     *    contador no dice nada.
     *  - Varias líneas van al endpoint de LOTE, que deduplica por DOI
     *    normalizado y reporta lo que falló UNO POR UNO (`references.py:42-51`).
     *    Un DOI malo no puede tirar abajo los otros diecinueve: perder veinte
     *    referencias por un typo es la peor falla posible de un pegado masivo.
     *
     * Dos endpoints, un solo camino: el lote llama al mismo `resolve_doi` de a
     * uno (`references.py:75-76`), así que no hay dos caminos que diverjan. */
    const esBloque = query.split('\n').filter((l) => l.trim()).length > 1;
    showToast(esBloque ? 'Consultando metadatos de tus DOI…' : 'Consultando metadatos DOI…', 'info');
    if (esBloque) {
      await resolveDoisBlock(query);
    } else {
      await resolveDoiReference(query);
    }
    setShowAddModal(false);
  };

  const handleAddManual = async () => {
    if (!formTitle.trim() && !formAuthors.trim()) {
      showToast('Ingresa al menos autor o título', 'warning');
      return;
    }
    const authorsArr = formAuthors.split(/,|&|;/).map((a) => a.trim()).filter(Boolean);
    const yr = formYear.trim() || 's.f.';
    const title = formTitle.trim();
    const source = formSource.trim();
    const doi = formDoi.trim();
    const formato = await formatearReferencia({
      authors: authorsArr, year: yr, title, source, doi_or_url: doi || undefined,
      tipo: tipoSeleccionado,
    });
    const formatted = formato?.formatted_apa
      ?? `${formAuthors.trim()} (${yr}). ${title}.${source ? ' ' + source : ''}${doi ? ' ' + doi : ''}`;

    const newRef: ReferenciaModel = {
      id: `ref-${Date.now()}`,
      authors: authorsArr.length > 0 ? authorsArr : [formAuthors.trim() || 'Autor'],
      year: yr,
      title,
      source,
      doi_or_url: doi || undefined,
      formatted_apa: formatted,
      raw_text: formatted,
      apa_segments: formato?.apa_segments,
      tipo: formato?.tipo,
    };

    addReference(newRef);
    setSelectedReferenceId(newRef.id);
    setFormAuthors('');
    setFormYear('');
    setFormTitle('');
    setFormSource('');
    setFormDoi('');
    setShowAddModal(false);
    showToast('Referencia agregada exitosamente', 'success');
  };

  const handleSaveModalRef = async (updated: Partial<ReferenciaModel>) => {
    if (!editingRef) return;
    const authorsArr = updated.authors || editingRef.authors || [];
    const yr = updated.year?.trim() || editingRef.year || 's.f.';
    const title = updated.title !== undefined ? updated.title.trim() : editingRef.title;
    const source = updated.source !== undefined ? updated.source.trim() : (editingRef.source || '');
    const doi = updated.doi_or_url !== undefined ? updated.doi_or_url.trim() : (editingRef.doi_or_url || '');
    const tipo = updated.tipo ?? editingRef.tipo ?? 'otro';
    const formato = await formatearReferencia({
      authors: authorsArr, year: yr, title, source, doi_or_url: doi || undefined, tipo,
    });
    const formatted = formato?.formatted_apa
      ?? `${authorsArr.join(', ')} (${yr}). ${title}.${source ? ' ' + source : ''}${doi ? ' ' + doi : ''}`;

    updateReferences(references.map((r) => {
      if (r.id !== editingRef.id) return r;
      return {
        ...r,
        ...updated,
        authors: authorsArr.length ? authorsArr : ['Autor'],
        year: yr,
        title,
        source,
        doi_or_url: doi || undefined,
        formatted_apa: formatted,
        raw_text: formatted,
        apa_segments: formato?.apa_segments,
        tipo: formato?.tipo,
      };
    }));
    setEditingRef(null);
    showToast('Referencia actualizada con éxito', 'success');
  };

  function ghostText(g: any): string {
    if (!g) return '';
    if (typeof g === 'string') return g;
    return g.raw_text || g.formatted_apa || [g.authors?.join?.(', '), g.year ? `(${g.year})` : '', g.title].filter(Boolean).join(' ').trim() || g.citation || '';
  }

  const handleResolveGhost = async (i: number) => {
    setResolvingGhostIdx(i);
    try {
      const g = ghosts[i];
      const txt = ghostText(g);
      const author = txt.replace(/[()]/g, '').split(',')[0]?.trim() || 'Autor';
      const year = String(txt).match(/\b(19|20)\d{2}\b/)?.[0] || '';
      await resolveGhostCitation([author], year);
    } catch {
      showToast('No se pudo resolver la cita automáticamente', 'warning');
    } finally {
      setResolvingGhostIdx(null);
    }
  };

  /* Los párrafos que citan esta referencia. El criterio —primer apellido y año,
     sin encabezados y sin la portada— es el del backend, y por eso la función
     es la misma que usa la auditoría: `toKey` quita tildes y `firstSurname`
     saca el apellido, y los dos ya vivían en `lib/citationMatcher.ts`.
     La versión vieja comparaba el nombre completo del autor contra el texto en
     minúsculas, sin normalizar: una referencia citada salía sin menciones. */
  const linkedParagraphs = useMemo(
    () => (selectedRef ? parrafosQueCitan(selectedRef, doc?.elements) : []),
    [doc, selectedRef],
  );

  /* Las menciones de cada fila salen de la MISMA función que el detalle, así que
     la fila y el panel no pueden contradecirse. Se calcula una vez para todo el
     catálogo —no por render de cada fila— y no lee `cited_count`, que en el
     store conserva el default 0. */
  const mencionesPorRef = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of references) {
      mapa.set(r.id, parrafosQueCitan(r, doc?.elements).length);
    }
    return mapa;
  }, [references, doc]);

  const copyInTextCitation = (refItem: ReferenciaModel) => {
    const main = (refItem.authors?.[0] || 'Autor').split(',')[0].trim();
    const yr = refItem.year || 's.f.';
    const text = refItem.authors && refItem.authors.length > 2
      ? `(${main} et al., ${yr})`
      : refItem.authors && refItem.authors.length === 2
        ? `(${main} & ${refItem.authors[1].split(',')[0].trim()}, ${yr})`
        : `(${main}, ${yr})`;

    navigator.clipboard.writeText(text);
    setCopiedId(refItem.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast(`Copiado: ${text}`, 'info');
  };

  /**
   * Copia la cita en texto en sus dos formas APA 7: parentética `(Autor, Año)` y
   * narrativa `Autor (Año)`. Es la misma información que el cuerpo del trabajo
   * necesita, sin obligar a escribirla a mano ni a equivocar la puntuación.
   */
  const copiarCita = (refItem: ReferenciaModel, modo: 'parentetica' | 'narrativa') => {
    const main = (refItem.authors?.[0] || 'Autor').split(',')[0].trim();
    const yr = refItem.year || 's.f.';
    const autor = refItem.authors && refItem.authors.length > 2
      ? `${main} et al.`
      : refItem.authors && refItem.authors.length === 2
        ? `${main} y ${refItem.authors[1].split(',')[0].trim()}`
        : main;
    const text = modo === 'parentetica' ? `(${autor}, ${yr})` : `${autor} (${yr})`;
    navigator.clipboard.writeText(text);
    setCopiedId(refItem.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast(`Copiado: ${text}`, 'info');
  };

  /* La cara de la mascota NO se elige por decorado: sale de lo que hay que
   * hacer. Con referencias incompletas o citas sin fuente hay trabajo que la
   * persona todavía no ve, y la cara lo dice antes de que abra un grupo. La
   * regla vive en `lib/referencias.ts` junto al dato, y es la misma idea que
   * `mascotDePestana.tsx` para las cinco pestañas de Ajustes. */
  const expresionFase = expresionDeReferencias({
    hayDocumento: !!doc,
    totalReferencias: references.length,
    incompletas: unverifiedReferences.filter((r) => diagnosticoDeReferencia(r).estado === 'incompleta').length,
    citasSinFuente: ghosts.length,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', backgroundColor: 'var(--color-bg-canvas)' }}>
      {/* ── Barra superior: mascota con la cara del estado, título y acciones ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-6)', backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {/* El `kind` es `reference`, que `EditorialMascot` ya dibujaba y que
              hasta ahora ninguna pantalla del editor usaba. Un `kind` declarado
              y no dibujado deja la mascota en blanco. */}
          <EditorialMascot kind="reference" expression={expresionFase} size={36} />
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
            Estudio de Referencias y Citas APA 7
          </h2>
        </div>

        {/* La acción principal de ESTA pantalla es agregar una referencia, y
            ahora vive en un botón CIRCULAR que despliega las tres formas de
            agregar. Antes era un botón de texto pegado a "Auditar citas" y a
            "Continuar a Auditoría", y las tres palabras competían en la misma
            fila. El menú separa la decisión (cómo agregar) del resto.
            `data-accion="principal"` marca el bloque: el test comprueba que hay
            un solo bloque de acento en la barra. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* La acción principal de ESTA pantalla es agregar una referencia, y
              ahora es la ÚNICA acción de la barra: un botón CIRCULAR que
              despliega las formas de agregar. Antes había además "Auditar citas"
              y "Continuar a Auditoría", dos verbos que competían con la acción
              real y que nadie pidió aquí —la auditoría corre sola al entrar y
              "continuar" es el rail de fases, no una decisión de esta pantalla.
              `data-accion="principal"` marca el bloque: el test comprueba que
              hay un solo bloque de acento en la barra. */}
          <div data-accion="principal" style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showAddMenu}
              aria-label="Nueva referencia"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                height: '38px', padding: '0 var(--space-4) 0 var(--space-3)',
                borderRadius: 'var(--radius-full)', border: '1px solid var(--color-accent)',
                background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
                fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', boxShadow: 'var(--shadow-accent)',
              }}
            >
              <Plus size={16} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
              <span>Nueva referencia</span>
            </button>

            {showAddMenu && (
              <>
                {/* Capa invisible que cierra el menú al hacer clic afuera. */}
                <div
                  onClick={() => setShowAddMenu(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  aria-hidden="true"
                />
                <div
                  aria-label="Formas de agregar una referencia"
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
                    width: '280px', padding: 'var(--space-2)',
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                    display: 'flex', flexDirection: 'column', gap: '2px',
                  }}
                >
                  <MenuItem
                    icon={Link2}
                    title="DOI o enlace"
                    detail="Extrae los metadatos automáticamente"
                    onClick={() => { setShowAddMenu(false); setAddMode('doi'); setShowAddModal(true); }}
                  />
                  <MenuItem
                    icon={Pencil}
                    title="Entrada manual"
                    detail="Escribes autor, año y título"
                    onClick={() => { setShowAddMenu(false); setAddMode('manual'); setShowAddModal(true); }}
                  />
                  <MenuItem
                    icon={FileText}
                    title="Importar .bib / .ris"
                    detail="Desde Zotero o Mendeley"
                    disabled
                    disabledNote="Requiere el conversor del motor"
                    onClick={() => {}}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Layout de 2 Columnas (Progressive Disclosure) ── */}
      <div style={{ display: 'flex', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' }}>

        {/* ══ MINI-RAIL: Filtro Rápido por Estado (56px) ══ */}
        <ReferenceRailFilter
          filter={railFilter}
          counts={{
            total: references.length,
            verified: validReferences.length,
            issues: issuesCount,
          }}
          onSelectFilter={(f) => {
            setRailFilter(f);
            /* Volver a "Todas" es volver a la BIBLIOGRAFÍA COMPLETA: la
               selección se limpia para que el lienzo muestre el documento
               entero y no la última ficha que quedó abierta. Elegir una
               referencia en la lista vuelve a enfocar esa sola. */
            if (f === 'all') setSelectedReferenceId(null);
          }}
        />

        {/* ══ COLUMNA 1: Catálogo y Lista Agrupada por Estado (responsive min 380px, max 440px) ══ */}
        <div style={{
          width: 'clamp(380px, 28vw, 440px)', flexShrink: 0, height: '100%', overflowY: 'auto',
          backgroundColor: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border-subtle)',
          display: 'flex', flexDirection: 'column', padding: 'var(--space-4)', gap: 'var(--space-4)',
        }}>

          {/* Encabezado de la columna: dice qué es la lista y cuánto tiene. El
              conteo vivía en un pill suelto al lado del título de la pantalla,
              donde no se sabía a qué se refería; acá corona la lista a la que
              pertenece. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Bibliografía
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-tertiary)' }}>
              {references.length}{' '}
              {references.length === 1 ? 'fuente' : 'fuentes'}
            </span>
          </div>

          {/* Buscador del directorio. Filtra por autor, año, título o fuente;
              `type="search"` para que el navegador ofrezca limpiar. */}
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              strokeWidth="var(--icon-stroke)"
              aria-hidden="true"
              style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}
            />
            <input
              type="search"
              aria-label="Buscar referencia por autor o título"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por autor o título…"
              style={{ ...inputFullStyle, paddingLeft: '34px' }}
            />
          </div>

          {/* Verificar es de LISTA, como reordenar: contrasta TODA la bibliografía
              de una vez. DOI exacto primero, autor+año despues; lo que no matchea
              queda Pendiente. El veredicto lo pone el backend. */}
          {references.length > 0 && (
            <button
              type="button"
              onClick={handleVerificarBibliografia}
              disabled={verificando}
              style={{ ...botonInline(), opacity: verificando ? 0.6 : 1 }}
              aria-label="Verificar bibliografía"
              title="Contrasta cada referencia contra su fuente (DOI o autor/año)"
            >
              {verificando
                ? <Loader2 size={12} className="animate-spin" strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                : <BadgeCheck size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />}
              <span>Verificar bibliografía</span>
            </button>
          )}

          {/* Operación de LISTA, no de fila: reordenar aplica a la bibliografía
              completa. El orden lo calcula el backend con la clave APA (apellido
              sin tildes); acá solo se pide y se refleja. */}
          {references.length > 1 && (
            <button
              type="button"
              onClick={handleReorder}
              disabled={reordering}
              style={{ ...botonInline(), opacity: reordering ? 0.6 : 1 }}
            >
              {reordering
                ? <Loader2 size={12} className="animate-spin" strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                : <ArrowDownAZ size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />}
              <span>Reordenar alfabéticamente</span>
            </button>
          )}

          {/* Aviso de estilo mezclado: solo informa. Convertir una cita numérica
              a APA exige los metadatos de la fuente, que es otro trabajo. */}
          {estiloMezclado && (
            <div
              role="status"
              style={{
                display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start',
                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-warning)',
                backgroundColor: 'var(--color-warning-a08)',
                fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
              }}
            >
              <AlertTriangle size={14} strokeWidth="var(--icon-stroke)" aria-hidden="true"
                style={{ flexShrink: 0, color: 'var(--color-warning)' }} />
              <span>Hay citas con más de un estilo en el texto. Unifica APA o numérica antes de exportar.</span>
            </div>
          )}

          {/* PESTAÑAS: UNA CATEGORÍA A LA VEZ.
              Antes los tres grupos eran encabezados plegables apilados y el
              texto de los tres competía de un golpe; la categoría se elige, no
              se adivina. Las etiquetas y los conteos son los mismos del rail y
              de cada vacío: Verificadas, Pendientes y En texto-no-en-biblio. */}
          <div
            role="tablist"
            aria-label="Grupos de la bibliografía"
            style={{
              display: 'flex', gap: 'var(--space-1)', padding: 'var(--space-1)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {tabsVisibles.map((t) => {
              const activa = tabActiva === t.id;
              const Icon = t.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setActiveGroup(t.id)}
                  title={t.detalle}
                  style={{
                    flex: 1, minWidth: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    padding: '6px 6px', border: 'none', borderRadius: 'var(--radius-sm)',
                    fontFamily: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 800,
                    letterSpacing: '0.03em', textTransform: 'uppercase', cursor: 'pointer',
                    background: activa ? 'var(--color-bg-surface)' : 'transparent',
                    color: activa ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    boxShadow: activa ? 'var(--shadow-sm)' : 'none',
                    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
                  }}
                >
                  <Icon size={13} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, opacity: 0.75 }}>{t.conteo}</span>
                </button>
              );
            })}
          </div>

          {/* LA LISTA DE LA PESTAÑA ACTIVA. El separador entre filas lo pone
              cada fila (`ReferenceCatalogItem`) y las citas sin fuente. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {tabActiva === 'verificadas' && (
              validFiltradas.length === 0 ? (
                <EstadoVacio
                  motivo="sin-resultados"
                  filtroActivo="el grupo de verificadas"
                  accion={
                    <button type="button" onClick={() => setShowAddModal(true)} style={botonInline()}>
                      <Plus size={12} strokeWidth="var(--icon-stroke)" />
                      <span>Nueva referencia</span>
                    </button>
                  }
                />
              ) : (
                validFiltradas.map((refItem) => (
                  <ReferenceCatalogItem
                    key={refItem.id}
                    reference={refItem}
                    huerfana={huerfanas ? huerfanas.has(refItem.id) : null}
                    mentionedCount={mencionesPorRef.get(refItem.id) ?? 0}
                    isSelected={selectedRef?.id === refItem.id}
                    onSelect={() => setSelectedReferenceId(refItem.id)}
                    onEdit={() => setEditingRef(refItem)}
                  />
                ))
              )
            )}

            {tabActiva === 'pendientes' && (
              pendientesFiltradas.length === 0 ? (
                <EstadoVacio motivo="sin-resultados" filtroActivo="el grupo de pendientes" />
              ) : (
                pendientesFiltradas.map((refItem) => (
                  <ReferenceCatalogItem
                    key={refItem.id}
                    reference={refItem}
                    huerfana={huerfanas ? huerfanas.has(refItem.id) : null}
                    mentionedCount={mencionesPorRef.get(refItem.id) ?? 0}
                    isSelected={selectedRef?.id === refItem.id}
                    onSelect={() => setSelectedReferenceId(refItem.id)}
                    onEdit={() => setEditingRef(refItem)}
                  />
                ))
              )
            )}

            {tabActiva === 'sincitar' && (
              (sinCitarFiltradas ?? []).length === 0 ? (
                <EstadoVacio motivo="sin-resultados" filtroActivo="el grupo de referencias sin citar" />
              ) : (
                (sinCitarFiltradas ?? []).map((refItem) => (
                  <ReferenceCatalogItem
                    key={refItem.id}
                    reference={refItem}
                    huerfana={true}
                    mentionedCount={mencionesPorRef.get(refItem.id) ?? 0}
                    isSelected={selectedRef?.id === refItem.id}
                    onSelect={() => setSelectedReferenceId(refItem.id)}
                    onEdit={() => setEditingRef(refItem)}
                  />
                ))
              )
            )}

            {tabActiva === 'texto' && (
              ghostsFiltrados.length === 0 ? (
                <EstadoVacio motivo="sin-resultados" filtroActivo="el grupo de citas sin fuente" />
              ) : (
                ghostsFiltrados.map((g: unknown, i: number) => {
                  const txt = ghostText(g);
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '9px 12px',
                        borderLeft: '2px solid var(--color-warning)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        backgroundColor: 'transparent',
                        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                      }}
                    >
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, minWidth: 0 }}>
                        {txt}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleResolveGhost(i)}
                        disabled={resolvingGhostIdx === i}
                        title="Buscar esta cita y crear su ficha"
                        style={botonInline(undefined, { padding: '4px 10px', fontSize: 'var(--text-xs)', flexShrink: 0 })}
                      >
                        {resolvingGhostIdx === i
                          ? <Loader2 size={12} className="animate-spin" strokeWidth="var(--icon-stroke)" />
                          : <Plus size={12} strokeWidth="var(--icon-stroke)" />}
                        <span>Completar</span>
                      </button>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* ══ COLUMNA 2: Canvas editorial (Flex 1) ══ */}
        <div style={{
          flex: 1, height: '100%', overflowY: 'auto', padding: 'var(--space-6)',
          display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg-canvas)',
        }}>
          <div style={{ maxWidth: '1040px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {!selectedRef ? (
            /* SIN SELECCIÓN: la BIBLIOGRAFÍA COMPLETA. La hoja muestra las
               referencias de verdad —todas, en orden— como la página que va al
               documento, no un tablero de cifras. Elegir una en la lista enfoca
               esa sola y el estado del lienzo cambia a la ficha. */
            <div
              data-testid="bibliografia-completa"
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', alignSelf: 'flex-start' }}>
                Bibliografía completa
              </span>

              {references.length === 0 ? (
                <EstadoVacio
                  motivo="sin-documento"
                  accion={
                    <button type="button" onClick={() => setShowAddModal(true)} style={botonInline(true)}>
                      <Plus size={12} strokeWidth="var(--icon-stroke)" />
                      <span>Nueva referencia</span>
                    </button>
                  }
                />
              ) : (
                <HojaBibliografia referencias={referenciasOrdenadas} rules={rules} />
              )}
            </div>
          ) : (
            <>
              {/* EL ESTADO, Y POR QUÉ. Arriba del detalle, antes del formulario.
                  El chip sale de `diagnosticoDeReferencia` —del `verificada` que
                  pone un resolutor real— y la línea de debajo dice la razón. Un
                  chip sin razón obliga a la persona a adivinar, y adivinar el
                  estado de una referencia es exactamente el trabajo que esta
                  pantalla existe para ahorrar. */}
              {/* Franja de estado: el chip dice qué es, y la línea de al lado
                  dice POR QUÉ. Un chip sin razón obliga a adivinar el estado,
                  que es justo el trabajo que esta pantalla ahorra. */}
              <div
                data-testid="estado-referencia"
                style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                  gap: 'var(--space-2)', padding: '0 var(--space-1)',
                }}
              >
                <span
                  data-testid="chip-estado"
                  style={{
                    fontSize: 'var(--text-xs)', fontWeight: 800,
                    letterSpacing: '0.02em', textTransform: 'uppercase',
                    padding: '3px 10px', borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border-subtle)',
                    color: diagnostico ? TONO_DE_ESTADO[diagnostico.estado] : 'var(--color-text-tertiary)',
                    background: 'var(--color-bg-surface)',
                  }}
                >
                  {diagnostico ? ROTULO_DE_ESTADO[diagnostico.estado] : ''}
                </span>
                {diagnostico?.huerfana === true && (
                  /* Sólo cuando la auditoría CORRIÓ. `huerfana` es `null`
                     mientras nadie miró, y `null` no es `false`: decir "sin
                     citar" sobre una búsqueda que no se hizo es afirmar sin
                     dato. */
                  <span
                    data-testid="marca-sin-citar"
                    style={{
                      fontSize: 'var(--text-xs)', fontWeight: 700,
                      padding: '3px 8px', borderRadius: 'var(--radius-xs)',
                      color: 'var(--color-warning)', background: 'var(--color-warning-a12)',
                    }}
                  >
                    Sin citar en el texto
                  </span>
                )}
                <span style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  {diagnostico ? porQueDeLaReferencia(diagnostico, selectedRef) : ''}
                </span>
                {/* Volver a la bibliografía completa sin tener que ir al rail:
                    la selección se limpia y el lienzo muestra el documento
                    entero. Es el gesto inverso de elegir una referencia. */}
                <button
                  type="button"
                  onClick={() => setSelectedReferenceId(null)}
                  style={{ ...botonInline(), marginLeft: 'auto', padding: '4px 10px', fontSize: 'var(--text-xs)' }}
                >
                  <ArrowRight size={12} strokeWidth="var(--icon-stroke)" style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />
                  <span>Ver bibliografía completa</span>
                </button>
              </div>

              {/* Etiqueta + hoja de papel: exactamente el texto que va al
                  documento, no uno compuesto en el render. Sin ícono ni
                  adorno: la palabra sola dice lo que es. */}
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
                Bibliografía
              </span>

              <article
                style={{
                  backgroundColor: 'var(--paper-white)', color: 'var(--paper-ink)',
                  borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)',
                  boxShadow: 'var(--shadow-lg)', padding: 'var(--space-8)',
                }}
              >
                <div style={{ ...APA_LISTA }}>
                  {selectedRef && (selectedRef.formatted_apa || selectedRef.raw_text)
                    ? <ReferenciaLinea referencia={selectedRef} as="div" data-testid="vista-previa-apa" />
                    : (
                      <div data-testid="vista-previa-apa" style={{ ...APA_ENTRADA }}>
                        <em style={{ color: 'var(--paper-ink)', opacity: 0.55, fontStyle: 'normal' }}>
                          Esta referencia no tiene texto para escribir en el documento.
                        </em>
                      </div>
                    )}
                </div>
              </article>

              {/* Acciones sobre la ficha, fuera de la hoja para no mezclar la
                  tinta del papel con los controles del sistema. La edición real
                  vive en el modal: acá sólo se abre. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <button type="button" onClick={() => copiarCita(selectedRef, 'parentetica')} style={botonInline()}>
                  <Copy size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                  <span>Copiar parentética</span>
                </button>
                <button type="button" onClick={() => copiarCita(selectedRef, 'narrativa')} style={botonInline()}>
                  <Copy size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                  <span>Copiar narrativa</span>
                </button>
                <button type="button" onClick={() => setEditingRef(selectedRef)} style={botonInline(true)}>
                  <Pencil size={13} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
                  <span>Editar ficha</span>
                </button>
              </div>

              {/* La ficha editable vive ahora en el modal de edición —botón
                  "Editar ficha"— y no como formulario permanente en el canvas. */}


              {/* Menciones en el Manuscrito con Tipografía Editorial */}
              <ManuscriptMentionsAccordion
                citations={linkedParagraphs.map((p, idx) => ({
                  page: p.page_number || 1,
                  p: `Párrafo ${idx + 1}`,
                  text: p.text || '',
                  highlight: (selectedRef.authors?.[0] || '').split(',')[0].trim(),
                }))}
                onJumpToWord={(page, pRef) => {
                  const targetP = linkedParagraphs.find((_, i) => `Párrafo ${i + 1}` === pRef) || linkedParagraphs[0];
                  if (targetP) {
                    setSelectedElementId(targetP.id);
                    setScrollTargetId(targetP.id);
                  }
                }}
                onCopyCitation={() => copyInTextCitation(selectedRef)}
                defaultOpen={true}
              />
            </>
          )}
          </div>
        </div>
      </div>

      {/* ── Modal Flotante: Edición Bibliográfica Rápida ── */}
      <ReferenceEditModal
        reference={editingRef}
        isOpen={Boolean(editingRef)}
        onClose={() => setEditingRef(null)}
        onSave={handleSaveModalRef}
      />

      {/* ── Modal Flotante: Nueva Referencia ── */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--color-ink-a55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
          <div style={{
            width: '460px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-subtle)', boxShadow: '0 12px 32px var(--color-ink-a20)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header Modal */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-bg-surface)',
            }}>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                Añadir Nueva Referencia Bibliográfica
              </span>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Selector de Modo (DOI vs Manual) */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '6px', background: 'var(--color-bg-surface-alt)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setAddMode('doi')}
                  style={{
                    flex: 1, padding: '6px', fontSize: 'var(--text-sm)', fontWeight: 700, borderRadius: 'var(--radius-sm)',
                    border: 'none', cursor: 'pointer',
                    backgroundColor: addMode === 'doi' ? 'var(--color-bg-surface)' : 'transparent',
                    color: addMode === 'doi' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  DOI o Enlace Web
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('manual')}
                  style={{
                    flex: 1, padding: '6px', fontSize: 'var(--text-sm)', fontWeight: 700, borderRadius: 'var(--radius-sm)',
                    border: 'none', cursor: 'pointer',
                    backgroundColor: addMode === 'manual' ? 'var(--color-bg-surface)' : 'transparent',
                    color: addMode === 'manual' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  Entrada Manual
                </button>
              </div>

              {addMode === 'doi' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={labelFullStyle}>Ingrese un DOI o enlace web (o varios, uno por línea)</label>
                  {/* Un `textarea` y no un `input`: pegar veinte DOI o URLs del navegador
                      es el caso de la literatura completa, y con un input de una
                      línea no hay forma de pegar más de uno. Enter resuelve y
                      Shift+Enter parte línea; al revés no habría bloque. */}
                  <textarea
                    aria-label="DOI o enlace web de la publicación"
                    value={doiQuery}
                    onChange={(e) => setDoiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleResolveDoi(); }
                    }}
                    rows={3}
                    placeholder={'10.1037/arc0000014...\nhttps://elpais.com/noticia.html...'}
                    style={{ ...inputFullStyle, resize: 'vertical', lineHeight: 1.5 }}
                  />
                  <button
                    type="button"
                    onClick={handleResolveDoi}
                    disabled={isLoading || !doiQuery.trim()}
                    style={botonInline(true, { width: '100%' })}
                  >
                    {isLoading
                      ? <Loader2 size={14} className="animate-spin" strokeWidth="var(--icon-stroke)" />
                      : <Search size={14} strokeWidth="var(--icon-stroke)" />}
                    <span>Buscar y extraer metadatos</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-1)' }}>
                    {(['journal', 'book', 'thesis', 'web'] as const).map((tKey) => (
                      <button
                        key={tKey}
                        type="button"
                        onClick={() => setRefType(tKey)}
                        style={{
                          padding: 'var(--space-1)', fontSize: 'var(--text-xs)', fontWeight: 700, borderRadius: 'var(--radius-sm)',
                          border: refType === tKey ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                          backgroundColor: refType === tKey ? 'var(--color-accent-soft)' : 'transparent',
                          color: refType === tKey ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {tKey === 'journal' ? 'Artículo' : tKey === 'book' ? 'Libro' : tKey === 'thesis' ? 'Tesis' : 'Web'}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label style={labelFullStyle}>Autores (Apellido, Iniciales)</label>
                    <input type="text" value={formAuthors} onChange={(e) => setFormAuthors(e.target.value)} placeholder="García, A., López, B." style={inputFullStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                    <div>
                      <label style={labelFullStyle}>Año</label>
                      <input type="text" value={formYear} onChange={(e) => setFormYear(e.target.value)} placeholder="2024" style={inputFullStyle} />
                    </div>
                    <div>
                      <label style={labelFullStyle}>Fuente / Editorial</label>
                      <input type="text" value={formSource} onChange={(e) => setFormSource(e.target.value)} placeholder="Editorial / Revista" style={inputFullStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelFullStyle}>Título del Trabajo</label>
                    <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Título..." style={inputFullStyle} />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddManual}
                    style={botonInline(true, { width: '100%' })}
                  >
                    <Plus size={14} strokeWidth="var(--icon-stroke)" />
                    <span>Guardar en la bibliografía</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Estilos auxiliares

/**
 * Una opción del menú que despliega el FAB de "Nueva referencia".
 *
 * Es un `role="menuitem"` con icono, título y una línea que dice qué hace, para
 * que la decisión (cómo agregar la fuente) se lea antes de abrir el modal. El
 * estado `disabled` no es decorativo: la importación .bib/.ris todavía no tiene
 * conversor en el motor, así que en vez de esconder la opción se muestra apagada
 * con la razón — una opción que desaparece deja al autor preguntándose si se
 * equivocó de pantalla.
 */
const MenuItem: React.FC<{
  icon: typeof CheckCircle2;
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
  disabledNote?: string;
}> = ({ icon: Icon, title, detail, onClick, disabled, disabledNote }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
      width: '100%', padding: 'var(--space-2) var(--space-3)',
      border: 'none', borderRadius: 'var(--radius-sm)',
      background: 'transparent', textAlign: 'left', fontFamily: 'inherit',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
    }}
  >
    <Icon
      size={16}
      strokeWidth="var(--icon-stroke)"
      aria-hidden="true"
      style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }}
    />
    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        {disabled && disabledNote ? disabledNote : detail}
      </span>
    </span>
  </button>
);

/**
 * El botón inline del proyecto.
 *
 * El archivo tenía nueve `<button className="btn btn-…">`, y las clases `.btn`
 * son de la generación anterior: no las define este archivo, no las define
 * ningún token, y funcionan por herencia de algo que nadie puede leer desde acá.
 * `principal` marca la acción de acento, y es lo que permite comprobar que hay
 * UNA sola por bloque —en la barra de arriba y en el modal de nueva referencia,
 * que son los dos bloques con acciones— en vez de dos botones de acento
 * compitiendo por la atención.
 */
const botonInline = (principal = false, extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  background: principal ? 'var(--color-accent)' : 'transparent',
  color: principal ? 'var(--color-text-on-accent)' : 'var(--color-text-secondary)',
  border: `1px solid ${principal ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
  ...extra,
});

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 'var(--space-1)',
  color: 'var(--color-text-secondary)',
  display: 'flex',
  alignItems: 'center',
};

const labelFullStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
  display: 'block',
  marginBottom: '3px',
};

const inputFullStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 'var(--text-sm)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-subtle)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

export default Step5ReferencesWizard;
