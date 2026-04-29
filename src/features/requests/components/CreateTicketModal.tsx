import "./CreateTicketModal.css";

type CreateTicketModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateTicketModal({ open, onClose }: CreateTicketModalProps) {
  if (!open) return null;

  return (
    <div className="create-ticket-modal__overlay">
      <section className="create-ticket-modal" role="dialog" aria-modal="true">
        <header className="create-ticket-modal__header">
          <h2>Nueva solicitud equipo Desarrollo + UX</h2>

          <button
            type="button"
            className="create-ticket-modal__close"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </header>

        <form className="create-ticket-modal__form">
          <label className="create-ticket-modal__field create-ticket-modal__field--short">
            <span>Nombre de la solicitud</span>
            <input placeholder="Ej: Nueva landing estrategia 2 por 1" />
          </label>

          <label className="create-ticket-modal__field">
            <span>Descripción</span>
            <textarea placeholder="Cuéntanos todo acerca de esta tarea con el mayor detalle para comprender y ejecutar la solicitud" />
          </label>

          <fieldset className="create-ticket-modal__radio-group">
            <legend>¿Haces parte del equipo Ecommerce?</legend>

            <label>
              <input type="radio" name="isEcommerce" />
              <span>No</span>
            </label>

            <label>
              <input type="radio" name="isEcommerce" defaultChecked />
              <span>Sí</span>
            </label>
          </fieldset>

          <label className="create-ticket-modal__field create-ticket-modal__field--select">
            <span>Tienda</span>
            <select>
              <option value="">Selecciona una tienda</option>
            </select>
          </label>

          <label className="create-ticket-modal__field create-ticket-modal__field--select">
            <span>Equipo solicitante</span>
            <select>
              <option value="">Selecciona un equipo</option>
            </select>
          </label>

          <div className="create-ticket-modal__priority-row">
            <label className="create-ticket-modal__field create-ticket-modal__field--select">
              <span>Prioridad</span>
              <select>
                <option value="">Selecciona prioridad</option>
              </select>
            </label>

            <button type="button" className="create-ticket-modal__help">
              ¿Prioridad?
            </button>
          </div>

          <fieldset className="create-ticket-modal__radio-group">
            <legend>¿Contiene información confidencial?</legend>

            <label>
              <input type="radio" name="confidential" />
              <span>No</span>
            </label>

            <label>
              <input type="radio" name="confidential" defaultChecked />
              <span>Sí</span>
            </label>
          </fieldset>

          <div className="create-ticket-modal__field">
            <span>Soporte, documentación y/o anexos</span>

            <button type="button" className="create-ticket-modal__upload">
              <span className="create-ticket-modal__upload-icon">＋</span>
              <span>Cargar archivo, imágenes, videos o documentos</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}