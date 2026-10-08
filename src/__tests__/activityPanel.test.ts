import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';

let origState: any;

beforeEach(() => {
  origState = useDocStore.getState();
});

afterEach(() => {
  useDocStore.setState(origState as any);
});

describe('Layer 4 — panel de actividad unificado', () => {
  it('pushActivityEvent agrega eventos al feed y cuenta no vistos', () => {
    useDocStore.getState().pushActivityEvent('success', 'Documento listo', 'demo.docx');
    useDocStore.getState().pushActivityEvent('warning', 'Validación: 3 hallazgos');
    const s = useDocStore.getState();
    expect(s.activityEvents.length).toBe(2);
    expect(s.activityEvents[0].title).toBe('Validación: 3 hallazgos');
    expect(s.activityEvents[0].kind).toBe('warning');
    expect(s.activityUnseen).toBe(2);
  });

  it('abrir la pestaña Actividad marca los eventos como vistos', () => {
    useDocStore.getState().pushActivityEvent('info', 'Procesando archivo…');
    useDocStore.getState().pushActivityEvent('error', 'Error al procesar');
    useDocStore.getState().setRightPanelTab('activity');
    const s = useDocStore.getState();
    expect(s.rightPanelTab).toBe('activity');
    expect(s.activityUnseen).toBe(0);
    // Los eventos se conservan (es histórico)
    expect(s.activityEvents.length).toBe(2);
  });

  it('showToast NO ensucia el feed de actividad (solo el toast flotante)', () => {
    useDocStore.getState().showToast('Referencia agregada', 'success');
    const s = useDocStore.getState();
    // Capa 2: los toasts son UI transitoria, no entran al panel de trabajo
    expect(s.activityEvents.some((e) => e.title === 'Referencia agregada' && e.kind === 'success')).toBe(false);
    expect(s.toasts.length).toBe(1);
  });

  it('el feed mantiene un máximo de 60 eventos', () => {
    for (let i = 0; i < 70; i++) {
      useDocStore.getState().pushActivityEvent('info', `Evento ${i}`);
    }
    expect(useDocStore.getState().activityEvents.length).toBe(60);
    expect(useDocStore.getState().activityEvents[0].title).toBe('Evento 69');
  });
});
