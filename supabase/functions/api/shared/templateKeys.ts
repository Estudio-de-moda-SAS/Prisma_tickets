/**
 * Utilidades para recorrer y reescribir claves en esquemas de plantilla y en `Form_Data`.
 *
 * Los esquemas de plantilla pueden anidar campos dentro de ramas condicionales
 * (`conditional`: `trueBranch`/`falseBranch`) y multicondicionales
 * (`multiconditional`: `options[].fields`). Este módulo recorre esa estructura de
 * forma recursiva para recolectar claves ({@link _collectSchemaKeys}) o
 * renombrarlas ({@link _renameKeysInSchema}), y aplica los mismos renombres al
 * `Form_Data` de los requests ({@link _renameKeysInFormData}).
 *
 * @module templateKeys
 */

/**
 * Indica si un nodo de schema es un campo condicional.
 *
 * @param f - Nodo del schema.
 * @returns `true` si es un objeto con `type === 'conditional'`.
 */
export function _isConditional(f: unknown): boolean {
  return !!f && typeof f === 'object' && (f as { type?: string }).type === 'conditional';
}

/**
 * Indica si un nodo de schema es un campo multicondicional.
 *
 * @param f - Nodo del schema.
 * @returns `true` si es un objeto con `type === 'multiconditional'`.
 */
export function _isMultiConditional(f: unknown): boolean {
  return !!f && typeof f === 'object' && (f as { type?: string }).type === 'multiconditional';
}

/**
 * Recolecta todas las claves (`key`) de un schema, incluidas las anidadas.
 *
 * @remarks
 * Recorre en profundidad: por cada nodo con `key` la agrega, y desciende por las
 * ramas de los condicionales (`trueBranch`/`falseBranch`) y por los campos de
 * cada opción de los multicondicionales (`options[].fields`).
 *
 * @param schema - Arreglo de nodos del schema.
 * @returns Lista de claves encontradas (en orden de recorrido; puede incluir duplicados).
 */
export function _collectSchemaKeys(schema: unknown[]): string[] {
  const out: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const f of arr ?? []) {
      if (!f || typeof f !== 'object') continue;
      const node = f as { key?: string; trueBranch?: unknown[]; falseBranch?: unknown[]; options?: { fields?: unknown[] }[] };
      if (node.key) out.push(node.key);
      if (_isConditional(node)) {
        walk(node.trueBranch  ?? []);
        walk(node.falseBranch ?? []);
      }
      if (_isMultiConditional(node)) {
        for (const o of node.options ?? []) walk(o?.fields ?? []);
      }
    }
  };;
  walk(schema);
  return out;
}

/**
 * Reescribe las claves de un schema según un mapa de renombres, respetando el anidamiento.
 *
 * @remarks
 * Devuelve una copia nueva (no muta la entrada). Renombra el `key` de cada nodo
 * si está en `renames` y desciende recursivamente por ramas condicionales y por
 * los `fields` de cada opción multicondicional.
 *
 * @param schema - Arreglo de nodos del schema original.
 * @param renames - Mapa `claveVieja → claveNueva`.
 * @returns Un nuevo schema con las claves renombradas.
 */
export function _renameKeysInSchema(schema: unknown[], renames: Record<string, string>): unknown[] {
  return (schema ?? []).map((f) => {
    if (!f || typeof f !== 'object') return f;
    const node: Record<string, unknown> = { ...(f as Record<string, unknown>) };
    if (typeof node['key'] === 'string' && renames[node['key'] as string]) {
      node['key'] = renames[node['key'] as string];
    }
    if (_isConditional(node)) {
      node['trueBranch']  = _renameKeysInSchema((node['trueBranch']  as unknown[]) ?? [], renames);
      node['falseBranch'] = _renameKeysInSchema((node['falseBranch'] as unknown[]) ?? [], renames);
    }
    if (_isMultiConditional(node)) {
      const opts = (node['options'] as Array<Record<string, unknown>>) ?? [];
      node['options'] = opts.map((o) => ({
        ...o,
        fields: _renameKeysInSchema((o['fields'] as unknown[]) ?? [], renames),
      }));
    }
    return node;
  });
}

/**
 * Reescribe las claves de un objeto `Form_Data` según un mapa de renombres.
 *
 * @remarks
 * Copia el objeto renombrando cada clave presente en `renames` (las demás se
 * mantienen). La clave especial `__labels` recibe trato aparte: sus claves
 * internas también se renombran, preservando el formato original (string JSON u
 * objeto); si su parseo falla, se deja el valor tal cual. Los valores que no son
 * objetos planos (null, arreglos, primitivos) se devuelven sin cambios.
 *
 * @param formData - `Form_Data` a transformar.
 * @param renames - Mapa `claveVieja → claveNueva`.
 * @returns El `Form_Data` con las claves renombradas, o el valor original si no
 *   es un objeto plano.
 */
export function _renameKeysInFormData(formData: unknown, renames: Record<string, string>): unknown {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return formData;
  const src = formData as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === '__labels') {
      try {
        const wasString = typeof v === 'string';
        const labels = wasString ? JSON.parse(v as string) : (v as Record<string, unknown>);
        const renamed: Record<string, unknown> = {};
        for (const [lk, lv] of Object.entries(labels ?? {})) {
          renamed[renames[lk] ?? lk] = lv;
        }
        out[k] = wasString ? JSON.stringify(renamed) : renamed;
      } catch {
        out[k] = v;
      }
      continue;
    }
    out[renames[k] ?? k] = v;
  }
  return out;
}