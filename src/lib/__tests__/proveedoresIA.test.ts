/**
 * Paridad del catálogo frontend con el backend ampliado.
 *
 * El backend sumó cuatro proveedores (modelscope, sambanova, dashscope, agnes_ai)
 * en `python/persistence/ai_keys.py` y `llm_classifier._get_active_providers`. Si
 * el catálogo del frontend no los tiene, la persona no puede escribir esas claves
 * desde Ajustes y la app tiene un motor que el usuario no ve. Este test fija que
 * los cuatro estén y que las cuentas cuadren con el backend.
 */
import { describe, it, expect } from 'vitest';
import { PROVEEDORES_IA } from '../proveedoresIA';
import aiKeysCrudo from '../../../python/persistence/ai_keys.py?raw';

const IDS_NUEVOS = ['modelscope', 'sambanova', 'dashscope', 'agnes_ai'] as const;

describe('el catálogo del frontend tiene los cuatro proveedores nuevos', () => {
  it('los cuatro ids del backend están en el catálogo', () => {
    const ids = PROVEEDORES_IA.map((p) => p.id);
    for (const id of IDS_NUEVOS) {
      expect(ids).toContain(id);
    }
  });

  it('cada proveedor nuevo declara su clave y su modelo', () => {
    for (const id of IDS_NUEVOS) {
      const p = PROVEEDORES_IA.find((x) => x.id === id);
      expect(p, `falta ${id}`).toBeDefined();
      expect(p!.variablesClave.length).toBeGreaterThan(0);
      expect(p!.variableModelo).toMatch(/_MODEL$/);
    }
  });

  it('las cuentas coinciden con el backend (18 claves, 17 modelos)', () => {
    const claves = PROVEEDORES_IA.flatMap((p) => p.variablesClave);
    const modelos = PROVEEDORES_IA.flatMap((p) => (p.variableModelo ? [p.variableModelo] : []));
    expect(claves).toHaveLength(18);
    expect(modelos).toHaveLength(17);
  });

  it('la variable de clave de cada nuevo está en la persistencia del backend', () => {
    // El backend guarda la variable en ai_keys.py. Si el frontend ofrece una
    // variable que el backend no conoce, es un control mudo.
    for (const id of IDS_NUEVOS) {
      const p = PROVEEDORES_IA.find((x) => x.id === id)!;
      for (const v of p.variablesClave) {
        expect(aiKeysCrudo, `${v} no está en ai_keys.py`).toContain(v);
      }
      expect(aiKeysCrudo, `${p.variableModelo} no está en ai_keys.py`).toContain(p.variableModelo!);
    }
  });
});
