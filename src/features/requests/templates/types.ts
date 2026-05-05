// src/features/requests/templates/types.ts
import type { Request } from '../types';

/* ============================================================
   Tipos de campo soportados
   ============================================================ */
export type FieldType = 'text' | 'textarea' | 'select' | 'radio';

export type TemplateExtraField = {
  key:          string;
  label:        string;
  placeholder?: string;
  required:     boolean;
  type:         FieldType;
  options?:     string[];   // select | radio
  collapsible?: boolean;
};

/* ============================================================
   Visual del template
   ============================================================ */
export type TemplateVisual = {
  accentColor: string;
  cardBg?:     string;
  icon:        string;
  badgeLabel:  string;
};

/* ============================================================
   Definición completa — viene de la DB
   ============================================================ */
export type TemplateDefinition = {
  id:          number;
  nombre:      string;
  descripcion: string;
  visual:      TemplateVisual;
  extraFields: TemplateExtraField[];
  teamIds:     number[];
  isActive:    boolean;
};

/* ============================================================
   Props de componentes
   ============================================================ */
export type TemplateCardProps = {
  request:     Request;
  isDragging?: boolean;
};

export type TemplateExtraFieldsProps = {
  values:   Record<string, string>;
  onChange: (key: string, value: string) => void;
};