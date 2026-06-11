import { useState } from 'react';
import {
  useDepartmentsWithTeams, useCreateDepartment,
  useUpdateDepartment, useDeleteDepartment,
  type DepartmentWithTeams,
} from '@/features/requests/hooks/useDepartments';
import { useCreateTeam, useUpdateTeam, useDeleteTeam } from '@/features/requests/hooks/useTeams';
import { AddBtn, SmBtn, FieldLabel, FormActions } from '../ConfigPanel';

export function OrgSection() {
  const { data: departments = [], isLoading } = useDepartmentsWithTeams();
  const createDept  = useCreateDepartment();
  const updateDept  = useUpdateDepartment();
  const deleteDept  = useDeleteDepartment();
  const createTeam  = useCreateTeam();
  const updateTeam  = useUpdateTeam();
  const deleteTeam  = useDeleteTeam();

  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [editDeptId,  setEditDeptId]  = useState<number | null>(null); // -1 = nuevo
  const [showNewDept, setShowNewDept] = useState(false);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 52, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
    );
  }

  // Modo edición / creación de departamento
  if (showNewDept || editDeptId !== null) {
    const dept = (editDeptId !== null && editDeptId !== -1)
      ? departments.find((d) => d.Department_ID === editDeptId)
      : undefined;
    return (
      <DeptForm
        initial={dept ? { name: dept.Department_Name, code: dept.Department_Code, isHidden: dept.Is_Hidden_From_Onboarding } : undefined}
        saving={createDept.isPending || updateDept.isPending}
        onSave={(data) => {
          if (dept) {
            updateDept.mutate({ id: dept.Department_ID, ...data }, { onSuccess: () => setEditDeptId(null) });
          } else {
            createDept.mutate(data, { onSuccess: () => setShowNewDept(false) });
          }
        }}
        onCancel={() => { setShowNewDept(false); setEditDeptId(null); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" stroke="var(--accent)" strokeWidth="1.3"/><path d="M7 5v4M7 3.5v.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"/></svg>
        <span>El punto verde indica que el departamento es visible en el onboarding. Usá el ícono del ojo para cambiarlo.</span>
      </div>

      {departments.length === 0 && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>🏢</span>
          <p>No hay departamentos configurados.</p>
        </div>
      )}

      {departments.map((dept) => (
        <DeptCard
          key={dept.Department_ID}
          dept={dept}
          expanded={expandedId === dept.Department_ID}
          onToggle={() => setExpandedId(expandedId === dept.Department_ID ? null : dept.Department_ID)}
          onEdit={() => { setExpandedId(null); setEditDeptId(dept.Department_ID); }}
          onDelete={() => deleteDept.mutate(dept.Department_ID)}
          onToggleHidden={() => updateDept.mutate({
            id:       dept.Department_ID,
            name:     dept.Department_Name,
            code:     dept.Department_Code,
            isHidden: !dept.Is_Hidden_From_Onboarding,
          })}
          onCreateTeam={(data) => createTeam.mutate({ departmentId: dept.Department_ID, ...data })}
          onUpdateTeam={(id, data) => updateTeam.mutate({ id, ...data })}
          onDeleteTeam={(id) => deleteTeam.mutate(id)}
        />
      ))}

      <AddBtn label="Nuevo departamento" onClick={() => setShowNewDept(true)} />
    </div>
  );
}

/* ── DeptCard ── */
export function DeptCard({ dept, expanded, onToggle, onEdit, onDelete, onToggleHidden, onCreateTeam, onUpdateTeam, onDeleteTeam }: {
  dept:          DepartmentWithTeams;
  expanded:      boolean;
  onToggle:      () => void;
  onEdit:        () => void;
  onDelete:      () => void;
  onToggleHidden:() => void;
  onCreateTeam:  (d: { name: string; code: string }) => void;
  onUpdateTeam:  (id: number, d: { name: string; code: string }) => void;
  onDeleteTeam:  (id: number) => void;
}) {
  const [hov,           setHov]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editTeamId,    setEditTeamId]    = useState<number | null>(null);
  const [showNewTeam,   setShowNewTeam]   = useState(false);

  const isHidden  = dept.Is_Hidden_From_Onboarding;
  const teamCount = dept.teams.length;

  return (
    <div style={{ border: `1px solid ${expanded ? 'var(--border)' : 'var(--border-subtle)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface)', transition: 'border-color 0.15s' }}>

      {/* ── Header ── */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => { setHov(false); setConfirmDelete(false); }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: hov || expanded ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.12s', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none' }}
      >
        {/* Dot visibilidad */}
        <div style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: isHidden ? 'rgba(255,71,87,0.5)' : '#00e5a0', transition: 'background 0.2s' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dept.Department_Name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{dept.Department_Code}</div>
        </div>

        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', flexShrink: 0 }}>
          {teamCount} {teamCount === 1 ? 'equipo' : 'equipos'}
        </span>

        {/* Acciones — stopPropagation para no hacer toggle */}
        <div style={{ display: 'flex', gap: 3, opacity: hov || expanded ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {/* Toggle visibilidad onboarding */}
          <button
            onClick={onToggleHidden}
            title={isHidden ? 'Mostrar en onboarding' : 'Ocultar del onboarding'}
            style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${isHidden ? 'rgba(255,71,87,0.3)' : 'rgba(0,229,160,0.3)'}`, background: isHidden ? 'rgba(255,71,87,0.08)' : 'rgba(0,229,160,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isHidden ? '#ff4757' : '#00e5a0', transition: 'all 0.12s', flexShrink: 0 }}
          >
            {isHidden
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar departamento">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
          </SmBtn>
          <button
            onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } setConfirmDelete(false); onDelete(); }}
            style={{ display: 'flex', alignItems: 'center', gap: confirmDelete ? 4 : 0, padding: confirmDelete ? '3px 8px' : '3px 5px', borderRadius: 5, border: `1px solid ${confirmDelete ? 'rgba(255,71,87,0.5)' : 'rgba(255,71,87,0.2)'}`, background: confirmDelete ? 'rgba(255,71,87,0.15)' : 'rgba(255,71,87,0.06)', color: '#ff4757', fontSize: 9, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg>
            {confirmDelete && <span style={{ marginLeft: 3 }}>¿Confirmar?</span>}
          </button>
        </div>

        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s', opacity: 0.4 }}>
          <path d="M1 3l4 4 4-4"/>
        </svg>
      </div>

      {/* ── Panel expandido ── */}
      {expanded && (
        <div style={{ padding: '10px 12px 12px', background: 'var(--bg-panel)' }}>
          {/* Pill de visibilidad */}
          <div style={{ marginBottom: 10, padding: '5px 10px', borderRadius: 6, background: isHidden ? 'rgba(255,71,87,0.06)' : 'rgba(0,229,160,0.06)', border: `1px solid ${isHidden ? 'rgba(255,71,87,0.2)' : 'rgba(0,229,160,0.2)'}`, fontSize: 10, color: isHidden ? '#ff4757' : '#00e5a0', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isHidden
              ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Oculto del onboarding</>
              : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Visible en onboarding</>
            }
          </div>

          {/* Lista de equipos */}
          {dept.teams.length === 0 && !showNewTeam && (
            <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: '0 0 8px', opacity: 0.6 }}>Sin equipos aún.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
            {dept.teams.map((team) => (
              editTeamId === team.Team_ID ? (
                <div key={team.Team_ID} style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <TeamForm
                    initial={{ name: team.Team_Name, code: team.Team_Code }}
                    onSave={(d) => { onUpdateTeam(team.Team_ID, d); setEditTeamId(null); }}
                    onCancel={() => setEditTeamId(null)}
                  />
                </div>
              ) : (
                <TeamRow
                  key={team.Team_ID}
                  team={team}
                  onEdit={() => { setShowNewTeam(false); setEditTeamId(team.Team_ID); }}
                  onDelete={() => onDeleteTeam(team.Team_ID)}
                />
              )
            ))}
          </div>

          {showNewTeam ? (
            <div style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
              <TeamForm
                onSave={(d) => { onCreateTeam(d); setShowNewTeam(false); }}
                onCancel={() => setShowNewTeam(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => { setEditTeamId(null); setShowNewTeam(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0,200,255,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--txt-muted)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/></svg>
              Nuevo equipo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── DeptForm ── */
export function DeptForm({ initial, onSave, onCancel, saving }: {
  initial?: { name: string; code: string; isHidden: boolean };
  onSave:   (d: { name: string; code: string; isHidden: boolean }) => void;
  onCancel: () => void;
  saving?:  boolean;
}) {
  const [name,     setName]     = useState(initial?.name     ?? '');
  const [code,     setCode]     = useState(initial?.code     ?? '');
  const [isHidden, setIsHidden] = useState(initial?.isHidden ?? false);
  const canSave = name.trim().length > 0 && code.trim().length > 0;

  function handleNameChange(val: string) {
    setName(val);
    if (!initial) {
      setCode(val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>
          ← Volver
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>
          {initial ? `Editar: ${initial.name}` : 'Nuevo departamento'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <FieldLabel>Nombre *</FieldLabel>
          <input autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ej: Finanzas" className="cpop-input" />
        </div>
        <div>
          <FieldLabel>Código *</FieldLabel>
          <input value={code} onChange={(e) => setCode(e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))} placeholder="Ej: finanzas" className="cpop-input" style={{ fontFamily: 'monospace' }} />
        </div>
      </div>
      <div>
        <FieldLabel>Visibilidad en onboarding</FieldLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isHidden ? 'rgba(255,71,87,0.3)' : 'rgba(0,229,160,0.3)'}`, background: isHidden ? 'rgba(255,71,87,0.04)' : 'rgba(0,229,160,0.04)', transition: 'all 0.15s' }}>
          <input type="checkbox" checked={!isHidden} onChange={(e) => setIsHidden(!e.target.checked)} style={{ accentColor: '#00e5a0', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isHidden ? '#ff4757' : '#00e5a0' }}>
              {isHidden ? 'Oculto del onboarding' : 'Visible en onboarding'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>
              {isHidden ? 'Los usuarios no verán este departamento al registrarse' : 'Los usuarios pueden seleccionarlo al registrarse'}
            </div>
          </div>
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button onClick={() => canSave && !saving && onSave({ name: name.trim(), code: code.trim(), isHidden })} disabled={!canSave || saving} className={`cpop-btn-save${!canSave || saving ? ' cpop-btn-save--disabled' : ''}`}>
          {saving ? 'Guardando…' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}
export function TeamForm({ initial, onSave, onCancel }: {
  initial?: { name: string; code: string };
  onSave:   (d: { name: string; code: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const canSave = name.trim().length > 0 && code.trim().length > 0;

  function handleNameChange(val: string) {
    setName(val);
    if (!initial) {
      setCode(val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    }
  }

  return (
    <div className="cpop-form">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FieldLabel>Nombre *</FieldLabel>
          <input autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), code: code.trim() }); if (e.key === 'Escape') onCancel(); }} placeholder="Ej: Contabilidad" className="cpop-input" />
        </div>
        <div>
          <FieldLabel>Código *</FieldLabel>
          <input value={code} onChange={(e) => setCode(e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))} placeholder="Ej: contabilidad" className="cpop-input" style={{ fontFamily: 'monospace' }} />
        </div>
      </div>
      <FormActions canSave={canSave} onSave={() => onSave({ name: name.trim(), code: code.trim() })} onCancel={onCancel} />
    </div>
  );
}
function TeamRow({ team, onEdit, onDelete }: {
  team:     { Team_ID: number; Team_Name: string; Team_Code: string };
  onEdit:   () => void;
  onDelete: () => void;
}) {
  const [hov,     setHov]     = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setConfirm(false); }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`, background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)', transition: 'all 0.12s' }}
    >
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--txt-muted)', flexShrink: 0, opacity: 0.35 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>{team.Team_Name}</span>
        <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace', opacity: 0.7 }}>{team.Team_Code}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar equipo">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
        </SmBtn>
        <button
          onClick={() => { if (!confirm) { setConfirm(true); return; } setConfirm(false); onDelete(); }}
          style={{ display: 'flex', alignItems: 'center', gap: confirm ? 4 : 0, padding: confirm ? '3px 7px' : '3px 5px', borderRadius: 5, border: `1px solid ${confirm ? 'rgba(255,71,87,0.5)' : 'rgba(255,71,87,0.2)'}`, background: confirm ? 'rgba(255,71,87,0.15)' : 'rgba(255,71,87,0.06)', color: '#ff4757', fontSize: 9, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg>
          {confirm && <span style={{ marginLeft: 3 }}>¿Confirmar?</span>}
        </button>
      </div>
    </div>
  );
}
