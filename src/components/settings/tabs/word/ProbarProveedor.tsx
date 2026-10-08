/* WordAPA7 — el botón "Probar", uno por proveedor.
 *
 * Antes no había forma de saber si una clave funciona sin gastar una tarea
 * completa del documento. `getAiHealth` dice cómo está el token bucket de cada
 * especialidad, no si tu clave anda: un 401, una cuota agotada y un proveedor
 * que responde rápido se ven igual.
 *
 * DECISIÓN DE DISEÑO, y es la razón de que esto sea un componente y no un
 * `<button>` en la pestaña: **el resultado se queda en la fila.** Un toast se
 * borra a los tres segundos, y justo lo que el usuario necesita ver es "tu clave
 * no sirve" mientras decide qué hacer. Un aviso que desaparece es un aviso que
 * hay que volver a provocar.
 *
 * La clave se manda con el ping aunque todavía no se haya sincronizado con el
 * backend: el campo tiene un debounce de 800 ms y sin eso habría una ventana en
 * la que el botón dice "no hay clave" y el usuario piensa que escribió mal.
 */
import React, { useState } from 'react';
import { Check, Loader2, TriangleAlert, X } from 'lucide-react';
import { probarProveedor, type ResultadoDeProbarProveedor } from '../../../../api/backend';
import { leerVariableDeLocalStorage, type ProveedorIA } from '../../../../lib/proveedoresIA';

export interface ProbarProveedorProps {
  proveedor: ProveedorIA;
  /** Se llama cuando el ping termino, para que la fila pueda llevar el estado. */
  alTerminar?: (resultado: ResultadoDeProbarProveedor) => void;
}

/** Un texto corto para el resultado. El motivo completo va en el `title`. */
const RESUMEN = (r: ResultadoDeProbarProveedor): string => {
  if (r.ok) return `Anduvo · ${r.model ?? 'modelo por defecto'} · ${r.ms} ms`;
  /* Un 429 no es "no anda": es "todavia no". Decir "Fallo con 429" manda al
     usuario a revisar una clave que esta bien. Si el servidor dijo cuando se
     libera, lo repetimos; si no, al menos nombramos la causa. */
  if (r.status === 429) {
    return r.retry_after
      ? `Limitado por cuota · reintentar en ${r.retry_after}s`
      : 'Limitado por cuota · reintentar mas tarde';
  }
  if (r.status) return `Falló con ${r.status} · ${r.motivo}`;
  return r.motivo || 'Sin respuesta';
};

export const ProbarProveedor: React.FC<ProbarProveedorProps> = ({ proveedor, alTerminar }) => {
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDeProbarProveedor | null>(null);

  const probar = async () => {
    setProbando(true);
    setResultado(null);
    try {
      /* La clave se lee de acá y se manda con el ping. Es lo que permite probar
         una clave recien escrita sin esperar el autoguardado, y lo que evita
         que el boton diga "falta la clave" en la ventana de los 800 ms. */
      const clave = leerVariableDeLocalStorage(proveedor.variablesClave[0]) || '';
      const r = await probarProveedor(proveedor.id, clave);
      setResultado(r);
      alTerminar?.(r);
    } finally {
      setProbando(false);
    }
  };

  const id = `probar-${proveedor.id}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <button
        type="button"
        id={id}
        onClick={probar}
        disabled={probando}
        aria-describedby={`${id}-resultado`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          alignSelf: 'flex-start',
          padding: 'var(--space-1) var(--space-3)',
          fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-family)',
          background: 'transparent', color: 'var(--color-text-secondary)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
          cursor: probando ? 'progress' : 'pointer',
        }}
      >
        {probando
          ? <Loader2 size={13} strokeWidth="var(--icon-stroke)" />
          : <Check size={13} strokeWidth="var(--icon-stroke)" />}
        {probando ? 'Probando' : 'Probar'}
      </button>
      {resultado && (
        <span
          id={`${id}-resultado`}
          data-testid={`resultado-${proveedor.id}`}
          role="status"
          title={resultado.motivo || undefined}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            fontSize: 'var(--text-xs)',
            color: resultado.ok ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {resultado.ok
            ? <Check size={12} strokeWidth="var(--icon-stroke)" />
            : resultado.status
              ? <TriangleAlert size={12} strokeWidth="var(--icon-stroke)" />
              : <X size={12} strokeWidth="var(--icon-stroke)" />}
          {RESUMEN(resultado)}
        </span>
      )}
    </div>
  );
};

export default ProbarProveedor;
