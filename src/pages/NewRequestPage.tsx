import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useAuth } from '@/auth/AuthProvider';
import { requestKeys } from '@/features/requests/hooks/useRequests';
import type { CrearSolicitudPayload, Prioridad, Equipo } from '@/features/requests/types';
import { EQUIPOS, PRIORIDADES } from '@/features/requests/types';

type FormState = {
  titulo:      string;
  descripcion: string;
  solicitante: string;
  resolutor:   string;
  equipo:      Equipo | '';
  prioridad:   Prioridad;
  categoria:   string;
};

const INITIAL: FormState = {
  titulo: '', descripcion: '', solicitante: '',
  resolutor: '', equipo: '', prioridad: 'media', categoria: '',
};

const S = {
  section:       { background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 } as React.CSSProperties,
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 } as React.CSSProperties,
  tag:           { fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--accent)', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', padding: '2px 8px', borderRadius: 3 } as React.CSSProperties,
  line:          { flex: 1, height: 1, background: 'var(--border-subtle)' } as React.CSSProperties,
  grid2:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,
  label:         { fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: 'var(--txt-muted)', display: 'block', marginBottom: 6 } as React.CSSProperties,
  input:         { width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none' } as React.CSSProperties,
  textarea:      { width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 12px', color: 'var(--txt)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', resize: 'vertical' as const, minHeight: 100 } as React.CSSProperties,
  select:        { width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', cursor: 'pointer' } as React.CSSProperties,
};

const PRIORIDAD_COLORS: Record<Prioridad, string> = { baja: 'rgba(90,106,138,0.15)', media: 'rgba(167,139,250,0.15)', alta: 'rgba(255,165,2,0.15)', critica: 'rgba(255,71,87,0.15)' };
const PRIORIDAD_BORDER: Record<Prioridad, string> = { baja: 'rgba(90,106,138,0.3)',  media: 'rgba(167,139,250,0.3)',  alta: 'rgba(255,165,2,0.3)',  critica: 'rgba(255,71,87,0.4)' };
const PRIORIDAD_TEXT:   Record<Prioridad, string> = { baja: 'var(--txt-muted)',       media: 'var(--info)',           alta: 'var(--warn)',           critica: 'var(--danger)' };

export function NuevaSolicitudPage() {
  const navigate        = useNavigate();
  const { account }     = useAuth();
  const qc              = useQueryClient();
  const { Requests } = useGraphServices();

  const [form, setForm]   = useState<FormState>({ ...INITIAL, solicitante: account?.name ?? '' });
  const [error, setError] = useState<string | null>(null);

  const { mutate: crear, isPending } = useMutation({
    mutationFn: (payload: CrearSolicitudPayload) => Requests.crear(payload),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: requestKeys.all }); navigate('/'); },
    onError:    (err: Error) => setError(err.message ?? 'Error al crear la solicitud.'),
  });

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setError(null);
    };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim())      return setError('El asunto es obligatorio.');
    if (!form.solicitante.trim()) return setError('El solicitante es obligatorio.');
    crear({
      titulo:      form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      solicitante: form.solicitante.trim(),
      resolutor:   form.resolutor.trim() || null,
      equipo:      form.equipo || null,
      prioridad:   form.prioridad,
      categoria:   form.categoria.trim() || null,
      fechaMaxima: null,
    });
  }
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 860,
        width: '100%',
        margin: '0 auto',       // centra el form
        padding: '0 24px',      // respira en pantallas angostas
      }}
    >
      {/* PARTES */}
      <div style={S.section}>
        <div style={S.sectionHeader}><span style={S.tag}>Partes</span><div style={S.line} /></div>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>Solicitante</label>
            <input style={S.input} value={form.solicitante} onChange={set('solicitante')} placeholder="Nombre del solicitante..." />
          </div>
          <div>
            <label style={S.label}>Resolutor</label>
            <input style={S.input} value={form.resolutor} onChange={set('resolutor')} placeholder="Asignar a..." />
          </div>
          <div>
            <label style={S.label}>Asunto</label>
            <input style={S.input} value={form.titulo} onChange={set('titulo')} placeholder="Describe brevemente el problema..." />
          </div>
          <div>
            <label style={S.label}>Equipo</label>
            <select style={S.select} value={form.equipo} onChange={set('equipo')}>
              <option value="">Sin asignar</option>
              {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* DESCRIPCIÓN */}
      <div style={S.section}>
        <div style={S.sectionHeader}><span style={S.tag}>Descripción</span><div style={S.line} /></div>
        <textarea
          style={{ ...S.textarea, minHeight: 120 }}
          value={form.descripcion}
          onChange={set('descripcion')}
          placeholder="Describe el problema con detalle..."
          rows={5}
        />
      </div>

      {/* CLASIFICACIÓN */}
      <div style={S.section}>
        <div style={S.sectionHeader}><span style={S.tag}>Clasificación</span><div style={S.line} /></div>
        <div style={{ ...S.grid2, gridTemplateColumns: '2fr 1fr' }}>
          <div>
            <label style={S.label}>Categoría</label>
            <input style={S.input} value={form.categoria} onChange={set('categoria')} placeholder="Categoría del problema..." />
          </div>
          <div>
            <label style={S.label}>Prioridad</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.entries(PRIORIDADES) as [Prioridad, string][]).map(([key, label]) => (
                <button key={key} type="button"
                  onClick={() => setForm((p) => ({ ...p, prioridad: key }))}
                  style={{
                    padding: '6px 14px', borderRadius: 5,
                    border: `1px solid ${PRIORIDAD_BORDER[key]}`,
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', cursor: 'pointer',
                    background: form.prioridad === key ? PRIORIDAD_COLORS[key] : 'transparent',
                    color:      form.prioridad === key ? PRIORIDAD_TEXT[key]   : 'var(--txt-muted)',
                    transition: 'all 0.12s',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" onClick={() => navigate(-1)}
          style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent' }}>
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          style={{ padding: '9px 24px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #0055cc, #00c8ff)', color: 'white', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPending ? 'Creando...' : '→ Crear Solicitud'}
        </button>
      </div>
    </form>
  );
}