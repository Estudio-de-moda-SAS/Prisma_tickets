// src/utils/roles.ts
import type { GraphRest } from "../graph/GraphRest";
import type { UsuariosSPService } from "../services/Usuarios.service";

/* =========================
   Tipos
   ========================= */
export type RoleDecision = | { role: string; source: "group"; matchedGroupId: string } | { role: string; source: "sp" } | { role: string; source: "default" };
export type GroupRule = { groupId: string; role: string };

/* =========================
   Cache simple (memoria)
   ========================= */
type CacheEntry<T> = { value: T; expiresAt: number };
const TTL_MS = 5 * 60 * 1000;

const uidCache = new Map<string, CacheEntry<string | null>>();     // email -> userId
const membCache = new Map<string, CacheEntry<boolean>>();          // `${userId}|${groupId}` -> bool

const now = () => Date.now();
function getFromCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expiresAt < now()) { map.delete(key); return null; }
  return hit.value;
}
function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
  map.set(key, { value, expiresAt: now() + TTL_MS });
}

/* =========================
   Helpers Graph
   ========================= */
async function getUserIdByEmail(graph: GraphRest, email: string): Promise<string | null> {
  const safe = String(email).trim().toLowerCase();
  if (!safe) return null;

  const k = safe;
  const cached = getFromCache(uidCache, k);
  if (cached !== null) return cached;

  // 1) /users/{upn|mail}
  try {
    const user = await graph.get<{ id?: string }>(
      `/users/${encodeURIComponent(safe)}?$select=id`
    );
    if (user?.id) { setCache(uidCache, k, user.id); return user.id; }
  } catch { /* continúa */ }

  // 2) búsqueda por mail|UPN
  try {
    const esc = safe.replace(/'/g, "''");
    const filter = `mail eq '${esc}' or userPrincipalName eq '${esc}'`;
    const resp = await graph.get<{ value?: Array<{ id?: string }> }>(
      `/users?$select=id&$top=1&$filter=${encodeURIComponent(filter)}`
    );
    const id = resp?.value?.[0]?.id ?? null;
    setCache(uidCache, k, id);
    return id;
  } catch {
    setCache(uidCache, k, null);

    return null;
  }
}

/* =========================
   1) Obtener rol desde UN grupo
   ========================= */
export async function getRoleFromGroup(graph: GraphRest, email: string, groupId: string, roleIfMember: string): Promise<RoleDecision | null> {
  const safeGroup = String(groupId).trim();
  const safeEmail = String(email).trim().toLowerCase();
  if (!safeGroup || !safeEmail) return null;

  const userId = await getUserIdByEmail(graph, safeEmail);
  if (!userId) return null;

  // cache por par userId|groupId
  const ck = `${userId}|${safeGroup}`;
  const cached = getFromCache(membCache, ck);
  if (cached !== null) {
    return cached ? { role: roleIfMember, source: "group", matchedGroupId: safeGroup } : null;
  }

  try {
    const data = await graph.post<{ value: string[] }>(
      `/users/${encodeURIComponent(userId)}/checkMemberGroups`,
      { groupIds: [safeGroup] }
    );
    const isMember = Array.isArray(data?.value) && data.value.includes(safeGroup);
    setCache(membCache, ck, isMember);
    return isMember ? { role: roleIfMember, source: "group", matchedGroupId: safeGroup } : null;
  } catch {
    setCache(membCache, ck, false);
    return null;
  }
}

const groupMembersCache = new Map<string, string[]>();

async function getGroupMemberIds(graph: GraphRest, groupId: string): Promise<string[]> {
  const cached = groupMembersCache.get(groupId);
  if (cached) return cached;

  const memberIds: string[] = [];
  let url = `/groups/${encodeURIComponent(groupId)}/members?$select=id`;

  while (url) {
    const resp = await graph.get<{ value: { id: string }[]; "@odata.nextLink"?: string }>(url);
    const items = resp.value ?? [];
    memberIds.push(...items.map(m => m.id));

    // si tu GraphRest ya te devuelve solo `value` sin nextLink, puedes simplificar
    url = (resp as any)["@odata.nextLink"] ?? "";
  }

  groupMembersCache.set(groupId, memberIds);
  return memberIds;
}


export async function getRoleFromGroups(
  graph: GraphRest,
  email: string,
  rules: GroupRule[]
): Promise<RoleDecision | null> {
  const safeEmail = String(email).trim().toLowerCase();
  if (!safeEmail || !rules.length) return null;

  const userId = await getUserIdByEmail(graph, safeEmail);
  if (!userId) return null;

  // 1) sacar todos los groupIds de las reglas
  const groupIds = rules.map(r => r.groupId);

  // 2) cargar miembros de todos los grupos (en paralelo)
  const membersByGroupEntries = await Promise.all(
    groupIds.map(async gid => {
      const members = await getGroupMemberIds(graph, gid); 
      console.table(members)
      return [gid, members] as const;
    })
  );

  const membersByGroup = Object.fromEntries(membersByGroupEntries) as Record<string, string[]>;

  // 3) buscar la primera regla cuyo grupo contenga al userId
  const matchedRule = rules.find(r => {
    const members = membersByGroup[r.groupId] ?? [];
    return members.includes(userId);
  });

  if (!matchedRule) {return null};

  return {
    role: matchedRule.role,
    source: "group",
    matchedGroupId: matchedRule.groupId,
  };
}

/* =========================
   2) Obtener rol desde SharePoint
   ========================= */
export async function getRoleFromSP(usuariosSvc: UsuariosSPService, email: string): Promise<RoleDecision | null> {
  const safe = String(email).trim().toLowerCase();
  if (!safe) return null;

  const resp = await usuariosSvc.getAll({
    filter: `fields/Correo eq '${safe.replace(/'/g, "''")}'`,
    top: 1,
  });

  const items = Array.isArray(resp) ? resp : resp?.items ?? [];
  const rolSP =
    items?.[0]?.fields?.Rol ??
    items?.[0]?.Rol ??
    undefined;

  if (rolSP && String(rolSP).trim()) {
    return { role: String(rolSP).trim(), source: "sp" };
  }
  return null;
}

/* =========================
   3) Resolver combinado (prioriza grupos → luego SP → default)
   ========================= */
export async function resolveUserRole({graph, usuariosSvc, email, groupRules = [], singleGroup, defaultRole = "Usuario",}: {
  graph: GraphRest;
  usuariosSvc: UsuariosSPService;
  email: string | null | undefined;
  groupRules?: GroupRule[];
  singleGroup?: { groupId: string; role: string }; // comodidad cuando es un solo grupo
  defaultRole?: string;
}): Promise<RoleDecision> {
  const safeEmail = String(email ?? "").trim().toLowerCase();
  if (!safeEmail) return { role: defaultRole, source: "default" };

  // 1) Grupos (si hay graph)
  if (graph) {
    if (singleGroup?.groupId) {
      const byOne = await getRoleFromGroup(graph, safeEmail, singleGroup.groupId, singleGroup.role);
      if (byOne) return byOne;
    } else if (groupRules.length) {
      const byMany = await getRoleFromGroups(graph, safeEmail, groupRules);
      if (byMany) return byMany;
    }
  }

  // 2) Lista SP
  try {
    const bySp = await getRoleFromSP(usuariosSvc, safeEmail);
    if (bySp) return bySp;
  } catch { /* si SP falla, sigue default */ }

  // 3) Default
  return { role: defaultRole, source: "default" };
}
