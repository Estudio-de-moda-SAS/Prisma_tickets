// src/features/requests/services/SolviShifts.service.ts
// Fetch a la Edge Function "obtener-disponibilidad-hoy" (turnos del grupo Solvi en Teams Shifts).
import { supabase } from '@/lib/supabaseClient';

export type SolviShiftTurno = {
  shiftId: string;
  userId: string;
  inicio: string;
  fin: string;
  activoAhora: boolean;
  nombre: string | null;
  correo: string | null;
};

export type SolviDisponibilidadHoy = {
  ok: boolean;
  fecha: string;
  ahora: string;
  turnosHoy: SolviShiftTurno[];
  personaDisponibleAhora: SolviShiftTurno | null;
};

const FUNCTION_NAME = 'obtener-disponibilidad-hoy';

export async function fetchDisponibilidadHoy(teamId?: string): Promise<SolviDisponibilidadHoy> {
  const { data, error } = await supabase.functions.invoke<SolviDisponibilidadHoy>(FUNCTION_NAME, {
    body: teamId ? { teamId } : {},
  });

  if (error) throw new Error(`[SolviShifts] ${FUNCTION_NAME}: ${error.message}`);
  if (!data?.ok) throw new Error(`[SolviShifts] ${FUNCTION_NAME}: respuesta inválida`);

  return data;
}

export async function fetchTurnosHoy(teamId?: string): Promise<SolviShiftTurno[]> {
  const { turnosHoy } = await fetchDisponibilidadHoy(teamId);
  return turnosHoy;
}

export async function fetchPersonaDisponibleAhora(teamId?: string): Promise<SolviShiftTurno | null> {
  const { personaDisponibleAhora } = await fetchDisponibilidadHoy(teamId);
  return personaDisponibleAhora;
}
