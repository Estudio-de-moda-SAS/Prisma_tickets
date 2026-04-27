// src/features/requests/templates/registry.ts
// Registro central de templates.
// Cada entrada define la visual y los campos extra de ese tipo de solicitud.
// El ID debe coincidir con Request_Template_ID en TBL_Requests_Templates.

import type { TemplateDefinition } from './types';

/* ============================================================
   Definiciones
   ============================================================ */
export const TEMPLATE_REGISTRY: Record<number, TemplateDefinition> = {

  // ── Template 1: Default ────────────────────────────────────
  1: {
    id:          1,
    nombre:      'General',
    descripcion: 'Solicitud general para cualquier tipo de requerimiento.',
    visual: {
      accentColor: '#00c8ff',
      icon:        '📋',
      badgeLabel:  'General',
    },
    extraFields: [], // sin campos extra
  },

  // ── Template 2: CRM ────────────────────────────────────────
  2: {
    id:          2,
    nombre:      'CRM',
    descripcion: 'Solicitud relacionada con operaciones de tienda en el CRM.',
    visual: {
      accentColor: '#a78bfa',
      cardBg:      '#1a1535',
      icon:        '🏪',
      badgeLabel:  'CRM',
    },
    extraFields: [
      {
        key:         'storeName',
        label:       'Nombre de tienda',
        placeholder: 'Ej: Tienda Centro Medellín...',
        required:    true,
        type:        'text',
      },
    ],
  },
};

/* ============================================================
   Helpers
   ============================================================ */

/** Devuelve la definición de un template, con fallback al Default */
export function getTemplateDefinition(templateId: number): TemplateDefinition {
  return TEMPLATE_REGISTRY[templateId] ?? TEMPLATE_REGISTRY[1]!;
}

/** Color de acento de un template */
export function getTemplateAccent(templateId: number): string {
  return getTemplateDefinition(templateId).visual.accentColor;
}

/** Badge label de un template */
export function getTemplateBadge(templateId: number): string {
  return getTemplateDefinition(templateId).visual.badgeLabel;
}