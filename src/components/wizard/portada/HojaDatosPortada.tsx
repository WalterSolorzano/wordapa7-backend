/**
 * WordAPA7 — la hoja de datos de la portada.
 *
 * Aparece AL ELEGIR un diseño y trae SOLO datos: autor, título, asignatura,
 * institución, carrera, profesor asesor, comité, fecha e idioma. Sin estilos,
 * porque los estilos viven en el carrusel y repetirlos acá es el panel duplicado
 * que el spec saca.
 *
 * Se cierra sola al cambiar de fase, y eso no es un detalle: una hoja de datos
 * de la portada abierta sobre la etapa de Revisión es una hoja de datos de otra
 * cosa.
 */
import React, { useEffect, useState } from 'react';
import { Calendar, GraduationCap, Hash, Layers, Users, X } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { PORTADA_IDIOMAS, type PortadaLanguage } from '../../../types';

const ETIQUETA_DE_IDIOMA = (v: string) =>
  PORTADA_IDIOMAS.find((i) => i.valor === v)?.etiqueta ?? v;

/** Los `data-testid` que el test usa. */
export const HOJA_DE_DATOS_TESTID = 'hoja-datos';

interface FilaProps {
  icono: React.ReactNode;
  etiqueta: string;
  children?: React.ReactNode;
  vacio?: boolean;
}

const Fila: React.FC<FilaProps> = ({ icono, etiqueta, children, vacio }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
    <span
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        fontSize: 'var(--text-xs)', fontWeight: 700,
        color: 'var(--color-text-secondary)', textTransform: 'uppercase',
        letterSpacing: '0.4px',
      }}
    >
      {icono}
      {etiqueta}
    </span>
    <span
      style={{
        fontSize: 'var(--text-sm)', color: vacio ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        fontStyle: vacio ? 'italic' : 'normal',
        paddingLeft: '14px', wordBreak: 'break-word',
      }}
    >
      {children ?? 'Sin escribir'}
    </span>
  </div>
);

export interface HojaDatosPortadaProps {
  /** Se cierra sola al cambiar de fase. */
  pasoActual?: number;
  /** El paso en el que esta abierta. */
  pasoDePortada?: number;
  onClose?: () => void;
}

export const HojaDatosPortada: React.FC<HojaDatosPortadaProps> = ({
  pasoActual = 1,
  pasoDePortada = 1,
  onClose,
}) => {
  const portada = useDocStore((s) => s.portada);
  const acta = useDocStore((s) => s.acta);
  const [visible, setVisible] = useState(true);

  /* Se cierra sola al cambiar de fase. Sin este efecto, la hoja de datos de la
     portada sobrevive a la ida a Revisión y aparece sobre un documento que no es
     una portada. */
  useEffect(() => {
    if (pasoActual !== pasoDePortada) setVisible(false);
  }, [pasoActual, pasoDePortada]);

  if (!visible) return null;

  const cerrar = () => {
    setVisible(false);
    onClose?.();
  };

  return (
    <section
      data-testid={HOJA_DE_DATOS_TESTID}
      aria-label="Datos de la portada"
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          <Layers size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
          Datos de la portada
        </span>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar los datos de la portada"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '20px', height: '20px', borderRadius: 'var(--radius-full)',
            border: 'none', background: 'var(--surface-subtle)',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          <X size={11} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Fila icono={<Users size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Autor" vacio={!acta.autor}>
          {acta.autor || null}
        </Fila>
        <Fila icono={<GraduationCap size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="T\u00edtulo" vacio={!portada.title}>
          {portada.title || null}
        </Fila>
        <Fila icono={<GraduationCap size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Asignatura" vacio={!portada.course}>
          {portada.course || null}
        </Fila>
        <Fila icono={<GraduationCap size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Instituci\u00f3n" vacio={!portada.institution}>
          {portada.institution || null}
        </Fila>
        <Fila icono={<Layers size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Carrera" vacio={!portada.departamento}>
          {portada.departamento || null}
        </Fila>
        <Fila
          icono={<GraduationCap size={12} strokeWidth="var(--icon-stroke)" aria-hidden />}
          etiqueta="Profesor asesor"
          vacio={acta.profesor_asesor.length === 0}
        >
          {acta.profesor_asesor.length > 0 ? acta.profesor_asesor.join(', ') : null}
        </Fila>
        <Fila icono={<Users size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Comit\u00e9" vacio={acta.comite.length === 0}>
          {acta.comite.length > 0 ? acta.comite.join(', ') : null}
        </Fila>
        <Fila icono={<Hash size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Grupo" vacio={!acta.grupo}>
          {acta.grupo || null}
        </Fila>
        <Fila icono={<Calendar size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Fecha" vacio={!portada.date}>
          {portada.date || null}
        </Fila>
        <Fila icono={<Calendar size={12} strokeWidth="var(--icon-stroke)" aria-hidden />} etiqueta="Idioma" vacio={!portada.language}>
          {portada.language ? ETIQUETA_DE_IDIOMA(portada.language as PortadaLanguage) : null}
        </Fila>
      </div>
    </section>
  );
};

export default HojaDatosPortada;
