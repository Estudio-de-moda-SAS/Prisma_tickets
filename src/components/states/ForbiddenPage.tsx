import { Link } from 'react-router-dom';
import './ForbiddenPage.css';

export function ForbiddenPage() {
  return (
    <main className="forbidden-page">
      <div className="forbidden-page__ambient" aria-hidden="true">
        <span className="forbidden-page__glow forbidden-page__glow--one" />
        <span className="forbidden-page__glow forbidden-page__glow--two" />
        <span className="forbidden-page__grid" />
        <span className="forbidden-page__line forbidden-page__line--one" />
        <span className="forbidden-page__line forbidden-page__line--two" />
      </div>

      <section className="forbidden-page__experience">
        <div className="forbidden-page__lock-wrap">
          <div className="forbidden-page__lock-ring" />

          <div className="forbidden-page__lock-core">
            <img
              src="/favicon.svg"
              width="42"
              height="42"
              alt="Prisma"
            />
          </div>
        </div>

        <div className="forbidden-page__content">
          <span className="forbidden-page__eyebrow">
            Acceso controlado
          </span>

          <h1>
            Acceso <span>restringido</span>
          </h1>

          <p>
            Tu perfil actual no cuenta con permisos suficientes
            para visualizar este módulo o realizar esta acción.
          </p>
        </div>

        <Link className="forbidden-page__button" to="/">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}