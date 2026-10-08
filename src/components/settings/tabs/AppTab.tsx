/* WordAPA7 — la pestaña App: lo que es de la app y no del documento.
 *
 * Cuatro cosas, y las cuatro existían en otro lado o en ningún lado:
 *
 *  1. LA VERSIÓN REAL. `SettingsMenu.tsx:31` tenía `const VERSION = '1.0.0'`
 *     escrito a mano mientras `package.json` iba en 1.0.65. Un "Acerca de" con
 *     un número inventado es la clase de mentira que este proyecto vino a
 *     matar, así que la versión se lee de `useUpdateStore`, que la saca de
 *     `package.json` y en la app de escritorio de `app.getVersion()`.
 *  2. "DEPURAR CACHÉ" QUE DEPURA. El botón del menú viejo mostraba un toast de
 *     éxito sin borrar nada. Ahora llama a `POST /api/admin/cleanup`, que borra
 *     las sesiones vencidas y los temporales, y el toast DICE CUÁNTOS: un
 *     "se depuró" sin número es un botón que affirmation lo que no puede probar.
 *  3. "REPORTAR UN PROBLEMA" QUE LLEGA. Mandaba a `wordapa7@example.com`, un
 *     dominio placeholder de la documentación de RFC. Ahora va a la dirección
 *     de la persona, con la versión y el sistema ya escritos en el cuerpo: un
 *     reporte sin versión no se puede rastrear.
 *  4. LA MASCOTA CON LA CARA DEL ESTADO. El engranaje, dibujado en
 *     `EditorialMascot.tsx` como los otros cuatro, y la expresión sale de
 *     `mascotDePestana.tsx` con las reglas de las otras cuatro pestañas.
 */
import React, { useState } from 'react';
import {
  Bug, ExternalLink, Info, Loader2, Moon, RefreshCw, ShieldCheck, Sun,
} from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { useUpdateStore } from '../../../store/useUpdateStore';
import { ajustesVistos } from '../../../store/slices/uiSlice';
import { EditorialMascot } from '../../layout/EditorialMascot';
import { kindDePestana, expresionDePestana } from '../mascotDePestana';
import { pestanaPorId } from '../tabs';
import { Seccion } from './word/Seccion';
import { UpdateCard } from '../../shared/UpdateCard';
import { depurarCache } from '../../../api/backend';
import { isTelemetryEnabled, setTelemetryEnabled } from '../../../telemetry/client';

const PESTANA = pestanaPorId('app');

/** A dónde llega "Reportar un problema". Es una dirección real, no el
 *  `example.com` de la documentación: un reporte a un dominio placeholder no lo
 *  lee nadie, y el botón parece funcionar. */
export const CORREO_DE_SOPORTE = 'ws692888@gmail.com';

/** Qué sistema tiene esta máquina, en una línea. Va en el cuerpo del reporte:
 *  la mitad de los errores de esta app son de la plataforma (Word COM, la
 *  ruta del almacenamiento, la versión de Electron), no del documento. */
export function sistemaDeEstaMaquina(): string {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const partes = [
    nav?.platform || 'plataforma desconocida',
    nav?.userAgent || 'user agent desconocido',
  ];
  const ew = typeof window === 'undefined' ? undefined : (window as any).electronAPI;
  partes.push(ew ? 'app de escritorio' : 'navegador');
  return partes.join(' · ');
}

/** El `mailto:` completo, con asunto y cuerpo ya escritos. Se arma en una función
 *  aparte y no dentro del `onClick` para que se pueda probar sin abrir un
 *  cliente de correo: una función que solo existe dentro de un manejador no se
 *  puede verificar. */
export function correoDeReporte(version: string, sistema: string): string {
  const asunto = `Reporte de problema · WordAPA7 ${version}`;
  const cuerpo = [
    'Qué pasó:',
    '',
    'Qué esperaba que pasara:',
    '',
    'Cómo reproducirlo:',
    '',
    `Versión: ${version}`,
    `Sistema: ${sistema}`,
  ].join('\n');
  return `mailto:${CORREO_DE_SOPORTE}`
    + `?subject=${encodeURIComponent(asunto)}`
    + `&body=${encodeURIComponent(cuerpo)}`;
}

/** El tamaño de un número de bytes, en la unidad que lo hace legible. */
function pesoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AppTab: React.FC = () => {
  const theme = useDocStore((s) => s.theme);
  const setTheme = useDocStore((s) => s.setTheme);
  const showToast = useDocStore((s) => s.showToast);
  const estadoUpdate = useUpdateStore((s) => s.state);
  const version = useUpdateStore((s) => s.version);

  /* El tema guardado manda sobre el del store: `main.tsx` lo restaura del
     almacenamiento antes de pintar, pero `uiSlice.theme` arranca en 'light' y no
     se vuelve a leer. Mostrar el switch en 'claro' mientras la pantalla está en
     oscuro sería un control que miente sobre el estado de la app. */
  const [temaGuardado, setTemaGuardado] = useState<string | null>(() => {
    try { return localStorage.getItem('wordapa7-theme'); } catch { return null; }
  });
  const temaEfectivo = temaGuardado || theme;

  /* Telemetría: se lee del almacenamiento porque es lo único que la guarda, y se
     relee al montar. `isTelemetryEnabled` no avisa cuando cambia en otra
     ventana, y eso es lo mismo que hace la pestaña Conexión con las claves. */
  const [telemetria, setTelemetry] = useState(() => {
    try { return isTelemetryEnabled(); } catch { return false; }
  });

  const [depurando, setDepurando] = useState(false);
  const [ultimaLimpieza, setUltimaLimpieza] = useState<string | null>(null);

  const hayAlgoRoto = estadoUpdate === 'error';
  const expresion = expresionDePestana(PESTANA, {
    temaElegido: temaGuardado !== null,
    ajustesAbiertosAlgunaVez: ajustesVistos(),
    hayAlgoRoto,
  });

  /* El cuerpo del reporte se arma una vez: la versión no cambia mientras la
     pantalla está abierta, y el `userAgent` tampoco. */
  const [reporte] = useState(() => correoDeReporte(version, sistemaDeEstaMaquina()));

  /* Un caso que no se puede probar desde el botón: volver atrás sin backend. El
     `depurarCache` tira, y el toast tiene que decir que NO se borró nada, que es
     distinto de decir que no había nada que borrar. */
  const depurar = async () => {
    setDepurando(true);
    try {
      const r = await depurarCache();
      const detalle = r.archivos_temporales > 0
        ? ` Se liberaron ${pesoLegible(r.bytes)}.`
        : '';
      showToast(`${r.message}${detalle}`, r.sesiones_borradas > 0 || r.archivos_temporales > 0 ? 'success' : 'info');
      setUltimaLimpieza(r.message);
    } catch {
      showToast('No se pudo limpiar: el motor no respondió y no se borró nada', 'error');
    } finally {
      setDepurando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* La mascota con la cara del estado. El texto al lado es el mismo estado
          en palabras: la cara sola no le sirve a nadie. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression={expresion} size={44} />
        <p
          data-testid="app-estado"
          style={{
            margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)',
            color: hayAlgoRoto ? 'var(--color-warning)' : 'var(--color-text-secondary)',
          }}
        >
          {hayAlgoRoto
            ? 'La última comprobación de actualizaciones falló. El resto de los ajustes de la app no cambian.'
            : temaGuardado === null
              ? 'El tema está en el que vino por omisión. Elegir claro u oscuro es una decisión tuya, y la pantalla la va a recordar.'
              : 'El tema está elegido y la app no tiene nada roto encima.'}
        </p>
      </div>

      {/* ── Apariencia ─────────────────────────────────────────────────── */}
      <Seccion
        titulo="Tema"
        descripcion="Claro u oscuro. Se guarda en este equipo y se aplica al instante, también en la ventana del complemento."
      >
        <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          {([
            { valor: 'light', etiqueta: 'Claro', Icono: Sun },
            { valor: 'dark', etiqueta: 'Oscuro', Icono: Moon },
          ] as const).map(({ valor, etiqueta, Icono }) => {
            const activo = temaEfectivo === valor;
            return (
              <button
                key={valor}
                type="button"
                data-testid={`tema-${valor}`}
                aria-pressed={activo}
                onClick={() => {
                  setTheme(valor);
                  setTemaGuardado(valor);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-4)',
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
                  fontWeight: activo ? 700 : 500, cursor: 'pointer',
                  background: activo ? 'var(--color-accent-soft)' : 'transparent',
                  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${activo ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <Icono size={15} strokeWidth="var(--icon-stroke)" />
                {etiqueta}
              </button>
            );
          })}
        </div>
      </Seccion>

      {/* ── Telemetría ──────────────────────────────────────────────────── */}
      <Seccion
        titulo="Telemetría"
        descripcion="Reportes de error anónimos, y solo si lo prendés vos. Nunca se envía contenido del documento, ni su nombre, ni lo que escribiste."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <input
            id="interruptor-telemetria"
            data-testid="interruptor-telemetria"
            type="checkbox"
            role="switch"
            checked={telemetria}
            onChange={(e) => {
              const v = e.target.checked;
              setTelemetry(v);
              setTelemetryEnabled(v);
            }}
            style={{ width: '15px', height: '15px', cursor: 'pointer' }}
          />
          <label htmlFor="interruptor-telemetria" style={{ display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              {telemetria ? 'Enviando reportes de error' : 'No enviando nada'}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)' }}>
              Apagada, la app no manda nada a ninguna parte. Lo que se manda es el tipo
              del error y la versión, nunca el documento.
            </span>
          </label>
        </div>
      </Seccion>

      {/* ── Mantenimiento ──────────────────────────────────────────────── */}
      <Seccion
        titulo="Limpieza"
        descripcion="Borra las sesiones vencidas y los archivos temporales de las previsualizaciones. Es lo mismo que corre solo cada hora, y lo dice con números."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="boton-depurar-cache"
            onClick={depurar}
            disabled={depurando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              alignSelf: 'flex-start',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'var(--font-family)',
              background: depurando ? 'transparent' : 'var(--color-accent)',
              color: depurando ? 'var(--color-text-tertiary)' : 'var(--color-text-on-accent)',
              border: depurando ? '1px solid var(--border-subtle)' : 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: depurando ? 'default' : 'pointer',
            }}
          >
            {depurando
              ? <Loader2 size={15} strokeWidth="var(--icon-stroke)" style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={15} strokeWidth="var(--icon-stroke)" />}
            Depurar caché
          </button>
          {ultimaLimpieza && (
            <span data-testid="ultima-limpieza" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {ultimaLimpieza}
            </span>
          )}
        </div>
        <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)' }}>
          <ShieldCheck size={15} strokeWidth="var(--icon-stroke)" />
          <span>
            Solo se van sesiones que hace más de un día no se tocan, y archivos temporales
            de previsualización. Los documentos .docx que tengas abiertos no se tocan.
          </span>
        </p>
      </Seccion>

      {/* ── Actualización ──────────────────────────────────────────────── */}
      <Seccion
        titulo="Actualización"
        descripcion="Una sola tarjeta: la de la app. La del menú Archivo se unifica con esta en la Fase 7."
      >
        <UpdateCard compact />
      </Seccion>

      {/* ── Acerca de ──────────────────────────────────────────────────── */}
      <Seccion
        titulo="Acerca de WordAPA7"
        descripcion="La versión sale del paquete con el que se construyó la app, no de un número escrito en la pantalla."
      >
        <p
          data-testid="app-version"
          style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}
        >
          {`Versión ${version}`}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          Ayuda a formatear, no garantiza la aprobación de un docente.
        </p>
        <a
          href={reporte}
          data-testid="boton-reportar"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--text-sm)', fontWeight: 700,
            color: 'var(--color-accent)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            textDecoration: 'none',
          }}
        >
          {<Bug size={15} strokeWidth="var(--icon-stroke)" />}
          Reportar un problema
          {<ExternalLink size={13} strokeWidth="var(--icon-stroke)" />}
        </a>
        <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)' }}>
          <Info size={15} strokeWidth="var(--icon-stroke)" />
          <span>
            {`Abre tu correo con la versión y el sistema ya escritos. A ${CORREO_DE_SOPORTE}.`}
          </span>
        </p>
      </Seccion>
    </div>
  );
};

export default AppTab;
