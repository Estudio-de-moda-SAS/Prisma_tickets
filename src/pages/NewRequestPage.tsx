import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { requestKeys } from '@/features/requests/hooks/useRequests';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { useBoardTeams, useBoardLabels, useBoardTemplates } from '@/features/requests/hooks/useBoardMetadata';
import { getTemplateDefinition } from '@/features/requests/templates/registry';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import { config } from '@/config';
import type { Prioridad } from '@/features/requests/types';
import { PRIORIDADES } from '@/features/requests/types';
import type { BoardTeam, BoardTemplate } from '@/features/requests/hooks/useBoardMetadata';

/* ============================================================
   Tipos del flujo
   ============================================================ */
type Step = 'equipo' | 'template' | 'form';

/* ============================================================
   Mapeo: qué templates están permitidos por equipo (Board_Team_Code)
   Si un equipo no aparece aquí, solo ve el template Default (ID 1).
   ============================================================ */
const TEAM_TEMPLATES: Record<string, number[]> = {
  desarrollo: [1],
  crm:        [1, 2],
  sistemas:   [1],
  analisis:   [1],
};

/* ============================================================
   Colores de prioridad
   ============================================================ */
const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

/* ============================================================
   Subcomponentes
   ============================================================ */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display:       'block',
      fontSize:      9,
      fontWeight:    700,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color:         'var(--txt-muted)',
      marginBottom:  7,
    }}>
      {children}
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <span style={{
        fontFamily:    'var(--font-display)',
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color:         'var(--accent)',
        background:    'rgba(0,200,255,0.07)',
        border:        '1px solid rgba(0,200,255,0.18)',
        padding:       '3px 10px',
        borderRadius:  3,
        flexShrink:    0,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width:        '100%',
    background:   'var(--bg-deep)',
    border:       `1px solid ${focused ? 'rgba(0,200,255,0.4)' : 'var(--border-subtle)'}`,
    borderRadius: 6,
    padding:      '10px 13px',
    color:        'var(--txt)',
    fontFamily:   'var(--font-body)',
    fontSize:     13,
    outline:      'none',
    boxSizing:    'border-box',
    transition:   'border-color 0.15s',
  };
}

/* ============================================================
   Paso 1 — Selección de equipo (estilo Sidebar)
   ============================================================ */
function StepEquipo({
  teams,
  selectedTeamId,
  onSelect,
  onNext,
}: {
  teams: BoardTeam[];
  selectedTeamId: number | null;
  onSelect: (id: number) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{
          fontFamily:    'var(--font-display)',
          fontSize:      22,
          fontWeight:    700,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color:         'var(--txt)',
          marginBottom:  8,
        }}>
          ¿A qué equipo va dirigida?
        </h2>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
          Seleccioná el equipo que va a atender esta solicitud.
        </p>
      </div>

      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap:                 14,
        flex:                1,
      }}>
        {teams.map((team) => {
          const code     = team.Board_Team_Code as keyof typeof EQUIPO_COLORS;
          const colors   = EQUIPO_COLORS[code];
          const Icon     = EQUIPO_ICONS[code];
          const selected = selectedTeamId === team.Board_Team_ID;

          // Fallback si el código no está mapeado
          const dot    = colors?.dot    ?? team.Board_Team_Color;
          const glow   = colors?.glow   ?? `${team.Board_Team_Color}12`;
          const border = colors?.border ?? `${team.Board_Team_Color}30`;

          return (
            <button
              key={team.Board_Team_ID}
              type="button"
              onClick={() => onSelect(team.Board_Team_ID)}
              style={{
                padding:      '22px 20px',
                borderRadius: 10,
                border:       `1.5px solid ${selected ? border : 'var(--border)'}`,
                background:   selected ? glow : 'var(--bg-panel)',
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'all 0.15s',
                position:     'relative',
                overflow:     'hidden',
                display:      'flex',
                flexDirection: 'column',
                gap:          10,
              }}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.borderColor = border;
                  e.currentTarget.style.background  = glow;
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background  = 'var(--bg-panel)';
                }
              }}
            >
              {/* Línea de acento superior */}
              <div style={{
                position:   'absolute',
                top:        0, left: 0, right: 0,
                height:     2,
                background: selected
                  ? `linear-gradient(90deg, transparent, ${dot}, transparent)`
                  : 'transparent',
                transition: 'background 0.2s',
              }} />

              {/* Check */}
              {selected && (
                <div style={{
                  position:       'absolute',
                  top:            12, right: 14,
                  width:          20, height: 20,
                  borderRadius:   '50%',
                  background:     dot,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  boxShadow:      `0 0 8px ${dot}60`,
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              {/* Icono del equipo — mismo que el Sidebar */}
              <div style={{
                width:          36,
                height:         36,
                borderRadius:   8,
                background:     selected ? `${dot}20` : 'var(--bg-surface)',
                border:         `1px solid ${selected ? border : 'var(--border-subtle)'}`,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                transition:     'all 0.15s',
                flexShrink:     0,
              }}>
                {Icon ? (
                  <Icon
                    size={16}
                    style={{
                      color:      selected ? dot : 'var(--txt-muted)',
                      opacity:    selected ? 1 : 0.6,
                      transition: 'color 0.15s, opacity 0.15s',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 16 }}>🏢</span>
                )}
              </div>

              {/* Nombre y código */}
              <div>
                <div style={{
                  fontFamily:    'var(--font-display)',
                  fontSize:      15,
                  fontWeight:    700,
                  letterSpacing: 0.5,
                  color:         selected ? dot : 'var(--txt)',
                  marginBottom:  3,
                  transition:    'color 0.15s',
                }}>
                  {team.Board_Team_Name}
                </div>
                <div style={{
                  fontSize:      9,
                  fontWeight:    700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color:         dot,
                  opacity:       selected ? 1 : 0.45,
                  transition:    'opacity 0.15s',
                }}>
                  {team.Board_Team_Code}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button
          type="button"
          onClick={onNext}
          disabled={selectedTeamId === null}
          style={{
            padding:       '10px 28px',
            borderRadius:  6,
            border:        'none',
            background:    selectedTeamId !== null
              ? 'linear-gradient(135deg, var(--accent-2), var(--accent))'
              : 'var(--bg-surface)',
            color:         selectedTeamId !== null ? 'white' : 'var(--txt-muted)',
            fontFamily:    'var(--font-display)',
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            cursor:        selectedTeamId !== null ? 'pointer' : 'not-allowed',
            transition:    'opacity 0.15s',
          }}
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Paso 2 — Selección de template (filtrado por equipos)
   ============================================================ */
function StepTemplate({
  templates,
  selectedTeamCodes,
  selectedTemplateId,
  onSelect,
  onNext,
  onBack,
}: {
  templates:          BoardTemplate[];
  selectedTeamCodes:  string[];
  selectedTemplateId: number | null;
  onSelect:           (id: number) => void;
  onNext:             () => void;
  onBack:             () => void;
}) {
  // Calcular la unión de templates permitidos por todos los equipos seleccionados
  const allowedTemplateIds = new Set<number>();
  for (const code of selectedTeamCodes) {
    const allowed = TEAM_TEMPLATES[code] ?? [1];
    allowed.forEach((id) => allowedTemplateIds.add(id));
  }

  const filteredTemplates = templates.filter((t) =>
    allowedTemplateIds.has(t.Request_Template_ID),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{
          fontFamily:    'var(--font-display)',
          fontSize:      22,
          fontWeight:    700,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color:         'var(--txt)',
          marginBottom:  8,
        }}>
          ¿Qué tipo de solicitud es?
        </h2>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
          El tipo determina qué información adicional se necesita.
        </p>
      </div>

      <div style={{
        display:             'grid',
        gridTemplateColumns: filteredTemplates.length <= 2
          ? `repeat(${filteredTemplates.length}, 1fr)`
          : 'repeat(3, 1fr)',
        gap:  16,
        flex: 1,
      }}>
        {filteredTemplates.map((t) => {
          const def      = getTemplateDefinition(t.Request_Template_ID);
          const selected = selectedTemplateId === t.Request_Template_ID;
          const accent   = def.visual.accentColor;

          return (
            <button
              key={t.Request_Template_ID}
              type="button"
              onClick={() => onSelect(t.Request_Template_ID)}
              style={{
                padding:      '28px 24px',
                borderRadius: 10,
                border:       `1.5px solid ${selected ? accent + '70' : 'var(--border)'}`,
                background:   selected
                  ? `linear-gradient(135deg, ${accent}12, ${accent}06)`
                  : 'var(--bg-panel)',
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'all 0.15s',
                position:     'relative',
                overflow:     'hidden',
              }}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.borderColor = accent + '40';
                  e.currentTarget.style.background  = `${accent}06`;
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background  = 'var(--bg-panel)';
                }
              }}
            >
              <div style={{
                position:   'absolute',
                top: 0, left: 0, right: 0,
                height:     2,
                background: selected
                  ? `linear-gradient(90deg, transparent, ${accent}, transparent)`
                  : 'transparent',
                transition: 'background 0.2s',
              }} />

              {selected && (
                <div style={{
                  position:       'absolute',
                  top: 12, right: 14,
                  width: 20, height: 20,
                  borderRadius:   '50%',
                  background:     accent,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  boxShadow:      `0 0 8px ${accent}60`,
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              <div style={{ fontSize: 28, marginBottom: 10 }}>{def.visual.icon}</div>

              <div style={{
                fontFamily:    'var(--font-display)',
                fontSize:      16,
                fontWeight:    700,
                letterSpacing: 1,
                color:         selected ? accent : 'var(--txt)',
                marginBottom:  8,
                transition:    'color 0.15s',
              }}>
                {t.Request_Template_Name}
              </div>

              <div style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.5 }}>
                {t.Request_Template_Description}
              </div>

              {def.extraFields.length > 0 && (
                <div style={{
                  marginTop: 12,
                  display:   'flex',
                  flexWrap:  'wrap',
                  gap:       5,
                }}>
                  {def.extraFields.map((f) => (
                    <span key={f.key} style={{
                      fontSize:      9,
                      fontWeight:    700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      padding:       '2px 7px',
                      borderRadius:  3,
                      background:    `${accent}15`,
                      color:         accent,
                      border:        `1px solid ${accent}30`,
                    }}>
                      + {f.label}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding:      '10px 20px',
            borderRadius: 6,
            border:       '1px solid var(--border-subtle)',
            color:        'var(--txt-muted)',
            fontSize:     12,
            background:   'transparent',
            cursor:       'pointer',
          }}
        >
          ← Volver
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={selectedTemplateId === null}
          style={{
            padding:       '10px 28px',
            borderRadius:  6,
            border:        'none',
            background:    selectedTemplateId !== null
              ? 'linear-gradient(135deg, var(--accent-2), var(--accent))'
              : 'var(--bg-surface)',
            color:         selectedTemplateId !== null ? 'white' : 'var(--txt-muted)',
            fontFamily:    'var(--font-display)',
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            cursor:        selectedTemplateId !== null ? 'pointer' : 'not-allowed',
          }}
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Paso 3 — Formulario
   ============================================================ */
function StepForm({
  templateId,
  currentUserName,
  labels,
  prioridad,
  setPrioridad,
  selectedLabelIds,
  toggleLabel,
  titulo,
  setTitulo,
  descripcion,
  setDescripcion,
  deadline,
  setDeadline,
  extraValues,
  setExtraValue,
  error,
  isPending,
  isReady,
  onBack,
}: {
  templateId:       number;
  currentUserName:  string;
  labels:           { Label_ID: number; Label_Name: string; Label_Color: string; Label_Icon: string }[];
  prioridad:        Prioridad;
  setPrioridad:     (p: Prioridad) => void;
  selectedLabelIds: number[];
  toggleLabel:      (id: number) => void;
  titulo:           string;
  setTitulo:        (v: string) => void;
  descripcion:      string;
  setDescripcion:   (v: string) => void;
  deadline:         string;
  setDeadline:      (v: string) => void;
  extraValues:      Record<string, string>;
  setExtraValue:    (key: string, value: string) => void;
  error:            string | null;
  isPending:        boolean;
  isReady:          boolean;
  onBack:           () => void;
}) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const def    = getTemplateDefinition(templateId);
  const accent = def.visual.accentColor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Badge del template seleccionado */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 20 }}>{def.visual.icon}</span>
        <span style={{
          fontFamily:    'var(--font-display)',
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color:         accent,
          background:    `${accent}10`,
          border:        `1px solid ${accent}30`,
          padding:       '3px 10px',
          borderRadius:  3,
        }}>
          {def.nombre}
        </span>
      </div>

      {/* Solicitud */}
      <div style={cardStyle(accent)}>
        <SectionLabel>Solicitud</SectionLabel>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Asunto *</FieldLabel>
          <input
            style={{
              ...inputStyle(focusedField === 'titulo'),
              fontSize:   15,
              fontWeight: 500,
              padding:    '12px 14px',
            }}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onFocus={() => setFocusedField('titulo')}
            onBlur={() => setFocusedField(null)}
            placeholder="Describe brevemente el problema..."
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel>Solicitante</FieldLabel>
            <div style={{
              ...inputStyle(false),
              display: 'flex', alignItems: 'center', gap: 10, opacity: 0.65,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background:     'linear-gradient(135deg, var(--accent-2), var(--accent))',
                display:        'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0,
              }}>
                {currentUserName.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
              </div>
              <span style={{ fontSize: 13 }}>{currentUserName}</span>
            </div>
          </div>
          <div>
            <FieldLabel>Fecha límite</FieldLabel>
            <input
              type="date"
              style={{ ...inputStyle(focusedField === 'deadline'), colorScheme: 'dark' }}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              onFocus={() => setFocusedField('deadline')}
              onBlur={() => setFocusedField(null)}
            />
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div style={cardStyle(accent)}>
        <SectionLabel>Descripción</SectionLabel>
        <textarea
          style={{
            ...inputStyle(focusedField === 'desc'),
            minHeight: 110, resize: 'vertical', lineHeight: 1.65,
          }}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          onFocus={() => setFocusedField('desc')}
          onBlur={() => setFocusedField(null)}
          placeholder="Describe el problema con detalle..."
          rows={4}
        />
      </div>

      {/* Campos extra del template */}
      {def.extraFields.length > 0 && (
        <div style={cardStyle(accent)}>
          <SectionLabel>{def.nombre} — Datos adicionales</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {def.extraFields.map((field) => (
              <div key={field.key}>
                <FieldLabel>
                  {field.label}{field.required && ' *'}
                </FieldLabel>
                {field.type === 'textarea' ? (
                  <textarea
                    style={{
                      ...inputStyle(focusedField === field.key),
                      minHeight: 80, resize: 'vertical',
                    }}
                    value={extraValues[field.key] ?? ''}
                    onChange={(e) => setExtraValue(field.key, e.target.value)}
                    onFocus={() => setFocusedField(field.key)}
                    onBlur={() => setFocusedField(null)}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <input
                    style={inputStyle(focusedField === field.key)}
                    value={extraValues[field.key] ?? ''}
                    onChange={(e) => setExtraValue(field.key, e.target.value)}
                    onFocus={() => setFocusedField(field.key)}
                    onBlur={() => setFocusedField(null)}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clasificación */}
      <div style={cardStyle(accent)}>
        <SectionLabel>Clasificación</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <FieldLabel>Prioridad</FieldLabel>
            <div style={{ display: 'flex', gap: 7 }}>
              {(Object.keys(PRIORIDADES) as Prioridad[]).map((key) => {
                const active = prioridad === key;
                return (
                  <button key={key} type="button" onClick={() => setPrioridad(key)}
                    style={{
                      padding: '6px 14px', borderRadius: 5,
                      border:  `1px solid ${active ? PRI_COLOR[key] + '50' : 'var(--border-subtle)'}`,
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
                      textTransform: 'uppercase', cursor: 'pointer',
                      background: active ? `${PRI_COLOR[key]}15` : 'transparent',
                      color:      active ? PRI_COLOR[key] : 'var(--txt-muted)',
                      transition: 'all 0.12s',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {PRIORIDADES[key]}
                  </button>
                );
              })}
            </div>
          </div>

          {labels.length > 0 && (
            <div>
              <FieldLabel>Etiquetas</FieldLabel>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {labels.map((label) => {
                  const selected = selectedLabelIds.includes(label.Label_ID);
                  return (
                    <button key={label.Label_ID} type="button" onClick={() => toggleLabel(label.Label_ID)}
                      style={{
                        padding: '5px 12px', borderRadius: 5,
                        border:  `1px solid ${selected ? label.Label_Color + '55' : 'var(--border-subtle)'}`,
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: selected ? `${label.Label_Color}12` : 'transparent',
                        color:      selected ? label.Label_Color : 'var(--txt-muted)',
                        transition: 'all 0.12s',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {label.Label_Icon && <span style={{ fontSize: 11 }}>{label.Label_Icon}</span>}
                      {label.Label_Name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 6,
          background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)',
          color: 'var(--danger)', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <button type="button" onClick={onBack}
          style={{
            padding: '9px 20px', borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            color: 'var(--txt-muted)', fontSize: 12,
            background: 'transparent', cursor: 'pointer',
          }}
        >
          ← Volver
        </button>
        <button type="submit" disabled={isPending || !isReady}
          style={{
            padding: '9px 24px', borderRadius: 6, border: 'none',
            background: (isPending || !isReady)
              ? 'var(--bg-surface)'
              : `linear-gradient(135deg, ${accent === '#00c8ff' ? 'var(--accent-2)' : accent + 'cc'}, ${accent})`,
            color:         (isPending || !isReady) ? 'var(--txt-muted)' : 'white',
            fontFamily:    'var(--font-display)',
            fontSize:      13, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase',
            opacity:       (isPending || !isReady) ? 0.55 : 1,
            cursor:        (isPending || !isReady) ? 'not-allowed' : 'pointer',
            display:       'flex', alignItems: 'center', gap: 8,
            transition:    'opacity 0.15s',
          }}
        >
          {isPending ? 'Creando...' : '→ Crear Solicitud'}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Card helper con acento dinámico por template
   ============================================================ */
function cardStyle(accent: string): React.CSSProperties {
  return {
    background:   'var(--bg-panel)',
    border:       `1px solid ${accent}20`,
    borderRadius: 10,
    padding:      '20px 22px',
    position:     'relative',
    overflow:     'hidden',
  };
}

/* ============================================================
   Indicador de progreso de pasos
   ============================================================ */
function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'equipo',   label: 'Equipo'   },
    { key: 'template', label: 'Tipo'     },
    { key: 'form',     label: 'Detalles' },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => {
        const done   = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{
                width:          24, height: 24,
                borderRadius:   '50%',
                background:     done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-surface)',
                border:         `1.5px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                display:        'flex', alignItems: 'center', justifyContent: 'center',
                fontSize:       10, fontWeight: 700,
                color:          done || active ? 'white' : 'var(--txt-muted)',
                transition:     'all 0.2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize:      11, fontWeight: active ? 700 : 500,
                letterSpacing: 0.5,
                color:         active ? 'var(--txt)' : 'var(--txt-muted)',
                fontFamily:    active ? 'var(--font-display)' : 'var(--font-body)',
              }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex:       1, height: 1, marginLeft: 10,
                background: done ? 'var(--success)' : 'var(--border-subtle)',
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Página principal
   ============================================================ */
export function NuevaSolicitudPage() {
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const { Requests } = useGraphServices();
  const boardId      = config.DEFAULT_BOARD_ID;

  const { data: currentUser }     = useCurrentUser();
  const columnMap                 = useColumnMap(boardId);
  const { data: teams    = [] }   = useBoardTeams(boardId);
  const { data: labels   = [] }   = useBoardLabels(boardId);
  const { data: templates = [] }  = useBoardTemplates(boardId);

  // Estado del flujo
  const [step,               setStep]               = useState<Step>('equipo');
  const [selectedTeamId,     setSelectedTeamId]     = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  // Estado del formulario
  const [titulo,           setTitulo]           = useState('');
  const [descripcion,      setDescripcion]      = useState('');
  const [prioridad,        setPrioridad]        = useState<Prioridad>('media');
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
  const [deadline,         setDeadline]         = useState('');
  const [extraValues,      setExtraValues]      = useState<Record<string, string>>({});
  const [error,            setError]            = useState<string | null>(null);

  function selectTeam(id: number) {
    setSelectedTeamId(id);
    // Resetear template al cambiar equipo
    setSelectedTemplateId(null);
  }

  function toggleLabel(id: number) {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  }

  function setExtraValue(key: string, value: string) {
    setExtraValues((prev) => ({ ...prev, [key]: value }));
  }

  // Código del equipo actualmente seleccionado
  const selectedTeamCodes = teams
    .filter((t) => t.Board_Team_ID === selectedTeamId)
    .map((t) => t.Board_Team_Code);

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => {
      if (!currentUser || !columnMap || !selectedTemplateId) {
        throw new Error('Datos incompletos');
      }
      const sinCategorizarColumnId = columnMap['sin_categorizar'];
      if (!sinCategorizarColumnId) throw new Error('Columna sin_categorizar no encontrada');

      // Validar campos extra requeridos
      const def = getTemplateDefinition(selectedTemplateId);
      for (const field of def.extraFields) {
        if (field.required && !extraValues[field.key]?.trim()) {
          throw new Error(`El campo "${field.label}" es obligatorio.`);
        }
      }

      return Requests.createRequest({
        boardId,
        columnId:    sinCategorizarColumnId,
        requestedBy: currentUser.User_ID,
        templateId:  selectedTemplateId,
        titulo:      titulo.trim(),
        descripcion: descripcion.trim(),
        prioridad,
        equipoIds:   selectedTeamId ? [selectedTeamId] : [],
        labelIds:    selectedLabelIds,
        sprintId:    null,
        deadline:    deadline || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: requestKeys.all });
      navigate('/');
    },
    onError: (err: Error) => setError(err.message ?? 'Error al crear la solicitud.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim())       return setError('El asunto es obligatorio.');
    if (!currentUser)         return setError('Cargando datos del usuario...');
    if (!columnMap)           return setError('Cargando columnas del board...');
    if (!selectedTemplateId)  return setError('Seleccioná un tipo de solicitud.');
    setError(null);
    crear();
  }

  const isReady = !!currentUser && !!columnMap && !!selectedTemplateId;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        height:        '100%',
        display:       'flex',
        flexDirection: 'column',
        padding:       '0 28px 32px',
        maxWidth:      900,
        width:         '100%',
        margin:        '0 auto',
      }}
    >
      <StepIndicator step={step} />

      {step === 'equipo' && (
        <StepEquipo
          teams={teams}
          selectedTeamId={selectedTeamId}
          onSelect={selectTeam}
          onNext={() => setStep('template')}
        />
      )}

      {step === 'template' && (
        <StepTemplate
          templates={templates}
          selectedTeamCodes={selectedTeamCodes}
          selectedTemplateId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          onNext={() => setStep('form')}
          onBack={() => setStep('equipo')}
        />
      )}

      {step === 'form' && selectedTemplateId !== null && (
        <StepForm
          templateId={selectedTemplateId}
          currentUserName={currentUser?.User_Name ?? 'Cargando...'}
          labels={labels}
          prioridad={prioridad}
          setPrioridad={setPrioridad}
          selectedLabelIds={selectedLabelIds}
          toggleLabel={toggleLabel}
          titulo={titulo}
          setTitulo={(v) => { setTitulo(v); setError(null); }}
          descripcion={descripcion}
          setDescripcion={setDescripcion}
          deadline={deadline}
          setDeadline={setDeadline}
          extraValues={extraValues}
          setExtraValue={setExtraValue}
          error={error}
          isPending={isPending}
          isReady={isReady}
          onBack={() => setStep('template')}
        />
      )}
    </form>
  );
}