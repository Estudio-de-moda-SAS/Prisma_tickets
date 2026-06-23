import type { ActionHandler } from '../shared/types.ts';
import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { mapAnnouncement } from '../shared/mappers.ts';

/** Usada por el bypass público del index (login). Exportada aparte del map. */
export async function getPublicAnnouncements(supabase: DB): Promise<unknown> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('TBL_Announcements')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .contains('show_in', ['login'])
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapAnnouncement);
}

export const announcementHandlers: Record<string, ActionHandler> = {
  get_announcements: async (payload, { supabase }) => {
    const { surface, userRole, userDeptId, userTeamId } = payload as {
      surface?: string; userRole?: string;
      userDeptId?: number | null; userTeamId?: number | null;
    };
    const now = new Date().toISOString();
    let query = supabase
      .from('TBL_Announcements')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('created_at', { ascending: false });
    if (surface) query = query.contains('show_in', [surface]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const filtered = ((data ?? []) as Record<string, unknown>[]).filter((a) => {
      const target = a['target_role'] as string | null;
      if (!target) return true;
      if (target === 'admin') return userRole === 'admin';
      const parts    = target.split(',');
      const teamPart = parts.find((p: string) => p.startsWith('team:'));
      const deptPart = parts.find((p: string) => p.startsWith('dept:'));
      if (teamPart) return parseInt(teamPart.slice(5)) === userTeamId;
      if (deptPart) return parseInt(deptPart.slice(5)) === userDeptId;
      return target === userRole;
    });

    return filtered.map(mapAnnouncement);
  },

  get_all_announcements: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(mapAnnouncement);
  },

  create_announcement: async (payload, { supabase }) => {
    const p = payload as {
      title: string; body?: string | null; type: string;
      showIn: string[]; targetRole?: string | null;
      startsAt?: string; endsAt?: string | null; createdBy: number;
    };
    const { data, error } = await supabase
      .from('TBL_Announcements')
      .insert({
        title:       p.title,
        body:        p.body ?? null,
        type:        p.type,
        show_in:     p.showIn,
        target_role: p.targetRole ?? null,
        is_active:   true,
        starts_at:   p.startsAt ?? new Date().toISOString(),
        ends_at:     p.endsAt ?? null,
        created_by:  p.createdBy,
        created_at:  new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return mapAnnouncement(data as Record<string, unknown>);
  },

  update_announcement: async (payload, { supabase }) => {
    const { id, ...u } = payload as {
      id: string; title?: string; body?: string | null; type?: string;
      showIn?: string[]; targetRole?: string | null;
      isActive?: boolean; startsAt?: string; endsAt?: string | null;
    };
    const patch: Record<string, unknown> = {};
    if (u.title      !== undefined) patch['title']       = u.title;
    if (u.body       !== undefined) patch['body']        = u.body;
    if (u.type       !== undefined) patch['type']        = u.type;
    if (u.showIn     !== undefined) patch['show_in']     = u.showIn;
    if (u.targetRole !== undefined) patch['target_role'] = u.targetRole;
    if (u.isActive   !== undefined) patch['is_active']   = u.isActive;
    if (u.startsAt   !== undefined) patch['starts_at']   = u.startsAt;
    if (u.endsAt     !== undefined) patch['ends_at']     = u.endsAt;
    const { data, error } = await supabase
      .from('TBL_Announcements')
      .update(patch)
      .eq('announcement_id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return mapAnnouncement(data as Record<string, unknown>);
  },

  delete_announcement: async (payload, { supabase }) => {
    const { id } = payload as { id: string };
    const { error } = await supabase
      .from('TBL_Announcements')
      .delete()
      .eq('announcement_id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },
};
