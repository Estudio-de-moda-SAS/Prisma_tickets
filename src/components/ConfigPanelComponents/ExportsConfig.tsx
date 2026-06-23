// src/components/layout/ConfigPanelComponents/ExportsConfig.tsx
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import {
  Check, ChevronRight, ChevronLeft, FileSpreadsheet, FileText,
  Filter, Columns3, Eye, AlertCircle, Loader2, GripVertical,
  ChevronUp, ChevronDown, X, Search, Send, History, Plus,
} from 'lucide-react';

import { useBoardTeams, useBoardTemplates } from '@/features/requests/hooks/useBoardMetadata';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useUsers } from '@/features/requests/hooks/useUsers';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useExportData } from '@/features/exports/hooks/useExportData';
import { useCreateExportJob } from '@/features/exports/hooks/useCreateExportJob';
import {
  FIXED_COLUMNS, buildAvailableColumns, resolveSelectedColumns,
} from '@/features/exports/services/columnRegistry';
import { PRIORIDAD_TO_SCORE, SCORE_TO_PRIORIDAD } from '@/features/requests/types';
import type {
  ExportFilters, ExportFormat, ExportColumn,
  CreateExportJobResponse
} from '@/features/exports/types';

import { ExportProgressView } from './ExportProgressView';
import { ExportHistoryList } from './ExportHistoryList';

/* ============================================================
   Constantes
   ============================================================ */

const DEFAULT_SELECTED_COLUMN_IDS = [
  'request_id', 'title', 'template_name', 'teams', 'sprint', 'labels',
  'priority', 'score', 'progress', 'estimated_hours', 'logged_hours',
  'column', 'requester', 'requester_department', 'assignees',
  'created_at', 'finished_at', 'closure_note',
];

const PRIORITY_OPTIONS = [
  { score: 6, label: 'Crítica' },
  { score: 4, label: 'Alta' },
  { score: 2, label: 'Media' },
  { score: 1, label: 'Baja' },
];

type Step = 1 | 2 | 3;
type Tab  = 'new' | 'history';

type ActiveJob = {
  jobId:    string;
  exportId: string;
  total:    number;
  format:   ExportFormat;
  selectedColumns:  string[];
  sheetPerTemplate: boolean;
  filters:  ExportFilters;
};

/* ── Hook auxiliar para columnas del board ──────────────── */

function useBoardColumns(boardId: number) {
  return useQuery({
    queryKey: ['board-columns', boardId],
    queryFn:  () => apiClient.call<Array<{
      Board_Column_ID: number; Board_Column_Name: string;
      Board_Column_Slug: string | null; Board_Column_Position: number;
      Board_Column_Color: string;
    }>>('fetchBoardColumns', { boardId }),
    staleTime: 1000 * 60 * 10,
  });
}

/* ============================================================
   Componente raíz — Maneja tabs + modo progreso
   ============================================================ */

export function ExportsConfig({ initialTab = 'new' }: { initialTab?: Tab }) {
  const { data: currentUser } = useCurrentUser();
  const userId = currentUser?.User_ID ?? null;

  const [tab, setTab] = useState<Tab>(initialTab);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);

  if (!userId) {
    return <div className="exports-status"><Loader2 size={14} className="exports-spin" /> Cargando usuario…</div>;
  }

  if (activeJob) {
    return (
      <ExportProgressView
        jobId={activeJob.jobId}
        exportId={activeJob.exportId}
        userId={userId}
        format={activeJob.format}
        selectedColumns={activeJob.selectedColumns}
        sheetPerTemplate={activeJob.sheetPerTemplate}
        filters={activeJob.filters}
        totalExpected={activeJob.total}
        onBack={() => { setActiveJob(null); setTab('history'); }}
      />
    );
  }

  return (
    <div className="exports-root">
      <div className="exports-tabs">
        <button
          className={`exports-tab${tab === 'new' ? ' exports-tab--active' : ''}`}
          onClick={() => setTab('new')}
        >
          <Plus size={12} /> Nueva exportación
        </button>
        <button
          className={`exports-tab${tab === 'history' ? ' exports-tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          <History size={12} /> Historial
        </button>
      </div>

      <div className="exports-tabs__body">
        {tab === 'new' && (
          <ExportsWizard
            userId={userId}
            onJobCreated={(res, payload) => {
              setActiveJob({
                jobId:            res.jobId,
                exportId:         res.exportId,
                total:            res.total,
                format:           payload.format,
                selectedColumns:  payload.selectedColumns,
                sheetPerTemplate: payload.sheetPerTemplate,
                filters:          payload.filters,
              });
            }}
          />
        )}
        {tab === 'history' && (
          <ExportHistoryList
            userId={userId}
            onJobCreated={(res, entry) => {
              setActiveJob({
                jobId:            res.jobId,
                exportId:         res.exportId,
                total:            res.total,
                format:           entry.Export_Format,
                selectedColumns:  entry.Export_Columns,
                sheetPerTemplate: entry.Export_Sheet_Per_Tpl,
                filters:          entry.Export_Filters,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Wizard de 3 pasos (igual que Fase 1 pero ahora encola job)
   ============================================================ */

type WizardProps = {
  userId: number;
  onJobCreated: (
    res:     CreateExportJobResponse,
    payload: {
      format:           ExportFormat;
      selectedColumns:  string[];
      sheetPerTemplate: boolean;
      filters:          ExportFilters;
    },
  ) => void;
};

function ExportsWizard({ userId, onJobCreated }: WizardProps) {
  const boardId = config.DEFAULT_BOARD_ID;
  const [step, setStep] = useState<Step>(1);
  const [filters, setFilters] = useState<ExportFilters>({
    boardId,
    teamIds:        null,
    sprintIds:      null,
    columnIds:      null,
    requestedByIds: null,
    assignedToIds:  null,
    priorityScores: null,
    templateIds:    null,
    isConfidential: null,
    dateFrom:       null,
    dateTo:         null,
  });
  const [selectedColumns, setSelectedColumns]   = useState<string[]>(DEFAULT_SELECTED_COLUMN_IDS);
  const [format, setFormat]                     = useState<ExportFormat>('xlsx');
  const [sheetPerTemplate, setSheetPerTemplate] = useState(true);

  const { data: boardTeams   = [] } = useBoardTeams(boardId);
  const { data: boardColumns = [] } = useBoardColumns(boardId);
  const { data: templates    = [] } = useBoardTemplates(boardId);
  const { data: sprints      = [] } = useSprints();
  const { data: users        = [] } = useUsers() as { data: Array<{ User_ID: number; User_Name: string }> };

  // Dataset preview — solo en paso 3 con sample pequeño
  const previewFilters = useMemo(() => ({ ...filters, limit: 30 }), [filters]);
  const { data: dataset, isLoading, isError, error, refetch } = useExportData(previewFilters, step === 3);

  const available = useMemo(() => {
    if (!dataset) return { fixed: FIXED_COLUMNS, dynamicByTemplate: new Map<number, ExportColumn[]>() };
    return buildAvailableColumns(dataset.tickets, dataset.templates);
  }, [dataset]);

  const resolvedColumns = useMemo(() => {
    if (!dataset) return [];
    return resolveSelectedColumns(selectedColumns, available, dataset.templates);
  }, [dataset, selectedColumns, available]);

  const createMut = useCreateExportJob();

  const goNext = useCallback(() => setStep((s) => (s < 3 ? ((s + 1) as Step) : s)), []);
  const goPrev = useCallback(() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s)), []);

  const handleEnqueue = useCallback(async () => {
    try {
      const res = await createMut.mutateAsync({
        userId,
        boardId,
        filters: stripBoardId(filters),
        format,
        selectedColumns,
        sheetPerTemplate,
      });
      onJobCreated(res, { format, selectedColumns, sheetPerTemplate, filters });
    } catch { /* error visible via mutation state */ }
  }, [createMut, userId, boardId, filters, format, selectedColumns, sheetPerTemplate, onJobCreated]);

  return (
    <div className="exports-wizard">
      <ExportStepper step={step} />

      <div className="exports-wizard__body">
        {step === 1 && (
          <ScopeStep
            filters={filters}
            onChange={setFilters}
            boardTeams={boardTeams}
            boardColumns={boardColumns}
            templates={templates}
            sprints={sprints}
            users={users}
          />
        )}
        {step === 2 && (
          <ColumnsStep
            selectedColumns={selectedColumns}
            onChange={setSelectedColumns}
            available={available}
            templates={templates}
            datasetReady={!!dataset}
            onRequestPreview={() => refetch()}
            isLoading={isLoading}
          />
        )}
        {step === 3 && (
          <FormatStep
            format={format}
            onFormatChange={setFormat}
            sheetPerTemplate={sheetPerTemplate}
            onSheetPerTemplateChange={setSheetPerTemplate}
            dataset={dataset}
            resolvedColumns={resolvedColumns}
            isLoading={isLoading}
            isError={isError}
            errorMessage={(error as Error | null)?.message ?? null}
            genError={createMut.error?.message ?? null}
            templates={templates}
          />
        )}
      </div>

      <div className="exports-wizard__footer">
        <button
          className="exports-btn exports-btn--ghost"
          onClick={goPrev}
          disabled={step === 1 || createMut.isPending}
        >
          <ChevronLeft size={14} /> Anterior
        </button>

        {step < 3 ? (
          <button className="exports-btn exports-btn--primary" onClick={goNext}>
            Siguiente <ChevronRight size={14} />
          </button>
        ) : (
          <button
            className="exports-btn exports-btn--primary"
            onClick={handleEnqueue}
            disabled={createMut.isPending || !dataset || resolvedColumns.length === 0}
          >
            {createMut.isPending
              ? <><Loader2 size={14} className="exports-spin" /> Encolando…</>
              : <><Send size={14} /> Encolar exportación</>}
          </button>
        )}
      </div>
    </div>
  );
}

function stripBoardId(filters: ExportFilters): Omit<ExportFilters, 'boardId'> {
  const { boardId: _b, ...rest } = filters;
  void _b;
  return rest;
}

/* ============================================================
   Stepper, Scope, Columns, Format, MultiSelect, Preview
   (idénticos a Fase 1 — pegados aquí abajo)
   ============================================================ */

function ExportStepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: 'Filtros',  icon: Filter },
    { n: 2, label: 'Columnas', icon: Columns3 },
    { n: 3, label: 'Formato',  icon: Eye },
  ];
  return (
    <div className="exports-stepper">
      {items.map((it, idx) => {
        const Icon  = it.icon;
        const state = it.n < step ? 'done' : it.n === step ? 'active' : 'pending';
        return (
          <div key={it.n} className="exports-stepper__item-wrap">
            <div className={`exports-stepper__item exports-stepper__item--${state}`}>
              <div className="exports-stepper__circle">
                {state === 'done' ? <Check size={12} /> : <Icon size={12} />}
              </div>
              <span className="exports-stepper__label">{it.label}</span>
            </div>
            {idx < items.length - 1 && (
              <div className={`exports-stepper__line exports-stepper__line--${it.n < step ? 'done' : 'pending'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type ScopeStepProps = {
  filters:      ExportFilters;
  onChange:     (f: ExportFilters) => void;
  boardTeams:   Array<{ Board_Team_ID: number; Board_Team_Name: string; Board_Team_Color: string }>;
  boardColumns: Array<{ Board_Column_ID: number; Board_Column_Name: string }>;
  templates:    Array<{ Request_Template_ID: number; Request_Template_Name: string }>;
  sprints:      Array<{ Sprint_ID: number; Sprint_Text: string }>;
  users:        Array<{ User_ID: number; User_Name: string }>;
};

function ScopeStep(p: ScopeStepProps) {
  const set = <K extends keyof ExportFilters>(k: K, v: ExportFilters[K]) =>
    p.onChange({ ...p.filters, [k]: v });

  return (
    <div className="exports-scope">
      <p className="exports-step-hint">
        Definí qué tickets se incluirán. Si no seleccionás nada en un filtro, se consideran todos.
      </p>
      <div className="exports-scope__grid">
        <MultiSelectFilter label="Equipos"           options={p.boardTeams.map((t) => ({ value: t.Board_Team_ID, label: t.Board_Team_Name }))}    selected={p.filters.teamIds       ?? []} onChange={(v) => set('teamIds',       v.length > 0 ? v : null)} placeholder="Todos los equipos" />
        <MultiSelectFilter label="Sprints"           options={p.sprints.map((s) => ({ value: s.Sprint_ID,        label: s.Sprint_Text }))}        selected={p.filters.sprintIds     ?? []} onChange={(v) => set('sprintIds',     v.length > 0 ? v : null)} placeholder="Todos los sprints" />
        <MultiSelectFilter label="Estado (columnas)" options={p.boardColumns.map((c) => ({ value: c.Board_Column_ID, label: c.Board_Column_Name }))} selected={p.filters.columnIds     ?? []} onChange={(v) => set('columnIds',     v.length > 0 ? v : null)} placeholder="Todas las columnas" />
        <MultiSelectFilter label="Tipos (templates)" options={p.templates.map((t) => ({ value: t.Request_Template_ID, label: t.Request_Template_Name }))} selected={p.filters.templateIds ?? []} onChange={(v) => set('templateIds',   v.length > 0 ? v : null)} placeholder="Todos los templates" />
        <MultiSelectFilter label="Prioridades"       options={PRIORITY_OPTIONS.map((p2) => ({ value: p2.score,    label: p2.label }))}             selected={p.filters.priorityScores ?? []} onChange={(v) => set('priorityScores', v.length > 0 ? v : null)} placeholder="Todas las prioridades" />
        <MultiSelectFilter label="Solicitantes"      options={p.users.map((u) => ({ value: u.User_ID,             label: u.User_Name }))}          selected={p.filters.requestedByIds ?? []} onChange={(v) => set('requestedByIds', v.length > 0 ? v : null)} placeholder="Todos los solicitantes" searchable />
        <MultiSelectFilter label="Asignados"         options={p.users.map((u) => ({ value: u.User_ID,             label: u.User_Name }))}          selected={p.filters.assignedToIds  ?? []} onChange={(v) => set('assignedToIds',  v.length > 0 ? v : null)} placeholder="Todos los asignados"    searchable />

        <div className="exports-field">
          <label className="exports-field__label">Confidencialidad</label>
          <div className="exports-segmented">
            {[
              { v: null,  l: 'Todos' },
              { v: false, l: 'No confidenciales' },
              { v: true,  l: 'Solo confidenciales' },
            ].map((opt) => (
              <button
                key={String(opt.v)}
                className={`exports-segmented__btn${p.filters.isConfidential === opt.v ? ' exports-segmented__btn--active' : ''}`}
                onClick={() => set('isConfidential', opt.v as boolean | null)}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div className="exports-field">
          <label className="exports-field__label">Rango de fechas (creación)</label>
          <div className="exports-daterange">
            <input type="date" className="exports-input"
              value={p.filters.dateFrom?.slice(0, 10) ?? ''}
              onChange={(e) => set('dateFrom', e.target.value ? `${e.target.value}T00:00:00Z` : null)} />
            <span className="exports-daterange__sep">→</span>
            <input type="date" className="exports-input"
              value={p.filters.dateTo?.slice(0, 10) ?? ''}
              onChange={(e) => set('dateTo', e.target.value ? `${e.target.value}T23:59:59Z` : null)} />
          </div>
        </div>
      </div>
    </div>
  );
}

type MultiSelectFilterProps = {
  label:       string;
  options:     Array<{ value: number; label: string }>;
  selected:    number[];
  onChange:    (next: number[]) => void;
  placeholder: string;
  searchable?: boolean;
};

function MultiSelectFilter(p: MultiSelectFilterProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.exports-ms')) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (v: number) =>
    p.onChange(p.selected.includes(v) ? p.selected.filter((x) => x !== v) : [...p.selected, v]);

  const filtered = p.searchable && search
    ? p.options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : p.options;

  const summary =
    p.selected.length === 0   ? p.placeholder
    : p.selected.length === 1 ? p.options.find((o) => o.value === p.selected[0])?.label ?? '1 seleccionado'
    : `${p.selected.length} seleccionados`;

  return (
    <div className="exports-field exports-ms">
      <label className="exports-field__label">{p.label}</label>
      <button className="exports-ms__trigger" onClick={() => setOpen((o) => !o)}>
        <span className={p.selected.length === 0 ? 'exports-ms__trigger-placeholder' : ''}>{summary}</span>
        {p.selected.length > 0 && (
          <span className="exports-ms__clear"
            onClick={(e) => { e.stopPropagation(); p.onChange([]); }}
            role="button">
            <X size={11} />
          </span>
        )}
        <ChevronDown size={12} style={{ opacity: 0.5, marginLeft: 'auto' }} />
      </button>
      {open && (
        <div className="exports-ms__menu">
          {p.searchable && (
            <div className="exports-ms__search">
              <Search size={11} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" autoFocus />
            </div>
          )}
          <div className="exports-ms__list">
            {filtered.length === 0 && <div className="exports-ms__empty">Sin resultados</div>}
            {filtered.map((opt) => {
              const isSel = p.selected.includes(opt.value);
              return (
                <button key={opt.value}
                  className={`exports-ms__option${isSel ? ' exports-ms__option--active' : ''}`}
                  onClick={() => toggle(opt.value)}>
                  <span className={`exports-ms__checkbox${isSel ? ' exports-ms__checkbox--checked' : ''}`}>
                    {isSel && <Check size={9} />}
                  </span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type ColumnsStepProps = {
  selectedColumns:  string[];
  onChange:         (ids: string[]) => void;
  available:        { fixed: ExportColumn[]; dynamicByTemplate: Map<number, ExportColumn[]> };
  templates:        Array<{ Request_Template_ID: number; Request_Template_Name: string; Request_Template_Icon: string | null }>;
  datasetReady:     boolean;
  onRequestPreview: () => void;
  isLoading:        boolean;
};

function ColumnsStep(p: ColumnsStepProps) {
  const allDynamic: ExportColumn[] = useMemo(
    () => Array.from(p.available.dynamicByTemplate.values()).flat(),
    [p.available],
  );
  const byId = useMemo(() => {
    const m = new Map<string, ExportColumn>();
    for (const c of p.available.fixed)  m.set(c.id, c);
    for (const c of allDynamic)         m.set(c.id, c);
    return m;
  }, [p.available, allDynamic]);

  const toggle = (id: string) => {
    p.onChange(p.selectedColumns.includes(id)
      ? p.selectedColumns.filter((x) => x !== id)
      : [...p.selectedColumns, id]);
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = p.selectedColumns.indexOf(id);
    const next = idx + dir;
    if (idx === -1 || next < 0 || next >= p.selectedColumns.length) return;
    const copy = [...p.selectedColumns];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    p.onChange(copy);
  };

  return (
    <div className="exports-columns">
      <p className="exports-step-hint">
        Elegí qué columnas incluir y en qué orden. Los campos dinámicos por template se detectan al previsualizar.
      </p>

      <div className="exports-columns__grid">
        <div className="exports-columns__panel">
          <div className="exports-columns__panel-header">
            <span>Disponibles</span>
            <button className="exports-link-btn"
              onClick={() => p.onChange([...p.available.fixed.map((c) => c.id), ...allDynamic.map((c) => c.id)])}>
              Seleccionar todas
            </button>
          </div>
          <div className="exports-columns__group-label">Estructurales</div>
          <div className="exports-columns__list">
            {p.available.fixed.map((c) => (
              <ColumnOption key={c.id} col={c} selected={p.selectedColumns.includes(c.id)} onToggle={() => toggle(c.id)} />
            ))}
          </div>
          <div className="exports-columns__group-label">
            Dinámicas por template
            {!p.datasetReady && (
              <button className="exports-link-btn" onClick={p.onRequestPreview} disabled={p.isLoading}>
                {p.isLoading ? 'Cargando…' : 'Detectar dinámicas'}
              </button>
            )}
          </div>
          {!p.datasetReady && (
            <div className="exports-columns__notice">
              Avanzá al paso 3 o tocá "Detectar dinámicas" para ver los campos personalizados de tus templates.
            </div>
          )}
          {p.datasetReady && allDynamic.length === 0 && (
            <div className="exports-columns__notice">
              Los tickets que coinciden con los filtros no tienen campos dinámicos.
            </div>
          )}
          {Array.from(p.available.dynamicByTemplate.entries()).map(([tid, cols]) => {
            const tpl = p.templates.find((x) => x.Request_Template_ID === tid);
            return (
              <div key={tid} className="exports-columns__template-group">
                <div className="exports-columns__template-name">
                  {tpl?.Request_Template_Icon ?? '📋'} {tpl?.Request_Template_Name ?? `Template ${tid}`}
                </div>
                <div className="exports-columns__list">
                  {cols.map((c) => (
                    <ColumnOption key={c.id} col={c} selected={p.selectedColumns.includes(c.id)} onToggle={() => toggle(c.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="exports-columns__panel">
          <div className="exports-columns__panel-header">
            <span>Seleccionadas — orden de salida</span>
            <span className="exports-columns__counter">{p.selectedColumns.length}</span>
          </div>
          <div className="exports-columns__selected">
            {p.selectedColumns.length === 0 && (
              <div className="exports-columns__notice">Ninguna columna seleccionada.</div>
            )}
            {p.selectedColumns.map((id) => {
              const col = byId.get(id);
              if (!col) return null;
              return (
                <div key={id} className="exports-columns__selected-row">
                  <GripVertical size={11} className="exports-columns__grip" />
                  <span className="exports-columns__selected-label">{col.label}</span>
                  {col.source === 'dynamic' && <span className="exports-columns__badge">dinámica</span>}
                  <button className="exports-icon-btn" onClick={() => move(id, -1)} title="Subir"><ChevronUp size={11} /></button>
                  <button className="exports-icon-btn" onClick={() => move(id, +1)} title="Bajar"><ChevronDown size={11} /></button>
                  <button className="exports-icon-btn exports-icon-btn--danger" onClick={() => toggle(id)} title="Quitar"><X size={11} /></button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnOption({ col, selected, onToggle }: { col: ExportColumn; selected: boolean; onToggle: () => void }) {
  return (
    <button className={`exports-columns__option${selected ? ' exports-columns__option--active' : ''}`} onClick={onToggle}>
      <span className={`exports-ms__checkbox${selected ? ' exports-ms__checkbox--checked' : ''}`}>
        {selected && <Check size={9} />}
      </span>
      <span className="exports-columns__option-label">{col.label}</span>
      <span className="exports-columns__option-type">{col.type}</span>
    </button>
  );
}

type FormatStepProps = {
  format:                  ExportFormat;
  onFormatChange:          (f: ExportFormat) => void;
  sheetPerTemplate:        boolean;
  onSheetPerTemplateChange: (b: boolean) => void;
  dataset:                 ReturnType<typeof useExportData>['data'];
  resolvedColumns:         ExportColumn[];
  isLoading:               boolean;
  isError:                 boolean;
  errorMessage:            string | null;
  genError:                string | null;
  templates:               Array<{ Request_Template_ID: number; Request_Template_Name: string }>;
};

function FormatStep(p: FormatStepProps) {
  return (
    <div className="exports-format">
      <div className="exports-format__top">
        <div className="exports-field">
          <label className="exports-field__label">Formato</label>
          <div className="exports-format__cards">
            <button className={`exports-format__card${p.format === 'xlsx' ? ' exports-format__card--active' : ''}`}
              onClick={() => p.onFormatChange('xlsx')}>
              <FileSpreadsheet size={20} />
              <div>
                <div className="exports-format__card-title">XLSX (Excel)</div>
                <div className="exports-format__card-sub">Con formato, colores y hoja resumen</div>
              </div>
            </button>
            <button className={`exports-format__card${p.format === 'csv' ? ' exports-format__card--active' : ''}`}
              onClick={() => p.onFormatChange('csv')}>
              <FileText size={20} />
              <div>
                <div className="exports-format__card-title">CSV (ZIP)</div>
                <div className="exports-format__card-sub">Un CSV por template, UTF-8 con BOM</div>
              </div>
            </button>
          </div>
        </div>

        <div className="exports-field">
          <label className="exports-field__label">Estructura</label>
          <label className="exports-checkbox-row">
            <input type="checkbox" checked={p.sheetPerTemplate}
              onChange={(e) => p.onSheetPerTemplateChange(e.target.checked)} />
            <span>Una hoja por equipo (recomendado)</span>
          </label>
          <p className="exports-field__hint">
            Los tickets que pertenecen a varios equipos aparecen en cada hoja correspondiente.
            Si lo desactivás, todos los tickets quedan en una sola hoja.
          </p>
        </div>
      </div>

      {p.isLoading  && <div className="exports-status"><Loader2 size={14} className="exports-spin" /> Consultando preview…</div>}
      {p.isError    && <div className="exports-status exports-status--error"><AlertCircle size={14} /> Error: {p.errorMessage ?? 'desconocido'}</div>}
      {p.genError   && <div className="exports-status exports-status--error"><AlertCircle size={14} /> {p.genError}</div>}

      {p.dataset && (
        <div className="exports-meta">
          <div className="exports-meta__item">
            <span className="exports-meta__label">Coinciden con filtros</span>
            <span className="exports-meta__value">{p.dataset.meta.totalMatched.toLocaleString('es-CO')}</span>
          </div>
          <div className="exports-meta__item">
            <span className="exports-meta__label">Columnas</span>
            <span className="exports-meta__value">{p.resolvedColumns.length}</span>
          </div>
          <div className="exports-meta__item">
            <span className="exports-meta__label">Preview</span>
            <span className="exports-meta__value">{p.dataset.tickets.length} filas</span>
          </div>
        </div>
      )}

      {p.dataset && p.dataset.tickets.length > 0 && p.resolvedColumns.length > 0 && (
        <PreviewTable dataset={p.dataset} columns={p.resolvedColumns} />
      )}
      {p.dataset && p.dataset.tickets.length === 0 && (
        <div className="exports-empty">No hay tickets que coincidan con los filtros. Volvé al paso 1 y ajustalos.</div>
      )}
    </div>
  );
}

function PreviewTable({
  dataset, columns,
}: {
  dataset: NonNullable<ReturnType<typeof useExportData>['data']>;
  columns: ExportColumn[];
}) {
  const sample = dataset.tickets.slice(0, 8);

  const formatValue = (col: ExportColumn, t: typeof sample[0]): string => {
    const raw = col.accessor(t);
    if (raw === null || raw === undefined || raw === '') return '—';
    if (col.type === 'boolean')  return raw ? 'Sí' : 'No';
    if (col.type === 'priority') {
      const key = SCORE_TO_PRIORIDAD[t.Request_Score ?? -1];
      return key ? key.charAt(0).toUpperCase() + key.slice(1) : String(raw);
    }
    if (col.type === 'date' || col.type === 'datetime') {
      try {
        const s = String(raw);
        const d = new Date(s.endsWith('Z') ? s : `${s}Z`);
        return col.type === 'date'
          ? d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
          : d.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      } catch { return String(raw); }
    }
    return String(raw);
  };

  const truncate = (s: string, n: number) => s.length > n ? `${s.slice(0, n)}…` : s;

  return (
    <div className="exports-preview">
      <div className="exports-preview__header">Vista previa — primeras {sample.length} filas de muestra</div>
      <div className="exports-preview__scroll">
        <table className="exports-preview__table">
          <thead>
            <tr>{columns.map((c) => <th key={c.id}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {sample.map((t) => (
              <tr key={t.Request_ID}>
                {columns.map((c) => (
                  <td key={c.id} title={formatValue(c, t)}>{truncate(formatValue(c, t), 60)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="exports-preview__footer">
        Esto es solo un sample. La exportación final incluirá <strong>todos</strong> los tickets que coincidan con los filtros (procesados en background).
      </div>
    </div>
  );
}

// Silence unused
void PRIORIDAD_TO_SCORE;