import * as React from "react";
import DOMPurify from "dompurify";
import { createPortal } from "react-dom";

type Props = {
  html?: string;
  className?: string;
  enableImagePreview?: boolean; // on/off
};

export default function HtmlContent({
  html = "",
  className,
  enableImagePreview = true,
}: Props) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Sanitizar el HTML (permite data:image/... para embebidas)
  const clean = React.useMemo(() => {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp));)/i,
      ADD_ATTR: ["target", "rel"],
    });
  }, [html]);

  // Estado del lightbox
  const [open, setOpen] = React.useState(false);
  const [src, setSrc] = React.useState<string | null>(null);
  const [alt, setAlt] = React.useState<string>("");

  // Cerrar con ESC
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Delegación de eventos: click sobre IMG
  const onClick = React.useCallback((e: React.MouseEvent) => {
    if (!enableImagePreview) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Si está dentro de un <a> y el usuario quiere navegar (Ctrl/Cmd), respeta.
    const wantsNavigate = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1;

    // Si el click real fue sobre una IMG (o dentro de ella)…
    const img = target.closest("img") as HTMLImageElement | null;
    if (img && !wantsNavigate) {
      e.preventDefault();      // evita navegar si la IMG está envuelta en <a>
      e.stopPropagation();
      setSrc(img.currentSrc || img.src);
      setAlt(img.alt || "");
      setOpen(true);
    }
  }, [enableImagePreview]);

  // Render
  return (
    <>
      <div
        ref={wrapperRef}
        className={className}
        onClick={onClick}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {open && src && createPortal(
        <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />,
        document.body
      )}
    </>
  );
}

/* ---------- Lightbox (modal simple) ---------- */

function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Vista previa de imagen"}
      onClick={onClose}
      style={overlayStyle}
    >
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} style={imgStyle} />
        <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Cerrar">×</button>
      </div>
    </div>
  );
}

/* ---------- estilos inline mínimos (ponlos en tu CSS si prefieres) ---------- */

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 16,
};

const contentStyle: React.CSSProperties = {
  position: "relative",
  maxWidth: "100%",
  maxHeight: "100%",
  borderRadius: 8,
  overflow: "hidden",       // opcional, para que la imagen no “sangre” fuera
  background: "#000",       // opcional, marco negro detrás de la imagen
};

const imgStyle: React.CSSProperties = {
  display: "block",
  maxWidth: "95vw",
  maxHeight: "95vh",
  objectFit: "contain",
  borderRadius: 8,
  boxShadow: "0 10px 30px rgba(0,0,0,.4)",
};

const closeBtnStyle: React.CSSProperties = {
  position: "absolute", // o fixed si usas la opción B
  top: 8,
  right: 8,
  width: 36,
  height: 36,
  border: "none",
  borderRadius: "9999px",
  background: "rgba(255,255,255,0.95)",
  boxShadow: "0 2px 10px rgba(0,0,0,.25)",
  cursor: "pointer",
  padding: 0,
  display: "flex",                 // 👈
  alignItems: "center",            // 👈
  justifyContent: "center",        // 👈
  fontSize: 22,
  lineHeight: 1,                   // 👈 evita baseline raro
};