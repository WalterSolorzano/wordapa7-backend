/* WordAPA7 — Chip "Word" de la barra superior.
 *
 * QUE ES. El unico punto de la app que dice si el complemento esta trabajando
 * EN VIVO sobre el documento abierto en Word, y que ofrece conectar cuando no
 * lo esta.
 *
 * QUE NO PUEDE HACER, y por eso el chip esta escrito como esta. El panel del
 * complemento (Office.js) no se abre desde afuera de Word: se abre con el boton
 * del ribbon o con `setStartupBehavior(load)`. Lo que si se puede es traer al
 * frente el `.docx` del usuario. Por eso el chip NUNCA promete "panel abierto":
 * abre el archivo y dice donde esta el boton.
 *
 * EL ESTADO NO SE INVENTA. `en-vivo` sale de `active_in_word`, que es el latido
 * del taskpane (cada 60 s, techo 120 s en el backend). `installed` sale del
 * sideload. Este componente no publica latido jamas: si lo hiciera, se
 * declararia conectado por estar abierto, que es la forma elegante de mentir.
 *
 * SIGNAL, UNA SOLA. El estado se carga en el tinte (fondo y borde de acento
 * solo cuando esta en vivo), no en un semaforo de tres colores. Y la marca es un
 * CUADRADO de 6px, no un circulo: la hoja APA no tiene redondeo, y esa es la
 * geometria propia de este producto. El momento coreografiado es uno — el
 * cuadrado aparece con escala cuando la conexion se establece.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelRightClose, PanelRightDashed, PanelRightOpen, Plug } from 'lucide-react';
import {
  connectWord,
  getWordConnection,
  repairSideload,
  type WordConnection,
} from '../../api/backend';
import { useDocStore } from '../../store/useDocStore';

type ChromeStyle = React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };
const noDragRegion = { WebkitAppRegion: 'no-drag' } as ChromeStyle;

export type EstadoWord = 'en-vivo' | 'panel-cerrado' | 'sin-complemento' | 'sin-respuesta';

/** Traduce el estado del motor a los cuatro estados que la persona puede ver.
 *
 *  `null` es "no se pudo consultar", que NO es lo mismo que "no instalado":
 *  pintar el primero como el segundo mandaria a reinstalar un complemento que
 *  quiza anda perfecto. La diferencia importa porque la accion es distinta.
 */
export function estadoDeConexion(conexion: WordConnection | null): EstadoWord {
  if (conexion === null) return 'sin-respuesta';
  if (conexion.active_in_word) return 'en-vivo';
  if (!conexion.installed) return 'sin-complemento';
  return 'panel-cerrado';
}

const PRESENTACION: Record<
  EstadoWord,
  { Icono: typeof Plug; etiqueta: string; titulo: string; vivo: boolean }
> = {
  'en-vivo': {
    Icono: PanelRightOpen,
    etiqueta: 'Word en vivo',
    titulo: 'El complemento esta trabajando sobre el documento abierto en Word.',
    vivo: true,
  },
  'panel-cerrado': {
    Icono: PanelRightClose,
    etiqueta: 'Panel cerrado',
    titulo:
      'El complemento esta instalado y su panel no esta abierto. Un clic abre tu documento en Word.',
    vivo: false,
  },
  'sin-complemento': {
    Icono: Plug,
    etiqueta: 'Sin complemento',
    titulo: 'El complemento de Word no esta instalado. Un clic intenta instalarlo.',
    vivo: false,
  },
  'sin-respuesta': {
    Icono: PanelRightDashed,
    etiqueta: 'Sin respuesta',
    titulo: 'No se pudo consultar el motor. Un clic vuelve a preguntar.',
    vivo: false,
  },
};

/** Cada cuanto se vuelve a preguntar. El latido del add-in es de 60 s, asi que
 *  sondear mas seguido no agrega informacion, solo ruido. */
const INTERVALO_SONDEO_MS = 30_000;

export function WordLiveChip() {
  const activeFilePath = useDocStore((s) => s.activeFilePath);
  const [conexion, setConexion] = useState<WordConnection | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const vivo = useRef(false);

  const consultar = useCallback(async () => {
    try {
      const nueva = await getWordConnection();
      if (!vivo.current) return;
      setConexion(nueva);
    } catch {
      /* El motor caido no es "no instalado": es "no se sabe". */
      if (!vivo.current) return;
      setConexion(null);
    } finally {
      if (vivo.current) setConsultado(true);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void consultar();
    const timer = window.setInterval(() => void consultar(), INTERVALO_SONDEO_MS);

    /* El momento real de uso: la persona vuelve de Word a la app. Refrescar al
       recuperar el foco es lo que hace que el chip diga la verdad justo cuando
       alguien la mira, sin esperar los 30 s del intervalo. */
    const alVolver = () => void consultar();
    window.addEventListener('focus', alVolver);

    return () => {
      vivo.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', alVolver);
    };
  }, [consultar]);

  const estado: EstadoWord = consultado ? estadoDeConexion(conexion) : 'sin-respuesta';
  const { Icono, etiqueta, titulo, vivo: esVivo } = PRESENTACION[estado];
  const showToast = useDocStore((s) => s.showToast);

  const onClick = useCallback(async () => {
    if (ocupado) return;
    if (estado === 'en-vivo') return;

    setOcupado(true);
    try {
      if (estado === 'sin-complemento') {
        await repairSideload();
        showToast('Complemento instalado. Cerrá Word por completo y volvé a abrirlo.', 'success');
      } else if (estado === 'panel-cerrado') {
        if (!activeFilePath) {
          showToast('Abrí primero un documento para poder llevarlo a Word.', 'info');
          return;
        }
        await connectWord(activeFilePath);
        showToast(
          'Documento abierto en tu Word. Si el panel no aparece: pestaña WordAPA7, botón Panel.',
          'success',
        );
      }
    } catch {
      showToast('No se pudo conectar con Word.', 'error');
    } finally {
      setOcupado(false);
      void consultar();
    }
  }, [activeFilePath, consultar, estado, ocupado, showToast]);

  return (
    <button
      type="button"
      data-testid="word-live-chip"
      data-estado={estado}
      onClick={onClick}
      disabled={ocupado}
      aria-busy={ocupado}
      aria-label={`${etiqueta}. ${titulo}`}
      title={titulo}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${esVivo ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
        background: esVivo ? 'var(--color-accent-soft)' : 'transparent',
        color: esVivo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: ocupado ? 'wait' : 'pointer',
        opacity: ocupado ? 0.6 : 1,
        transition: 'background 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1), color 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...noDragRegion,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          /* El cuadrado es el papel: la hoja APA no tiene redondeo. */
          borderRadius: 1,
          background: esVivo ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          opacity: esVivo ? 1 : 0.5,
          transform: `scale(${esVivo ? 1 : 0.72})`,
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), background 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
      <Icono size={14} strokeWidth={1.75} aria-hidden />
      <span aria-live="polite">{etiqueta}</span>
    </button>
  );
}

export default WordLiveChip;
