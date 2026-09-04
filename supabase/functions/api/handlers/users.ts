import type { ActionHandler } from '../shared/types.ts';

/**
 * Manejadores de acciones sobre usuarios.
 *
 * Cada entrada de {@link userHandlers} es un {@link ActionHandler}: recibe un
 * `payload` con los datos de la petición y un contexto de ejecución con el
 * cliente de Supabase (`{ supabase }`), y resuelve una operación puntual sobre
 * las tablas de usuarios (`TBL_Users`, `TBL_User_Identities`,
 * `TBL_Sub_Team_Members`) y sus relaciones (`TBL_Departments`, `TBL_Teams`).
 *
 * Todos los handlers convierten los errores de Supabase en `Error` para que la
 * capa superior los propague de forma uniforme.
 *
 * @module userHandlers
 */
export const userHandlers: Record<string, ActionHandler> = {
  /**
   * Busca un usuario por su identificador de Entra ID (Azure AD).
   *
   * @remarks
   * Devuelve solo los campos básicos de identidad y rol. La consulta ordena por
   * `User_ID` y limita a un registro para obtener un resultado determinista
   * aunque existieran duplicados con el mismo Entra ID.
   *
   * @param payload - Objeto con el `entraId` a buscar.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns Datos básicos del usuario: `User_ID`, `User_Name`, `User_Email`, `User_Role`.
   * @throws Si la consulta falla, o si no existe ningún usuario con ese Entra ID
   *   (mensaje `USER_NOT_FOUND: <entraId>`).
   */
  fetchUserByEntraId: async (payload, { supabase }) => {
    const { entraId } = payload as { entraId: string };
    const { data, error } = await supabase
      .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Role')
      .eq('User_EntraID', entraId)
      .order('User_ID', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`USER_NOT_FOUND: ${entraId}`);
    return data;
  },

  /**
   * Obtiene todos los usuarios con su departamento y equipo asociados.
   *
   * @remarks
   * Incluye los campos de estado (`Is_New`, `Is_Active`) y expande las
   * relaciones `department` (`TBL_Departments`) y `team` (`TBL_Teams`). El
   * resultado viene ordenado alfabéticamente por `User_Name`.
   *
   * @param _payload - No se usa; este handler no recibe parámetros.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns Lista de usuarios con sus relaciones de departamento y equipo.
   * @throws Si la consulta falla.
   */
  fetchAllUsers: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Users')
      .select(`
        User_ID, User_Name, User_Email, User_Avatar_url, User_Role,
        Department_ID, Team_ID, Is_New, "Is_Active",
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .order('User_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Crea o actualiza un usuario a partir de su Entra ID y devuelve el registro completo.
   *
   * @remarks
   * Delega la resolución de identidad en la RPC `upsert_user_by_entra_id`, que
   * devuelve el `User_ID` (creando el usuario si no existía). Con ese id se
   * vuelve a leer el usuario ya expandido con departamento y equipo. Es la vía
   * usada en el primer login para sincronizar la cuenta de Azure AD.
   *
   * @param payload - Objeto con `entraId`, `name` y `email`. `name` y `email`
   *   se envían vacíos a la RPC si vienen `null`/`undefined`.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns El usuario resultante con sus relaciones de departamento y equipo.
   * @throws Si la RPC falla, si no se resuelve un `User_ID`, o si la lectura
   *   posterior del usuario falla.
   */
  upsertUserByEntraId: async (payload, { supabase }) => {
    const p = payload as { entraId: string; name: string; email: string };

    const { data: userId, error: rpcErr } = await supabase.rpc('upsert_user_by_entra_id', {
      p_entra_id: p.entraId,
      p_name:     p.name  ?? '',
      p_email:    p.email ?? '',
    });
    if (rpcErr) throw new Error(`[upsertUserByEntraId] ${rpcErr.message}`);
    if (!userId) throw new Error('[upsertUserByEntraId] no se resolvió User_ID');

    const { data, error } = await supabase
      .from('TBL_Users')
      .select(`
        User_ID, User_Name, User_Email, User_Avatar_url, User_Role,
        Department_ID, Team_ID, Is_New, "Is_Active",
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .eq('User_ID', userId)
      .single();
    if (error) throw new Error(`[upsertUserByEntraId] ${error.message}`);
    return data;
  },

  /**
   * Obtiene los miembros únicos pertenecientes a un conjunto de subequipos.
   *
   * @remarks
   * Consulta `TBL_Sub_Team_Members` y expande el usuario relacionado. Como un
   * mismo usuario puede pertenecer a varios subequipos, se deduplica por
   * `User_ID` con un `Set` para no repetirlo en la respuesta.
   *
   * @param payload - Objeto con `subTeamIds`, la lista de IDs de subequipo.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns Lista de usuarios únicos (identidad y rol básicos). Devuelve `[]`
   *   si `subTeamIds` viene vacío o ausente.
   * @throws Si la consulta falla.
   */
  fetchMembersBySubTeams: async (payload, { supabase }) => {
    const { subTeamIds } = payload as { subTeamIds: number[] };
    if (!subTeamIds?.length) return [];

    const { data, error } = await supabase
      .from('TBL_Sub_Team_Members')
      .select(`user:TBL_Users!Sub_Team_Member_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url, User_Role )`)
      .in('Sub_Team_Member_Sub_Team_ID', subTeamIds);

    if (error) throw new Error(error.message);

    const seen = new Set<number>();
    return (data as { user: Record<string, unknown> }[])
      .map((r) => r.user)
      .filter((u) => u && !seen.has(u['User_ID'] as number) && seen.add(u['User_ID'] as number));
  },

  /**
   * Pre-registra un usuario por correo antes de su primer inicio de sesión.
   *
   * @remarks
   * Normaliza el correo (minúsculas y sin espacios) y valida que no exista ya
   * uno igual. Inserta el usuario con `User_EntraID`, `User_Name` y
   * `User_Avatar_url` vacíos (se completan en el primer login) y crea además su
   * identidad primaria en `TBL_User_Identities`; sin ella la RPC de upsert no
   * podría resolver al usuario por identidad.
   *
   * @param payload - Objeto con `email`, `role` (`'admin' | 'member'`),
   *   `departmentId`, `teamId` e `isNew`.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns El usuario pre-registrado con sus relaciones de departamento y equipo.
   * @throws Si ya existe un usuario con ese correo, o si el `insert` falla.
   */
  preRegisterUser: async (payload, { supabase }) => {
    const p = payload as {
      email:        string;
      role:         'admin' | 'member';
      departmentId: number | null;
      teamId:       number | null;
      isNew:        boolean;
    };

    const normalizedEmail = p.email.toLowerCase().trim();

    const { data: existing } = await supabase
      .from('TBL_Users')
      .select('User_ID, User_Email')
      .ilike('User_Email', normalizedEmail)
      .maybeSingle();

    if (existing) throw new Error(`Ya existe un usuario con el correo ${normalizedEmail}`);

    const { data, error } = await supabase
      .from('TBL_Users')
      .insert({
        User_EntraID:    '',
        User_Name:       '',
        User_Email:      normalizedEmail,
        User_Avatar_url: '',
        User_Role:       p.role,
        Department_ID:   p.departmentId,
        Team_ID:         p.teamId,
        Is_New:          p.isNew,
        User_Created_At: new Date().toISOString(),
      })
      .select(`
        User_ID, User_Name, User_Email, User_Role,
        Department_ID, Team_ID, Is_New,
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .single();
    if (error) throw new Error(error.message);

    // Identidad primaria del pre-registro: sin EntraID todavía, se completa
    // en el primer login. Sin esto la RPC no puede resolverlo por identidad.
    await supabase.from('TBL_User_Identities').insert({
      Identity_User_ID:    (data as any).User_ID,
      Identity_Email:      normalizedEmail,
      Identity_Is_Primary: true,
    });

    return data;
  },

  /**
   * Completa el onboarding de un usuario asignándole departamento y equipo.
   *
   * @remarks
   * Marca `Is_New` en `false` para indicar que el usuario ya terminó el flujo
   * inicial.
   *
   * @param payload - Objeto con `userId`, `departmentId` y `teamId`
   *   (`teamId` puede ser `null`).
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns El usuario actualizado, incluyendo el código y nombre de su equipo.
   * @throws Si la actualización falla.
   */
  completeOnboarding: async (payload, { supabase }) => {
    const p = payload as { userId: number; departmentId: number; teamId: number | null };
    const { data, error } = await supabase
      .from('TBL_Users')
      .update({ Department_ID: p.departmentId, Team_ID: p.teamId, Is_New: false })
      .eq('User_ID', p.userId)
      .select(`User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New,
               team:TBL_Teams!Team_ID ( Team_Code, Team_Name )`)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Actualiza rol, departamento, equipo y estado `Is_New` de un usuario.
   *
   * @remarks
   * Regla de negocio: si el usuario cambia de departamento y el nuevo no es
   * `null`, su rol se fuerza a `'member'` sin importar el `role` recibido. Esto
   * evita arrastrar permisos de administrador al mover a alguien a otro
   * departamento.
   *
   * @param payload - Objeto con `userId`, `role` (`'admin' | 'member'`),
   *   `departmentId`, `teamId` e `isNew`.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns El usuario actualizado con sus relaciones de departamento y equipo.
   * @throws Si la actualización falla.
   */
  updateUser: async (payload, { supabase }) => {
    const p = payload as {
      userId: number; role: 'admin' | 'member';
      departmentId: number | null; teamId: number | null; isNew: boolean;
    };

    const { data: current } = await supabase
      .from('TBL_Users')
      .select('Department_ID')
      .eq('User_ID', p.userId)
      .single();

    const departmentChanged = current?.Department_ID !== p.departmentId;
    const effectiveRole = (departmentChanged && p.departmentId !== null) ? 'member' : p.role;

    const { data, error } = await supabase
      .from('TBL_Users')
      .update({
        User_Role:     effectiveRole,
        Department_ID: p.departmentId,
        Team_ID:       p.teamId,
        Is_New:        p.isNew,
      })
      .eq('User_ID', p.userId)
      .select(`
        User_ID, User_Name, User_Email, User_Role,
        Department_ID, Team_ID, Is_New,
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Desactiva un usuario (borrado lógico) poniendo `Is_Active` en `false`.
   *
   * @param payload - Objeto con el `userId` a desactivar.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns `{ ok: true }` si la operación se completa.
   * @throws Si la actualización falla.
   */
  deactivateUser: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    const { error } = await supabase
      .from('TBL_Users')
      .update({ "Is_Active": false })
      .eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Reactiva un usuario previamente desactivado poniendo `Is_Active` en `true`.
   *
   * @param payload - Objeto con el `userId` a reactivar.
   * @param context - Contexto de ejecución con el cliente de Supabase.
   * @returns `{ ok: true }` si la operación se completa.
   * @throws Si la actualización falla.
   */
  reactivateUser: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    const { error } = await supabase
      .from('TBL_Users')
      .update({ "Is_Active": true })
      .eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};