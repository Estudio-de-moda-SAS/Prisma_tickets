import { TicketDropdown } from "./TicketDropdown";
import { TicketToggle } from "./TicketToggle";
import type { TicketField } from "./ticketFormTypes";

type TicketRequestFieldProps = {
  field: TicketField;
  value?: string;
  isOpen?: boolean;
  onToggleDropdown?: () => void;
  onChange?: (fieldId: string, value: string) => void;
  onFilesChange?: (files: FileList | null) => void;
};

export function TicketRequestField({
  field,
  value = "",
  isOpen = false,
  onToggleDropdown,
  onChange,
  onFilesChange,
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
      <TicketToggle
        label={field.label}
        value={value === "yes"}
        onChange={(checked) => onChange?.(field.id, checked ? "yes" : "no")}
      />
    );
  }

  if (field.type === "upload") {
    return (
      <label className="create-ticket-modal__field">
        <span>{field.label}</span>

        <input
          className="create-ticket-modal__file-input"
          type="file"
          multiple
          onChange={(event) => onFilesChange?.(event.target.files)}
        />

        <span className="create-ticket-modal__upload">
          <span className="create-ticket-modal__upload-icon">＋</span>
          <span>Cargar archivo, imágenes, videos o documentos</span>
        </span>
      </label>
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