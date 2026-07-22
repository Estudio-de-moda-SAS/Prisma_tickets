// src/features/requests/templates/types.ts
import type { Request } from '../types';

/* ============================================================
   Tipos de campo soportados
   ============================================================ */
export type FieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'conditional' | 'multiconditional';

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
  enabled?:     boolean;  // default true — si false, no se pide en creación
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
  enabled?:     boolean;         // default true — si false, no se pide en creación
  trueBranch:   TemplateExtraField[];   // campos si true
  falseBranch:  TemplateExtraField[];   // campos si false
};

/* ============================================================
   Unión discriminada — campo del formulario
   ============================================================ */
// DESPUÉS
/* ============================================================
   Campo multi-condicional — disparador con N ramas nombrables.
   El valor guardado en Form_Data es el optionKey (estable), NO el label.
   Los labels son display puro y se pueden renombrar sin tocar tickets.
   ============================================================ */
export type BranchOption = {
  optionKey: string;                  // estable, generado 1 vez, NUNCA se renombra
  label:     string;                  // display editable
  fields:    TemplateExtraField[];    // campos que se muestran si se elige esta rama
};

export type MultiConditionalField = {
  type:         'multiconditional';
  key:          string;               // key del disparador (renameable como cualquier otra)
  label:        string;               // pregunta del disparador
  required:     boolean;
  collapsible?: boolean;
  enabled?:     boolean;              // default true
  showInModal?: boolean;             // default true
  showInCard?:  boolean;             // default false
  options:      BranchOption[];
};

export type TemplateExtraField = SimpleField | ConditionalField | MultiConditionalField;
/* ============================================================
   Helpers de tipo
   ============================================================ */
export function isConditionalField(f: TemplateExtraField): f is ConditionalField {
  return f.type === 'conditional';
}

export function isMultiConditionalField(f: TemplateExtraField): f is MultiConditionalField {
  return f.type === 'multiconditional';
}

export function isSimpleField(f: TemplateExtraField): f is SimpleField {
  return f.type !== 'conditional' && f.type !== 'multiconditional';
}

/** Profundidad máxima de anidamiento para campos condicionales */
export const MAX_CONDITIONAL_DEPTH = 5;

/** Calcula la profundidad máxima de condicionales en un campo */
export function getConditionalDepth(field: TemplateExtraField): number {
  const branchDepth = (branch: TemplateExtraField[]) =>
    branch.reduce((max, f) => Math.max(max, getConditionalDepth(f)), 0);
  if (isConditionalField(field)) {
    return 1 + Math.max(branchDepth(field.trueBranch), branchDepth(field.falseBranch));
  }
  if (isMultiConditionalField(field)) {
    return 1 + field.options.reduce((max, o) => Math.max(max, branchDepth(o.fields)), 0);
  }
  return 0;
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
    enabled:      true,
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
    enabled:     true,
    trueBranch:  [makeEmptySimpleField(0)],
    falseBranch: [makeEmptySimpleField(1)],
  };
}

/** Genera un optionKey estable y único para una rama de multiconditional */
export function makeOptionKey(index: number): string {
  return `opt_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Crea un campo multi-condicional vacío — arranca con 2 ramas */
export function makeEmptyMultiConditionalField(index: number): MultiConditionalField {
  return {
    type:        'multiconditional',
    key:         `multicond_${index}_${Date.now()}`,
    label:       '',
    required:    false,
    collapsible: false,
    enabled:     true,
    showInModal: true,
    showInCard:  false,
    options: [
      { optionKey: makeOptionKey(0), label: '', fields: [makeEmptySimpleField(0)] },
      { optionKey: makeOptionKey(1), label: '', fields: [makeEmptySimpleField(1)] },
    ],
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
