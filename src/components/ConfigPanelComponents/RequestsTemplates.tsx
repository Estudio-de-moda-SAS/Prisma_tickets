import { useState, useEffect } from 'react';
import type { TemplateExtraField, FieldType, SimpleField, ConditionalField } from '@/features/requests/templates/types';
import {
  makeEmptySimpleField,
  makeEmptyConditionalField,
  MAX_CONDITIONAL_DEPTH,
} from '@/features/requests/templates/types';
import type { BoardTemplate } from '@/features/requests/hooks/useBoardMetadata';
import { AddBtn, SmBtn, FieldLabel, ColorPicker, EMOJIS } from '../ConfigPanel';
import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import {
  annotateWithEditIds,
  stripEditIds,
  diffRenames,
  type AnnotatedSchema,
  type Rename,
} from '@/features/requests/templates/renameUtils';
import { TemplateRenameModal } from '@/features/requests/templates/TemplateRenameModal';

/** Tipos disponibles para un campo raíz (incluye condicional) */
const FIELD_TYPES_FULL: { value: FieldType; label: string; icon: string }[] = [
  { value: 'text',        label: 'Texto corto',  icon: '✏️' },
  { value: 'textarea',    label: 'Texto largo',   icon: '📝' },
  { value: 'select',      label: 'Desplegable',   icon: '▾'  },
  { value: 'radio',       label: 'Selección',     icon: '◉'  },
  { value: 'checkbox',    label: 'Casilla',       icon: '☑️' },
  { value: 'conditional', label: 'Condicional',   icon: '⑂'  },
];

/** Tipos disponibles para ramas de un campo condicional (sin condicional si ya se llegó al límite) */
function getBranchFieldTypes(currentDepth: number): { value: FieldType; label: string; icon: string }[] {
  if (currentDepth >= MAX_CONDITIONAL_DEPTH) {
    return FIELD_TYPES_FULL.filter((f) => f.value !== 'conditional');
  }
  return FIELD_TYPES_FULL;
}

type TemplateMutationPayload = {
  name: string; description: string; icon: string; color: string;
  badge: string; formSchema: TemplateExtraField[]; teamIds: number[]; isActive: boolean;
};

export function TemplateList({ templates, teams, onAdd, onUpdate, onDelete }: {
  templates: BoardTemplate[];
  teams: { Board_Team_ID: number; Board_Team_Name: string }[];
  onAdd: (d: TemplateMutationPayload) => void;
  onUpdate: (id: number, d: TemplateMutationPayload) => void;
  onDelete: (id: number) => void;
}) {
  const [editKey, setEditKey] = useState<number | null>(null);
  if (editKey === -1) return <TemplateForm key="form-new" teams={teams} onSave={(d) => { onAdd(d); setEditKey(null); }} onCancel={() => setEditKey(null)} />;
  if (editKey !== null) {
    const t = templates.find((t) => t.Request_Template_ID === editKey);
if (t) return <TemplateForm key={`form-edit-${editKey}`} teams={teams} initialTemplateId={editKey} initial={{ name: t.Request_Template_Name, description: t.Request_Template_Description, icon: t.Request_Template_Icon ?? '📋', color: t.Request_Template_Color ?? '#00c8ff', badge: t.Request_Template_Badge ?? t.Request_Template_Name, formSchema: t.Request_Template_Form_Schema ?? [], teamIds: t.Request_Template_Teams ?? [], isActive: t.Request_Template_Is_Active ?? true }} onSave={(d) => { onUpdate(editKey, d); setEditKey(null); }} onCancel={() => setEditKey(null)} />;  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {templates.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>📋</span><p>No hay templates definidos.</p></div>}
      {templates.map((t) => <TemplateRow key={t.Request_Template_ID} template={t} onEdit={() => setEditKey(t.Request_Template_ID)} onDelete={() => onDelete(t.Request_Template_ID)} />)}
      <AddBtn label="Nuevo template" onClick={() => setEditKey(-1)} />
    </div>
  );
}

function TemplateRow({ template, onEdit, onDelete }: { template: BoardTemplate; onEdit: () => void; onDelete: () => void }) {
  const [hov, setHov] = useState(false);
  const color = template.Request_Template_Color ?? '#00c8ff';
  const icon  = template.Request_Template_Icon  ?? '📋';
  const fieldCount = template.Request_Template_Form_Schema?.length ?? 0;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${hov ? color + '40' : 'var(--border-subtle)'}`, background: hov ? `${color}06` : 'var(--bg-surface)', transition: 'all 0.15s' }}>
      <div style={{ width: 32, height: 32, borderRadius: 7, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.Request_Template_Name}</span>
          {!template.Request_Template_Is_Active && <span style={{ fontSize: 9, color: 'var(--txt-muted)', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>inactivo</span>}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {fieldCount > 0 && <span style={{ fontSize: 10, color, background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 3, padding: '1px 6px' }}>{fieldCount} campo{fieldCount !== 1 ? 's' : ''}</span>}
          {(template.Request_Template_Teams?.length ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--txt-muted)', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px' }}>{template.Request_Template_Teams.length} equipo{template.Request_Template_Teams.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, opacity: hov ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
        <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
      </div>
    </div>
  );
}

/* ============================================================
   TemplateForm
   ============================================================ */
function normalizeBranches(field: TemplateExtraField): TemplateExtraField {
  if (field.type !== 'conditional') return field;
  const cf = field as ConditionalField;
  const toArray = (v: unknown): TemplateExtraField[] => {
    if (Array.isArray(v)) return (v as TemplateExtraField[]).map(normalizeBranches);
    if (v && typeof v === 'object') return [normalizeBranches(v as TemplateExtraField)];
    return [makeEmptySimpleField(0)];
  };
  return { ...cf, trueBranch: toArray(cf.trueBranch), falseBranch: toArray(cf.falseBranch) };
}

function normalizeSchema(schema: TemplateExtraField[]): TemplateExtraField[] {
  return (schema ?? []).map(normalizeBranches);
}

function TemplateForm({ initial, initialTemplateId, teams, onSave, onCancel }: {
  initial?: TemplateMutationPayload;
  initialTemplateId?: number;
  teams: { Board_Team_ID: number; Board_Team_Name: string }[];
  onSave: (d: TemplateMutationPayload) => void; onCancel: () => void;
}) {
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon,        setIcon]        = useState(initial?.icon        ?? '📋');
  const [color,       setColor]       = useState(initial?.color       ?? '#00c8ff');
  const [badge,       setBadge]       = useState(initial?.badge       ?? '');
  const [teamIds,     setTeamIds]     = useState<number[]>(initial?.teamIds ?? []);
  const [isActive,    setIsActive]    = useState(initial?.isActive    ?? true);

  // Anotamos con __editId al cargar (solo memoria)
  const [fields, setFields] = useState<AnnotatedSchema>(
    () => annotateWithEditIds(normalizeSchema(initial?.formSchema ?? [])) as AnnotatedSchema,
  );
  // Snapshot del schema inicial anotado, para diffear renames
  const initialAnnotatedRef = useRef<AnnotatedSchema>(fields);

  const [tab, setTab] = useState<'info' | 'fields'>('info');
  const canSave = name.trim().length > 0;

  // ── Rename flow state ────────────────────────────────
const [pendingRenames,    setPendingRenames]    = useState<Rename[]>([]);
  const [pendingPayload,    setPendingPayload]    = useState<TemplateMutationPayload | null>(null);
  const [renameModalPhase,  setRenameModalPhase]  = useState<'confirm' | 'processing' | 'done' | 'error'>('confirm');
  const [renameModalOpen,   setRenameModalOpen]   = useState(false);
  const [requestsCount,     setRequestsCount]     = useState(0);
  const [progressCurrent,   setProgressCurrent]   = useState(0);
  const [progressTotal,     setProgressTotal]     = useState(0);
  const [resultCount,       setResultCount]       = useState(0);
  const [renameError,       setRenameError]       = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc          = useQueryClient();
  const currentUser = useCurrentUser();

  async function handleSave() {
    if (!canSave) return;

    const strippedSchema = stripEditIds(fields);
    const payload: TemplateMutationPayload = {
      name:        name.trim(),
      description: description.trim(),
      icon,
      color,
      badge:       badge.trim() || name.trim(),
      formSchema:  strippedSchema,
      teamIds,
      isActive,
    };

    // Si es nuevo template o no hay ID conocido → flujo normal (sin renames posibles)
    if (!initialTemplateId) {
      onSave(payload);
      return;
    }

    // Detectar renames
    const renames = diffRenames(initialAnnotatedRef.current, fields);

    if (renames.length === 0) {
      onSave(payload);
      return;
    }

    // Hay renames → traer impacto y abrir modal de confirmación
    try {
      const impact = await apiClient.call<{ requestsCount: number }>(
        'getTemplateRenameImpact',
        { templateId: initialTemplateId },
      );
      setRequestsCount(impact.requestsCount);
    } catch {
      setRequestsCount(0);
    }

    setPendingRenames(renames);
    setPendingPayload(payload);
    setRenameModalPhase('confirm');
    setRenameModalOpen(true);
  }

async function handleConfirmRename() {
    if (!pendingPayload || !initialTemplateId) return;
    setRenameModalPhase('processing');
    setRenameError(null);
    setProgressCurrent(0);
    setProgressTotal(requestsCount);

    try {
      const created = await apiClient.call<{ jobId: string | null; requestsTotal: number; ok: true }>(
        'createTemplateRenameJob',
        {
          id:          initialTemplateId,
          name:        pendingPayload.name,
          description: pendingPayload.description,
          icon:        pendingPayload.icon,
          color:       pendingPayload.color,
          badge:       pendingPayload.badge,
          formSchema:  pendingPayload.formSchema,
          teamIds:     pendingPayload.teamIds,
          isActive:    pendingPayload.isActive,
          renames:     pendingRenames,
          renamedBy:   currentUser?.data?.User_ID ?? null,
        },
      );

      setProgressTotal(created.requestsTotal);

      // Si no hay job (no había solicitudes) → done directo
      if (!created.jobId) {
        setResultCount(0);
        setRenameModalPhase('done');
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['boardMetadata'] }),
          qc.invalidateQueries({ queryKey: ['templates'] }),
          qc.invalidateQueries({ queryKey: ['requests'] }),
        ]);
        return;
      }

      // Polling
      const jobId = created.jobId;
      const poll = async () => {
        try {
          const job = await apiClient.call<{
            Job_ID: string;
            Job_Status: 'pending' | 'running' | 'done' | 'failed';
            Job_Progress_Current: number;
            Job_Progress_Total:   number;
            Job_Result: { requestsUpdated: number; renames: Rename[] } | null;
            Job_Error:  string | null;
            Job_Updated_At: string;
          }>('getBackgroundJob', { jobId });

          setProgressCurrent(job.Job_Progress_Current);
          if (job.Job_Progress_Total > 0) setProgressTotal(job.Job_Progress_Total);

          if (job.Job_Status === 'done') {
            setResultCount(job.Job_Result?.requestsUpdated ?? job.Job_Progress_Current);
            setRenameModalPhase('done');
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['boardMetadata'] }),
              qc.invalidateQueries({ queryKey: ['templates'] }),
              qc.invalidateQueries({ queryKey: ['requests'] }),
            ]);
            return;
          }

          if (job.Job_Status === 'failed') {
            setRenameError(job.Job_Error ?? 'Error desconocido durante el procesamiento.');
            setRenameModalPhase('error');
            return;
          }

          // Watchdog: si lleva >60s sin update, pedir relanzamiento
          const stale = Date.now() - new Date(job.Job_Updated_At).getTime() > 60_000;
          if (stale) {
            await apiClient.call('resumeStalledJob', { jobId }).catch(() => {});
          }

          pollRef.current = setTimeout(poll, 1500);
        } catch (err) {
          setRenameError((err as Error).message);
          setRenameModalPhase('error');
        }
      };

      pollRef.current = setTimeout(poll, 800);
    } catch (err) {
      setRenameError((err as Error).message);
      setRenameModalPhase('error');
    }
  }
  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);
  
  function handleCloseRenameModal() {
    setRenameModalOpen(false);
    if (renameModalPhase === 'done') {
      onCancel(); // Cierra el editor del template
    }
  }

  function addField() {
    setFields((p) => [...p, { ...annotateWithEditIds([makeEmptySimpleField(p.length + 1)])[0] }]);
  }
  function updateField(idx: number, patch: Partial<TemplateExtraField>) {
    setFields((p) => p.map((f, i) => i === idx ? ({ ...f, ...patch } as AnnotatedSchema[number]) : f));
  }
  function removeField(idx: number) { setFields((p) => p.filter((_, i) => i !== idx)); }
  function moveField(idx: number, dir: -1 | 1) {
    setFields((p) => { const n = [...p]; const s = idx + dir; if (s < 0 || s >= n.length) return p; [n[idx], n[s]] = [n[s], n[idx]]; return n; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>{initial ? `Editar: ${initial.name}` : 'Nuevo template'}</span>
        <button onClick={handleSave} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? `linear-gradient(135deg, var(--accent-2), ${color})` : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 4, marginBottom: 12, padding: '4px', background: 'var(--bg-surface)', borderRadius: 8 }}>
        {(['info', 'fields'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', background: tab === t ? color : 'transparent', color: tab === t ? 'white' : 'var(--txt-muted)', transition: 'all 0.15s' }}>
            {t === 'info' ? '⚙️ Info' : `🔧 Campos (${fields.length})`}
          </button>
        ))}
      </div>
      {tab === 'info' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 2 }}>
          <FormSection title="Identidad">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><FieldLabel>Nombre *</FieldLabel><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Soporte Dev" className="cpop-input" /></div>
              <div><FieldLabel>Badge corto</FieldLabel><input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="Ej: Dev" className="cpop-input" /></div>
            </div>
            <div><FieldLabel>Descripción</FieldLabel><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Para qué sirve este template?" rows={2} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 9px', fontSize: 12, color: 'var(--txt)', resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} /></div>
          </FormSection>
          <FormSection title="Visual">
            <div><FieldLabel>Icono</FieldLabel><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 32px)', gap: 4 }}>{EMOJIS.map((e) => <button key={e} type="button" onClick={() => setIcon(icon === e ? '📋' : e)} className={`cpop-emoji${icon === e ? ' cpop-emoji--active' : ''}`}>{e}</button>)}</div></div>
            <div><FieldLabel>Color de acento</FieldLabel><ColorPicker color={color} onChange={setColor} /></div>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div><div style={{ fontSize: 12, fontWeight: 700, color }}>{name || 'Nombre del template'}</div><div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{description || 'Descripción del template'}</div></div>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${color}18`, border: `1px solid ${color}35`, color, flexShrink: 0 }}>{badge || name || 'Badge'}</span>
            </div>
          </FormSection>
          <FormSection title="Equipos que lo usan">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {teams.map((t) => { const sel = teamIds.includes(t.Board_Team_ID); return (
                <button key={t.Board_Team_ID} onClick={() => setTeamIds((p) => p.includes(t.Board_Team_ID) ? p.filter((x) => x !== t.Board_Team_ID) : [...p, t.Board_Team_ID])}
                  style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${sel ? color + '60' : 'var(--border-subtle)'}`, background: sel ? `${color}15` : 'transparent', color: sel ? color : 'var(--txt-muted)', fontSize: 11, fontWeight: sel ? 700 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                  {sel ? '✓ ' : ''}{t.Board_Team_Name}
                </button>
              ); })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0 }}>Sin selección = disponible para todos los equipos.</p>
          </FormSection>
          <FormSection title="Estado">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', borderRadius: 7, border: `1px solid ${isActive ? color + '40' : 'var(--border-subtle)'}`, background: isActive ? `${color}08` : 'transparent', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ accentColor: color, width: 14, height: 14 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? color : 'var(--txt-muted)' }}>{isActive ? 'Activo' : 'Inactivo'}</div>
                <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{isActive ? 'Visible en el modal de nueva solicitud' : 'Oculto en el modal de nueva solicitud'}</div>
              </div>
            </label>
          </FormSection>
        </div>
      )}
      {tab === 'fields' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2, paddingBottom: 8 }}>
            {fields.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 32, opacity: 0.3 }}>🔧</span><p>Sin campos adicionales.</p><p style={{ fontSize: 11 }}>El formulario solo tendrá título y descripción.</p></div>}
            {fields.map((field, idx) => (
              <FieldEditor key={field.__editId ?? idx} field={field} index={idx} total={fields.length} accentColor={color} depth={0}
                onChange={(patch) => updateField(idx, patch)} onRemove={() => removeField(idx)} onMove={(dir) => moveField(idx, dir)} />
            ))}
          </div>
          <div style={{ flexShrink: 0, paddingTop: 8, borderTop: `1px solid var(--border-subtle)` }}>
            <button onClick={addField} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', width: '100%', borderRadius: 8, border: `2px dashed ${color}40`, background: `${color}05`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${color}10`; e.currentTarget.style.borderColor = `${color}70`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `${color}05`; e.currentTarget.style.borderColor = `${color}40`; }}>
              + Agregar campo
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmación + overlay de procesamiento */}
      <TemplateRenameModal
        isOpen={renameModalOpen}
        renames={pendingRenames}
        requestsCount={requestsCount}
        accentColor={color}
        phase={renameModalPhase}
        progressCurrent={progressCurrent}
        progressTotal={progressTotal}
        resultCount={resultCount}
        errorMessage={renameError}
        onConfirm={handleConfirmRename}
        onCancel={() => setRenameModalOpen(false)}
        onClose={handleCloseRenameModal}
      />
          </div>
  );
}
/* ============================================================
   FieldEditor — con showInModal y showInCard
   ============================================================ */
function FieldEditor({ field, index, total, accentColor, depth, onChange, onRemove, onMove }: {
  field: TemplateExtraField; index: number; total: number; accentColor: string; depth: number;
  onChange: (patch: Partial<TemplateExtraField>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [expanded,    setExpanded]    = useState(true);
  const [optionInput, setOptionInput] = useState('');

  const isConditional  = field.type === 'conditional';
  const needsOptions   = field.type === 'select' || field.type === 'radio';
  const availableTypes = getBranchFieldTypes(depth);

  const depthColors  = ['#00c8ff', '#a29bfe', '#00e5a0', '#fdcb6e', '#fd79a8'];
  const depthColor   = depthColors[Math.min(depth, depthColors.length - 1)];
  const effectiveAccent = depth === 0 ? accentColor : depthColor;

  // Leer flags con defaults retrocompatibles
  const showInModal = (field as { showInModal?: boolean }).showInModal ?? true;
  const showInCard  = (field as { showInCard?: boolean }).showInCard  ?? false;
  const showInTaskList = (field as { showInTaskList?: boolean }).showInTaskList ?? false;

  function addOption() {
    const v = optionInput.trim();
    if (!v || isConditional) return;
    onChange({ options: [...((field as SimpleField).options ?? []), v] });
    setOptionInput('');
  }

  function updateBranchField(branch: 'trueBranch' | 'falseBranch', idx: number, patch: Partial<TemplateExtraField>) {
    if (!isConditional) return;
    const current = [...(field as ConditionalField)[branch]];
    current[idx] = { ...current[idx], ...patch } as TemplateExtraField;
    onChange({ [branch]: current });
  }

  function addBranchField(branch: 'trueBranch' | 'falseBranch') {
    if (!isConditional) return;
    const current = (field as ConditionalField)[branch];
    onChange({ [branch]: [...current, makeEmptySimpleField(current.length + 1)] });
  }

  function removeBranchField(branch: 'trueBranch' | 'falseBranch', idx: number) {
    if (!isConditional) return;
    const current = (field as ConditionalField)[branch];
    if (current.length <= 1) return;
    onChange({ [branch]: current.filter((_, i) => i !== idx) });
  }

  function moveBranchField(branch: 'trueBranch' | 'falseBranch', idx: number, dir: -1 | 1) {
    if (!isConditional) return;
    const current = [...(field as ConditionalField)[branch]];
    const s = idx + dir;
    if (s < 0 || s >= current.length) return;
    [current[idx], current[s]] = [current[s], current[idx]];
    onChange({ [branch]: current });
  }

  function handleTypeChange(newType: FieldType) {
    // Preservar showInModal y showInCard al cambiar tipo
    const keepFlags = { showInModal, showInCard, showInTaskList };
    if (newType === 'conditional') {
      const emptyConditional = makeEmptyConditionalField(index);
      onChange({ ...emptyConditional, key: field.key || emptyConditional.key, label: field.label || emptyConditional.label, ...keepFlags } as Partial<TemplateExtraField>);
    } else {
      const patch: Partial<SimpleField> = { type: newType as SimpleField['type'], key: field.key, label: field.label, required: field.required, collapsible: field.collapsible ?? false, placeholder: undefined, options: undefined, ...keepFlags };
      if (newType === 'checkbox') delete patch.placeholder;
      onChange(patch as Partial<TemplateExtraField>);
    }
  }

  const typeLabel = FIELD_TYPES_FULL.find((f) => f.value === field.type)?.label ?? field.type;
  const typeIcon  = FIELD_TYPES_FULL.find((f) => f.value === field.type)?.icon  ?? '';

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${expanded ? effectiveAccent + '35' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: expanded ? `${effectiveAccent}06` : 'transparent', borderBottom: expanded ? `1px solid ${effectiveAccent}15` : 'none' }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: `${effectiveAccent}20`, border: `1px solid ${effectiveAccent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: effectiveAccent, flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.label || <span style={{ color: 'var(--txt-muted)', fontWeight: 400 }}>Sin nombre</span>}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span>{typeIcon}</span><span>{typeLabel}</span>
            {field.required    && <span>· requerido</span>}
            {field.collapsible && <span>· colapsable</span>}
            {/* Indicadores de visibilidad en el header colapsado */}
            {!showInModal && <span style={{ color: '#ff4757' }}>· oculto modal</span>}
            {showInCard   && <span style={{ color: '#00e5a0' }}>· en card</span>}
            {showInTaskList && <span style={{ color: '#fdcb6e' }}>· en listado</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {index > 0 && depth === 0 && <SmBtn color="var(--txt-muted)" onClick={() => onMove(-1)} title="Subir"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 5l3-3 3 3" strokeLinecap="round"/></svg></SmBtn>}
          {index < total - 1 && depth === 0 && <SmBtn color="var(--txt-muted)" onClick={() => onMove(1)} title="Bajar"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 3l3 3 3-3" strokeLinecap="round"/></svg></SmBtn>}
          <SmBtn color={effectiveAccent} onClick={() => setExpanded((v) => !v)} title={expanded ? 'Colapsar' : 'Expandir'}>
            <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8">{expanded ? <path d="M1 5l3-3 3 3" strokeLinecap="round"/> : <path d="M1 3l3 3 3-3" strokeLinecap="round"/>}</svg>
          </SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar campo"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></SmBtn>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Tipo de campo</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
              {availableTypes.map((ft) => (
                <button key={ft.value} onClick={() => handleTypeChange(ft.value)}
                  style={{ padding: '6px 4px', borderRadius: 6, cursor: 'pointer', textAlign: 'center', border: `1px solid ${field.type === ft.value ? effectiveAccent : 'var(--border-subtle)'}`, background: field.type === ft.value ? `${effectiveAccent}15` : 'transparent', color: field.type === ft.value ? effectiveAccent : 'var(--txt-muted)', fontSize: 10, fontWeight: field.type === ft.value ? 700 : 400, transition: 'all 0.12s' }}>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{ft.icon}</div>
                  <div>{ft.label}</div>
                </button>
              ))}
            </div>
            {depth >= MAX_CONDITIONAL_DEPTH && (
              <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 5, background: 'rgba(253,203,110,0.08)', border: '1px solid rgba(253,203,110,0.3)', fontSize: 10, color: '#fdcb6e' }}>
                ⚠️ Límite de anidamiento alcanzado ({MAX_CONDITIONAL_DEPTH} niveles).
              </div>
            )}
          </div>
          <div>
            <FieldLabel>{isConditional ? 'Pregunta (label del checkbox disparador) *' : 'Etiqueta *'}</FieldLabel>
            <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} onBlur={(e) => {
              const label = e.target.value;
              const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
              onChange({ key: key || field.key });
            }} placeholder={isConditional ? 'Ej: ¿Pertenece a CRM?' : 'Ej: Repositorio'} className="cpop-input" />
          </div>
          {!isConditional && (field.type === 'text' || field.type === 'textarea') && (
            <div>
              <FieldLabel>Texto de ayuda</FieldLabel>
              <input value={(field as SimpleField).placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder="Ej: Pegá el nombre del repositorio..." className="cpop-input" />
            </div>
          )}
          {!isConditional && field.type === 'checkbox' && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${effectiveAccent}`, background: `${effectiveAccent}15`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke={effectiveAccent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>{field.label || 'Etiqueta de la casilla'}</span>
            </div>
          )}
          {!isConditional && needsOptions && (
            <div>
              <FieldLabel>Opciones</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
                {((field as SimpleField).options ?? []).map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: effectiveAccent, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--txt)' }}>{opt}</span>
                    <SmBtn color="#ff4757" onClick={() => onChange({ options: ((field as SimpleField).options ?? []).filter((_, idx) => idx !== i) })} title="Quitar">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg>
                    </SmBtn>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={optionInput} onChange={(e) => setOptionInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} placeholder="Nueva opción… (Enter para agregar)" className="cpop-input" style={{ flex: 1 }} />
                <button onClick={addOption} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${effectiveAccent}40`, background: `${effectiveAccent}12`, color: effectiveAccent, fontSize: 12, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>+</button>
              </div>
            </div>
          )}

          {/* ── Opciones de comportamiento (Requerido, Colapsable, Mostrar en modal, Mostrar en card) ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', borderRadius: 7, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
            {/* Requerido */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} style={{ accentColor: effectiveAccent, width: 13, height: 13 }} />
              <span style={{ color: field.required ? effectiveAccent : 'var(--txt-muted)', fontWeight: field.required ? 600 : 400 }}>Requerido</span>
            </label>

            {/* Colapsable — solo para campos no-condicionales y no-checkbox */}
            {!isConditional && field.type !== 'checkbox' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
                <input type="checkbox" checked={(field as SimpleField).collapsible ?? false} onChange={(e) => onChange({ collapsible: e.target.checked })} style={{ accentColor: effectiveAccent, width: 13, height: 13 }} />
                <span style={{ color: ((field as SimpleField).collapsible ?? false) ? effectiveAccent : 'var(--txt-muted)', fontWeight: ((field as SimpleField).collapsible ?? false) ? 600 : 400 }}>Colapsable</span>
              </label>
            )}

            {/* Separador visual */}
            <div style={{ width: '100%', height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />

            {/* Mostrar en modal */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input
                type="checkbox"
                checked={showInModal}
                onChange={(e) => onChange({ showInModal: e.target.checked } as Partial<TemplateExtraField>)}
                style={{ accentColor: effectiveAccent, width: 13, height: 13 }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: showInModal ? effectiveAccent : 'var(--txt-muted)', fontWeight: showInModal ? 600 : 400 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10h8M8 14h5"/></svg>
                Visible en modal
              </span>
            </label>

            {/* Mostrar en card */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input
                type="checkbox"
                checked={showInCard}
                onChange={(e) => onChange({ showInCard: e.target.checked } as Partial<TemplateExtraField>)}
                style={{ accentColor: effectiveAccent, width: 13, height: 13 }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: showInCard ? '#00e5a0' : 'var(--txt-muted)', fontWeight: showInCard ? 600 : 400 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 10h8M8 14h4"/></svg>
                Visible en card
              </span>
              {/* Visible en listado de tareas */}
<label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
  <input
    type="checkbox"
    checked={showInTaskList}
    onChange={(e) => onChange({ showInTaskList: e.target.checked } as Partial<TemplateExtraField>)}
    style={{ accentColor: '#fdcb6e', width: 13, height: 13 }}
  />
  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: showInTaskList ? '#fdcb6e' : 'var(--txt-muted)', fontWeight: showInTaskList ? 600 : 400 }}>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 12h6M9 16h4"/>
    </svg>
    Visible en listado
  </span>
</label>
            </label>
          </div>

          {isConditional && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <BranchEditor label="SÍ" color="#00e5a0"
                icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#00e5a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                fields={(field as ConditionalField).trueBranch} depth={depth} accentColor={accentColor}
                onUpdate={(idx, patch) => updateBranchField('trueBranch', idx, patch)}
                onAdd={() => addBranchField('trueBranch')}
                onRemove={(idx) => removeBranchField('trueBranch', idx)}
                onMove={(idx, dir) => moveBranchField('trueBranch', idx, dir)} />
              <BranchEditor label="NO" color="#ff4757"
                icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#ff4757" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                fields={(field as ConditionalField).falseBranch} depth={depth} accentColor={accentColor}
                onUpdate={(idx, patch) => updateBranchField('falseBranch', idx, patch)}
                onAdd={() => addBranchField('falseBranch')}
                onRemove={(idx) => removeBranchField('falseBranch', idx)}
                onMove={(idx, dir) => moveBranchField('falseBranch', idx, dir)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   BranchEditor
   ============================================================ */
function BranchEditor({ label, color, icon, fields, depth, onUpdate, onAdd, onRemove, onMove }: {
  label: string; color: string; icon: React.ReactNode; fields: TemplateExtraField[]; depth: number; accentColor: string;
  onUpdate: (idx: number, patch: Partial<TemplateExtraField>) => void; onAdd: () => void;
  onRemove: (idx: number) => void; onMove: (idx: number, dir: -1 | 1) => void;
}) {
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${color}30` }}>
      <div style={{ padding: '8px 12px', background: `${color}08`, borderBottom: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color }}>Si respondió {label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3, background: `${color}15`, color, border: `1px solid ${color}30`, fontWeight: 700 }}>{fields.length} campo{fields.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map((f, idx) => (
          <FieldEditor key={`${idx}-${f.key}`} field={f} index={idx} total={fields.length} accentColor={color} depth={depth + 1}
            onChange={(patch) => onUpdate(idx, patch)} onRemove={() => onRemove(idx)} onMove={(dir) => onMove(idx, dir)} />
        ))}
        <button onClick={onAdd}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 7, width: '100%', border: `1px dashed ${color}40`, background: `${color}05`, color, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}70`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${color}05`; e.currentTarget.style.borderColor = `${color}40`; }}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/></svg>
          + campo en rama {label}
        </button>
      </div>
    </div>
  );
}
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--accent)', flexShrink: 0 }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>
      {children}
    </div>
  );
}