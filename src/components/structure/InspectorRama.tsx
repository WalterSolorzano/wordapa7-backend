/* WordAPA7 — el inspector de rama: qué hay adentro y qué se puede hacer SOLO ahí.
 *
 * CUATRO ACCIONES, Y CADA UNA DICE A QUÉ ALCANCE APLICA.
 *
 * "Reordenar" en un índice jerárquico sin decir a qué aplica es una amenaza, y
 * una acción que dice "esta rama" y toca las hermanas es PEOR que una que no
 * existiera. Por eso el alcance está declarado en una tabla —`ACCIONES`— y se
 * PINTA junto al botón: un alcance que solo existe en el código no evita la
 * amenaza, porque la amenaza es de quien no lee el código.
 *
 * Y LAS CUATRO APLICAN DE VERDAD, cada una por su endpoint:
 *
 *   promover    -> `updateElementType` -> POST /api/update-element
 *   reordenar   -> `reorderElements`    -> POST /api/reorder-elements
 *   renombrar   -> `updateElementText`  -> POST /api/update-element
 *   consultar   -> `sendLiveChat`       -> POST /api/ai/live-chat
 *
 * Lo que no tiene endpoint NO ENTRA en la lista. No hay forma de insertar un
 * capítulo, y por eso esa acción no está en `FaltasApa7`. Un botón que no hace
 * nada ocupa el lugar del que sí, y esa es la clase de defecto que este
 * proyecto vino a matar.
 *
 * LA RAMA SE MUEVE ENTERA. "Mover esta rama abajo" no mueve el encabezado: mueve
 * el encabezado y todo lo que cuelga de él, y deja a sus hermanas con su
 * contenido intacto. Mover solo el título dejaría el cuerpo del capítulo
 * colgando de otro, que es un documento roto.
 */

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Image, Loader2, MessageSquare, PenLine, Quote, Table, TriangleAlert, X } from 'lucide-react';
import { tituloEnDuda, type NodoJerarquia } from '../../lib/jerarquia';
import { sendLiveChat } from '../../api/backend';
import { useDocStore } from '../../store/useDocStore';
import { promoverPorDefecto } from './FaltasApa7';
import { miles } from './BarraBalance';
import type { ElementModel } from '../../types';

export type ClaveAccion = 'promover' | 'reordenar' | 'renombrar' | 'consultar-ia';
/** A qué aplica la acción. Se Pinta, no se supone. */
export type AlcanceAccion = 'esta-rama' | 'todo-el-documento';

export interface AccionRama {
  clave: ClaveAccion;
  /** Lo que dice el botón. */
  etiqueta: string;
  /** Lo que se pinta JUNTO al botón, y es la mitad del contrato. */
  etiquetaAlcance: string;
  alcance: AlcanceAccion;
  /** Por qué esta acción existe y no es un botón mudo. */
  porQue: string;
}

/**
 * LAS CUATRO ACCIONES, y solo las que se pueden hacer.
 *
 * La tabla es el contrato: si una acción no tiene backend, no se declara acá, y
 * la pantalla no la muestra. Agregar una fila sin endpoint es agregar un botón
 * mudo.
 */
export const ACCIONES: AccionRama[] = [
  {
    clave: 'promover',
    etiqueta: 'Promover a H1',
    etiquetaAlcance: 'esta rama',
    alcance: 'esta-rama',
    porQue: 'Promueve esta subsección a capítulo principal de nivel 1.',
  },
  {
    clave: 'reordenar',
    etiqueta: 'Mover esta rama',
    etiquetaAlcance: 'esta rama',
    alcance: 'esta-rama',
    porQue: 'Reorganiza este capítulo y todo su contenido subordinado entre sus secciones hermanas.',
  },
  {
    clave: 'renombrar',
    etiqueta: 'Renombrar',
    etiquetaAlcance: 'esta rama',
    alcance: 'esta-rama',
    porQue: 'Modifica el título de este capítulo o subsección.',
  },
  {
    clave: 'consultar-ia',
    etiqueta: 'Preguntarle a la IA',
    etiquetaAlcance: 'esta rama',
    alcance: 'esta-rama',
    porQue: 'Consulta al copiloto editorial sobre la redacción y contenido sugerido para esta sección.',
  },
];

/** El alcance declarado de una acción, o `null` si la acción no existe. */
export function alcanceDe(clave: ClaveAccion): AlcanceAccion | null {
  return ACCIONES.find((a) => a.clave === clave)?.alcance ?? null;
}

/* ── Mover una rama ────────────────────────────────────────────────────────── */

/**
 * El documento partido en TRAMOS: un tramo por capítulo, más el tramo inicial
 * si el documento empieza con algo que no es un encabezado.
 *
 * Un tramo es un bloque contiguo del documento, y es la unidad que se mueve. Mover
 * el encabezado sin su tramo dejaría el cuerpo del capítulo colgando de otro,
 * que es un documento roto.
 */
function tramosDe(elementos: readonly ElementModel[]): ElementModel[][] {
  const tramos: ElementModel[][] = [];
  for (const e of elementos) {
    const abre = e.type === 'heading' && (e.heading_level ?? 1) === 1;
    if (abre || tramos.length === 0) tramos.push([e]);
    else tramos[tramos.length - 1].push(e);
  }
  return tramos;
}

/**
 * El orden nuevo de TODO el documento si esta rama se mueve entre sus hermanas.
 *
 * `null` cuando no se puede: una rama que ya está al borde no se mueve, y
 * devolver el orden sin cambios sería un botón que dice que hizo algo.
 *
 * Se devuelve el orden COMPLETO de ids porque el endpoint reordena por lista
 * completa: un "mover una posición" sin el resto del orden no dice nada. Y se
 * intercambian TRAMOS, no elementos sueltos, que es lo que hace que las hermanas
 * conserven su contenido y su orden relativo.
 */
export function moverRama(
  nodo: NodoJerarquia,
  elementos: readonly ElementModel[],
  direccion: 'arriba' | 'abajo',
): string[] | null {
  const tramos = tramosDe(elementos);
  const i = tramos.findIndex((t) => t[0]?.id === nodo.elementoId);
  if (i < 0) return null;
  const j = direccion === 'arriba' ? i - 1 : i + 1;
  /* El tramo 0 puede ser el preámbulo —lo que hay antes del primer capítulo— y
     ese no es un capítulo que se pueda subir: mover un capítulo por encima del
     preámbulo lo metería dentro de la portada. */
  if (j < 0 || j >= tramos.length) return null;
  if (direccion === 'arriba' && j === 0 && elementos[0]?.id !== nodo.elementoId) {
    const antesEsEncabezado =
      tramos[0][0]?.type === 'heading' && (tramos[0][0]?.heading_level ?? 1) === 1;
    if (!antesEsEncabezado) return null;
  }
  const orden = tramos.slice();
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return orden.flat().map((e) => e.id);
}

/* ── Preguntar a la IA ─────────────────────────────────────────────────────── */

/** Los textos de la rama, para que la pregunta no sea sobre el título solo. */
function textosDeRama(nodo: NodoJerarquia, elementos: readonly ElementModel[]): string[] {
  const tramo = tramosDe(elementos).find((t) => t[0]?.id === nodo.elementoId) ?? [];
  return tramo
    .filter((e) => e.type !== 'heading' && (e.text || '').trim())
    .map((e) => e.text.trim());
}

/** Lo que se le pregunta a la IA, y que por eso tiene que NOMBRAR la rama. */
export function preguntaDeIa(nodo: NodoJerarquia): string {
  return `¿Qué debería ir en la sección "${nodo.titulo}" de este documento?`;
}

/** La pregunta con el contenido de la rama, que es lo que la hace útil. */
export function preguntasDeIa(nodo: NodoJerarquia, elementos: readonly ElementModel[] = []): string {
  const textos = textosDeRama(nodo, elementos);
  const cuerpo = textos.length > 0 ? `\n\nHoy dice:\n${textos.join('\n')}` : '\n\nLa sección está vacía.';
  return `${preguntaDeIa(nodo)}${cuerpo}`;
}

/* ── El componente ─────────────────────────────────────────────────────────── */

export interface InspectorRamaProps {
  nodo: NodoJerarquia;
  /** Los elementos del documento: hacen falta para mover la rama y para
   *  mostrar qué hay adentro. */
  elementos: readonly ElementModel[];
  onPromover?: (nodo: NodoJerarquia) => void | Promise<void>;
  onRenombrar?: (nodo: NodoJerarquia, titulo: string) => void | Promise<void>;
  onReordenar?: (nodo: NodoJerarquia, direccion: 'arriba' | 'abajo') => void | Promise<void>;
  onConsultarIa?: (nodo: NodoJerarquia, pregunta: string) => void | Promise<void>;
}

export const InspectorRama: React.FC<InspectorRamaProps> = ({
  nodo,
  elementos,
  onPromover,
  onRenombrar,
  onReordenar,
  onConsultarIa,
}) => {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nodo.titulo);
  const [respuesta, setRespuesta] = useState<string | null>(null);

  // Sincronizar borrador cuando el nodo seleccionado cambia
  React.useEffect(() => {
    setBorrador(nodo.titulo);
    setEditando(false);
    setRespuesta(null);
  }, [nodo.id, nodo.titulo]);

  const textos = useMemo(() => textosDeRama(nodo, elementos), [nodo, elementos]);
  const puedeSubir = moverRama(nodo, elementos, 'arriba') !== null;
  const puedeBajar = moverRama(nodo, elementos, 'abajo') !== null;
  const esH1 = nodo.nivel === 1;
  const enDuda = !esH1 ? tituloEnDuda(nodo) : null;

  const promover = onPromover ?? promoverPorDefecto;
  const renombrar = onRenombrar ?? ((n: NodoJerarquia, titulo: string) => {
    if (!n.elementoId) return;
    return useDocStore.getState().updateElementText(n.elementoId, titulo);
  });
  const reordenar = onReordenar ?? (async (n: NodoJerarquia, direccion: 'arriba' | 'abajo') => {
    const orden = moverRama(n, elementos, direccion);
    const doc = useDocStore.getState().doc;
    if (!orden || !doc) return;
    await useDocStore.getState().reorderElements(orden);
    useDocStore.getState().showToast(`Sección "${n.titulo}" movida hacia ${direccion}`, 'info');
  });
  const [consultando, setConsultando] = useState(false);
  const consultar = onConsultarIa ?? (async (n: NodoJerarquia, pregunta: string) => {
    const doc = useDocStore.getState().doc;
    if (!doc) return;
    try {
      setConsultando(true);
      const res = await sendLiveChat(doc.session_id, pregunta, n.elementoId);
      setRespuesta(res?.reply ?? null);
    } finally {
      setConsultando(false);
    }
  });

  const boton = (clave: ClaveAccion, children: React.ReactNode): React.ReactElement => {
    const accion = ACCIONES.find((a) => a.clave === clave)!;
    const deshabilitado = clave === 'consultar-ia' ? consultando : false;
    return (
      <button
        type="button"
        disabled={deshabilitado}
        title={accion.porQue}
        onClick={() => {
          if (clave === 'promover') void promover(nodo);
          if (clave === 'reordenar') void reordenar(nodo, 'abajo');
          if (clave === 'renombrar') setEditando(true);
          if (clave === 'consultar-ia') void consultar(nodo, preguntasDeIa(nodo, elementos));
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          font: 'inherit',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '3px 8px',
          cursor: 'pointer',
        }}
      >
        {children}
        {/* EL ALCANCE, AL LADO DEL BOTÓN. Es la mitad del contrato: sin esto,
            "mover" es una amenaza y con esto es una operación con alcance. */}
        <span style={{ color: 'var(--color-text-tertiary)' }}>({accion.etiquetaAlcance})</span>
      </button>
    );
  };

  return (
    <section
      aria-label={`Rama ${nodo.titulo}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      {/* Header con nivel y título editable */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          paddingBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: esH1 ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
              color: esH1 ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              border: '1px solid',
              borderColor: esH1 ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
          >
            Encabezado Nivel {nodo.nivel}
          </span>
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              <PenLine size={12} strokeWidth="var(--icon-stroke)" aria-hidden />
              Editar
            </button>
          )}
        </div>

        {editando ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
            <input
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              aria-label="Nuevo nombre de la sección"
              style={{
                flex: '1 1 auto',
                font: 'inherit',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-focus)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 10px',
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void renombrar(nodo, borrador.trim() || nodo.titulo);
                  setEditando(false);
                } else if (e.key === 'Escape') {
                  setBorrador(nodo.titulo);
                  setEditando(false);
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                void renombrar(nodo, borrador.trim() || nodo.titulo);
                setEditando(false);
              }}
              style={{
                font: 'inherit',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--color-text-on-accent)',
                background: 'var(--color-accent)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '6px 12px',
              }}
            >
              Guardar
            </button>
          </div>
        ) : (
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              lineHeight: 1.3,
            }}
            title={nodo.titulo}
          >
            {nodo.titulo}
          </h2>
        )}
      </div>

      {enDuda && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--severity-warning-soft)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-warning)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <TriangleAlert
              size={14}
              strokeWidth="var(--icon-stroke)"
              aria-hidden
              style={{ flex: '0 0 auto', color: 'var(--color-warning)' }}
            />
            <span style={{ color: 'var(--color-text-primary)' }}>
              &ldquo;{enDuda}&rdquo; coincide con una fase canónica de APA 7 mal nivelada.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void promover(nodo)}
            style={{
              flex: '0 0 auto',
              font: 'inherit',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-text-on-accent)',
              background: 'var(--color-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Promover a H1
          </button>
        </div>
      )}

      {/* Grid de Métricas de la Sección */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-2)',
        }}
      >
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-bg-surface-alt)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {miles(nodo.palabras)}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Palabras totales</span>
        </div>
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-bg-surface-alt)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {textos.length}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Párrafos en rama</span>
        </div>
      </div>

      {/* Inventario de Objetos y Evidencias en esta Rama */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Inventario de la rama
        </span>
        {nodo.palabras === 0 ? (
          <p
            role="status"
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--severity-warning-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--color-warning)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              margin: 0,
            }}
          >
            <TriangleAlert size={14} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-warning)' }} />
            <span>Esta rama está sin contenido: existe el encabezado y no hay texto debajo.</span>
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-2)',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
              <Quote size={13} style={{ color: 'var(--color-accent)' }} />
              <span><strong>{nodo.citas}</strong> citas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
              <Image size={13} style={{ color: 'var(--color-accent)' }} />
              <span><strong>{nodo.figuras}</strong> figuras</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
              <Table size={13} style={{ color: 'var(--color-accent)' }} />
              <span><strong>{nodo.tablas}</strong> tablas</span>
            </div>
          </div>
        )}
      </div>

      {/* Acciones de Edición Estructural */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Operaciones de rama
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!esH1 && boton('promover', <>Promover a H1</>)}
          <button
            type="button"
            disabled={!puedeSubir}
            title={ACCIONES[1].porQue}
            onClick={() => void reordenar(nodo, 'arriba')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', font: 'inherit',
              fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', padding: '5px 10px',
              cursor: puedeSubir ? 'pointer' : 'not-allowed', opacity: puedeSubir ? 1 : 0.5,
              transition: 'background var(--transition-fast)',
            }}
          >
            <ArrowUp size={13} strokeWidth="var(--icon-stroke)" aria-hidden />
            Subir <span style={{ color: 'var(--color-text-tertiary)' }}>({ACCIONES[1].etiquetaAlcance})</span>
          </button>
          <button
            type="button"
            disabled={!puedeBajar}
            title={ACCIONES[1].porQue}
            onClick={() => void reordenar(nodo, 'abajo')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', font: 'inherit',
              fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', padding: '5px 10px',
              cursor: puedeBajar ? 'pointer' : 'not-allowed', opacity: puedeBajar ? 1 : 0.5,
              transition: 'background var(--transition-fast)',
            }}
          >
            <ArrowDown size={13} strokeWidth="var(--icon-stroke)" aria-hidden />
            Bajar <span style={{ color: 'var(--color-text-tertiary)' }}>({ACCIONES[1].etiquetaAlcance})</span>
          </button>
          {boton('renombrar', <><PenLine size={13} strokeWidth="var(--icon-stroke)" aria-hidden />Renombrar</>)}
          {boton(
            'consultar-ia',
            consultando ? (
              <>
                <Loader2 size={13} strokeWidth="var(--icon-stroke)" style={{ animation: 'spin 1s linear infinite' }} aria-hidden />
                Consultando a la IA…
              </>
            ) : (
              <>
                <MessageSquare size={13} strokeWidth="var(--icon-stroke)" aria-hidden />
                Preguntarle a la IA
              </>
            ),
          )}
        </div>
      </div>

      {respuesta && (
        <div
          role="region"
          aria-label="Respuesta de la IA"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-accent-soft)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-accent)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-primary)',
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>Respuesta del copiloto IA:</span>
            <button
              type="button"
              onClick={() => setRespuesta(null)}
              title="Cerrar respuesta"
              aria-label="Cerrar respuesta"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              <X size={12} strokeWidth="var(--icon-stroke)" />
            </button>
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{respuesta}</div>
        </div>
      )}
    </section>
  );
};

export default InspectorRama;
