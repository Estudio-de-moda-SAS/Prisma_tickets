const BAR_HEIGHTS = [62, 90, 44, 120, 78, 102, 56, 84];

export function StatsSkeleton() {
  return (
    <div className="stats-skeleton" aria-busy="true" aria-label="Cargando estadísticas">

      {/* ── Divider ───────────────────────────────────── */}
      <div className="stats-sk-divider">
        <span className="sk sk-pill" />
        <div className="stats-sk-divider__line" />
      </div>

      {/* ── 5 tarjetas de sprint ──────────────────────── */}
      <div className="scard-grid scard-grid--5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="stats-sk-card stats-sk-scard">
            <div className="sk sk-icon" />
            <div className="stats-sk-stack">
              <span className="sk sk-line sk-line--xs" />
              <span className="sk sk-line sk-line--val" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Panel puntaje (donut) + panel mes ─────────── */}
      <div className="stats-mid-grid">
        <div className="stats-sk-card">
          <div className="stats-sk-head">
            <span className="sk sk-line sk-line--title" />
            <span className="sk sk-badge" />
          </div>
          <div className="stats-sk-donut-row">
            <div className="sk sk-donut" />
            <div className="stats-sk-stack stats-sk-stack--detail">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="sk sk-line sk-line--row" />
              ))}
            </div>
          </div>
        </div>

        <div className="stats-sk-card">
          <div className="stats-sk-head">
            <span className="sk sk-line sk-line--title" />
          </div>
          <div className="stats-sk-month-row">
            <div className="stats-sk-month">
              <span className="sk sk-num" />
              <span className="sk sk-line sk-line--sm" />
            </div>
            <div className="stats-sk-month-divider" />
            <div className="stats-sk-month">
              <span className="sk sk-num" />
              <span className="sk sk-line sk-line--sm" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────── */}
      <div className="stats-sk-divider">
        <span className="sk sk-pill" />
        <div className="stats-sk-divider__line" />
      </div>

      {/* ── 4 KPIs ────────────────────────────────────── */}
      <div className="stats-kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stats-sk-card stats-sk-kpi">
            <span className="sk sk-accent" />
            <span className="sk sk-line sk-line--xs" />
            <span className="sk sk-line sk-line--num" />
            <span className="sk sk-line sk-line--xxs" />
          </div>
        ))}
      </div>

      {/* ── Gráfico de barras + barras horizontales ───── */}
      <div className="stats-mid-grid">
        <div className="stats-sk-card">
          <div className="stats-sk-head">
            <span className="sk sk-line sk-line--title" />
          </div>
          <div className="stats-sk-chart">
            {BAR_HEIGHTS.map((h, i) => (
              <span key={i} className="sk sk-bar" style={{ height: `${h}px` }} />
            ))}
          </div>
        </div>

        <div className="stats-sk-card">
          <div className="stats-sk-head">
            <span className="sk sk-line sk-line--title" />
          </div>
          <div className="stats-sk-rows">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="stats-sk-bar-row">
                <span className="sk sk-line sk-line--label" />
                <span className="sk sk-track" />
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}