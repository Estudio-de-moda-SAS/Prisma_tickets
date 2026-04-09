import React, { useEffect, useMemo, useRef, useState } from "react";
import "./RichTextBase64.css";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  imageSize?: { width: number; height?: number; fit?: "contain" | "cover" };
};

export default function RichTextBase64({value, onChange, placeholder = "Escribe aquí…", readOnly, className = "", imageSize = { width: 480 }}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [hasFocus, setHasFocus] = useState(false);

  // Sincroniza HTML externo → editor
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  };

  // ¿La selección/caret está dentro del editor?
  const isSelectionInsideEditor = () => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return false;
    return el.contains(sel.anchorNode);
  };

  const placeCaretAtEnd = (el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const buildImgHTML = (src: string) => {
    const w = imageSize.width;
    const h = imageSize.height;
    const fit = imageSize.fit ?? "contain";

    // width/height por atributo aseguran el tamaño, y style controla el ajuste/overflow
    // max-width:100% evita derrames si el contenedor es más pequeño
    if (h) {
      return `<img src="${src}" width="${w}" height="${h}" style="display:block; object-fit:${fit}; max-width:100%; width:${w}px; height:${h}px;" />`;
    }
    return `<img src="${src}" width="${w}" style="display:block; object-fit:${fit}; max-width:100%; width:${w}px; height:auto;" />`;
  };

  // Inserta HTML solo si el foco/selección están en el editor
  const insertHTMLAtCursor = (html: string) => {
    const el = editorRef.current;
    if (!el) return;

    if (!isSelectionInsideEditor()) {
      if (!hasFocus) return; // bloquea si no hay foco en el editor
      el.focus();
      placeCaretAtEnd(el);
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    range.insertNode(frag);
    sel.collapseToEnd();
    handleInput();
  };

  // File → dataURL
  const fileToDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

  // Pegar imágenes (solo si la selección está en el editor)
  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = async (e) => {
    if (!isSelectionInsideEditor()) return;
    if (!e.clipboardData) return;

    const files: File[] = [];
    for (const item of e.clipboardData.items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length === 0) return;

    e.preventDefault();
    for (const file of files) {
      const dataUrl = await fileToDataURL(file);
      insertHTMLAtCursor(buildImgHTML(dataUrl));
    }
  };

  // Drag & drop (solo si la selección está en el editor)
  const handleDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    if (!isSelectionInsideEditor()) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    for (const f of imgs) {
      const dataUrl = await fileToDataURL(f);
      insertHTMLAtCursor(buildImgHTML(dataUrl));
    }
  };

  const preventDefault: React.DragEventHandler<HTMLDivElement> = (e) => e.preventDefault();

  // execCommand: bloquea si selección está fuera
  const cmd = (command: string, value?: string) => {
    if (!isSelectionInsideEditor()) return;
    document.execCommand(command, false, value);
    handleInput();
  };

  const Toolbar = useMemo(() => {
    // No permitir que los botones roben el foco al editor
    const btnBase = {
      disabled: !hasFocus || !!readOnly,
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
    };

    return (
      <div className="rte-toolbar" aria-disabled={!hasFocus || !!readOnly}>
        <button type="button" {...btnBase} onClick={() => cmd("bold")} title="Negrita">
          B
        </button>
        <button type="button" {...btnBase} onClick={() => cmd("italic")} title="Cursiva">
          <i>I</i>
        </button>
        <button type="button" {...btnBase} onClick={() => cmd("underline")} title="Subrayado">
          <u>U</u>
        </button>

        <span className="rte-sep" />

        <button type="button" {...btnBase} onClick={() => cmd("insertUnorderedList")} title="Viñetas">
          • List
        </button>
        <button type="button" {...btnBase} onClick={() => cmd("insertOrderedList")} title="Numerada">
          1. List
        </button>

        <span className="rte-sep" />

        <button
          type="button"
          {...btnBase}
          onClick={() => {
            if (!isSelectionInsideEditor()) return;
            const url = prompt("URL del enlace:");
            if (url) cmd("createLink", url);
          }}
          title="Enlace"
        >
          🔗
        </button>

        <button type="button" {...btnBase} title="Insertar imagen" onClick={async () => {
                                                      if (!isSelectionInsideEditor()) return;
                                                      const input = document.createElement("input");
                                                      input.type = "file";
                                                      input.accept = "image/*";
                                                      input.onchange = async () => {
                                                        const f = input.files?.[0];
                                                        if (!f) return;
                                                        const dataUrl = await fileToDataURL(f);
                                                        insertHTMLAtCursor(buildImgHTML(dataUrl));
                                                      };
                                                      input.click();
                                                    }}>
          🖼️
        </button>

        <button type="button" {...btnBase} onClick={() => cmd("removeFormat")} title="Limpiar">
          ⨂
        </button>
      </div>
    );
  }, [hasFocus, readOnly]);

  return (
    <div className={`rte ${className}`}>
      {!readOnly && Toolbar}

      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable={!readOnly}
        onInput={handleInput}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={preventDefault}
        onDragEnter={preventDefault}
        onDragLeave={preventDefault}
        onFocus={() => setHasFocus(true)}
        onBlur={() => setHasFocus(false)}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
}
