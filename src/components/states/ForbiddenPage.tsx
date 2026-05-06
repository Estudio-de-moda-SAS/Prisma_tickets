import { Link } from 'react-router-dom';
import './ForbiddenPage.css';

export function ForbiddenPage() {
  return (
    <main className="forbidden-page">
      <section className="forbidden-page__card">
        <div className="forbidden-page__brand">
          <span className="forbidden-page__pulse" />
          ACCESO CONTROLADO
        </div>

        <div className="forbidden-page__orb" aria-hidden="true">
          <span className="forbidden-page__lock">🔒</span>
        </div>

        <div className="forbidden-page__content">
          <h1>Acceso restringido</h1>
          <p>
            Tu perfil no cuenta con permisos para visualizar esta sección.
          </p>
        </div>

        <div className="forbidden-page__actions">
          <Link className="forbidden-page__button forbidden-page__button--primary" to="/">
            Volver al inicio
          </Link>

          <button
            className="forbidden-page__button forbidden-page__button--ghost"
            type="button"
            onClick={() => window.history.back()}
          >
            Regresar
          </button>
        </div>
      </section>
    </main>
  );
}