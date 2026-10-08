/**
 * WordAPA7 — Flujo de subida unificado (sin Modo Rápido)
 *
 * Tras el refactor UX (Fase 3) se eliminó la distinción Modo Rápido / Guiado:
 * todo documento se procesa igual y se muestra en el editor (paso 1:
 * Estructura) para revisión paso a paso. El túnel de exportación se abre solo
 * cuando el usuario lo pide.
 *
 * Este test verifica que uploadFile:
 * - pasa profile_id y mode al backend
 * - NO auto-acepta elementos (bulkAcceptElements), NO valida ni audita citas
 * - NO abre el túnel de exportación (viewMode sigue 'edit')
 * - NO marca pendingQuickExport
 * - lleva al wizardStep 1 (Estructura) y sale del home
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';

vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(),
  classifyWithLLM: vi.fn(),
  updateElement: vi.fn(),
  reorderElements: vi.fn(),
  validateDocument: vi.fn(),
  validateCitations: vi.fn(),
  runAIReview: vi.fn(),
  bulkAcceptElements: vi.fn(),
  generatePreview: vi.fn(),
  listSessions: vi.fn(),
  recoverSession: vi.fn(),
  listProfiles: vi.fn(),
  setSessionProfile: vi.fn(),
}));

import * as api from '../api/backend';

const mockDoc = {
  session_id: 'sess_quick_1',
  file_name: 'trabajo.docx',
  apa_format: 'student',
  profile_id: 'apa7',
  // Elementos de alta confianza y sin revisión pendiente: así NO se dispara
  // la clasificación LLM en background y el test es determinista.
  elements: [
    { id: 'e1', type: 'heading', heading_level: 1, text: 'Introducción', needs_review: false, confidence: 0.95 },
    { id: 'e2', type: 'paragraph', text: 'Cuerpo del texto', needs_review: false, confidence: 0.9 },
  ],
  has_landscape_sections: false,
  meta: { apa_format: 'student', work_mode: 'review' },
  apa_rules: { profile_name: 'APA 7 Estándar' },
  portada: { detected: false, element_ids: [], fields: {}, profile_name: null },
  referencias: [],
  citas_intext: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useDocStore.setState({
    doc: null,
    profiles: [],
    activeProfileId: 'apa7',
    references: [],
    validationIssues: [],
    citationAuditResult: null,
    isDownloadModalOpen: false,
    pendingQuickExport: false,
    isLoading: false,
    tabs: [],
    tabDocs: {},
    history: [],
    historyIndex: -1,
    wizardStep: 1,
    atHome: true,
    viewMode: 'edit',
    portada: {
      apa_format: 'student' as const,
      title: 'Título',
      institution: 'Universidad X',
      course: '',
      date: '',
      running_head: '',
      author_note: '',
    },
    /* El autor es del acta. Ver el motivo en `python/models.py`. */
    acta: {
      autor: 'Ana García',
      profesor_asesor: [],
      comite: [],
      fecha_defensa: '',
      grupo: '',
    },
  });
});

describe('useDocStore — Flujo de subida (sin Modo Rápido)', () => {
  it('sube el documento, no auto-acepta/valida y abre el editor en el paso 1 (Estructura)', async () => {
    (api.uploadDocxFile as any).mockResolvedValue(mockDoc);

    const file = new File(['x'], 'trabajo.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await useDocStore.getState().uploadFile(file, { profileId: 'apa7', mode: 'review' });

    expect(api.uploadDocxFile).toHaveBeenCalledWith(file, { profileId: 'apa7', mode: 'review' });

    // Ya no existe el "auto-aceptar + validar + auditar" del viejo Modo Rápido.
    expect(api.bulkAcceptElements).not.toHaveBeenCalled();
    expect(api.validateDocument).not.toHaveBeenCalled();
    // Proactivo: tras subir corren auditorías silenciosas (globos WhatsApp).
    expect(api.validateCitations).toHaveBeenCalledTimes(1);
    expect(api.runAIReview).toHaveBeenCalledTimes(1);

    const state = useDocStore.getState();
    expect(state.isDownloadModalOpen).toBe(false);
    expect(state.viewMode).toBe('edit'); // se queda en el editor, NO abre el túnel
    expect(state.pendingQuickExport).toBe(false);
    expect(state.doc?.session_id).toBe('sess_quick_1');
    expect(state.wizardStep).toBe(1); // Estructura (Títulos + Cuerpo)
    expect(state.atHome).toBe(false);
  });

  it('incluso si se pide mode "quick", no abre el túnel de exportación automático', async () => {
    // El "Modo Rápido" fue eliminado: pedir mode 'quick' ya no tiene efecto
    // especial y se comporta igual que el flujo guiado (editor en paso 1).
    (api.uploadDocxFile as any).mockResolvedValue(mockDoc);

    const file = new File(['x'], 'trabajo.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await useDocStore.getState().uploadFile(file, { profileId: 'apa7', mode: 'quick' });

    const state = useDocStore.getState();
    expect(state.isDownloadModalOpen).toBe(false);
    expect(state.viewMode).toBe('edit');
    expect(state.pendingQuickExport).toBe(false);
    expect(state.wizardStep).toBe(1);
    expect(state.atHome).toBe(false);
  });

  it('cerrar el modal limpia el flag de modo rápido', () => {
    useDocStore.setState({ pendingQuickExport: true, isDownloadModalOpen: true });
    useDocStore.getState().setDownloadModalOpen(false);
    expect(useDocStore.getState().pendingQuickExport).toBe(false);
  });
});
