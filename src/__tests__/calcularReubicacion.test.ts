/**
 * `calcularReubicacion`: el cálculo puro detrás del drag del esquema.
 *
 * La regla que protege la prosa: al mover una sección se mueve su BLOQUE
 * COMPLETO (el encabezado y su cuerpo hasta el próximo encabezado de nivel
 * igual o superior), no solo el título. Si se moviera solo el título, su prosa
 * quedaría huérfana bajo otra sección. Y una rama no puede soltarse dentro de
 * sí misma: eso la partiría en dos.
 */

import { describe, it, expect } from 'vitest';
import { calcularReubicacion } from '../components/structure/EscritorioEstructura';
import type { ElementModel } from '../types';

let sec = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({
    id: `e${++sec}`,
    style_name: '',
    alignment: 'left',
    font_name: 'Times New Roman',
    font_size: 12,
    is_bold: false,
    is_italic: false,
    is_bullet: false,
    left_indent_cm: 0,
    confidence: 1,
    is_user_modified: false,
    cita_ids: [],
    needs_review: false,
    auto_applied: false,
    ...o,
  }) as ElementModel;

describe('calcularReubicacion', () => {
  it('mueve el bloque completo: encabezado y su prosa, no solo el título', () => {
    const a1 = el({ type: 'heading', heading_level: 1, text: 'Uno', id: 'a1' });
    const ap = el({ type: 'paragraph', text: 'prosa de uno', id: 'ap' });
    const b1 = el({ type: 'heading', heading_level: 1, text: 'Dos', id: 'b1' });
    const bp = el({ type: 'paragraph', text: 'prosa de dos', id: 'bp' });
    const orden = calcularReubicacion([a1, ap, b1, bp], 'b1', 'a1');
    expect(orden).toEqual(['b1', 'bp', 'a1', 'ap']);
  });

  it('la prosa viaja con su encabezado aunque haya un H2 en medio', () => {
    const a1 = el({ type: 'heading', heading_level: 1, text: 'Uno', id: 'a1' });
    const ap = el({ type: 'paragraph', text: 'prosa', id: 'ap' });
    const a2 = el({ type: 'heading', heading_level: 2, text: 'Uno punto uno', id: 'a2' });
    const a2p = el({ type: 'paragraph', text: 'prosa h2', id: 'a2p' });
    const b1 = el({ type: 'heading', heading_level: 1, text: 'Dos', id: 'b1' });
    const orden = calcularReubicacion([a1, ap, a2, a2p, b1], 'b1', 'a1');
    // Mueve la rama "Uno" completa (H1 + H2 + prosas) antes que "Dos".
    expect(orden).toEqual(['b1', 'a1', 'ap', 'a2', 'a2p']);
  });

  it('devuelve null si el destino cae dentro de la propia rama', () => {
    const a1 = el({ type: 'heading', heading_level: 1, text: 'Uno', id: 'a1' });
    const ap = el({ type: 'paragraph', text: 'prosa', id: 'ap' });
    const a2 = el({ type: 'heading', heading_level: 2, text: 'Uno punto uno', id: 'a2' });
    expect(calcularReubicacion([a1, ap, a2], 'a1', 'a2')).toBeNull();
  });

  it('devuelve null si origen o destino no existen, o son el mismo', () => {
    const a1 = el({ type: 'heading', heading_level: 1, text: 'Uno', id: 'a1' });
    const b1 = el({ type: 'heading', heading_level: 1, text: 'Dos', id: 'b1' });
    expect(calcularReubicacion([a1, b1], 'a1', 'nope')).toBeNull();
    expect(calcularReubicacion([a1, b1], 'nope', 'b1')).toBeNull();
    expect(calcularReubicacion([a1, b1], 'a1', 'a1')).toBeNull();
  });
});
