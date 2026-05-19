import { useEffect, useMemo, useState } from "react";

type AttachmentPreviewModalProps = {
  file: File;
  onClose: () => void;
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)
  );
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function AttachmentPreviewModal({
  file,
  onClose,
}: AttachmentPreviewModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const pdfUrl = useMemo(() => {
    if (!isPdfFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const isImage = isImageFile(file);
  const isPdf = isPdfFile(file);

  useEffect(() => {
    if (!isImage) return;

    const reader = new FileReader();

    reader.onload = () => {
      setImageSrc(typeof reader.result === "string" ? reader.result : null);
    };

    reader.onerror = () => {
      setImageError(true);
    };

    reader.readAsDataURL(file);
  }, [file, isImage]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  return (
    <div
      className="create-ticket-modal__attachment-preview-overlay"
      onClick={onClose}
    >
      <div
        className="create-ticket-modal__attachment-preview"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="create-ticket-modal__attachment-preview-header">
          <div>
            <h3>Vista previa del adjunto</h3>
            <p>
              {file.name} · {formatFileSize(file.size)}
            </p>
          </div>

          <button
            type="button"
            className="create-ticket-modal__attachment-preview-close"
            onClick={onClose}
            aria-label="Cerrar vista previa"
          >
            ×
          </button>
        </header>

        <div className="create-ticket-modal__attachment-preview-body">
          {isImage && imageSrc && !imageError && (
            <img
              src={imageSrc}
              alt={file.name}
              className="create-ticket-modal__attachment-preview-image"
            />
          )}

          {isImage && !imageSrc && !imageError && (
            <div className="create-ticket-modal__attachment-preview-empty">
              <span>⏳</span>
              <strong>Cargando vista previa...</strong>
            </div>
          )}

          {isImage && imageError && (
            <div className="create-ticket-modal__attachment-preview-empty">
              <span>⚠️</span>
              <strong>No se pudo cargar la imagen.</strong>
              <p>Confirma el archivo por nombre y tamaño antes de enviarlo.</p>
            </div>
          )}

          {isPdf && !isImage && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={file.name}
              className="create-ticket-modal__attachment-preview-frame"
            />
          )}

          {!isImage && !isPdf && (
            <div className="create-ticket-modal__attachment-preview-empty">
              <span>📎</span>
              <strong>No hay vista previa disponible para este tipo de archivo.</strong>
              <p>Puedes confirmar el nombre y tamaño del archivo antes de enviarlo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}