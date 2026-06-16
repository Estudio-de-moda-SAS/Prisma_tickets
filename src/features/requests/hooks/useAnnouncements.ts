import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient }      from '@/lib/apiClient';
import { useRole }        from '@/auth/roles';
import { useCurrentUser } from './useCurrentUser';

/* ── Tipo principal ── */
export interface Announcement {
  id:         string;
  title:      string;
  body:       string | null;
  type:       'info' | 'warning' | 'critical' | 'success';
  showIn:     string[];
  targetRole: string | null;
  isActive:   boolean;
  startsAt:   string;
  endsAt:     string | null;
  createdAt:  string;
}

/* ── Estilos visuales compartidos ── */
export const ANNOUNCEMENT_TYPE_STYLE: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  info:     { bg: 'rgba(0,200,255,0.08)',  border: 'rgba(0,200,255,0.22)',  color: '#00c8ff', icon: 'ℹ️'  },
  warning:  { bg: 'rgba(239,159,39,0.08)', border: 'rgba(239,159,39,0.22)', color: '#EF9F27', icon: '⚠️'  },
  critical: { bg: 'rgba(255,71,87,0.10)',  border: 'rgba(255,71,87,0.25)',  color: '#ff4757', icon: '🚨' },
  success:  { bg: 'rgba(76,175,80,0.08)',  border: 'rgba(76,175,80,0.22)',  color: '#4CAF50', icon: '✅' },
};

/* ── Queries ── */

/** Para componentes dentro del app — obtiene contexto del usuario internamente */
export function useAnnouncements(surface: string) {
  const { data: currentUser } = useCurrentUser();
  const { role }              = useRole();

  return useQuery<Announcement[]>({
    queryKey: ['announcements', surface, role,
               currentUser?.Department_ID ?? null,
               currentUser?.Team_ID       ?? null],
    queryFn:  () => apiClient.call('get_announcements', {
      surface,
      userRole:   role,
      userDeptId: currentUser?.Department_ID ?? null,
      userTeamId: currentUser?.Team_ID       ?? null,
    }) as Promise<Announcement[]>,
    staleTime: 60_000,
    retry:     false,
    enabled:   !!currentUser,
  });
}

/** Para el panel de admin — trae todos sin filtrar */
export function useAllAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ['announcements_all'],
    queryFn:  () =>
      apiClient.call('get_all_announcements', {}) as Promise<Announcement[]>,
    staleTime: 30_000,
    retry:     false,
  });
}

/** Para LoginPage — sin autenticación Azure */
export function usePublicAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ['announcements_public'],
    queryFn:  async () => {
      const url     = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
      try {
        const resp = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body:    JSON.stringify({ action: 'get_public_announcements', payload: {} }),
        });
        if (!resp.ok) return [];
        const json = await resp.json();
        return Array.isArray(json) ? json : (json?.data ?? []);
      } catch { return []; }
    },
    staleTime: 60_000,
    retry:     false,
  });
}

/* ── Mutations ── */
type CreatePayload = Omit<Announcement, 'id' | 'createdAt' | 'isActive'> & { createdBy: number };
type UpdatePayload = Partial<Announcement> & { id: string };

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: CreatePayload) => apiClient.call('create_announcement', d),
    onSettled:  () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcements_all'] });
    },
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: UpdatePayload) =>
      apiClient.call('update_announcement', { id, ...d }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcements_all'] });
    },
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.call('delete_announcement', { id }),
    onSettled:  () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcements_all'] });
    },
  });
}

/* ── localStorage helpers ── */
const DISMISSED_KEY = 'prisma_dismissed_announcements';
const CONFIRMED_KEY = 'prisma_confirmed_announcements';

function readLS(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); }
  catch { return []; }
}
function writeLS(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids));
}

export const getDismissed        = () => readLS(DISMISSED_KEY);
export const getConfirmed        = () => readLS(CONFIRMED_KEY);
export const dismissAnnouncement = (id: string) => {
  const list = readLS(DISMISSED_KEY);
  if (!list.includes(id)) writeLS(DISMISSED_KEY, [...list, id]);
};
export const confirmAnnouncement = (id: string) => {
  const list = readLS(CONFIRMED_KEY);
  if (!list.includes(id)) writeLS(CONFIRMED_KEY, [...list, id]);
};