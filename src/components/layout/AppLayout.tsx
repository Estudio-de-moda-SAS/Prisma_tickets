// src/components/layout/AppLayout.tsx

import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useBoardTheme } from '@/store/useBoardTheme';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';

const TITULOS: Record<string, string> = {
  '/home':         'Home',
  '/new':          'Nueva Solicitud',
  '/requests':     'Requests',
  '/my-requests':  'Mis Solicitudes',
  '/stats':        'Estadísticas',
};

export function AppLayout() {
  useBoardTheme();
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const titulo       = TITULOS[pathname] ?? 'Prisma Tickets';

  const { data: currentUser, isLoading } = useCurrentUser();

  // Redirigir en effect, no durante el render
  React.useEffect(() => {
    if (!isLoading && currentUser?.Is_New) {
      navigate('/onboarding', { replace: true });
    }
  }, [isLoading, currentUser, navigate]);

  return (
    <>
      <div className="app-layout">
        <Sidebar />
        <div className="app-layout__main">
          <Topbar titulo={titulo} />
          <main className="app-layout__content">
            <Outlet />
          </main>
        </div>
      </div>
      <div id="portal-root" />
    </>
  );
}