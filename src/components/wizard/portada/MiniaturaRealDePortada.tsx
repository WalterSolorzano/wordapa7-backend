/**
 * WordAPA7 — la miniatura de portada es el DISEÑO REAL, a escala.
 *
 * El defecto que este archivo cierra: las cinco tarjetas del carrusel eran un
 * DIBUJO PARALELO del diseño (`MiniaturasDeDiseno`), con `Times New Roman`
 * escrito a mano, cuatro bloques de texto y ninguno de los campos que el `.docx`
 * sí escribe (autor, docente, fecha, carrera). El usuario elegía mirando algo que
 * no era lo que iba a salir, y la única forma de descubrir la diferencia era
 * exportar.
 *
 * Acá la miniatura ES el componente que la app ya usa para mostrar el diseño de
 * verdad —el mismo del editor—, montado en su ancho de hoja y reducido con una
 * escala DERIVADA de `lib/portada/geometria` (y de `lib/pageGeometry` para la
 * portada original, que se mide en píxeles de lienzo). Cero tamaños a mano: si
 * la hoja, sus márgenes o sus puntos cambian, la miniatura cambia con ellos.
 *
 * Y el papel NO se apaga. La versión anterior le aplicaba
 * `filter: brightness(0.48)` a las tarjetas lejanas; sobre una hoja blanca eso
 * multiplica el fondo a un gris plano y la tarjeta se lee como una losa vacía.
 * `AGENTS.md` §1 pide papel blanco puro con tinta nítida en los dos temas, así
 * que el receso se hace con escala, nunca apagando la hoja.
 */
import React, { useMemo } from 'react';
import { CloudUpload } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { medidaDeLaHoja, type Hoja } from '../../../lib/portada/geometria';
import { getPageGeometry } from '../../../lib/pageGeometry';
import { UNICoverPreview, ANCHO_HOJA_PX } from '../../layout/UNICoverPreview';
import { APACoverEditor } from '../../layout/APACoverEditor';
import { PaperCanvas } from '../../layout/PaperCanvas';

interface Props {
  diseno: string;
  /** El ancho de la miniatura en pantalla. */
  anchoPx: number;
  hoja: Hoja;
}

/** El ancho y el alto del diseño REAL, en su unidad de verdad.
 *
 *  Lo comparten la miniatura (que lo dibuja) y el carrusel (que reserva el
 *  alto de la fila): una sola cuenta, o el alto de la fila miente. */
export function medidaDeLaMiniatura(
  diseno: string,
  hoja: Hoja,
  reglas: { margins_cm?: unknown; font_size_pt?: number; line_spacing?: number; page_size?: unknown } | undefined,
): { ancho: number; alto: number } {
  /* El ancho y el alto del diseño REAL, en su unidad de verdad:
     - la portada original la dibuja `PaperCanvas` en píxeles de lienzo
       (`getPageGeometry`), así que su medida sale de ahí;
     - las otras tres las dibuja el editor sobre la hoja de `geometria`. */
  if (diseno === 'original') {
    const g = getPageGeometry({
      margins_cm: (reglas as any)?.margins_cm,
      font_size_pt: reglas?.font_size_pt,
      line_spacing: reglas?.line_spacing,
      page_size: (reglas as any)?.page_size,
    });
    return { ancho: Math.round(g.pageW), alto: Math.round(g.pageH) };
  }
  const m = medidaDeLaHoja(hoja, ANCHO_HOJA_PX);
  return { ancho: ANCHO_HOJA_PX, alto: m.altoPx };
}

export const MiniaturaRealDePortada: React.FC<Props> = ({ diseno, anchoPx, hoja }) => {
  const reglas = useDocStore((s) => s.rules);

  /* `escala` es la única cuenta: cuánto hay que reducir para que entre en la
     tarjeta. Si una miniatura no se parece a lo que sale, es porque el diseño
     está mal, y ahora se ve. */
  const medida = useMemo(
    () => medidaDeLaMiniatura(diseno, hoja, reglas),
    [diseno, hoja, reglas],
  );

  const escala = anchoPx / medida.ancho;

  const papel: React.CSSProperties = {
    width: anchoPx,
    height: medida.alto * escala,
    backgroundColor: 'var(--paper-white)',
    color: 'var(--paper-ink)',
    overflow: 'hidden',
    position: 'relative',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-xs)',
    flex: '0 0 auto',
  };

  /* La última tarjeta es una ACCIÓN, no un diseño: no hay nada que dibujar
     hasta que el usuario suba su plantilla. Se dice con el ícono y con la
     palabra. */
  if (diseno === 'custom') {
    return (
      <div
        data-papel="true"
        style={{ ...papel, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-accent)' }}
      >
        <CloudUpload size={Math.max(18, anchoPx * 0.16)} strokeWidth="var(--icon-stroke)" aria-hidden />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>.docx</span>
      </div>
    );
  }

  return (
    <div data-papel="true" style={papel}>
      {/* El diseño se dibuja a tamaño de hoja y se reduce con `scale`. Va
          `inert` porque es una IMAGEN del diseño: la tarjeta que lo envuelve es
          la que se elige, y así no hay dos controles para lo mismo ni campos
          editables dentro de un control. */}
      <div
        {...({ inert: '' } as Record<string, string>)}
        style={{
          width: medida.ancho,
          height: medida.alto,
          transform: `scale(${escala})`,
          transformOrigin: 'top left',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none',
        }}
      >
        {diseno === 'uni' ? (
          <UNICoverPreview hoja={hoja} anchoPx={medida.ancho} />
        ) : diseno === 'original' ? (
          <PaperCanvas onlyCover readOnly />
        ) : (
          <APACoverEditor soloLectura />
        )}
      </div>
    </div>
  );
};

export default MiniaturaRealDePortada;
