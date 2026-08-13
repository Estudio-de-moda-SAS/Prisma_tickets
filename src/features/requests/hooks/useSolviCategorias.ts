import React from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { GraphRest, } from '@/graph/GraphRest';
import {CategoriasSPService, type CategoriaSP,} from '../services/CategoriasSharepointSolvi.service';

export type SolviCategoria = CategoriaSP;

type UseSolviCategoriasResult = {
  data: SolviCategoria[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useSolviCategorias(): UseSolviCategoriasResult {
  const { getToken } = useAuth();
  const graphService = React.useMemo(() => new GraphRest(getToken), [getToken]);
  const categoriasService = React.useMemo(() => new CategoriasSPService(graphService), [graphService],);

  const [data, setData] = React.useState<SolviCategoria[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const refetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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

