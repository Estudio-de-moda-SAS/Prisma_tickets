// src/store/searchStore.ts
import { create } from 'zustand';

/* ============================================================
   Normalización: lowercase + sin acentos
   ============================================================ */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ============================================================
   Lógica de match — usada por BoardSearch (resultados) y
   RequestCard (atenuado). Mismo criterio en ambos lados.
   ============================================================ */
export function matchesSearchQuery(
  data:  { id: string; titulo: string },
  query: string,
): boolean {
  const q = query.trim();
  if (!q) return true;
  const nq = normalizeSearch(q);
  return normalizeSearch(data.id).includes(nq) ||
         normalizeSearch(data.titulo).includes(nq);
}

/* ============================================================
   Store: un solo query global (solo hay un board visible)
   ============================================================ */
type SearchState = {
  query:    string;
  setQuery: (q: string) => void;
  clear:    () => void;
};

export const useSearchStore = create<SearchState>((set) => ({
  query:    '',
  setQuery: (query) => set({ query }),
  clear:    () => set({ query: '' }),
}));