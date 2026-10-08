/**
 * "Aplicar a todas" no existe de ninguna manera en el repo: no hay endpoint en
 * lote y `updateElementImage` es de a una. Esta action lo hace con N llamadas
 * contra el endpoint que YA existe (`python/routers/sessions.py:684`), y lo
 * importante de esta prueba no es que llame: es que NO DIGA "listo" cuando no
 * se aplico a todas.
 *
 * Con veinte figuras —el caso que la F7 le va a meter— un error a la septima es
 * el caso normal, no el raro. Decir "Se aplicó a 20 figuras" con trece aplicadas
 * es la peor versión de este botón: la persona cree que el documento está
 * uniforme y no lo está.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';

const updateElementImage = vi.fn();
vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  updateElementImage: (...a: unknown[]) => updateElementImage(...a),
}));

const doc = (n: number) => ({
  session_id: 's-f4',
  file_name: 'Tesis.docx',
  elements: Array.from({ length: n }, (_, i) => ({
    id: `elem_${i}`, type: 'image', text: `Figura ${i + 1}`,
    image_info: { figure_number: i + 1, caption: '', relative_url: '' },
  })),
  referencias: [],
  meta: { page_count: 3 },
});

const idsDe = (n: number) => Array.from({ length: n }, (_, i) => `elem_${i}`);

beforeEach(() => {
  updateElementImage.mockReset();
  useDocStore.setState({ doc: doc(20) as never, toasts: [] } as never);
});

describe('aplicar a todas: el alcance lo declara quien llama', () => {
  it('20 figuras son 20 llamadas con el MISMO patch, y una por id', async () => {
    updateElementImage.mockImplementation(async () => doc(20) as never);
    const ids = idsDe(20);
    await useDocStore.getState().aplicarImagenAMuchas(ids, { design_style: 'full_width' });
    expect(updateElementImage).toHaveBeenCalledTimes(20);
    for (const [sesion, id, patch] of updateElementImage.mock.calls) {
      expect(sesion).toBe('s-f4');
      expect(ids).toContain(id);
      expect(patch).toEqual({ design_style: 'full_width' });
    }
  });

  it('cada id se toca UNA vez, aunque venga repetido en la lista', async () => {
    /* Un `for` sobre un arreglo con duplicados hace el trabajo dos veces y cobra
       dos veces. La action deduplica. */
    updateElementImage.mockImplementation(async () => doc(20) as never);
    await useDocStore.getState().aplicarImagenAMuchas(['elem_1', 'elem_1', 'elem_2'], { design_style: 'sidebar' });
    expect(updateElementImage).toHaveBeenCalledTimes(2);
  });

  it('un ids vacio no hace NADA: sin destino, sin toast de mentira', async () => {
    await useDocStore.getState().aplicarImagenAMuchas([], { design_style: 'sidebar' });
    expect(updateElementImage).not.toHaveBeenCalled();
    expect(useDocStore.getState().toasts).toHaveLength(0);
  });

  it('si una falla, dice cuantas salieron y cuantas no, y no dice "listo"', async () => {
    /* El fallo mas caro de esta fase no es que no se aplique: es que se diga que
       se aplico. Con 20 figuras, un error a la 7 es el caso normal. */
    updateElementImage.mockImplementation(async (_s: string, id: string) => {
      if (id === 'elem_7') throw new Error('El backend no respondio');
      return doc(20) as never;
    });
    await useDocStore.getState().aplicarImagenAMuchas(idsDe(20), { design_style: 'sidebar' });
    const toasts = useDocStore.getState().toasts as { message: string; type: string }[];
    const error = toasts.find((t) => t.type === 'error');
    expect(error?.message).toMatch(/7 de 20/);
    expect(error?.message).toMatch(/no respondio/);
    /* Y el estado bueno NO se pierde: lo que si se aplico, se queda. */
    expect(toasts.some((t) => t.message.includes('Se aplicó a 20'))).toBe(false);
  });

  it('alla que funciona, avisa y devuelve el total para que la UI pueda pintar progreso', async () => {
    updateElementImage.mockImplementation(async () => doc(20) as never);
    const vistos: string[] = [];
    await useDocStore.getState().aplicarImagenAMuchas(
      idsDe(3),
      { design_style: 'standard' },
      (hechos, total) => vistos.push(hechos + '/' + total),
    );
    expect(updateElementImage).toHaveBeenCalledTimes(3);
    const toasts = useDocStore.getState().toasts as { message: string; type: string }[];
    expect(toasts.some((t) => t.type === 'success' && t.message.includes('3 figuras'))).toBe(true);
    expect(vistos).toEqual(['1/3', '2/3', '3/3']);
  });
});
