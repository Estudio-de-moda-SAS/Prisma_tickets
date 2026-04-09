import React from "react";
import { useDashboard } from "../../../Funcionalidades/Dashboard";
import { useGraphServices } from "../../../graph/GrapServicesContext";
import "./DashboardResumen.css";
import type { DailyPoint, Fuente, TopCategoria } from "../../../Models/Dashboard";
import { toISODateFlex } from "../../../utils/Date";

// ===== util: formatea "2,1 mil" / "0,2 mil" =====
function formatShort(n: number) {
  if (n >= 1000) {
    const k = Math.round((n / 1000) * 10) / 10; // 1 decimal
    return `${k.toLocaleString("es-CO")} mil`;
  }
  return n.toLocaleString("es-CO");
}

function shorten(s: string, max = 5) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

type Props = { data: Fuente[] };

const COLORS: Record<string, string> = {
  "Aplicativo": "#ffffff",
  "Correo": "#1e64b7",
  "Disponibilidad": "#56a6ff",
  "En persona": "#ef4444",
  "Llamada": "#3b82f6",
  "Teams": "#7c3aed",
  "WhatsApp": "#22c55e",
};

export default function DashboardResumen() {
  const { Tickets } = useGraphServices() 
  const { max, min, totalCasos, totalEnCurso, totalFinalizados, totalFueraTiempo, porcentajeCumplimiento, topSolicitante, range, totalCategorias, resolutores, Fuentes, casosPorDia, loading, 
    obtenerTotal, obtenerTop5, setRange, obtenerTotalCategoria, obtenerTotalResolutor, obtenerFuentes,obtenerCasosPorDia,} = useDashboard(Tickets);

  // carga inicial
  React.useEffect(() => {
    obtenerTotal("resumen");
    obtenerTop5("resumen");
    obtenerTotalCategoria("resumen");
    obtenerTotalResolutor("resumen");
    obtenerFuentes("resumen");
    obtenerCasosPorDia("resumen", true, );
  }, [range.from, range.to]); 

  if (loading) {
    return (
      <section className="dash">
        <div className="dash-loading" role="status" aria-live="polite">Cargando…</div>
      </section>
    );
  }

  return (
    <section className="dash">
      {/* Columna izquierda */}
      <aside className="dash-left">
        <div className="kpi-total">
          <Donut value={1} size={180} stroke={10} ring="#22c55e" />
          <div className="kpi-total__text">
            <div className="big">{totalCasos}</div>
            <div className="sub">Casos en total</div>
          </div>
        </div>

        {/* Barras dinámicas */}
        <StatusBars total={totalCasos} at={totalFinalizados} late={totalFueraTiempo} inprog={totalEnCurso} />

        <div className="panel">
          <h4>Porcentaje de cumplimiento</h4>
          <div className="gauge">
            <Gauge value={porcentajeCumplimiento} />
            <div className="gauge__labels">
              <span>0,00%</span>
              <span>100,00%</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <h4>Top 5 solicitante</h4>
          <TotalBarras data={topSolicitante} total={totalCasos} />
        </div>
      </aside>

      {/* Columna central */}
      <main className="dash-center">
        <header className="center-head">
          <div className="dash-filters">
            <input className="date" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} max={toISODateFlex(max)} min={toISODateFlex(min)}/>
            <input className="date" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} max={toISODateFlex(max)} min={toISODateFlex(min)}/>
          </div>
        </header>
        <h4 className="cats__title">Top 5 Categorias</h4>  
        <CategoriasChart data={totalCategorias} maxBars={5}/>

        <section className="resolutores">
          <h4>Resolutores</h4>
          <ul className="res-list">
            {resolutores.map((r) => (
              <li key={r.nombre} className="res-item">
                <div className="res-left">
                  <SmallDonut value={porcentajeCumplimiento} />
                  <div className="res-meta">
                    <div className="res-name">{r.nombre}</div>
                    <div className="res-sub">0.00%</div>
                  </div>
                </div>
                <div className="res-right">
                  <div className="res-total">{totalCasos}</div>
                  <div className="res-caption">Total Casos</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Columna derecha */}
      <aside className="dash-right">
        <FuentesSolicitud data={Fuentes} />
        
        <section className="panel">
          <h4>Casos diarios</h4>
          <CasosPorDiaChart data={casosPorDia} height={200} maxBars={5}/>
        </section>
      </aside>
    </section>
  );
}

/* ====== Mini componentes SVG ====== */
function Donut({value, size = 160, stroke = 12, ring = "#0ea5e9",}: {
  value: number; 
  size?: number;
  stroke?: number;
  ring?: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  const R = (size - stroke) / 2;
  const C = 2 * Math.PI * R;
  const off = C * (1 - v);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut">
      <circle cx={size / 2} cy={size / 2} r={R} stroke="#1f2937" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={R} stroke={ring} strokeWidth={stroke} fill="none" strokeDasharray={C} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`}/>
    </svg>
  );
}

function SmallDonut({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const size = 68,
  stroke = 5;
  const R = (size - stroke) / 2;
  const C = 2 * Math.PI * R;
  const off = C * (1 - v);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut small">
      <circle cx={size / 2} cy={size / 2} r={R} stroke="#374151" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={R} stroke="#ef4444" strokeWidth={stroke} fill="none" strokeDasharray={C} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`}/>
      <text x="50%" y="50%" dy="4" textAnchor="middle" className="donut-txt">
        {(v * 100).toFixed(2)}%
      </text>
    </svg>
  );
}

function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const size = 200,
  stroke = 20;
  const R = (size - stroke) / 2;
  const C = Math.PI * R;
  const off = C * (1 - v);
  return (
    <svg width={size} height={size / 2} viewBox={`0 0 ${size} ${size / 2}`} className="gauge-svg">
      <path d={`M ${stroke / 2} ${size / 2} A ${R} ${R} 0 0 1 ${size - stroke / 2} ${size / 2}`} stroke="#374151" strokeWidth={stroke} fill="none"/>
      <path d={`M ${stroke / 2} ${size / 2} A ${R} ${R} 0 0 1 ${size - stroke / 2} ${size / 2}`} stroke="#22c55e" strokeWidth={stroke} fill="none" strokeDasharray={C} strokeDashoffset={off}/>
      <text x="50%" y="70%" textAnchor="middle" className="gauge-txt">
        {(v * 100).toFixed(2)}%
      </text>
    </svg>
  );
}

const fallbackColor = "#6b7280"; // si aparece una fuente desconocida

function FuentesSolicitud({ data }: Props) {
  const total = React.useMemo(() => data.reduce((s, d) => s + (d.total || 0), 0), [data]);

  if (!data?.length || total === 0) {
    return (
      <section className="fs">
        <h4 className="fs-title">Fuentes de solicitud</h4>
        <div className="fs-hint">Sin datos para el período seleccionado</div>
      </section>
    );
  }

  const ordered = [...data].sort((a, b) => {
    const ai = Object.keys(COLORS).indexOf(a.label);
    const bi = Object.keys(COLORS).indexOf(b.label);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return b.total - a.total;
  });

  return (
    <section className="fs">
      <h4 className="fs-title">Fuentes de solicitud</h4>

      {/* Leyenda */}
      <ul className="fs-legend" role="list">
        {ordered.map((f) => (
          <li key={f.label} className="fs-legend__item" title={f.label}>
            <span
              className="fs-legend__dot"
              style={{ backgroundColor: COLORS[f.label] ?? fallbackColor }}
              aria-hidden
            />
            <span className="fs-legend__label">{f.label}</span>
          </li>
        ))}
      </ul>

      {/* Barra apilada */}
      <div className="fs-stack" aria-label="Distribución por fuente">
        {ordered.map((f) => {
          const pct = total > 0 ? (f.total / total) * 100 : 0;
          return (
            <div
              key={f.label}
              className="fs-stack__seg"
              style={{ width: `${pct}%`, backgroundColor: COLORS[f.label] ?? fallbackColor }}
              title={`${f.label}: ${f.total.toLocaleString("es-CO")} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Totales por fuente */}
      <div className="fs-grid">
        {ordered.map((f) => (
          <div key={f.label} className="fs-card" title={f.label}>
            <div className="fs-card__value">{f.total.toLocaleString("es-CO")}</div>
            <div className="fs-card__label">{f.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBars({total, at, late, inprog,}: {total: number; at: number; late: number; inprog: number;}) {
  const pct = (v: number) => (total > 0 ? Math.max(0, Math.min(100, (v / total) * 100)) : 0);

  const rows = [
    { color: "#10b981", label: "A tiempo", value: at, width: pct(at) },
    { color: "#ef4444", label: "Vencidos", value: late, width: pct(late) },
    { color: "#06b6d4", label: "En curso", value: inprog, width: pct(inprog) },
  ];

  return (
    <ul className="bullets bullets--barred">
      {rows.map((r) => (
        <li key={r.label} className="bullet-row">
          <span className="bullet-dot" style={{ backgroundColor: r.color }} />
          <span className="bullet-label">{r.label}</span>
          <div className="bullet-bar">
            <div className="bullet-fill" style={{ width: `${r.width}%`, backgroundColor: r.color }} />
          </div>
          <span className="bullet-val">{formatShort(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// Barras Top 5 categorías
function TotalBarras({data,}: {data: TopCategoria[]; total: number;}) {
  if (!data?.length) {
    return <div className="hint">Sin datos para el período seleccionado</div>;
  }

  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <ul className="topcats">
      {data.map((c) => {
        const w = Math.max(4, Math.round((c.total / max) * 100)); // ancho 4–100%
        return (
          <li key={c.nombre} className="topcats-row">
            <div className="topcats-left">
              <span className="topcats-name" title={c.nombre}>{c.nombre.slice(0, 17)}...</span>
            </div>
            <div className="topcats-bar">
              <div className="topcats-fill" style={{ width: `${w}%` }} />
            </div>
            <div className="topcats-right">
              <span className="topcats-count" title={`${c.total} casos`}>
                {c.total.toLocaleString("es-CO")}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CategoriasChart({data, maxBars = 18, height = 160,}: {data: TopCategoria[]; maxBars?: number; height?: number;}) {
  const items = (data ?? []).slice(0, maxBars);
  const max = Math.max(...items.map((d) => d.total), 1);

  return (
    <div className="cats">
      <div className="cats__plot" style={{ height }}>
        <div className="cats__bars" role="list">
          {items.map((d) => {
            const h = Math.max(2, Math.round((d.total / max) * (height - 36))); // deja espacio para label superior
            return (
              <div key={d.nombre} className="cats__col" role="listitem">
                <div className="cats__val" aria-hidden="true">
                  {d.total.toLocaleString("es-CO")}
                </div>
                <div className="cats__bar" style={{ height: h }} title={d.nombre}/>
                <div className="cats__lbl" title={d.nombre}>
                  {shorten(d.nombre)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="cats__baseline" />
      </div>
    </div>
  );
}

function CasosPorDiaChart({data, maxBars = 18, height = 160,}: {data: DailyPoint[]; maxBars?: number; height?: number;}) {
  const items = (data ?? []).slice(0, maxBars);
  const max = Math.max(...items.map((d) => d.total), 1);

  return (
    <div className="cats">
      <div className="cats__plot" style={{ height }}>
        <div className="cats__bars" role="list">
          {items.map((d) => {
            const h = Math.max(2, Math.round((d.total / max) * (height - 36))); // deja espacio para label superior
            return (
              <div key={d.fecha} className="cats__col" role="listitem">
                <div className="cats__val" aria-hidden="true">
                  {d.total.toLocaleString("es-CO")}
                </div>
                <div className="cats__bar" style={{ height: h }} title={d.fecha}/>
                <div className="cats__lbl" title={d.fecha}>
                  {shorten(d.fecha)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="cats__baseline" />
      </div>
    </div>
  );
}
