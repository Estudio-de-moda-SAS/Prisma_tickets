import { useState } from "react";
import "./CreateTicketModal.css";
import { developmentUxFormConfig } from "./ticketFormConfigs";
import { TicketRequestField } from "./TicketRequestField";
import { PriorityInfoModal } from "./PriorityInfoModal";
import { ConfidentialInfoMessage } from "./ConfidentialInfoMessage";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import type { DropdownKey, TicketFormConfig } from "./ticketFormTypes";

type CreateTicketModalProps = {
  open: boolean;
  onClose: () => void;
  config?: TicketFormConfig;
  onSubmit?: (data: {
    values: Record<string, string>;
    files: File[];
  }) => void;
};

function isSameFile(fileA: File, fileB: File) {
  return (
    fileA.name === fileB.name &&
    fileA.size === fileB.size &&
    fileA.lastModified === fileB.lastModified
  );
}

export function CreateTicketModal({
  open,
  onClose,
  config = developmentUxFormConfig,
  onSubmit,
}: CreateTicketModalProps) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey>(null);
  const [showPriorityInfo, setShowPriorityInfo] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

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

  const handleFilesChange = (files: FileList | null) => {
    if (!files) return;

    setUploadedFiles((currentFiles) => {
      const newFiles = Array.from(files);

      const uniqueNewFiles = newFiles.filter(
        (newFile) =>
          !currentFiles.some((currentFile) =>
            isSameFile(currentFile, newFile)
          )
      );

      return [...currentFiles, ...uniqueNewFiles];
    });
  };

  const handleRemoveFile = (fileToRemove: File) => {
    setUploadedFiles((currentFiles) =>
      currentFiles.filter((file) => !isSameFile(file, fileToRemove))
    );

    if (previewFile && isSameFile(previewFile, fileToRemove)) {
      setPreviewFile(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    onSubmit?.({
      values: formValues,
      files: uploadedFiles,
    });
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

        <form className="create-ticket-modal__form" onSubmit={handleSubmit}>
          {config.fields.map((field) => {
            if (field.id === "store" && formValues.isEcommerce !== "yes") {
              return null;
            }

            if (field.id === "priority") {
              return (
                <div
                  key={field.id}
                  className="create-ticket-modal__priority-row"
                >
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

            if (field.type === "upload") {
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
                    onFilesChange={handleFilesChange}
                  />

                  {uploadedFiles.length > 0 && (
                    <div className="create-ticket-modal__uploaded-files">
                      {uploadedFiles.map((file) => (
                        <div
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                          className="create-ticket-modal__uploaded-file"
                        >
                          <button
                            type="button"
                            className="create-ticket-modal__uploaded-file-name"
                            onClick={() => setPreviewFile(file)}
                            title="Ver archivo adjunto"
                          >
                            📎 {file.name}
                          </button>

                          <button
                            type="button"
                            className="create-ticket-modal__uploaded-file-remove"
                            onClick={() => handleRemoveFile(file)}
                            aria-label={`Eliminar ${file.name}`}
                            title="Eliminar archivo"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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

          <div className="create-ticket-modal__footer">
            <button
              type="button"
              className="create-ticket-modal__secondary-button"
              onClick={onClose}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="create-ticket-modal__submit-button"
            >
              Enviar solicitud
            </button>
          </div>
        </form>

        {showPriorityInfo && (
          <PriorityInfoModal
            info={config.priorityInfo}
            onClose={() => setShowPriorityInfo(false)}
          />
        )}

        {previewFile && (
          <AttachmentPreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
          />
        )}
      </section>
    </div>
  );
}