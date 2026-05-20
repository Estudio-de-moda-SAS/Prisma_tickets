// src/pages/OnboardingPage.tsx

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import { useAuth } from '@/auth/AuthProvider';

// ─── Tipos locales ────────────────────────────────────────────────────────────

type Department = {
  Department_ID:   number;
  Department_Name: string;
  Department_Code: string;
};

type Team = {
  Team_ID:       number;
  Team_Name:     string;
  Team_Code:     string;
  Department_ID: number;
};

// Código del departamento TI — no se muestra como opción
const TI_CODE = 'ti';

// ─── Componente ───────────────────────────────────────────────────────────────

export function OnboardingPage() {
  const navigate             = useNavigate();
  const { dbUser, refreshDbUser } = useAuth();

  const [departments,   setDepartments]   = React.useState<Department[]>([]);
  const [teams,         setTeams]         = React.useState<Team[]>([]);
  const [departmentId,  setDepartmentId]  = React.useState<number | null>(null);
  const [teamId,        setTeamId]        = React.useState<number | null>(null);
  const [loadingDepts,  setLoadingDepts]  = React.useState(true);
  const [loadingTeams,  setLoadingTeams]  = React.useState(false);
  const [saving,        setSaving]        = React.useState(false);
  const [error,         setError]         = React.useState(false);

  // Si ya completó el onboarding, redirigir
  React.useEffect(() => {
    if (dbUser && !dbUser.Is_New) {
      navigate('/', { replace: true });
    }
  }, [dbUser, navigate]);

  // Cargar departamentos al montar (excluyendo TI)
  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.call<Department[]>('getDepartments', {});
        // Filtrar TI — los registra el equipo de TI directamente en la DB
        setDepartments(data.filter((d) => d.Department_Code !== TI_CODE));
      } catch {
        // Si falla, mostrar lista vacía; el usuario puede reintentar
      } finally {
        setLoadingDepts(false);
      }
    })();
  }, []);

  // Cargar equipos al cambiar departamento
  React.useEffect(() => {
    setTeamId(null);
    setTeams([]);

    if (departmentId === null) return;

    setLoadingTeams(true);
    apiClient
      .call<Team[]>('getTeamsByDepartment', { departmentId })
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [departmentId]);

  const canConfirm = departmentId !== null && teamId !== null && !saving;

  async function handleConfirm() {
    if (!canConfirm || !dbUser) return;

    setSaving(true);
    setError(false);

    try {
      if (!config.USE_MOCK) {
        await apiClient.call('completeOnboarding', {
          userId:       dbUser.User_ID,
          departmentId: departmentId!,
          teamId:       teamId!,
        });
      }

      // Actualizar dbUser en el contexto de auth para que el guard lo vea
      await refreshDbUser();

      navigate('/', { replace: true });
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  // Mientras no sabemos si el usuario ya completó onboarding
  if (!dbUser) {
    return (
      <div className="ob-page">
        <div className="ob-card">
          <p style={{ color: 'var(--txt-muted)', fontSize: 14 }}>Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-page">
      <div className="ob-card">

        {/* ── Logo ── */}
        <div className="ob-card__logo">
          <img src="/favicon.svg" width="32" height="32" alt="Prisma" className="ob-card__logo-icon" />
          <div className="ob-card__logo-text">
            <span className="ob-card__logo-prisma">Prisma</span>
            <span className="ob-card__logo-sub">Support System</span>
          </div>
        </div>

        {/* ── Header ── */}
        <div className="ob-card__header">
          <h1 className="ob-card__title">
            Bienvenido, {dbUser.User_Name.split(' ')[0]} 👋
          </h1>
          <p className="ob-card__subtitle">
            Antes de continuar necesitamos saber a qué área perteneces dentro de la empresa.
            Esto nos ayuda a mostrarte la información correcta.
          </p>
        </div>

        {/* ── Departamento ── */}
        <div className="ob-field">
          <label className="ob-field__label" htmlFor="select-dept">Departamento</label>
          {loadingDepts ? (
            <div className="ob-field__skeleton" />
          ) : (
            <select
              id="select-dept"
              className="ob-field__select"
              value={departmentId ?? ''}
              onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Selecciona tu departamento…</option>
              {departments.map((d) => (
                <option key={d.Department_ID} value={d.Department_ID}>
                  {d.Department_Name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Equipo ── */}
        <div className={`ob-field ${departmentId === null ? 'ob-field--disabled' : ''}`}>
          <label className="ob-field__label" htmlFor="select-team">Equipo</label>
          {loadingTeams ? (
            <div className="ob-field__skeleton" />
          ) : (
            <select
              id="select-team"
              className="ob-field__select"
              value={teamId ?? ''}
              disabled={departmentId === null}
              onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">
                {departmentId === null ? 'Primero selecciona un departamento' : 'Selecciona tu equipo…'}
              </option>
              {teams.map((t) => (
                <option key={t.Team_ID} value={t.Team_ID}>
                  {t.Team_Name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Nota de contacto ── */}
        <p className="ob-card__note">
          ¿No encuentras tu equipo en la lista? Escríbenos a{' '}
          <a href="mailto:soporte@estudiodemoda.com" className="ob-card__note-link">
            soporte@estudiodemoda.com
          </a>{' '}
          y lo agregamos.
        </p>

        {/* ── Error ── */}
        {error && (
          <p className="ob-card__error">
            Ocurrió un error al guardar. Intenta de nuevo.
          </p>
        )}

        {/* ── Botón ── */}
        <button
          className="ob-card__btn"
          onClick={handleConfirm}
          disabled={!canConfirm}
        >
          {saving ? 'Guardando…' : 'Confirmar y continuar →'}
        </button>

      </div>
    </div>
  );
}