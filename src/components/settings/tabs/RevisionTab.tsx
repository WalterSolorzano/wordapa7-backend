/* WordAPA7 — la pestaña Revisión: qué aparece mientras revisás, y la calibración
 * de la rampa del mapa de IA.
 *
 * Tres cosas, y las tres existían en otro lugar o en ningún lugar:
 *
 *  1. SUGERENCIAS PROACTIVAS Y MARCAS VISIBLES. Ya funcionaban y ya se
 *     guardaban; lo que faltaba era dónde estaban. Vivían en la sección
 *     "General" de `SettingsMenu`, un archivo que la Fase 7 borra, y su texto
 *     prometía un resaltado "en la vista previa" que no era donde se veía.
 *     Acá se escriben EN EL LUGAR donde se ven: la primera pinta los globos del
 *     margen, la segunda las etiquetas de qué se cambió y por qué, al lado de
 *     cada edición del lienzo.
 *  2. LAS MARCAS DE CITA. `showCitationMarks` existía desde el principio con un
 *     comentario que decía, literalmente, "cuando exista el control, escribe
 *     acá". Este es el control: los dos canales que subrayan una cita —el
 *     lienzo y la tarjeta de lectura— se apagan juntos, que era el punto de
 *     tener el interruptor en el store y no en la vista.
 *  3. LA CALIBRACIÓN DE LA RAMPA. `aiMosaic.ts` tenía P30/P60/P90 escritos en
 *     el código. Ahora se escriben acá. Editarlos cambia el MAPA DE CALOR de
 *     verdad: la rampa pasa de ser relativa al documento —donde el nivel 4 es
 *     "el peor de TU documento"— a ser un porcentaje fijo. Un ajuste que cambia
 *     lo que se ve tiene que decir que lo cambia, y tiene que poder volver
 *     atrás: por eso el botón de volver al automático.
 *
 * Y lo que NO se edita: los tokens `--ia-nivel-1..4`. El color de cada escalón
 * es un token, y `noHardcodedColors.test.ts` los vigila. Se edita dónde cae el
 * corte, no el color.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MessageSquare, Quote, RotateCcw, Tag, type LucideIcon } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { EditorialMascot } from '../../layout/EditorialMascot';
import { kindDePestana, expresionDePestana } from '../mascotDePestana';
import { pestanaPorId } from '../tabs';
import { Seccion } from './word/Seccion';
import {
  CORTES_AUTOMATICOS,
  nivelesAlcanzables,
  tokenDeNivel,
  type CortesIa,
} from '../../../lib/aiMosaic';
import { contarClaves, leerVariableDeLocalStorage } from '../../../lib/proveedoresIA';

const PESTANA = pestanaPorId('revision');

/* Las palabras de la rampa son las de la leyenda de `AiMosaic.tsx` —"nada",
   "algo", "bastante", "casi todo"— para que el control y el mapa hablen del
   mismo escalón. La leyenda vive en la vista porque es decorado de la vista;
   el significado del corte, no. */
const BANDA: { nivel: 1 | 2 | 3 | 4; palabra: string }[] = [
  { nivel: 1, palabra: 'nada' },
  { nivel: 2, palabra: 'algo' },
  { nivel: 3, palabra: 'bastante' },
  { nivel: 4, palabra: 'casi todo' },
];

const pct = (v: number): string => String(Math.round(v * 100));

const claveDe = (c: CortesIa | null): string => (c ? c.join(',') : 'auto');

/** Los tres textos de los campos, en porcentaje. Sin calibración escrita se
 *  muestran los valores por defecto, que es lo que el mapa va a usar mientras
 *  nadie los toque. */
const textosDe = (c: CortesIa | null): string[] => (c || CORTES_AUTOMATICOS).map(pct);

const aNumero = (t: string): number => (t.trim() === '' ? NaN : Number(t.replace(',', '.')));

/** Un interruptor de Ajustes. Es un `checkbox` con `role="switch"` y no un
 *  `div` con un `onClick`: sin esto no se puede tabular ni anunciar. */
const Interruptor: React.FC<{
  id: string;
  titulo: string;
  ayuda: string;
  activo: boolean;
  Icono: LucideIcon;
  alCambiar: (v: boolean) => void;
}> = ({ id, titulo, ayuda, activo, Icono, alCambiar }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
    <input
      id={id}
      data-testid={id}
      type="checkbox"
      role="switch"
      checked={activo}
      onChange={(e) => alCambiar(e.target.checked)}
      style={{ marginTop: '3px', width: '15px', height: '15px', cursor: 'pointer' }}
    />
    <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
        <Icono size={15} strokeWidth="var(--icon-stroke)" />
        {titulo}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)' }}>
        {ayuda}
      </span>
    </label>
  </div>
);

export const RevisionTab: React.FC = () => {
  const sugerenciasProactivas = useDocStore((s) => s.sugerenciasProactivas);
  const setSugerenciasProactivas = useDocStore((s) => s.setSugerenciasProactivas);
  const marcasVisibles = useDocStore((s) => s.marcasVisibles);
  const setMarcasVisibles = useDocStore((s) => s.setMarcasVisibles);
  const showCitationMarks = useDocStore((s) => s.showCitationMarks);
  const setShowCitationMarks = useDocStore((s) => s.setShowCitationMarks);
  const iaCortes = useDocStore((s) => s.iaCortes);
  const setIaCortes = useDocStore((s) => s.setIaCortes);
  const useLocal = useDocStore((s) => s.aiProviderConfig.useLocal);
  const resueltos = useDocStore((s) => s.dismissedCommentIds.length);

  /* Las claves viven en localStorage, no en el store: el store guarda la que
     MANDA, no las trece. La cuenta se relee cuando el almacenamiento cambia en
     otra ventana, que es el único aviso que hay —la pestaña Conexión escribe
     directo en localStorage y no publica nada en el store— y en cada montaje,
     que es cuando Ajustes se abre. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const alCambiar = () => setTick((t) => t + 1);
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, []);
  const claves = useMemo(() => contarClaves(leerVariableDeLocalStorage), [tick]);
  /* Con el servidor local activado no hace falta ninguna clave: el detector
     consulta una dirección, no un secreto. Por eso la cara preocupada depende de
     las DOS cosas y no solo del número de claves. */
  const sinMotor = claves === 0 && !useLocal;

  const expresion = expresionDePestana(PESTANA, {
    clavesDeProveedor: sinMotor ? 0 : Math.max(1, claves),
    proveedorElegido: true,
    hallazgosResueltos: resueltos,
  });

  /* ── La calibración ───────────────────────────────────────────────────────
     Los tres campos son el ÚNICO lugar donde se mira la rampa, y lo que
     escriben es lo que el mosaico usa. `texto` es local porque un campo de
     número tiene que poder quedar a medio escribir —un 9, todavía no un 95—
     sin que eso sea una calibración; lo que se guarda es el TRIPLE entero,
     cuando los tres son números y están en orden. */
  const [texto, setTexto] = useState<string[]>(() => textosDe(iaCortes));
  const ultimoGuardado = useRef<string>(claveDe(iaCortes));

  /* Si la calibración cambia por fuera —el botón de volver atrás, o la pestaña
     abierta en otra ventana— los campos la siguen. El eco de lo que este mismo
     componente acaba de escribir no los toca: sin esta guarda, escribir un 9 en
     el campo del nivel 2 con 60 y 90 puestos se reordenaría solo y el cursor
     saltaría de campo a media palabra. */
  useEffect(() => {
    const clave = claveDe(iaCortes);
    if (clave === ultimoGuardado.current) return;
    ultimoGuardado.current = clave;
    setTexto(textosDe(iaCortes));
  }, [iaCortes]);

  const numeros = texto.map(aNumero);
  const ordenados = numeros.every(Number.isFinite)
    && numeros[0] <= numeros[1]
    && numeros[1] <= numeros[2];

  /* Lo que se aplica AHORA. Sin calibración escrita lo que se aplica son los
     percentiles del documento, y los valores por defecto de los campos NO son
     los que usa: son los de referencia, y por eso la línea de al lado lo dice
     en vez de dejarlo suponer. */
  const efectivos = iaCortes || CORTES_AUTOMATICOS;
  const alcanzables = useMemo(() => nivelesAlcanzables(efectivos), [efectivos]);
  const muertos = BANDA.filter((b) => !alcanzables.includes(b.nivel));

  const editarCorte = (indice: number, valor: string) => {
    const siguiente = [...texto];
    siguiente[indice] = valor;
    setTexto(siguiente);
    const nums = siguiente.map(aNumero);
    if (nums.some((n) => !Number.isFinite(n))) return;
    if (!(nums[0] <= nums[1] && nums[1] <= nums[2])) return;
    const cortes: CortesIa = [nums[0] / 100, nums[1] / 100, nums[2] / 100];
    ultimoGuardado.current = claveDe(cortes);
    setIaCortes(cortes);
  };

  const volverAlAutomatico = () => {
    /* Los campos se vacían acá y no por el efecto: el efecto ignora a propósito
       el eco de lo que escribe este componente, y el botón es de este
       componente. Sin esta línea, deshacer la calibración dejaría los tres
       números escritos en pantalla con la rampa ya automática detrás. */
    ultimoGuardado.current = claveDe(null);
    setTexto(textosDe(null));
    setIaCortes(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* La mascota con la cara del estado. El texto al lado es el mismo estado
          en palabras: la cara sola no le sirve a nadie. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression={expresion} size={44} />
        <p
          data-testid="revision-estado"
          style={{
            margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)',
            color: sinMotor ? 'var(--color-warning)' : 'var(--color-text-secondary)',
          }}
        >
          {sinMotor
            ? 'Sin claves de proveedor, el detector de IA no consulta ningún modelo. La revisión sigue funcionando con reglas locales, y los otros motores —ortografía, citas, estructura— no cambian.'
            : useLocal
              ? 'El clasificador de IA consulta el servidor local de la pestaña Conexión. Los demás motores usan claves de este equipo.'
              : `${claves} ${claves === 1 ? 'clave puesta' : 'claves puestas'}: el detector de IA puede consultar un modelo para cada hallazgo.`}
        </p>
      </div>

      {/* ── Qué se ve mientras revisás ───────────────────────────────────── */}
      <Seccion
        titulo="Qué aparece mientras revisás"
        descripcion="Los tres interruptores del motor. Los tres escriben en el store, así que los dos lados de la lectura ven lo mismo."
      >
        <Interruptor
          id="interruptor-proactivas"
          titulo="Sugerencias proactivas"
          ayuda="Los globos de mejora del margen. Apagadas, no se lanzan las auditorías proactivas ni se guardan los hallazgos de la revisión por lotes: los motores siguen corriendo, pero no aparece lo que encontraron."
          activo={sugerenciasProactivas}
          Icono={MessageSquare}
          alCambiar={setSugerenciasProactivas}
        />
        <Interruptor
          id="interruptor-marcas"
          titulo="Marcas de cambio"
          ayuda="La etiqueta al lado de cada párrafo modificado, que dice qué se cambió y por qué. Apagadas, el lienzo no dibuja ninguna."
          activo={marcasVisibles}
          Icono={Tag}
          alCambiar={setMarcasVisibles}
        />
        <Interruptor
          id="interruptor-citas"
          titulo="Subrayado de citas"
          ayuda="El resaltado de las citas con problema, en el lienzo y en la tarjeta de lectura. Apagado, los dos canales se apagan juntos: no queda un lado subrayando lo que el otro ya no muestra."
          activo={showCitationMarks}
          Icono={Quote}
          alCambiar={setShowCitationMarks}
        />
      </Seccion>

      {/* ── La calibración ──────────────────────────────────────────────── */}
      <Seccion
        titulo="Calibración de la rampa del mapa de IA"
        descripcion="Dónde cae cada escalón del mapa de calor. Por defecto son los percentiles del propio documento; al escribirlos pasan a ser un porcentaje fijo."
      >
        <p
          data-testid="aviso-cortes"
          style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}
        >
          Editar esto cambia cómo se ve el mapa de calor: la rampa deja de ser
          relativa a tu documento y pasa a ser un porcentaje fijo, y el escalón
          alto deja de significar "el peor de tu documento".
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
          {([2, 3, 4] as const).map((nivel) => {
            /* `pos` es el índice del triple guardado y `nivel` es el escalón que
               ese corte abre. Confundir los dos desplaza los campos un lugar y
               el mosaico se calibra con el corte del nivel vecino. */
            const pos = nivel - 2;
            const palabra = BANDA.find((b) => b.nivel === nivel)?.palabra || '';
            return (
              <div key={nivel} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label
                  htmlFor={`corte-nivel-${nivel}`}
                  style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}
                >
                  {`Corte del nivel ${nivel} · ${palabra}`}
                </label>
                <input
                  id={`corte-nivel-${nivel}`}
                  data-testid={`corte-nivel-${nivel}`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={texto[pos]}
                  onChange={(e) => editarCorte(pos, e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
                    background: 'var(--bg-base)', color: 'var(--color-text-primary)',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {`Desde ${pct(efectivos[pos])}% de párrafos marcados`}
                </span>
              </div>
            );
          })}
        </div>

        {/* La cuenta, no un aviso escrito a mano: qué escalones puede alcanzar la
            rampa con estos cortes. Con los tres en 95 las bandas del 2 y del 3
            se quedan sin un solo valor que las alcance y el mapa sale en dos
            escalones. Eso hay que poder leerlo ANTES de abrir el mapa. */}
        {muertos.length > 0 && (
          <p
            data-testid="cortes-sin-escalon"
            style={{
              margin: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)', color: 'var(--color-warning)', lineHeight: 'var(--leading-normal)',
            }}
          >
            <AlertTriangle size={15} strokeWidth="var(--icon-stroke)" />
            <span>
              {`Con estos cortes se usan ${alcanzables.length} de los 4 escalones: ${
                muertos.map((b) => `el nivel ${b.nivel}`).join(' y ')
              } ${muertos.length === 1 ? 'no tiene' : 'no tienen'} ningún porcentaje que los alcance.`}
            </span>
          </p>
        )}

        {!ordenados && (
          <p
            data-testid="cortes-desordenados"
            style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-warning)' }}
          >
            Los tres cortes van de menor a mayor, así que esto todavía no se
            aplicó: el mapa sigue con los cortes que había.
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="boton-cortes-automaticos"
            onClick={volverAlAutomatico}
            disabled={!iaCortes}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'var(--font-family)',
              background: iaCortes ? 'var(--color-accent)' : 'transparent',
              color: iaCortes ? 'var(--color-text-on-accent)' : 'var(--color-text-tertiary)',
              border: iaCortes ? 'none' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              cursor: iaCortes ? 'pointer' : 'default',
            }}
          >
            <RotateCcw size={15} strokeWidth="var(--icon-stroke)" />
            Volver al automático
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {iaCortes
              ? 'Ahora la rampa usa los cortes escritos.'
              : 'Ahora la rampa usa P30, P60 y P90 de cada documento.'}
          </span>
        </div>

        {/* Las cuatro bandas con los límites que el código va a usar de verdad,
            leídos de `nivelDe`: el nivel 4 arranca en el corte más alto, no en
            el segundo. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {BANDA.map((b) => {
            const desde = b.nivel === 1 ? 0 : efectivos[b.nivel - 2];
            const hasta = b.nivel === 4 ? 1 : efectivos[b.nivel - 1];
            const vivo = alcanzables.includes(b.nivel);
            return (
              <span
                key={b.nivel}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
                  opacity: vivo ? 1 : 0.6,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: '10px', height: '10px', borderRadius: 'var(--radius-sm)',
                    /* El token del escalón sale de `tokenDeNivel`, la misma función
                       que pinta el mosaico: escribir `var(--ia-nivel-...)` a mano
                       acá produciría un token que el lint de colores no puede
                       verificar. */
                    background: tokenDeNivel(b.nivel),
                  }}
                />
                {`Nivel ${b.nivel} · ${b.palabra} · ${pct(desde)}% a ${pct(hasta)}%`}
              </span>
            );
          })}
        </div>
      </Seccion>
    </div>
  );
};

export default RevisionTab;
