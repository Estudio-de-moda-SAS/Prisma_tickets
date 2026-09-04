import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { CategoriasSPService, type CategoriaSP } from '../services/CategoriasSharepointSolvi.service';

export type SolviCategoria = CategoriaSP;

/** Catálogo de categorías de SOLVI (lista de SharePoint, prácticamente
 *  estática). staleTime: Infinity — se pide una sola vez por sesión y se
 *  reusa en cada visita al formulario en vez de repetir la llamada a Graph. */
export function useSolviCategorias() {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const categoriasService = React.useMemo(() => new CategoriasSPService(graphService), [graphService]);

  return useQuery<SolviCategoria[]>({
    queryKey: ['solvi-categorias'],
    queryFn: async () => {
      const categorias = await categoriasService.getAll();
      categorias.sort((a, b) => a.Title.localeCompare(b.Title));
      return categorias;
    },
    staleTime: Infinity,
    gcTime:    Infinity,
  });
}
