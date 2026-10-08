/* WordAPA7 — EscritorioEstructura
 *
 * Shell de la fase de Estructura (Paso 2). Tres columnas con un solo dueño
 * cada una:
 *   - Izquierda: `IndiceEstructura`, el esquema.
 *   - Centro: `MapaEstructura`, el diagrama.
 *   - Derecha: un panel con pestañas Prosa / Herramientas.
 *
 * Tocar un título —en el esquema o en el diagrama— selecciona el nodo y abre
 * la prosa. Eso reemplaza las tres pestañas laterales (Rama | Pacing |
 * Reorganizar) que tenía el compositor viejo, cuyo diagnóstico era que el
 * usuario no sentía entrar a «un set de herramientas».
 *
 * Los tres módulos de análisis (volumen, evidencias, reordenar) siguen acá,
 * pero plegados y CERADOS por defecto: si se renderizaran siempre, sus filas
 * repetirían los títulos del esquema y romperían la unicidad de `getByText`.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { BookOpen, Maximize2, Minimize2, Wrench, X } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { collectAuditItems } from '../../lib/auditItems';
import {
  construirJerarquia,
  type FasesConocidas,
  type NodoJerarquia,
} from '../../lib/jerarquia';
import type { ElementModel } from '../../types';
import { IndiceEstructura } from './IndiceEstructura';
import { MapaEstructura } from './MapaEstructura';
import { LecturaProsaSeccion } from './LecturaProsaSeccion';
import { InspectorRama } from './InspectorRama';
import { FaltasApa7 } from './FaltasApa7';
import { DistribucionVolumen } from './DistribucionVolumen';
import { MatrizEvidencias } from './MatrizEvidencias';
import { ReorganizadorCapitulos } from './ReorganizadorCapitulos';
import { RailEstructura, type DestinoEstructura } from './RailEstructura';
import { IndicePrevisualizacion } from './IndicePrevisualizacion';
import { ControlesIndice, type ProfundidadIndice } from './ControlesIndice';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { usePageIndex } from '../../hooks/usePageIndex';
import { construirTextosDeTitulo } from '../../lib/numeracionTitulos';

/** Con esta ventana, el panel derecho vive cómodo. */
export const ANCHO_ESTRUCTURA_COMPLETO = 1280;

export interface EscritorioEstructuraProps {
  nodoInicial?: NodoJerarquia | null;
}

interface ItemConFase {
  element_id?: string;
  phase?: string | null;
}

/**
 * Mapa idDeElemento -> fase declarada. La fase de un hallazgo viaja en el
 * hallazgo; acá solo se proyecta sobre el elemento para que el árbol y el
 * esquema puedan agrupar por fase sin volver a decidirla.
 */
export const fasesConocidasDe = (
  elementos: readonly { id: string }[] | null,
  items: readonly ItemConFase[],
): FasesConocidas => {
  const mapa: Record<string, string> = {};
  const ids = new Set((elementos ?? []).map((e) => e.id));
  for (const item of items ?? []) {
    if (item.element_id && item.phase && ids.has(item.element_id)) {
      mapa[item.element_id] = item.phase;
    }
  }
  return mapa as FasesConocidas;
};

const buscarEn = (nodos: readonly NodoJerarquia[], id: string | null): NodoJerarquia | null => {
  if (!id) return null;
  for (const nodo of nodos) {
    if (nodo.id === id) return nodo;
    const encontrado = buscarEn(nodo.hijos, id);
    if (encontrado) return encontrado;
  }
  return null;
};

/**
 * Calcula el nuevo orden de ids al reubicar una rama entera delante del
 * destino. Se mueve TODO el bloque de la rama de origen —su encabezado y su
 * cuerpo hasta la próxima sección del mismo nivel o superior— para que la prosa
 * nunca quede huérfana ni cambie de padre.
 *
 * Devuelve `null` cuando la operación no tiene sentido (ids ausentes, el
 * destino ya está dentro de la rama o el origen es el propio destino). Es una
 * función pura para poder probarla sin montar el store.
 */
export const calcularReubicacion = (
  elementos: readonly ElementModel[],
  origenId: string,
  destinoId: string,
): string[] | null => {
  const inicioDe = (id: string): number => elementos.findIndex((e) => e.id === id);
  const ini = inicioDe(origenId);
  const iniDestino = inicioDe(destinoId);
  if (ini < 0 || iniDestino < 0 || ini === iniDestino) return null;

  const nivelOrigen = elementos[ini].heading_level ?? 1;
  let fin = ini + 1;
  while (fin < elementos.length) {
    const e = elementos[fin];
    if (e.type === 'heading' && (e.heading_level ?? 1) <= nivelOrigen) break;
    fin += 1;
  }
  // El destino cae dentro de la propia rama: moverla dentro de sí misma la
  // partiría en dos y dejaría el cuerpo descolgado.
  if (ini <= iniDestino && iniDestino < fin) return null;

  const bloque = elementos.slice(ini, fin).map((e) => e.id);
  const resto = elementos.filter((_, i) => i < ini || i >= fin);
  const iDestino = resto.findIndex((e) => e.id === destinoId);
  if (iDestino < 0) return null;

  return [
    ...resto.slice(0, iDestino).map((e) => e.id),
    ...bloque,
    ...resto.slice(iDestino).map((e) => e.id),
  ];
};

const Plegable: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="herr-plegable" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'transparent',
          border: 0,
          padding: 'var(--space-2) var(--space-3)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
      >
        {titulo}
        <span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>
          {abierto ? '−' : '+'}
        </span>
      </button>
      {abierto ? <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-4)' }}>{children}</div> : null}
    </div>
  );
};

export const EscritorioEstructura: React.FC<EscritorioEstructuraProps> = ({ nodoInicial }) => {
  const doc = useDocStore((s) => s.doc);
  const reorderElements = useDocStore((s) => s.reorderElements);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const reglas = useDocStore((s) => s.rules);
  const setRules = useDocStore((s) => s.setRules);
  const insertarToc = useDocStore((s) => s.insertTocElement);
  const quitarToc = useDocStore((s) => s.removeTocElement);

  /* Páginas y numeración para el índice: la MISMA paginación del lienzo y la
   * MISMA numeración de títulos, para que la preview no contradiga a la hoja. */
  const pageIndex = usePageIndex();

  const elementos = (doc?.elements ?? null) as readonly ElementModel[] | null;

  const faseConocida = useMemo(
    () =>
      fasesConocidasDe(
        elementos,
        collectAuditItems({
          elements: elementos ?? [],
          reviewResult,
          proofreadFindings,
          citationAuditResult,
        }),
      ),
    [elementos, reviewResult, proofreadFindings, citationAuditResult],
  );

  const raices = useMemo(
    () => construirJerarquia(elementos ?? [], faseConocida),
    [elementos, faseConocida],
  );

  const textosTitulo = useMemo(
    () => construirTextosDeTitulo(elementos ?? [], reglas),
    [elementos, reglas],
  );

  const [elegidoId, setElegidoId] = useState<string | null>(nodoInicial?.id ?? null);
  const [tab, setTab] = useState<'prosa' | 'herramientas'>('prosa');
  const [ampliado, setAmpliado] = useState(false);
  const [destino, setDestino] = useState<DestinoEstructura>('esquema');
  const [profundidad, setProfundidad] = useState<ProfundidadIndice>(3);
  const anchoVentana = useWindowWidth();
  const [cerradoManual, setCerradoManual] = useState<boolean | null>(null);

  /* Si el usuario no ha interactuado explícitamente abriendo o cerrando, se
   * pliega automáticamente si la pantalla es menor a ANCHO_ESTRUCTURA_COMPLETO.
   * Si el usuario pulsa abrir o cerrar, su decisión manual prevalece. */
  const panelCerrado = cerradoManual !== null
    ? cerradoManual
    : anchoVentana < ANCHO_ESTRUCTURA_COMPLETO;

  const hayIndice = (doc?.elements ?? []).some((e) => e.type === 'toc');

  const elegido = useMemo(
    () => buscarEn(raices, elegidoId) ?? raices[0] ?? null,
    [raices, elegidoId],
  );

  const abrir = useCallback((nodo: NodoJerarquia) => {
    setElegidoId(nodo.id);
    setTab('prosa');
    setCerradoManual(false);
  }, []);

  const abrirPorId = useCallback((id: string) => {
    setElegidoId(id);
    setTab('prosa');
    setCerradoManual(false);
  }, []);

  /**
   * Reubicar una rama entera: se mueve TODO el bloque de elementos de la rama
   * de origen —su encabezado y su cuerpo hasta la próxima sección— delante del
   * destino, conservando el orden relativo. Mover solo el encabezado dejaría su
   * prosa huérfana.
   */
  const manejarReubicar = useCallback(
    (origenId: string, destinoId: string) => {
      const elementos = doc?.elements ?? [];
      const orden = calcularReubicacion(elementos, origenId, destinoId);
      if (orden) void reorderElements(orden);
    },
    [doc, reorderElements],
  );

  const anchoEsquema = anchoVentana < 960 ? '240px' : '308px';
  const anchoPanelDefecto = anchoVentana >= ANCHO_ESTRUCTURA_COMPLETO ? '452px' : 'minmax(280px, 380px)';
  const anchoPanel = ampliado ? (anchoVentana >= ANCHO_ESTRUCTURA_COMPLETO ? '760px' : 'minmax(380px, 560px)') : anchoPanelDefecto;

  return (
    <div
      className="escritorio-estructura"
      style={{
        display: 'grid',
        gridTemplateColumns: panelCerrado
          ? `56px ${anchoEsquema} minmax(0, 1fr) 44px`
          : `56px ${anchoEsquema} minmax(0, 1fr) ${anchoPanel}`,
        height: '100%',
        minHeight: 0,
        background: 'var(--color-bg-canvas)',
      }}
    >
      <RailEstructura destino={destino} onDestino={setDestino} />

      <div style={{ minWidth: 0, minHeight: 0, background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border-subtle)' }}>
        <IndiceEstructura
          elementos={elementos}
          faseConocida={faseConocida}
          onSelect={abrir}
          nodoSeleccionadoId={elegido?.id ?? null}
          textosTitulo={textosTitulo}
        />
      </div>

      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
          padding: destino === 'esquema' ? 'var(--space-4)' : 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {destino === 'esquema' ? (
          <MapaEstructura
            raices={raices}
            onSelect={abrir}
            nodoSeleccionadoId={elegido?.id ?? null}
            onReubicar={manejarReubicar}
            textosTitulo={textosTitulo}
          />
        ) : (
          <IndicePrevisualizacion
            raices={raices}
            onSelect={abrir}
            nodoSeleccionadoId={elegido?.id ?? null}
            profundidadMaxima={profundidad}
            textosTitulo={textosTitulo}
            paginaDe={pageIndex.pageOf}
          />
        )}
      </div>

      {panelCerrado ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 'var(--space-3)', background: 'var(--color-bg-surface)', borderLeft: '1px solid var(--color-border-subtle)' }}>
          <button type="button" onClick={() => setCerradoManual(false)} title="Mostrar panel" style={estiloIcono}>
            <BookOpen size={16} strokeWidth="var(--icon-stroke)" aria-hidden />
          </button>
        </div>
      ) : destino === 'indice' ? (
        <aside
          aria-label="Diseño del índice"
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'auto', background: 'var(--color-bg-surface)', borderLeft: '1px solid var(--color-border-subtle)' }}
        >
          <ControlesIndice
            profundidad={profundidad}
            onProfundidad={setProfundidad}
            onRegla={(clave, valor) => setRules({ [clave]: valor } as never)}
            hayIndice={hayIndice}
            onInsertar={() => insertarToc()}
            onQuitar={() => quitarToc()}
            numeracionH1={reglas.heading_numbering_style_lvl1 ?? 'none'}
            numeracionH2={reglas.heading_numbering_style_lvl2 ?? 'none'}
          />
        </aside>
      ) : (
        <aside
          aria-label="Panel de la sección"
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'var(--color-bg-surface)', borderLeft: '1px solid var(--color-border-subtle)' }}
        >
          <div
            role="tablist"
            aria-label="Panel"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border-subtle)' }}
          >
            <button
              role="tab"
              aria-selected={tab === 'prosa'}
              type="button"
              onClick={() => setTab('prosa')}
              style={estiloTab(tab === 'prosa')}
            >
              <BookOpen size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
              Prosa
            </button>
            <button
              role="tab"
              aria-selected={tab === 'herramientas'}
              type="button"
              onClick={() => setTab('herramientas')}
              style={estiloTab(tab === 'herramientas')}
            >
              <Wrench size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
              Herramientas
            </button>
            <button
              type="button"
              onClick={() => setAmpliado((v) => !v)}
              aria-pressed={ampliado}
              title={ampliado ? 'Reducir' : 'Ampliar'}
              style={{ ...estiloIcono, marginLeft: 'auto' }}
            >
              {ampliado ? (
                <Minimize2 size={15} strokeWidth="var(--icon-stroke)" aria-hidden />
              ) : (
                <Maximize2 size={15} strokeWidth="var(--icon-stroke)" aria-hidden />
              )}
            </button>
            <button type="button" onClick={() => setCerradoManual(true)} title="Cerrar" style={estiloIcono}>
              <X size={15} strokeWidth="var(--icon-stroke)" aria-hidden />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {tab === 'prosa' ? (
              <LecturaProsaSeccion seccionActiva={elegido} elementos={elementos ?? []} />
            ) : (
              <div data-testid="panel-herramientas" style={{ display: 'flex', flexDirection: 'column' }}>
                {elegido ? (
                  <div style={{ padding: 'var(--space-3) var(--space-3) 0' }}>
                    <InspectorRama nodo={elegido} elementos={elementos ?? []} />
                  </div>
                ) : (
                  <p style={{ padding: 'var(--space-4) var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                    Elegí un capítulo del esquema para ver sus herramientas.
                  </p>
                )}
                <div style={{ padding: 'var(--space-3) 0 0' }}>
                  <Plegable titulo="Faltas de APA 7">
                    <FaltasApa7 raices={raices} onSelect={(id) => abrirPorId(id)} />
                  </Plegable>
                  <Plegable titulo="Distribución de volumen">
                    <DistribucionVolumen raices={raices} nodoSeleccionadoId={elegido?.id ?? null} onSelect={(id) => setElegidoId(id)} />
                  </Plegable>
                  <Plegable titulo="Matriz de evidencias">
                    <MatrizEvidencias raices={raices} nodoSeleccionadoId={elegido?.id ?? null} onSelect={(id) => setElegidoId(id)} />
                  </Plegable>
                  <Plegable titulo="Reorganizar capítulos">
                    <ReorganizadorCapitulos raices={raices} elementos={elementos ?? []} nodoSeleccionadoId={elegido?.id ?? null} onSelect={(id) => setElegidoId(id)} />
                  </Plegable>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};

const estiloTab = (activo: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  fontWeight: activo ? 600 : 400,
  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  background: activo ? 'var(--color-accent-soft)' : 'transparent',
  border: 0,
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
});

const estiloIcono: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 0,
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1)',
  cursor: 'pointer',
  color: 'var(--color-text-secondary)',
};

export default EscritorioEstructura;
