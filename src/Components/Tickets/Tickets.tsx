import * as React from "react";
import "./Tickets.css";
import type { SortDir, SortField, Ticket } from "../../Models/Tickets";
import { toISODateTimeFlex } from "../../utils/Date";
import { useUserRole } from "../../Funcionalidades/Usuarios";
import { useAuth } from "../../Auth/authContext";
import { CaseDetail } from "../DetallesTickets/DetallesTickets";
import { calcularColorEstado } from "../../Funcionalidades/Tickets/utils/ticketsColors";
import { useTickets } from "../../Funcionalidades/Tickets/hooks/Queries/useTickets";

function renderSortIndicator(field: SortField, sorts: Array<{field: SortField; dir: SortDir}>) {
  const idx = sorts.findIndex(s => s.field === field);
  if (idx < 0) return null;
  const dir = sorts[idx].dir === 'asc' ? '▲' : '▼';
  return <span style={{ marginLeft: 6, opacity: 0.85 }}>{dir}{sorts.length > 1 ? ` ${idx+1}` : ''}</span>;
}

export default function TablaTickets() {
  const { account } = useAuth();
  const userMail = account?.username ?? "";
  const userRole = useUserRole(userMail)
  const isPrivileged = userRole.role === "Administrador" || userRole.role === "Tecnico" || userRole.role === "Técnico";
  const {ticketsAbiertos, ticketsFueraTiempo, rows, loading, error, filterMode, range, pageSize, pageIndex, hasNext, sorts, setFilterMode, setRange, setPageSize, updateSelectedTicket, nextPage, loadFirstPage,  toggleSort} = useTickets(userRole.role);

  // Búsqueda local SOLO sobre la página visible (si quieres global, hay que mover a OData)
  const [search, setSearch] = React.useState("");
  const [ticketSeleccionado, setTicketSeleccionado] = React.useState<Ticket | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => {
      const texto = `${t.Nombreresolutor ?? ""} ${t.Solicitante ?? ""} ${t.Title ?? ""} ${t.ID}`.toLowerCase();
      return texto.includes(q);
    });
  }, [rows, search]);

  const handleTicketChanged = React.useCallback(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  React.useEffect(() => {
    if (!ticketSeleccionado) return;

    const load = async () => {

      // Si no está en la página, consultar el backend
      const updatedRemote = await updateSelectedTicket(ticketSeleccionado.ID ?? "");
      if (updatedRemote) {
        setTicketSeleccionado(updatedRemote);
      }
    };

    load();
  }, [rows]); 
  return (
    <div className="tabla-tickets">

      {!ticketSeleccionado && (
        <div className="tickets-filtros">

          <input type="text" placeholder="Buscar (resolutor, solicitante, asunto)..." value={search} onChange={(e) => setSearch(e.target.value)}/>

          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)} title="Estado">
            <option value="En curso">En curso</option>
            <option value="Cerrados">Cerrados</option>
            <option value="Todos">Todos</option>
          </select>

          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} title="Desde"/>
          <span>→</span>
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} title="Hasta"/>
        </div>
      )}

      {/* Estados */}
      {loading && <p>Cargando tickets…</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {!loading && !error && filtered.length === 0 && !ticketSeleccionado && <p>No hay tickets para los filtros seleccionados.</p>}

      {/* Tabla o Detalle */}
      {ticketSeleccionado ? (
        <CaseDetail onVolver={() => setTicketSeleccionado(null)} ticket={ticketSeleccionado} role={userRole.role} onDocumentar={handleTicketChanged}/>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th role="button" tabIndex={0} onClick={(e) => toggleSort('id', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSort('id', e.shiftKey); }} aria-label="Ordenar por ID" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ID {renderSortIndicator('id', sorts)}
                </th>

                <th role="button" tabIndex={0} onClick={(e) => toggleSort('resolutor', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSort('resolutor', e.shiftKey); }} aria-label="Ordenar por Resolutor" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Resolutor {renderSortIndicator('resolutor', sorts)}
                </th>

                <th>Solicitante</th> 

                <th role="button" tabIndex={0} onClick={(e) => toggleSort('Title', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSort('Title', e.shiftKey); }} aria-label="Ordenar por Asunto" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Asunto {renderSortIndicator('Title', sorts)}
                </th>

                <th role="button" tabIndex={0} onClick={(e) => toggleSort('FechaApertura', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSort('FechaApertura', e.shiftKey); }} aria-label="Ordenar por Fecha de apertura" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Fecha de apertura {renderSortIndicator('FechaApertura', sorts)}
                </th>

                <th role="button" tabIndex={0} onClick={(e) => toggleSort('TiempoSolucion', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSort('TiempoSolucion', e.shiftKey); }}
                  aria-label="Ordenar por Fecha máxima" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Fecha máxima {renderSortIndicator('TiempoSolucion', sorts)}
                </th>

                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.ID} onClick={() => setTicketSeleccionado(ticket)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTicketSeleccionado(ticket)}>
                  <td>{ticket.ID}</td>
                  <td><span title={ticket.Nombreresolutor}>{ticket.Nombreresolutor}</span></td>
                  <td><span title={ticket.Solicitante}>{ticket.Solicitante}</span></td>
                  <td><span title={ticket.Title}>{ticket.Title}</span></td>
                  <td>{toISODateTimeFlex(ticket.FechaApertura) || "–"}</td>
                  <td>{toISODateTimeFlex(ticket.TiempoSolucion) || "N/A"}</td>
                  <td>
                    <span className="estado-circulo" style={{ backgroundColor: calcularColorEstado(ticket) }} title={ticket.Estadodesolicitud || "Sin estado"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginación servidor: Anterior = volver a primera página (loadFirstPage), Siguiente = nextLink */}
          {filtered.length > 0 && (
            <div className="paginacion">
              <button onClick={loadFirstPage} disabled={loading || pageIndex <= 1}>
                Anterior
              </button>
              <span>Página {pageIndex}</span>
              <button onClick={nextPage} disabled={loading || !hasNext}>
                Siguiente
              </button>

              {isPrivileged && (
                <>
                  <label htmlFor="page-size" style={{ marginLeft: 12, marginRight: 8 }}>
                    Tickets por página:
                  </label>
                  <select id="page-size" value={pageSize} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPageSize(parseInt(e.target.value, 10))} disabled={loading}>
                    {[10, 15, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="page-size" style={{ marginLeft: 12, marginRight: 8 }}>
                    Tickets abiertos: {ticketsAbiertos} Tickets vencidos: {ticketsFueraTiempo}
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}