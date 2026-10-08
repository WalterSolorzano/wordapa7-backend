/**
 * WordAPA7 — el carrusel de portada: la activa SIEMPRE al centro.
 *
 * Cómo funciona: NO hay marco central que se corra. Cada tarjeta se posiciona
 * de forma absoluta con su borde izquierdo en el 50% de la pista y se desplaza
 * con `translateX((i - indice) * paso)`: la activa cae en el centro por
 * construcción —con cualquier número de tarjetas y sin depender del
 * `justify-content`— y las vecinas se ordenan a los costados con escala y
 * `rotateY` por distancia. El índice es una sola fuente de verdad: la tira no
 * tiene su propio estado de "cuál está activa", y la tarjeta, la flecha, el
 * teclado y el arrastre escriben el mismo índice.
 *
 * LO QUE ESTABA MAL Y NO VUELVE:
 * - `transform: undefined` para una tarjeta a más de `VECINAS_POR_LADO` puestos
 *   de la activa, junto con `filter: brightness(0.48)`. La hoja blanca
 *   multiplicada por 0.48 es un gris plano: la tarjeta lejana se veía como una
 *   losa vacía, sin diseño. Ahora el receso es SOLO escala: el papel se queda
 *   blanco puro (`AGENTS.md` §1) y la miniatura se lee en las cinco.
 * - El corrimiento no existía: el centro lo ocupaba la tercera tarjeta, no la
 *   elegida.
 *
 * La elección de la miniatura NO vive acá: cada tarjeta monta
 * `MiniaturaRealDePortada`, que es el mismo componente del editor a escala real.
 *
 * Accesibilidad: cada tarjeta es un `<button>` de verdad (foco, Enter y Espacio
 * del navegador, sin `tabindex` manual), el grupo se maneja con el teclado
 * (`←` `→` `Inicio` `Fin`) y con `prefers-reduced-motion` no hay `transform` ni
 * `transition`: el carrusel se vuelve una tira con scroll y los mismos controles.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import type { Hoja } from '../../../lib/portada/geometria';
import { MiniaturaRealDePortada, medidaDeLaMiniatura } from './MiniaturaRealDePortada';
import { HojaDatosPortada, HOJA_DE_DATOS_TESTID } from './HojaDatosPortada';
import { EditorialMascot, type MascotKind, type MascotExpression } from '../../layout/EditorialMascot';

function obtenerMascotaDePortada(disenoId: string): {
  kind: MascotKind;
  expression: MascotExpression;
  mensaje: string;
} {
  switch (disenoId) {
    case 'original':
      return {
        kind: 'reference',
        expression: 'happy',
        mensaje: 'Protegiendo logos y formato original del documento',
      };
    case 'apa7':
      return {
        kind: 'highlighter',
        expression: 'excited',
        mensaje: 'Formato oficial APA 7 para entregas académicas',
      };
    case 'uni':
      return {
        kind: 'ruler',
        expression: 'curious',
        mensaje: 'Estructura universitaria institucional oficial',
      };
    case 'pro':
      return {
        kind: 'gear',
        expression: 'happy',
        mensaje: 'Portada profesional con titulación corrida y numeración',
      };
    case 'custom':
      return {
        kind: 'highlighter',
        expression: 'curious',
        mensaje: 'Importa tu propia plantilla Word (.docx)',
      };
    default:
      return {
        kind: 'reference',
        expression: 'neutral',
        mensaje: 'Selecciona un estilo de portada',
      };
  }
}

export type DisenoDePortada = {
  id: string;
  titulo: string;
  subtitulo: string;
  /** La última tarjeta es una ACCIÓN (abrir el selector), no un estado. */
  esAccion?: boolean;
};

/** Los cinco modos, con el diseño que los dibuja de verdad.
 *
 *  Si un modo no tiene componente, no puede entrar en la lista: no puede pasar
 *  lo de `original`, que se caía a un placeholder sin miniatura propia. */
export const DISENOS_DE_PORTADA: DisenoDePortada[] = [
  { id: 'original', titulo: 'Conservar original', subtitulo: 'Mantiene logos y diseño · recomendado' },
  { id: 'apa7', titulo: 'APA 7 Estándar', subtitulo: 'Formato oficial 7ª edición' },
  { id: 'uni', titulo: 'Institucional UNI', subtitulo: 'Plantilla oficial universitaria' },
  { id: 'pro', titulo: 'Profesional APA', subtitulo: 'Con running head y página' },
  { id: 'custom', titulo: '+ Subir plantilla', subtitulo: 'Sube tu propia plantilla .docx', esAccion: true },
];

/** Cuántas tarjetas se ven a cada lado de la activa.
 *
 *  Sale de AQUÍ y no de un número escrito en el JSX: define la escala de las
 *  vecinas y la de las que quedan lejos. Con la tarjeta de 224px, dos por lado
 *  es lo que entra sin que la activa quede pegada al borde. */
export const VECINAS_POR_LADO = 2;

export { HOJA_DE_DATOS_TESTID };

/** Ancho de la miniatura. La miniatura es la hoja real a menos escala. */
const ANCHO_DE_MINIATURA_PX = 224;

/** La separación entre tarjetas, en píxeles y no en un token de espacio.
 *
 *  Tiene que ser el MISMO número que el paso del corrimiento: el centro se
 *  calcula con él. Si la separación saliera de un `var(--space-*)` y el paso de
 *  un literal, las dos cuentas dirían cosas distintas en la primera pantalla
 *  con otro ancho. */
const SEPARACION_PX = 20;

/** Escala de las vecinas inmediatas y de las que quedan lejos.
 *  Bajadas desde el mockup: en 0.58/0.42 el fondo pesaba demasiado y competía
 *  con la activa. 0.46/0.30 deja una sola protagonista. */
const ESCALA_VECINA = 0.46;
const ESCALA_LEJANA = 0.30;
/** Grados de `rotateY` de una vecina (efecto coverflow). */
const ROTACION_VECINA_DEG = 16;
/** Alto reservado debajo de la hoja para el rótulo (título + subtítulo). */
const ALTO_ETIQUETA_PX = 72;

/** Cuánto hay que arrastrar para que el arrastre cuente como paso. */
export const UMBRAL_DE_ARRASTRE_PX = 48;

/** Qué paso pide un arrastre, dado su desplazamiento horizontal.
 *
 *  Arrastrar la fila hacia la izquierda (dedo hacia la izquierda, `deltaX`
 *  negativo) avanza a la siguiente. Por debajo del umbral no mueve: un temblor
 *  del pulgar no puede cambiar la portada elegida. */
export function pasoDeArrastre(deltaX: number, umbral: number = UMBRAL_DE_ARRASTRE_PX): -1 | 0 | 1 {
  if (Math.abs(deltaX) < umbral) return 0;
  return deltaX < 0 ? 1 : -1;
}

/** Lee `prefers-reduced-motion` y se suscribe a sus cambios.
 *
 *  `matchMedia` no es una API con garantía: no existe en los WebViews viejos y
 *  el propio repo ya tiene un test de eso. Por eso la guarda de existencia. */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    /* El listener no recibe el evento a propósito: se lee `mq.matches` en el
       momento del cambio. Safari viejo llama al callback con CERO argumentos,
       así que un `(e) => setReducido(e.matches)` revienta ahí con "cannot read
       property matches of undefined". */
    const alCambiar = () => setReducido(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', alCambiar);
      return () => mq.removeEventListener('change', alCambiar);
    }
    // Safari viejo y los WebViews: `addListener`, no `addEventListener`.
    const viejo = mq as unknown as { addListener?: (f: () => void) => void; removeListener?: (f: () => void) => void };
    viejo.addListener?.(alCambiar);
    return () => viejo.removeListener?.(alCambiar);
  }, []);
  return reducido;
}

/** La escala de una tarjeta según su distancia a la activa. */
function escalaDeLaTarjeta(distancia: number): number {
  if (distancia === 0) return 1;
  return distancia <= VECINAS_POR_LADO ? ESCALA_VECINA : ESCALA_LEJANA;
}

export interface CarruselPortadaProps {
  /** Qué hacer con el modo que se elige. La lista de estrategias lo provee. */
  onSelect?: (id: string) => void;
  /** Cuál está activa. Sin esto el carrusel se desincroniza de la tira. */
  modoActivo?: string | null;
  hoja?: Hoja;
  /** Acción de la última tarjeta: abrir el selector de plantillas. */
  onUpload?: () => void;
  /** Si se elige un diseño, se muestra la hoja de datos. */
  onElegirDiseno?: (id: string) => void;
  /** Ancho personalizado para modo carrusel principal grande */
  anchoMiniatura?: number;
  /** Callback para confirmar y entrar al editor dividido */
  onConfirmSelect?: (id: string) => void;
}

export const CarruselPortada: React.FC<CarruselPortadaProps> = ({
  onSelect,
  modoActivo,
  hoja = 'carta',
  onUpload,
  onElegirDiseno,
  anchoMiniatura,
  onConfirmSelect,
}) => {
  const portada = useDocStore((s) => s.portada);
  const acta = useDocStore((s) => s.acta);
  const reglas = useDocStore((s) => s.rules);
  const reducido = useMovimientoReducido();
  const pistaRef = useRef<HTMLDivElement>(null);
  /* Dónde empezó el arrastre. `null` es "no hay arrastre en curso". */
  const arrastreRef = useRef<number | null>(null);
  /* La hoja de datos aparece AL ELEGIR un diseño, y se cierra sola al cambiar
     de fase (está en `HojaDatosPortada`). */
  const [datosAbiertos, setDatosAbiertos] = useState(false);

  const modo: string = modoActivo ?? '';
  // El índice nace en el modo activo, no en 0: al volver al carrusel desde el
  // editor (que ahora lo desmonta) la tarjeta elegida no parpadea desde la primera.
  const [indice, setIndice] = useState(() => {
    const i = DISENOS_DE_PORTADA.findIndex((d) => d.id === modo);
    return i >= 0 ? i : 0;
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // El índice sigue al modo activo: si el documento ya trae un modo, el carrusel
  // tiene que estar en esa tarjeta. Sin esto, dos controles distintos dicen dos
  // cosas distintas de la misma elección.
  useEffect(() => {
    const i = DISENOS_DE_PORTADA.findIndex((d) => d.id === modo);
    if (i >= 0) setIndice(i);
  }, [modo]);

  const irA = useCallback((destino: number) => {
    const total = DISENOS_DE_PORTADA.length;
    // El rango se acota en los dos extremos a propósito. Un carrusel que al
    // llegar al primero te tira al último es un portal, no un carrusel, y uno que
    // al llegar al último no hace nada deja al usuario preguntándose si se rompió.
    setIndice(Math.min(total - 1, Math.max(0, destino)));
  }, []);

  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      irA(indice - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      irA(indice + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      irA(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      irA(DISENOS_DE_PORTADA.length - 1);
    }
  };

  const elegir = (id: string) => {
    if (DISENOS_DE_PORTADA.find((d) => d.id === id)?.esAccion) {
      onUpload?.();
      return;
    }
    onSelect?.(id);
    setDatosAbiertos(true);
    onElegirDiseno?.(id);
  };

  /* ── Arrastre (dedo y ratón) ── */
  const alSoltar = (clientX: number) => {
    const x0 = arrastreRef.current;
    arrastreRef.current = null;
    if (x0 === null) return;
    const paso = pasoDeArrastre(clientX - x0);
    if (paso !== 0) irA(indice + paso);
  };

  const anchoEfectivo = anchoMiniatura || ANCHO_DE_MINIATURA_PX;
  const paso = anchoEfectivo + SEPARACION_PX;
  const disenoActual = DISENOS_DE_PORTADA[indice] || DISENOS_DE_PORTADA[0];
  const mascotaActual = obtenerMascotaDePortada(disenoActual.id);
  const medidaActiva = medidaDeLaMiniatura(disenoActual.id, hoja, reglas);
  const escalaActiva = anchoEfectivo / medidaActiva.ancho;
  const altoDeLaTarjeta = medidaActiva.alto * escalaActiva + ALTO_ETIQUETA_PX;

  return (
    <>
    <div
      data-testid="carrusel"
      role="group"
      aria-label="Diseños de portada"
      tabIndex={0}
      onKeyDown={alTeclado}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%', alignItems: 'center', flex: 1, minHeight: 0, justifyContent: 'space-between', padding: 'var(--space-2) 0' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', width: '100%', flexWrap: 'wrap' }}>
        {/* Mascota editorial con mensaje contextual */}
        <div
          data-testid="portada-mascota-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <EditorialMascot size={32} kind={mascotaActual.kind} expression={mascotaActual.expression} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
              {disenoActual.titulo}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
              {mascotaActual.mensaje}
            </span>
          </div>
        </div>

        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: 'var(--space-1) var(--space-3)',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
            fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {indice + 1} de {DISENOS_DE_PORTADA.length}
        </span>
      </div>

      {/* ── Flechas a los lados de la hoja, y la pista en el medio ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center', flex: 1, minHeight: 0 }}>
        <button
          type="button"
          aria-label="Ir al diseño anterior"
          onClick={() => irA(indice - 1)}
          disabled={indice === 0}
          style={{
            position: 'absolute',
            left: '12px',
            zIndex: 40,
            width: 46, height: 46,
            borderRadius: 'var(--radius-full)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: indice === 0 ? 'not-allowed' : 'pointer',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)',
            opacity: indice === 0 ? 0.3 : 0.95,
            transition: 'opacity 0.15s ease, background 0.15s ease, transform 0.15s ease',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <ChevronLeft size={24} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>

        <div
          ref={pistaRef}
          data-testid="cover-model-track"
          onPointerDown={(e) => { arrastreRef.current = e.clientX; }}
          onPointerUp={(e) => alSoltar(e.clientX)}
          onPointerLeave={() => { arrastreRef.current = null; }}
          onPointerCancel={() => { arrastreRef.current = null; }}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflowX: reducido ? 'auto' : 'hidden',
            overflowY: 'visible',
            padding: 'var(--space-2) 0',
            scrollbarWidth: 'thin',
            /* El arrastre es horizontal; el scroll vertical de la pantalla
               sigue siendo del navegador. */
            touchAction: 'pan-y',
          }}
        >
          <div
            data-testid="cover-carousel-row"
            style={
              reducido
                ? { display: 'flex', alignItems: 'center', gap: SEPARACION_PX }
                : { position: 'relative', width: '100%', height: altoDeLaTarjeta, perspective: '1200px' }
            }
          >
            {DISENOS_DE_PORTADA.map((d, i) => {
              const activa = i === indice;
              const distancia = Math.abs(i - indice);
              const isHovered = hoveredId === d.id && !activa;
              const dir = i - indice;
              const escala = escalaDeLaTarjeta(distancia);
              const rotacion = dir === 0 ? 0 : (dir > 0 ? 1 : -1) * ROTACION_VECINA_DEG;

              return (
                <div
                  key={d.id}
                  data-testid={`tarjeta-${d.id}`}
                  onMouseEnter={() => setHoveredId(d.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    irA(i);
                    elegir(d.id);
                  }}
                  style={{
                    ...(reducido
                      ? { position: 'relative' as const, flex: '0 0 auto', width: anchoEfectivo }
                      : {
                          position: 'absolute' as const,
                          top: 0,
                          left: '50%',
                          marginLeft: -anchoEfectivo / 2,
                          width: anchoEfectivo,
                        }),
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer',
                    background: activa ? 'var(--color-bg-surface)' : 'var(--color-bg-surface-alt)',
                    opacity: activa ? 1 : isHovered ? 0.88 : 0.68,
                    border: activa
                      ? '2px solid var(--color-accent)'
                      : isHovered
                        ? '1px solid var(--color-accent)'
                        : '1px solid var(--color-border-subtle)',
                    boxShadow: activa
                      ? '0 24px 48px var(--shadow-card), 0 0 0 1px var(--color-accent), 0 0 24px var(--color-accent-soft)'
                      : isHovered
                        ? '0 10px 24px var(--shadow-card), 0 0 0 1px var(--color-border-subtle)'
                        : 'var(--shadow-sm)',
                    transform: reducido
                      ? undefined
                      : `translateX(${dir * paso}px) scale(${escala})${dir === 0 ? '' : ` rotateY(${rotacion}deg)`}`,
                    transformOrigin: 'center center',
                    transition: reducido
                      ? undefined
                      : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease, border-color 200ms ease, opacity 200ms ease',
                    display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px',
                    zIndex: activa ? 30 : Math.max(1, 20 - distancia * 5),
                    boxSizing: 'border-box',
                    /* La hoja se dibuja a `anchoEfectivo` y el padding la saca de
                       la caja: sin recorte asoma un filo fuera del scrim. */
                    overflow: 'hidden',
                  }}
                >
                  {!activa && (
                    <div
                      data-testid={`scrim-${d.id}`}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: 'var(--canvas-bg)',
                        opacity: isHovered ? 0.12 : Math.min(0.5, 0.24 + distancia * 0.08),
                        pointerEvents: 'none',
                        transition: 'opacity 200ms ease',
                        zIndex: 5,
                      }}
                    />
                  )}
                  {/* La HOJA va FUERA del botón a propósito. Adentro sería un
                      botón dentro de un botón: el diseño real trae sus propios
                      controles (el lienzo de la portada original), y anidarlos
                      es HTML inválido además de mentirle al lector de pantalla.
                      El botón de abajo es el control; la hoja es la imagen. */}
                  <MiniaturaRealDePortada diseno={d.id} anchoPx={anchoEfectivo} hoja={hoja} />
                  <button
                    type="button"
                    data-testid={`miniatura-${d.id}`}
                    aria-pressed={d.esAccion ? undefined : activa}
                    aria-current={activa ? 'true' : undefined}
                    onClick={(e) => {
                      /* El envoltorio ya escucha el clic: sin esto, elegir con
                         el botón elegiría dos veces. */
                      e.stopPropagation();
                      irA(i);
                      elegir(d.id);
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', marginTop: '4px',
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          fontSize: 'var(--text-sm)', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {d.titulo}
                      </span>
                      {activa && (
                        <EditorialMascot size={20} kind={mascotaActual.kind} expression={mascotaActual.expression} />
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
                        lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {d.subtitulo}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label="Ir al siguiente diseño"
          onClick={() => irA(indice + 1)}
          disabled={indice === DISENOS_DE_PORTADA.length - 1}
          style={{
            position: 'absolute',
            right: '12px',
            zIndex: 40,
            width: 46, height: 46,
            borderRadius: 'var(--radius-full)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: indice === DISENOS_DE_PORTADA.length - 1 ? 'not-allowed' : 'pointer',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)',
            opacity: indice === DISENOS_DE_PORTADA.length - 1 ? 0.3 : 0.95,
            transition: 'opacity 0.15s ease, background 0.15s ease, transform 0.15s ease',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <ChevronRight size={24} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>
      </div>

      {/* Botón de Confirmación Principal / CTA en la vista del Carrusel */}
      {onConfirmSelect && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
          <button
            type="button"
            data-testid="btn-seleccionar-portada-cta"
            onClick={() => {
              const actual = DISENOS_DE_PORTADA[indice];
              if (actual?.esAccion) {
                onUpload?.();
              } else {
                onConfirmSelect(actual?.id || 'original');
              }
            }}
            style={{
              padding: '12px 28px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              border: 'none',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px var(--shadow-card)',
              transition: 'transform 0.15s ease, background 0.15s ease',
            }}
          >
            <span>{DISENOS_DE_PORTADA[indice]?.esAccion ? 'Subir plantilla .docx' : 'Seleccionar esta portada'}</span>
            <ChevronRight size={16} strokeWidth="var(--icon-stroke)" aria-hidden />
          </button>
        </div>
      )}
    </div>
    {datosAbiertos && <HojaDatosPortada pasoActual={1} pasoDePortada={1} />}
    </>
  );
};

export default CarruselPortada;
