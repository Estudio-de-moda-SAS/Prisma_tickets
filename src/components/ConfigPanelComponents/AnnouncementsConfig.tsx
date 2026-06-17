import { useState }                         from 'react';
import {
  useAllAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  ANNOUNCEMENT_TYPE_STYLE,
  type Announcement,
}                                           from '@/features/requests/hooks/useAnnouncements';
import { useDepartmentsWithTeams, type DepartmentWithTeams }
                                            from '@/features/requests/hooks/useDepartments';
import { useCurrentUser }                   from '@/features/requests/hooks/useCurrentUser';
import { AddBtn, SmBtn, FieldLabel, FormActions } from '../ConfigPanel';

/* ── Constantes ── */
const SURFACES = [
  { key: 'banner', label: 'Banner'      },
  { key: 'login',  label: 'Login'       },
  { key: 'home',   label: 'Inicio'      },
  { key: 'modal',  label: 'Modal'       },
] as const;

const TYPES = [
  { key: 'info',     label: 'Info',    color: '#00c8ff' },
  { key: 'warning',  label: 'Aviso',   color: '#EF9F27' },
  { key: 'critical', label: 'Crítico', color: '#ff4757' },
  { key: 'success',  label: 'Éxito',   color: '#4CAF50' },
] as const;

/* ── Helpers de audiencia ── */
function computeTargetRole(
  audienceType: 'all' | 'admin' | 'department',
  deptId:       number | null,
  teamId:       number | null,
): string | null {
  if (audienceType === 'all')   return null;
  if (audienceType === 'admin') return 'admin';
  if (!deptId)                  return null;
  return teamId ? `dept:${deptId},team:${teamId}` : `dept:${deptId}`;
}

function parseTargetRole(targetRole: string | null): {
  audienceType: 'all' | 'admin' | 'department';
  targetDeptId: number | null;
  targetTeamId: number | null;
} {
  if (!targetRole) return { audienceType: 'all', targetDeptId: null, targetTeamId: null };
  if (targetRole === 'admin') return { audienceType: 'admin', targetDeptId: null, targetTeamId: null };
  const parts    = targetRole.split(',');
  const deptPart = parts.find((p) => p.startsWith('dept:'));
  const teamPart = parts.find((p) => p.startsWith('team:'));
  return {
    audienceType: 'department',
    targetDeptId: deptPart ? parseInt(deptPart.slice(5)) : null,
    targetTeamId: teamPart ? parseInt(teamPart.slice(5)) : null,
  };
}

function resolveAudienceLabel(
  targetRole: string | null,
  depts:      DepartmentWithTeams[],
): string {
  if (!targetRole) return 'Todos';
  if (targetRole === 'admin') return 'Solo admin';
  const parts    = targetRole.split(',');
  const deptPart = parts.find((p) => p.startsWith('dept:'));
  const teamPart = parts.find((p) => p.startsWith('team:'));
  const dept     = deptPart ? depts.find((d) => d.Department_ID === parseInt(deptPart.slice(5))) : null;
  const team     = teamPart && dept ? dept.teams.find((t: any) => t.Team_ID === parseInt(teamPart.slice(5))) : null;
  if (team && dept) return `${dept.Department_Name} · ${(team as any).Team_Name}`;
  if (dept) return dept.Department_Name;
  return 'Departamento';
}

/* ── FormState ── */
interface FormState {
  title:        string;
  body:         string;
  type:         Announcement['type'];
  showIn:       string[];
  audienceType: 'all' | 'admin' | 'department';
  targetDeptId: number | null;
  targetTeamId: number | null;
  startsAt:     string;
  endsAt:       string;
}

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultForm(): FormState {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    title: '', body: '', type: 'info', showIn: ['banner'],
    audienceType: 'all', targetDeptId: null, targetTeamId: null,
    startsAt: toLocalDatetimeInput(now), endsAt: '',
  };
}

function toForm(a: Announcement): FormState {
  const { audienceType, targetDeptId, targetTeamId } = parseTargetRole(a.targetRole);
  return {
    title: a.title, body: a.body ?? '', type: a.type, showIn: a.showIn,
    audienceType, targetDeptId, targetTeamId,
    startsAt: toLocalDatetimeInput(new Date(a.startsAt)),
    endsAt:   a.endsAt ? toLocalDatetimeInput(new Date(a.endsAt)) : '',
  };
}

/* ── AnnouncementForm ── */
function AnnouncementForm({ initial, onSave, onCancel }: {
  initial?: FormState;
  onSave:   (f: FormState) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(initial ?? defaultForm());
  const { data: departments = [] } = useDepartmentsWithTeams();
  const canSave = f.title.trim().length > 0 && f.showIn.length > 0 &&
    (f.audienceType !== 'department' || !!f.targetDeptId);

const toggle = (key: string) =>
  setF((p) => {
    const newShowIn = p.showIn.includes(key)
      ? p.showIn.filter((s) => s !== key)
      : [...p.showIn, key];
    const loginForced = newShowIn.includes('login') && p.audienceType !== 'all';
    return {
      ...p,
      showIn: newShowIn,
      ...(loginForced ? { audienceType: 'all', targetDeptId: null, targetTeamId: null } : {}),
    };
  });

  const selectedDept = departments.find((d) => d.Department_ID === f.targetDeptId);
  const deptTeams: any[] = selectedDept?.teams ?? [];

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg-surface)',
    color: 'var(--txt)', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const,
  };

  return (
    <div className="cpop-form" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}>

      {/* Título */}
      <div>
        <FieldLabel>Título *</FieldLabel>
        <input
          autoFocus value={f.title}
          onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave(f); if (e.key === 'Escape') onCancel(); }}
          placeholder="Ej: Mantenimiento programado el viernes…"
          className="cpop-input"
        />
      </div>

      {/* Descripción */}
      <div>
        <FieldLabel>Descripción (opcional)</FieldLabel>
        <textarea
          value={f.body}
          onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))}
          placeholder="Detalles adicionales…"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {/* Tipo */}
      <div>
        <FieldLabel>Tipo</FieldLabel>
        <div style={{ display: 'flex', gap: 5 }}>
          {TYPES.map((t) => (
            <button
              key={t.key} type="button"
              onClick={() => setF((p) => ({ ...p, type: t.key as Announcement['type'] }))}
              style={{
                flex: 1, padding: '5px 4px', borderRadius: 7,
                border: `1px solid ${f.type === t.key ? t.color + '55' : 'var(--border)'}`,
                background: f.type === t.key ? t.color + '18' : 'var(--bg-surface)',
                color: f.type === t.key ? t.color : 'var(--txt-muted)',
                fontSize: 11, fontWeight: f.type === t.key ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Mostrar en */}
      <div>
        <FieldLabel>Mostrar en</FieldLabel>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {SURFACES.map((s) => (
            <button
              key={s.key} type="button" onClick={() => toggle(s.key)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${f.showIn.includes(s.key) ? 'rgba(0,200,255,0.5)' : 'var(--border)'}`,
                background: f.showIn.includes(s.key) ? 'rgba(0,200,255,0.12)' : 'var(--bg-surface)',
                color: f.showIn.includes(s.key) ? '#00c8ff' : 'var(--txt-muted)',
                fontSize: 11, fontWeight: f.showIn.includes(s.key) ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>

{/* Audiencia */}
<div>
  <FieldLabel>Audiencia</FieldLabel>

  {f.showIn.includes('login') && (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '7px 10px', borderRadius: 7, background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)', marginBottom: 8 }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span>
      <span style={{ fontSize: 11, color: '#EF9F27', lineHeight: 1.5 }}>
        Los avisos en <strong>Login</strong> son visibles para todos — el usuario aún no está autenticado.
      </span>
    </div>
  )}

  <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
    {(['all', 'admin', 'department'] as const).map((type) => {
      const labels   = { all: 'Todos', admin: 'Solo admin', department: 'Por departamento' };
      const active   = f.audienceType === type;
      const disabled = f.showIn.includes('login') && type !== 'all';
      return (
        <button
          key={type} type="button"
          onClick={() => !disabled && setF((p) => ({ ...p, audienceType: type, targetDeptId: null, targetTeamId: null }))}
          style={{
            flex: 1, padding: '5px 4px', borderRadius: 7,
            border: `1px solid ${active ? 'rgba(0,200,255,0.5)' : 'var(--border)'}`,
            background: active ? 'rgba(0,200,255,0.12)' : 'var(--bg-surface)',
            color: disabled ? 'var(--border)' : active ? '#00c8ff' : 'var(--txt-muted)',
            fontSize: 11, fontWeight: active ? 700 : 400,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.12s', opacity: disabled ? 0.4 : 1,
          }}
        >{labels[type]}</button>
      );
    })}
  </div>

  {f.audienceType === 'department' && !f.showIn.includes('login') && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div>
        <FieldLabel>Departamento *</FieldLabel>
        <select
          value={f.targetDeptId ?? ''}
          onChange={(e) => setF((p) => ({
            ...p,
            targetDeptId: e.target.value ? parseInt(e.target.value) : null,
            targetTeamId: null,
          }))}
          style={inputStyle}
        >
          <option value="">— Elige departamento —</option>
          {departments.map((d) => (
            <option key={d.Department_ID} value={d.Department_ID}>{d.Department_Name}</option>
          ))}
        </select>
      </div>

      {f.targetDeptId && deptTeams.length > 0 && (
        <div>
          <FieldLabel>Equipo (Dejar vacio para mostrar a todo el departamento)</FieldLabel>
          <select
            value={f.targetTeamId ?? ''}
            onChange={(e) => setF((p) => ({
              ...p,
              targetTeamId: e.target.value ? parseInt(e.target.value) : null,
            }))}
            style={inputStyle}
          >
            <option value="">Todo el departamento</option>
            {deptTeams.map((t: any) => (
              <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )}
</div>

      {/* Fechas */}
      <div>
        <FieldLabel>Inicio</FieldLabel>
        <input type="datetime-local" value={f.startsAt}
          onChange={(e) => setF((p) => ({ ...p, startsAt: e.target.value }))}
          style={inputStyle} />
      </div>
      <div>
        <FieldLabel>Fin (opcional)</FieldLabel>
        <input type="datetime-local" value={f.endsAt}
          onChange={(e) => setF((p) => ({ ...p, endsAt: e.target.value }))}
          style={inputStyle} />
      </div>

      <FormActions canSave={canSave} onSave={() => onSave(f)} onCancel={onCancel} />
    </div>
  );
}

/* ── AnnouncementRow ── */
function AnnouncementRow({ a, audienceLabel, onEdit, onDelete, onToggle }: {
  a:             Announcement;
  audienceLabel: string;
  onEdit:        () => void;
  onDelete:      () => void;
  onToggle:      () => void;
}) {
  const [hov, setHov] = useState(false);
  const s         = ANNOUNCEMENT_TYPE_STYLE[a.type] ?? ANNOUNCEMENT_TYPE_STYLE.info;
  const isExpired = a.endsAt
    ? new Date(a.endsAt + (a.endsAt.includes('Z') ? '' : 'Z')) < new Date()
    : false;

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`,
        background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)',
        transition: 'all 0.12s', opacity: a.isActive && !isExpired ? 1 : 0.5,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, marginTop: 4 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{a.title}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: s.color + '18', color: s.color, border: `1px solid ${s.color}35`, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {s.icon} {a.type}
          </span>
          {isExpired && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: 'var(--txt-muted)', border: '1px solid var(--border-subtle)' }}>Expirado</span>
          )}
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: 'var(--txt-muted)', border: '1px solid var(--border-subtle)' }}>
            👥 {audienceLabel}
          </span>
          {a.showIn.map((sk) => (
            <span key={sk} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,200,255,0.07)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.2)' }}>{sk}</span>
          ))}
        </div>
        {a.body && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {a.body}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={onToggle} title={a.isActive ? 'Desactivar' : 'Activar'}
          style={{ width: 30, height: 16, borderRadius: 10, border: 'none', cursor: 'pointer', background: a.isActive ? 'rgba(76,175,80,0.5)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 2, left: a.isActive ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: a.isActive ? '#4CAF50' : 'var(--txt-muted)', transition: 'left 0.2s, background 0.2s' }} />
        </button>
        <div style={{ opacity: hov ? 1 : 0, display: 'flex', gap: 3, transition: 'opacity 0.12s' }}>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
          </SmBtn>
          <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg>
          </SmBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Principal ── */
export function AnnouncementsConfig() {
  const { data: currentUser }              = useCurrentUser();
  const { data: list = [], isLoading }     = useAllAnnouncements();
  const { data: departments = [] }         = useDepartmentsWithTeams();
  const createMut = useCreateAnnouncement();
  const updateMut = useUpdateAnnouncement();
  const deleteMut = useDeleteAnnouncement();

  const [adding,    setAdding]    = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleCreate(f: FormState) {
    if (!currentUser) return;
    createMut.mutate({
      title:      f.title.trim(),
      body:       f.body.trim() || null,
      type:       f.type,
      showIn:     f.showIn,
      targetRole: computeTargetRole(f.audienceType, f.targetDeptId, f.targetTeamId),
      startsAt:   f.startsAt ? new Date(f.startsAt).toISOString() : new Date().toISOString(),
      endsAt:     f.endsAt   ? new Date(f.endsAt).toISOString()   : null,
      createdBy:  currentUser.User_ID,
    } as any, { onSuccess: () => setAdding(false) });
  }

  function handleUpdate(id: string, f: FormState) {
    updateMut.mutate({
      id,
      title:      f.title.trim(),
      body:       f.body.trim() || null,
      type:       f.type,
      showIn:     f.showIn,
      targetRole: computeTargetRole(f.audienceType, f.targetDeptId, f.targetTeamId),
      startsAt:   f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
      endsAt:     f.endsAt   ? new Date(f.endsAt).toISOString()   : null,
    }, { onSuccess: () => setEditingId(null) });
  }

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 8, color: 'var(--txt-muted)', fontSize: 12 }}>
      <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      Cargando avisos…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.length === 0 && !adding ? (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>📢</span>
          <p>No hay avisos creados aún.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((a) =>
            editingId === a.id ? (
              <AnnouncementForm
                key={a.id}
                initial={toForm(a)}
                onSave={(f) => handleUpdate(a.id, f)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <AnnouncementRow
                key={a.id} a={a}
                audienceLabel={resolveAudienceLabel(a.targetRole, departments)}
                onEdit={()   => setEditingId(a.id)}
                onDelete={()  => { if (confirm('¿Eliminar este aviso?')) deleteMut.mutate(a.id); }}
                onToggle={()  => updateMut.mutate({ id: a.id, isActive: !a.isActive })}
              />
            )
          )}
        </div>
      )}
      {adding && (
        <AnnouncementForm onSave={handleCreate} onCancel={() => setAdding(false)} />
      )}
      {!adding && !editingId && (
        <AddBtn label="Nuevo aviso" onClick={() => setAdding(true)} />
      )}
    </div>
  );
}