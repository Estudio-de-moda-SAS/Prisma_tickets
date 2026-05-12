import { useState } from "react";
import "./CreateTicketModal.css";
import { developmentUxFormConfig } from "./ticketFormConfigs";
import { TicketRequestField } from "./TicketRequestField";
import { PriorityInfoModal } from "./PriorityInfoModal";
import { ConfidentialInfoMessage } from "./ConfidentialInfoMessage";
import type { DropdownKey, TicketFormConfig } from "./ticketFormTypes";

type CreateTicketModalProps = {
  open: boolean;
  onClose: () => void;
  config?: TicketFormConfig;
};

export function CreateTicketModal({
  open,
  onClose,
  config = developmentUxFormConfig,
}: CreateTicketModalProps) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey>(null);
  const [showPriorityInfo, setShowPriorityInfo] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({
    isEcommerce: "yes",
    confidential: "no",
  });

  const handleFieldChange = (fieldId: string, value: string) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      [fieldId]: value,
    }));

    setActiveDropdown(null);
  };

  if (!open) return null;

  return (
    <div className="create-ticket-modal__overlay" onClick={onClose}>
      <section
        className="create-ticket-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="create-ticket-modal__header">
          <h2>{config.title}</h2>

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
          {config.fields.map((field) => {
            if (field.id === "store" && formValues.isEcommerce !== "yes") {
              return null;
            }

            if (field.id === "priority") {
              return (
                <div key={field.id} className="create-ticket-modal__priority-row">
                  <TicketRequestField
                    field={field}
                    value={formValues[field.id] ?? ""}
                    isOpen={activeDropdown === field.id}
                    onToggleDropdown={() =>
                      setActiveDropdown(
                        activeDropdown === field.id ? null : field.id
                      )
                    }
                    onChange={handleFieldChange}
                  />

                  <button
                    type="button"
                    className="create-ticket-modal__help"
                    onClick={() => setShowPriorityInfo(true)}
                  >
                    ¿Prioridad?
                  </button>
                </div>
              );
            }

            return (
              <div key={field.id}>
                <TicketRequestField
                  field={field}
                  value={formValues[field.id] ?? ""}
                  isOpen={activeDropdown === field.id}
                  onToggleDropdown={() =>
                    setActiveDropdown(
                      activeDropdown === field.id ? null : field.id
                    )
                  }
                  onChange={handleFieldChange}
                />

                {field.id === "confidential" &&
                  formValues.confidential === "yes" && (
                    <ConfidentialInfoMessage info={config.confidentialInfo} />
                  )}
              </div>
            );
          })}
        </form>

        {showPriorityInfo && (
          <PriorityInfoModal
            info={config.priorityInfo}
            onClose={() => setShowPriorityInfo(false)}
          />
        )}
      </section>
    </div>
  );
}