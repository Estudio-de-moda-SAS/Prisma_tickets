// src/features/requests/components/ClosureModal.tsx
import React, { useRef, useState, useEffect } from 'react';
import { X, Upload, FileText, Image, File, CheckCircle, AlertCircle } from 'lucide-react';
import type { KanbanColumna, Request } from '../types';

const COL_COLOR: Record<string, string> = {
  ready_to_deploy: '#a78bfa',
  hecho:           'var(--success)',
};

const COL_LABEL: Record<string, string> = {
  ready_to_deploy: 'Ready to Deploy',
  hecho:           'Hecho',
};

function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={14} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={14} />;
  return <File size={14} />;
}

type Props = {
  request:      Request;
  targetColumna: KanbanColumna;
  targetColumnId: number;
  onConfirm:    (note: string, attachment: File | null) => void;
  onCancel:     () => void;
  isPending:    boolean;
};

export function ClosureModal({
  request,
  targetColumna,
  onConfirm,
  onCancel,
  isPending,
}: Props) {
  const [note,       setNote]       = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [error,      setError]      = useState('');
  const overlayRef  = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const accentColor = COL_COLOR[targetColumna] ?? 'var(--accent)';
  const colLabel    = COL_LABEL[targetColumna] ?? targetColumna;

  useEffect(() => {
    textareaRef.current?.focus();
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCancel]);

  function handleFile(file: File | null) {
    if (!file) return;
    setAttachment(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  }

  function handleSubmit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('La nota de cierre es obligatoria.');
      textareaRef.current?.focus();
      return;
    }
    setError('');
    onConfirm(trimmed, attachment);
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
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 150, padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--bg-panel)',
        border: `1px solid ${accentColor}40`,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: `0 0 60px ${accentColor}18`,
      }}>
        {/* Barra de acento superior */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        }} />

        {/* Header */}
        <div style={{
          padding: '18px 22px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          {/* Icono */}
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle size={20} style={{ color: accentColor }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)' }}>
                Cerrar solicitud
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 4,
                color: accentColor,
                background: `${accentColor}15`,
                border: `1px solid ${accentColor}35`,
              }}>
                → {colLabel}
              </span>
            </div>
            <p style={{
              fontSize: 12, color: 'var(--txt-muted)', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {request.titulo}
            </p>
          </div>

          <button
            onClick={onCancel}
            disabled={isPending}
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'transparent', color: 'var(--txt-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isPending ? 'not-allowed' : 'pointer', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Nota */}
          <div>
            <label style={{
              display: 'block', fontSize: 9, fontWeight: 700,
              letterSpacing: 2, textTransform: 'uppercase',
              color: 'var(--txt-muted)', marginBottom: 8,
            }}>
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
                width: '100%', minHeight: 110,
                padding: '10px 13px',
                borderRadius: 8,
                border: `1px solid ${error ? 'var(--danger)' : 'var(--border-subtle)'}`,
                background: 'var(--bg-surface)',
                color: 'var(--txt)', fontSize: 13, lineHeight: 1.6,
                resize: 'vertical', outline: 'none',
                fontFamily: 'var(--font-body)',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
                cursor: isPending ? 'not-allowed' : 'text',
                opacity: isPending ? 0.6 : 1,
              }}
              onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = `${accentColor}60`; }}
              onBlur={(e)  => { if (!error) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
            />
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                marginTop: 6, fontSize: 11, color: 'var(--danger)',
              }}>
                <AlertCircle size={12} />
                {error}
              </div>
            )}
          </div>

          {/* Adjunto */}
          <div>
            <label style={{
              display: 'block', fontSize: 9, fontWeight: 700,
              letterSpacing: 2, textTransform: 'uppercase',
              color: 'var(--txt-muted)', marginBottom: 8,
            }}>
              Evidencia adjunta <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--txt-muted)' }}>(opcional)</span>
            </label>

            {attachment ? (
              /* Previsualización del archivo seleccionado */
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                background: `${accentColor}08`,
                border: `1px solid ${accentColor}30`,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 7, flexShrink: 0,
                  background: `${accentColor}12`,
                  border: `1px solid ${accentColor}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: accentColor,
                }}>
                  <FileIcon mime={attachment.type} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--txt)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {attachment.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 1 }}>
                    {fmtBytes(attachment.size)} · {attachment.type || 'archivo'}
                  </div>
                </div>
                {!isPending && (
                  <button
                    onClick={() => setAttachment(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--txt-muted)', padding: 4,
                      display: 'flex', alignItems: 'center', opacity: 0.6,
                      flexShrink: 0, borderRadius: 4,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--txt-muted)'; }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ) : (
              /* Zona de drop */
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isPending && fileRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '20px 16px', borderRadius: 8,
                  border: `1.5px dashed ${dragOver ? accentColor : 'var(--border-subtle)'}`,
                  background: dragOver ? `${accentColor}06` : 'transparent',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Upload size={18} style={{ color: dragOver ? accentColor : 'var(--txt-muted)' }} />
                <span style={{
                  fontSize: 11, color: dragOver ? accentColor : 'var(--txt-muted)',
                  textAlign: 'center', lineHeight: 1.5,
                }}>
                  Arrastra un archivo o <span style={{ color: accentColor, fontWeight: 600 }}>haz clic</span> para adjuntar evidencia
                </span>
                <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.6 }}>
                  Imágenes, PDF, documentos
                </span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px 18px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={onCancel}
            disabled={isPending}
            style={{
              padding: '8px 18px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border-subtle)',
              background: 'transparent', color: 'var(--txt-muted)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', letterSpacing: 0.5,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.borderColor = 'var(--border)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            disabled={isPending || !note.trim()}
            style={{
              padding: '8px 22px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              border: 'none',
              background: note.trim() && !isPending ? accentColor : 'var(--bg-surface)',
              color: note.trim() && !isPending ? 'white' : 'var(--txt-muted)',
              cursor: isPending || !note.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', letterSpacing: 0.5,
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 7,
              opacity: isPending ? 0.7 : 1,
            }}
          >
            <CheckCircle size={13} />
            {isPending ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
}