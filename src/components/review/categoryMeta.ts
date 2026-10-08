/* WordAPA7 — Etiquetas de motor de la revisión interna del H1.
   Única fuente de verdad de `CATEGORY_META`; la consumen la puerta (ReviewGate)
   y el modo lectura. Citas queda fuera del módulo: es dueña de la fase 4. */
import React from 'react';
import { Bot, PenTool, SpellCheck, Layout } from 'lucide-react';
import type { ToolWindowId } from '../../lib/auditItems';

export interface CategoryMeta {
  id: ToolWindowId;
  label: string;
  Icon: React.ElementType;
}

export const CATEGORY_META: CategoryMeta[] = [
  { id: 'ai', label: 'Voz sintética', Icon: Bot },
  { id: 'style', label: 'Redacción y estilo', Icon: PenTool },
  { id: 'spelling', label: 'Ortografía y formato', Icon: SpellCheck },
  { id: 'structure', label: 'Estructura', Icon: Layout },
];
