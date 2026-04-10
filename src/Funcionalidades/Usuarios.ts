import * as React from "react";
import { useGraphServices } from "../graph/GrapServicesContext";
import type { FormNewUserErrors, UsuariosSP } from "../Models/Usuarios";
import type { UserOption } from "../Models/Commons";
import type { UsuariosSPService } from "../services/Usuarios.service";
import { resolveUserRole, type GroupRule } from "../utils/roles";

type UseRoleOpts = { singleGroup: { groupId: string; role: string }; groupRules?: never } | { groupRules: GroupRule[]; singleGroup?: never } | { singleGroup?: never; groupRules?: never };

type RoleDecision = { role: string; source: "default" | "usuarios" | "group" | "manual-toggle" | string };

export function useUserRole(email?: string | null) {
  const opts: UseRoleOpts = {
    groupRules: [{ groupId: "ca8b6719-431a-498a-ba9f-2c58242b1403", role: "Jefe de zona" }, { groupId: "937d53c8-536f-4d7c-9047-122480da727c", role: "Tecnico" }],
  };

  const { Usuarios, graph } = useGraphServices() 
  const defaultRole = "Usuario";

  const [role, setRole] = React.useState<string>(defaultRole);
  const [source, setSource] = React.useState<RoleDecision["source"]>("default");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      const safeEmail = String(email ?? "").trim().toLowerCase();
      if (!safeEmail) { if (!cancel) { setRole(defaultRole); setSource("default"); } return; }

      setLoading(true); setError(null);
      try {
        const decision = await resolveUserRole({
          graph: graph,
          usuariosSvc: Usuarios,
          email: safeEmail,
          defaultRole,
          groupRules: opts.groupRules,
        });
        if (!cancel) { setRole(decision.role); setSource(decision.source); }
      } catch (e: any) {
        if (!cancel) { setRole(defaultRole); setSource("default"); setError(e?.message ?? "No fue posible determinar el rol"); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [email, Usuarios, graph, defaultRole, JSON.stringify(opts)]);

  /** Alterna entre "Usuario" y "Administrador" sin I/O */
  const changeUser = React.useCallback(() => {
    setRole(prev => (prev === "Administrador" ? "Usuario" : "Administrador"));
    setSource("manual-toggle");
    setLoading(false);
    setError(null);
  }, []);

  return { role, source, loading, error, changeUser };
}

export function useIsAdmin(email?: string | null) {
  const { Usuarios } = useGraphServices(); // tu service
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancel = false;

    (async () => {
      if (!email) { setIsAdmin(false); return; }

      try {
        setLoading(true); setError(null);

        const safe = String(email).toLowerCase().replace(/'/g, "''");
        const resp = await Usuarios.getAll({
          filter: `fields/Correo eq '${safe}'`,  
          top: 1,
        });

        const items = Array.isArray(resp) ? resp : resp?.items ?? [];
        const rolRaw =
          items?.[0]?.fields?.Rol ??
          items?.[0]?.Rol ??
          "";

        const rol = String(rolRaw).trim().toLowerCase();
        const admin =
          rol === "administrador";

        if (!cancel) setIsAdmin(admin);
      } catch (e: any) {
        if (!cancel) { setIsAdmin(false); setError(e?.message ?? "Error leyendo rol"); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [email, Usuarios]);

  return { isAdmin, loading, error };
}

export function useUsuarios(usuariosSvc: UsuariosSPService) {
  const [usuarios, setUsuarios] = React.useState<UsuariosSP[]>([]);
  const [tecnicos, setTecnicos] = React.useState<UsuariosSP[]>([]);
  const [administradores, setAdmins] = React.useState<UsuariosSP[]>([]);
  const [UseruserOptions, setUserOptions] = React.useState<UserOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<UsuariosSP>({
    Correo: "",
    Rol: "",
    Title: "",
    Disponible: ""
  })
  const [errors, setErrors] = React.useState<FormNewUserErrors>({})
  const [submitting, setSubmitting] = React.useState<Boolean>(false)

  // paginación
  const [pageSize, setPageSize] = React.useState<number>(10);
  const [pageIndex, setPageIndex] = React.useState<number>(1);
  const [nextLink, setNextLink] = React.useState<string | null>(null);

  const setField = <K extends keyof UsuariosSP>(k: K, v: UsuariosSP[K]) => setState((s) => ({ ...s, [k]: v }));
  

  const mapRowToUsuario = React.useCallback((row: any): UsuariosSP => {
    // Si el service ya aplanó, usa el nivel raíz; si no, lee de fields
    const f = row?.fields ?? row ?? {};
    return {
      Id: String(row?.id ?? f.ID ?? f.Id ?? ""),
      Title: String(f.Title ?? ""),
      Correo: String(f.Correo ?? f.Email ?? "").trim(),
      Rol: String(f.Rol ?? ""),
    } as UsuariosSP;
  }, []);

  const mapUsuariosToOptions = React.useCallback((list: UsuariosSP[]): UserOption[] => {
    return (list ?? [])
      .map((u) => {
        const nombre = String((u as any).Title ?? "—").trim();
        const correo = String((u as any).Correo ?? "").trim();
        const id     = String((u as any).Id ?? "");
        const rol    = String((u as UsuariosSP).Rol)

        // label como "Nombre - correo" (si hay correo)
        const label  = nombre;

        return {
          value: correo || id,   // usa correo como clave estable; fallback id
          label,
          id,
          jobTitle: rol,
          email: correo || undefined,
        } as UserOption;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  // --- loader principal ---
  const loadUsuarios = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    let cancelled = false;
    try {
      // si luego quieres paginar en server: const res = await usuariosSvc.getAll({ top: pageSize });
      const res = await usuariosSvc.getAll();

      // Soporta array o { items, nextLink }
      const itemsRaw: any[] = Array.isArray(res) ? res : (res?.items ?? []);
      const nLink: string | null = Array.isArray(res) ? null : (res?.nextLink ?? null);

      const items = itemsRaw.map(mapRowToUsuario);
      if (cancelled) return;

      setUsuarios(items);
      setUserOptions(mapUsuariosToOptions(items));
      setNextLink(nLink);
      setPageIndex(1);
    } catch (e: any) {
      if (!cancelled) {
        setError(e?.message ?? "Error cargando usuarios");
        setUsuarios([]);
        setUserOptions([]);
        setNextLink(null);
        setPageIndex(1);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => { cancelled = true; };
  }, [usuariosSvc, /* pageSize, */ mapRowToUsuario, mapUsuariosToOptions]);

  const loadTecnicos = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    let cancelled = false;
    try {
      const res = await usuariosSvc.getAll({filter: `fields/Rol eq 'Tecnico'`});
      if (cancelled) return;

      setTecnicos(res.items);
    } catch (e: any) {
      if (!cancelled) {
        setError(e?.message ?? "Error cargando usuarios");
        setUsuarios([]);
        setUserOptions([]);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => { cancelled = true; };
  }, [usuariosSvc]);

  const loadAdmins = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    let cancelled = false;
    try {
      const res = await usuariosSvc.getAll({filter: `fields/Rol eq 'Administrador'`});
      if (cancelled) return;

      setAdmins(res.items);
    } catch (e: any) {
      if (!cancelled) {
        setError(e?.message ?? "Error cargando usuarios");
        setAdmins([]);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => { cancelled = true; };
  }, [usuariosSvc]);

  const deleteUser = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    let cancelled = false;
    try {
      const res = await usuariosSvc.delete(id);
      if (cancelled) return;

      console.log(res)
    } catch (e: any) {
      if (!cancelled) {
        setError(e?.message ?? "Error eliminado usuarios");
      }
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => { cancelled = true; };
  }, [usuariosSvc]);

  const validate = () => {
    const e: FormNewUserErrors = {};
    if (!state.Title.trim()) e.Title = "Ingresa el nombre completo.";
    if (!state.Correo.trim()) e.Correo = "Ingresa el correo.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.Correo)) e.Correo = "Correo inválido.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const addUser = React.useCallback(async () => {
    if(!validate()) return
    setSubmitting(true);
    setError(null);

    let cancelled = false;
    try {
      const res = await usuariosSvc.create(state);
      if (cancelled) return;

      console.log(res)
    } catch (e: any) {
      if (!cancelled) {
        setError(e?.message ?? "Error eliminado usuarios");
      }
    } finally {
      if (!cancelled) setSubmitting(false);
    }

    return () => { cancelled = true; };
  }, [usuariosSvc, state]);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      if (cancel) return;
      await loadUsuarios();
      await loadTecnicos();
      await loadAdmins();
    })();
    return () => { cancel = true; };
  }, [loadUsuarios, loadTecnicos, loadAdmins]);

  const refreshUsuers = React.useCallback(async () => {
    await loadUsuarios();
  }, [loadUsuarios]);

  const hasNext = !!nextLink;

  return {
    usuarios, UseruserOptions, loading, error, pageSize, pageIndex, hasNext, nextLink, tecnicos, administradores, state,errors, submitting,
    refreshUsuers, deleteUser, setPageSize, setField, addUser 
  };
}
