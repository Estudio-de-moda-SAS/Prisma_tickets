import { useState } from 'react';
import type { BoardLabel } from '@/features/requests/hooks/useBoardMetadata';
import { AddBtn, LabelForm, ItemRow } from '../ConfigPanel';

export function LabelList({ labels, onAdd, onUpdate, onDelete }: {
  labels: BoardLabel[];
  onAdd: (d: { name: string; color: string; icon: string }) => void;
  onUpdate: (id: number, d: { name: string; color: string; icon: string }) => void;
  onDelete: (id: number) => void;
}) {
  const [editId,  setEditId]  = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search,  setSearch]  = useState('');

  const filtered = labels
    .filter((l) => l.Label_Name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.Label_Name.localeCompare(b.Label_Name, 'es'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {labels.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--txt-muted)"
            strokeWidth="1.6" strokeLinecap="round"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>
            <circle cx="5" cy="5" r="3.5"/><path d="M8.5 8.5l2 2"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar etiqueta…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 26, paddingRight: 8, paddingTop: 6, paddingBottom: 6,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 6, fontSize: 11, color: 'var(--txt)', outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
          />
        </div>
      )}
      {labels.length === 0 && !showNew && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>🏷️</span><p>No hay etiquetas para este equipo.</p></div>}
      {filtered.length === 0 && search && <div className="cpanel__empty"><span style={{ fontSize: 22, opacity: 0.4 }}>🔍</span><p>Sin resultados para "{search}".</p></div>}
      {filtered.map((label) => editId === label.Label_ID
        ? <LabelForm key={label.Label_ID} initial={{ name: label.Label_Name, color: label.Label_Color, icon: label.Label_Icon }} onSave={(d) => { onUpdate(label.Label_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
        : <ItemRow key={label.Label_ID} color={label.Label_Color} icon={label.Label_Icon} name={label.Label_Name} onEdit={() => { setShowNew(false); setEditId(label.Label_ID); }} onDelete={() => onDelete(label.Label_ID)} />
      )}
      {showNew
        ? <LabelForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
        : <AddBtn label="Nueva etiqueta" onClick={() => { setEditId(null); setShowNew(true); }} />
      }
    </div>
  );
}
