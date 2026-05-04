import { useState } from "react";
import "./CreateTicketModal.css";

type CreateTicketModalProps = {
  open: boolean;
  onClose: () => void;
};

type DropdownOption = {
  label: string;
  value: string;
  color?: "yellow" | "pink" | "blue" | "green" | "cyan" | "orange" | "purple" | "red";
};

type DropdownKey = "store" | "requestTeam" | "priority" | null;

const storeOptions: DropdownOption[] = [
  { label: "Pilatos", value: "pilatos", color: "yellow" },
  { label: "Chopper", value: "chopper", color: "pink" },
  { label: "Girbaud", value: "girbaud", color: "blue" },
  { label: "Replay", value: "replay", color: "green" },
  { label: "Diesel", value: "diesel", color: "cyan" },
  { label: "Superdry", value: "superdry", color: "orange" },
  { label: "Kipling", value: "kipling", color: "purple" },
];

const requestTeamOptions: DropdownOption[] = [
  { label: "Pilatos y Chopper Ecom", value: "pilatos-chopper-ecom" },
  { label: "Girbaud y Replay Ecom", value: "girbaud-replay-ecom" },
  { label: "Kipling, Diesel y Superdry Ecom", value: "kipling-diesel-superdry-ecom" },
];

const priorityOptions: DropdownOption[] = [
  { label: "Urgente", value: "urgente", color: "red" },
  { label: "Alto", value: "alto", color: "orange" },
  { label: "Medio", value: "medio", color: "yellow" },
  { label: "Bajo", value: "bajo", color: "green" },
];

function getSelectedLabel(options: DropdownOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? "";
}

function TicketDropdown({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onChange,
  variant = "pills",
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  isOpen: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  variant?: "pills" | "lines";
}) {
  return (
    <div className="create-ticket-modal__dropdown-field">
      <span>{label}</span>

      <button
        type="button"
        className="create-ticket-modal__dropdown-trigger"
        onClick={onToggle}
      >
        <span>{getSelectedLabel(options, value)}</span>
        <span className="create-ticket-modal__dropdown-chevron">⌄</span>
      </button>

      {isOpen && (
        <div
          className={`create-ticket-modal__dropdown-panel create-ticket-modal__dropdown-panel--${variant}`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`create-ticket-modal__dropdown-option ${
                option.color ? `create-ticket-modal__dropdown-option--${option.color}` : ""
              }`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateTicketModal({ open, onClose }: CreateTicketModalProps) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey>(null);
  const [showPriorityInfo, setShowPriorityInfo] = useState(false);

  const [store, setStore] = useState("");
  const [requestTeam, setRequestTeam] = useState("");
  const [priority, setPriority] = useState("");

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

          <TicketDropdown
            label="Tienda"
            value={store}
            options={storeOptions}
            isOpen={activeDropdown === "store"}
            onToggle={() =>
              setActiveDropdown(activeDropdown === "store" ? null : "store")
            }
            onChange={(value) => {
              setStore(value);
              setActiveDropdown(null);
            }}
          />

          <TicketDropdown
            label="Equipo solicitante"
            value={requestTeam}
            options={requestTeamOptions}
            isOpen={activeDropdown === "requestTeam"}
            variant="lines"
            onToggle={() =>
              setActiveDropdown(activeDropdown === "requestTeam" ? null : "requestTeam")
            }
            onChange={(value) => {
              setRequestTeam(value);
              setActiveDropdown(null);
            }}
          />

          <div className="create-ticket-modal__priority-row">
            <TicketDropdown
              label="Prioridad"
              value={priority}
              options={priorityOptions}
              isOpen={activeDropdown === "priority"}
              onToggle={() =>
                setActiveDropdown(activeDropdown === "priority" ? null : "priority")
              }
              onChange={(value) => {
                setPriority(value);
                setActiveDropdown(null);
              }}
            />

            <button
              type="button"
              className="create-ticket-modal__help"
              onClick={() => setShowPriorityInfo(true)}
            >
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

        {showPriorityInfo && (
          <div
            className="create-ticket-modal__priority-info"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="create-ticket-modal__priority-info-close"
              onClick={() => setShowPriorityInfo(false)}
              aria-label="Cerrar información de prioridad"
            >
              ×
            </button>

            <p className="create-ticket-modal__priority-info-title">
              Elige la prioridad así: Por favor ser muy honesto en este campo.
            </p>

            <div className="create-ticket-modal__priority-info-list">
              <p>
                <span className="create-ticket-modal__priority-dot create-ticket-modal__priority-dot--urgent" />
                <strong>Urgente:</strong> Procesos críticos que detienen total o parcialmente la
                operación de la compañía (Vtex caído)
              </p>

              <p>
                <span className="create-ticket-modal__priority-dot create-ticket-modal__priority-dot--high" />
                <strong>Alto:</strong> Impacta de forma importante el trabajo, pero no detiene
                completamente la operación. (De alta relevancia a la compañía)
              </p>

              <p>
                <span className="create-ticket-modal__priority-dot create-ticket-modal__priority-dot--medium" />
                <strong>Medio:</strong> Necesario para el funcionamiento regular pero no afecta
                actividades críticas. Puede resolverse en un tiempo estándar (Automatización que
                libere horas hombre en procesos operativos, etc.)
              </p>

              <p>
                <span className="create-ticket-modal__priority-dot create-ticket-modal__priority-dot--low" />
                <strong>Bajo:</strong> Tareas de conveniencia o solicitudes que no afectan el
                trabajo diario. No tienen urgencia ni impacto operacional (Mejora o cambio de
                proceso actual que requiera ajustes mínimos para su funcionamiento o soporte, etc.)
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}