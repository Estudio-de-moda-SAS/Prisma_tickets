// src/features/requests/hooks/useTasksData.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';

/**
 * Hook de solo lectura para la vista de tareas de un equipo.
 *
 * Expone el tipo de fila cruda {@link TaskRow} (con todas sus relaciones) y
 * {@link useTasksData}, que trae las tareas del equipo desde el board por defecto.
 *
 * @module useTasksData
 */

/**
 * Fila de tarea con todas sus relaciones, tal como viene del backend.
 *
 * @remarks
 * Incluye columna, asignados, etiquetas, sprints, equipo y departamento
 * solicitante, y los datos de plantilla (`Form_Data`, snapshot de esquema y
 * esquema actual). Las relaciones anidadas pueden venir `null` o vacías.
 */
export interface TaskRow {
  Request_ID: string;
  Request_Title: string | null;
  Request_Score: number | null;
  Request_Created_At: string | null;
  Request_Finished_At: string | null;
  Request_Estimated_Hours: number | null;
  Request_Logged_Hours: number | null;
  Request_Progress: number | null;
  Request_Is_Confidential: boolean;
  column: {
    Board_Column_Name: string;
    Board_Column_Slug: string;
  } | null;
  assignments: Array<{
    assignee: {
      User_ID: number;
      User_Name: string;
      User_Email: string;
      User_Avatar_url: string | null;
    };
  }>;
  labels: Array<{
    label: {
      Label_ID: number;
      Label_Name: string;
      Label_Color: string;
      Label_Icon: string | null;
    };
  }>;
  sprints: Array<{
    Request_Sprint_ID: number;
    sprint: { Sprint_Text: string } | null;
  }>;
  requester_team: {
    Team_ID: number;
    Team_Name: string;
    Team_Code: string;
  } | null;
  requester_department: {
    Department_Name: string;
  } | null;
  Request_Form_Data: Record<string, unknown> | null;
  Request_Template_Schema_Snapshot: unknown[] | null;
  template_schema: { Request_Template_Form_Schema: unknown[] } | null;
}

/**
 * Lee las tareas de un equipo desde el board por defecto.
 *
 * @remarks
 * Usa `config.DEFAULT_BOARD_ID` y el `teamCode` dado. Se deshabilita si no hay
 * `teamCode`. `staleTime: 0` y `refetchOnMount: true` para reflejar cambios al
 * abrir la vista.
 *
 * @param teamCode - Código del equipo cuyas tareas se listan.
 * @returns El resultado de `useQuery` con las filas de tareas ({@link TaskRow}).
 */
export function useTasksData(teamCode: string) {
  return useQuery<TaskRow[]>({
    queryKey: ['tasks', teamCode],
    queryFn: () =>
      apiClient.call<TaskRow[]>('fetchByTeamCode', {
        boardId: config.DEFAULT_BOARD_ID,
        teamCode,
      }),
    enabled: !!teamCode,
    staleTime: 0,
    refetchOnMount: true,
  });
}