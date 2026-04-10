import * as React from "react";
import { useGraphServices } from "../../../../graph/GrapServicesContext";
import type { Categoria, SubCategoria } from "../../../../Models/Categorias";
import { mapCategoria, mapSubCategoria } from "../../utils/ticketMappers";

export function useTicketCatalogos() {
  const graph = useGraphServices()

  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = React.useState<SubCategoria[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [catsRaw, subsRaw,] = await Promise.all([
        graph.Categorias.getAll({ orderby: "fields/Title asc" }),
        graph.SubCategorias.getAll({ orderby: "fields/Title asc", top: 5000 }),
      ]);

      setCategorias((catsRaw.items ?? []).map(mapCategoria));
      setSubcategorias((subsRaw.items ?? []).map(mapSubCategoria));
    } catch (e: any) {
      setError(e?.message ?? "Error cargando catálogos");
      setCategorias([]);
      setSubcategorias([]);
    } finally {
      setLoading(false);
    }
  }, [graph.Categorias, graph.SubCategorias]);

  React.useEffect(() => {
    let cancel = false;

    (async () => {
      if (cancel) return;
      await load();
    })();

    return () => {
      cancel = true;
    };
  }, [load]);

  return {
    categorias,
    subcategorias,
    loadingCatalogos: loading,
    errorCatalogos: error,
    reloadCatalogos: load,
  };
}