/* WordAPA7 — MapaEstructura
 *
 * El diagrama de la fase: responsive, con color por nivel y aristas curvas.
 * Sigue sin usar librerías de grafos (lo prohíbe `estructuraNoMiente.test.ts`):
 * el layout es cálculo propio y el SVG se dibuja a mano.
 *
 * ETIQUETA DENTRO DEL NODO. El nombre vive en un `<text>` y el `<title>` lleva
 * el nombre completo, para que nunca haya un tooltip flotante que el test no
 * pueda ver. El texto visible y el `<title>` llevan además la métrica, así que
 * el nombre exacto solo aparece en el esquema (evita ambigüedad de `getByText`).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { NodoJerarquia } from '../../lib/jerarquia';

export const ANCHO_NODO = 200;
export const ALTO_NODO = 56;
export const SEPARACION_Y = 18;
export const SEPARACION_X = 56;
export const MARGEN = 12;
export const CARACTERES_POR_NODO = 26;

/** Id del nodo raíz sintético: el documento que contiene a las H1. */
export const RAIZ_ID = '__documento__';

/**
 * `true` si `candidatoId` cuelga de `ancestroId` (a cualquier profundidad).
 * Reubicar una rama dentro de sí misma partiría el árbol; el arrastre usa
 * esto para rechazar ese destino antes de tocar el documento.
 */
export const esDescendiente = (
  nodos: readonly NodoJerarquia[],
  ancestroId: string,
  candidatoId: string,
): boolean => {
  const contiene = (n: NodoJerarquia, id: string): boolean =>
    n.hijos.some((h) => h.id === id || contiene(h, id));
  const busca = (lista: readonly NodoJerarquia[]): boolean =>
    lista.some((n) => (n.id === ancestroId ? contiene(n, candidatoId) : busca(n.hijos)));
  return busca(nodos);
};

export interface PosicionNodo {
  nodo: NodoJerarquia;
  nivel: number;
  x: number;
  y: number;
  etiqueta: string;
  truncada: boolean;
  hijos: number;
}

export const etiquetaCortada = (titulo: string, max: number = CARACTERES_POR_NODO): string => {
  const limpio = String(titulo ?? '').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
};

/** Dos conjuntos con exactamente los mismos miembros. */
const mismoConjunto = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => {
  if (a.size !== b.size) return false;
  for (const valor of a) if (!b.has(valor)) return false;
  return true;
};

/** El zoom vive entre 0.5× y 3×: más allá el mapa deja de leerse. */
export const limitarEscala = (valor: number): number => Math.min(3, Math.max(0.5, valor));

/**
 * El desplazamiento nunca saca el contenido de la vista: siempre queda un
 * margen de lienzo visible para poder volver. Sin esto, un arrastre largo deja
 * el diagrama fuera de pantalla y hay que pulsar «Ajustar» para recuperarlo.
 */
export const limitarPan = (
  pan: { x: number; y: number },
  escala: number,
  ancho: number,
  alto: number,
): { x: number; y: number } => {
  const margen = 60;
  return {
    x: Math.min(ancho - margen, Math.max(margen - escala * ancho, pan.x)),
    y: Math.min(alto - margen, Math.max(margen - escala * alto, pan.y)),
  };
};

export const posicionesDe = (
  raices: readonly NodoJerarquia[],
  nivelBase = 1,
  textosTitulo?: ReadonlyMap<string, string>,
): PosicionNodo[] => {
  const posiciones: PosicionNodo[] = [];
  let fila = 0;

  const visitar = (nodos: readonly NodoJerarquia[], nivel: number): PosicionNodo[] => {
    const delNivel: PosicionNodo[] = [];
    for (const nodo of nodos) {
      /* El título visible sale de la MISMA numeración que el índice y el
       * lienzo; sin mapa de textos cae al título íntegro del documento. */
      const tituloMostrado =
        (nodo.elementoId ? textosTitulo?.get(nodo.elementoId) : undefined) ?? nodo.titulo;
      const etiqueta = etiquetaCortada(tituloMostrado);
      const pos: PosicionNodo = {
        nodo,
        nivel,
        x: MARGEN + (nivel - nivelBase) * (ANCHO_NODO + SEPARACION_X),
        y: 0,
        etiqueta,
        truncada: etiqueta !== String(tituloMostrado ?? '').trim(),
        hijos: nodo.hijos.length,
      };
      posiciones.push(pos);
      delNivel.push(pos);
      if (nodo.hijos.length > 0) {
        const hijas = visitar(nodo.hijos, nivel + 1);
        pos.y = (hijas[0].y + hijas[hijas.length - 1].y) / 2;
      } else {
        pos.y = MARGEN + fila * (ALTO_NODO + SEPARACION_Y);
        fila += 1;
      }
    }
    return delNivel;
  };

  visitar(raices, nivelBase);
  return posiciones;
};

/**
 * El id del nodo cuya caja contiene el punto `(x, y)`, o `null` si ninguno.
 *
 * El punto vive en coordenadas del lienzo (las mismas de `PosicionNodo.x/y`),
 * y con dos cajas solapadas gana la última dibujada, que es la de arriba.
 */
export const destinoBajoCursor = (
  posiciones: readonly PosicionNodo[],
  x: number,
  y: number,
): string | null => {
  let hallado: string | null = null;
  for (const p of posiciones) {
    if (x >= p.x && x < p.x + ANCHO_NODO && y >= p.y && y < p.y + ALTO_NODO) {
      hallado = p.nodo.id;
    }
  }
  return hallado;
};

/**
 * `true` si la rama `origenId` puede soltarse sobre `destinoId`.
 *
 * Es la única regla que decide si un arrastre es legal: ni sobre sí misma ni
 * dentro de su propia rama, que partiría el árbol.
 */
export const esDestinoReubicable = (
  raices: readonly NodoJerarquia[],
  origenId: string,
  destinoId: string,
): boolean => origenId !== destinoId && !esDescendiente(raices, origenId, destinoId);

/**
 * El reflujo, interpolado: las cajas y las aristas viajan del layout viejo al
 * nuevo en vez de saltar. Un id que solo existe en `hasta` arranca en su
 * posición final (nace en su sitio), y uno que ya no está simplemente no viaja.
 */
export const interpolarPosiciones = (
  desde: readonly PosicionNodo[],
  hasta: readonly PosicionNodo[],
  t: number,
): PosicionNodo[] => {
  const avance = Math.max(0, Math.min(1, t));
  const previas = new Map(desde.map((p) => [p.nodo.id, p]));
  return hasta.map((fin) => {
    const ini = previas.get(fin.nodo.id);
    if (!ini) return fin;
    return { ...fin, x: ini.x + (fin.x - ini.x) * avance, y: ini.y + (fin.y - ini.y) * avance };
  });
};

/** La línea que avisa dónde cae la rama, sobre el borde superior del destino. */
export const lineaInsercion = (
  destino: PosicionNodo | null | undefined,
): { x: number; y: number; ancho: number } | null =>
  destino ? { x: destino.x, y: destino.y - 5, ancho: ANCHO_NODO } : null;

export interface MapaEstructuraProps {
  raices: readonly NodoJerarquia[];
  elementos?: unknown;
  onSelect?: (nodo: NodoJerarquia) => void;
  nodoSeleccionadoId?: string | null;
  onReubicar?: (origenId: string, destinoId: string) => void;
  /** Título ya numerado por id de elemento, la misma fuente que el índice. */
  textosTitulo?: ReadonlyMap<string, string>;
}

export const MapaEstructura: React.FC<MapaEstructuraProps> = ({
  raices,
  onSelect,
  nodoSeleccionadoId,
  onReubicar,
  textosTitulo,
}) => {
  /* Niveles APAGADOS a mano. Vacío = se ve todo, que es el estado natural: el
   * filtro es una ayuda para mirar, no un modo por defecto. */
  const [nivelesOcultos, setNivelesOcultos] = useState<ReadonlySet<number>>(new Set());
  const [escala, setEscala] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [arrastrandoLienzo, setArrastrandoLienzo] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [fantasma, setFantasma] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef<string | null>(null);
  const destinoRef = useRef<string | null>(null);
  const arrastreRef = useRef<{ x: number; y: number } | null>(null);
  const arrastroRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  /* La rueda se escucha NATIVA (abajo) para poder frenar el scroll: React
   * registra `onWheel` como pasivo y `preventDefault` allí no hace nada. */
  const escalaRef = useRef(escala);
  escalaRef.current = escala;
  const panRef = useRef(pan);
  panRef.current = pan;
  const limitesRef = useRef({ ancho: 1, alto: 1 });

  /* La raíz sintética: el documento del que cuelgan las H1. Existe solo para
   * el dibujo, no es un elemento del documento ni se puede seleccionar. */
  const raizDocumento = useMemo(
    () =>
      ({
        id: RAIZ_ID,
        titulo: 'Documento',
        nivel: 0,
        elementoId: RAIZ_ID,
        palabras: 0,
        figuras: 0,
        tablas: 0,
        citas: 0,
        hijos: [...raices],
        fase: null,
      }) as unknown as NodoJerarquia,
    [raices],
  );

  const todas = useMemo(
    () => posicionesDe([raizDocumento], 0, textosTitulo),
    [raizDocumento, textosTitulo],
  );

  /* Las posiciones DIBUJADAS: nacen en el layout calculado y viajan hacia el
   * nuevo cuando `raices` cambia, para que mover una fase se VEA moverse y las
   * aristas se recompongan con ella. Sin cambio real no hay re-render. */
  const [posiciones, setPosiciones] = useState<PosicionNodo[]>(() => todas);
  const posicionesRef = useRef(posiciones);
  posicionesRef.current = posiciones;
  const firmaObjetivo = useMemo(
    () => todas.map((p) => `${p.nodo.id}@${Math.round(p.x)},${Math.round(p.y)}`).join('|'),
    [todas],
  );
  const firmaRef = useRef('');

  useEffect(() => {
    if (firmaRef.current === firmaObjetivo) return;
    const previas = posicionesRef.current;
    const primera = firmaRef.current === '';
    firmaRef.current = firmaObjetivo;

    const reducido =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (primera || reducido || typeof requestAnimationFrame !== 'function') {
      setPosiciones(todas);
      return;
    }

    const inicio = performance.now();
    const DURACION = 320;
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION);
      const suave = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setPosiciones(interpolarPosiciones(previas, todas, suave));
      if (t < 1) rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [firmaObjetivo, todas]);

  /* Zoom con la rueda, anclado al cursor. El punto bajo el puntero se queda
   * quieto; acercar en la esquina obligaría a perseguir el nodo. Listener
   * nativo con `passive: false`: sin eso, la página scrollea en vez de acercar. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.addEventListener !== 'function') return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      const escalaVieja = escalaRef.current;
      const escalaNueva = limitarEscala(escalaVieja * Math.exp(-e.deltaY * 0.0015));
      if (escalaNueva === escalaVieja) return;
      const p = panRef.current;
      let ancla: { x: number; y: number } | null = null;
      if (typeof svg.getScreenCTM === 'function' && typeof svg.createSVGPoint === 'function') {
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          ancla = pt.matrixTransform(ctm.inverse());
        }
      }
      if (!ancla) {
        setEscala(escalaNueva);
        return;
      }
      const lx = (ancla.x - p.x) / escalaVieja;
      const ly = (ancla.y - p.y) / escalaVieja;
      const { ancho, alto } = limitesRef.current;
      setEscala(escalaNueva);
      setPan(
        limitarPan(
          { x: p.x + (escalaVieja - escalaNueva) * lx, y: p.y + (escalaVieja - escalaNueva) * ly },
          escalaNueva,
          ancho,
          alto,
        ),
      );
    };
    svg.addEventListener('wheel', alRodar, { passive: false });
    return () => svg.removeEventListener('wheel', alRodar);
  }, []);

  const visibles = useMemo(
    () => posiciones.filter((p) => !nivelesOcultos.has(p.nivel)),
    [posiciones, nivelesOcultos],
  );

  /* Los niveles que EXISTEN en el documento. El preset «Solo H1–H2» apaga todo
   * lo que no sea H1/H2, medido sobre lo que hay, no sobre una lista fija. */
  const nivelesPresentes = useMemo(() => new Set(todas.map((p) => p.nivel)), [todas]);
  const ocultosDeSoloTitulos = useMemo(
    () => new Set([...nivelesPresentes].filter((nivel) => nivel > 2)),
    [nivelesPresentes],
  );
  const soloTitulos = mismoConjunto(nivelesOcultos, ocultosDeSoloTitulos);

  const alternarNivel = (nivel: number) =>
    setNivelesOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(nivel)) next.delete(nivel);
      else next.add(nivel);
      return next;
    });

  if (raices.length === 0) {
    return (
      <div className="mapa-vacio" style={{ padding: 'var(--space-6)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        No hay nodos para dibujar todavía.
      </div>
    );
  }

  const ids = new Set(visibles.map((p) => p.nodo.id));
  const porId = new Map(visibles.map((p) => [p.nodo.id, p]));
  const maxX = [...visibles, ...todas].reduce((m, p) => Math.max(m, p.x), 0);
  const maxY = [...visibles, ...todas].reduce((m, p) => Math.max(m, p.y), 0);
  const ancho = maxX + ANCHO_NODO + MARGEN;
  const alto = maxY + ALTO_NODO + MARGEN;
  limitesRef.current = { ancho, alto };

  const ajustar = () => {
    setEscala(1);
    setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-nodo]')) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    arrastreRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setArrastrandoLienzo(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!arrastreRef.current) return;
    setPan(
      limitarPan(
        { x: e.clientX - arrastreRef.current.x, y: e.clientY - arrastreRef.current.y },
        escala,
        ancho,
        alto,
      ),
    );
  };
  /* Cierra un arrastre de rama. El destino principal es el que resolvió la
   * última `pointermove` (coordenadas del lienzo, con la caja bajo el cursor);
   * si no hubo movimiento —un click, o un entorno sin geometría— cae al nodo
   * que recibió el `pointerup`, que es la misma respuesta que da el navegador.
   * `reubicar=false` cancela (salir del lienzo) sin soltar nada. */
  const terminarArrastre = (e: React.PointerEvent, reubicar: boolean) => {
    arrastreRef.current = null;
    setArrastrandoLienzo(false);
    const origen = draggingRef.current;
    if (origen === null) return;
    const objetivo =
      (e.target as Element)?.closest?.('[data-nodo]')?.getAttribute('data-nodo') ?? null;
    const idDestino = destinoRef.current ?? objetivo;
    draggingRef.current = null;
    destinoRef.current = null;
    setDragging(null);
    setDestino(null);
    setFantasma(null);
    if (!reubicar || !idDestino) return;
    if (!esDestinoReubicable([raizDocumento], origen, idDestino)) return;
    onReubicar?.(origen, idDestino);
  };

  /* El cursor, en coordenadas de las cajas: de la pantalla al lienzo pasando
   * por el `viewBox` y por el zoom. Sin eso, el fantasma y la detección de la
   * caja de destino caerían en otro lado. */
  const puntoGlobal = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg || typeof svg.getScreenCTM !== 'function' || typeof svg.createSVGPoint !== 'function') return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const punto = svg.createSVGPoint();
    punto.x = clientX;
    punto.y = clientY;
    return punto.matrixTransform(ctm.inverse());
  };

  const puntoEnLienzo = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const global = puntoGlobal(clientX, clientY);
    if (!global) return null;
    return { x: (global.x - pan.x) / escala, y: (global.y - pan.y) / escala };
  };

  const destinoValido =
    dragging !== null && destino !== null
      ? esDestinoReubicable([raizDocumento], dragging, destino)
      : false;
  const posDestino = destino !== null ? visibles.find((p) => p.nodo.id === destino) : undefined;
  const insercion = destinoValido ? lineaInsercion(posDestino) : null;

  return (
    <div className="mapa-envoltorio" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className="mapa-barra" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-pressed={soloTitulos}
          onClick={() => setNivelesOcultos(soloTitulos ? new Set() : new Set(ocultosDeSoloTitulos))}
          style={estiloBoton(soloTitulos)}
        >
          Solo H1–H2
        </button>
        <button type="button" aria-label="Alejar" title="Alejar" onClick={() => setEscala((v) => limitarEscala(v - 0.2))} style={estiloIconoBoton}>
          <ZoomOut size={15} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>
        <button type="button" aria-label="Acercar" title="Acercar" onClick={() => setEscala((v) => limitarEscala(v + 0.2))} style={estiloIconoBoton}>
          <ZoomIn size={15} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>
        <button type="button" aria-label="Ajustar" title="Ajustar" onClick={ajustar} style={estiloBoton(escala !== 1 || pan.x !== 0 || pan.y !== 0)}>
          Ajustar
        </button>
        <span
          role="group"
          aria-label="Niveles visibles"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}
        >
          {[1, 2, 3].map((nivel) => {
            const visible = !nivelesOcultos.has(nivel);
            return (
              <button
                key={nivel}
                type="button"
                aria-pressed={visible}
                aria-label={`Nivel ${nivel}`}
                title={`${visible ? 'Ocultar' : 'Mostrar'} H${nivel}`}
                onClick={() => alternarNivel(nivel)}
                style={estiloBoton(visible)}
              >
                <i className={`leyenda lv${nivel}`} aria-hidden /> H{nivel}
              </button>
            );
          })}
        </span>
      </div>

      <svg
        ref={svgRef}
        className={`mapa-estructura${dragging !== null ? ' arrastrando' : ''}`}
        data-testid="diagrama-estructura"
        role="img"
        aria-label="Diagrama de estructura del documento"
        viewBox={`0 0 ${ancho} ${alto}`}
        width="100%"
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: arrastrandoLienzo ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => terminarArrastre(e, true)}
        onPointerLeave={(e) => terminarArrastre(e, false)}
        onPointerCancel={(e) => terminarArrastre(e, false)}
      >
        <g data-testid="mapa-zoom" transform={`translate(${pan.x} ${pan.y}) scale(${escala})`}>
          {insercion ? (
            <rect
              className="mapa-insercion"
              x={insercion.x}
              y={insercion.y}
              width={insercion.ancho}
              height={3}
              rx={1.5}
              aria-hidden
            />
          ) : null}

          {visibles.flatMap((padre) =>
            padre.nodo.hijos
              .filter((hijo) => ids.has(hijo.id))
              .map((hijo) => {
                const dest = porId.get(hijo.id);
                if (!dest) return null;
                const x1 = padre.x + ANCHO_NODO;
                const y1 = padre.y + ALTO_NODO / 2;
                const x2 = dest.x;
                const y2 = dest.y + ALTO_NODO / 2;
                const dx = Math.max(16, (x2 - x1) / 2);
                return (
                  <path
                    key={`${padre.nodo.id}-${hijo.id}`}
                    className={`mapa-arista e${dest.nivel}`}
                    d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  />
                );
              }),
          )}

          {visibles.map((n) => {
            const sel = n.nodo.id === nodoSeleccionadoId;
            const esRaiz = n.nodo.id === RAIZ_ID;
            const esOrigen = dragging === n.nodo.id;
            const esDestino = dragging !== null && destino === n.nodo.id;
            return (
              <g
                key={n.nodo.id}
                data-nodo={n.nodo.id}
                className={`mapa-nodo lv${n.nivel}${sel ? ' sel' : ''}${esOrigen ? ' origen' : ''}${esDestino ? ' destino' : ''}`}
                onClick={() => {
                  if (arrastroRef.current) {
                    arrastroRef.current = false;
                    return;
                  }
                  if (!esRaiz) onSelect?.(n.nodo);
                }}
                onPointerDown={(e) => {
                  if (!onReubicar || esRaiz) return;
                  e.stopPropagation();
                  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                  draggingRef.current = n.nodo.id;
                  destinoRef.current = null;
                  arrastroRef.current = false;
                  setDragging(n.nodo.id);
                  setDestino(null);
                  setFantasma(null);
                }}
                onPointerMove={(e) => {
                  if (draggingRef.current !== n.nodo.id) return;
                  const punto = puntoEnLienzo(e.clientX, e.clientY);
                  setFantasma(punto);
                  const bajo = punto ? destinoBajoCursor(posicionesRef.current, punto.x, punto.y) : null;
                  const id = bajo && bajo !== n.nodo.id ? bajo : null;
                  if (id !== null) arrastroRef.current = true;
                  destinoRef.current = id;
                  setDestino(id);
                }}
                style={{
                  cursor: esRaiz ? 'default' : onSelect ? 'pointer' : 'default',
                }}
              >
                <title>{`Sección: ${(n.nodo.elementoId ? textosTitulo?.get(n.nodo.elementoId) : undefined) ?? n.nodo.titulo}`}</title>
                <rect className="mapa-caja" x={n.x} y={n.y} width={ANCHO_NODO} height={ALTO_NODO} rx={8} />
                <text className="mapa-etiqueta" x={n.x + 12} y={n.y + 24}>
                  {n.etiqueta}
                  {n.hijos > 0 ? ` · +${n.hijos}` : ''}
                </text>
                {esDestino ? (
                  <rect
                    className={`mapa-destino ${destinoValido ? 'valido' : 'invalido'}`}
                    x={n.x - 3}
                    y={n.y - 3}
                    width={ANCHO_NODO + 6}
                    height={ALTO_NODO + 6}
                    rx={10}
                  />
                ) : null}
                {sel ? (
                  <rect className="mapa-anillo" x={n.x - 3} y={n.y - 3} width={ANCHO_NODO + 6} height={ALTO_NODO + 6} rx={10} />
                ) : null}
              </g>
            );
          })}

          {fantasma && dragging !== null ? (
            <g className="mapa-fantasma" aria-hidden pointerEvents="none">
              <rect
                x={fantasma.x - ANCHO_NODO / 2}
                y={fantasma.y - ALTO_NODO / 2}
                width={ANCHO_NODO}
                height={ALTO_NODO}
                rx={8}
              />
              {porId.get(dragging) ? (
                <text x={fantasma.x - ANCHO_NODO / 2 + 12} y={fantasma.y - ALTO_NODO / 2 + 24}>
                  {porId.get(dragging)?.etiqueta}
                </text>
              ) : null}
            </g>
          ) : null}
        </g>
      </svg>
    </div>
  );
};

const estiloBoton = (activo: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  background: activo ? 'var(--color-accent-soft)' : 'transparent',
  border: '1px solid ' + (activo ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
  borderRadius: 'var(--radius-full)',
  padding: '2px var(--space-2)',
  cursor: 'pointer',
});

const estiloIconoBoton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-secondary)',
  background: 'transparent',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-full)',
  padding: '3px',
  cursor: 'pointer',
};

export default MapaEstructura;
