import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useBoardTheme } from '@/store/useBoardTheme';

const TITULOS: Record<string, string> = {
  '/new':            'Nueva Solicitud',
  '/requests':         'Requests',
  '/my-requests':  'Mis Solicitudes',
  '/stats':            'Estadísticas',
};

export function AppLayout() {
  useBoardTheme();
  const { pathname } = useLocation();
  const titulo = TITULOS[pathname] ?? 'Prisma Tickets';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-layout__main">
        <Topbar titulo={titulo} />
        <main className="app-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}