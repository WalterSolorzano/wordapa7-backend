/* WordAPA7 — la pestaña Formato: el estilo del papel, en un solo lugar.
 *
 * Treinta y un controles que estaban en tres sitios distintos y ahora están acá:
 * los doce que vivían en el estudio de ajustes (`SettingsPreviewStudio.tsx`),
 * las reglas de `APARuleSet` que nadie editaba, las plantillas de formato que se
 * guardaban y no había forma de recuperar, y el botón de volver a los valores
 * por defecto que solo ejercitaba un test.
 *
 * Y un cuarto lugar que se BORRÓ: el paso 5 del wizard tenía "Texto justificado"
 * y "Sangría primera línea", que se guardaban en `wordapa7_body_advanced`, no los
 * leía nadie, y su texto decía que se aplicaban al generar el documento final,
 * que era falso. Además contradecían a `alignment` y a `paragraph_indent_cm` de
 * esta pestaña, que sí se aplican. Dos controles que mienten y que se pelean con
 * los que funcionan: el formato se cambia en un solo lugar, y es este.
 *
 * LO QUE NO SE EDITA, Y POR QUÉ. Está declarado en `formatoAjustes.ts` con el
 * criterio escrito —un ajuste es editable si desviarse de él es una decisión
 * defendible— y la sección de abajo lo dice con palabras. Una lista de campos
 * que no se tocan también es información: sin ella, alguien da por hecho que el
 * DOI es opcional y que la sangría de la bibliografía se cambia en otro lado.
 *
 * NADA DE ESTO ES DE LA APP. Todo lo de acá baja y sube con el documento, que es
 * lo que dice la línea de ámbito de la pestaña; `ambitoDeAjustes.test.ts` lo
 * comprueba de verdad, escribiendo en todos los controles y mirando que
 * localStorage no se movió.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AlignLeft, BookOpen, Image as ImageIcon, LayoutList, ListTree,
  RotateCcw, Type as TypeIcon, Square, Heading1, AlertTriangle,
} from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { EditorialMascot, type MascotExpression } from '../../layout/EditorialMascot';
import { kindDePestana, expresionDePestana, expresionDeFormato } from '../mascotDePestana';
import { pestanaPorId } from '../tabs';
import { Seccion } from './word/Seccion';
import { PlantillasDeFormato } from './PlantillasDeFormato';
import { AJUSTES, NO_ES_AJUSTE, SECCIONES, ajustesDe, type Ajuste } from './formatoAjustes';
import type { HeadingLevelConfig } from '../../../types';

const PESTANA = pestanaPorId('formato');

const TITULO_POR_OMISION: HeadingLevelConfig = {
  bold: true, italic: false, alignment: 'left', indent_cm: 0, inline_text: false,
};

const ICONOS: Record<string, React.ElementType> = {
  pagina: Square,
  tipografia: TypeIcon,
  parrafo: AlignLeft,
  listas: LayoutList,
  titulos: Heading1,
  figuras: ImageIcon,
  portada: BookOpen,
};

/* ── La cara de la mascota ───────────────────────────────────────────────────
 * La regla vive en `mascotDePestana.tsx` con las otras cuatro. No sale de la
 * regla del motor porque esa pregunta por claves de proveedor, y el formato de
 * un documento no depende de si hay clave de NIM: preguntar eso acá pondría una
 * cara preocupada permanente en una pestaña donde no falta nada. Se reexporta acá
 * porque es parte de la API de la pestaña. */
export { expresionDeFormato };

/* ── Los controles ─────────────────────────────────────────────────────────
 * Todos llevan `data-campo`, y ese `data-campo` sale de `AJUSTES`. Un control
 * que no está declarado en esa lista no se dibuja, y uno que está declarado y
 * no se dibuja rompe la prueba: las dos mitades no pueden separarse. */

const ESTILO_ETIQUETA: React.CSSProperties = {
  fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)',
};
const ESTILO_AYUDA: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)',
};
const ESTILO_CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
  background: 'var(--bg-base)', color: 'var(--color-text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
};

/** Un control, sea del tipo que sea. Un solo lugar donde se decide cómo se
 *  dibuja, para que treinta y un controles no sean treinta y una decisiones
 *  de estilo que se van separando. */
const Control: React.FC<{ ajuste: Ajuste; compacto?: boolean }> = ({ ajuste, compacto }) => {
  const rules = useDocStore((s) => s.rules);
  const portada = useDocStore((s) => s.portada);
  const setRules = useDocStore((s) => s.setRules);
  const setPortada = useDocStore((s) => s.setPortada);

  /* El valor. Hay TRES destinos distintos y confundirlos es el error que hace
   * que un control muestre una cosa y escriba otra:
   *
   *  - `portada.*` no vive en `rules`: se lee de `portada`.
   *  - `heading_levels.N.campo` vive DOS niveles más abajo, dentro de un
   *    `Record<number, HeadingLevelConfig>`. Leerlo como `rules[clave]` devolvía
   *    `undefined` siempre, así que un interruptor de negrita se veía apagado
   *    con la negrita puesta.
   *  - el resto son campos planos de `APARuleSet`. */
  const esPortada = ajuste.clave === 'portada.apa_format';
  const partesTitulo = ajuste.clave.startsWith('heading_levels.')
    ? ajuste.clave.split('.')
    : null;
  const nivelTitulo = partesTitulo ? Number(partesTitulo[1]) : 0;
  const campoTitulo = partesTitulo ? partesTitulo[2] : '';

  /* Los valores por omisión de un nivel sin configuración guardada, los mismos
   * que usaba el estudio viejo: negrita, sin itálica, a la izquierda. Vive FUERA
   * del componente: si estuviera adentro, sería un objeto nuevo en cada render y
   * un nivel sin configuración nunca sería igual a sí mismo. */
  const tituloDe = (nivel: number): HeadingLevelConfig => rules.heading_levels?.[nivel] || TITULO_POR_OMISION;

  const valor = esPortada
    ? portada.apa_format
    : partesTitulo
      ? tituloDe(nivelTitulo)[campoTitulo as keyof HeadingLevelConfig]
      : (rules as unknown as Record<string, unknown>)[ajuste.clave];

  /* Escribir en `heading_levels` es un parche sobre el nivel, no un reemplazo
   * del mapa entero: tocar el nivel 1 no puede borrar la configuración del 2. */
  const escribir = (v: string | number | boolean) => {
    if (partesTitulo) {
      setRules({
        heading_levels: {
          ...rules.heading_levels,
          [nivelTitulo]: { ...tituloDe(nivelTitulo), [campoTitulo]: v },
        },
      });
      return;
    }
    if (esPortada) {
      setPortada({ apa_format: v as 'student' | 'professional' });
      return;
    }
    setRules({ [ajuste.clave]: v } as never);
  };

  const id = `campo-${ajuste.clave.replace(/\./g, '-')}`;

  const cuerpo = () => {
    if (ajuste.como === 'interruptor') {
      return (
        <label
          htmlFor={id}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
        >
          <input
            id={id}
            data-campo={ajuste.clave}
            data-testid={id}
            type="checkbox"
            role="switch"
            checked={!!valor}
            onChange={(e) => escribir(e.target.checked)}
          />
          <span style={{ color: 'var(--color-text-primary)' }}>{ajuste.etiqueta}</span>
        </label>
      );
    }

    if (ajuste.como === 'texto') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor={id} style={ESTILO_ETIQUETA}>{ajuste.etiqueta}</label>
          <input
            id={id}
            data-campo={ajuste.clave}
            data-testid={id}
            type="text"
            value={String(valor ?? '')}
            onChange={(e) => escribir(e.target.value)}
            style={ESTILO_CAMPO}
          />
          {ajuste.ayuda && <span style={ESTILO_AYUDA}>{ajuste.ayuda}</span>}
        </div>
      );
    }

    if (ajuste.como === 'numero') {
      return (
        <CampoNumero ajuste={ajuste} id={id} valor={Number(valor ?? 0)} alCambiar={escribir} />
      );
    }

    /* 'fijos' y 'opciones' se dibujan igual: la diferencia es que la fuente se
     * lleva un ejemplo de la letra y el resto no. */
    const opciones = ajuste.opciones || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={ESTILO_ETIQUETA}>{ajuste.etiqueta}</span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {opciones.map((o) => {
            const activo = valor === o.valor;
            return (
              <button
                key={String(o.valor)}
                type="button"
                data-campo={ajuste.clave}
                data-testid={`${id}-${o.valor}`}
                aria-pressed={activo}
                onClick={() => {
                  escribir(o.valor);
                  if (o.escribeAdemas) setRules(o.escribeAdemas as never);
                }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                  padding: 'var(--space-2) var(--space-3)', cursor: 'pointer',
                  fontFamily: ajuste.clave === 'font_family' ? o.etiqueta : 'var(--font-family)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: activo ? 700 : 500,
                  textAlign: 'left',
                  color: activo ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  background: activo ? 'var(--color-accent-soft)' : 'var(--bg-base)',
                  border: `1px solid ${activo ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span>{o.etiqueta}</span>
                {o.nota && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{o.nota}</span>}
              </button>
            );
          })}
        </div>
        {ajuste.ayuda && <span style={ESTILO_AYUDA}>{ajuste.ayuda}</span>}
      </div>
    );
  };

  if (compacto) return cuerpo();

  return (
    <div data-ajuste={ajuste.clave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {cuerpo()}
    </div>
  );
};

/** Un campo de número. El texto es local porque un número tiene que poder
 *  quedar a medio escribir —un 2, todavía no un 2,54— sin que eso sea un
 *  formato de 2 cm: lo que se guarda es el número, cuando hay número. */
const CampoNumero: React.FC<{
  ajuste: Ajuste; id: string; valor: number; alCambiar: (v: number) => void;
}> = ({ ajuste, id, valor, alCambiar }) => {
  const [texto, setTexto] = useState(String(valor));
  const ultimo = useRef(valor);
  /* Si el valor cambia por fuera —una plantilla, el botón de restaurar— el
   * texto lo sigue. El eco de lo que este campo acaba de escribir no lo toca:
   * sin esta guarda, escribir un 2 en el campo de los márgenes con 2,54 puestos
   * lo dejaría mostrando 2,54. */
  useEffect(() => {
    if (ultimo.current === valor) return;
    ultimo.current = valor;
    setTexto(String(valor));
  }, [valor]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <label htmlFor={id} style={ESTILO_ETIQUETA}>{ajuste.etiqueta}</label>
      <input
        id={id}
        data-campo={ajuste.clave}
        data-testid={id}
        type="number"
        min={ajuste.min}
        max={ajuste.max}
        step={ajuste.paso}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n) && e.target.value.trim() !== '') alCambiar(n);
        }}
        style={{ ...ESTILO_CAMPO, fontFamily: 'var(--font-mono)' }}
      />
      <span style={ESTILO_AYUDA}>
        {`${ajuste.unidad || ''}${ajuste.ayuda ? ` · ${ajuste.ayuda}` : ''}`}
      </span>
    </div>
  );
};

export const FormatoTab: React.FC = () => {
  const doc = useDocStore((s) => s.doc);
  const rules = useDocStore((s) => s.rules);
  const resetRulesToDefault = useDocStore((s) => s.resetRulesToDefault);
  const showToast = useDocStore((s) => s.showToast);

  /* El estado de la confirmación del botón de restaurar. `null` es que no se
   * está restaurando nada; un objeto es la foto de lo que hay, para poder decir
   * qué se cambió sin inventar la lista después. */
  const [pendiente, setPendiente] = useState<Record<string, unknown> | null>(null);
  const [restaurado, setRestaurado] = useState<string[] | null>(null);

  const expresion: MascotExpression = doc
    ? expresionDePestana(PESTANA, {
      documentoAbierto: true,
      fuente: rules.font_family,
      interlineado: rules.line_spacing,
      alineacion: rules.alignment,
    })
    : 'worried';

  /* Sin documento no hay formato que ajustar: los controles se ven, se tocan y
   * no conservan nada. El Review Focus #4 pide decir eso en vez de mostrar
   * treinta campos mudos, así que se dice y no se muestran. */
  if (!doc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression="worried" size={44} />
          <p
            data-testid="formato-estado"
            style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-warning)', lineHeight: 'var(--leading-normal)' }}
          >
            Todavía no hay ningún documento abierto. El formato es de cada
            documento, así que no hay nada que ajustar hasta que abras o subas
            uno.
          </p>
        </div>
      </div>
    );
  }

  const restaurar = () => {
    const antes = { ...rules };
    resetRulesToDefault();
    setPendiente(null);
    /* Lo que se restauró, contado contra la foto de antes. La lista sale de los
     * campos DECLARADOS, no de una comparación de objetos: si el store mañana
     * gana un campo que no es un ajuste, este texto no lo nombra y no miente. */
    const despues = useDocStore.getState().rules as unknown as Record<string, unknown>;
    const cambiados = AJUSTES
      .filter((a) => !a.clave.startsWith('heading_levels.'))
      .filter((a) => a.clave !== 'portada.apa_format')
      .filter((a) => (antes as unknown as Record<string, unknown>)[a.clave] !== despues[a.clave])
      .map((a) => a.etiqueta);
    setRestaurado(cambiados);
    showToast(
      cambiados.length === 0
        ? 'El formato ya estaba en los valores por defecto.'
        : `Se restauraron ${cambiados.length} ${cambiados.length === 1 ? 'ajuste' : 'ajustes'}.`,
      cambiados.length === 0 ? 'info' : 'success',
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* La mascota con la cara del estado, y el estado en palabras al lado. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression={expresion} size={44} />
        <p
          data-testid="formato-estado"
          style={{
            margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {expresion === 'happy'
            ? 'El formato está en los valores de APA 7: fuente estándar, doble espacio y alineado a la izquierda.'
            : 'El formato se sale de APA 7 en la fuente, el interlineado o la alineación. Se puede: lo que no se puede es que el documento lo diga y el .docx no lo cumpla.'}
        </p>
      </div>

      {/* ── Los ajustes ────────────────────────────────────────────────── */}
      {SECCIONES.map((s) => {
        const Icono = ICONOS[s.clase] || ListTree;
        const controles = ajustesDe(s.clase);
        return (
          <Seccion key={s.clase} titulo={s.titulo} descripcion={s.descripcion}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-tertiary)' }}>
              <Icono size={14} strokeWidth="var(--icon-stroke)" />
              <span style={{ fontSize: 'var(--text-xs)' }}>
                {`${controles.length} ${controles.length === 1 ? 'ajuste' : 'ajustes'} del documento`}
              </span>
            </div>
            {s.clase === 'titulos'
              ? ([1, 2, 3] as const).map((nivel) => (
                <div
                  key={nivel}
                  data-nivel={nivel}
                  style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'var(--space-3)', padding: 'var(--space-3)',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {controles.filter((c) => c.nivel === nivel).map((c) => (
                    <Control key={c.clave} ajuste={c} compacto={c.como === 'interruptor'} />
                  ))}
                </div>
              ))
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
                  {controles.map((c) => <Control key={c.clave} ajuste={c} />)}
                </div>
              )}
          </Seccion>
        );
      })}

      {/* ── Las plantillas: el puente entre los dos ámbitos ─────────────── */}
      <PlantillasDeFormato />

      {/* ── Volver a los valores por defecto ────────────────────────────── */}
      <Seccion
        titulo="Volver a los valores por defecto"
        descripcion="Deja el formato en APA 7 estándar. Borra todo lo que se haya cambiado en esta pestaña, y por eso pregunta antes."
      >
        {pendiente ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <p
              data-testid="aviso-restaurar"
              style={{
                margin: 0, flex: 1, minWidth: '220px', display: 'flex', alignItems: 'flex-start',
                gap: 'var(--space-2)', fontSize: 'var(--text-sm)',
                color: 'var(--color-warning)', lineHeight: 'var(--leading-normal)',
              }}
            >
              <AlertTriangle size={15} strokeWidth="var(--icon-stroke)" />
              <span>
                Esto deja la fuente, el interlineado, la alineación, los márgenes,
                los títulos y los rótulos en los valores de APA 7. Lo que
                escribiste en esta pestaña se pierde. Las plantillas que ya
                guardaste no se tocan.
              </span>
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={restaurar}
                data-testid="boton-confirmar-restaurar"
                style={{
                  padding: 'var(--space-2) var(--space-4)', cursor: 'pointer',
                  fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)', fontWeight: 700,
                  background: 'var(--color-danger)', color: 'var(--color-text-on-accent)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                }}
              >
                Sí, restaurar
              </button>
              <button
                type="button"
                onClick={() => setPendiente(null)}
                data-testid="boton-cancelar-restaurar"
                style={{
                  padding: 'var(--space-2) var(--space-4)', cursor: 'pointer',
                  fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setRestaurado(null); setPendiente({ ...rules }); }}
              data-testid="boton-restaurar-defecto"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', alignSelf: 'flex-start',
                padding: 'var(--space-2) var(--space-4)', cursor: 'pointer',
                fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)', fontWeight: 700,
                background: 'transparent', color: 'var(--color-text-primary)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
              }}
            >
              <RotateCcw size={15} strokeWidth="var(--icon-stroke)" />
              Restaurar valores por defecto
            </button>
            <span style={ESTILO_AYUDA}>
              Afecta solo a este documento. Los demás que tengas abiertos no se mueven.
            </span>
          </div>
        )}
        {restaurado && restaurado.length > 0 && (
          <p data-testid="que-se-restauro" style={{ margin: 0, ...ESTILO_AYUDA }}>
            {`Se restauraron: ${restaurado.join(', ')}.`}
          </p>
        )}
      </Seccion>

      {/* ── Lo que no se edita, y por qué ──────────────────────────────────
       * Una lista de campos que nadie toca también es información. Sin esto,
       * alguien da por hecho que el DOI es opcional o que la sangría de la
       * bibliografía se cambia en otro lado de la app. */}
      <Seccion
        titulo="Lo que esta pestaña no deja cambiar"
        descripcion="No es que falte el control: es que el valor no es una preferencia."
      >
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {NO_ES_AJUSTE.map((n) => (
            <li key={n.campo} data-no-ajuste={n.campo} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>{n.campo}</strong>
              {` · ${n.porQue}`}
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  );
};

export default FormatoTab;
