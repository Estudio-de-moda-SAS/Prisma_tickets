import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ============================================================
   Tipos
   ============================================================ */
export type Categoria = {
  id:     string;
  nombre: string;
  color:  string;
  icono?: string;
};

export type EquipoLocal = {
  id:     string;
  nombre: string;
  color:  string;
  siglas: string;
};

export type Sprint = {
  id:          string;
  nombre:      string;
  fechaInicio: string; // ISO date string "YYYY-MM-DD"
  fechaFin:    string;
};

/* ============================================================
   Defaults
   ============================================================ */
const DEFAULT_CATEGORIAS: Record<string, Categoria[]> = {
  desarrollo: [
    { id: 'dev-bug',    nombre: 'Bug',      color: '#ff4757', icono: '🐛' },
    { id: 'dev-ui',     nombre: 'UI',       color: '#00cec9', icono: '🖼️' },
    { id: 'dev-dis',    nombre: 'Diseño',   color: '#a29bfe', icono: '🎨' },
    { id: 'dev-devops', nombre: 'DevOps',   color: '#6c5ce7', icono: '⚙️' },
    { id: 'dev-back',   nombre: 'Backend',  color: '#0984e3', icono: '🔧' },
  ],
  crm: [
    { id: 'crm-data', nombre: 'Datos',       color: '#fdcb6e', icono: '📊' },
    { id: 'crm-int',  nombre: 'Integración', color: '#00c8ff', icono: '🔗' },
    { id: 'crm-rep',  nombre: 'Reportes',    color: '#a3cb38', icono: '📋' },
  ],
  sistemas: [
    { id: 'sis-inf', nombre: 'Infraestructura', color: '#6c5ce7', icono: '🏗️' },
    { id: 'sis-sec', nombre: 'Seguridad',        color: '#ff4757', icono: '🔒' },
    { id: 'sis-red', nombre: 'Red',              color: '#0984e3', icono: '🌐' },
  ],
  analisis: [
    { id: 'ana-rep',  nombre: 'Reporte',    color: '#fdcb6e', icono: '📊' },
    { id: 'ana-dash', nombre: 'Dashboard',  color: '#00e5a0', icono: '📱' },
    { id: 'ana-bi',   nombre: 'BI',         color: '#a29bfe', icono: '💡' },
  ],
};

const DEFAULT_EQUIPOS: Record<string, EquipoLocal[]> = {
  desarrollo: [
    { id: 'eq-dev-fe', nombre: 'Frontend', color: '#00c8ff', siglas: 'FE' },
    { id: 'eq-dev-be', nombre: 'Backend',  color: '#a29bfe', siglas: 'BE' },
    { id: 'eq-dev-qa', nombre: 'QA',       color: '#00e5a0', siglas: 'QA' },
  ],
  crm: [
    { id: 'eq-crm-ops', nombre: 'Operaciones', color: '#fdcb6e', siglas: 'OP' },
    { id: 'eq-crm-sup', nombre: 'Soporte',     color: '#ff6b81', siglas: 'SP' },
  ],
  sistemas: [
    { id: 'eq-sis-inf', nombre: 'Infraestructura', color: '#6c5ce7', siglas: 'IF' },
    { id: 'eq-sis-sec', nombre: 'Seguridad',        color: '#ff4757', siglas: 'SC' },
  ],
  analisis: [
    { id: 'eq-ana-bi',  nombre: 'BI',    color: '#a29bfe', siglas: 'BI' },
    { id: 'eq-ana-dat', nombre: 'Datos', color: '#fdcb6e', siglas: 'DT' },
  ],
};

/* ============================================================
   Store
   ============================================================ */
type ConfigState = {
  categoriasPorEquipo: Record<string, Categoria[]>;
  equiposPorBoard:     Record<string, EquipoLocal[]>;
  sprintsPorBoard:     Record<string, Sprint[]>;

  /* Categorías */
  getCategorias:   (boardId: string) => Categoria[];
  addCategoria:    (boardId: string, c: Omit<Categoria, 'id'>) => void;
  updateCategoria: (boardId: string, id: string, patch: Partial<Omit<Categoria, 'id'>>) => void;
  removeCategoria: (boardId: string, id: string) => void;

  /* Equipos */
  getEquipos:   (boardId: string) => EquipoLocal[];
  addEquipo:    (boardId: string, e: Omit<EquipoLocal, 'id'>) => void;
  updateEquipo: (boardId: string, id: string, patch: Partial<Omit<EquipoLocal, 'id'>>) => void;
  removeEquipo: (boardId: string, id: string) => void;

  /* Sprints */
  getSprints:   (boardId: string) => Sprint[];
  addSprint:    (boardId: string, s: Omit<Sprint, 'id'>) => void;
  updateSprint : (boardId: string, id: string, patch: Partial<Omit<Sprint, 'id'>>) => void;
  removeSprint : (boardId: string, id: string) => void;
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      categoriasPorEquipo: DEFAULT_CATEGORIAS,
      equiposPorBoard:     DEFAULT_EQUIPOS,
      sprintsPorBoard:     {},

      /* ── Categorías ── */
      getCategorias: (boardId) => get().categoriasPorEquipo[boardId] ?? [],

      addCategoria: (boardId, c) => set((s) => ({
        categoriasPorEquipo: {
          ...s.categoriasPorEquipo,
          [boardId]: [...(s.categoriasPorEquipo[boardId] ?? []), { ...c, id: `${boardId}-cat-${Date.now()}` }],
        },
      })),

      updateCategoria: (boardId, id, patch) => set((s) => ({
        categoriasPorEquipo: {
          ...s.categoriasPorEquipo,
          [boardId]: (s.categoriasPorEquipo[boardId] ?? []).map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        },
      })),

      removeCategoria: (boardId, id) => set((s) => ({
        categoriasPorEquipo: {
          ...s.categoriasPorEquipo,
          [boardId]: (s.categoriasPorEquipo[boardId] ?? []).filter((c) => c.id !== id),
        },
      })),

      /* ── Equipos ── */
      getEquipos: (boardId) => get().equiposPorBoard[boardId] ?? [],

      addEquipo: (boardId, e) => set((s) => ({
        equiposPorBoard: {
          ...s.equiposPorBoard,
          [boardId]: [...(s.equiposPorBoard[boardId] ?? []), { ...e, id: `${boardId}-eq-${Date.now()}` }],
        },
      })),

      updateEquipo: (boardId, id, patch) => set((s) => ({
        equiposPorBoard: {
          ...s.equiposPorBoard,
          [boardId]: (s.equiposPorBoard[boardId] ?? []).map((e) =>
            e.id === id ? { ...e, ...patch } : e
          ),
        },
      })),

      removeEquipo: (boardId, id) => set((s) => ({
        equiposPorBoard: {
          ...s.equiposPorBoard,
          [boardId]: (s.equiposPorBoard[boardId] ?? []).filter((e) => e.id !== id),
        },
      })),

      /* ── Sprints ── */
      getSprints: (boardId) => get().sprintsPorBoard[boardId] ?? [],

      addSprint: (boardId, s) => set((st) => ({
        sprintsPorBoard: {
          ...st.sprintsPorBoard,
          [boardId]: [...(st.sprintsPorBoard[boardId] ?? []), { ...s, id: `${boardId}-sp-${Date.now()}` }],
        },
      })),

      updateSprint: (boardId, id, patch) => set((st) => ({
        sprintsPorBoard: {
          ...st.sprintsPorBoard,
          [boardId]: (st.sprintsPorBoard[boardId] ?? []).map((s) =>
            s.id === id ? { ...s, ...patch } : s
          ),
        },
      })),

      removeSprint: (boardId, id) => set((st) => ({
        sprintsPorBoard: {
          ...st.sprintsPorBoard,
          [boardId]: (st.sprintsPorBoard[boardId] ?? []).filter((s) => s.id !== id),
        },
      })),
    }),
    { name: 'prisma-config-v3' }
  )
);