// src/pages/OnboardingPage.tsx

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import { useDepartments } from '@/features/requests/hooks/useDepartments';
import { useTeams } from '@/features/requests/hooks/useTeams';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import type { UserProfile } from '@/types/commons';

export function OnboardingPage() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading } = useCurrentUser();

  const [departmentId, setDepartmentId] = React.useState<number | null>(null);
  const [teamId,       setTeamId]       = React.useState<number | null>(null);

  const { data: departments = [], isLoading: loadingDepts } = useDepartments();
  const { data: teams = [],       isLoading: loadingTeams } = useTeams(departmentId);

  React.useEffect(() => {
    if (!isLoading && currentUser && !currentUser.Is_New) {
      navigate('/', { replace: true });
    }
  }, [currentUser, isLoading, navigate]);

  React.useEffect(() => { setTeamId(null); }, [departmentId]);

  const mutation = useMutation({
    mutationFn: (vars: { userId: number; departmentId: number; teamId: number }) =>
      config.USE_MOCK
        ? Promise.resolve({ ...currentUser!, Department_ID: vars.departmentId, Team_ID: vars.teamId, Is_New: false })
        : apiClient.call<UserProfile>('completeOnboarding', vars),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<UserProfile>(['currentUser', currentUser?.User_ID], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      navigate('/', { replace: true });
    },
  });

  const canConfirm = departmentId !== null && teamId !== null && !mutation.isPending;

  function handleConfirm() {
    if (!canConfirm || !currentUser) return;
    mutation.mutate({ userId: currentUser.User_ID, departmentId: departmentId!, teamId: teamId! });
  }

  if (isLoading) {
    return (
      <div className="ob-page">
        <div className="ob-card">
          <p style={{ color: 'var(--txt-muted)', fontSize: 14 }}>Cargando...</p>
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
            Bienvenido, {currentUser?.User_Name.split(' ')[0]} 👋
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
              onChange={e => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Selecciona tu departamento…</option>
              {departments.map(d => (
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
          {loadingTeams && departmentId !== null ? (
            <div className="ob-field__skeleton" />
          ) : (
            <select
              id="select-team"
              className="ob-field__select"
              value={teamId ?? ''}
              disabled={departmentId === null}
              onChange={e => setTeamId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">
                {departmentId === null ? 'Primero selecciona un departamento' : 'Selecciona tu equipo…'}
              </option>
              {teams.map(t => (
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
          <a href="mailto:CORREO_AQUI" className="ob-card__note-link">
            CORREO_AQUI
          </a>{' '}
          y lo agregamos.
        </p>

        {/* ── Error ── */}
        {mutation.isError && (
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
          {mutation.isPending ? 'Guardando…' : 'Confirmar y continuar →'}
        </button>

      </div>
    </div>
  );
}