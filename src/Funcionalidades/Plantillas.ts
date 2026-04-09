import React from "react";
import type { FormPlantillas, Plantillas } from "../Models/Plantilla";
import type { PlantillasService } from "../services/Plantillas.service";

export function usePlantillas(PlantillasSvc: PlantillasService,) {
  // UI state
  const [ListaPlantillas, setListaPlantillas] = React.useState<Plantillas[] | []>([]);
  const [loading, setLoading] = React.useState(false);
  const [submiting, setSubmiting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<FormPlantillas>({
    HTLM: "",
    Titulo: ""
  })

  // cargar primera página (o recargar)
  const loadPlantillas = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const items = await PlantillasSvc.getAll();
      setListaPlantillas(items.items);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando pantillas");
      setListaPlantillas([]);
    } finally {
      setLoading(false);
    }
  }, [PlantillasSvc]);

  React.useEffect(() => {
    loadPlantillas();
  }, [loadPlantillas]);

  const createPlantilla = React.useCallback(async () => {
    setSubmiting(true); setError(null)
    try{
      const payload: Plantillas = {
        CamposPlantilla: state.HTLM,
        Title: state.Titulo
      }
      const created = await PlantillasSvc.create(payload)
      console.log("Plantilla creada", created)
      setSubmiting(false);
      setState({HTLM: "",Titulo: ""})
    } catch (e: any) {
      setError(e?.message ?? "Error creando la pantilla");
      setSubmiting(false)
    } 
  }, [state, PlantillasSvc])

  const setField = <K extends keyof FormPlantillas>(k: K, v: FormPlantillas[K]) => setState((s) => ({ ...s, [k]: v }));

  return {
    ListaPlantillas,
    loading,
    error,
    createPlantilla,
    submiting,
    state,
    setField
  };
}
