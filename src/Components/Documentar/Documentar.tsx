import React from "react";
import { useAuth } from "../../Auth/authContext";
import { useDocumentarTicket } from "../../Funcionalidades/Documentar";
import { useGraphServices } from "../../graph/GrapServicesContext";
import type { Ticket } from "../../Models/Tickets";
import "./Documentar.css";
import { usePlantillas } from "../../Funcionalidades/Plantillas";
import RichTextBase64 from "../RichTextBase64/RichTextBase64";


export default function Documentar({ ticket, tipo, onDone }: { ticket: Ticket; tipo: "solucion" | "seguimiento"; onDone: () => void | Promise<void>}) {
  const { Tickets: TicketsSvc, Logs: LogsSvc, Plantillas: PlantillasSvc,} = useGraphServices() 
  const { account } = useAuth();
  const { state, errors, submitting, setField, handleSubmit } = useDocumentarTicket({ Tickets: TicketsSvc, Logs: LogsSvc,});

  // ⬇️ usamos también loading/error por si quieres feedback
  const { ListaPlantillas, loading: loadingPlantillas, error: errorPlantillas } = usePlantillas(PlantillasSvc);

  const [plantillaId, setPlantillaId] = React.useState<string>("");

  const onSelectPlantilla = (id: string) => {
    setPlantillaId(id);
    const p = (ListaPlantillas ?? []).find(pl => pl.Id === id);
    if (!p) return;
    // Asumimos que CamposPlantilla trae HTML listo para el editor
    setField("documentacion", p.CamposPlantilla ?? "");
  };

  return (
    <div className="documentar-form documentar-form--edge">
      {/* === SOLO DOCUMENTACIÓN CUANDO showEscalar = false === */}
        <form className="documentar-grid">
          {/* Selector de plantilla */}
          <div className="documentar-field documentar-col-2 platilla-field">
            <label className="documentar-label platilla-label" htmlFor="plantilla">Usar plantilla</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select id="plantilla" className="documentar-input platilla-input" value={plantillaId} onChange={(e) => onSelectPlantilla(e.target.value)} disabled={submitting || loadingPlantillas || !ListaPlantillas?.length}>
                <option value="">{loadingPlantillas ? "Cargando plantillas..." : "— Selecciona una plantilla —"}</option>
                {(ListaPlantillas ?? []).map(p => (
                  <option key={p.Id} value={p.Id}>{p.Title}</option>
                ))}
              </select>
              {errorPlantillas && <small className="error">{errorPlantillas}</small>}
            </div>
          </div>

          {/* Documentación */}
          <div className="documentar-field documentar-col-2">
            <label className="documentar-label">Descripción de {tipo}</label>
            <RichTextBase64 value={state.documentacion} onChange={(html) => setField("documentacion", html)} placeholder="Describe el problema y pega capturas (Ctrl+V)…"/>
            {errors.documentacion && <small className="error">{errors.documentacion}</small>}
          </div>

          {/* Archivo */}
          <div className="documentar-field documentar-col-2">
            <label className="documentar-label" htmlFor="archivo">Adjuntar archivo</label>
             <input id="archivo" type="file" onChange={(e) => setField("archivo", e.target.files?.[0] ?? null)} disabled={submitting} className="documentar-input"/>
            {errors.archivo && <small className="error">{errors.archivo}</small>}
          </div>

          {/* Acciones (esquinas) */}
            <div className="documentar-actions documentar-col-2">
              <button type="button" disabled={submitting} className="btn-save btn-primary" onClick={async   (e) => { 
                                                                                                   await handleSubmit(e, tipo, ticket, account!);  
                                                                                                    await onDone(); 
                                                                                                  }}>
                {submitting ? "Enviando..." : "Guardar documentación"}
              </button>
            </div>
          </form>
    </div>
  );
}
