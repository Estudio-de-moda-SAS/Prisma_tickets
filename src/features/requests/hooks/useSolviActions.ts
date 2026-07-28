import React from 'react';
import { TZDate } from '@date-fns/tz';
import { addMinutes, isSaturday, isSunday } from 'date-fns';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { supabase } from '@/lib/supabaseClient';
import type { UserProfile } from '@/types/commons';
import { fetchHolidays, type Holiday } from '../services/HolidayService.service';
import {
  UsuariosSPService,
  type UsuariosSP,
} from '../services/TecnicosSharepointSolvi.service';

export type SolviTicket = {
  ticket_solvi_id?: number;
  ticket_solvi_titulo: string;
  ticket_solvi_estado: string | null;
  ticket_solvi_fuente: string | null;
  ticket_solvi_solicitante: string | null;
  ticket_solvi_correo_solicitante: string | null;
  ticket_solvi_resolutor: string | null;
  ticket_solvi_categoria: string | null;
  ticket_solvi_subcategoria: string | null;
  ticket_solvi_ans: string | null;
  ticket_solvi_fechaapertura: Date | null;
  ticket_solvi_fechamaxima: string | null;
  FechaCierreReal: string | null;
  ticket_solvi_correo_resolutor: string | null;
  ticket_solvi_descripcion: string;
  ticket_solvi_articulo: string | null;
};

const TIMEZONE = 'America/Bogota';
const WORK_START = 7;
const WORK_END = 17;

const sliceYMD = (s?: string) => (s ? s.slice(0, 10) : '');

const toYMD = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(12, 0, 0, 0);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isHoliday = (date: Date, holidays: Holiday[]) => {
  const ymd = toYMD(date);
  return holidays.some((h) => sliceYMD(h.date) === ymd);
};

export async function calcularFechaSolucion(): Promise<TZDate> {
  let restante = 4 * 60;
  let actual = new TZDate(new Date(), TIMEZONE);
  const holidays = await fetchHolidays();

  while (restante > 0) {
    const hora = actual.getHours();

    if (isSaturday(actual) || isSunday(actual) || isHoliday(actual, holidays)) {
      actual = new TZDate(
        new TZDate(
          actual.getFullYear(),
          actual.getMonth(),
          actual.getDate() + 1,
          WORK_START,
          0,
          0,
          TIMEZONE,
        ),
        TIMEZONE,
      );
      continue;
    }

    if (hora < WORK_START) {
      actual = new TZDate(
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate(),
        WORK_START,
        0,
        0,
        TIMEZONE,
      );
      continue;
    }

    if (hora >= WORK_END) {
      actual = new TZDate(
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate() + 1,
        WORK_START,
        0,
        0,
        TIMEZONE,
      );
      continue;
    }

    const minutosHastaFin = (WORK_END - hora) * 60 - actual.getMinutes();
    const aConsumir = Math.min(restante, minutosHastaFin);
    actual = new TZDate(addMinutes(actual, aConsumir), TIMEZONE);
    restante -= aConsumir;

    if (restante > 0) {
      actual = new TZDate(
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate() + 1,
        WORK_START,
        0,
        0,
        TIMEZONE,
      );
    }
  }

  return actual;
}

export async function pickTecnicoConMenosCasos(Usuarios: UsuariosSPService): Promise<UsuariosSP | null>{
  const tecnicos = await Usuarios.getAll({filter: "fields/Rol eq 'Tecnico' and fields/Disponible eq 'Disponible'", top: 50});

  console.table(tecnicos)

  if (!tecnicos || tecnicos.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let candidatos: UsuariosSP[] = [];

  for (const t of tecnicos) {
    const carga = Number(t.Numerodecasos ?? 0); 
    if (carga < min) {
      min = carga;
      candidatos = [t];
    } else if (carga === min) {
      candidatos.push(t);
    }
  }

  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)] ?? null;

  if (elegido) {
    console.log(`Asignar a: ${elegido.Title} (casos activos: ${elegido.Numerodecasos ?? 0})`);
  }

  return elegido;
};


function cleanState(user: UserProfile): SolviTicket {
  return {
    FechaCierreReal: null,
    ticket_solvi_ans: null,
    ticket_solvi_articulo: null,
    ticket_solvi_categoria: null,
    ticket_solvi_correo_resolutor: null,
    ticket_solvi_correo_solicitante: user.User_Email,
    ticket_solvi_descripcion: '',
    ticket_solvi_estado: 'En Atención',
    ticket_solvi_fechaapertura: new Date(),
    ticket_solvi_fechamaxima: null,
    ticket_solvi_fuente: 'Aplicación',
    ticket_solvi_resolutor: null,
    ticket_solvi_solicitante: user.User_Name,
    ticket_solvi_subcategoria: null,
    ticket_solvi_titulo: '',
  };
}

type UseSolviActionsResult = {
  state: SolviTicket;
  setState: React.Dispatch<React.SetStateAction<SolviTicket>>;
  loading: boolean;
  graphService: GraphRest;
  tecnicosService: UsuariosSPService;
  saveTicket: (titulo: string, descripcion: string) => Promise<boolean>;
};

export function useSolviActionsTickets(user: UserProfile): UseSolviActionsResult {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const tecnicosService = React.useMemo(
    () => new UsuariosSPService(graphService),
    [graphService],
  );

  const [state, setState] = React.useState<SolviTicket>(() => cleanState(user));
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setState(cleanState(user));
  }, [user]);


  const saveTicket = React.useCallback(async (titulo: string, descripcion: string): Promise<boolean> => {
    setLoading(true);
    try {
      const fechaMaxima = await calcularFechaSolucion();
      const resolutor = await pickTecnicoConMenosCasos(tecnicosService)
      const payload: SolviTicket = {
        ...state,
        ticket_solvi_fechamaxima: fechaMaxima.toISOString(),
        ticket_solvi_correo_resolutor: resolutor?.Correo ?? "",
        ticket_solvi_resolutor: resolutor?.Title ?? "",
        ticket_solvi_titulo: titulo,
        ticket_solvi_descripcion: descripcion,
      };

      const { error, } = await supabase.from('TBL_Ticket_Solvi').insert(payload);
      cleanState(user)
      if (error) throw error;

      return true
    } finally {
      setLoading(false);
    }
  }, [state]);

  return {
    state,
    setState,
    loading,
    graphService,
    tecnicosService,
    saveTicket,
  };
}
