import { useState, useEffect } from 'react';
import type { Department, Team } from '@/types/commons';
import { useAuth } from '@/auth/AuthProvider';
import { apiClient } from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { SmBtn, FieldLabel } from '../ConfigPanel';

type ManagedUser = {
  User_ID:       number;
  User_Name:     string;
  User_Email:    string;
  User_Role:     string;
  Department_ID: number | null;
  Team_ID:       number | null;
  Is_New:        boolean;
  Is_Active:     boolean;
  department: { Department_ID: number; Department_Name: string; Department_Code: string } | null;
  team:       { Team_ID: number; Team_Name: string; Team_Code: string } | null;
};

export function UserList() {
  const qc = useQueryClient();
  const { dbUser, refreshDbUser } = useAuth();
  const [users,       setUsers]       = useState<ManagedUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [editId,      setEditId]      = useState<number | null>(null);
  const [search,      setSearch]      = useState('');
  const [showPreReg,  setShowPreReg]  = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.call<ManagedUser[]>('fetchAllUsers', {});
        setUsers(data);
      } catch {
        // fallo silencioso
      } finally {
        setLoading(false);
      }
    })();
  }, []);

async function handleUpdate(updated: ManagedUser) {
  setUsers((prev) => prev.map((u) => u.User_ID === updated.User_ID ? updated : u));
  setEditId(null);
  qc.invalidateQueries({ queryKey: ['allUsers'] });
  if (dbUser && updated.User_ID === dbUser.User_ID) {
    await refreshDbUser();
    qc.invalidateQueries({ queryKey: ['currentUser'] });
  }
}

  async function handlePreRegister(newUser: ManagedUser) {
    setUsers((prev) => [...prev, newUser]);
    setShowPreReg(false);
  }

  async function handleDeactivate(userId: number) {
    try {
      await apiClient.call('deactivateUser', { userId });
      setUsers((prev) => prev.map((u) => u.User_ID === userId ? { ...u, Is_Active: false } : u));
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    } catch {
      // fallo silencioso
    }
  }

  async function handleReactivate(userId: number) {
    try {
      await apiClient.call('reactivateUser', { userId });
      setUsers((prev) => prev.map((u) => u.User_ID === userId ? { ...u, Is_Active: true } : u));
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    } catch {
      // fallo silencioso
    }
  }

  const visibleUsers = users.filter((u) => showInactive ? !u.Is_Active : (u.Is_Active !== false));

  const filtered = visibleUsers.filter((u) =>
    u.User_Name.toLowerCase().includes(search.toLowerCase()) ||
    u.User_Email.toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.reduce<Record<string, ManagedUser[]>>((acc, user) => {
    const key = user.department?.Department_Name ?? '__sin_equipo__';
    if (!acc[key]) acc[key] = [];
    acc[key].push(user);
    return acc;
  }, {});

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '__sin_equipo__') return -1;
    if (b === '__sin_equipo__') return  1;
    return a.localeCompare(b);
  });

  const inactiveCount = users.filter((u) => u.Is_Active === false).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 64, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
    );
  }

  if (editId !== null) {
    const user = users.find((u) => u.User_ID === editId);
    if (user) return <UserEditForm user={user} onSave={handleUpdate} onCancel={() => setEditId(null)} />;
  }

  if (showPreReg) {
    return <PreRegisterForm onSave={handlePreRegister} onCancel={() => setShowPreReg(false)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o correo…"
          className="cpop-input"
          style={{ flex: 1 }}
        />
        <button
          onClick={() => setShowPreReg(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 14px', borderRadius: 7, border: '1px solid rgba(0,200,255,0.3)',
            background: 'rgba(0,200,255,0.08)', color: 'var(--accent)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.08)'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 1v8M1 5h8" strokeLinecap="round"/>
          </svg>
          Pre-registrar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => setShowInactive(false)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${!showInactive ? 'rgba(0,229,160,0.4)' : 'var(--border-subtle)'}`,
            background: !showInactive ? 'rgba(0,229,160,0.08)' : 'transparent',
            color: !showInactive ? '#00e5a0' : 'var(--txt-muted)', transition: 'all 0.12s',
          }}
        >
          Activos ({users.filter((u) => u.Is_Active !== false).length})
        </button>
        <button
          onClick={() => setShowInactive(true)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showInactive ? 'rgba(255,71,87,0.4)' : 'var(--border-subtle)'}`,
            background: showInactive ? 'rgba(255,71,87,0.08)' : 'transparent',
            color: showInactive ? '#ff4757' : 'var(--txt-muted)', transition: 'all 0.12s',
          }}
        >
          Inactivos ({inactiveCount})
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>👤</span>
          <p>{search ? 'Sin resultados.' : showInactive ? 'No hay usuarios inactivos.' : 'No hay usuarios registrados.'}</p>
        </div>
      )}

      {sortedKeys.map((key) => (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              color: key === '__sin_equipo__' ? 'var(--txt-muted)' : 'var(--accent)', flexShrink: 0,
            }}>
              {key === '__sin_equipo__' ? 'Sin equipo' : key}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              color: 'var(--txt-muted)', flexShrink: 0,
            }}>
              {groups[key].length}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups[key].map((user) => (
              <UserRow
                key={user.User_ID}
                user={user}
                onEdit={() => setEditId(user.User_ID)}
                onDeactivate={() => handleDeactivate(user.User_ID)}
                onReactivate={() => handleReactivate(user.User_ID)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   UserRow
   ============================================================ */
function UserRow({ user, onEdit, onDeactivate, onReactivate }: {
  user:         ManagedUser;
  onEdit:       () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const [hov,     setHov]     = useState(false);
  const [confirm, setConfirm] = useState(false);

  const isAdmin    = user.User_Role === 'admin';
  const isPreReg   = user.User_Name === '';
  const isInactive = user.Is_Active === false;
  const initials   = isPreReg
    ? '?'
    : user.User_Name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function handleDeactivateClick() {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false);
    onDeactivate();
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setConfirm(false); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderRadius: 10,
        border: `1px solid ${hov ? 'var(--border)' : isInactive ? 'rgba(255,71,87,0.15)' : isPreReg ? 'rgba(162,155,254,0.2)' : 'var(--border-subtle)'}`,
        background: hov ? 'var(--bg-hover)' : isInactive ? 'rgba(255,71,87,0.03)' : isPreReg ? 'rgba(162,155,254,0.03)' : 'var(--bg-surface)',
        transition: 'all 0.12s',
        opacity: isInactive ? 0.6 : 1,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: isInactive ? 'rgba(255,71,87,0.08)' : isPreReg ? 'rgba(162,155,254,0.1)' : isAdmin ? 'rgba(0,200,255,0.15)' : 'var(--bg-panel)',
        border: `1px solid ${isInactive ? 'rgba(255,71,87,0.25)' : isPreReg ? 'rgba(162,155,254,0.3)' : isAdmin ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isPreReg ? 16 : 12, fontWeight: 700,
        color: isInactive ? '#ff4757' : isPreReg ? '#a29bfe' : isAdmin ? 'var(--accent)' : 'var(--txt-muted)',
        textDecoration: isInactive ? 'line-through' : 'none',
      }}>
        {isInactive ? '🚫' : isPreReg ? '⏳' : initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: isInactive ? 'var(--txt-muted)' : isPreReg ? 'var(--txt-muted)' : 'var(--txt)',
            fontStyle: isPreReg ? 'italic' : 'normal',
            textDecoration: isInactive ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isPreReg ? user.User_Email : user.User_Name}
          </span>
          {isInactive && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757' }}>Inactivo</span>
          )}
          {!isInactive && !isPreReg && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: isAdmin ? 'rgba(0,200,255,0.12)' : 'var(--bg-panel)', border: `1px solid ${isAdmin ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`, color: isAdmin ? 'var(--accent)' : 'var(--txt-muted)' }}>
              {isAdmin ? 'Admin' : 'Member'}
            </span>
          )}
          {!isInactive && isPreReg && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: 'rgba(162,155,254,0.12)', border: '1px solid rgba(162,155,254,0.3)', color: '#a29bfe' }}>Pre-reg</span>
          )}
          {!isInactive && !isPreReg && user.Is_New && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: 'rgba(253,203,110,0.12)', border: '1px solid rgba(253,203,110,0.35)', color: '#fdcb6e' }}>Onboarding</span>
          )}
        </div>
        {!isPreReg && (
          <div style={{ fontSize: 11, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.User_Email}</div>
        )}
        <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: isPreReg ? 0 : 2, opacity: 0.7 }}>
          {user.department?.Department_Name ?? '—'}{user.team ? ` · ${user.team.Team_Name}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {isInactive ? (
          <button onClick={onReactivate} title="Reactivar usuario"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,229,160,0.35)', background: 'rgba(0,229,160,0.08)', color: '#00e5a0', fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,229,160,0.18)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,229,160,0.08)'; }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1.5 5l2.5 2.5L8.5 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Reactivar
          </button>
        ) : (
          <>
            <SmBtn color="#00c8ff" onClick={onEdit} title="Editar usuario">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
            </SmBtn>
            <button onClick={handleDeactivateClick} title={confirm ? 'Click para confirmar' : 'Desactivar usuario'}
              style={{ display: 'flex', alignItems: 'center', gap: confirm ? 5 : 0, padding: confirm ? '4px 10px' : '4px 6px', borderRadius: 6, border: `1px solid ${confirm ? 'rgba(255,71,87,0.5)' : 'rgba(255,71,87,0.2)'}`, background: confirm ? 'rgba(255,71,87,0.15)' : 'rgba(255,71,87,0.06)', color: '#ff4757', fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="6" cy="4" r="2.5"/><path d="M1 11c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round"/><path d="M9 1l3 3M12 1L9 4" strokeLinecap="round"/></svg>
              {confirm && <span>¿Confirmar?</span>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   UserEditForm
   ============================================================ */
function UserEditForm({ user, onSave, onCancel }: {
  user: ManagedUser; onSave: (updated: ManagedUser) => void; onCancel: () => void;
}) {
  const [role,         setRole]         = useState<'admin' | 'member'>(user.User_Role === 'admin' ? 'admin' : 'member');
  const [departmentId, setDepartmentId] = useState<number | null>(user.Department_ID);
  const [teamId,       setTeamId]       = useState<number | null>(user.Team_ID);
  const [isNew,        setIsNew]        = useState<boolean>(user.Is_New);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(false);

  useEffect(() => {
    apiClient.call<Department[]>('getDepartments', {}).then(setDepartments).catch(() => {}).finally(() => setLoadingDepts(false));
  }, []);

  useEffect(() => {
    if (departmentId === null) { setTeams([]); return; }
    setLoadingTeams(true);
    apiClient.call<Team[]>('getTeamsByDepartment', { departmentId }).then(setTeams).catch(() => setTeams([])).finally(() => setLoadingTeams(false));
  }, [departmentId]);

  async function handleSave() {
    setSaving(true); setError(false);
    try {
      const updated = await apiClient.call<ManagedUser>('updateUser', { userId: user.User_ID, role, departmentId, teamId, isNew });
      onSave(updated);
    } catch { setError(true); } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{user.User_Name}</span><div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{user.User_Email}</div></div>
      </div>
      <div>
        <FieldLabel>Rol de acceso</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['member', 'admin'] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${role === r ? (r === 'admin' ? 'rgba(0,200,255,0.4)' : 'rgba(162,155,254,0.4)') : 'var(--border-subtle)'}`, background: role === r ? (r === 'admin' ? 'rgba(0,200,255,0.08)' : 'rgba(162,155,254,0.08)') : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{r === 'admin' ? '🔑' : '👤'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: role === r ? (r === 'admin' ? 'var(--accent)' : '#a29bfe') : 'var(--txt-muted)' }}>{r === 'admin' ? 'Administrador' : 'Member'}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>{r === 'admin' ? 'Acceso completo (TI)' : 'Solo puede enviar solicitudes'}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Departamento</FieldLabel>
        {loadingDepts ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={departmentId ?? ''} onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : null); setTeamId(null); }}>
            <option value="">Sin departamento</option>
            {departments.map((d) => <option key={d.Department_ID} value={d.Department_ID}>{d.Department_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Equipo</FieldLabel>
        {loadingTeams ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={teamId ?? ''} disabled={departmentId === null} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{departmentId === null ? 'Primero selecciona departamento' : 'Sin equipo'}</option>
            {teams.map((t) => <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Estado de registro</FieldLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isNew ? 'rgba(253,203,110,0.35)' : 'var(--border-subtle)'}`, background: isNew ? 'rgba(253,203,110,0.06)' : 'transparent', transition: 'all 0.15s' }}>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} style={{ accentColor: '#fdcb6e', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isNew ? '#fdcb6e' : 'var(--txt-muted)' }}>{isNew ? 'Pendiente de onboarding' : 'Onboarding completado'}</div>
            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Activar para que el usuario vea el selector de área al próximo login</div>
          </div>
        </label>
      </div>
      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', fontSize: 12, color: '#ff4757' }}>Error al guardar. Intenta de nuevo.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className={`cpop-btn-save${saving ? ' cpop-btn-save--disabled' : ''}`}>{saving ? 'Guardando…' : 'GUARDAR'}</button>
      </div>
    </div>
  );
}

/* ============================================================
   PreRegisterForm
   ============================================================ */
function PreRegisterForm({ onSave, onCancel }: {
  onSave: (user: ManagedUser) => void; onCancel: () => void;
}) {
  const [email,        setEmail]        = useState('');
  const [role,         setRole]         = useState<'admin' | 'member'>('member');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [teamId,       setTeamId]       = useState<number | null>(null);
  const [isNew,        setIsNew]        = useState(false);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave    = emailValid && !saving;

  useEffect(() => {
    apiClient.call<Department[]>('getDepartments', {}).then(setDepartments).catch(() => {}).finally(() => setLoadingDepts(false));
  }, []);

  useEffect(() => {
    if (departmentId === null) { setTeams([]); setTeamId(null); return; }
    setLoadingTeams(true);
    apiClient.call<Team[]>('getTeamsByDepartment', { departmentId }).then(setTeams).catch(() => setTeams([])).finally(() => setLoadingTeams(false));
  }, [departmentId]);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      const newUser = await apiClient.call<ManagedUser>('preRegisterUser', { email: email.trim(), role, departmentId, teamId, isNew });
      onSave(newUser);
    } catch (err) { setError((err as Error).message ?? 'Error al pre-registrar.'); } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Pre-registrar usuario</span><div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>El usuario se vinculará al entrar por primera vez con este correo</div></div>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" stroke="var(--accent)" strokeWidth="1.3"/><path d="M7 5v4M7 3.5v.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"/></svg>
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>Cuando este usuario inicie sesión con Microsoft, el sistema lo detectará por su correo y le asignará automáticamente el rol y equipo configurados acá.</p>
      </div>
      <div>
        <FieldLabel>Correo corporativo *</FieldLabel>
        <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@empresa.com" className="cpop-input" />
        {email && !emailValid && <p style={{ fontSize: 10, color: '#ff4757', margin: '4px 0 0', paddingLeft: 2 }}>Ingresá un correo válido.</p>}
      </div>
      <div>
        <FieldLabel>Rol de acceso</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['member', 'admin'] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${role === r ? (r === 'admin' ? 'rgba(0,200,255,0.4)' : 'rgba(162,155,254,0.4)') : 'var(--border-subtle)'}`, background: role === r ? (r === 'admin' ? 'rgba(0,200,255,0.08)' : 'rgba(162,155,254,0.08)') : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{r === 'admin' ? '🔑' : '👤'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: role === r ? (r === 'admin' ? 'var(--accent)' : '#a29bfe') : 'var(--txt-muted)' }}>{r === 'admin' ? 'Administrador' : 'Member'}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>{r === 'admin' ? 'Acceso completo (TI)' : 'Solo puede enviar solicitudes'}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Departamento</FieldLabel>
        {loadingDepts ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={departmentId ?? ''} onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : null); setTeamId(null); }}>
            <option value="">Sin departamento</option>
            {departments.map((d) => <option key={d.Department_ID} value={d.Department_ID}>{d.Department_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Equipo</FieldLabel>
        {loadingTeams ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={teamId ?? ''} disabled={departmentId === null} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{departmentId === null ? 'Primero selecciona departamento' : 'Sin equipo'}</option>
            {teams.map((t) => <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Estado de registro</FieldLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isNew ? 'rgba(253,203,110,0.35)' : 'var(--border-subtle)'}`, background: isNew ? 'rgba(253,203,110,0.06)' : 'transparent', transition: 'all 0.15s' }}>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} style={{ accentColor: '#fdcb6e', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isNew ? '#fdcb6e' : 'var(--txt-muted)' }}>{isNew ? 'Pendiente de onboarding' : 'Onboarding completado'}</div>
            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{isNew ? 'El usuario verá el selector de área al primer login' : 'El usuario entrará directo al sistema con el equipo pre-asignado'}</div>
          </div>
        </label>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(162,155,254,0.06)', border: '1px solid rgba(162,155,254,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(162,155,254,0.1)', border: '1px solid rgba(162,155,254,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⏳</div>
        <div><div style={{ fontSize: 12, fontWeight: 600, color: '#a29bfe' }}>{email.trim() || 'usuario@empresa.com'}</div><div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Pendiente de primer login</div></div>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(162,155,254,0.12)', border: '1px solid rgba(162,155,254,0.3)', color: '#a29bfe', flexShrink: 0 }}>PRE-REG</span>
      </div>
      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', fontSize: 12, color: '#ff4757' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} className={`cpop-btn-save${!canSave ? ' cpop-btn-save--disabled' : ''}`}>{saving ? 'Registrando…' : 'PRE-REGISTRAR'}</button>
      </div>
    </div>
  );
}
