// TicketsAsociados.tsx
import * as React from "react";
import type { Ticket } from "../../../Models/Tickets";
import "./TicketsAsociados.css";
import { useAuth } from "../../../Auth/authContext";
import { useUserRole } from "../../../Funcionalidades/Usuarios";
import RelacionadorInline from "./RelacionadorTickets/Relacionadosr";
import { useTicketsRelacionados } from "../../../Funcionalidades/Tickets/hooks/Queries/useTicketsRelacionados";


type Props = {
  title?: string;
  ticket: Ticket;                        
  emptyChildrenText?: string;
  onSelect?: (t: Ticket) => void;         
  buildHref?: (id: number | string) => string;
  onRelateConfirm?: (payload: { mode: "padre" | "hijo" | "masiva"; selected: Ticket[] }) => Promise<void> | void;
};

export default function TicketsAsociados({title = "Tickets Asociados", ticket, emptyChildrenText = "No es hijo de ningun caso", onSelect, buildHref}: Props) {
  const {account} = useAuth()
  const userRole = useUserRole(account?.username)
  const isPrivileged = userRole.role === "Administrador" || userRole.role === "Tecnico" || userRole.role === "Técnico";
  const { padre, hijos, loading, error, loadRelateds } = useTicketsRelacionados(ticket);

  // ====== Relacionador (UI) ======
  const [showRel, setShowRel] = React.useState(false);
  const [loadingOpts, setLoadingOpts] = React.useState(false);
  const [shoAll, setShowAll] = React.useState<boolean>(false)
  

  async function openRelacionador() {
    try {
      setShowRel(true);
      setLoadingOpts(true);
    } finally {
      setLoadingOpts(false);
    }
  }

  function closeRelacionador() {
    setShowRel(false);
  }

  // ====== Navegación por click en padre/hijo ======
  function handleClick(e: React.MouseEvent, t: Ticket) {
    if (onSelect) {
      e.preventDefault();
      onSelect(t);
    }
  }

  const href = (id: number | string) => (buildHref ? buildHref(id) : "#");

  return (
    <section className="ta-panel" aria-label={title}>
      {/* Header SIEMPRE visible */}
      <header className="ta-header">
        <div className="ta-header__left">
          <h2 className="ta-title">{title}</h2>
          {isPrivileged &&
            <a className="btn btn-circle btn-secondary-final" onClick={showRel ? closeRelacionador : openRelacionador} aria-label="Relacionar nuevo">{showRel ? "-" : "+"}</a>
          }
        </div>


      </header>

      {/* ===== Contenido ===== */}
      {showRel ? (
        <div className="ta-relacionador-wrap">
          {loadingOpts ? (
            <div className="ta-skeleton" style={{ height: 40 }} aria-hidden />
          ) : (
            <RelacionadorInline currentId={Number(ticket.ID)} onCancel={closeRelacionador} userMail={userRole.role} role="" reload={loadRelateds} onFinish={closeRelacionador}/>
          )}
        </div>
      ) : (
        <>
          {loading && <div className="ta-skeleton" aria-hidden />}
          {error && <p className="ta-error">Error cargando tickets</p>}

          <div className="ta-body">
            {/* Padre */}
            <section className="ta-column">
              <p className="ta-label">Ticket padre:</p>
              <ul className="ta-list">
                {!padre ? (
                  <li className="ta-empty">No tiene ticket padre</li>
                ) : (
                  <li className="ta-list__item">
                    <span className="ta-list__dash" aria-hidden>-</span>
                    {onSelect ? (
                      <button type="button" className="ta-link ta-link--button" onClick={(e) => handleClick(e, padre)}>
                        {padre.Title} <span className="ta-link__muted"> {" → "} ID: {padre.ID}</span>
                      </button>
                    ) : (
                      <a className="ta-link" href={href(padre.ID ?? "")}>
                        {padre.Title} <span className="ta-link__muted">{" → "} ID: {padre.ID}</span>
                      </a>
                    )}
                  </li>
                )}
              </ul>
            </section>

            {/* Hijos */}
            <section className="ta-column">
              <div className="encabezado">
                {hijos.length === 0 ? (
                  <p className="ta-label">Padre de:</p>
                ) : (
                  <>
                    <p className="ta-label">
                      Padre de {shoAll? hijos.length : Math.min(2, hijos.length)}/{hijos.length}:
                    </p>

                    {hijos.length >= 3 && (
                      <button className="ta-link ta-link--button" aria-live="polite" onClick={() => setShowAll(!shoAll)}>
                        {shoAll ? "Ver resumen" : "Ver todos"}
                      </button>
                    )}
                  </>
                )}
              </div>

              {hijos.length === 0 ? (
                <p className="ta-empty">{emptyChildrenText}</p>
              ) : (
                <>
                  {!shoAll ? (
                    <ul className="ta-list">
                      {hijos.slice(0, 2).map((t) => (
                        <li key={t.ID} className="ta-list__item">
                          <span className="ta-list__dash" aria-hidden>-</span>
                          <button type="button" className="ta-link ta-link--button" onClick={(e) => handleClick(e, t)}>
                            {t.Title} <span className="ta-link__muted">{" → "} ID: {t.ID}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="ta-list">
                      {hijos.map((t) => (
                        <li key={t.ID} className="ta-list__item">
                          <span className="ta-list__dash" aria-hidden>-</span>
                          <button
                            type="button"
                            className="ta-link ta-link--button"
                            onClick={(e) => handleClick(e, t)}
                          >
                            {t.Title} <span className="ta-link__muted">{" → "} ID: {t.ID}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>


          </div>
        </>
      )}
    </section>
  );

}
