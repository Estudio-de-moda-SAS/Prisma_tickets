import * as React from "react";
import "./RelacionadorInline.css";
import Select from "react-select";
import type { ticketOption } from "../../../../Models/Tickets";
import { useTickets } from "../../../../Funcionalidades/Tickets/hooks/Queries/useTickets";

export type TicketLite = { ID: number | string; Title: string };
type Mode = "padre" | "hijo" ;

type Props = { currentId: number | string;
  onCancel: () => void;
  reload: () => void;
  userMail: string;
  role: string;
  onFinish: () => void;
};

export default function RelacionadorInline({currentId, onCancel, reload, role, onFinish}: Props) {
  const [mode, setMode] = React.useState<Mode>("padre");
  const [tickets, setTickets] = React.useState<ticketOption[]>([]);
  const {toTicketOptions, state, setField, handleConfirm,} = useTickets(role,);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const charged = await toTicketOptions(); 
        if (alive) setTickets(charged);
      } catch (e: any) {
      } 
  })();

  return () => { alive = false; };
}, [toTicketOptions]); // si toTicketOptions viene de useCallback, inclúyelo

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault();           
    try {
      const related = state.TicketRelacionar?.value ?? "";
      if (!related) {
        alert("Elige un ticket a relacionar.");
        return;
      }
      const ok = await handleConfirm(currentId, related, mode); 
      if (!ok) return;
      await reload();
      onFinish()
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Ocurrió un error en la acción.");
    }
  }

  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <div className="relc">
      <div className="relc-row">
        {/* Select modo (nativo) */}
        <label className="relc-field">
          <span className="relc-field__label">Relación</span>
          <select className="relc-native" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="padre">Padre de</option>
            <option value="hijo">Hijo de</option>
            <option value="masiva">Masiva</option>
          </select>
        </label>

        {/* Combobox de tickets */}
        <div className="relc-field relc-field--grow" ref={wrapRef}>
          <div className="relc-combobox" role="combobox" aria-haspopup="listbox" aria-owns="relc-listbox">
          {(["padre", "hijo"].includes(mode)) ? (
            <div className="relc-field">
              <label className="relc-label">Ticket</label>
              <Select<ticketOption, false>
                options={tickets}
                placeholder="Buscar ticket"
                value={state.TicketRelacionar}
                onChange={(opt) => setField("TicketRelacionar", opt ?? null)}
                classNamePrefix="rs"
                isClearable
              />
            </div>
          ) : (
            <div className="relc-field">
              <label htmlFor="archivo" className="relc-label">Cargar Excel de tickets</label>
              <input id="archivo" type="file" className="relc-native" accept=".xlsx,.xls" onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (!f) { setField("archivo", null); return; }
                  // Validación básica de tamaño (opcional)
                  const MAX_MB = 10;
                  if (f.size > MAX_MB * 1024 * 1024) {
                    alert(`Archivo demasiado grande (> ${MAX_MB}MB).`);
                    e.currentTarget.value = ""; // limpia el input
                    return;
                  }
                  setField("archivo", f);
                }}
              />

              {/* Botón para limpiar selección (opcional) */}
              {state.archivo && (
                <button type="button" className="relc-link" onClick={() => {
                  setField("archivo", null);
                  (document.getElementById("archivo") as HTMLInputElement | null)!.value = "";
                }}>
                  Quitar archivo
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="relc-actions">
        <button type="button" className="btn btn-circle btn-secondary" onClick={onCancel} title="Cancelar" aria-label="Cancelar">
          ×
        </button>
        <button type="button" className="btn btn-circle btn-primary" onClick={async (e) => onConfirm(e)} title="Confirmar" aria-label="Confirmar"> ✓ </button>
      </div>
    </div>
  );
}
