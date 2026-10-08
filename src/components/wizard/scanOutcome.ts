/* WordAPA7 — Paso 5: agregación de resultados del escaneo integral.
   Función pura: recibe un resultado por motor (IA, Ortografía, Citas) y
   decide el toast de cierre del "Escanear" global:
   - Todos OK  -> éxito.
   - Algunos KO -> aviso que NOMBRA los motores fallidos (los OK sí cuentan).
   - Todos KO  -> error, sin mensaje de éxito.
   Copy sobria en español, sin emojis, mensajes <= 120 caracteres. */

export type ScanEngineId = 'ai' | 'proofread' | 'citations';

export interface EngineScanOutcome {
  id: ScanEngineId;
  /** Nombre corto del motor, igual al chip de la UI ("IA", "Ortografía", "Citas") */
  label: string;
  ok: boolean;
  /** Razón breve del fallo; se recorta antes de llegar al toast */
  reason?: string;
}

export interface ScanToast {
  type: 'success' | 'warning' | 'error';
  message: string;
}

export const MAX_TOAST_LENGTH = 120;
const MAX_REASON_LENGTH = 40;

/** "IA" / "IA y Citas" / "IA, Ortografía y Citas" */
function listLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

/** Normaliza una razón de fallo: espacios simples y longitud acotada. */
function trimReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  const clean = reason.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > MAX_REASON_LENGTH ? `${clean.slice(0, MAX_REASON_LENGTH - 1)}…` : clean;
}

/** Extrae una razón legible de un motivo de rechazo arbitrario. */
export function toReason(reason: unknown): string | undefined {
  if (reason instanceof Error) return reason.message || undefined;
  if (typeof reason === 'string' && reason.trim()) return reason;
  return undefined;
}

export function summarizeScanOutcomes(outcomes: EngineScanOutcome[]): ScanToast {
  if (outcomes.length === 0) {
    return { type: 'error', message: 'No se ejecutó ningún motor. Sin resultados.' };
  }

  const failed = outcomes.filter((o) => !o.ok);
  const done = outcomes.filter((o) => o.ok);

  let toast: ScanToast;
  if (failed.length === 0) {
    toast = { type: 'success', message: 'Auditoría integral completada' };
  } else if (done.length === 0) {
    toast = {
      type: 'error',
      message: `Fallaron los motores ${listLabels(failed.map((o) => o.label))}. Sin resultados nuevos.`,
    };
  } else {
    const doneList = listLabels(done.map((o) => o.label));
    const doneVerb = done.length > 1 ? 'completados' : 'completado';
    if (failed.length === 1) {
      const reason = trimReason(failed[0].reason);
      const head = reason
        ? `Fallo el motor de ${failed[0].label}: ${reason}`
        : `Fallo el motor de ${failed[0].label}`;
      toast = { type: 'warning', message: `${head}. ${doneList} ${doneVerb}.` };
    } else {
      toast = {
        type: 'warning',
        message: `Fallaron los motores ${listLabels(failed.map((o) => o.label))}. ${doneList} ${doneVerb}.`,
      };
    }
  }

  if (toast.message.length > MAX_TOAST_LENGTH) {
    toast = { ...toast, message: `${toast.message.slice(0, MAX_TOAST_LENGTH - 1)}…` };
  }
  return toast;
}
