import React from "react";
import type { AnsService } from "../services/AnsTbl.service"
import type { ANS } from "../Models/Categorias";

export function useANS(ansSvc: AnsService) {
    const [loading, setLoading] = React.useState<boolean>(false)

    const obtainANS = React.useCallback(async (categoriaId: string, subCategoriaId: string, articuloId?: string): Promise<ANS | null> => {
        if (!categoriaId || !subCategoriaId) return null;

        setLoading(true);
        try {
            const cat = Number(categoriaId);
            const sub = Number(subCategoriaId);
            const art = articuloId ? Number(articuloId) : null;

            if (art) {
                const r1 = await ansSvc.getAll({filter: `fields/CategoriaId eq ${cat} and fields/SubCategoriaId eq ${sub} and fields/ArticuloId eq ${art}`, top: 1,});
                if (r1.items?.length) return r1.items[0];
            }

            const r2 = await ansSvc.getAll({filter: `fields/CategoriaId eq ${cat} and fields/SubCategoriaId eq ${sub} and (fields/ArticuloId eq null or fields/ArticuloId eq 0)`, top: 1,});

            return r2?.items?.length ? r2.items[0] : null;
        } catch {
            return null;
        } finally {
            setLoading(false);
        }
    },[ansSvc]);

  return {
    loading, obtainANS
  };
}