import { useState } from 'react';
import {
  getTemplateVariables, type EmailTemplate,
} from '@/features/requests/hooks/useEmailTemplates';
import { AddBtn, SmBtn, FieldLabel} from '../ConfigPanel';

export function EmailTemplateList({ templates, onUpdate, onToggle, onCreate, onDelete, onUpdateMetadata }: {
  templates: EmailTemplate[];
  onUpdate: (id: number, d: { subject: string; html: string; text: string }) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onCreate: (d: { name: string; eventKey: string; subject: string; variables: string[] }) => void;
  onDelete: (id: number) => void;
  onUpdateMetadata: (id: number, d: { name: string; subject: string; variables: string[] }) => void;
}) {
  const [editId,     setEditId]     = useState<number | null>(null);
  const [editMetaId, setEditMetaId] = useState<number | null>(null);
  const [showNew,    setShowNew]    = useState(false);

  if (editId !== null) {
    const t = templates.find((t) => t.Email_Template_ID === editId);
    if (t) return <EmailTemplateForm template={t} onSave={(d) => { onUpdate(t.Email_Template_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />;
  }
  if (editMetaId !== null) {
    const t = templates.find((t) => t.Email_Template_ID === editMetaId);
    if (t) return <EmailTemplateMetaForm template={t} onSave={(d) => { onUpdateMetadata(t.Email_Template_ID, d); setEditMetaId(null); }} onCancel={() => setEditMetaId(null)} />;
  }
  if (showNew) return <EmailTemplateNewForm onSave={(d) => { onCreate(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" stroke="var(--accent)" strokeWidth="1.3"/><path d="M7 5v4M7 3.5v.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"/></svg>
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>Usá <code style={{ background: 'var(--bg-panel)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{'{{variable}}'}</code> en el subject y el HTML.</p>
      </div>
      {templates.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>✉️</span><p>No hay templates de correo.</p></div>}
      {templates.map((t) => (
        <EmailTemplateRow key={t.Email_Template_ID} template={t}
          onEdit={() => setEditId(t.Email_Template_ID)}
          onEditMeta={() => setEditMetaId(t.Email_Template_ID)}
          onToggle={(isActive) => onToggle(t.Email_Template_ID, isActive)}
          onDelete={() => onDelete(t.Email_Template_ID)} />
      ))}
      <AddBtn label="Nuevo evento de correo" onClick={() => setShowNew(true)} />
    </div>
  );
}
function EmailTemplateRow({ template, onEdit, onEditMeta, onToggle, onDelete }: {
  template: EmailTemplate; onEdit: () => void; onEditMeta: () => void;
  onToggle: (isActive: boolean) => void; onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  const isActive = template.Email_Template_Is_Active;
  const vars     = getTemplateVariables(template);
  const fmt      = (iso: string) => { const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`; };
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`, background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)', transition: 'all 0.12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: isActive ? 'rgba(0,200,255,0.12)' : 'var(--bg-panel)', border: `1px solid ${isActive ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>✉️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.Email_Template_Name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: isActive ? 'rgba(0,229,160,0.12)' : 'var(--bg-panel)', border: `1px solid ${isActive ? 'rgba(0,229,160,0.35)' : 'var(--border-subtle)'}`, color: isActive ? '#00e5a0' : 'var(--txt-muted)' }}>{isActive ? 'activo' : 'inactivo'}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.Email_Template_Subject || <span style={{ fontStyle: 'italic' }}>Sin subject</span>}</div>
          <div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 2, opacity: 0.6 }}>{template.Email_Template_Event_Key} · {fmt(template.Email_Template_Updated_At)}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onToggle(!isActive)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? 'rgba(0,229,160,0.12)' : 'rgba(255,71,87,0.1)', color: isActive ? '#00e5a0' : '#ff4757', transition: 'background 0.12s' }}>
            {isActive ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
          </button>
          <SmBtn color="#a29bfe" onClick={onEditMeta} title="Editar nombre y variables"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 2H3a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V6M10 1l1 1-5 5H5V6l5-5z"/></svg></SmBtn>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar HTML"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
          <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
        </div>
      </div>
      {hov && vars.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          {vars.map((v) => <span key={v} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)' }}>{`{{${v}}}`}</span>)}
        </div>
      )}
    </div>
  );
}

function EmailTemplateNewForm({ onSave, onCancel }: {
  onSave: (d: { name: string; eventKey: string; subject: string; variables: string[] }) => void; onCancel: () => void;
}) {
  const [name,      setName]      = useState('');
  const [eventKey,  setEventKey]  = useState('');
  const [subject,   setSubject]   = useState('');
  const [varInput,  setVarInput]  = useState('');
  const [variables, setVariables] = useState<string[]>(['ticket_id', 'ticket_title', 'ticket_url']);
  const [error,     setError]     = useState('');
  const canSave = name.trim().length > 0 && eventKey.trim().length > 0;

  function handleNameChange(val: string) {
    setName(val);
    const key = val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').toLowerCase();
    setEventKey(key);
  }
  function addVar() { const v = varInput.trim().replace(/\s+/g, '_').toLowerCase(); if (!v || variables.includes(v)) return; setVariables((p) => [...p, v]); setVarInput(''); }
  function removeVar(v: string) { setVariables((p) => p.filter((x) => x !== v)); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>Nuevo evento de correo</span>
        <button onClick={() => { if (!canSave) return; setError(''); onSave({ name: name.trim(), eventKey: eventKey.trim(), subject: subject.trim(), variables }); }} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>CREAR</button>
      </div>
      <div><FieldLabel>Nombre legible *</FieldLabel><input autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ej: Solicitud creada" className="cpop-input" /></div>
      <div><FieldLabel>Event Key *</FieldLabel><input value={eventKey} onChange={(e) => setEventKey(e.target.value.replace(/\s/g, '_').toLowerCase())} placeholder="Ej: createRequest" className="cpop-input" style={{ fontFamily: 'monospace', fontSize: 11 }} /></div>
      <div><FieldLabel>Subject por defecto</FieldLabel><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Solicitud {{ticket_id}} creada" className="cpop-input" /></div>
      <div>
        <FieldLabel>Variables disponibles</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {variables.map((v) => (
            <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)' }}>
              {`{{${v}}}`}
              <button onClick={() => removeVar(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 0, display: 'flex', lineHeight: 1 }}><svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={varInput} onChange={(e) => setVarInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }} placeholder="Nueva variable…" className="cpop-input" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          <button onClick={addVar} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(0,200,255,0.08)', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
        </div>
      </div>
      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', fontSize: 12, color: '#ff4757' }}>{error}</div>}
    </div>
  );
}

function EmailTemplateMetaForm({ template, onSave, onCancel }: {
  template: EmailTemplate; onSave: (d: { name: string; subject: string; variables: string[] }) => void; onCancel: () => void;
}) {
  const [name,      setName]      = useState(template.Email_Template_Name);
  const [subject,   setSubject]   = useState(template.Email_Template_Subject);
  const [variables, setVariables] = useState<string[]>(getTemplateVariables(template));
  const [varInput,  setVarInput]  = useState('');
  const canSave = name.trim().length > 0;
  function addVar() { const v = varInput.trim().replace(/\s+/g, '_').toLowerCase(); if (!v || variables.includes(v)) return; setVariables((p) => [...p, v]); setVarInput(''); }
  function removeVar(v: string) { setVariables((p) => p.filter((x) => x !== v)); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>Editar metadata</span>
        <button onClick={() => canSave && onSave({ name: name.trim(), subject: subject.trim(), variables })} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', fontSize: 10, color: 'var(--txt-muted)' }}>Event Key: <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{template.Email_Template_Event_Key}</code> — no editable</div>
      <div><FieldLabel>Nombre legible *</FieldLabel><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="cpop-input" /></div>
      <div><FieldLabel>Subject por defecto</FieldLabel><input value={subject} onChange={(e) => setSubject(e.target.value)} className="cpop-input" /></div>
      <div>
        <FieldLabel>Variables disponibles</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {variables.map((v) => (
            <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)' }}>
              {`{{${v}}}`}
              <button onClick={() => removeVar(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 0, display: 'flex', lineHeight: 1 }}><svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={varInput} onChange={(e) => setVarInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }} placeholder="Nueva variable…" className="cpop-input" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          <button onClick={addVar} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(0,200,255,0.08)', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
        </div>
      </div>
    </div>
  );
}

function EmailTemplateForm({ template, onSave, onCancel }: {
  template: EmailTemplate; onSave: (d: { subject: string; html: string; text: string }) => void; onCancel: () => void;
}) {
  const [subject, setSubject] = useState(template.Email_Template_Subject);
  const [html,    setHtml]    = useState(template.Email_Template_Body_html);
  const [tab,     setTab]     = useState<'editor' | 'preview'>('editor');
  const [copied,  setCopied]  = useState<string | null>(null);
  const vars    = getTemplateVariables(template);
  const canSave = subject.trim().length > 0;
  function copyVar(v: string) { navigator.clipboard.writeText(`{{${v}}}`); setCopied(v); setTimeout(() => setCopied(null), 1500); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>{template.Email_Template_Name}</span>
        <button onClick={() => canSave && onSave({ subject: subject.trim(), html, text: '' })} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ flexShrink: 0, marginBottom: 12 }}><span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)', fontFamily: 'monospace' }}>{template.Email_Template_Event_Key}</span></div>
      {vars.length > 0 && (
        <div style={{ flexShrink: 0, marginBottom: 12 }}>
          <FieldLabel>Variables — click para copiar</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {vars.map((v) => <button key={v} onClick={() => copyVar(v)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'monospace', border: '1px solid var(--border)', background: copied === v ? 'rgba(0,229,160,0.15)' : 'var(--bg-panel)', color: copied === v ? '#00e5a0' : 'var(--accent)', transition: 'all 0.15s' }}>{copied === v ? '✓ copiado' : `{{${v}}}`}</button>)}
          </div>
        </div>
      )}
      <div style={{ flexShrink: 0, marginBottom: 12 }}><FieldLabel>Subject *</FieldLabel><input value={subject} onChange={(e) => setSubject(e.target.value)} className="cpop-input" /></div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 4, marginBottom: 8, padding: '4px', background: 'var(--bg-surface)', borderRadius: 8 }}>
        {(['editor', 'preview'] as const).map((t) => <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? 'white' : 'var(--txt-muted)', transition: 'all 0.15s' }}>{t === 'editor' ? '✏️ Editor' : '👁 Preview'}</button>)}
      </div>
      {tab === 'editor' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <FieldLabel>HTML del correo</FieldLabel>
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Pegá el HTML del correo acá..." style={{ flex: 1, minHeight: 0, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--txt)', fontFamily: 'monospace', lineHeight: 1.6, resize: 'none', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
        </div>
      )}
      {tab === 'preview' && (
        <div style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'auto', border: '1px solid var(--border-subtle)', background: '#fff' }}>
          {html.trim() ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 12 }}>Sin HTML para previsualizar</div>}
        </div>
      )}
    </div>
  );
}
