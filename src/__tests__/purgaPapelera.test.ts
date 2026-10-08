import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDocStore } from '../store/useDocStore';

describe('inicializarPapelera', () => {
  beforeEach(() => {
    useDocStore.setState({
      raizConfigurada: null,
      proyectos: [],
    } as any);
  });

  it('no llama al endpoint si raizConfigurada es null', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    useDocStore.setState({ raizConfigurada: null } as any);
    await (useDocStore.getState() as any).inicializarPapelera();
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('purgar'));
    fetchSpy.mockRestore();
  });

  it('llama al endpoint si raizConfigurada existe', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ eliminados: 0 }),
    } as any);
    useDocStore.setState({ raizConfigurada: '/tmp/WordAPA7' } as any);
    await (useDocStore.getState() as any).inicializarPapelera();
    expect(fetchSpy).toHaveBeenCalledWith('/api/proyectos/purgar-papelera');
    fetchSpy.mockRestore();
  });

  it('registra en activityEvent si eliminados > 0', async () => {
    const pushActivityEvent = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ eliminados: 3 }),
    } as any);
    useDocStore.setState({
      raizConfigurada: '/tmp/WordAPA7',
      pushActivityEvent,
    } as any);
    await (useDocStore.getState() as any).inicializarPapelera();
    expect(pushActivityEvent).toHaveBeenCalledWith('info', expect.stringContaining('3'));
  });

  it('no registra si eliminados === 0', async () => {
    const pushActivityEvent = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ eliminados: 0 }),
    } as any);
    useDocStore.setState({
      raizConfigurada: '/tmp/WordAPA7',
      pushActivityEvent,
    } as any);
    await (useDocStore.getState() as any).inicializarPapelera();
    expect(pushActivityEvent).not.toHaveBeenCalled();
  });

  it('no lanza si fetch falla', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    useDocStore.setState({ raizConfigurada: '/tmp/WordAPA7' } as any);
    await expect((useDocStore.getState() as any).inicializarPapelera()).resolves.not.toThrow();
  });
});
