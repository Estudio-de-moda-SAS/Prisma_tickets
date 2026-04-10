import * as React from "react";
import { useState } from "react";
import type { Ticket } from "../Models/Tickets";
import type { Log } from "../Models/Log";
import type { AccountInfo } from "@azure/msal-browser";
import type { TicketsService } from "../services/Tickets.service";
import type { LogService } from "../services/Logs.service";
import { useGraphServices } from "../graph/GrapServicesContext";
import type { GraphSendMailPayload } from "../graph/GraphRest";

type Svc = { Tickets?: TicketsService; Logs: LogService;};

export type FormDocumentarState = {
  resolutor: string;
  correoresolutor: string;
  documentacion: string;
  archivo: File | null;
};

export type FormDocErrors = Partial<Record<keyof FormDocumentarState, string>>;

export function useDocumentarTicket(services: Svc) {
  const { Tickets, Logs} = services;
  const {mail} = useGraphServices()
  const [state, setState] = useState<FormDocumentarState>({
    resolutor: "",
    correoresolutor: "",
    documentacion: "",
    archivo: null,
  });
  const [errors, setErrors] = useState<FormDocErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof FormDocumentarState>(k: K, v: FormDocumentarState[K]) => setState((s) => ({ ...s, [k]: v }));

  const validate = () => {
    const e: FormDocErrors = {};
    const texto = (state.documentacion ?? "").trim();
    if (!texto) e.documentacion = "Por favor escriba la documentación.";
    else if (texto.length < 50) e.documentacion = "Mínimo 50 caracteres.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, tipo: "solucion" | "seguimiento", ticket: Ticket, account: AccountInfo) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    if(!ticket.Categoria){
      alert("No puedes hacer ninguna acción en el ticket antes de categorizarlo")
      return
    }
    try {
      const soluciones = await Logs.getAll({filter: `fields/Title eq ${ticket.ID} and fields/Tipo_de_accion eq 'Solucion'`})
      if(soluciones.items.length > 0 && tipo === "solucion"){
        alert("Este ticket ya tiene una solucion no puedes escribir mas de una por ticket")
      } else {
        const logPayload: Log = {
          Actor: account.name ?? account.username ?? "",
          CorreoActor: account.username ?? "",
          Descripcion: state.documentacion,
          Tipo_de_accion: tipo,
          Title: String(ticket.ID ?? ""),
        };

        await Logs.create(logPayload);
        // (Opcional) subir archivo si aplica
        // if (state.archivo) { await Logs.attach(logId, state.archivo) }
        setState({archivo: null, correoresolutor: "", documentacion: "", resolutor: ""})
        setSubmitting(false);
      

      // 2) Si es solución, cerrar ticket con estado correcto
      if (tipo === "solucion") {
        if (!Tickets) throw new Error("Servicio Tickets no disponible.");
          const nuevoEstado = ticket.Estadodesolicitud === "En Atención" ? "Cerrado" : "Cerrado fuera de tiempo";
          alert("Caso cerrado. Enviando notificación al solicitante")
          await Tickets.update(ticket.ID!, { Estadodesolicitud: nuevoEstado });

          const solucion = await Logs.getAll({filter: `fields/Title eq '${ticket.ID}' and Tipo_de_accion eq 'Solucion'`})

          if (ticket.CorreoSolicitante) {
            const title = `Cierre de Ticket - ${ticket.ID}`;

            const detalleSolucion = solucion?.items?.[0]?.Descripcion ?? ""; // evita crash

            const message = `
              <p>Este es un mensaje automático.</p>

              <p>
                Estimado/a ${ticket.Solicitante},<br><br>
                Nos complace informarle que su caso "${ticket.Title}" (ID: ${ticket.ID}) ha sido cerrado.
                Esperamos que su problema haya sido resuelto satisfactoriamente.
              </p>

              ${detalleSolucion ? `<hr><div>${detalleSolucion}</div>` : ""}

              <p>Gracias por su colaboración y confianza.</p>
            `.trim();

            try {
              console.log("Enviando notificación")
              const mailPayload: GraphSendMailPayload = {
                message: {
                  subject: title,
                  body: {
                    contentType: "HTML", // o "Text"
                    content: message,    // tu string
                  },
                  toRecipients: [
                    {
                      emailAddress: {
                        address: ticket.CorreoSolicitante,
                      },
                    },
                  ],
                },
              };
              await mail.sendEmail(mailPayload);
            } catch (err) {
              console.error("[Flow] Error enviando a solicitante:", err);
            }
        }
      }
    }
    } catch (err) {
      console.error("Error en handleSubmit:", err);
      // setError(String(err));
    } finally {
      
    }
  };

  return { state, setField, errors, submitting, handleSubmit };
}
