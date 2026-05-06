import './FullPageLoader.css';

type FullPageLoaderProps = {
  message?: string;
  description?: string;
};

export function FullPageLoader({
  message = 'Validando sesión',
  description = 'Estamos preparando tu espacio de trabajo de forma segura.',
}: FullPageLoaderProps) {
  return (
    <main className="fullpage-loader" aria-live="polite" aria-busy="true">
      <section className="fullpage-loader__card">
        <div className="fullpage-loader__brand">
          <span className="fullpage-loader__pulse" />
          <span>PRISMA</span>
        </div>

        <div className="fullpage-loader__orb">
          <div className="fullpage-loader__spinner" />
        </div>

        <div className="fullpage-loader__content">
          <h1>
            {message}
            <span className="fullpage-loader__dots" aria-hidden="true" />
          </h1>
          <p>{description}</p>
        </div>

        <div className="fullpage-loader__progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}