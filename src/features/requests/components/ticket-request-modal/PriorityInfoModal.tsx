import type { PriorityInfoConfig } from "./ticketFormTypes";

type PriorityInfoModalProps = {
  info: PriorityInfoConfig;
  onClose: () => void;
};

const priorityDotClassByColor: Record<string, string> = {
  red: "create-ticket-modal__priority-dot--urgent",
  orange: "create-ticket-modal__priority-dot--high",
  yellow: "create-ticket-modal__priority-dot--medium",
  green: "create-ticket-modal__priority-dot--low",
};

export function PriorityInfoModal({ info, onClose }: PriorityInfoModalProps) {
  return (
    <div
      className="create-ticket-modal__priority-info"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="create-ticket-modal__priority-info-close"
        onClick={onClose}
        aria-label="Cerrar información de prioridad"
      >
        ×
      </button>

      <p className="create-ticket-modal__priority-info-title">{info.title}</p>

      <div className="create-ticket-modal__priority-info-list">
        {info.items.map((item) => (
          <p key={item.label}>
            <span
              className={`create-ticket-modal__priority-dot ${
                priorityDotClassByColor[item.color]
              }`}
            />
            <strong>{item.label}:</strong> {item.description}
          </p>
        ))}
      </div>
    </div>
  );
}