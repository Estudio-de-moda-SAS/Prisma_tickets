import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient }      from '@/lib/apiClient';
import { useRole }        from '@/auth/roles';
import { useCurrentUser } from './useCurrentUser';

/**
 * Hooks y utilidades para los anuncios (announcements) del sistema.
 *
 * Incluye el modelo {@link Announcement}, los estilos por tipo
 * ({@link ANNOUNCEMENT_TYPE_STYLE}), tres queries según el contexto
 * ({@link useAnnouncements} in-app, {@link useAllAnnouncements} admin,
 * {@link usePublicAnnouncements} login sin auth), las mutaciones de
 * crear/actualizar/eliminar, y helpers de `localStorage` para recordar los
 * anuncios descartados o confirmados por el usuario.
 *
 * @module useAnnouncements
 */

/* ── Tipo principal ── */

/** Un anuncio del sistema. */
export interface Announcement {
  /** ID del anuncio. */
  id:         string;
  /** Título mostrado. */
  title:      string;
  /** Cuerpo del anuncio, o `null`. */
  body:       string | null;
  /** Severidad/estilo del anuncio. */
  type:       'info' | 'warning' | 'critical' | 'success';
  /** Superficies (pantallas) donde debe mostrarse. */
  showIn:     string[];
  /** Rol destinatario, o `null` para todos. */
  targetRole: string | null;
  /** Si el anuncio está activo. */
  isActive:   boolean;
  /** Fecha de inicio de vigencia (ISO). */
  startsAt:   string;
  /** Fecha de fin de vigencia (ISO), o `null` sin fin. */
  endsAt:     string | null;
  /** Fecha de creación (ISO). */
  createdAt:  string;
}

/* ── Estilos visuales compartidos ── */

/**
 * Estilos visuales (fondo, borde, color e ícono) por tipo de anuncio.
 *
 * @remarks
 * Indexado por {@link Announcement.type}. Compartido entre los componentes que
 * renderizan anuncios para mantener una apariencia consistente.
 */
export const ANNOUNCEMENT_TYPE_STYLE: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  info:     { bg: 'rgba(0,200,255,0.08)',  border: 'rgba(0,200,255,0.22)',  color: '#00c8ff', icon: 'ℹ️'  },
  warning:  { bg: 'rgba(239,159,39,0.08)', border: 'rgba(239,159,39,0.22)', color: '#EF9F27', icon: '⚠️'  },
  critical: { bg: 'rgba(255,71,87,0.10)',  border: 'rgba(255,71,87,0.25)',  color: '#ff4757', icon: '🚨' },
  success:  { bg: 'rgba(76,175,80,0.08)',  border: 'rgba(76,175,80,0.22)',  color: '#4CAF50', icon: '✅' },
};

/* ── Queries ── */

/**
 * Anuncios visibles para el usuario actual en una superficie dada.
 *
 * @remarks
 * Para componentes dentro de la app: resuelve internamente rol, departamento y
 * equipo del usuario y los envía al backend para el filtrado. La query key
 * incluye esos valores para cachear por contexto, y se deshabilita hasta tener
 * `currentUser`. `staleTime` de 60s, sin reintentos.
 *
 * @param surface - Superficie/pantalla donde se mostrarán los anuncios.
 * @returns El resultado de `useQuery` con los anuncios filtrados.
 */
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

/**
 * Todos los anuncios, sin filtrar.
 *
 * @remarks
 * Para el panel de administración. `staleTime` de 30s, sin reintentos.
 *
 * @returns El resultado de `useQuery` con todos los anuncios.
 */
export function useAllAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ['announcements_all'],
    queryFn:  () =>
      apiClient.call('get_all_announcements', {}) as Promise<Announcement[]>,
    staleTime: 30_000,
    retry:     false,
  });
}

/**
 * Anuncios públicos para la pantalla de login (sin autenticación Azure).
 *
 * @remarks
 * Llama directamente a la Edge Function con la `anon key` en vez de pasar por
 * `apiClient`, porque en el login todavía no hay sesión. Es tolerante a fallos:
 * ante error de red, respuesta no-OK o JSON inesperado devuelve `[]`. Normaliza
 * la respuesta aceptando tanto un arreglo directo como `{ data: [...] }`.
 *
 * @returns El resultado de `useQuery` con los anuncios públicos (o `[]`).
 */
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

/** Payload de creación: el anuncio sin campos generados por el servidor, más `createdBy`. */
type CreatePayload = Omit<Announcement, 'id' | 'createdAt' | 'isActive'> & { createdBy: number };
/** Payload de actualización: `id` obligatorio y el resto de campos parciales. */
type UpdatePayload = Partial<Announcement> & { id: string };

/**
 * Mutación para crear un anuncio.
 *
 * @remarks
 * En `onSettled` invalida las cachés `['announcements']` y `['announcements_all']`
 * para refrescar tanto las vistas in-app como el panel de admin.
 *
 * @returns El objeto de mutación de React Query.
 */
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

/**
 * Mutación para actualizar un anuncio.
 *
 * @remarks
 * En `onSettled` invalida las cachés de anuncios in-app y de admin.
 *
 * @returns El objeto de mutación de React Query.
 */
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

/**
 * Mutación para eliminar un anuncio.
 *
 * @remarks
 * En `onSettled` invalida las cachés de anuncios in-app y de admin.
 *
 * @returns El objeto de mutación de React Query.
 */
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

/** Clave de `localStorage` para los anuncios descartados. */
const DISMISSED_KEY = 'prisma_dismissed_announcements';
/** Clave de `localStorage` para los anuncios confirmados. */
const CONFIRMED_KEY = 'prisma_confirmed_announcements';

/**
 * Lee una lista de IDs desde `localStorage`.
 *
 * @param key - Clave de almacenamiento.
 * @returns La lista de IDs, o `[]` si no existe o el parseo falla.
 */
function readLS(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); }
  catch { return []; }
}

/**
 * Escribe una lista de IDs en `localStorage`.
 *
 * @param key - Clave de almacenamiento.
 * @param ids - Lista de IDs a guardar.
 */
function writeLS(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids));
}

/** Devuelve los IDs de anuncios descartados por el usuario. */
export const getDismissed        = () => readLS(DISMISSED_KEY);
/** Devuelve los IDs de anuncios confirmados por el usuario. */
export const getConfirmed        = () => readLS(CONFIRMED_KEY);

/**
 * Marca un anuncio como descartado (persistido en `localStorage`).
 *
 * @param id - ID del anuncio a descartar. No duplica si ya estaba.
 */
export const dismissAnnouncement = (id: string) => {
  const list = readLS(DISMISSED_KEY);
  if (!list.includes(id)) writeLS(DISMISSED_KEY, [...list, id]);
};

/**
 * Marca un anuncio como confirmado (persistido en `localStorage`).
 *
 * @param id - ID del anuncio a confirmar. No duplica si ya estaba.
 */
export const confirmAnnouncement = (id: string) => {
  const list = readLS(CONFIRMED_KEY);
  if (!list.includes(id)) writeLS(CONFIRMED_KEY, [...list, id]);
};