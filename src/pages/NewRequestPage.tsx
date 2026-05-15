// src/pages/NewRequestPage.tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { requestKeys } from '@/features/requests/hooks/useRequests';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import {
  useBoardTeams,
  useLabelsByTeamId,
  useBoardTemplates,
  getTemplateDefinition,
} from '@/features/requests/hooks/useBoardMetadata';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import { config } from '@/config';
import { apiClient } from '@/lib/apiClient';
import type { Prioridad } from '@/features/requests/types';
import { PRIORIDADES } from '@/features/requests/types';
import type { BoardTeam, BoardTemplate } from '@/features/requests/hooks/useBoardMetadata';
import type { TemplateExtraField } from '@/features/requests/templates/types';
import { Upload, X, FileText, Image, File as FileIcon2, Plus, Trash2, ShieldAlert, Lock } from 'lucide-react';

type Step = 'equipo' | 'template' | 'form';

const MAX_ATTACHMENTS = 5;

const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
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

function inputStyle(focused: boolean): React.CSSProperties {
  return { width: '100%', background: 'transparent', border: `1px solid ${focused ? 'rgba(0,200,255,0.4)' : 'var(--border-subtle)'}`, borderRadius: 6, padding: '10px 13px', color: 'var(--txt)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' };
}

function cardStyle(accent: string): React.CSSProperties {
  return { background: 'var(--bg-panel)', border: `1px solid ${accent}20`, borderRadius: 10, padding: '20px 22px', position: 'relative', overflow: 'hidden' };
}

function ExtraFieldRenderer({ field, value, onChange, accent, focused, onFocus, onBlur }: {
  field: TemplateExtraField; value: string; onChange: (v: string) => void;
  accent: string; focused: boolean; onFocus: () => void; onBlur: () => void;
}) {
  const [collapsed, setCollapsed] = useState(field.collapsible ?? false);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: collapsed ? 0 : 7 }}>
        <FieldLabel>{field.label}{field.required && ' *'}</FieldLabel>
        {field.collapsible && <button type="button" onClick={() => setCollapsed((v) => !v)} style={{ marginLeft: 8, marginBottom: 7, fontSize: 9, color: accent, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase' }}>{collapsed ? '▼ mostrar' : '▲ ocultar'}</button>}
      </div>
      {!collapsed && (
        <>
          {field.type === 'textarea' && <textarea style={{ ...inputStyle(focused), minHeight: 80, resize: 'vertical' }} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} placeholder={field.placeholder} rows={3} />}
          {field.type === 'text' && <input style={inputStyle(focused)} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} placeholder={field.placeholder} />}
          {field.type === 'select' && <select style={{ ...inputStyle(focused), color: value ? 'var(--txt)' : 'var(--txt-muted)', cursor: 'pointer' }} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} onBlur={onBlur}><option value="">Seleccioná una opción…</option>{(field.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>}
          {field.type === 'radio' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{(field.options ?? []).map((opt) => { const active = value === opt; return <button key={opt} type="button" onClick={() => onChange(opt)} style={{ padding: '6px 14px', borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', border: `1px solid ${active ? accent + '50' : 'var(--border-subtle)'}`, background: active ? `${accent}15` : 'transparent', color: active ? accent : 'var(--txt-muted)', transition: 'all 0.12s' }}>{opt}</button>; })}</div>}
        </>
      )}
    </div>
  );
}

/* ── AcceptanceCriteriaEditor ── */
function AcceptanceCriteriaEditor({ criteria, onChange, accent, showError = false }: { criteria: string[]; onChange: (v: string[]) => void; accent: string; showError?: boolean }) {
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const t = newText.trim();
    if (!t) return;
    onChange([...criteria, t]);
    setNewText('');
    inputRef.current?.focus();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {criteria.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {criteria.map((c, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: `${accent}08`, border: `1px solid ${accent}20` }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: `${accent}15`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <input value={c} onChange={(e) => { const n = [...criteria]; n[idx] = e.target.value; onChange(n); }} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--txt)', fontFamily: 'var(--font-body)' }} />
              <button type="button" onClick={() => onChange(criteria.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input ref={inputRef} value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Ej: El sistema valida el acceso con Azure AD…" style={{ flex: 1, padding: '7px 11px', borderRadius: 6, border: `1px solid ${(showError && criteria.length === 0) ? 'rgba(255,71,87,0.35)' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} onFocus={(e) => { e.currentTarget.style.borderColor = `${accent}50`; }} onBlur={(e) => { e.currentTarget.style.borderColor = (showError && criteria.length === 0) ? 'rgba(255,71,87,0.35)' : 'var(--border-subtle)'; }} />
        <button type="button" onClick={add} disabled={!newText.trim()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 6, border: `1px solid ${newText.trim() ? accent + '50' : 'var(--border-subtle)'}`, background: newText.trim() ? `${accent}15` : 'transparent', color: newText.trim() ? accent : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: newText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
          <Plus size={12} />Añadir
        </button>
      </div>
      {(showError && criteria.length === 0) && <span style={{ fontSize: 10, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><line x1="5" y1="2.5" x2="5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5" cy="7" r="0.5" fill="currentColor"/></svg>Se requiere al menos un criterio de aceptación.</span>}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [{ key: 'equipo', label: 'Equipo' }, { key: 'template', label: 'Tipo' }, { key: 'form', label: 'Detalles' }];
  const currentIndex = steps.findIndex((s) => s.key === step);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => {
        const done = i < currentIndex; const active = i === currentIndex;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-surface)', border: `1.5px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: done || active ? 'white' : 'var(--txt-muted)', transition: 'all 0.2s' }}>{done ? '✓' : i + 1}</div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: 0.5, color: active ? 'var(--txt)' : 'var(--txt-muted)', fontFamily: active ? 'var(--font-display)' : 'var(--font-body)' }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 1, marginLeft: 10, background: done ? 'var(--success)' : 'var(--border-subtle)', transition: 'background 0.2s' }} />}
          </div>
        );
      })}
    </div>
  );
}

function StepEquipo({ teams, selectedTeamId, onSelect, onNext }: { teams: BoardTeam[]; selectedTeamId: number | null; onSelect: (id: number) => void; onNext: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 8 }}>¿A qué equipo va dirigida?</h2>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>Seleccioná el equipo que va a atender esta solicitud.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, flex: 1 }}>
        {teams.map((team) => {
          const code = team.Board_Team_Code as keyof typeof EQUIPO_COLORS; const colors = EQUIPO_COLORS[code]; const Icon = EQUIPO_ICONS[code];
          const selected = selectedTeamId === team.Board_Team_ID; const dot = colors?.dot ?? team.Board_Team_Color; const glow = colors?.glow ?? `${team.Board_Team_Color}12`; const border = colors?.border ?? `${team.Board_Team_Color}30`;
          return (
            <button key={team.Board_Team_ID} type="button" onClick={() => onSelect(team.Board_Team_ID)} style={{ padding: '22px 20px', borderRadius: 10, border: `1.5px solid ${selected ? border : 'var(--border)'}`, background: selected ? glow : 'var(--bg-panel)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }} onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = glow; }}} onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-panel)'; }}}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: selected ? `linear-gradient(90deg, transparent, ${dot}, transparent)` : 'transparent', transition: 'background 0.2s' }} />
              {selected && <div style={{ position: 'absolute', top: 12, right: 14, width: 20, height: 20, borderRadius: '50%', background: dot, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 8px ${dot}60` }}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
              <div style={{ width: 36, height: 36, borderRadius: 8, background: selected ? `${dot}20` : 'var(--bg-surface)', border: `1px solid ${selected ? border : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Icon ? <Icon size={16} style={{ color: selected ? dot : 'var(--txt-muted)', opacity: selected ? 1 : 0.6 }} /> : <span style={{ fontSize: 16 }}>🏢</span>}</div>
              <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: selected ? dot : 'var(--txt)', marginBottom: 3 }}>{team.Board_Team_Name}</div><div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: dot, opacity: selected ? 1 : 0.45 }}>{team.Board_Team_Code}</div></div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button type="button" onClick={onNext} disabled={selectedTeamId === null} style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: selectedTeamId !== null ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: selectedTeamId !== null ? 'white' : 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: selectedTeamId !== null ? 'pointer' : 'not-allowed' }}>Continuar →</button>
      </div>
    </div>
  );
}

function StepTemplate({ templates, selectedBoardTeamId, selectedTemplateId, onSelect, onNext, onBack }: { templates: BoardTemplate[]; selectedBoardTeamId: number | null; selectedTemplateId: number | null; onSelect: (id: number) => void; onNext: () => void; onBack: () => void }) {
  const filtered = templates.filter((t) => t.Request_Template_Is_Active && (t.Request_Template_Teams?.length === 0 || (selectedBoardTeamId !== null && t.Request_Template_Teams?.includes(selectedBoardTeamId))));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 8 }}>¿Qué tipo de solicitud es?</h2>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>El tipo determina qué información adicional se necesita.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: filtered.length <= 2 ? `repeat(${filtered.length}, 1fr)` : 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
        {filtered.map((t) => {
          const selected = selectedTemplateId === t.Request_Template_ID; const accent = t.Request_Template_Color ?? '#00c8ff'; const icon = t.Request_Template_Icon ?? '📋'; const fieldCount = t.Request_Template_Form_Schema?.length ?? 0;
          return (
            <button key={t.Request_Template_ID} type="button" onClick={() => onSelect(t.Request_Template_ID)} style={{ padding: '28px 24px', borderRadius: 10, border: `1.5px solid ${selected ? accent + '70' : 'var(--border)'}`, background: selected ? `linear-gradient(135deg, ${accent}12, ${accent}06)` : 'var(--bg-panel)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }} onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = accent + '40'; e.currentTarget.style.background = `${accent}06`; }}} onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-panel)'; }}}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: selected ? `linear-gradient(90deg, transparent, ${accent}, transparent)` : 'transparent' }} />
              {selected && <div style={{ position: 'absolute', top: 12, right: 14, width: 20, height: 20, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 8px ${accent}60` }}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
              <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 1, color: selected ? accent : 'var(--txt)', marginBottom: 8 }}>{t.Request_Template_Name}</div>
              <div style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.5 }}>{t.Request_Template_Description}</div>
              {fieldCount > 0 && <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 5 }}>{t.Request_Template_Form_Schema.map((f) => <span key={f.key} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>+ {f.label}</span>)}</div>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button type="button" onClick={onBack} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent', cursor: 'pointer' }}>← Volver</button>
        <button type="button" onClick={onNext} disabled={selectedTemplateId === null} style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: selectedTemplateId !== null ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: selectedTemplateId !== null ? 'white' : 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: selectedTemplateId !== null ? 'pointer' : 'not-allowed' }}>Continuar →</button>
      </div>
    </div>
  );
}

/* ── ConfidentialToggle ── */
function ConfidentialToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toggle row */}
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 16px', borderRadius: 8, width: '100%', textAlign: 'left',
          border: `1px solid ${value ? 'rgba(253,203,110,0.45)' : 'var(--border-subtle)'}`,
          background: value ? 'rgba(253,203,110,0.07)' : 'var(--bg-surface)',
          cursor: 'pointer', transition: 'all 0.18s',
        }}
        onMouseEnter={(e) => { if (!value) { e.currentTarget.style.borderColor = 'rgba(253,203,110,0.3)'; e.currentTarget.style.background = 'rgba(253,203,110,0.04)'; }}}
        onMouseLeave={(e) => { if (!value) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}}
      >
        {/* Icono */}
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: value ? 'rgba(253,203,110,0.15)' : 'var(--bg-panel)',
          border: `1px solid ${value ? 'rgba(253,203,110,0.35)' : 'var(--border-subtle)'}`,
          transition: 'all 0.18s',
        }}>
          {value
            ? <Lock size={15} style={{ color: '#fdcb6e' }} />
            : <ShieldAlert size={15} style={{ color: 'var(--txt-muted)', opacity: 0.5 }} />
          }
        </div>

        {/* Texto */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: value ? '#fdcb6e' : 'var(--txt)', marginBottom: 2, transition: 'color 0.15s' }}>
            Esta solicitud contiene información confidencial
          </div>
          <div style={{ fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.45 }}>
            Activa esta opción si el contenido involucra datos sensibles o de acceso restringido.
          </div>
        </div>

        {/* Switch visual */}
        <div style={{
          width: 38, height: 22, borderRadius: 11, flexShrink: 0,
          background: value ? '#fdcb6e' : 'var(--bg-surface)',
          border: `1.5px solid ${value ? '#fdcb6e' : 'var(--border)'}`,
          position: 'relative', transition: 'all 0.2s',
        }}>
          <div style={{
            position: 'absolute', top: 2,
            left: value ? 18 : 2,
            width: 14, height: 14, borderRadius: '50%',
            background: value ? 'white' : 'var(--txt-muted)',
            transition: 'left 0.2s',
            boxShadow: value ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
          }} />
        </div>
      </button>

      {/* Banner de advertencia — solo visible cuando está activo */}
      {value && (
        <div style={{
          display: 'flex', gap: 12, padding: '13px 16px',
          borderRadius: 8,
          background: 'rgba(253,203,110,0.07)',
          border: '1px solid rgba(253,203,110,0.35)',
        }}>
          <ShieldAlert size={16} style={{ color: '#fdcb6e', flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#fdcb6e', lineHeight: 1.6 }}>
            Recuerda que para subir este ticket que contiene información confidencial, debes validar
            primero el manejo de estos datos con el área de jurídica.
          </p>
        </div>
      )}
    </div>
  );
}

function StepForm({
  allTemplates, templateId, currentUserName, userTeamName,
  labels, prioridad, setPrioridad, selectedLabelIds, toggleLabel,
  titulo, setTitulo, descripcion, setDescripcion,
  extraValues, setExtraValue,
  pendingFiles, setPendingFiles,
  acceptanceCriteria, setAcceptanceCriteria,
  showCriteriaError,
  isConfidential, setIsConfidential,
  error, isPending, isReady, onBack,
}: {
  allTemplates: BoardTemplate[]; templateId: number; currentUserName: string; userTeamName: string | null;
  labels: { Label_ID: number; Label_Name: string; Label_Color: string; Label_Icon: string }[];
  prioridad: Prioridad; setPrioridad: (p: Prioridad) => void;
  selectedLabelIds: number[]; toggleLabel: (id: number) => void;
  titulo: string; setTitulo: (v: string) => void;
  descripcion: string; setDescripcion: (v: string) => void;
  extraValues: Record<string, string>; setExtraValue: (key: string, value: string) => void;
  pendingFiles: File[]; setPendingFiles: (files: File[]) => void;
  acceptanceCriteria: string[]; setAcceptanceCriteria: (v: string[]) => void;
  showCriteriaError: boolean;
  isConfidential: boolean; setIsConfidential: (v: boolean) => void;
  error: string | null; isPending: boolean; isReady: boolean; onBack: () => void;
}) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const def    = getTemplateDefinition(templateId, allTemplates);
  const accent = def.visual.accentColor;

  function addFiles(incoming: File[]) {
    const slots = MAX_ATTACHMENTS - pendingFiles.length;
    const toAdd = incoming.slice(0, slots);
    if (toAdd.length > 0) setPendingFiles([...pendingFiles, ...toAdd]);
  }

  function removeFile(idx: number) { setPendingFiles(pendingFiles.filter((_, i) => i !== idx)); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 20 }}>{def.visual.icon}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, padding: '3px 10px', borderRadius: 3 }}>{def.visual.badgeLabel}</span>
      </div>

      <div style={cardStyle(accent)}>
        <SectionLabel>Solicitud</SectionLabel>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Asunto *</FieldLabel>
          <input style={{ ...inputStyle(focusedField === 'titulo'), fontSize: 15, fontWeight: 500, padding: '12px 14px' }} value={titulo} onChange={(e) => setTitulo(e.target.value)} onFocus={() => setFocusedField('titulo')} onBlur={() => setFocusedField(null)} placeholder="Describe brevemente el problema..." />
        </div>
        <div>
          <FieldLabel>Solicitante</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-2), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{currentUserName.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}</div>
            <div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{currentUserName}</div>{userTeamName && <div style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 }}>{userTeamName}</div>}</div>
          </div>
        </div>
      </div>

      <div style={cardStyle(accent)}>
        <SectionLabel>Descripción</SectionLabel>
        <textarea style={{ ...inputStyle(focusedField === 'desc'), minHeight: 110, resize: 'vertical', lineHeight: 1.65 }} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} onFocus={() => setFocusedField('desc')} onBlur={() => setFocusedField(null)} placeholder="Describe el problema con detalle..." rows={4} />
      </div>

      {/* Criterios de aceptación */}
      <div style={{ ...cardStyle(accent), border: `1px solid ${acceptanceCriteria.length > 0 ? accent + '30' : (showCriteriaError ? 'rgba(255,71,87,0.25)' : 'var(--border-subtle)')}`, background: acceptanceCriteria.length > 0 ? `${accent}05` : 'transparent', transition: 'border-color 0.2s, background 0.2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: acceptanceCriteria.length > 0 ? accent : (showCriteriaError ? 'var(--danger)' : 'var(--accent)'), background: acceptanceCriteria.length > 0 ? `${accent}12` : (showCriteriaError ? 'rgba(255,71,87,0.08)' : 'rgba(0,200,255,0.07)'), border: `1px solid ${acceptanceCriteria.length > 0 ? accent + '30' : (showCriteriaError ? 'rgba(255,71,87,0.25)' : 'rgba(0,200,255,0.18)')}`, padding: '3px 10px', borderRadius: 3, flexShrink: 0 }}>Criterios de aceptación *</span>
          {acceptanceCriteria.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>{acceptanceCriteria.length}</span>}
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', flexShrink: 0 }}>Mínimo 1 requerido</span>
        </div>
        <AcceptanceCriteriaEditor criteria={acceptanceCriteria} onChange={setAcceptanceCriteria} accent={accent} showError={showCriteriaError} />
      </div>

      {def.extraFields.length > 0 && (
        <div style={cardStyle(accent)}>
          <SectionLabel>{def.nombre} — Datos adicionales</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {def.extraFields.map((field) => <ExtraFieldRenderer key={field.key} field={field} value={extraValues[field.key] ?? ''} onChange={(v) => setExtraValue(field.key, v)} accent={accent} focused={focusedField === field.key} onFocus={() => setFocusedField(field.key)} onBlur={() => setFocusedField(null)} />)}
          </div>
        </div>
      )}

      <div style={cardStyle(accent)}>
        <SectionLabel>Clasificación</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <FieldLabel>Prioridad</FieldLabel>
            <div style={{ display: 'flex', gap: 7 }}>
              {(Object.keys(PRIORIDADES) as Prioridad[]).map((key) => { const active = prioridad === key; return <button key={key} type="button" onClick={() => setPrioridad(key)} style={{ padding: '6px 14px', borderRadius: 5, border: `1px solid ${active ? PRI_COLOR[key] + '50' : 'var(--border-subtle)'}`, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer', background: active ? `${PRI_COLOR[key]}15` : 'transparent', color: active ? PRI_COLOR[key] : 'var(--txt-muted)', transition: 'all 0.12s', fontFamily: 'var(--font-display)' }}>{PRIORIDADES[key]}</button>; })}
            </div>
          </div>
          {labels.length > 0 && (
            <div>
              <FieldLabel>Etiquetas</FieldLabel>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {labels.map((label) => { const selected = selectedLabelIds.includes(label.Label_ID); return <button key={label.Label_ID} type="button" onClick={() => toggleLabel(label.Label_ID)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${selected ? label.Label_Color + '55' : 'var(--border-subtle)'}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: selected ? `${label.Label_Color}12` : 'transparent', color: selected ? label.Label_Color : 'var(--txt-muted)', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 5 }}>{label.Label_Icon && <span style={{ fontSize: 11 }}>{label.Label_Icon}</span>}{label.Label_Name}</button>; })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confidencialidad (antes de adjuntos) ── */}
      <div style={cardStyle(accent)}>
        <SectionLabel>Privacidad</SectionLabel>
        <ConfidentialToggle value={isConfidential} onChange={setIsConfidential} />
      </div>

      {/* Adjuntos */}
      <div style={cardStyle(accent)}>
        <SectionLabel>Adjuntos <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 9 }}>(opcional · máx. {MAX_ATTACHMENTS})</span></SectionLabel>
        {pendingFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {pendingFiles.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${accent}08`, border: `1px solid ${accent}25` }}>
                <div style={{ width: 30, height: 30, borderRadius: 6, background: `${accent}12`, border: `1px solid ${accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}><AttachmentIcon mime={file.type} /></div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div><div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 1 }}>{fmtBytes(file.size)}</div></div>
                <button type="button" onClick={() => removeFile(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
        {pendingFiles.length < MAX_ATTACHMENTS && (
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }} onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: pendingFiles.length > 0 ? '12px 16px' : '18px 16px', borderRadius: 8, border: `1.5px dashed ${dragOver ? accent : 'var(--border-subtle)'}`, background: dragOver ? `${accent}06` : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
            <Upload size={pendingFiles.length > 0 ? 14 : 18} style={{ color: dragOver ? accent : 'var(--txt-muted)' }} />
            <span style={{ fontSize: 11, color: dragOver ? accent : 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.5 }}>{pendingFiles.length > 0 ? <>Agregar más · <span style={{ color: accent, fontWeight: 600 }}>quedan {MAX_ATTACHMENTS - pendingFiles.length} slots</span></> : <>Arrastra archivos o <span style={{ color: accent, fontWeight: 600 }}>haz clic</span> para adjuntar</>}</span>
          </div>
        )}
        {pendingFiles.length >= MAX_ATTACHMENTS && <div style={{ fontSize: 10, color: 'var(--txt-muted)', textAlign: 'center', opacity: 0.7 }}>Límite de {MAX_ATTACHMENTS} archivos alcanzado</div>}
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <button type="button" onClick={onBack} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent', cursor: 'pointer' }}>← Volver</button>
        <button type="submit" disabled={isPending || !isReady} style={{ padding: '9px 24px', borderRadius: 6, border: 'none', background: (isPending || !isReady) ? 'var(--bg-surface)' : `linear-gradient(135deg, ${accent === '#00c8ff' ? 'var(--accent-2)' : accent + 'cc'}, ${accent})`, color: (isPending || !isReady) ? 'var(--txt-muted)' : 'white', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: (isPending || !isReady) ? 0.55 : 1, cursor: (isPending || !isReady) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity 0.15s' }}>
          {isPending ? 'Creando...' : '→ Crear Solicitud'}
        </button>
      </div>
    </div>
  );
}

function SuccessScreen({ onHome }: { onHome: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 28px', textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(0,229,160,0.08)', border: '1.5px solid rgba(0,229,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(0,229,160,0.12)' }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M6 17l8 8 14-14" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div style={{ maxWidth: 400 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 12 }}>Solicitud enviada</h2>
        <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.75 }}>Recibimos tu pedido. El equipo correspondiente lo revisará y estará trabajando en él a la brevedad.</p>
      </div>
      <button type="button" onClick={onHome} style={{ marginTop: 4, padding: '12px 36px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, var(--accent-2), var(--accent))', color: 'white', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>← Volver al inicio</button>
    </div>
  );
}

export function NuevaSolicitudPage() {
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const { Requests } = useGraphServices();
  const boardId      = config.DEFAULT_BOARD_ID;

  const { data: currentUser }     = useCurrentUser();
  const columnMap                 = useColumnMap(boardId);
  const { data: teams      = [] } = useBoardTeams(boardId);
  const { data: templates  = [] } = useBoardTemplates(boardId);

  const [step,               setStep]               = useState<Step>('equipo');
  const [selectedTeamId,     setSelectedTeamId]     = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const { data: labels = [] } = useLabelsByTeamId(boardId, selectedTeamId);

  const [titulo,             setTitulo]             = useState('');
  const [descripcion,        setDescripcion]        = useState('');
  const [prioridad,          setPrioridad]          = useState<Prioridad>('media');
  const [selectedLabelIds,   setSelectedLabelIds]   = useState<number[]>([]);
  const [extraValues,        setExtraValues]        = useState<Record<string, string>>({});
  const [pendingFiles,       setPendingFiles]       = useState<File[]>([]);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [isConfidential,     setIsConfidential]     = useState(false);
  const [submitAttempted,    setSubmitAttempted]    = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [submitted,          setSubmitted]          = useState(false);

  const userTeamName = currentUser?.team?.Team_Name ?? null;
  const userTeamId   = currentUser?.Team_ID ?? null;

  function selectTeam(id: number) { setSelectedTeamId(id); setSelectedTemplateId(null); setExtraValues({}); }
  function toggleLabel(id: number) { setSelectedLabelIds((prev) => prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]); }
  function setExtraValue(key: string, value: string) { setExtraValues((prev) => ({ ...prev, [key]: value })); }

  const { mutate: crear, isPending } = useMutation({
    mutationFn: async () => {
      if (!currentUser || !columnMap || !selectedTemplateId) throw new Error('Datos incompletos');
      const sinCategorizarColumnId = columnMap['sin_categorizar'];
      if (!sinCategorizarColumnId) throw new Error('Columna sin_categorizar no encontrada');
      if (acceptanceCriteria.length === 0) throw new Error('Debes definir al menos un criterio de aceptación.');

      const def = getTemplateDefinition(selectedTemplateId, templates);
      for (const field of def.extraFields) {
        if (field.required && !extraValues[field.key]?.trim()) throw new Error(`El campo "${field.label}" es obligatorio.`);
      }
console.log('[DEBUG] isConfidential:', isConfidential);
      // 1. Crear ticket
      const newRequest = await Requests.createRequest({
        boardId,
        columnId:           sinCategorizarColumnId,
        requestedBy:        currentUser.User_ID,
        templateId:         selectedTemplateId,
        titulo:             titulo.trim(),
        descripcion:        descripcion.trim(),
        prioridad,
        equipoIds:          selectedTeamId ? [selectedTeamId] : [],
        labelIds:           selectedLabelIds,
        subTeamIds:         [],
        sprintId:           null,
        estimatedHours:     null,
        parentId:           null,
        requesterTeamId:    userTeamId,
        isConfidential,
        acceptanceCriteria: [],
        
      });

      // 2. Crear criterios
      await Promise.all(
        acceptanceCriteria.map((title) =>
          apiClient.call('createAcceptanceCriteria', { requestId: newRequest.id, title }),
        ),
      );

      // 3. Subir adjuntos
      if (pendingFiles.length > 0) {
        await Promise.all(pendingFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          await apiClient.call('uploadAttachment', { requestId: newRequest.id, userId: currentUser.User_ID, fileName: file.name, mimeType: file.type, sizeBytes: file.size, base64 });
        }));
      }

      return newRequest;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: requestKeys.all }); setSubmitted(true); },
    onError: (err: Error) => setError(err.message ?? 'Error al crear la solicitud.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim())                  return setError('El asunto es obligatorio.');
    if (!currentUser)                    return setError('Cargando datos del usuario...');
    if (!columnMap)                      return setError('Cargando columnas del board...');
    if (!selectedTemplateId)             return setError('Seleccioná un tipo de solicitud.');
    if (acceptanceCriteria.length === 0) { setSubmitAttempted(true); return setError('Debes definir al menos un criterio de aceptación.'); }
    setError(null);
    crear();
  }

  const isReady = !!currentUser && !!columnMap && !!selectedTemplateId && acceptanceCriteria.length > 0;

  if (submitted) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 900, width: '100%', margin: '0 auto', padding: '0 28px 32px' }}>
        <SuccessScreen onHome={() => navigate('/home')} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 28px 32px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <StepIndicator step={step} />
      {step === 'equipo' && <StepEquipo teams={teams} selectedTeamId={selectedTeamId} onSelect={selectTeam} onNext={() => setStep('template')} />}
      {step === 'template' && <StepTemplate templates={templates} selectedBoardTeamId={selectedTeamId} selectedTemplateId={selectedTemplateId} onSelect={setSelectedTemplateId} onNext={() => setStep('form')} onBack={() => setStep('equipo')} />}
      {step === 'form' && selectedTemplateId !== null && (
        <StepForm
          allTemplates={templates} templateId={selectedTemplateId}
          currentUserName={currentUser?.User_Name ?? 'Cargando...'} userTeamName={userTeamName}
          labels={labels} prioridad={prioridad} setPrioridad={setPrioridad}
          selectedLabelIds={selectedLabelIds} toggleLabel={toggleLabel}
          titulo={titulo} setTitulo={(v) => { setTitulo(v); setError(null); }}
          descripcion={descripcion} setDescripcion={setDescripcion}
          extraValues={extraValues} setExtraValue={setExtraValue}
          pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
          acceptanceCriteria={acceptanceCriteria} setAcceptanceCriteria={setAcceptanceCriteria}
          showCriteriaError={submitAttempted && acceptanceCriteria.length === 0}
          isConfidential={isConfidential} setIsConfidential={setIsConfidential}
          error={error} isPending={isPending} isReady={isReady} onBack={() => setStep('template')}
        />
      )}
    </form>
  );
}