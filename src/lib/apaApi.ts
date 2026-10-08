import { getApiBase } from '../api/http';
import type { ReferenciaModel } from '../types';

export interface ApaFormato {
  formatted_apa: string;
  apa_segments: { text: string; italic: boolean }[];
  tipo: NonNullable<ReferenciaModel['tipo']>;
}

/** Pide al backend la línea APA 7 segmentada. Devuelve null si no hay backend. */
export async function formatearReferencia(
  fields: Partial<Pick<ReferenciaModel, 'authors' | 'year' | 'title' | 'source' | 'doi_or_url' | 'raw_text' | 'tipo'>>,
): Promise<ApaFormato | null> {
  try {
    const res = await fetch(`${getApiBase()}/references/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApaFormato;
  } catch {
    return null;
  }
}
