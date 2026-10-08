import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReviewActions } from '../hooks/useReviewActions';
import type { AuditItem } from '../lib/auditItems';

/* La invariante D6 — la portada se mide pero no se escribe — tiene que vivir
   en la CAPA QUE ESCRIBE, no solo en la vista. Antes vivía en dos lugares
   que no escriben (la agrupación y `FindingDetail`) y faltaba en el único que
   sí: `aplicar`. Hoy no es alcanzable por dos coincidencias independientes
   (el subtipo de los kinds de portada cae en `otro`, cuya acción es `mark`, y el
   guard `every(readOnly)` de la agrupación). Agregar una fila a
   `PROOFREAD_SPECS` con acción `accept` lo haría alcanzable. Estos tests no
   dependen de esas coincidencias.

   `api` se inyecta en el store real, así que el test usa el mismo camino que
   la vista. */

const base: AuditItem = {
  id: 'h1', element_id: 'c1', category: 'structure', subtype: 'portada',
  severity: 'low', summary: 'Título de portada', detail: 'Termina en punto',
  originalText: 'Percepción de la identidad.', pageNumber: 1,
  phase: 'portada', readOnly: true,
};

const montar = (extra: Record<string, unknown> = {}) => {
  const updateElementText = vi.fn().mockResolvedValue(undefined);
  const showToast = vi.fn();
  const api = {
    rewriteText: vi.fn().mockResolvedValue('texto reescrito'),
    ...((extra.api as object) || {}),
  };
  const store = {
    doc: { session_id: 's1' } as never,
    updateElementText,
    autoResolveGhosts: vi.fn(),
    autoCaptionAll: vi.fn(),
    dismissComment: vi.fn(),
    dismissFinding: vi.fn(),
    showToast,
    api,
  } as never;
  const { result } = renderHook(() =>
    useReviewActions(store, {
      setMarkedIds: vi.fn(),
      setSelectedId: vi.fn(),
    } as never),
  );
  return { result, updateElementText, showToast, api };
};

describe('la capa que escribe no toca lo de solo lectura', () => {
  it('acceptOne no escribe nada', async () => {
    const { result, updateElementText } = montar();
    await act(async () => {
      await result.current.acceptOne({ ...base });
    });
    expect(updateElementText).not.toHaveBeenCalled();
  });

  it('NO pide una reescritura al backend para un hallazgo de portada', async () => {
    const { result, api } = montar();
    await act(async () => {
      await result.current.acceptOne({ ...base });
    });
    expect(api.rewriteText).not.toHaveBeenCalled();
  });

  it('un hallazgo normal sí se aplica con su sugerencia', async () => {
    const { result, updateElementText } = montar();
    await act(async () => {
      await result.current.acceptOne({
        ...base, phase: 'objetivos', readOnly: false, suggestedText: 'Determinar',
      });
    });
    expect(updateElementText).toHaveBeenCalledWith('c1', 'Determinar');
  });
});
