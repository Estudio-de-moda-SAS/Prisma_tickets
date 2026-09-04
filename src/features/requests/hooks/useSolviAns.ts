import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { AnsSPService } from '../services/AnsSharepointSolvi.service';

/** ANS (SLA), en horas hábiles, para la combinación exacta de categoría,
 *  subcategoría y artículo elegida en el formulario. Devuelve `null` si
 *  falta algún Id o si la combinación no tiene un ANS cargado en SharePoint
 *  (el llamador decide el fallback — ver calcularFechaSolucion).
 *  staleTime/gcTime: Infinity — mismo criterio que el resto del catálogo
 *  SOLVI: se pide una sola vez por combinación por sesión. */

export const horasPorANS: Record<string, number> = {
  "ANS 1": 4,
  "ANS 2": 8,
  "ANS 3": 24,
  "ANS 4": 120,
  "ANS 5": 160
};



export function useSolviAns(
  categoriaId: string | null,
  subcategoriaId: string | null,
  articuloId: string | null,
) {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const ansService = React.useMemo(() => new AnsSPService(graphService), [graphService]);

  return useQuery<{horas: number, nombre: string} | null>({
    queryKey: ['solvi-ans', categoriaId, subcategoriaId, articuloId],
    queryFn: async () => {
      const rows = await ansService.getByCombinacion(categoriaId!, subcategoriaId!, articuloId!);
      const ans = rows[0]?.ANS;
      
      return horasPorANS[String(ans)] ? { horas: horasPorANS[String(ans)], nombre: String(ans) } : null;
    },
    enabled: !!categoriaId && !!subcategoriaId && !!articuloId,
    staleTime: Infinity,
    gcTime:    Infinity,
  });
}
