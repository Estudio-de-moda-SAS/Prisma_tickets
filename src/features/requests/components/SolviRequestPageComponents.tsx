// src/features/requests/components/SolviRequestPageComponents.tsx
// Secciones grandes de SolviRequestPage, cada una un subcomponente chico y
// controlado (todo el estado vive en la página) — mismo criterio que
// RequestModalComponents.tsx para RequestModal.
import React from 'react';
import { Upload, X, Plus, ShieldAlert, Clock } from 'lucide-react';
import { RichTextEditor } from '@/features/requests/components/RichTextEditor';
import { formatSlaHorasHabiles } from '@/features/requests/services/SolviBusinessDate.service';
import type { UserProfile } from '@/types/commons';
import type { SolviCategoria } from '@/features/requests/hooks/useSolviCategorias';
import type { SolviSubcategoria } from '@/features/requests/hooks/useSolviSubcategorias';
import type { SolviArticulo } from '@/features/requests/hooks/useSolviArticulos';
import {
  AttachmentIcon,
  FieldError,
  FieldLabel,
  SectionLabel,
  cardStyle,
  fmtBytes,
  inputStyle,
} from './SolviRequestFormControls';

type SlaInfo = { horas: number; nombre: string };

/* ============================================================
   Pantallas completas (reemplazan el form)
   ============================================================ */

export function UsuarioErrorScreen({ onVolver }: { onVolver: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 28px', textAlign: 'center' }}>
      <ShieldAlert size={28} style={{ color: '#ff4757' }} />
      <p style={{ fontSize: 13, color: 'var(--txt-muted)' }}>No pudimos cargar tu usuario. Intentá de nuevo.</p>
      <button type="button" onClick={onVolver} style={{ padding: '10px 24px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', cursor: 'pointer' }}>Volver al inicio</button>
    </div>
  );
}

type SolicitudEnviadaScreenProps = {
  accent: string;
  isMobile: boolean;
  onCrearOtra: () => void;
  onVolver: () => void;
};

export function SolicitudEnviadaScreen({ accent, isMobile, onCrearOtra, onVolver }: SolicitudEnviadaScreenProps) {
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
          <button type="button" onClick={onCrearOtra} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '13px 28px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: 'white', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
            <Plus size={15} /> Crear otra solicitud
          </button>
          <button type="button" onClick={onVolver} style={{ padding: '12px 28px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', cursor: 'pointer' }}>
            ← Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Secciones del formulario
   ============================================================ */

type SolicitudCardProps = {
  accent: string;
  titulo: string;
  onTituloChange: (v: string) => void;
  titleError: boolean;
  focusedField: string | null;
  onFocusField: (field: string | null) => void;
  currentUser: UserProfile | null | undefined;
};

export function SolicitudCard({ accent, titulo, onTituloChange, titleError, focusedField, onFocusField, currentUser }: SolicitudCardProps) {
  return (
    <div style={cardStyle(accent)}>
      <SectionLabel>Solicitud</SectionLabel>
      <div style={{ marginBottom: 16 }} data-vfield="titulo">
        <FieldLabel>Asunto *</FieldLabel>
        <input
          style={{ ...inputStyle(focusedField === 'titulo', titleError), fontSize: 15, fontWeight: 500, padding: '12px 14px' }}
          value={titulo}
          onChange={(e) => onTituloChange(e.target.value)}
          onFocus={() => onFocusField('titulo')}
          onBlur={() => onFocusField(null)}
          placeholder="Describe brevemente el problema..."
        />
        <FieldError show={titleError} text="El asunto es obligatorio." />
      </div>
      <div>
        <FieldLabel>Solicitante</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${accent}, ${accent}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{(currentUser?.User_Name ?? '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}</div>
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
  );
}

type SlaBadgeProps = {
  accent: string;
  loading: boolean;
  ansInfo: SlaInfo | null;
};

export function SlaBadge({ accent, loading, ansInfo }: SlaBadgeProps) {
  return (
    <div style={{
      marginTop: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '9px 13px',
      borderRadius: 8,
      background: `${accent}0c`,
      border: `1px solid ${accent}25`,
      fontSize: 12,
      color: 'var(--txt)',
    }}>
      <Clock size={14} style={{ color: accent, flexShrink: 0 }} />
      {loading ? (
        <span style={{ color: 'var(--txt-muted)' }}>Calculando tiempo de atención…</span>
      ) : (
        <span>
          Tiempo de atención aproximado: <strong>{formatSlaHorasHabiles(ansInfo!.horas)}</strong>
        </span>
      )}
    </div>
  );
}

type CategoriaCascadeCardProps = {
  accent: string;
  focusedField: string | null;
  onFocusField: (field: string | null) => void;

  categories: SolviCategoria[];
  categoriaId: string;
  onCategoriaChange: (id: string) => void;
  categoriaError: boolean;

  subcategories: SolviSubcategoria[];
  subcategoriesLoading: boolean;
  subcategoriaId: string;
  onSubcategoriaChange: (id: string) => void;
  subcategoriaError: boolean;

  articulos: SolviArticulo[];
  articulosLoading: boolean;
  articuloId: string;
  onArticuloChange: (id: string) => void;
  articuloError: boolean;

  ansInfo: SlaInfo | null | undefined;
  ansLoading: boolean;
};

export function CategoriaCascadeCard({
  accent, focusedField, onFocusField,
  categories, categoriaId, onCategoriaChange, categoriaError,
  subcategories, subcategoriesLoading, subcategoriaId, onSubcategoriaChange, subcategoriaError,
  articulos, articulosLoading, articuloId, onArticuloChange, articuloError,
  ansInfo, ansLoading,
}: CategoriaCascadeCardProps) {
  return (
    <div style={cardStyle(accent)} data-vfield="categoria">
      <SectionLabel>Categoría</SectionLabel>

      <div style={{ marginBottom: (subcategoriaId || subcategories.length > 0) ? 16 : 0 }}>
        <FieldLabel>Categoría *</FieldLabel>
        <select
          style={{ ...inputStyle(focusedField === 'categoria', categoriaError), color: categoriaId ? 'var(--txt)' : 'var(--txt-muted)', cursor: 'pointer' }}
          value={categoriaId}
          onChange={(e) => onCategoriaChange(e.target.value)}
          onFocus={() => onFocusField('categoria')}
          onBlur={() => onFocusField(null)}
        >
          <option value="">Seleccioná una categoría…</option>
          {categories.map((c) => <option key={c.Id} value={c.Id}>{c.Title}</option>)}
        </select>
        <FieldError show={categoriaError} text="Seleccioná una categoría." />
      </div>

      {categoriaId && (
        <div style={{ marginBottom: (articuloId || articulos.length > 0) ? 16 : 0 }}>
          <FieldLabel>Subcategoría{subcategories.length > 0 ? ' *' : ''}</FieldLabel>
          <select
            style={{ ...inputStyle(focusedField === 'subcategoria', subcategoriaError), color: subcategoriaId ? 'var(--txt)' : 'var(--txt-muted)', cursor: 'pointer' }}
            value={subcategoriaId}
            disabled={subcategoriesLoading || subcategories.length === 0}
            onChange={(e) => onSubcategoriaChange(e.target.value)}
            onFocus={() => onFocusField('subcategoria')}
            onBlur={() => onFocusField(null)}
          >
            <option value="">
              {subcategoriesLoading
                ? 'Cargando subcategorías…'
                : subcategories.length === 0
                  ? 'Sin subcategorías para esta categoría'
                  : 'Seleccioná una subcategoría…'}
            </option>
            {subcategories.map((s) => <option key={s.Id} value={s.Id}>{s.Title}</option>)}
          </select>
          <FieldError show={subcategoriaError} text="Seleccioná una subcategoría." />
        </div>
      )}

      {subcategoriaId && (
        <div>
          <FieldLabel>Artículo{articulos.length > 0 ? ' *' : ''}</FieldLabel>
          <select
            style={{ ...inputStyle(focusedField === 'articulo', articuloError), color: articuloId ? 'var(--txt)' : 'var(--txt-muted)', cursor: 'pointer' }}
            value={articuloId}
            disabled={articulosLoading || articulos.length === 0}
            onChange={(e) => onArticuloChange(e.target.value)}
            onFocus={() => onFocusField('articulo')}
            onBlur={() => onFocusField(null)}
          >
            <option value="">
              {articulosLoading
                ? 'Cargando artículos…'
                : articulos.length === 0
                  ? 'Sin artículos para esta subcategoría'
                  : 'Seleccioná un artículo…'}
            </option>
            {articulos.map((a) => <option key={a.Id} value={a.Id}>{a.Title}</option>)}
          </select>
          <FieldError show={articuloError} text="Seleccioná un artículo." />
        </div>
      )}

      {(ansLoading || ansInfo) && (
        <SlaBadge accent={accent} loading={ansLoading} ansInfo={ansInfo ?? null} />
      )}
    </div>
  );
}

type DescripcionCardProps = {
  accent: string;
  descripcion: string;
  onDescripcionChange: (v: string) => void;
};

export function DescripcionCard({ accent, descripcion, onDescripcionChange }: DescripcionCardProps) {
  return (
    <div style={cardStyle(accent)}>
      <SectionLabel>Descripción</SectionLabel>
      <RichTextEditor
        value={descripcion}
        onChange={onDescripcionChange}
        placeholder="Describe el problema con detalle..."
        accent={accent}
      />
    </div>
  );
}

type AdjuntosCardProps = {
  accent: string;
  pendingFiles: File[];
  maxAttachments: number;
  dragOver: boolean;
  onDragOverChange: (v: boolean) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (idx: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export function AdjuntosCard({
  accent, pendingFiles, maxAttachments, dragOver, onDragOverChange, onAddFiles, onRemoveFile, fileInputRef,
}: AdjuntosCardProps) {
  return (
    <div style={cardStyle(accent)}>
      <SectionLabel>Adjuntos <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 9 }}>(opcional · máx. {maxAttachments})</span></SectionLabel>
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {pendingFiles.map((file, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${accent}08`, border: `1px solid ${accent}25` }}>
              <div style={{ width: 30, height: 30, borderRadius: 6, background: `${accent}12`, border: `1px solid ${accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}><AttachmentIcon mime={file.type} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div><div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 1 }}>{fmtBytes(file.size)}</div></div>
              <button type="button" onClick={() => onRemoveFile(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {pendingFiles.length < maxAttachments && (
        <div
          onDragOver={(e) => { e.preventDefault(); onDragOverChange(true); }}
          onDragLeave={() => onDragOverChange(false)}
          onDrop={(e) => { e.preventDefault(); onDragOverChange(false); onAddFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => fileInputRef.current?.click()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: pendingFiles.length > 0 ? '12px 16px' : '18px 16px', borderRadius: 8, border: `1.5px dashed ${dragOver ? accent : 'var(--border-subtle)'}`, background: dragOver ? `${accent}06` : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          <Upload size={pendingFiles.length > 0 ? 14 : 18} style={{ color: dragOver ? accent : 'var(--txt-muted)' }} />
          <span style={{ fontSize: 11, color: dragOver ? accent : 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.5 }}>{pendingFiles.length > 0 ? <>Agregar más · <span style={{ color: accent, fontWeight: 600 }}>quedan {maxAttachments - pendingFiles.length} slots</span></> : <>Arrastra archivos o <span style={{ color: accent, fontWeight: 600 }}>haz clic</span> para adjuntar</>}</span>
        </div>
      )}
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { onAddFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
  );
}

type SubmitBarProps = {
  accent: string;
  isMobile: boolean;
  isPending: boolean;
  dataLoading: boolean;
  onBack: () => void;
};

export function SubmitBar({ accent, isMobile, isPending, dataLoading, onBack }: SubmitBarProps) {
  const disabled = isPending || dataLoading;
  return (
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
      borderTop: `1px solid ${accent}25`,
      flexWrap: isMobile ? 'wrap' : 'nowrap',
    }}>
      <button type="button" onClick={onBack} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent', cursor: 'pointer' }}>← Volver</button>
      <button type="submit" disabled={disabled} style={{ padding: '10px 26px', borderRadius: 6, border: 'none', background: disabled ? 'var(--bg-surface)' : `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: disabled ? 'var(--txt-muted)' : 'white', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {isPending ? 'Creando...' : '→ Crear Solicitud'}
      </button>
    </div>
  );
}
