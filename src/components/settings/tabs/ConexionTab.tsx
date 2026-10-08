/* WordAPA7 — la pestaña Conexión: con qué proveedor habla la app, con qué
 * modelo, y si el complemento de Word está registrado.
 *
 * Tres cosas que esta pestaña hace y que antes vivían en tres lugares y ninguna
 * funcionaba del todo:
 *
 * 1. HAY QUE ELEGIR PROVEEDOR. Antes no se elegía: `documentSlice` caminaba las
 *    claves en orden fijo y ganaba la primera que encontraba. Con dos claves
 *    puestas no había forma de decir "usá Groq". `setAiProviderConfig` existía,
 *    se persistía y se mandaba al backend, y NADIE lo escribía: el diagnóstico
 *    lo mostraba con `readOnly`.
 * 2. HAY QUE DIAGNOSTICAR DE VERDAD. Los radios de nube y de servidor local se
 *    veían y no se cambiaban. Acá son controles, y la URL del servidor local se
 *    escribe.
 * 3. EL COMPLEMENTO TIENE UN SOLO MECANISMO. El estudio dispara
 *    `GET /addin/registry-sideload` cada vez que se abre la pestaña, que no
 *    consulta estado previo: hace la acción y después informa. Este usa
 *    `sideload-status`, que es el que consulta. Sobrevive el que pregunta.
 *
 * Y lo que NO hace, que es la mitad del trabajo: si no hay ninguna clave puesta,
 * no muestra catorce campos vacíos. Lo dice, con la cara preocupada de la mascota,
 * y deja el camino de entrada: la clave del proveedor principal.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, RefreshCw, Server } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { EditorialMascot } from '../../layout/EditorialMascot';
import { kindDePestana, expresionDePestana } from '../mascotDePestana';
import { pestanaPorId } from '../tabs';
import {
  PROVEEDORES_IA,
  estaListo,
  contarClaves,
  proveedorManda,
  leerVariableDeLocalStorage,
  type ProveedorIA,
} from '../../../lib/proveedoresIA';
import { getSideloadStatus, repairSideload, type SideloadStatus } from '../../../api/backend';
import { formatearCuota } from '../../../lib/cuotaProveedor';
import { ConexionProviderField } from './word/ConexionProviderField';
import { ProbarProveedor } from './word/ProbarProveedor';
import { Seccion } from './word/Seccion';

const PESTANA = pestanaPorId('conexion');

type EstadoAddin = 'consultando' | 'instalado' | 'desactualizado' | 'faltante' | 'desconocido';

const TEXTO_DE_ADDIN: Record<EstadoAddin, string> = {
  consultando: 'Consultando el registro de Office',
  instalado: 'Complemento activo y registrado en Office',
  desactualizado: 'Registrado, pero hay una versión más nueva',
  faltante: 'El complemento no está registrado en Office',
  desconocido: 'No se pudo consultar el registro de Office',
};

export const ConexionTab: React.FC = () => {
  const aiProviderConfig = useDocStore((s) => s.aiProviderConfig);
  const setAiProviderConfig = useDocStore((s) => s.setAiProviderConfig);
  const showToast = useDocStore((s) => s.showToast);
  const resueltos = useDocStore((s) => s.dismissedCommentIds.length);

  /* Las claves viven en localStorage, no en el store: el store guarda la clave
     que MANDA, no las trece. `tick` es lo que hace que la pestaña se entere de
     que un campo acaba de guardar: sin esto, la cara preocupada seguiría puesta
     después de escribir la primera clave. */
  const [tick, setTick] = useState(0);
  const alPersistir = useCallback(() => setTick((t) => t + 1), []);

  const leer = leerVariableDeLocalStorage;
  const claves = useMemo(() => contarClaves(leer), [tick]);
  const hayClave = claves > 0;
  const conClaves = useMemo(
    () => PROVEEDORES_IA.filter((p) => estaListo(leer, p)).map((p) => p.id),
    [tick],
  );
  const manda = useMemo(
    () => proveedorManda(leer, aiProviderConfig.providerId),
    [tick, aiProviderConfig.providerId],
  );
  const elegido = PROVEEDORES_IA.find((p) => p.id === aiProviderConfig.providerId) || null;
  const elegidoSinClave = !!elegido && !conClaves.includes(elegido.id);

  const expresion = expresionDePestana(PESTANA, {
    clavesDeProveedor: claves,
    proveedorElegido: !!aiProviderConfig.providerId,
    hallazgosResueltos: resueltos,
  });

  const [addin, setAddin] = useState<EstadoAddin>('consultando');
  const [sideload, setSideload] = useState<SideloadStatus | null>(null);
  const [consultado, setConsultado] = useState<string>('');
  const [reparando, setReparando] = useState(false);

  const consultarAddin = useCallback(() => {
    setAddin('consultando');
    getSideloadStatus()
      .then((s) => {
        setSideload(s);
        setConsultado(new Date().toLocaleTimeString());
        setAddin(s.installed ? (s.up_to_date ? 'instalado' : 'desactualizado') : 'faltante');
      })
      .catch(() => {
        setSideload(null);
        setConsultado('');
        setAddin('desconocido');
      });
  }, []);

  useEffect(() => { consultarAddin(); }, [consultarAddin]);

  const reparar = async () => {
    setReparando(true);
    try {
      await repairSideload();
      showToast('Se volvió a instalar el complemento', 'success');
    } catch {
      showToast('No se pudo reinstalar el complemento', 'error');
    } finally {
      setReparando(false);
      consultarAddin();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* La mascota con la cara del estado. El texto al lado es el mismo
          estado en palabras: la cara sola no le sirve a nadie. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression={expresion} size={44} />
        <p
          data-testid="conexion-estado"
          style={{
            margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)',
            color: hayClave ? 'var(--color-text-secondary)' : 'var(--color-warning)',
          }}
        >
          {hayClave
            ? `${claves} ${claves === 1 ? 'clave puesta' : 'claves puestas'}. ${
              aiProviderConfig.useLocal
                ? 'El motor consulta el servidor local que figura más abajo.'
                : 'El motor puede usarlas todas; abajo está a cuál se le pregunta primero.'
            }`
            : 'Todavía no hay ninguna clave. La app funciona con reglas locales: clasifica, audita y exporta sin consultar ningún modelo.'}
        </p>
      </div>

      {/* ── Proveedor ─────────────────────────────────────────────────── */}
      <Seccion
        titulo="Proveedor"
        descripcion="Con más de una clave puesta, el motor puede usarlas todas. Acá se elige a cuál se le pregunta primero."
      >
        <label
          htmlFor="selector-proveedor"
          style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}
        >
          ¿A quién se le pregunta primero?
        </label>
        <select
          id="selector-proveedor"
          data-testid="selector-proveedor"
          value={aiProviderConfig.providerId}
          disabled={aiProviderConfig.useLocal}
          onChange={(e) => setAiProviderConfig({ providerId: e.target.value })}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
            background: 'var(--bg-base)', color: 'var(--color-text-primary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <option value="">Automático: el primero con clave, en orden de prioridad</option>
          {PROVEEDORES_IA.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}{conClaves.includes(p.id) ? '' : ' (sin clave)'}
            </option>
          ))}
        </select>
        {/* Cuota del proveedor elegido. El backend todavía no expone un cupo
            por proveedor, así que cuando no hay dato el formateador dice
            "sin dato de cuota" en vez de inventar un número: un medidor que
            miente es peor que uno ausente. */}
        <p
          data-testid="cuota-proveedor"
          style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}
        >
          {formatearCuota(null, null, null)}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {aiProviderConfig.useLocal
            ? 'Con el servidor local activado, el proveedor de la nube no se usa.'
            : elegidoSinClave
              ? `${elegido?.etiqueta} no tiene clave: se consulta ${manda?.etiqueta || 'nadie'}.`
              : `Ahora consulta ${manda?.etiqueta || 'nadie'}.`}
        </p>
      </Seccion>

      {/* ── Conexión Remota / Agente Externo ────────────────────────── */}
      <Seccion
        titulo="Conexión Remota y Agentes de IA"
        descripcion="Usa esta URL y tu clave de API personal para conectar cualquier IA (como Antigravity, Claude o GPT) directamente a este formateador para crear documentos Word sin gastar tokens."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              URL de API del Servidor (Endpoint Web / Remoto)
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                type="text"
                readOnly
                value="https://wordapa7-web.vercel.app/api"
                style={{
                  flex: 1, padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-base)', color: 'var(--color-text-primary)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('https://wordapa7-web.vercel.app/api');
                  showToast('URL de API copiada al portapapeles', 'success');
                }}
                style={{
                  padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 600,
                  background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}
              >
                Copiar URL
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Tu Clave de Acceso de Usuario (API Key)
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                type="text"
                readOnly
                value={(() => {
                  const saved = localStorage.getItem('wordapa7-user-api-key');
                  if (saved) return saved;
                  const nueva = 'apa7_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
                  localStorage.setItem('wordapa7-user-api-key', nueva);
                  return nueva;
                })()}
                style={{
                  flex: 1, padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-base)', color: 'var(--color-text-primary)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const key = localStorage.getItem('wordapa7-user-api-key') || '';
                  navigator.clipboard.writeText(key);
                  showToast('API Key copiada. ¡Pégala en tu agente de IA!', 'success');
                }}
                style={{
                  padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 600,
                  background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}
              >
                Copiar Key
              </button>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Copia esta clave y dásela a tu IA para que ensamble documentos Word APA 7 automáticamente a través de este motor.
            </span>
          </div>
        </div>
      </Seccion>

      {/* ── Diagnóstico ───────────────────────────────────────────────── */}
      <Seccion
        titulo="Diagnóstico del motor"
        descripcion="Dónde se consulta el modelo. Antes estos dos radios se veían y no se cambiaban."
      >
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {([
            { valor: false, etiqueta: 'NVIDIA NIM en la nube', Icono: Cloud },
            { valor: true, etiqueta: 'Servidor local', Icono: Server },
          ] as const).map(({ valor, etiqueta, Icono }) => (
            <label
              key={etiqueta}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
            >
              <input
                type="radio"
                name="conexion-destino"
                checked={aiProviderConfig.useLocal === valor}
                onChange={() => setAiProviderConfig({ useLocal: valor })}
              />
              <Icono size={15} strokeWidth="var(--icon-stroke)" />
              <span style={{ color: 'var(--color-text-primary)' }}>{etiqueta}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label
            htmlFor="campo-nim-url"
            style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}
          >
            Dirección del servidor local
          </label>
          <input
            id="campo-nim-url"
            type="text"
            value={aiProviderConfig.nimUrl}
            onChange={(e) => setAiProviderConfig({ nimUrl: e.target.value })}
            placeholder="http://localhost:8000/v1/chat/completions"
            spellCheck={false}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
              background: 'var(--bg-base)', color: 'var(--color-text-primary)',
              border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            Solo se usa con "Servidor local" activado. Un servidor compatible con
            la API de OpenAI sirve: no tiene que ser NIM.
          </span>
          <button
            type="button"
            data-testid="usar-ollama-local"
            onClick={() => setAiProviderConfig({ useLocal: true, nimUrl: 'http://localhost:11434/v1' })}
            style={{
              alignSelf: 'flex-start', padding: 'var(--space-1) var(--space-2)',
              fontSize: 'var(--text-xs)', background: 'var(--bg-base)',
              color: 'var(--color-text-primary)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            Usar Ollama en este equipo (localhost:11434)
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            "Ollama cloud" es un proveedor de nube aparte; este botón usa el Ollama
            instalado en tu equipo, que no envía nada afuera.
          </span>
        </div>
      </Seccion>

      {/* ── Claves ────────────────────────────────────────────────────── */}
      <Seccion
        titulo="Claves de proveedor"
        descripcion="Se guardan solas en este equipo: ochocientas milésimas después de la última tecla. No hay botón de guardar."
      >
        {/* La nota de seguridad, ACÁ y no en un documento que nadie abre.
            El instalador trae unas claves de proveedor embebidas, y no están
            cifradas: se ofuscan con una operación reversible cuya semilla está
            en el código. Quienda tenga el programa puede leerlas. Por eso la
            advertencia tiene que estar donde alguien va a escribir SU clave y
            se va a preguntar dónde se guarda la del otro.

            Escribirla acá no cambia nada del comportamiento: el aviso ya estaba
            en el módulo del backend, que es exactamente donde no lo lee nadie. */}
        <p
          data-testid="nota-de-seguridad"
          style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}
        >
          Las claves que escribas se guardan en este equipo, en texto plano, sin
          cifrar. El instalador además trae unas claves de proveedor embebidas
          que están ofuscadas, no cifradas: se pueden leer. No pongas claves de
          producción ni de las que cobren: se comparten entre todos los que
          tengan el programa.
        </p>
        {/* El aviso que faltaba: la nota de arriba habla de cifrado, no de que el
            texto del documento sale de la máquina. Son dos cosas distintas y esta
            es la que la persona necesita saber ANTES de usar IA. */}
        <p
          data-testid="aviso-envio-externo"
          style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}
        >
          {aiProviderConfig.useLocal
            ? 'Con el servidor local activo, el texto de tu documento no sale de tu equipo: se procesa en la dirección que figura arriba.'
            : 'Al usar una función con IA, el texto de tu documento sale de tu equipo y se envía al proveedor que consultes. Revisá las políticas en docs/politicas-proveedores.md antes de trabajar con datos sensibles.'}
        </p>
        {/* Sin ninguna clave no se muestran los catorce campos: se dice que no
            hay ninguna y se deja la del proveedor principal, que es el camino
            de entrada. Catorce casillas vacías no informa nada.
            El `div` es el MISMO en los dos casos, con los mismos `key`: si el
            contenedor se cambiara, el campo donde se está escribiendo se
            desmontaría al aparecer el resto, y su indicador de guardado
            desaparecería justo cuando acaba de guardar. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
          {hayClave
            ? PROVEEDORES_IA.map((p) => (
              <GroupDeClave key={p.id} proveedor={p} alPersistir={alPersistir} />
            ))
            : (
              <GroupDeClave
                key={PROVEEDORES_IA[0].id}
                proveedor={PROVEEDORES_IA[0]}
                alPersistir={alPersistir}
                extra="Con una clave puesta aparecen el resto de los campos."
              />
            )}
        </div>
      </Seccion>

      {/* ── Modelos ───────────────────────────────────────────────────── */}
      {hayClave && (
        <Seccion
          titulo="Modelos"
          descripcion="Qué modelo consulta cada proveedor. Todos los que aparecen acá los lee el motor del entorno; los que no, no se pueden cambiar."
        >
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Se guardan en este equipo y llegan al motor. Si lo dejás vacío, el
            proveedor consulta el modelo por defecto que dice el campo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
            {/* `flatMap` y no `filter` con un cast: el filtro de TypeScript no
                estrecha `variableModelo` dentro del `map`. */}
            {PROVEEDORES_IA.flatMap((p) => (p.variableModelo
              ? [<ConexionProviderField
                key={p.id}
                envVar={p.variableModelo}
                tipo="modelo"
                label={p.etiqueta}
                defecto={p.modeloPorDefecto}
                ayuda={`${p.variableModelo} · por defecto: ${p.modeloPorDefecto}`}
                alPersistir={alPersistir}
              />]
              : []))}
          </div>
        </Seccion>
      )}

      {/* ── Complemento de Word ───────────────────────────────────────── */}
      <Seccion
        titulo="Complemento de Microsoft Word"
        descripcion="Lo que permite formatear en vivo, auditar citas y numerar tablas y figuras dentro de Word."
      >
        <p
          data-testid="estado-addin"
          style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}
        >
          {TEXTO_DE_ADDIN[addin]}
        </p>
        {consultado && (
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {sideload?.installed_at
              ? `Instalado el ${new Date(sideload.installed_at).toLocaleString()}. `
              : ''}
            Consultado a las {consultado}.
          </p>
        )}
        {/* UN botón. El estudio tiene uno que dispara el registro sin consultar,
            y el menú de Ajustes tenía tres que hacían la misma reparación con
            tres nombres distintos. Este se llama como la acción. */}
        <button
          type="button"
          onClick={reparar}
          disabled={reparando}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'var(--font-family)',
            background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} strokeWidth="var(--icon-stroke)" />
          Reparar instalación del complemento
        </button>
      </Seccion>
    </div>
  );
};

/** Las claves de un proveedor, y su botón Probar.
 *
 *  El botón va en la fila del proveedor y su resultado SE QUEDA ahí. No es un
 *  toast: un toast se borra a los tres segundos, y lo que el usuario necesita
 *  ver mientras escribe su clave es si esa clave sirve, no un aviso que ya se
 *  fue. */
const GroupDeClave: React.FC<{ proveedor: ProveedorIA; alPersistir: () => void; extra?: string }> = ({
  proveedor, alPersistir, extra,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
    {proveedor.variablesClave.map((variable) => (
      <ConexionProviderField
        key={variable}
        envVar={variable}
        label={variable === proveedor.variablesClave[0]
          ? proveedor.etiqueta
          : `${proveedor.etiqueta}: ${variable === 'CLOUDFLARE_ACCOUNT_ID' ? 'id de cuenta' : variable}`}
        ayuda={variable === proveedor.variablesClave[0] ? (extra || variable) : variable}
        alPersistir={alPersistir}
      />
    ))}
    <ProbarProveedor proveedor={proveedor} />
  </div>
);

export default ConexionTab;
