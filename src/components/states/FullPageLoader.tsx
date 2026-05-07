import './FullPageLoader.css';

type FullPageLoaderProps = {
  message?: string;
  description?: string;
  brand?: string;
};

export function FullPageLoader({
  description = 'Estamos preparando tu espacio de trabajo de forma segura.',
  brand = 'PRISMA',
}: FullPageLoaderProps) {
  return (
    <main className="fullpage-loader" aria-live="polite" aria-busy="true">
      <div className="fullpage-loader__ambient" aria-hidden="true">
        <span className="fullpage-loader__glow fullpage-loader__glow--one" />
        <span className="fullpage-loader__glow fullpage-loader__glow--two" />
        <span className="fullpage-loader__orbit fullpage-loader__orbit--one" />
        <span className="fullpage-loader__orbit fullpage-loader__orbit--two" />
        <span className="fullpage-loader__wave" />
        <span className="fullpage-loader__particle fullpage-loader__particle--one" />
        <span className="fullpage-loader__particle fullpage-loader__particle--two" />
        <span className="fullpage-loader__particle fullpage-loader__particle--three" />
      </div>

      <section className="fullpage-loader__experience">
        <div className="fullpage-loader__logo" aria-hidden="true">
          <img
            className="fullpage-loader__logo-mark"
            src="/favicon.svg"
            width="84"
            height="84"
            alt=""
          />
        </div>

        <p className="fullpage-loader__brand">{brand}</p>

        <div className="fullpage-loader__content">
         

          <p>{description}</p>
        </div>

        <div className="fullpage-loader__progress" aria-hidden="true">
          <span />
        </div>

        <div className="fullpage-loader__features" aria-hidden="true">
          <div>
            <span>◇</span>
            <strong>Seguridad</strong>
          </div>

          <div>
            <span>✦</span>
            <strong>Rendimiento</strong>
          </div>

          <div>
            <span>▱</span>
            <strong>Experiencia</strong>
          </div>
        </div>
      </section>
    </main>
  );
}