import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { SubcategoriasSPService, type SubcategoriaSP } from '../services/SubcategoriasSharepointSolvi.service';

export type SolviSubcategoria = SubcategoriaSP;

/** Subcategorías de SOLVI asociadas a una categoría. `categoriaId` es el Id
 *  del item de SharePoint en la lista Categorias (no el Title).
 *  staleTime: Infinity — el catálogo por categoría se pide una sola vez por
 *  sesión; si el usuario vuelve a elegir la misma categoría más tarde, se
 *  reusa el resultado cacheado en vez de volver a pegarle a Graph. */
export function useSolviSubcategorias(categoriaId: string | null) {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const subcategoriasService = React.useMemo(
    () => new SubcategoriasSPService(graphService),
    [graphService],
  );

  return useQuery<SolviSubcategoria[]>({
    queryKey: ['solvi-subcategorias', categoriaId],
    queryFn: async () => {
      const subcategorias = await subcategoriasService.getByCategoria(categoriaId!);
      subcategorias.sort((a, b) => a.Title.localeCompare(b.Title));
      return subcategorias;
    },
    enabled: !!categoriaId,
    staleTime: Infinity,
    gcTime:    Infinity,
  });
}
