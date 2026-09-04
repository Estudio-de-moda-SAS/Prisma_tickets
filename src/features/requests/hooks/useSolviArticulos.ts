import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { ArticulosSPService, type ArticuloSP } from '../services/ArticulosSharepointSolvi.service';

export type SolviArticulo = ArticuloSP;

/** Artículos de SOLVI asociados a una subcategoría. `subcategoriaId` es el Id
 *  del item de SharePoint en la lista SubCategorias (no el Title).
 *  staleTime: Infinity — mismo criterio que useSolviSubcategorias: se pide
 *  una sola vez por sesión por cada subcategoría visitada. */
export function useSolviArticulos(subcategoriaId: string | null) {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const articulosService = React.useMemo(
    () => new ArticulosSPService(graphService),
    [graphService],
  );

  return useQuery<SolviArticulo[]>({
    queryKey: ['solvi-articulos', subcategoriaId],
    queryFn: async () => {
      const articulos = await articulosService.getBySubcategoria(subcategoriaId!);
      articulos.sort((a, b) => a.Title.localeCompare(b.Title));
      return articulos;
    },
    enabled: !!subcategoriaId,
    staleTime: Infinity,
    gcTime:    Infinity,
  });
}
