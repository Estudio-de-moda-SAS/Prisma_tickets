import type { TemplateExtraField, ConditionalField } from '@/features/requests/templates/types';

export type AnnotatedField  = TemplateExtraField & { __editId: string };
export type AnnotatedSchema = AnnotatedField[];
export type Rename          = { oldKey: string; newKey: string };

let _counter = 0;
function genEditId(): string {
  _counter += 1;
  return `__eid_${Date.now()}_${_counter}`;
}

/** Recorre el schema y añade un __editId efímero a cada nodo (no se persiste). */
export function annotateWithEditIds(schema: TemplateExtraField[]): AnnotatedSchema {
  return (schema ?? []).map((f) => annotateField(f));
}

function annotateField(f: TemplateExtraField): AnnotatedField {
  if (f.type === 'conditional') {
    const cf = f as ConditionalField;
    return {
      ...cf,
      __editId:    genEditId(),
      trueBranch:  cf.trueBranch.map(annotateField),
      falseBranch: cf.falseBranch.map(annotateField),
    } as AnnotatedField;
  }
  return { ...f, __editId: genEditId() } as AnnotatedField;
}

/** Elimina __editId del schema antes de enviar al backend. */
export function stripEditIds(schema: AnnotatedSchema | TemplateExtraField[]): TemplateExtraField[] {
  return (schema ?? []).map(stripField);
}

function stripField(f: TemplateExtraField | AnnotatedField): TemplateExtraField {
  const { __editId: _omit, ...rest } = f as AnnotatedField;
  void _omit;
  if (rest.type === 'conditional') {
    const cf = rest as ConditionalField;
    return {
      ...cf,
      trueBranch:  stripEditIds(cf.trueBranch),
      falseBranch: stripEditIds(cf.falseBranch),
    };
  }
  return rest as TemplateExtraField;
}

function flattenWithEditIds(schema: AnnotatedSchema): { __editId: string; key: string }[] {
  const out: { __editId: string; key: string }[] = [];
  const walk = (arr: AnnotatedSchema) => {
    for (const f of arr ?? []) {
      if (f.__editId && f.key) out.push({ __editId: f.__editId, key: f.key });
      if (f.type === 'conditional') {
        const cf = f as AnnotatedField & ConditionalField;
        walk((cf.trueBranch  ?? []) as AnnotatedSchema);
        walk((cf.falseBranch ?? []) as AnnotatedSchema);
      }
    }
  };
  walk(schema);
  return out;
}

/** Compara initial vs current emparejando por __editId. Devuelve los renames detectados. */
export function diffRenames(initial: AnnotatedSchema, current: AnnotatedSchema): Rename[] {
  const initMap: Record<string, string> = {};
  for (const { __editId, key } of flattenWithEditIds(initial)) initMap[__editId] = key;

  const renames: Rename[] = [];
  for (const { __editId, key } of flattenWithEditIds(current)) {
    const oldKey = initMap[__editId];
    if (oldKey && oldKey !== key) renames.push({ oldKey, newKey: key });
  }
  return renames;
}