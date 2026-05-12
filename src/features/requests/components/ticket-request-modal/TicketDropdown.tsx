import type { DropdownOption, DropdownVariant } from "./ticketFormTypes";

type TicketDropdownProps = {
  label: string;
  value: string;
  options: DropdownOption[];
  isOpen: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  variant?: DropdownVariant;
};

function getSelectedLabel(options: DropdownOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? "";
}

export function TicketDropdown({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onChange,
  variant = "pills",
}: TicketDropdownProps) {
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
                option.color
                  ? `create-ticket-modal__dropdown-option--${option.color}`
                  : ""
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