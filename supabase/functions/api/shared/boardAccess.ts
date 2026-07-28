// shared/boardAccess.ts
//
// Fuente de verdad de VISIBILIDAD de boards (kanbans) por usuario.
//
//   Admin            → null = "todos, sin filtro"
//   Cualquier member → boards de su departamento (excl. admin-only)
//                      + boards otorgados por grant explícito (cross-depto)
//
// Un board sin Department_ID no pertenece a ningún departamento → ningún
// member lo ve por la regla de depto (solo admin, o por grant explícito).
// Un board con Is_Admin_Only se excluye de la regla de depto, pero SÍ se
// respeta si viene por grant (otorgarlo es una decisión deliberada del admin).
//
// Retorno: null = sin restricción (no filtrar) · [] = restringido a nada.

import type { DB } from '../lib/supabase.ts';

const TI_DEPARTMENT_ID = 7;

export type VisibleBoardIds = number[] | null; // null = sin restricción

export async function resolveVisibleBoardIds(
  supabase: DB,
  userId: number,
): Promise<VisibleBoardIds> {
  // ── Usuario ──
  const { data: user, error: userErr } = await supabase
    .from('TBL_Users')
    .select('User_Role, Department_ID')
    .eq('User_ID', userId)
    .single();
  if (userErr) throw new Error(`[boardAccess] ${userErr.message}`);
  if (!user) throw new Error(`[boardAccess] USER_NOT_FOUND: ${userId}`);

  const isTI    = user.Department_ID === TI_DEPARTMENT_ID;
  const isAdmin = user.User_Role === 'admin';

  // ── Admin TI → todo, sin filtro ──
  if (isAdmin && isTI) return null;

  // ── Boards del departamento del usuario (excl. admin-only) ──
  const deptBoardIds: number[] = [];
  if (user.Department_ID !== null) {
    const { data: deptBoards, error: deptErr } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID')
      .eq('Department_ID', user.Department_ID)
      .neq('Board_Team_Is_Admin_Only', true);
    if (deptErr) throw new Error(`[boardAccess] ${deptErr.message}`);
    for (const b of (deptBoards ?? []) as { Board_Team_ID: number }[]) {
      deptBoardIds.push(b.Board_Team_ID);
    }
  }

  // ── Grants explícitos (acceso extra, cross-departamento) ──
  const { data: grants, error: grantsErr } = await supabase
    .from('TBL_Board_Team_Access')
    .select('Board_Team_ID')
    .eq('User_ID', userId);
  if (grantsErr) throw new Error(`[boardAccess] ${grantsErr.message}`);
  const grantIds = (grants ?? []).map((g: { Board_Team_ID: number }) => g.Board_Team_ID);

  // ── Unión: depto + grants, sin duplicados ──
  const union = new Set<number>([...deptBoardIds, ...grantIds]);
  return [...union];
}