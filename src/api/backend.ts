/* WordAPA7 — Backend API Client */

import {
  DocumentModel,
  ElementType,
  APARuleSet,
  PortadaData,
  ReferenciaModel,
  ValidationIssue,
  SessionRecovery,
  PreviewResponse,
  LLMProgressState,
  ImageModel,
  TableModel,
} from '../types';
import { useDocStore } from '../store/useDocStore';
import { PROVEEDORES_IA } from '../lib/proveedoresIA';
import { getApiBase, getApiBaseAsync, fetchWithTrace, resolveAssetUrl } from './http';

export { getApiBase, getApiBaseAsync, resolveAssetUrl } from './http';

/**
 * Sube un archivo .docx al backend para su análisis y clasificación.
 *
 * **CRITICAL:** Usa `getApiBaseAsync()` (no `getApiBase()`) para garantizar que
 * el protocolo correcto (HTTP o HTTPS) ya haya sido detectado antes de hacer
 * la petición. Si se usa `getApiBase()` (síncrono) antes de que la detección
 * de protocolo termine, puede devolver HTTP cuando el backend está corriendo
 * en HTTPS (o viceversa), y la petición falla silenciosamente sin feedback
 * para el usuario — el bug #1 de "no sube el archivo".
 */
export async function uploadDocxFile(
  file: File,
  opts?: { profileId?: string; mode?: 'quick' | 'review' }
): Promise<DocumentModel> {
  const formData = new FormData();
  formData.append('file', file);
  if (opts?.profileId) formData.append('profile_id', opts.profileId);
  if (opts?.mode) formData.append('work_mode', opts.mode);

  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let detail = 'Error al subir el archivo';
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch { /* response body might not be JSON */ }
    throw new Error(detail);
  }

  return res.json();
}

export async function listProfiles(): Promise<{
  profiles: import('../types').FormatProfile[];
}> {
  const res = await fetchWithTrace(`${getApiBase()}/profiles`, { method: 'GET' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al listar perfiles');
  }
  return res.json();
}

export async function setSessionProfile(
  sessionId: string,
  profileId: string
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/profile/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al aplicar perfil');
  }
  return res.json();
}

export async function startBlankDocument(): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/start-blank`, {
    method: 'POST'
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al iniciar documento en blanco');
  }

  return res.json();
}

export async function downloadTemplateAsync(
  profileId: string,
  templateId: string
): Promise<void> {
  const apiBase = await getApiBaseAsync();
  await fetchTemplateToDownload(`${apiBase}/template-docx?profile_id=${encodeURIComponent(profileId)}&template_id=${encodeURIComponent(templateId)}`, `WordAPA7_${profileId}_${templateId}.docx`);
}

export function downloadTemplate(
  profileId: string,
  templateId: string
): void {
  // Descarga via fetch->blob: NUNCA navega fuera de la app si el backend
  // responde error (antes window.location.href mostraba el JSON del error
  // y "sacaba" al usuario de la aplicacion).
  void downloadTemplateAsync(profileId, templateId);
}

async function fetchTemplateToDownload(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
      useDocStore.getState().showToast(`Plantilla no disponible: ${detail}`, 'error');
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch (e) {
    useDocStore.getState().showToast(`Error descargando plantilla: ${String(e)}`, 'error');
  }
}

export interface AIIndicesSummary {
  indices: Record<string, number>;
  score: number;
  zone: string;
  elevated_count?: number;
  paragraphs_analyzed?: number;
}

export interface ProofreadBatchResponse {
  findings: import('../types').ProofreadFinding[];
  used_llm: boolean;
  ai_indices?: AIIndicesSummary | null;
}

/** Revisor por lotes: ortografía + frases IA + texto pegado (local+LLM).
 *
 *  `apiKey` y `providerId` viajan en el body porque son la elección de la
 *  pestaña Conexión. Antes el endpoint leía `os.getenv("NVIDIA_API_KEY")` en el
 *  backend: con la clave de Groq, ZenMux, Cerebras, Ollama o HuggingFace puesta
 *  acá y no en el entorno, el refinamiento de ortografía no ocurría nunca, y esa
 *  es la auditoría que dispara al abrir el documento. */
export async function proofreadBatch(
  sessionId: string,
  opts: { apiKey?: string; providerId?: string } = {},
): Promise<ProofreadBatchResponse> {
  const res = await fetchWithTrace(`${getApiBase()}/proofread-batch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      api_key: opts.apiKey || '',
      provider_id: opts.providerId || '',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface SideloadStatus {
  installed: boolean;
  up_to_date: boolean;
  path: string;
  installed_at: string | null;
}

/** Estado del complemento de Word (carpeta System Feed). */
export async function getSideloadStatus(): Promise<SideloadStatus> {
  const res = await fetch(`${getApiBase()}/addin/sideload-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Re-ejecuta el auto-setup del add-in (repara sideload). */
export async function repairSideload(): Promise<{ status: string }> {
  const res = await fetch(`${getApiBase()}/addin/auto-setup`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Estado REAL del complemento dentro de Word.
 *
 * Se usa `sideload-status-v2` y no la v1 a propósito: la v1 solo mira la carpeta
 * del System Feed, o sea que responde "instalado" aunque Word esté cerrado.
 * `active_in_word` sale del latido que el taskpane manda cada 60 s, con techo de
 * 120 s en el backend. Es el único antecedente que habilita decir "en vivo".
 */
export interface WordConnection {
  installed: boolean;
  heartbeat_age_s: number | null;
  active_in_word: boolean;
}

export async function getWordConnection(): Promise<WordConnection> {
  const res = await fetch(`${getApiBase()}/addin/sideload-status-v2`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Trae al frente el Word del usuario con su documento abierto.
 *
 * No abre el panel del complemento: eso no se puede desde afuera de Word. Abre
 * el archivo donde el panel vive. Por eso la respuesta es `{ ok: true }` y nada
 * más — el estado de conexión lo decide el latido, no esta llamada.
 */
export async function connectWord(path: string): Promise<{ ok: boolean }> {
  const res = await fetchWithTrace(`${getApiBase()}/connect-word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function bulkAcceptElements(  sessionId: string,
  elementIds: string[]
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/bulk-accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, element_ids: elementIds }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al aprobar elementos');
  }

  return res.json();
}

export async function classifyWithLLM(
  sessionId: string,
  apiKey?: string,
  aiProviderConfig?: { nimUrl: string; useLocal: boolean; providerId: string }
): Promise<DocumentModel> {
  const formData = new FormData();
  if (apiKey) formData.append('api_key', apiKey);
  if (aiProviderConfig) {
    formData.append('nim_url', aiProviderConfig.nimUrl);
    formData.append('use_local', aiProviderConfig.useLocal ? 'true' : 'false');
    formData.append('provider_id', aiProviderConfig.providerId);
  }

  const res = await fetchWithTrace(`${getApiBase()}/classify/${sessionId}`, {
    method: 'POST', body: formData,
  });

  if (!res.ok) {
    throw new Error('Error al clasificar con LLM');
  }

  return res.json();
}

export async function updateElement(
  sessionId: string,
  elementId: string,
  type: ElementType,
  headingLevel?: number,
  text?: string,
  equation?: Record<string, any>,
  tableInfo?: Partial<TableModel>,
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/update-element`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      type,
      heading_level: headingLevel ?? 1,
      text,
      ...(equation ? { equation } : {}),
      ...(tableInfo ? { table_info: tableInfo } : {}),
    }),
  });

  if (!res.ok) throw new Error('Error al actualizar el elemento');
  return res.json();
}

/**
 * API de contenido / copiloto — inserta una figura ya renderizada por el
 * backend tras `afterElementId` (párrafo con imagen inline + elemento image).
 */
export async function insertImageElement(
  sessionId: string,
  afterElementId: string,
  newElementId: string,
  image: Partial<import('../types').ImageModel>,
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/elements/insert-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      after_element_id: afterElementId,
      new_element_id: newElementId,
      image,
    }),
  });
  if (!res.ok) throw new Error('Error al insertar la figura');
  return res.json();
}

/**
 * Fase 3 — inserta un párrafo físico en el docx y un elemento en el modelo,
 * tras `afterElementId` (división de párrafo con Enter en el editor inline).
 */
export async function insertElement(
  sessionId: string,
  afterElementId: string,
  newElementId: string,
  text: string,
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/elements/insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      after_element_id: afterElementId,
      new_element_id: newElementId,
      text,
      type: 'paragraph',
    }),
  });

  if (!res.ok) throw new Error('Error al insertar el párrafo');
  return res.json();
}

export async function updateElementImage(
  sessionId: string,
  elementId: string,
  imageInfo: Partial<ImageModel>
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/update-element`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      type: 'image' as ElementType,
      heading_level: 1,
      image_info: imageInfo,
    }),
  });

  if (!res.ok) throw new Error('Error al actualizar imagen');
  return res.json();
}

/** C2: Persiste cambios de table_info (caption, note, table_number, etc.) via el
 *  endpoint unificado /update-element enviando el campo table_info. */
export async function updateElementTable(
  sessionId: string,
  elementId: string,
  tableInfo: Partial<TableModel>
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/update-element`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      type: 'table' as ElementType,
      heading_level: 1,
      table_info: tableInfo,
    }),
  });

  if (!res.ok) throw new Error('Error al actualizar tabla');
  return res.json();
}

export async function replaceImageFile(
  sessionId: string,
  elementId: string,
  file: File
): Promise<DocumentModel> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithTrace(`${getApiBase()}/replace-image/${sessionId}/${elementId}`, {
    method: 'POST', body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'Error al reemplazar la imagen');
  }
  return res.json();
}

export interface SpellingFinding {
  word: string;
  suggestions: string[];
  ai_is_error?: boolean;
}

/** Lo que el renderer manda a `/api/sync-provider-keys`.
 *
 *  Antes esto era un `dict` escrito a mano con trece entradas, y
 *  `HUGGINGFACE_API_KEY` no estaba: la UI mostraba el campo, aceptaba la clave
 *  y la clave se perdia acá, en el renderer, antes de salir. Tres listas
 *  seguidas —esta, el `dict` del endpoint y `PROVIDER_ENV_VARS`— y las tres la
 *  omitian.
 *
 *  AHORA se deriva del catalogo. El endpoint acepta exactamente el catalogo, y
 *  un nombre inventado no lo acepta: la lista de este mapa no tiene que
 *  coincidir con nada, tiene que ser el catalogo. Si mañana se agrega un
 *  proveedor, sale solo; si no, se ve. */
const VARIABLES_DEL_CATALOGO: readonly string[] = [
  ...PROVEEDORES_IA.flatMap((p) => p.variablesClave),
  ...PROVEEDORES_IA.flatMap((p) => (p.variableModelo ? [p.variableModelo] : [])),
];

/** Lo que contesto un ping de proveedor. */
export interface ResultadoDeProbarProveedor {
  provider_id: string;
  ok: boolean;
  status: number | null;
  ms: number;
  model: string | null;
  motivo: string;
  /** Segundos hasta poder reintentar. Solo viene en un 429 (cuota agotada). */
  retry_after?: number | null;
}

/** Le pregunta a UN proveedor si su clave funciona, y dice cuanto costo.
 *
 *  Existia un problema concreto: `getAiHealth` dice como esta el token bucket
 *  de cada especialidad, no si la clave del usuario sirve. Un 401, una cuota
 *  agotada y un proveedor que responde rapido se veian igual, y la unica forma
 *  de averiguarlo era gastar una tarea completa del documento.
 *
 *  El resultado NO se tira en un toast: un toast se borra, y esto es lo que el
 *  usuario necesita tener a la vista mientras decide si su clave sirve. Lo
 *  muestra la fila del proveedor. */
export async function probarProveedor(
  providerId: string,
  apiKey?: string,
): Promise<ResultadoDeProbarProveedor> {
  try {
    const res = await fetchWithTrace(`${getApiBase()}/ai/probar-proveedor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, api_key: apiKey || '' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    return {
      provider_id: providerId,
      ok: false,
      status: null,
      ms: 0,
      model: null,
      motivo: e?.message ? `No se pudo consultar: ${e.message}` : 'No se pudo consultar.',
    };
  }
}

/** Sincroniza las claves y los modelos guardados en localStorage con el
 *  backend (`os.environ`).
 *
 *  Los modelos tambien viajan. Antes no: un modelo se guardaba en este equipo
 *  y no pasaba, y el campo decia "el motor todavia no los recibe". Era verdad y
 *  era la misma clase de mentira que un control decorativo con la etiqueta de
 *  uno funcional. */
export async function syncAllProviderKeys(): Promise<{ ok: boolean; applied: string[]; error?: string }> {
  const claves: Record<string, string> = {};
  const modelos: Record<string, string> = {};
  try {
    for (const envVar of VARIABLES_DEL_CATALOGO) {
      const stored = (localStorage.getItem(`wordapa7-provider-key:${envVar}`) || '').trim();
      if (!stored) continue;
      if (envVar.endsWith('_MODEL') || envVar.endsWith('_AI_MODEL')) modelos[envVar] = stored;
      else claves[envVar] = stored;
    }
  } catch { /* noop */ }
  if (Object.keys(claves).length === 0 && Object.keys(modelos).length === 0) {
    return { ok: true, applied: [] };
  }
  try {
    const res = await fetchWithTrace(`${getApiBase()}/sync-provider-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: claves, modelos }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return { ok: false, applied: [], error: err?.detail || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, applied: data?.applied || Object.keys(claves) };
  } catch (e: any) {
    return { ok: false, applied: [], error: e?.message || String(e) };
  }
}

export async function reorderElements(
  sessionId: string,
  elementIds: string[]
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/reorder-elements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_ids: elementIds,
    }),
  });

  if (!res.ok) throw new Error('Error al reordenar los elementos');
  return res.json();
}

export async function validateDocument(
  sessionId: string,
  references: ReferenciaModel[]
): Promise<ValidationIssue[]> {
  const res = await fetchWithTrace(`${getApiBase()}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      references,
    }),
  });

  if (!res.ok) throw new Error('Error al validar el documento');
  const data = await res.json();
  return data.issues;
}

export async function validateCitations(
  sessionId: string
): Promise<{ ghost_citations: any[]; orphan_references: any[] }> {
  const res = await fetchWithTrace(`${getApiBase()}/validate-citations/${sessionId}`, {
    method: 'POST',
  });

  if (!res.ok) throw new Error('Error al validar citas');
  return res.json();
}

/** Reordena la bibliografía con la clave APA del backend (apellido sin tildes). */
export async function sortReferences(
  sessionId: string,
  references?: readonly ReferenciaModel[],
): Promise<ReferenciaModel[]> {
  const init: RequestInit = {
    method: 'POST',
  };
  if (references !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify({ references });
  }
  const res = await fetchWithTrace(`${getApiBase()}/references/sort/${sessionId}`, init);
  if (!res.ok) throw new Error('Error al reordenar las referencias');
  const data = await res.json();
  return data.referencias || [];
}


export interface CitationStyleReport {
  mixed: boolean;
  ieee: number;
  vancouver: number;
  apa: number;
}

/** Estilo de cita detectado en el cuerpo: APA, numérica o ambos. */
export async function detectCitationStyle(sessionId: string): Promise<CitationStyleReport> {
  const res = await fetchWithTrace(`${getApiBase()}/citation-style/${sessionId}`);
  if (!res.ok) throw new Error('Error al detectar el estilo de citas');
  return res.json();
}

export async function generatePreview(
  sessionId: string,
  rules: APARuleSet,
  portada: PortadaData,
  references: ReferenciaModel[]
): Promise<PreviewResponse> {
  const res = await fetchWithTrace(`${getApiBase()}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      rules,
      portada,
      references,
    }),
  });

  if (!res.ok) throw new Error('Error al generar vista previa');
  return res.json();
}

export async function generateDocx(
  sessionId: string,
  rules?: APARuleSet,
  portada?: PortadaData,
  references?: ReferenciaModel[]
): Promise<PreviewResponse> {
  const store = (await import('../store/useDocStore')).useDocStore.getState();
  return generatePreview(
    sessionId,
    rules || store.rules,
    portada || store.portada,
    references || store.references
  );
}

export async function openInWord(sessionId: string): Promise<void> {
  await fetchWithTrace(`${getApiBase()}/open-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
}


export async function generatePreviewPdf(
  sessionId: string,
  rules: APARuleSet,
  portada: PortadaData,
  references: ReferenciaModel[]
): Promise<any> {
  const res = await fetchWithTrace(`${getApiBase()}/preview-pages/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, rules, portada, references }),
  });
  const data = await res.json();
  if (data.status === 'pdf') {
     return { status: 'ok', download_url: data.pdf_url };
  }
  return data;
}

export async function suggestCaption(
  sessionId: string,
  elementId: string,
  contextText: string,
  apiKey?: string
): Promise<string> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/suggest-caption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      context_text: contextText,
      api_key: apiKey,
      provider_id: proveedorElegido(),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al sugerir leyenda');
  }
  const data = await res.json();
  return data.suggestion;
}

export async function rewriteText(
  sessionId: string,
  elementId: string,
  text: string,
  instruction: string,
  apiKey?: string
): Promise<string> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/rewrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      text: text,
      instruction: instruction,
      api_key: apiKey,
      provider_id: proveedorElegido(),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al reescribir texto');
  }
  const data = await res.json();
  return data.rewritten;
}

/** Reformular con IA: devuelve una propuesta EDITABLE; nunca escribe el doc. */
export async function reformulateText(text: string, apiKey?: string): Promise<string> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/reformulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, api_key: apiKey, provider_id: proveedorElegido() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al reformular con IA');
  }
  const data = await res.json();
  return data.proposal;
}

export interface RewriteVariationsResult {
  variations: string[];
  provider: string;
  provider_id: string;
}

export async function rewriteVariations(
  sessionId: string,
  elementId: string,
  text: string,
  instruction: string,
  n = 3,
  apiKey?: string
): Promise<RewriteVariationsResult> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/rewrite-variations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId, element_id: elementId, text,
      instruction, n, api_key: apiKey,
      provider_id: proveedorElegido(),
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al generar variaciones');
  }
  return res.json();
}

export interface AIProviderConfigShape {
  nimUrl?: string;
  useLocal?: boolean;
  providerId?: string;
}

/** El proveedor que el usuario eligió, leído del store.
 *
 *  Los endpoints que llaman al LLM necesitan saber a cuál se le pregunta: sin
 *  esto, elegir Groq en la pestaña Conexión solo cambiaba la clasificación y
 *  todo lo demás iba por la cadena completa, con la especialidad como único
 *  criterio. Los que ya reciben `aiProviderConfig` usan el que les pasan; el
 *  resto lo lee de acá, porque hacer que cada llamada lo pasara a mano es
 *  exactamente la forma de que uno se quede sin él sin que nadie lo note. */
const proveedorElegido = (): string =>
  useDocStore.getState().aiProviderConfig?.providerId || '';

/** Genera un comentario humorístico estilo WhatsApp con el LLM (opcional). */
export async function generateChatComment(
  sessionId: string,
  elementId: string,
  kind: string,
  elementText: string,
  apiKey?: string,
  aiProviderConfig?: AIProviderConfigShape
): Promise<string> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/chat-comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      kind,
      element_text: elementText,
      api_key: apiKey,
      nim_url: aiProviderConfig?.nimUrl,
      use_local: aiProviderConfig?.useLocal,
      provider_id: aiProviderConfig?.providerId,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al generar comentario');
  }
  const data = await res.json();
  return data.comment;
}

/** Genera un tip de carga (pantalla de progreso) con el LLM (opcional). */
export async function generateLoadingTip(
  category: 'process' | 'jokes' | 'apa' | 'honest',
  phase: string,
  apiKey?: string,
  aiProviderConfig?: AIProviderConfigShape
): Promise<{ category: string; text: string }> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/loading-tip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category,
      phase,
      api_key: apiKey,
      nim_url: aiProviderConfig?.nimUrl,
      use_local: aiProviderConfig?.useLocal,
      provider_id: aiProviderConfig?.providerId,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al generar tip');
  }
  return res.json();
}

export interface CitationFixResult {
  corrected: string;
  reason: string;
  action: string;
}

export async function citationFix(
  sessionId: string,
  citationText: string,
  referenceId?: string,
  problem?: string,
  apiKey?: string
): Promise<CitationFixResult> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/citation-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId, citation_text: citationText,
      reference_id: referenceId, problem: problem, api_key: apiKey,
      provider_id: proveedorElegido(),
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al sugerir corrección de cita');
  }
  return res.json();
}

export interface ProviderStatus {
  id: string;
  name: string;
  active: boolean;
  capacity: { timeout_s: number; typical_latency_s: number; max_tokens: number } | null;
}
export interface ProviderStatusResult {
  providers: ProviderStatus[];
  total_active: number;
  total_configured: number;
  classification_available: boolean;
}

export async function getProviderStatus(): Promise<ProviderStatusResult> {
  const res = await fetchWithTrace(`${getApiBase()}/provider-status`);
  if (!res.ok) throw new Error('Error al obtener estado de proveedores IA');
  return res.json();
}

export async function exportLatex(sessionId: string): Promise<string> {
  const res = await fetchWithTrace(`${getApiBase()}/export-latex/${sessionId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Error al exportar a LaTeX');
  const data = await res.json();
  return data.latex;
}

export async function listSessions(): Promise<SessionRecovery[]> {
  const res = await fetchWithTrace(`${getApiBase()}/sessions`);

  if (!res.ok) {
    throw new Error('Error al listar sesiones');
  }

  const data = await res.json();
  return data.sessions;
}

export async function recoverSession(sessionId: string): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/session/${sessionId}`);

  if (!res.ok) {
    throw new Error('Error al recuperar sesión');
  }

  return res.json();
}

export async function saveSessionSnapshot(sessionId: string): Promise<void> {
  const res = await fetchWithTrace(`${getApiBase()}/sessions/${sessionId}/snapshot`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Error al guardar el progreso');
  }
}

export interface SessionSnapshot {
  id: number;
  created_at: string;
  element_count: number;
  file_name: string;
}

export async function listSessionSnapshots(sessionId: string): Promise<SessionSnapshot[]> {
  const res = await fetchWithTrace(`${getApiBase()}/sessions/${sessionId}/snapshots`);
  if (!res.ok) throw new Error('Error al listar el historial');
  const data = await res.json();
  return data.snapshots ?? [];
}

export async function restoreSessionSnapshot(sessionId: string, snapshotId: number): Promise<DocumentModel> {
  const res = await fetchWithTrace(
    `${getApiBase()}/sessions/${sessionId}/restore-snapshot/${snapshotId}`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error('Error al restaurar la versión');
  return res.json();
}

export interface AIReviewFinding {
  phrase: string;
  detail: string;
  severity: string;
}
export interface AIReviewParagraph {
  element_id: string;
  index: number;
  type: string;
  text: string;
  ai_score: number;
  ai_category: 'LOW' | 'MEDIUM' | 'HIGH';
  findings: AIReviewFinding[];
  spelling: { word: string; suggestions: string[] }[];
}
export interface AIReviewTableSignal {
  element_id: string;
  type: string;
  pattern: string;
  detail: string;
  severity: string;
  count: number;
  phrase: string;
}
export interface AIReviewResult {
  session_id: string;
  total_paragraphs: number;
  ai_avg_score: number;
  flagged_count: number;
  spelling_count: number;
  spelling_status: string;
  paragraphs: AIReviewParagraph[];
  table_signals: AIReviewTableSignal[];
  document_signals: string[];
  ai_indices?: AIIndicesSummary | null;
}

export async function runAIReview(sessionId: string): Promise<AIReviewResult> {
  const res = await fetchWithTrace(`${getApiBase()}/ai-review/${sessionId}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Error al ejecutar el revisor IA');
  }
  return res.json();
}

export async function detectSimilarHeadings(
  sessionId: string,
  elementId: string,
  newType: string,
): Promise<{ similar_ids: string[]; count: number }> {
  const res = await fetch(`${getApiBase()}/detect-similar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, element_id: elementId, new_type: newType }),
  });
  return await res.json();
}

export async function getClassifyProgress(sessionId: string): Promise<LLMProgressState> {
  const res = await fetchWithTrace(`${getApiBase()}/classify/progress/${sessionId}`);
  if (!res.ok) throw new Error('Error al obtener progreso de clasificación');
  return res.json();
}

export async function validateCitationsWithAI(
  sessionId: string,
  references: ReferenciaModel[],
  apiKey?: string,
  aiProviderConfig?: { nimUrl: string; useLocal: boolean; providerId: string }
): Promise<ValidationIssue[]> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('references', JSON.stringify(references));
  if (apiKey) formData.append('api_key', apiKey);
  if (aiProviderConfig) {
    formData.append('nim_url', aiProviderConfig.nimUrl);
    formData.append('use_local', aiProviderConfig.useLocal ? 'true' : 'false');
    formData.append('provider_id', aiProviderConfig.providerId);
  }

  const res = await fetchWithTrace(`${getApiBase()}/validate/ai`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Error al validar citas con IA');
  const data = await res.json();
  return data.issues;
}

// ── TEMPLATES API ───────────────────────────────────────────────────────────

export interface TemplateInfo {
  name: string;
  description: string;
  has_cover_page: boolean;
  has_toc: boolean;
  has_references: boolean;
  section_count: number;
}

export async function fetchTemplates(): Promise<TemplateInfo[]> {
  const res = await fetchWithTrace(`${getApiBase()}/templates`);
  if (!res.ok) throw new Error('Error al obtener plantillas');
  const data = await res.json();
  return data.templates || [];
}

export async function applyTemplate(
  sessionId: string,
  templateName: string,
  numberingStyle: string = 'decimal'
): Promise<any> {
  const res = await fetchWithTrace(`${getApiBase()}/apply-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      template_name: templateName,
      numbering_style: numberingStyle,
    }),
  });
  if (!res.ok) throw new Error('Error al aplicar plantilla');
  return res.json();
}

/** Crea una NUEVA sesión a partir de una plantilla de estructura (sin documento previo). */
export async function createFromTemplate(
  templateId: string,
  profileId: string = 'apa7'
): Promise<any> {
  const res = await fetchWithTrace(`${getApiBase()}/create-from-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: templateId, profile_id: profileId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'Error al crear documento desde plantilla');
  }
  return res.json();
}

// ── COVER DESIGNER API ──────────────────────────────────────────────────────

export interface CoverTemplateInfo {
  name: string;
  description: string;
  source_type: 'image' | 'docx' | 'builtin';
  source_path: string;
  preview_path: string;
  is_builtin: boolean;
  created_at: string;
}

export interface ApplyCoverRequest {
  session_id: string;
  cover_template_name: string;
  title: string;
  author: string;
  institution: string;
  course: string;
  instructor: string;
  date: string;
}

export async function fetchCoverTemplates(): Promise<CoverTemplateInfo[]> {
  const res = await fetchWithTrace(`${getApiBase()}/cover-templates`);
  if (!res.ok) throw new Error('Error al obtener plantillas de portada');
  const data = await res.json();
  return data.templates || [];
}

export async function applyCover(req: ApplyCoverRequest): Promise<{ status: string; message: string; cover_template_name: string; document?: any }> {
  const res = await fetchWithTrace(`${getApiBase()}/apply-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: req.session_id,
      cover_template_name: req.cover_template_name,
      title: req.title,
      author: req.author,
      institution: req.institution,
      course: req.course,
      instructor: req.instructor,
      date: req.date,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Error al aplicar portada');
  }
  return res.json();
}

export async function uploadCoverDocx(file: File, name?: string, description?: string): Promise<{
  status: string;
  detected: boolean;
  fields: Record<string, string>;
  template: CoverTemplateInfo;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  if (description) formData.append('description', description);

  const res = await fetchWithTrace(`${getApiBase()}/cover-templates/upload-docx`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'Error al importar la portada');
  }

  return res.json();
}

export function getCoverPreviewUrl(name: string): string {
  return `${getApiBase()}/cover-templates/preview/${encodeURIComponent(name)}`;
}

/**
 * Sube una imagen del proyecto a disco y devuelve su `assetId`.
 *
 * F7 Task 1. Antes la imagen se quedaba en un `URL.createObjectURL` del store,
 * que muere con la pestaña: al reabrir la app el string sobreviva pero no
 * resuelve. Ahora lo que sobrevive es un identificador, y lo que se muestra es
 * la URL del asset.
 *
 * `getApiBaseAsync()` y no `getApiBase()`, por el mismo motivo que
 * `uploadDocxFile`: es la unica forma de garantizar que el protocolo este
 * detectado antes de la peticion. Sin eso la subida falla en silencio cuando el
 * motor corre por HTTPS.
 */
export async function subirImagenDeProyecto(
  file: File,
): Promise<{ assetId: string; name: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/assets/subir`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'No se pudo subir la imagen');
  }

  const data = await res.json();
  return { assetId: data.asset_id, name: data.name || file.name };
}

/** La ruta de un asset, ya resuelta para el esquema de la app (Electron). */
export function urlDeAsset(assetId: string): string {
  return resolveAssetUrl(`/api/assets/archivo/${encodeURIComponent(assetId)}`);
}

/* ── Proyectos (F7 Task 2) ───────────────────────────────────────────────────
   El tipo vive en `lib/proyecto`, no aca: este archivo es el transporte y no
   debe ser donde se decide que es un proyecto. Se importa el tipo, no se
   redeclara — dos declaraciones de la misma forma son dos verdades que un dia
   no coinciden. */

import type { Proyecto } from '../lib/proyecto';

export async function listarProyectos(): Promise<Proyecto[]> {
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/proyectos`);
  if (!res.ok) throw new Error('No se pudieron leer los proyectos');
  const data = await res.json();
  return data.proyectos || [];
}

export async function crearProyectoEnDisco(params: {
  nombre: string;
  raiz?: string | null;
}): Promise<Proyecto> {
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/proyectos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: params.nombre, raiz: params.raiz ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    /* El mensaje del backend se propaga tal cual. Un 400 de "necesita un
       nombre" reescrito aca seria una segunda version de la regla, y la que
       llegaria a la pantalla es la que nadie va a actualizar. */
    throw new Error(err?.detail || 'No se pudo crear el proyecto');
  }
  return res.json();
}

/**
 * Borra un proyecto.
 *
 * NO borra las sesiones que contenia. Un proyecto es el agrupador, no el
 * contenido: borrar sus documentos seria borrar el trabajo de alguien sin que
 * lo pidiera, y no hay forma de deshacer un `.docx`.
 */
export async function borrarProyectoEnDisco(id: string): Promise<void> {
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/proyectos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'No se pudo borrar el proyecto');
  }
}

/**
 * Relee la carpeta del proyecto.
 *
 * `error` NO es un fallo de la llamada: el endpoint contesta 200 con la lista que
 * conservo y un texto de por que no pudo releer. Por eso esta funcion NO tira
 * cuando `error` viene: quien llama necesita los dos datos, y tirar el `error`
 * perderia la lista.
 */
export async function sincronizarProyecto(id: string): Promise<{
  proyecto: Proyecto;
  documentos: string[];
  error: string | null;
}> {
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/proyectos/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'No se pudo sincronizar el proyecto');
  }
  return res.json();
}

export async function resolveReferencesBatch(
  references: any[],
): Promise<{ resolved?: any[]; results?: any[] }> {
  const res = await fetchWithTrace(`${getApiBase()}/references/resolve-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ references }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'Error al resolver referencias en lote');
  }
  return res.json();
}

export async function resolveGhostCitation(
  authors: string[],
  year: string,
): Promise<{ found: boolean; candidates?: { authors: string[]; year: string; title: string; source: string; doi?: string; formatted_apa: string; relevance: string }[]; total_results?: number }> {
  const res = await fetchWithTrace(`${getApiBase()}/resolve-ghost-citation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authors, year }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'Error al buscar referencia fantasma');
  }
  return res.json();
}

/** C3: Envía el schema correcto que espera el backend:
 *  { element_type, text, rules_applied, confidence, session_id?, element_id?, question?, api_key? }.
 *  Antes enviaba `{ id, question }` que no coincidía con ExplainElementRequest. */
export async function explainElement(
  sessionId: string,
  element: { id: string; type: string; text?: string; confidence?: number; pre_classifier_rule?: string; llm_reasoning?: string },
  question?: string,
  apiKey?: string,
): Promise<{ explanation?: string }> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/explain-element`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: element.id,
      element_type: element.type || '',
      text: element.text || '',
      rules_applied: element.pre_classifier_rule || element.llm_reasoning || '',
      confidence: element.confidence ?? 0,
      question: question || '',
      api_key: apiKey,
      provider_id: proveedorElegido(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || 'Error al solicitar explicación IA');
  }
  return res.json();
}

// ── Engine V2 (P2): Auditoría estructural global via LLM ────────────────

export interface StructureAuditResult {
  heading_issues: string[];
  missing_sections: string[];
  reference_issues: string[];
  format_suggestions: string[];
  overall_assessment: 'good' | 'needs_review' | 'critical';
  summary: string;
}

export async function auditDocumentStructure(
  sessionId: string,
  opts?: { apiKey?: string; nimUrl?: string; useLocal?: boolean; providerId?: string },
): Promise<StructureAuditResult> {
  const res = await fetchWithTrace(`${getApiBase()}/audit-structure/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || 'Error al auditar estructura del documento');
  }
  return res.json();
}

// ── WORD ADD-IN API ──────────────────────────────────────────────────────

/** Resultado del sideload del complemento de Word en el registro de Windows. */
export interface AddinSideloadResult {
  status: 'ok' | 'not_supported' | 'error';
  hint?: string;
  manifest_url?: string;
  registry_key?: string;
  message?: string;
}

/**
 * Registra (o actualiza) el complemento de WordAPA7 en el registro de Windows
 * (HKCU\Software\Microsoft\Office\16.0\Wef\Developer\WordAPA7) para que Word lo
 * detecte automáticamente en la lista de complementos.
 *
 * Es idempotente: llamarlo múltiples veces actualiza la URL sin duplicar.
 * No requiere permisos de administrador (usa HKCU).
 *
 * Llama al endpoint GET /api/addin/registry-sideload del backend Python.
 */
export async function sideloadWordAddin(): Promise<AddinSideloadResult> {
  const res = await fetchWithTrace(`${getApiBase()}/addin/registry-sideload`, {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('No se pudo contactar al motor para registrar el complemento');
  }
  return res.json();
}

// ── MANTENIMIENTO ────────────────────────────────────────────────────────────

/** Lo que devolvió `/api/admin/cleanup`. Los dos contadores están porque borrar
 *  una sesión vencida y borrar un `preview.pdf` no es la misma cosa, y un
 *  mensaje que solo dijera "se depuró" no dejaría leer ninguna de las dos. */
export interface ResultadoDeLimpieza {
  status: string;
  sesiones_borradas: number;
  archivos_temporales: number;
  bytes: number;
  /** El texto que arma el backend. Se muestra tal cual: la cuenta la hizo él,
   *  que es el único que sabe qué encontró. */
  message: string;
}

/** "Depurar caché". Antes el botón mostraba un toast de éxito sin borrar nada:
 *  este es el endpoint que lo borra. */
export async function depurarCache(): Promise<ResultadoDeLimpieza> {
  const res = await fetchWithTrace(`${getApiBase()}/admin/cleanup`, { method: 'POST' });
  if (!res.ok) {
    let detalle = 'No se pudo contactar al motor para limpiar';
    try {
      const err = await res.json();
      detalle = err.detail || detalle;
    } catch { /* la respuesta puede no ser JSON */ }
    throw new Error(detalle);
  }
  return res.json();
}

// ── LIVE AI CHAT & PROACTIVE CAPTIONS ────────────────────────────────────────

export interface LiveChatAction {
  type: 'update_text' | 'set_type' | 'insert_citation' | 'add_reference' | 'set_caption' | 'set_note' | 'split_paragraph' | 'delete_element' | 'add_diagram';
  element_id?: string;
  text?: string;
  element_type?: string;
  level?: number;
  citation?: string;
  reference?: string;
  caption?: string;
  note?: string;
  paragraphs?: string[];
  /** API de contenido / copiloto — figura ya renderizada por el backend. */
  image?: Partial<import('../types').ImageModel>;
}

export interface LiveChatResponse {
  reply: string;
  actions: LiveChatAction[];
}

export async function sendLiveChat(
  sessionId: string,
  userInstruction: string,
  selectedElementId?: string | null,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<LiveChatResponse> {
  const apiKey = useDocStore.getState().apiKey;
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/ai/live-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      user_instruction: userInstruction,
      selected_element_id: selectedElementId || undefined,
      history: history || [],
      api_key: apiKey || undefined,
      provider_id: proveedorElegido(),
    }),
  });

  if (!res.ok) {
    let msg = 'Error en el chat con la IA';
    try {
      const err = await res.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

export async function fetchProactiveCaptions(sessionId: string): Promise<{
  suggestions: Array<{
    element_id: string;
    type: string;
    caption: string;
    note: string;
  }>;
}> {
  const apiKey = useDocStore.getState().apiKey;
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/ai/proactive-captions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      api_key: apiKey || undefined,
      provider_id: proveedorElegido(),
    }),
  });

  if (!res.ok) {
    return { suggestions: [] };
  }
  return res.json();
}

export async function listSampleDocuments(): Promise<{
  samples: Array<{ id: string; name: string; desc: string }>;
}> {
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/test/sample-documents`);
  if (!res.ok) return { samples: [] };
  return res.json();
}

export async function fetchProactiveElementDiagnosis(
  sessionId: string,
  elementId: string
): Promise<{
  proposal?: {
    element_id: string;
    type: string;
    diagnosis: string;
    original_text: string;
    proposed_text: string;
    action_type: string;
    new_type?: string;
  } | null;
}> {
  const apiKey = useDocStore.getState().apiKey;
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/ai/proactive-diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      element_id: elementId,
      api_key: apiKey || undefined,
      provider_id: proveedorElegido(),
    }),
  });

  if (!res.ok) {
    return { proposal: null };
  }
  return res.json();
}

export function getSampleDocumentUrl(docType: string): string {
  return `${getApiBase()}/test/sample-documents/${docType}`;
}

export async function normalizeHeadings(sessionId: string): Promise<DocumentModel> {
  const apiBase = await getApiBaseAsync();
  const res = await fetchWithTrace(`${apiBase}/normalize-headings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    let msg = 'Error al normalizar jerarquía de títulos';
    try {
      const err = await res.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

