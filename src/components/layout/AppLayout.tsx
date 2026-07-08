// src/components/layout/AppLayout.tsx

import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useBoardTheme } from '@/store/useBoardTheme';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { AnnouncementBanner } from './AnnouncementBanner';
import { AnnouncementModal }  from './AnnouncementModal';
import { VersionUpdateBanner } from './VersionUpdateBanner';
import { FloatingTimer } from './FloatingTimer';
import { NotificationPermissionPrompt } from './NotificationPermissionPrompt';

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

  const isFullBleed = /^\/tasks\//.test(pathname);

  const { data: currentUser, isLoading } = useCurrentUser();

  React.useEffect(() => {
    if (!isLoading && currentUser?.Is_New) {
      navigate('/onboarding', { replace: true });
    }
  }, [isLoading, currentUser, navigate]);

  return (
    <>
  <NotificationPermissionPrompt />
      <div className="app-layout">
        <Sidebar />
        <div className="app-layout__main">
          <Topbar titulo={titulo} />
          <AnnouncementBanner />
          <main className={`app-layout__content${isFullBleed ? ' app-layout__content--full-bleed' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
      <div id="portal-root" /> <AnnouncementModal />
      <VersionUpdateBanner />
      <FloatingTimer />
    </>
  );
}