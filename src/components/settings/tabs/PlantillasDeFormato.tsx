/* WordAPA7 — las plantillas de formato: el puente entre los dos ámbitos.
 *
 * `ruleProfiles` se guardaban (`documentSlice.ts:999`) y `portadaProfiles`
 * también (`coverSlice.ts:134`), y no había NINGÚN selector para recuperarlas:
 * el estudio de ajustes solo mostraba un contador, "3 plantilla(s) guardada(s)",
 * que informaba de una caja que no se podía abrir. Se podía guardar y no se
 * podía recuperar. Eso no es una función, es una tecla.
 *
 * Y es el ÚNICO lugar de Ajustes donde un ajuste del documento se comparte. Todo
 * lo demás de la pestaña Formato se queda con el documento abierto —la línea de
 * ámbito de la pestaña lo dice una vez—, así que guardar una plantilla es la
 * única acción de Ajustes que se lleva el formato de un documento a otro. Por
 * eso el texto de esta sección lo dice en voz alta: un control que comparte
 * tiene que decir que comparte.
 *
 * Lo que se guarda NO cambia al aplicar. Por eso, si se aplica un perfil sobre
 * un documento que ya tiene otro, se puede deshacer con "Restaurar valores por
 * defecto" o volviendo a aplicar el perfil anterior: el store no tiene
 * deshacer para las reglas, y decirlo acá evita que alguien busque un botón
 * que no existe.
 */
import React, { useState } from 'react';
import { Layers, Save } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { Seccion } from './word/Seccion';
import type { APARuleSet } from '../../../types';

/** Las dos llaves de contabilidad de una plantilla guardada. `profile_name` es
 *  el nombre que se le dio y `is_default` lo marca el perfil de fábrica: no son
 *  formato, son la etiqueta de la caja, y aplicarlas como si lo fueran
 *  renombraría el documento por el nombre de una plantilla. */
const SIN_ETIQUETA = ['profile_name', 'is_default'];

const formatoDe = (perfil: APARuleSet): Partial<APARuleSet> => {
  const copia: Record<string, unknown> = { ...perfil };
  for (const llave of SIN_ETIQUETA) delete copia[llave];
  return copia as Partial<APARuleSet>;
};

const ESTILO_BOTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
  padding: 'var(--space-1) var(--space-3)', cursor: 'pointer',
  fontFamily: 'var(--font-family)', fontSize: 'var(--text-xs)', fontWeight: 700,
  background: 'transparent', color: 'var(--color-accent)',
  border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
};

const ESTILO_FILA: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
};

export const PlantillasDeFormato: React.FC = () => {
  const ruleProfiles = useDocStore((s) => s.ruleProfiles);
  const portadaProfiles = useDocStore((s) => s.portadaProfiles);
  const saveRuleProfile = useDocStore((s) => s.saveRuleProfile);
  const savePortadaProfile = useDocStore((s) => s.savePortadaProfile);
  const setRules = useDocStore((s) => s.setRules);
  const setPortada = useDocStore((s) => s.setPortada);
  const showToast = useDocStore((s) => s.showToast);

  const [nombre, setNombre] = useState('');
  const [guardadas, setGuardadas] = useState<string[] | null>(null);

  const guardar = () => {
    const limpio = nombre.trim();
    if (limpio === '') {
      showToast('La plantilla necesita un nombre para poder recuperarse después.', 'warning');
      return;
    }
    /* Se guardan las DOS cosas con un solo botón, que es lo que hacía el estudio:
       el formato del cuerpo y el de la portada son una sola decisión para quien
       va a reutilizarla. */
    saveRuleProfile(limpio);
    savePortadaProfile(`Portada: ${limpio}`);
    setGuardadas([limpio]);
    setNombre('');
    showToast(`Plantilla "${limpio}" guardada. Se puede recuperar desde acá.`, 'success');
  };

  const aplicarFormato = (nombrePlantilla: string) => {
    const perfil = ruleProfiles.find((p) => p.profile_name === nombrePlantilla);
    if (!perfil) return;
    setRules(formatoDe(perfil));
    showToast(`Se aplicó el formato de "${nombrePlantilla}" a este documento.`, 'success');
  };

  const aplicarPortada = (nombrePlantilla: string) => {
    const perfil = portadaProfiles.find((p) => p.profile_name === nombrePlantilla);
    if (!perfil || !perfil.data) return;
    /* Copia: el perfil de fábrica guarda la referencia a `defaultPortada`, y
       `setPortada` la cruzaría con el documento. */
    setPortada({ ...perfil.data });
    showToast(`Se aplicó la portada de "${nombrePlantilla}" a este documento.`, 'success');
  };

  return (
    <Seccion
      titulo="Plantillas de formato"
      descripcion="Guardar el formato de este documento con un nombre, para recuperarlo después en otro."
    >
      {/* El puente, dicho. Un control que se lleva el formato de un documento a
          otro tiene que decir que lo hace: es lo único en Ajustes que no se
          queda con el documento. */}
      <p
        data-testid="puente-plantillas"
        style={{
          margin: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
          lineHeight: 'var(--leading-normal)',
        }}
      >
        <Layers size={15} strokeWidth="var(--icon-stroke)" />
        <span>
          Esta es la única parte de Ajustes que se comparte: una plantilla se
          guarda con el documento, pero se puede aplicar a cualquier otro.
          Aplicarla cambia el formato del documento que está abierto ahora; los
          demás que tengas abiertos no se tocan.
        </span>
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, minWidth: '220px' }}>
          <label
            htmlFor="campo-nombre-plantilla"
            style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}
          >
            Nombre de la plantilla
          </label>
          <input
            id="campo-nombre-plantilla"
            data-testid="campo-nombre-plantilla"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ensayo educativo"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
              background: 'var(--bg-base)', color: 'var(--color-text-primary)',
              border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={guardar}
          data-testid="boton-guardar-plantilla"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)', cursor: 'pointer',
            fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)', fontWeight: 700,
            background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
            border: 'none', borderRadius: 'var(--radius-sm)',
          }}
        >
          <Save size={15} strokeWidth="var(--icon-stroke)" />
          Guardar plantilla
        </button>
      </div>

      {guardadas && guardadas.length > 0 && (
        <p data-testid="plantilla-guardada" style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {`Guardaste "${guardadas[guardadas.length - 1]}". Aparece abajo, con un botón para aplicarla.`}
        </p>
      )}

      {/* El contador viejo decía cuántas había y no dejaba hacer nada con
          ninguna. Acá cada una tiene su botón, que es lo que faltaba. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {`Formato guardado: ${ruleProfiles.length} ${ruleProfiles.length === 1 ? 'plantilla' : 'plantillas'}`}
        </span>
        {ruleProfiles.map((p) => (
          <div key={`reglas-${p.profile_name}`} data-plantilla={p.profile_name} style={ESTILO_FILA}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              {p.profile_name}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {`${p.font_family} ${p.font_size_pt} pt · ${p.line_spacing} de interlineado`}
            </span>
            <button
              type="button"
              onClick={() => aplicarFormato(p.profile_name)}
              data-testid={`aplicar-plantilla-${p.profile_name}`}
              style={ESTILO_BOTON}
            >
              Aplicar
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {`Portadas guardadas: ${portadaProfiles.length} ${portadaProfiles.length === 1 ? 'plantilla' : 'plantillas'}`}
        </span>
        {portadaProfiles.map((p) => (
          <div key={`portada-${p.profile_name}`} data-plantilla-portada={p.profile_name} style={ESTILO_FILA}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              {p.profile_name}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {p.data?.institution || 'sin institución'}
            </span>
            <button
              type="button"
              onClick={() => aplicarPortada(p.profile_name)}
              disabled={!p.data}
              data-testid={`aplicar-portada-${p.profile_name}`}
              style={{ ...ESTILO_BOTON, opacity: p.data ? 1 : 0.6, cursor: p.data ? 'pointer' : 'default' }}
            >
              Aplicar
            </button>
          </div>
        ))}
      </div>
    </Seccion>
  );
};

export default PlantillasDeFormato;
