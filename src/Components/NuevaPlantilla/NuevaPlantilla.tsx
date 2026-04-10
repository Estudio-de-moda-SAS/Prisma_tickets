import "./NuevaPlantilla.css";
import { useGraphServices } from "../../graph/GrapServicesContext";
import { usePlantillas } from "../../Funcionalidades/Plantillas";
import RichTextBase64 from "../RichTextBase64/RichTextBase64";
import type { PlantillasService } from "../../services/Plantillas.service";

export default function CrearPlantilla() {
  const { Plantillas: PlantillasSvc } =
    useGraphServices() as ReturnType<typeof useGraphServices> & {
      Plantillas: PlantillasService;
    };

  const { createPlantilla, submiting, state, setField } =
    usePlantillas(PlantillasSvc);

  return (
    <section className="tpl-page tpl-scope" aria-label="Crear una plantilla">
      <form className="tpl-form" onSubmit={(e) => {e.preventDefault(); createPlantilla();}}>
        <h1 className="tpl-title">Crear Una Plantilla</h1>

        <div className="tpl-field">
          <label htmlFor="nombre" className="tpl-label">Nombre de la plantilla</label>
          <input id="nombre" name="nombre" className="tpl-input" placeholder="Ingrese el nombre de la plantilla" value={state.Titulo} onChange={(e) => setField("Titulo", e.target.value)} required/>
        </div>

        <div className="tpl-field">
          <label className="tpl-label">Campos de la plantilla</label>

          {/* Editor */}
          <div className="tpl-editorWrapper">
            <RichTextBase64 value={state.HTLM} onChange={(html) => setField("HTLM", html)} placeholder="Cree su plantilla..."/>
          </div>

          {/* hint opcional */}
          <small className="tpl-hint">
            Puedes usar negrilla, listas y adjuntar imágenes. El contenido se
            guardará en HTML.
          </small>
        </div>

        <footer className="tpl-actions">
          <button type="submit" className="tpl-primary" disabled={submiting}>
            {submiting ? "Guardando…" : "Guardar plantilla"}
          </button>
        </footer>
      </form>
    </section>
  );
}
