import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { AnsSPService } from '../services/AnsSharepointSolvi.service';

export const horasPorANS: Record<string, number> = {
  "ANS 1": 4,
  "ANS 2": 8,
  "ANS 3": 24,
  "ANS 4": 120,
  "ANS 5": 160
};

// Normaliza mayúsculas/espacios: en SharePoint el Title se carga a mano y
// pequeñas variaciones ("ans 1", "ANS  1") no deberían romper el match.
const horasPorANSNormalizado: Record<string, number> = Object.fromEntries(
  Object.entries(horasPorANS).map(([tier, horas]) => [normalizarAns(tier), horas]),
);

function normalizarAns(valor: string): string {
  return valor.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolverAns(ans: string | undefined): { horas: number; nombre: string } | null {
  if (!ans) return null;
  const horas = horasPorANSNormalizado[normalizarAns(ans)];
  return horas ? { horas, nombre: ans } : null;
}

/** ANS (SLA), en horas hábiles, para la combinación de categoría,
 *  subcategoría y artículo elegida en el formulario. Devuelve `null` si
 *  falta algún Id o si la combinación no tiene un ANS cargado en SharePoint
 *  (el llamador decide el fallback — ver calcularFechaSolucion).
 *  `subcategoriaSinArticulos` en `true` indica que la subcategoría elegida
 *  no tiene artículos asociados (ver useSolviArticulos): en ese caso se
 *  consulta con categoría + subcategoría solamente, sin esperar a que se
 *  elija un artículo que no existe. Si la subcategoría sí tiene artículos,
 *  la consulta espera a que se elija uno (el ANS es específico por artículo).
 *  staleTime/gcTime: Infinity — mismo criterio que el resto del catálogo
 *  SOLVI: se pide una sola vez por combinación por sesión. */
export function useSolviAns(
  categoriaId: string | null,
  subcategoriaId: string | null,
  articuloId: string | null,
  subcategoriaSinArticulos = false,
) {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const ansService = React.useMemo(() => new AnsSPService(graphService), [graphService]);

  return useQuery<{ horas: number; nombre: string } | null>({
    queryKey: ['solvi-ans', categoriaId, subcategoriaId, articuloId, subcategoriaSinArticulos],
    queryFn: async () => {
      const rows = await ansService.getByCombinacion(categoriaId!, subcategoriaId!, articuloId || null);
      return resolverAns(rows[0]?.ANS);
    },
    enabled: !!categoriaId && !!subcategoriaId && (!!articuloId || subcategoriaSinArticulos),
    staleTime: Infinity,
    gcTime:    Infinity,
  });
}
