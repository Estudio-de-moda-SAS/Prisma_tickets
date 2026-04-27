// src/features/requests/templates/types.ts
// Tipos compartidos del sistema de templates de solicitudes.

import type { Request, Prioridad } from '../types';

/* ============================================================
   Configuración visual de un template
   ============================================================ */
export type TemplateVisual = {
  /** Color dominante del template — usado en bordes, badges, accents */
  accentColor:   string;
  /** Color de fondo de la card */
  cardBg?:       string;
  /** Emoji o icono representativo */
  icon:          string;
  /** Etiqueta corta que aparece en la card */
  badgeLabel:    string;
};

/* ============================================================
   Campos extra por template
   Define qué campos adicionales renderiza el formulario
   y el modal para este template.
   ============================================================ */
export type TemplateExtraField = {
  key:         string;
  label:       string;
  placeholder: string;
  required:    boolean;
  type:        'text' | 'textarea' | 'select';
  options?:    string[]; // solo para type === 'select'
};

/* ============================================================
   Definición completa de un template
   ============================================================ */
export type TemplateDefinition = {
  id:          number;
  nombre:      string;
  descripcion: string;
  visual:      TemplateVisual;
  extraFields: TemplateExtraField[];
};

/* ============================================================
   Props del componente de card por template
   ============================================================ */
export type TemplateCardProps = {
  request:    Request;
  isDragging?: boolean;
};

/* ============================================================
   Props del bloque de campos extra en formularios
   ============================================================ */
export type TemplateExtraFieldsProps = {
  values:   Record<string, string>;
  onChange: (key: string, value: string) => void;
};