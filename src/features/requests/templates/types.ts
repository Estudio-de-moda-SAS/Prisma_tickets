// src/features/requests/templates/types.ts
import type { Request } from '../types';

/* ============================================================
   Tipos de campo soportados
   ============================================================ */
export type FieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'conditional';

/* ============================================================
   Campos simples (no condicional)
   ============================================================ */
export type SimpleField = {
  key:          string;
  label:        string;
  placeholder?: string;
  required:     boolean;
  collapsible?: boolean;
  options?:     string[]; // select | radio
  showInModal?: boolean;  // default true (retrocompatible)
  showInCard?:  boolean;  // default false
} & (
  | { type: 'text'     }
  | { type: 'textarea' }
  | { type: 'select'   }
  | { type: 'radio'    }
  | { type: 'checkbox' }
);

/* ============================================================
   Campo condicional — ramas como arrays para soportar
   múltiples campos por rama (máx. 5 niveles de profundidad)
   ============================================================ */
export type ConditionalField = {
  type:         'conditional';
  key:          string;
  label:        string;          // label del checkbox disparador
  required:     boolean;
  collapsible?: boolean;
  showInModal?: boolean;         // default true
  showInCard?:  boolean;         // default false
  trueBranch:   TemplateExtraField[];   // campos si true
  falseBranch:  TemplateExtraField[];   // campos si false
};

/* ============================================================
   Unión discriminada — campo del formulario
   ============================================================ */
export type TemplateExtraField = SimpleField | ConditionalField;

/* ============================================================
   Helpers de tipo
   ============================================================ */
export function isConditionalField(f: TemplateExtraField): f is ConditionalField {
  return f.type === 'conditional';
}

export function isSimpleField(f: TemplateExtraField): f is SimpleField {
  return f.type !== 'conditional';
}

/** Profundidad máxima de anidamiento para campos condicionales */
export const MAX_CONDITIONAL_DEPTH = 5;

/** Calcula la profundidad máxima de condicionales en un campo */
export function getConditionalDepth(field: TemplateExtraField): number {
  if (!isConditionalField(field)) return 0;
  const branchDepth = (branch: TemplateExtraField[]) =>
    branch.reduce((max, f) => Math.max(max, getConditionalDepth(f)), 0);
  return 1 + Math.max(
    branchDepth(field.trueBranch),
    branchDepth(field.falseBranch),
  );
}

/** Crea un campo simple vacío con valores por defecto */
export function makeEmptySimpleField(index: number): SimpleField {
  return {
    key:          `campo_${index}_${Date.now()}`,
    label:        '',
    placeholder:  '',
    required:     false,
    collapsible:  false,
    showInModal:  true,
    showInCard:   false,
    type:         'text',
  };
}

/** Crea un campo condicional vacío — ramas con un campo simple cada una */
export function makeEmptyConditionalField(index: number): ConditionalField {
  return {
    type:        'conditional',
    key:         `condicional_${index}_${Date.now()}`,
    label:       '',
    required:    false,
    collapsible: false,
    showInModal: true,
    showInCard:  false,
    trueBranch:  [makeEmptySimpleField(0)],
    falseBranch: [makeEmptySimpleField(1)],
  };
}

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
