// src/pages/integrations/SolviRequestPage.tsx
import { useRef, useState } from 'react';
import { useNavigate, } from 'react-router';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { config } from '@/config';
import { compressImage } from '@/lib/compressImage';
import { Upload, X, FileText, Image, File as FileIcon2, Plus, ShieldAlert } from 'lucide-react';
import { useIsMobile } from '@/components/hooks/useMediaQuery';
import { RichTextEditor } from '@/features/requests/components/RichTextEditor';
import { useSolviActionsTickets } from '@/features/requests/hooks/useSolviActions';
import { useSolviCategorias } from '@/features/requests/hooks/useSolviCategorias';
import React from 'react';

/* ============================================================
   SOLVI — Página de creación de solicitud (integración externa)
   ────────────────────────────────────────────────────────────
   SOLVI se opera en su propia aplicación, pero desde PRISMA se puede
   crear una solicitud. NO usa TBL_Requests: los tickets viven en
   TBL_Ticket_Solvi (esquema propio). El formulario es fijo: solo
   título, descripción y adjuntos — el resto de la gestión (estado,
   resolutor, categoría, etc.) se hace en la app de SOLVI.

   ⚠️ El GUARDADO está pendiente de conectar — ver handleSubmit más abajo.
   ============================================================ */

const MAX_ATTACHMENTS = 5;

function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={13} />;
  return <FileIcon2 size={13} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 7 }}>{children}</label>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.18)', padding: '3px 10px', borderRadius: 3, flexShrink: 0 }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

function inputStyle(focused: boolean, error = false): React.CSSProperties {
  const borderColor = error ? 'rgba(255,71,87,0.55)' : focused ? 'rgba(0,200,255,0.4)' : 'var(--border-subtle)';
  return { width: '100%', background: 'transparent', border: `1px solid ${borderColor}`, borderRadius: 6, padding: '10px 13px', color: 'var(--txt)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' };
}

function FieldError({ show, text = 'Este campo es obligatorio.' }: { show: boolean; text?: string }) {
  if (!show) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 10, color: 'var(--danger)' }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><line x1="5" y1="2.5" x2="5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5" cy="7" r="0.5" fill="currentColor"/></svg>
      {text}
    </span>
  );
}

function cardStyle(accent: string): React.CSSProperties {
  return { background: 'var(--bg-panel)', border: `1px solid ${accent}20`, borderRadius: 10, padding: '20px 22px', position: 'relative', overflow: 'hidden' };
}

const FALLBACK_ACCENT = '#00b894';

export function SolviRequestPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data: currentUser, isError: userError } = useCurrentUser();
  const { data: teams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const solviController = useSolviActionsTickets(currentUser)
  const {data: categories = [], refetch} = useSolviCategorias()

  // Equipo SOLVI por su clave de integración: robusto venga de redirect,
  // sidebar o URL directa. De ahí sale el color definido al crear el kanban.
  const solviTeam = teams.find((t) => t.Board_Team_Integration_Key === 'solvi') ?? null;
  const ACCENT = solviTeam?.Board_Team_Color ?? FALLBACK_ACCENT;


  const [titulo,       setTitulo]       = useState('');
  const [descripcion,  setDescripcion]  = useState('');
  // TODO(SOLVI): categoría seleccionada — por ahora solo vive en el front,
  // aún no se envía a saveTicket (ver handleSubmit). Si querés hacerla
  // obligatoria, sumala a `isReady` más abajo.
  const [categoria,    setCategoria]    = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [dragOver,     setDragOver]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [isPending,    setIsPending]    = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dataLoading = !currentUser;

  // Errores en vivo (solo tras el primer intento) → se limpian solos al corregir.
  const titleError    = submitAttempted && !titulo.trim();
  const categoriaError = submitAttempted && !categoria;

  React.useEffect(() => {
    refetch()
  }, [refetch]);

  function addFiles(incoming: File[]) {
    const slots = MAX_ATTACHMENTS - pendingFiles.length;
    const toAdd = incoming.slice(0, slots);
    if (toAdd.length > 0) setPendingFiles([...pendingFiles, ...toAdd]);
  }
  function removeFile(idx: number) { setPendingFiles(pendingFiles.filter((_, i) => i !== idx)); }

  async function handleSubmit(e: React.FormEvent, titulo: string, descripcion: string) {
    e.preventDefault();
    setSubmitAttempted(true); // a partir de acá los campos muestran su error en vivo

    if (!currentUser) { setError('Cargando datos del usuario...'); return; }

    const titleMissing     = !titulo.trim();
    const categoriaMissing = !categoria;

    if (titleMissing || categoriaMissing) {
      const firstKey = titleMissing ? 'titulo' : 'categoria';
      const total    = (titleMissing ? 1 : 0) + (categoriaMissing ? 1 : 0);
      setError(
        total === 1
          ? 'Falta 1 campo obligatorio. Revisá lo señalado en rojo.'
          : `Faltan ${total} campos obligatorios. Revisá lo señalado en rojo.`,
      );
      requestAnimationFrame(() => {
        document.querySelector(`[data-vfield="${firstKey}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    setError(null);
    setIsPending(true);

    try {

      const created = await solviController.saveTicket(titulo, descripcion, pendingFiles, categoria)

      if(!created){
        alert("Algo ha salido mal")
        throw Error("Algo ha salido mal")
      }

      void compressImage;
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la solicitud.');
    } finally {
      setIsPending(false);
    }
  }

  if (userError) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 28px', textAlign: 'center' }}>
        <ShieldAlert size={28} style={{ color: '#ff4757' }} />
        <p style={{ fontSize: 13, color: 'var(--txt-muted)' }}>No pudimos cargar tu usuario. Intentá de nuevo.</p>
        <button type="button" onClick={() => navigate('/home')} style={{ padding: '10px 24px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', cursor: 'pointer' }}>Volver al inicio</button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 900, width: '100%', margin: '0 auto', padding: isMobile ? '0 14px 24px' : '0 28px 32px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 28px', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(0,229,160,0.08)', border: '1.5px solid rgba(0,229,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(0,229,160,0.12)' }}>
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M6 17l8 8 14-14" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ maxWidth: 440 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 12 }}>Solicitud enviada</h2>
            <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.75 }}>Recibimos tu solicitud para SOLVI. El equipo la gestionará desde su plataforma.</p>
          </div>
          <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" onClick={() => { setTitulo(''); setDescripcion(''); setPendingFiles([]); setSubmitted(false); setError(null); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '13px 28px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`, color: 'white', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
              <Plus size={15} /> Crear otra solicitud
            </button>
            <button type="button" onClick={() => navigate('/home')} style={{ padding: '12px 28px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', cursor: 'pointer' }}>
              ← Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e: any) => handleSubmit(e, titulo, descripcion)} style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: isMobile ? '0 14px 24px' : '0 50px 32px', width: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>🔌</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, padding: '3px 10px', borderRadius: 3 }}>SOLVI</span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 8 }}>Nueva solicitud SOLVI</h2>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>Completá los datos básicos. La gestión posterior se realiza en la plataforma de SOLVI.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={cardStyle(ACCENT)}>
          <SectionLabel>Solicitud</SectionLabel>
          <div style={{ marginBottom: 16 }} data-vfield="titulo">
            <FieldLabel>Asunto *</FieldLabel>
            <input style={{ ...inputStyle(focusedField === 'titulo', titleError), fontSize: 15, fontWeight: 500, padding: '12px 14px' }} value={titulo} onChange={(e) => { setTitulo(e.target.value); setError(null); }} onFocus={() => setFocusedField('titulo')} onBlur={() => setFocusedField(null)} placeholder="Describe brevemente el problema..." />
            <FieldError show={titleError} text="El asunto es obligatorio." />
          </div>
          <div>
            <FieldLabel>Solicitante</FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{(currentUser?.User_Name ?? '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{currentUser?.User_Name ?? 'Cargando...'}</div>
                {(currentUser?.team?.Team_Name ?? currentUser?.department?.Department_Name) && (
                  <div style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 }}>
                    {currentUser?.team?.Team_Name ?? currentUser?.department?.Department_Name}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Categoría (solo front — pendiente de conexión) ── */}
        <div style={cardStyle(ACCENT)} data-vfield="categoria">
          <SectionLabel>Categoría</SectionLabel>
          <FieldLabel>Categoría *</FieldLabel>
          <select
            style={{ ...inputStyle(focusedField === 'categoria', categoriaError), color: categoria ? 'var(--txt)' : 'var(--txt-muted)', cursor: 'pointer' }}
            value={categoria}
            onChange={(e) => { setCategoria(e.target.value); setError(null); }}
            onFocus={() => setFocusedField('categoria')}
            onBlur={() => setFocusedField(null)}
          >
            <option value="">Seleccioná una categoría…</option>
            {categories.map((c) => <option key={c.Id} value={c.Title}>{c.Title}</option>)}
          </select>
          <FieldError show={categoriaError} text="Seleccioná una categoría." />
        </div>

        <div style={cardStyle(ACCENT)}>
          <SectionLabel>Descripción</SectionLabel>
          <RichTextEditor
            value={descripcion}
            onChange={setDescripcion}
            placeholder="Describe el problema con detalle..."
            accent={ACCENT}
          />
        </div>

        <div style={cardStyle(ACCENT)}>
          <SectionLabel>Adjuntos <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 9 }}>(opcional · máx. {MAX_ATTACHMENTS})</span></SectionLabel>
          {pendingFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {pendingFiles.map((file, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${ACCENT}08`, border: `1px solid ${ACCENT}25` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 6, background: `${ACCENT}12`, border: `1px solid ${ACCENT}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, flexShrink: 0 }}><AttachmentIcon mime={file.type} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div><div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 1 }}>{fmtBytes(file.size)}</div></div>
                  <button type="button" onClick={() => removeFile(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          {pendingFiles.length < MAX_ATTACHMENTS && (
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }} onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: pendingFiles.length > 0 ? '12px 16px' : '18px 16px', borderRadius: 8, border: `1.5px dashed ${dragOver ? ACCENT : 'var(--border-subtle)'}`, background: dragOver ? `${ACCENT}06` : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
              <Upload size={pendingFiles.length > 0 ? 14 : 18} style={{ color: dragOver ? ACCENT : 'var(--txt-muted)' }} />
              <span style={{ fontSize: 11, color: dragOver ? ACCENT : 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.5 }}>{pendingFiles.length > 0 ? <>Agregar más · <span style={{ color: ACCENT, fontWeight: 600 }}>quedan {MAX_ATTACHMENTS - pendingFiles.length} slots</span></> : <>Arrastra archivos o <span style={{ color: ACCENT, fontWeight: 600 }}>haz clic</span> para adjuntar</>}</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

        <div style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginTop: 8,
          marginLeft:   isMobile ? -14 : -50,
          marginRight:  isMobile ? -14 : -50,
          marginBottom: isMobile ? -24 : -32,
          padding: isMobile ? '12px 14px' : '14px 50px',
          background: 'var(--bg-panel)',
          borderTop: `1px solid ${ACCENT}25`,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          <button type="button" onClick={() => navigate('/new')} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent', cursor: 'pointer' }}>← Volver</button>
          <button type="submit" disabled={isPending || dataLoading} style={{ padding: '10px 26px', borderRadius: 6, border: 'none', background: (isPending || dataLoading) ? 'var(--bg-surface)' : `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`, color: (isPending || dataLoading) ? 'var(--txt-muted)' : 'white', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: (isPending || dataLoading) ? 0.55 : 1, cursor: (isPending || dataLoading) ? 'not-allowed' : 'pointer' }}>
            {isPending ? 'Creando...' : '→ Crear Solicitud'}
          </button>
        </div>
      </div>
    </form>
  );
}
