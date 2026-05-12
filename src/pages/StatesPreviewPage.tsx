import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { FullPageLoader } from '@/components/states/FullPageLoader';
import { ForbiddenPage } from '@/components/states/ForbiddenPage';

export function StatesPreviewPage() {
  return (
    <div style={{ display: 'grid', gap: 32, padding: 32 }}>
      <h1>Preview de estados</h1>

      <section>
        <h2>EmptyState</h2>
        <EmptyState
          title="No hay solicitudes"
          description="Cuando se creen nuevas solicitudes, aparecerán en esta sección."
          actionLabel="Crear solicitud"
          onAction={() => alert('Crear solicitud')}
        />
      </section>

      <section>
        <h2>ErrorState</h2>
        <ErrorState
          title="No pudimos cargar las solicitudes"
          description="Revisa tu conexión o intenta nuevamente."
          onRetry={() => alert('Reintentando...')}
        />
      </section>

      <section>
        <h2>FullPageLoader</h2>
        <div style={{ height: 420, overflow: 'hidden', borderRadius: 24 }}>
          <FullPageLoader message="Validando sesión..." />
        </div>
      </section>

      <section>
        <h2>ForbiddenPage</h2>
        <div style={{ height: 420, overflow: 'hidden', borderRadius: 24 }}>
          <ForbiddenPage />
        </div>
      </section>
    </div>
  );
}