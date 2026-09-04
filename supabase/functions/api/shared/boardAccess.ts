// shared/boardAccess.ts

/**
 * Fuente de verdad de la VISIBILIDAD de boards (kanbans) por usuario.
 *
 * Reglas:
 * - Admin de TI → `null` = "todos, sin filtro".
 * - Cualquier member → boards de su departamento (excluyendo los admin-only)
 *   más los boards otorgados por grant explícito (cross-departamento).
 *
 * @remarks
 * - Un board sin `Department_ID` no pertenece a ningún departamento, así que
 *   ningún member lo ve por la regla de depto (solo admin, o por grant explícito).
 * - Un board con `Is_Admin_Only` se excluye de la regla de depto, pero SÍ se
 *   respeta si llega por grant: otorgarlo es una decisión deliberada del admin.
 *
 * Convención de retorno: `null` = sin restricción (no filtrar); `[]` = restringido
 * a nada (no ve ningún board).
 *
 * @module boardAccess
 */

import type { DB } from '../lib/supabase.ts';

/** ID del departamento de TI, cuyo admin obtiene visibilidad total. */
const TI_DEPARTMENT_ID = 7;

/**
 * IDs de boards visibles para un usuario.
 *
 * @remarks
 * `null` significa "sin restricción" (no aplicar filtro); un arreglo enumera los
 * boards permitidos (`[]` = ninguno).
 */
export type VisibleBoardIds = number[] | null; // null = sin restricción

/**
 * Resuelve qué boards puede ver un usuario.
 *
 * @remarks
 * Flujo:
 * 1. Lee rol y departamento del usuario.
 * 2. Si es admin de TI, devuelve `null` (ve todo).
 * 3. Reúne los boards de su departamento excluyendo los admin-only.
 * 4. Añade los grants explícitos (acceso extra, incluso cross-departamento).
 * 5. Devuelve la unión sin duplicados.
 *
 * @param supabase - Cliente de Supabase.
 * @param userId - ID del usuario cuya visibilidad se resuelve.
 * @returns {@link VisibleBoardIds}: `null` si no hay restricción, o la lista de
 *   IDs de boards visibles (posiblemente vacía).
 * @throws Si el usuario no existe (`USER_NOT_FOUND`) o si alguna consulta falla.
 */
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