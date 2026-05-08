import { useState } from "react";
import { CreateTicketModal } from "@/features/requests/components/ticket-request-modal/CreateTicketModal";
import {
  crmFormConfig,
  dataScienceFormConfig,
  developmentUxFormConfig,
  systemsFormConfig,
} from "@/features/requests/components/ticket-request-modal/ticketFormConfigs";
import type { TicketFormConfig } from "@/features/requests/components/ticket-request-modal/ticketFormTypes";

const previewForms: TicketFormConfig[] = [
  developmentUxFormConfig,
  crmFormConfig,
  systemsFormConfig,
  dataScienceFormConfig,
];

export function TicketModalPreviewPage() {
  const [selectedConfig, setSelectedConfig] = useState<TicketFormConfig | null>(
    null
  );

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>Preview formularios de tickets</h1>

      <p style={{ marginBottom: 24, color: "var(--txt-muted)" }}>
        Selecciona un formulario para visualizar el modal correspondiente.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          maxWidth: 980,
        }}
      >
        {previewForms.map((config) => (
          <button
            key={config.id}
            type="button"
            onClick={() => setSelectedConfig(config)}
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              border: "1px solid rgba(148, 163, 184, 0.35)",
              background: "#fff",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "0 8px 22px rgba(15, 23, 42, 0.06)",
            }}
          >
            <strong>{config.title}</strong>

            <span
              style={{
                display: "block",
                marginTop: 8,
                fontSize: 12,
                color: "var(--txt-muted)",
              }}
            >
              {config.fields.length} campos configurados
            </span>
          </button>
        ))}
      </div>

      {selectedConfig && (
        <CreateTicketModal
          open
          config={selectedConfig}
          onClose={() => setSelectedConfig(null)}
        />
      )}
    </div>
  );
}