// src/features/requests/components/ClosureModal.tsx
import React, { useRef, useState, useEffect } from 'react';
import { X, Upload, FileText, Image, File, CheckCircle, AlertCircle, Paperclip } from 'lucide-react';
import type { KanbanColumna, Request } from '../types';

const MAX_FILES = 5;
const MAX_IMAGE_SIZE_MB = 2;

const COL_COLOR: Record<string, string> = {
  ready_to_deploy: '#a78bfa',
  hecho:           'var(--success)',
  historial:       'var(--txt-muted)',
};

const COL_LABEL: Record<string, string> = {
  ready_to_deploy: 'Ready to Deploy',
  hecho:           'Hecho',
  historial:       'Historial',
};

function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={13} />;
  return <File size={13} />;
}

async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= MAX_IMAGE_SIZE_MB * 1024 * 1024) return file;

  return new Promise((resolve) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas  = document.createElement('canvas');
      const scale   = Math.min(1, Math.sqrt((MAX_IMAGE_SIZE_MB * 1024 * 1024) / file.size));
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
canvas.toBlob((blob) => {
  if (!blob) { resolve(file); return; }
  // Castear blob como File — mismo contenido, mismo nombre
  const compressed = Object.assign(blob, { 
    name: file.name, 
    lastModified: Date.now() 
  }) as unknown as File;
  resolve(compressed);
}, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

type Props = {
  request:        Request;
  targetColumna:  KanbanColumna;
  targetColumnId: number;
  onConfirm:      (note: string, attachments: File[]) => void;
  onCancel:       () => void;
  isPending:      boolean;
};

export function ClosureModal({
  request,
  targetColumna,
  onConfirm,
  onCancel,
  isPending,
}: Props) {
  const [note,        setNote]        = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [dragOver,    setDragOver]    = useState(false);
  const [error,       setError]       = useState('');
  const overlayRef  = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const accentColor = COL_COLOR[targetColumna] ?? 'var(--accent)';
  const colLabel    = COL_LABEL[targetColumna] ?? targetColumna;
  const canAddMore  = attachments.length < MAX_FILES;

  useEffect(() => {
    textareaRef.current?.focus();
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCancel]);

  async function addFiles(incoming: File[]) {
    const slots = MAX_FILES - attachments.length;
    const toAdd = incoming.slice(0, slots);
    if (toAdd.length === 0) return;
    setCompressing(true);
    try {
      const processed = await Promise.all(toAdd.map(maybeCompressImage));
      setAttachments((prev) => [...prev, ...processed]);
    } finally {
      setCompressing(false);
    }
  }

  function removeFile(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (isPending) return;
    void addFiles(Array.from(e.dataTransfer.files));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  }

  function handleSubmit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('La nota de cierre es obligatoria.');
      textareaRef.current?.focus();
      return;
    }
    setError('');
    onConfirm(trimmed, attachments);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current && !isPending) onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: 24 }}
    >
      <div style={{
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-panel)', border: `1px solid ${accentColor}40`,
        borderRadius: 14, position: 'relative', boxShadow: `0 0 60px ${accentColor}18`,
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

        {/* Header */}
        <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `${accentColor}15`, border: `1px solid ${accentColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={20} style={{ color: accentColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)' }}>Cerrar solicitud</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, color: accentColor, background: `${accentColor}15`, border: `1px solid ${accentColor}35` }}>
                → {colLabel}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--txt-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.titulo}</p>
          </div>
          <button onClick={onCancel} disabled={isPending}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isPending ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Nota */}
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 8 }}>
              Nota de cierre <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea
              ref={textareaRef}
              value={note}
              onChange={(e) => { setNote(e.target.value); if (error) setError(''); }}
              onKeyDown={handleKeyDown}
              disabled={isPending}
              placeholder="Describe qué se hizo, qué se entregó, o cualquier detalle relevante del cierre… (Ctrl+Enter para confirmar)"
              rows={4}
              style={{
                width: '100%', minHeight: 110, padding: '10px 13px', borderRadius: 8,
                border: `1px solid ${error ? 'var(--danger)' : 'var(--border-subtle)'}`,
                background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 13, lineHeight: 1.6,
                resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
                cursor: isPending ? 'not-allowed' : 'text', opacity: isPending ? 0.6 : 1,
              }}
              onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = `${accentColor}60`; }}
              onBlur={(e)  => { if (!error) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
            />
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>
                <AlertCircle size={12} />{error}
              </div>
            )}
          </div>

          {/* Adjuntos */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>
                Evidencias adjuntas{' '}
                <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>(opcional · máx. {MAX_FILES})</span>
              </label>
              {attachments.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: accentColor }}>{attachments.length}/{MAX_FILES}</span>
              )}
            </div>

            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {attachments.map((file, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${accentColor}08`, border: `1px solid ${accentColor}25` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: `${accentColor}12`, border: `1px solid ${accentColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor }}>
                      <FileIcon mime={file.type} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 1 }}>{fmtBytes(file.size)} · {file.type || 'archivo'}</div>
                    </div>
                    {!isPending && (
                      <button onClick={() => removeFile(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0, borderRadius: 4 }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canAddMore && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isPending && !compressing && fileRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: attachments.length > 0 ? '12px 16px' : '20px 16px', borderRadius: 8,
                  border: `1.5px dashed ${dragOver ? accentColor : 'var(--border-subtle)'}`,
                  background: dragOver ? `${accentColor}06` : 'transparent',
                  cursor: isPending || compressing ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}
              >
                {compressing
                  ? <><Paperclip size={16} style={{ color: accentColor }} /><span style={{ fontSize: 11, color: accentColor }}>Comprimiendo imagen…</span></>
                  : <>
                      <Upload size={attachments.length > 0 ? 14 : 18} style={{ color: dragOver ? accentColor : 'var(--txt-muted)' }} />
                      <span style={{ fontSize: 11, color: dragOver ? accentColor : 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                        {attachments.length > 0
                          ? <>Agregar más · <span style={{ color: accentColor, fontWeight: 600 }}>quedan {MAX_FILES - attachments.length} slots</span></>
                          : <>Arrastra archivos o <span style={{ color: accentColor, fontWeight: 600 }}>haz clic</span> para adjuntar evidencia</>
                        }
                      </span>
                      {attachments.length === 0 && (
                        <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.6 }}>
                          Imágenes (se comprimen auto), PDF, documentos · máx. {MAX_FILES} archivos
                        </span>
                      )}
                    </>
                }
              </div>
            )}

            {!canAddMore && (
              <div style={{ fontSize: 10, color: 'var(--txt-muted)', textAlign: 'center', padding: '6px 0', opacity: 0.7 }}>
                Límite de {MAX_FILES} evidencias alcanzado
              </div>
            )}

            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInput} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} disabled={isPending}
            style={{ padding: '8px 18px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', letterSpacing: 0.5, transition: 'all 0.15s' }}
            onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.borderColor = 'var(--border)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={isPending || !note.trim() || compressing}
            style={{
              padding: '8px 22px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: 'none',
              background: note.trim() && !isPending && !compressing ? accentColor : 'var(--bg-surface)',
              color: note.trim() && !isPending && !compressing ? 'white' : 'var(--txt-muted)',
              cursor: isPending || !note.trim() || compressing ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', letterSpacing: 0.5, transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 7, opacity: isPending ? 0.7 : 1,
            }}>
            <CheckCircle size={13} />
            {isPending ? 'Cerrando…' : compressing ? 'Procesando…' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
}
