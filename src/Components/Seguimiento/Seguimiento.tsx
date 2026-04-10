import * as React from "react";
import "./Seguimiento.css";
import { useGraphServices } from "../../graph/GrapServicesContext";
import type { Log } from "../../Models/Log";
import type { Ticket } from "../../Models/Tickets";           
import { toISODateFlex } from "../../utils/Date";
import HtmlContent from "../HtmlContent/Renderizador";
import Documentar from "../Documentar/Documentar";

type Tab = "seguimiento" | "solucion";
type Mode = "detalle" | "documentar";                        

type Props = {
  role: string;
  ticketId: string | number;
  onVolver: () => void;
  onAdd: () => void;
  defaultTab?: Tab;
  className?: string;
  ticket: Ticket;
  onAddClick: () => void
};

export default function TicketHistorial({role, ticketId, onVolver, defaultTab = "solucion", className, ticket, onAdd, onAddClick}: Props) {
  const [tab, setTab] = React.useState<Tab>(defaultTab);
  const [mode, setMode] = React.useState<Mode>("detalle"); 
  const isPrivileged = role === "Administrador" || role === "Tecnico" || role === "Técnico";

  const { Logs } = useGraphServices();                 

  const [mensajes, setMensajes] = React.useState<Log[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Cargar historial SOLO en modo detalle
  React.useEffect(() => {
    if (mode !== "detalle") return;                              
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await Logs.getAll({
          filter: `fields/Title eq '${String(ticketId).replace(/'/g, "''")}'`,
          orderby: "fields/Created desc",
          top: 2000,
        });
        if (cancel) return;
        const mapped = mapItemsToMensajes(items.items);
        setMensajes(mapped);
      } catch (e: any) {
        if (cancel) return;
        setError(e?.message ?? "No se pudo cargar el historial");
        setMensajes([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    load();
    return () => { cancel = true; };
  }, [ticketId, Logs, mode]);                                     

  // =======================
  // Vista Documentar (solo Documentar + Volver)
  // =======================
  if (mode === "documentar") {
    return (
      <div className={className ?? ""} style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <button type="button" className="btn btn-xs btn-terciary" onClick={() => setMode("detalle")}>
            <span className="th-back-icon" aria-hidden>←</span> Volver al detalle
          </button>
        </div>

        {!ticket && <p style={{ opacity: 0.7, padding: 16 }}>Cargando ticket…</p>}
        {ticket && (
          <Documentar key={`doc-${tab}-${ticketId}`} ticket={ticket} tipo={tab} onDone={() => {onAdd(); onAddClick()}}/>
        )}
      </div>
    );
  }

  const estado = (ticket?.Estadodesolicitud ?? '').toLowerCase().trim();
  const isClosed = estado.includes('Cerrado');

  // =======================
  // Vista Detalle (historial)
  // =======================
  return (
    <div className={className ?? ""} style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 22, fontWeight: 700, marginRight: 12 }}>Agregar :</span>

        {/* Tabs SOLO para admins/técnicos */}
        {isPrivileged && !isClosed && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { setTab("seguimiento"); setMode("documentar"); }}  className={`th-tab ${tab === "seguimiento" ? "th-tab--active" : ""}`}>
              Seguimiento
            </button>
            <button type="button" onClick={() => { setTab("solucion"); setMode("documentar"); onAdd()}} className={`th-tab ${tab === "solucion" ? "th-tab--active" : ""}`}>
              Solución
            </button>
          </div>
        )}

        <div style={{ marginLeft: "auto" }}>
          <button type="button" className="btn btn-terciary btn-xs" onClick={() => {onVolver();}}>
            <span className="th-back-icon" aria-hidden>←</span> Volver
          </button>
        </div>
      </div>

      {/* Caja principal */}
      <div className="th-box">
        {loading && mensajes.length === 0 && (
          <p style={{ opacity: 0.7, padding: 16 }}>Cargando mensajes…</p>
        )}
        {error && <p style={{ color: "#b91c1c", padding: 16 }}>{error}</p>}
        {!loading && !error && mensajes.length === 0 && (
          <p style={{ opacity: 0.7, padding: 16 }}>No hay mensajes.</p>
        )}

        {mensajes.map((m) => (
          <HistRow key={m.Id} m={m} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Subcomponente: una fila del historial (usa la foto por Graph) ---------- */

function HistRow({ m }: { m: Log }) {
  return (
    <div className="th-row">
      <div className="th-left th-left--stack">
        <div className="th-avatar">
            <div className="th-avatar-fallback" aria-hidden>👤</div>
        </div>
        <div className="th-nombre">{m.Actor}</div>
        <div className="th-fecha">{formatDateTime(m.Created ?? "")}</div>
      </div>

      <div className="th-right">
        <div className={`th-bubble th-${tipoToClass(m.Tipo_de_accion)}`}>
          <HtmlContent className="th-text" html={m.Descripcion} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function mapItemsToMensajes(items: any[]): Log[] {
  return (Array.isArray(items) ? items : []).map((it: any) => ({
    Id: String(it.Id),
    Actor: it.Actor ?? "Sistema",
    Created: toISODateFlex(it.Created),
    Title: it.Title ?? undefined,
    Descripcion: it.Descripcion ?? "",
    Tipo_de_accion: it.Tipo_de_accion,
    CorreoActor: it.CorreoActor,
  }));
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function tipoToClass(tipo?: string) {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("solución") || t.includes("solucion")) return "solucion";
  if (t.includes("seguimiento")) return "seguimiento";
  if (t.includes("creacion")) return "creacion";
  if (t.includes("cierre") || t.includes("cerrado")) return "cierre";
  if (t.includes("sistema")) return "sistema";
  return "default";
}
