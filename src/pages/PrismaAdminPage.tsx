// src/pages/PrismaAdminPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';

/* ============================================================
   Tipos
   ============================================================ */
type BugSeverity = 'bajo' | 'medio' | 'alto' | 'critico';
type BugStatus   = 'pendiente' | 'en_revision' | 'resuelto' | 'cerrado';

type BugReport = {
  Report_ID:   number;
  Title:       string;
  Description: string;
  Severity:    BugSeverity;
  Status:      BugStatus;
  Screen_Path: string | null;
  Created_At:  string;
  Updated_At:  string;
  reporter:    { User_ID: number; User_Name: string; User_Email: string } | null;
};

type SatisfactionRating = {
  Rating_ID:  number;
  Score:      number;
  Comment:    string | null;
  Created_At: string;
  rater:      { User_ID: number; User_Name: string; User_Email: string } | null;
};

/* ============================================================
   Config visual
   ============================================================ */
const SEV: Record<BugSeverity, { label: string; color: string; bg: string; border: string }> = {
  bajo:    { label: 'Bajo',    color: '#00e5a0', bg: 'rgba(0,229,160,0.10)',   border: 'rgba(0,229,160,0.30)'   },
  medio:   { label: 'Medio',   color: '#fdcb6e', bg: 'rgba(253,203,110,0.10)', border: 'rgba(253,203,110,0.30)' },
  alto:    { label: 'Alto',    color: '#ff7f50', bg: 'rgba(255,127,80,0.10)',  border: 'rgba(255,127,80,0.30)'  },
  critico: { label: 'Crítico', color: '#ff4757', bg: 'rgba(255,71,87,0.10)',   border: 'rgba(255,71,87,0.30)'   },
};

const STS: Record<BugStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
  pendiente:   { label: 'Pendiente',   color: '#b2bec3', bg: 'rgba(178,190,195,0.10)', border: 'rgba(178,190,195,0.25)', icon: '⏳' },
  en_revision: { label: 'En revisión', color: '#00c8ff', bg: 'rgba(0,200,255,0.10)',   border: 'rgba(0,200,255,0.30)',   icon: '🔍' },
  resuelto:    { label: 'Resuelto',    color: '#00e5a0', bg: 'rgba(0,229,160,0.10)',   border: 'rgba(0,229,160,0.30)',   icon: '✅' },
  cerrado:     { label: 'Cerrado',     color: '#6c5ce7', bg: 'rgba(108,92,231,0.10)',  border: 'rgba(108,92,231,0.30)',  icon: '🔒' },
};

const STATUS_ORDER: BugStatus[] = ['pendiente', 'en_revision', 'resuelto', 'cerrado'];

/* ============================================================
   Helpers
   ============================================================ */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function scoreColor(s: number) {
  return s >= 4 ? '#00e5a0' : s === 3 ? '#fdcb6e' : '#ff4757';
}

/* ============================================================
   Página principal
   ============================================================ */
export function PrismaAdminPage() {
  const [tab, setTab] = useState<'bugs' | 'satisfaction'>('bugs');

  /* Bug state */
  const [bugs,        setBugs]        = useState<BugReport[]>([]);
  const [bugsLoading, setBugsLoading] = useState(true);
  const [bugsError,   setBugsError]   = useState<string | null>(null);
  const [bugSearch,   setBugSearch]   = useState('');
  const [sevFilter,   setSevFilter]   = useState<BugSeverity | 'all'>('all');
  const [stsFilter,   setStsFilter]   = useState<BugStatus   | 'all'>('all');
  const [updatingId,  setUpdatingId]  = useState<number | null>(null);

  /* Satisfaction state */
  const [ratings,        setRatings]        = useState<SatisfactionRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [ratingsError,   setRatingsError]   = useState<string | null>(null);

  const loadBugs = useCallback(async () => {
    setBugsLoading(true); setBugsError(null);
    try { setBugs(await apiClient.call<BugReport[]>('fetchBugReports', {})); }
    catch (e) { setBugsError((e as Error).message); }
    finally { setBugsLoading(false); }
  }, []);

  const loadRatings = useCallback(async () => {
    setRatingsLoading(true); setRatingsError(null);
    try { setRatings(await apiClient.call<SatisfactionRating[]>('fetchSatisfactionRatings', {})); }
    catch (e) { setRatingsError((e as Error).message); }
    finally { setRatingsLoading(false); }
  }, []);

  useEffect(() => { loadBugs(); },    [loadBugs]);
  useEffect(() => { loadRatings(); }, [loadRatings]);

async function changeStatus(bug: BugReport, targetStatus: BugStatus) {
  if (updatingId !== null) return;
  setUpdatingId(bug.Report_ID);
  try {
    await apiClient.call('updateBugReportStatus', { reportId: bug.Report_ID, status: targetStatus });
    setBugs((prev) => prev.map((b) => b.Report_ID === bug.Report_ID ? { ...b, Status: targetStatus } : b));
  } catch { /* silencioso */ }
  finally { setUpdatingId(null); }
}

  /* Filtered bugs */
  const filteredBugs = bugs.filter((b) => {
    if (sevFilter !== 'all' && b.Severity !== sevFilter) return false;
    if (stsFilter !== 'all' && b.Status   !== stsFilter)  return false;
    if (bugSearch) {
      const q = bugSearch.toLowerCase();
      return (
        b.Title.toLowerCase().includes(q) ||
        b.Description.toLowerCase().includes(q) ||
        (b.reporter?.User_Name.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  /* Bug stats */
  const bugStats = {
    total:       bugs.length,
    pendiente:   bugs.filter((b) => b.Status === 'pendiente').length,
    en_revision: bugs.filter((b) => b.Status === 'en_revision').length,
    resuelto:    bugs.filter((b) => b.Status === 'resuelto').length,
    cerrado:     bugs.filter((b) => b.Status === 'cerrado').length,
    critico:     bugs.filter((b) => b.Severity === 'critico').length,
  };

  /* Rating stats */
  const ratingStats = {
    total:       ratings.length,
    avg:         ratings.length > 0 ? ratings.reduce((s, r) => s + r.Score, 0) / ratings.length : 0,
    dist:        [1, 2, 3, 4, 5].map((s) => ({ score: s, count: ratings.filter((r) => r.Score === s).length })),
    withComment: ratings.filter((r) => r.Comment?.trim()).length,
  };

  return (
<div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(0,200,255,0.15), rgba(108,92,231,0.15))',
            border: '1px solid rgba(0,200,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: 2, color: 'var(--txt)', textTransform: 'uppercase', lineHeight: 1 }}>
              PRISMA <span style={{ color: 'var(--accent)' }}>Admin</span>
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--txt-muted)' }}>
              Panel interno de monitoreo · solo administradores TI
            </p>
          </div>
        </div>
        <RefreshBtn onClick={() => tab === 'bugs' ? loadBugs() : loadRatings()} />
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: 4, background: 'var(--bg-surface)',
        padding: 4, borderRadius: 10, border: '1px solid var(--border-subtle)',
      }}>
        <TabBtn active={tab === 'bugs'} onClick={() => setTab('bugs')} badge={bugStats.total}>
          🐛 Bug Reports
        </TabBtn>
        <TabBtn active={tab === 'satisfaction'} onClick={() => setTab('satisfaction')} badge={ratingStats.total}>
          ⭐ Satisfacción
        </TabBtn>
      </div>

      {/* ── Bug Reports ── */}
      {tab === 'bugs' && (
        <BugReportsTab
          bugs={filteredBugs}
          allBugs={bugs}
          loading={bugsLoading}
          error={bugsError}
          stats={bugStats}
          search={bugSearch}
          onSearch={setBugSearch}
          sevFilter={sevFilter}
          onSevFilter={setSevFilter}
          stsFilter={stsFilter}
          onStsFilter={setStsFilter}
          onAdvance={changeStatus}
          updatingId={updatingId}
          onRetry={loadBugs}
        />
      )}

      {/* ── Satisfacción ── */}
      {tab === 'satisfaction' && (
        <SatisfactionTab
          ratings={ratings}
          loading={ratingsLoading}
          error={ratingsError}
          stats={ratingStats}
          onRetry={loadRatings}
        />
      )}
    </div>
  );
}

/* ============================================================
   TabBtn
   ============================================================ */
function TabBtn({ active, onClick, badge, children }: {
  active: boolean; onClick: () => void; badge: number; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#000' : 'var(--txt-muted)',
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: 0.5,
        transition: 'all 0.15s',
      }}
    >
      {children}
      <span style={{
        fontSize: 10, padding: '1px 7px', borderRadius: 10,
        background: active ? 'rgba(0,0,0,0.18)' : 'var(--bg-panel)',
        border: active ? 'none' : '1px solid var(--border-subtle)',
        color: active ? '#000' : 'var(--txt-muted)', fontWeight: 700,
      }}>
        {badge}
      </span>
    </button>
  );
}

/* ============================================================
   RefreshBtn
   ============================================================ */
function RefreshBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8,
        border: `1px solid ${hov ? 'var(--accent)' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)',
        color: hov ? 'var(--accent)' : 'var(--txt-muted)',
        fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M10.5 6A4.5 4.5 0 0 1 2.1 8.4M1.5 6A4.5 4.5 0 0 1 9.9 3.6M1.5 10V8h2M10.5 4V2h-2"/>
      </svg>
      Actualizar
    </button>
  );
}

/* ============================================================
   BugReportsTab
   ============================================================ */
function BugReportsTab({
  bugs, allBugs, loading, error, stats, search, onSearch,
  sevFilter, onSevFilter, stsFilter, onStsFilter, onAdvance, updatingId, onRetry,
}: {
  bugs: BugReport[]; allBugs: BugReport[]; loading: boolean; error: string | null;
  stats: { total: number; pendiente: number; en_revision: number; resuelto: number; cerrado: number; critico: number };
  search: string; onSearch: (v: string) => void;
  sevFilter: BugSeverity | 'all'; onSevFilter: (v: BugSeverity | 'all') => void;
  stsFilter: BugStatus | 'all'; onStsFilter: (v: BugStatus | 'all') => void;
  onAdvance: (bug: BugReport, targetStatus: BugStatus) => void;
  updatingId: number | null;
  onRetry: () => void;
}) {
  const statCards = [
    { label: 'Total',       value: stats.total,       color: 'var(--accent)',   bg: 'rgba(0,200,255,0.06)'    },
    { label: 'Pendiente',   value: stats.pendiente,   color: '#b2bec3',         bg: 'rgba(178,190,195,0.06)'  },
    { label: 'En revisión', value: stats.en_revision, color: '#00c8ff',         bg: 'rgba(0,200,255,0.06)'    },
    { label: 'Resuelto',    value: stats.resuelto,    color: '#00e5a0',         bg: 'rgba(0,229,160,0.06)'    },
    { label: 'Cerrado',     value: stats.cerrado,     color: '#6c5ce7',         bg: 'rgba(108,92,231,0.06)'   },
    { label: 'Críticos',    value: stats.critico,     color: '#ff4757',         bg: 'rgba(255,71,87,0.06)'    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{
            padding: '10px 8px', borderRadius: 8, textAlign: 'center',
            background: s.bg, border: `1px solid ${s.color}22`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: 'var(--font-display)', color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--txt-muted)', marginTop: 3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--txt-muted)" strokeWidth="1.5"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="5.5" cy="5.5" r="4.5"/>
            <path d="M9.5 9.5l2 2" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por título, descripción o usuario…"
            style={{
              width: '100%', padding: '8px 10px 8px 30px', borderRadius: 7, boxSizing: 'border-box',
              border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
              color: 'var(--txt)', fontSize: 12, outline: 'none',
            }}
          />
        </div>
        <PSelect
          value={sevFilter}
          onChange={(v) => onSevFilter(v as BugSeverity | 'all')}
          options={[
            { value: 'all', label: 'Severidad' },
            ...Object.entries(SEV).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
        />
        <PSelect
          value={stsFilter}
          onChange={(v) => onStsFilter(v as BugStatus | 'all')}
          options={[
            { value: 'all', label: 'Estado' },
            ...STATUS_ORDER.map((s) => ({ value: s, label: STS[s].label })),
          ]}
        />
      </div>

      {/* List */}
      {loading ? (
        <PSkeletonList count={4} />
      ) : error ? (
        <PErrorCard message={error} onRetry={onRetry} />
      ) : bugs.length === 0 ? (
        <PEmptyCard icon="🐛" message={allBugs.length > 0 ? 'Sin resultados con los filtros aplicados.' : 'No hay bug reports aún.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bugs.map((bug) => (
            <BugCard key={bug.Report_ID} bug={bug} onAdvance={onAdvance} updating={updatingId === bug.Report_ID} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   BugCard
   ============================================================ */
function BugCard({ bug, onAdvance, updating }: {
  bug: BugReport;
  onAdvance: (bug: BugReport, targetStatus: BugStatus) => void;
  updating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hov,      setHov]      = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const sev = SEV[bug.Severity];
  const sts = STS[bug.Status];
  const PREVIEW = 160;
  const showExpander = bug.Description.length > PREVIEW;
  const displayText  = expanded || !showExpander
    ? bug.Description
    : bug.Description.slice(0, PREVIEW) + '…';

  useEffect(() => {
    if (!dropOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropOpen]);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 10,
        border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)', transition: 'border-color 0.12s',
      }}
    >
      <div style={{ display: 'flex', gap: 12, padding: '12px 14px' }}>
        <div style={{ width: 3, flexShrink: 0, borderRadius: 2, background: sev.color, alignSelf: 'stretch', minHeight: 40 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', flex: 1, minWidth: 120 }}>
              {bug.Title}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color,
              textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 0,
            }}>
              {sev.label}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.55 }}>
            {displayText}
            {showExpander && (
              <button onClick={() => setExpanded((v) => !v)}
                style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {expanded ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {bug.reporter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(0,200,255,0.12)', border: '1px solid rgba(0,200,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 800, color: 'var(--accent)', flexShrink: 0,
                }}>
                  {initials(bug.reporter.User_Name)}
                </div>
                <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{bug.reporter.User_Name}</span>
              </div>
            )}
            <span style={{ fontSize: 10, color: 'var(--txt-muted)', opacity: 0.6 }}>#{bug.Report_ID}</span>
            <span style={{ fontSize: 10, color: 'var(--txt-muted)', opacity: 0.6 }}>{fmtDate(bug.Created_At)}</span>
            {bug.Screen_Path && (
              <span style={{ fontSize: 10, color: 'var(--txt-muted)', opacity: 0.6 }}>📄 {bug.Screen_Path}</span>
            )}
          </div>
        </div>

        {/* Status dropdown */}
        <div ref={dropRef} style={{ flexShrink: 0, position: 'relative', alignSelf: 'flex-start' }}>
          <button
            onClick={() => !updating && setDropOpen((v) => !v)}
            disabled={updating}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 6,
              cursor: updating ? 'not-allowed' : 'pointer',
              border: `1px solid ${sts.border}`, background: sts.bg,
              color: sts.color, fontSize: 10, fontWeight: 700,
              opacity: updating ? 0.5 : 1, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {updating ? '…' : <>{sts.icon} {sts.label}</>}
            {!updating && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
                style={{ transform: dropOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
                <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          {dropOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              overflow: 'hidden', minWidth: 150,
            }}>
              {STATUS_ORDER.map((s) => {
                const sc      = STS[s];
                const current = s === bug.Status;
                return (
                  <button
                    key={s}
                    onClick={() => { setDropOpen(false); if (!current) onAdvance(bug, s); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '9px 14px', border: 'none',
                      background: current ? sc.bg : 'transparent',
                      color: current ? sc.color : 'var(--txt)',
                      fontSize: 12, fontWeight: current ? 700 : 400,
                      cursor: current ? 'default' : 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { if (!current) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { if (!current) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 14 }}>{sc.icon}</span>
                    <span style={{ flex: 1 }}>{sc.label}</span>
                    {current && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5L8.5 2" stroke={sc.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
/* ============================================================
   SatisfactionTab
   ============================================================ */
function SatisfactionTab({ ratings, loading, error, stats, onRetry }: {
  ratings: SatisfactionRating[]; loading: boolean; error: string | null;
  stats: { total: number; avg: number; dist: { score: number; count: number }[]; withComment: number };
  onRetry: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Overview cards */}
      {!loading && !error && stats.total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
          {/* Average */}
          <div style={{
            padding: '20px 16px', borderRadius: 10, textAlign: 'center',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>Promedio</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 50, fontWeight: 900, fontFamily: 'var(--font-display)', color: scoreColor(stats.avg), lineHeight: 1 }}>
                {stats.avg.toFixed(1)}
              </span>
              <span style={{ fontSize: 16, color: 'var(--txt-muted)' }}>/5</span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1,2,3,4,5].map((s) => (
                <svg key={s} width="16" height="16" viewBox="0 0 16 16"
                  fill={s <= Math.round(stats.avg) ? scoreColor(stats.avg) : 'var(--bg-panel)'}
                  stroke={s <= Math.round(stats.avg) ? scoreColor(stats.avg) : 'var(--border-subtle)'}
                  strokeWidth="1.2">
                  <polygon points="8,1.5 10.1,5.7 14.8,6.4 11.4,9.7 12.2,14.4 8,12.2 3.8,14.4 4.6,9.7 1.2,6.4 5.9,5.7"/>
                </svg>
              ))}
            </div>
            <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{stats.total} respuestas</span>
            <span style={{ fontSize: 10, color: 'var(--txt-muted)', opacity: 0.7 }}>{stats.withComment} con comentario</span>
          </div>

          {/* Distribution */}
          <div style={{
            padding: '16px 20px', borderRadius: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center',
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>
              Distribución
            </span>
            {[5,4,3,2,1].map((s) => {
              const entry = stats.dist.find((d) => d.score === s)!;
              const pct   = stats.total > 0 ? (entry.count / stats.total) * 100 : 0;
              const c     = scoreColor(s);
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--txt-muted)', width: 8, flexShrink: 0 }}>{s}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill={c} style={{ flexShrink: 0 }}>
                    <polygon points="6,1 7.8,4.3 11.5,4.8 9,7.2 9.6,11 6,9.1 2.4,11 3,7.2 0.5,4.8 4.2,4.3"/>
                  </svg>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-panel)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: c, transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', width: 24, textAlign: 'right', flexShrink: 0 }}>{entry.count}</span>
                  <span style={{ fontSize: 9, color: 'var(--txt-muted)', width: 32, flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ratings list */}
      {loading ? (
        <PSkeletonList count={3} />
      ) : error ? (
        <PErrorCard message={error} onRetry={onRetry} />
      ) : ratings.length === 0 ? (
        <PEmptyCard icon="⭐" message="No hay calificaciones aún." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ratings.map((r) => (
            <RatingCard key={r.Rating_ID} rating={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RatingCard
   ============================================================ */
function RatingCard({ rating }: { rating: SatisfactionRating }) {
  const [hov, setHov] = useState(false);
  const c = scoreColor(rating.Score);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px', borderRadius: 10,
        border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)', transition: 'all 0.12s',
      }}
    >
      {/* Score circle */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: `${c}12`, border: `2px solid ${c}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 18, fontWeight: 900, color: c, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {rating.Score}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Stars */}
        <div style={{ display: 'flex', gap: 2, marginBottom: rating.Comment ? 6 : 4 }}>
          {[1,2,3,4,5].map((s) => (
            <svg key={s} width="13" height="13" viewBox="0 0 12 12"
              fill={s <= rating.Score ? c : 'var(--bg-panel)'}
              stroke={s <= rating.Score ? c : 'var(--border-subtle)'}
              strokeWidth="1">
              <polygon points="6,1 7.4,4.1 11,4.6 8.5,7 9.1,10.6 6,8.9 2.9,10.6 3.5,7 1,4.6 4.6,4.1"/>
            </svg>
          ))}
        </div>

        {rating.Comment && (
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--txt)', lineHeight: 1.5, fontStyle: 'italic' }}>
            "{rating.Comment}"
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {rating.rater && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 800, color: 'var(--txt-muted)',
              }}>
                {initials(rating.rater.User_Name)}
              </div>
              <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{rating.rater.User_Name}</span>
            </div>
          )}
          <span style={{ fontSize: 10, color: 'var(--txt-muted)', opacity: 0.6 }}>{fmtDateTime(rating.Created_At)}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Primitivos compartidos
   ============================================================ */
function PSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12,
        outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function PSkeletonList({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 72, borderRadius: 10,
          background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-hover) 50%, var(--bg-surface) 75%)',
          backgroundSize: '200% 100%', animation: 'skeleton-sweep 1.4s ease infinite',
          border: '1px solid var(--border-subtle)',
        }} />
      ))}
    </div>
  );
}

function PEmptyCard({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{
      padding: '40px', textAlign: 'center', borderRadius: 10,
      border: '1px dashed var(--border-subtle)', background: 'var(--bg-surface)',
    }}>
      <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.35 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--txt-muted)' }}>{message}</p>
    </div>
  );
}

function PErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.25)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" stroke="#ff4757" strokeWidth="1.3"/>
        <path d="M8 5v4M8 10.5v.5" stroke="#ff4757" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{ flex: 1, fontSize: 12, color: '#ff4757' }}>{message}</span>
      <button
        onClick={onRetry}
        style={{
          padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.08)', color: '#ff4757',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}