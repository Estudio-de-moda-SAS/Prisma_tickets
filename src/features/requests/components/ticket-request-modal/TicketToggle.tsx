type TicketToggleProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export function TicketToggle({ label, value, onChange }: TicketToggleProps) {
  return (
    <div className="create-ticket-modal__toggle-group">
      <span className="create-ticket-modal__toggle-label">{label}</span>

      <button
        type="button"
        className={`create-ticket-modal__toggle ${
          value
            ? "create-ticket-modal__toggle--yes"
            : "create-ticket-modal__toggle--no"
        }`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className="create-ticket-modal__toggle-text">
          {value ? "SÍ" : "NO"}
        </span>

        <span className="create-ticket-modal__toggle-thumb" />
      </button>
    </div>
  );
}