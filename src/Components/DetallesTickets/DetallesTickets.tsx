import * as React from "react";
import type { Ticket } from "../../Models/Tickets";
import "./DetallesTickets.css";

import { ParseDateShow } from "../../utils/Date";
import HtmlContent from "../HtmlContent/Renderizador";
import TicketsAsociados from "./TicketsRelacionados/Relacionados";
import TicketHistorial from "../Seguimiento/Seguimiento";
import AsignarObservador from "./Modals/Observador";
import { useTicketsAttachmentsList } from "../../Funcionalidades/Attachments/Tickets-Attachments/hooks/useActions";
import type { Archivo } from "../../Models/Attachments";



/* ================== Helpers y tipos ================== */
const hasRecatRole = (r?: string) => {
  const v = (r ?? "").trim().toLowerCase();
  return v === "administrador" || v === "tecnico" || v === "técnico";
};

type Props = {
  ticket: Ticket;          
  onVolver: () => void;
  onDocumentar: () => void;
  role: string;
};

/* ================== Componente ================== */
export type Opcion = { value: string; label: string };

function Row({label, children, className = "",}: {label: string; children: React.ReactNode; className?: string;}) {
  return (
    <div className={`cd-row ${className}`}>
      <label className="cd-label">{label}</label>
      <div className="cd-value">{children}</div>
    </div>
  );
}

export function CaseDetail({ ticket, onVolver, role, onDocumentar }: Props) {
  const ticketAttachment = useTicketsAttachmentsList();
  // === Estado local del ticket seleccionado
  const [selected, setSelected] = React.useState<Ticket>(ticket);
  const [attachments, setAttachments] = React.useState<Archivo[]>([]);
  React.useEffect(() => {
    // al cambiar de ticket, oculta paneles
    setShowSeg(false);
    setShowObservador(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.ID]);

  React.useEffect(() => {
    ticketAttachment.loadAttachments(ticket?.ID ?? "").then((files) => {
      setAttachments(files);
    });
  }, [ticket?.ID]);

  const [showSeg, setShowSeg] = React.useState(false);
  const [showObservador, setShowObservador] = React.useState(false);
  const [showBotton, setShowBotton] = React.useState(true)

  const canRecategorizar = hasRecatRole?.(role) ?? false;

  React.useEffect(() => {
    setSelected(ticket);
  }, [ticket]);

  // === Derivados (memoizados)
  const categoria = React.useMemo(
    () =>
      [selected?.Categoria, selected?.SubCategoria,]
        .filter(Boolean)
        .join(" > "),
    [selected?.Categoria, selected?.SubCategoria,]
  );

  if (!selected) return <div>Ticket no encontrado</div>;

  return (
    <section className="case-detail">
      {/* ===== Header ===== */}
      <header className="cd-header">
        <h2 className="cd-title">Caso – ID {selected.ID} </h2>
        <span className={`cd-badge ${selected.Estadodesolicitud === "Cerrado" ? "is-closed" : selected.Estadodesolicitud === "En Atención" ? "is-open" : "is-out"}`} title={selected.Estadodesolicitud ?? ""}>
          {selected.Estadodesolicitud}
        </span>
        <button type="button" className="btn-primary" onClick={onVolver}>← Volver</button>
      </header>

      {/* ===== GRID ===== */}
      <div className="cd-grid">
        {/* Fila 1 */}
        <Row className="pos-apertura" label="Fecha de Apertura">
          <Trunc text={ParseDateShow(selected.FechaApertura ?? "") ?? "—"} />
        </Row>

        <Row className="pos-solucion" label="Fecha de Solución">
          <Trunc text={ParseDateShow(selected.TiempoSolucion ?? "") ?? "—"} />
        </Row>

        <Row className="pos-fuente" label="Fuente solicitante">
          <Trunc text={selected.Fuente} lines={1} />
        </Row>

        {/* Fila 2 */}
        <Row className="pos-categoria" label="Categoría">
          {canRecategorizar ? (
            <button type="button" className="as-text">
              <Trunc text={categoria || "-----------"} lines={1}/>
            </button>
          ) : (
            <Trunc text={categoria || "-----------"} lines={1} />
          )}
        </Row>

        <Row className="pos-ans" label="ANS">
          <Trunc text={selected.ANS ?? "N/A"} lines={1} />
        </Row>

        {/* Fila 3: personas */}
        <div className="cd-people pos-people">
          <div className="cd-people-item">
            <div className="cd-people-label">Solicitante</div>
            <div className="cd-people-value">
              <Trunc text={selected.Solicitante} lines={1} maxLenght={30}/>
            </div>
          </div>

          <div className="cd-people-item">
            <div className="cd-people-label">Observador</div>
            <div className="cd-people-value">
              {canRecategorizar ? (
                <button type="button" className="as-text" onClick={() => setShowObservador(true)}>
                  <Trunc text={selected.Observador || "–-----------"} lines={1} maxLenght={30}/>
                </button>
              ) : (
                selected.Observador || "-----------"
              )}
            </div>
          </div>

          <div className="cd-people-item">
            <div className="cd-people-label">Resolutor</div>
            <div className="cd-people-value">
              {canRecategorizar ? (
                <button type="button" className="as-text">
                  <Trunc text={selected.Nombreresolutor || "-----------"} lines={1} maxLenght={30}/>
                </button>
              ) : (
                <Trunc text={selected.Nombreresolutor || "–"} lines={1} />
              )}
            </div>
          </div>
        </div>

        {/* Fila 4: Título */}
        <Row className="pos-titulo" label="Título">
          {/* 2 líneas en móvil para mejor legibilidad */}
          {selected.Title}
        </Row>

        {/* Fila 5: Descripción (HTML truncada en móvil vía .html-trunc) */}
        <Row className="pos-descr" label="Descripción">
          <div className="html-trunc">
            <HtmlContent html={selected.Descripcion ?? ""} />
          </div>
        </Row>
      </div>

      {/* ===== Adjuntos ===== */}
      {Array.isArray(attachments) && (
        <section className="cd-attachments">
          <h3 className="cd-subtitle">Adjuntos ({attachments.length})</h3>


          {(attachments.length === 0 ? (
            <p className="cd-empty">Sin adjuntos.</p>
          ) : (
            <ul className="cd-files" role="list">
              {attachments.map((r: Archivo, i: number) => {
                const name = r?.name ?? `Archivo ${i + 1}`;
                const href = r?.webUrl ?? "";
                if (!href) return null;
                return (
                  <li key={`${href}-${i}`} className="cd-file">
                    <a href={href} target="_blank" rel="noopener noreferrer" className="cd-file-link" title={name}>
                      <span className={`cd-file-ico ext-${name}`} aria-hidden />
                      <Trunc text={name} lines={1} />
                    </a>
                  </li>
                );
              })}
            </ul>
          ))}
        </section>
      )}


      {/* ===== Tickets relacionados ===== */}
      <div className="seccion">
        <TicketsAsociados key={String(selected.ID)} ticket={selected} onSelect={(t: Ticket) => {setShowSeg(false); setSelected(t)}}/>
      </div>

      {/* ===== Botón de Seguimiento ===== */}
      {showBotton ?
        <div>
          <button type="button" className="btn btn-secondary-final" onClick={() => {setShowSeg((v) => !v); setShowBotton(false)}} >
            {showSeg ? "Ocultar seguimiento" : "Seguimiento ticket"}
          </button>
        </div> : null
      }
      

      {/* ===== Historial (toggle) ===== */}
      {showSeg && (
        <div className="seccion">
          <TicketHistorial role={role ?? "Usuario"} onVolver={() => setShowSeg(false)} ticketId={selected.ID!} ticket={selected} onAdd={() => setShowBotton(true)} onAddClick={onDocumentar}/>
        </div>
      )}

      {/* ===== Modal: Observador ===== */}
      {showObservador && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Asignar observador">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Asignar observador a ticket #{selected.ID}</h3>
              <button type="button" className="modal-close" onClick={() => setShowObservador(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <AsignarObservador ticket={selected} onDone={() => {onDocumentar();}}/>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type TruncProps = {text?: string | null; lines?: number; className?: string; maxLenght?: number};

export default function Trunc({ text, lines = 1, className = "", maxLenght = 12}: TruncProps) {
  const safe = (text ?? "—").toString();
  return (
    <span className={`ttip trunc ${className}`} data-full={safe} style={{ ["--lines" as any]: String(lines) }} aria-label={safe}>
      {safe.length <= maxLenght ? safe : safe.slice(0, maxLenght) + "..."}
    </span>
  );
}