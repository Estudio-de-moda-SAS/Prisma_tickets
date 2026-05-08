import { TicketDropdown } from "./TicketDropdown";
import type { TicketField } from "./ticketFormTypes";

type TicketRequestFieldProps = {
  field: TicketField;
  value?: string;
  isOpen?: boolean;
  onToggleDropdown?: () => void;
  onChange?: (fieldId: string, value: string) => void;
};

export function TicketRequestField({
  field,
  value = "",
  isOpen = false,
  onToggleDropdown,
  onChange,
}: TicketRequestFieldProps) {
  if (field.type === "textarea") {
    return (
      <label className="create-ticket-modal__field">
        <span>{field.label}</span>

        <textarea
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange?.(field.id, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <TicketDropdown
        label={field.label}
        value={value}
        options={field.options ?? []}
        variant={field.variant}
        isOpen={isOpen}
        onToggle={onToggleDropdown ?? (() => {})}
        onChange={(selectedValue) => onChange?.(field.id, selectedValue)}
      />
    );
  }

  if (field.type === "radio") {
    return (
      <fieldset className="create-ticket-modal__radio-group">
        <legend>{field.label}</legend>

        {(field.options ?? []).map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={field.id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange?.(field.id, option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === "upload") {
    return (
      <div className="create-ticket-modal__field">
        <span>{field.label}</span>

        <button type="button" className="create-ticket-modal__upload">
          <span className="create-ticket-modal__upload-icon">＋</span>
          <span>Cargar archivo, imágenes, videos o documentos</span>
        </button>
      </div>
    );
  }

  return (
    <label className="create-ticket-modal__field create-ticket-modal__field--short">
      <span>{field.label}</span>

      <input
        placeholder={field.placeholder}
        value={value}
        onChange={(event) => onChange?.(field.id, event.target.value)}
      />
    </label>
  );
}