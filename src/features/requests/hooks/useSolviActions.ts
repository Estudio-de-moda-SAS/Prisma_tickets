import React from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/types/commons';
import type { SolviTicket } from '../types/SolviTicket';
import { UsuariosSPService, type UsuariosSP } from '../services/TecnicosSharepointSolvi.service';
import { calcularFechaSolucion } from '../services/SolviBusinessDate.service';
import { pickTecnicoConMenosCasos } from '../services/SolviTicketAssignment.service';
import { uploadSolviAttachment as uploadSolviAttachmentToStorage } from '../services/SolviAttachments.service';
import {
  notifyTicketCreatedResolutor,
  notifyTicketCreatedSolicitante,
} from '../services/SolviTicketNotifications.service';

export type { SolviTicket } from '../types/SolviTicket';
export {
  notifySolviCommentActivity,
  resolveSolviCommentNotificationRecipients,
} from '../services/SolviTicketNotifications.service';
export { parseDateFlex, toISODateTimeFlex } from '../services/SolviBusinessDate.service';

function emptyTicket(user?: UserProfile | null): SolviTicket {
  return {
    FechaCierreReal: null,
    ticket_solvi_ans: null,
    ticket_solvi_articulo: null,
    ticket_solvi_categoria: null,
    ticket_solvi_correo_resolutor: null,
    ticket_solvi_correo_solicitante: user?.User_Email ?? '',
    ticket_solvi_descripcion: '',
    ticket_solvi_estado: 'En Atención',
    ticket_solvi_fechaapertura: new Date(),
    ticket_solvi_fechamaxima: null,
    ticket_solvi_fuente: 'Aplicación',
    ticket_solvi_resolutor: null,
    ticket_solvi_solicitante: user?.User_Name ?? '',
    ticket_solvi_subcategoria: null,
    ticket_solvi_titulo: '',
  };
}

async function assignTechnicianAndBumpLoad(tecnicosService: UsuariosSPService): Promise<UsuariosSP | null> {
  const resolutor = await pickTecnicoConMenosCasos(tecnicosService);
  if (!resolutor) return null;

  const casosActuales = Number(resolutor.Numerodecasos ?? 0);
  await tecnicosService.update(String(resolutor.Id), { Numerodecasos: casosActuales + 1 });
  return resolutor;
}

async function notifyTicketCreated(ticket: SolviTicket | null | undefined): Promise<void> {
  if (!ticket?.ticket_solvi_correo_resolutor) return;

  try {
    await notifyTicketCreatedSolicitante(ticket);
  } catch (err) {
    console.error('[Flow] Error enviando a solicitante:', err);
  }

  try {
    await notifyTicketCreatedResolutor(ticket);
  } catch (err) {
    console.error('[Flow] Error enviando a resolutor:', err);
  }
}

type UseSolviActionsResult = {
  state: SolviTicket;
  setState: React.Dispatch<React.SetStateAction<SolviTicket>>;
  loading: boolean;
  graphService: GraphRest;
  tecnicosService: UsuariosSPService;
  saveTicket: (titulo: string, descripcion: string, archivos: File[], categoria: string) => Promise<boolean>;
  uploadSolviAttachment(file: File, ticketId: number): Promise<{ ok: boolean; url: string }>;
};

export function useSolviActionsTickets(user?: UserProfile | null): UseSolviActionsResult {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const tecnicosService = React.useMemo(
    () => new UsuariosSPService(graphService),
    [graphService],
  );

  const [state, setState] = React.useState<SolviTicket>(() => emptyTicket(user));
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setState(emptyTicket(user));
  }, [user]);

  const uploadSolviAttachment = React.useCallback(async (file: File, ticketId: number) => {
    setLoading(true);
    try {
      return await uploadSolviAttachmentToStorage(file, ticketId);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveTicket = React.useCallback(async (titulo: string, descripcion: string, archivos: File[], categoria: string): Promise<boolean> => {
    if (!user) {
      throw new Error('El usuario actual aún no está disponible.');
    }

    setLoading(true);
    try {
      const fechaMaxima = await calcularFechaSolucion();
      const resolutor = await assignTechnicianAndBumpLoad(tecnicosService);

      const payload: SolviTicket = {
        ...state,
        ticket_solvi_fechamaxima: fechaMaxima.toISOString(),
        ticket_solvi_correo_resolutor: resolutor?.Correo ?? '',
        ticket_solvi_resolutor: resolutor?.Title ?? '',
        ticket_solvi_titulo: titulo,
        ticket_solvi_descripcion: descripcion,
        ticket_solvi_categoria: categoria,
      };

      const { error, data: ticketCreated } = await supabase
        .from('TBL_Ticket_Solvi')
        .insert(payload)
        .select('*')
        .maybeSingle();

      if (archivos.length > 0) {
        await Promise.all(
          archivos.map((file) => uploadSolviAttachmentToStorage(file, ticketCreated?.ticket_solvi_id ?? 0)),
        );
      }

      await notifyTicketCreated(ticketCreated);

      if (error) throw error;

      return true;
    } finally {
      setLoading(false);
    }
  }, [state, tecnicosService, user]);

  return {
    state,
    setState,
    loading,
    graphService,
    tecnicosService,
    saveTicket,
    uploadSolviAttachment,
  };
}
