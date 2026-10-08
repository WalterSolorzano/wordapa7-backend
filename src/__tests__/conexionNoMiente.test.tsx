/**
 * La UI no ofrece un control que no llega a nada, y no dice que un control no
 * llega cuando sí llega.
 *
 * Dos guardianes, y los dos se rompen de la misma forma: por una lista escrita
 * a mano que no crece cuando la realidad crece, o por un texto que se busca en
 * el archivo equivocado.
 *
 * `HUGGINGFACE_API_KEY` es el caso: la UI mostraba el campo, el usuario escribía
 * la clave, y la clave se perdía en el renderer. Tres listas seguidas —el mapa
 * del renderer, el `dict` del endpoint y `PROVIDER_ENV_VARS`— y las tres con
 * trece entradas cuando el catálogo tenía catorce. No fue un descuido de un
 * lugar: fue tres.
 *
 * Y el otro extremo: la pestaña decía "el motor todavía no los recibe" y un
 * test consagraba esa admisión como contrato. Decir que un control no llega es
 * una afirmación, y tiene que ser tan cierta como decir que llega.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PROVEEDORES_IA, claveDeLocalStorage } from '../lib/proveedoresIA';
import { ConexionTab } from '../components/settings/tabs/ConexionTab';
import conexionTabCrudo from '../components/settings/tabs/ConexionTab.tsx?raw';
import conexionProviderFieldCrudo from '../components/settings/tabs/word/ConexionProviderField.tsx?raw';
import { useDocStore } from '../store/useDocStore';
import { render, screen, act, fireEvent } from '@testing-library/react';

const getSideloadStatus = vi.fn();
const repairSideload = vi.fn();
const syncAllProviderKeys = vi.fn();

vi.mock('../api/backend', () => ({
  getSideloadStatus: (...a: unknown[]) => getSideloadStatus(...a),
  repairSideload: (...a: unknown[]) => repairSideload(...a),
  syncAllProviderKeys: (...a: unknown[]) => syncAllProviderKeys(...a),
}));

/** Las tres listas del camino, contadas desde donde están. */
const VARIABLES_DEL_CATALOGO = [
  ...PROVEEDORES_IA.flatMap((p) => p.variablesClave),
  ...PROVEEDORES_IA.flatMap((p) => (p.variableModelo ? [p.variableModelo] : [])),
];

const esperar = (ms: number) => act(async () => {
  await new Promise((r) => setTimeout(r, ms));
});

const montar = async () => {
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<ConexionTab />); });
  return utils;
};

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  getSideloadStatus.mockReset().mockResolvedValue({ installed: false, up_to_date: false });
  repairSideload.mockReset().mockResolvedValue({ status: 'ok' });
  syncAllProviderKeys.mockReset().mockResolvedValue({ ok: true, applied: [] });
  await act(async () => {
    useDocStore.setState({
      aiProviderConfig: { nimUrl: '', useLocal: false, providerId: '' },
      apiKey: '',
      dismissedCommentIds: [],
    } as never);
  });
});

describe('la UI no ofrece un control que no llega a nada', () => {
  it('cada proveedor tiene campo para su clave y para su modelo', () => {
    const sinClave = PROVEEDORES_IA.filter((p) => p.variablesClave.length === 0).map((p) => p.id);
    const sinModelo = PROVEEDORES_IA.filter((p) => !p.variableModelo).map((p) => p.id);
    expect({ sinClave, sinModelo }).toEqual({ sinClave: [], sinModelo: [] });
  });

  it('toda variable del catálogo tiene un lugar donde escribirse', async () => {
    /* Se escribe UNA y se busca en el DOM. Es la única forma de que el número
       crezca con el catálogo: un id que se construye con el nombre de la
       variable se encuentra solo. */
    localStorage.setItem(claveDeLocalStorage('NVIDIA_API_KEY'), 'clave-de-prueba');
    await montar();

    const sinCampo: string[] = [];
    for (const variable of VARIABLES_DEL_CATALOGO) {
      const id = `campo-${variable.toLowerCase().replace(/_/g, '-')}`;
      if (!document.getElementById(id)) sinCampo.push(variable);
    }
    expect(sinCampo).toEqual([]);
  });

  it('la nota de seguridad está en la pestaña, no en un documento', () => {
    /* El aviso de que las claves del instalador vienen ofuscadas y no
       cifradas tiene que estar donde alguien escribe su clave. En el módulo
       del backend es un comentario que nadie lee. */
    const texto = conexionTabCrudo.toLowerCase();
    expect(texto).toContain('ofuscadas');
    expect(texto).toMatch(/no (están |estan )?cifrad/);
  });
});

describe('la UI no dice que un control no llega cuando sí llega', () => {
  it('la pestaña no dice que el motor todavía no recibe los modelos', () => {
    expect(conexionTabCrudo).not.toMatch(/todavía no los recibe/);
    expect(conexionTabCrudo).not.toMatch(/todavia no los recibe/);
  });

  it('el campo no dice que el modelo no se manda al backend', () => {
    expect(conexionProviderFieldCrudo).not.toMatch(/NO se manda al backend/i);
  });

  it('escribir un modelo lo manda, y eso se ve en la pantalla', async () => {
    /* El final de la cadena, en la pantalla: el campo de modelo dispara el
       sync, y el indicador de guardado aparece. Antes el modelo se guardaba en
       localStorage y el sync no se llamaba, y el texto de abajo lo decía. */
    localStorage.setItem(claveDeLocalStorage('NVIDIA_API_KEY'), 'clave-de-prueba');
    await montar();
    syncAllProviderKeys.mockClear();

    const campos = screen.queryAllByTestId('campo-modelo');
    expect(campos.length).toBeGreaterThan(0);
    const input = campos[0].querySelector('input') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'mi-modelo' } }); });
    await esperar(900);

    expect(localStorage.getItem(claveDeLocalStorage('NVIDIA_NIM_MODEL'))).toBe('mi-modelo');
    expect(syncAllProviderKeys).toHaveBeenCalled();
    expect(screen.getByText('Guardado en este equipo')).toBeTruthy();
  });
});
