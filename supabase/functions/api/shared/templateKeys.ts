export function _isConditional(f: unknown): boolean {
  return !!f && typeof f === 'object' && (f as { type?: string }).type === 'conditional';
}

export function _collectSchemaKeys(schema: unknown[]): string[] {
  const out: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const f of arr ?? []) {
      if (!f || typeof f !== 'object') continue;
      const node = f as { key?: string; trueBranch?: unknown[]; falseBranch?: unknown[] };
      if (node.key) out.push(node.key);
      if (_isConditional(node)) {
        walk(node.trueBranch  ?? []);
        walk(node.falseBranch ?? []);
      }
    }
  };
  walk(schema);
  return out;
}

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
    return node;
  });
}

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