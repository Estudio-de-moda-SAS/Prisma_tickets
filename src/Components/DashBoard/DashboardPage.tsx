import React from "react";
import DashBoardIcon from "../../assets/dashboard.svg";
import Detalle from "../../assets/Detalle.svg"
import DashboardDetallado from "./DashboardDetallado/DashboardDetallado"
import "./Dashboard.css"
import DashboardResumen from "./DashboardGeneral/DashbordResumen";

type Mode = "resumen" | "dashboard"; // ajusta
type Item = { id: Mode; label: string; icon?: React.ReactNode; active?: boolean };

export default function DashBoardPage() {

  const [mode, setMode] = React.useState<string>("resumen");
  const Items: Item[] = [
    {id: "resumen", label: "Dashboard", active: true, icon: <img src={DashBoardIcon} alt="" className="sb-icon" />}, 
    {id: "dashboard", label: "Detallado", active: true, icon: <img src={Detalle} alt="" className="sb-icon" />}]

  return (
    <section className="msb-layout">
        <div className="msb-track">
          {Items.map((it) => {
            const isActive = mode === it.id;
            return (
              <button key={it.id} type="button" className={`msb-item ${isActive ? "is-active" : ""}`} onClick={() => {setMode(it.id)}} aria-current={isActive ? "page" : undefined}
                aria-pressed={isActive} title={it.label}>
                <div className="msb-item__inner">
                  <div className="msb-icon" aria-hidden="true">{it.icon}</div>
                  <div className="msb-label">{it.label}</div>
                </div>
              </button>
            );
          })}
          <div className="msb-spacer" aria-hidden="true" />
        </div>

        {mode === "resumen" ? <DashboardResumen /> : <DashboardDetallado />}
    </section>
  );
}
