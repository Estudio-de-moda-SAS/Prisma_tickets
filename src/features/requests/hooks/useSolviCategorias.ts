import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest } from '@/graph/GraphRest';
import { CategoriasSPService, type CategoriaSP } from '../services/CategoriasSharepointSolvi.service';

/**
 * Hook para cargar las categorías de Solvi desde SharePoint.
 *
 * Expone {@link useSolviCategorias}, que trae las categorías vía Microsoft Graph,
 * las ordena alfabéticamente y las entrega con estado de carga/error y una acción
 * de recarga.
 *
 * @module useSolviCategorias
 */

/** Categoría de Solvi (alias del tipo de SharePoint). */
export type SolviCategoria = CategoriaSP;

/** Valor de retorno de {@link useSolviCategorias}. */
type UseSolviCategoriasResult = {
  data: SolviCategoria[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

/**
 * Carga las categorías de Solvi.
 *
 * @remarks
 * Memoiza los servicios de Graph y de categorías a partir del token de auth.
 * Trae las categorías al montar y las ordena por `Title`. Captura errores en
 * estado (`error`) sin propagarlos y expone `refetch` para recargar bajo demanda.
 *
 * @returns {@link UseSolviCategoriasResult}: `{ data, loading, error, refetch }`.
 */
export function useSolviCategorias(): UseSolviCategoriasResult {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const categoriasService = React.useMemo(() => new CategoriasSPService(graphService), [graphService]);

  return useQuery<SolviCategoria[]>({
    queryKey: ['solvi-categorias'],
    queryFn: async () => {
      const categorias = await categoriasService.getAll();
      categorias.sort((a, b) => a.Title.localeCompare(b.Title));
      setData(categorias);
    } catch (err) {
      console.error('[useSolviCategorias] fetch falló:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [categoriasService]);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
