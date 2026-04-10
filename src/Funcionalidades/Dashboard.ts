import React from "react";
import type { DailyPoint, Fuente, ResolutorAgg, TopCategoria } from "../Models/Dashboard.ts";
import type { DateRange, GetAllOpts } from "../Models/Commons";
import type { Ticket } from "../Models/Tickets";
import type { TicketsService } from "../services/Tickets.service";
import { norm } from "../utils/Commons.ts";
import { toGraphDateTime, toISODateFlex, } from "../utils/Date.ts";
import { useAuth } from "../Auth/authContext.tsx";

type ConteoMes = { mes: string; total: number }; // 'YYYY-MM'

export function useDetallado(TicketsSvc: TicketsService) {
  const [resolutores, setResolutores] = React.useState<ResolutorAgg[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [totalCasos, setTotalCasos] = React.useState<number>(0);
  const [totalEnCurso, setTotalencurso] = React.useState<number>(0);
  const [totalFueraTiempo, setTotalFueraTiempo] = React.useState<number>(0);
  const [totalFinalizados, setTotalFinalizados] = React.useState<number>(0);
  const [porcentajeCumplimiento, setPorcentajeCumplimiento] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ===== Range: mes en curso =====
  const monthRange = React.useMemo<DateRange>(() => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const toISODate = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };

    return { from: toISODate(start), to: toISODate(end) };
  }, []);

  const [range, setRange] = React.useState<DateRange>(monthRange);
  const [topCategorias, setTopCategorias] = React.useState<TopCategoria[]>([]);
  const [topSolicitante, setopSolicitante] = React.useState<TopCategoria[]>([]);
  const [totalCategorias, setTotalCateogria] = React.useState<TopCategoria[]>([]);
  const [casosPorDia, setCasosPorDia] = React.useState<DailyPoint[]>([]);
  const [Fuentes, setFuentes] = React.useState<Fuente[]>([]);
  const [conteoPorMes, setConteoPorMes] = React.useState<ConteoMes[]>([]);

  const buildFilterTickets = React.useCallback((): GetAllOpts => {
    const filters: string[] = [];

    const fromD = range?.from;
    const toD = range?.to;

    if (fromD && toD && fromD <= toD) {
      filters.push(`fields/FechaApertura ge '${fromD}T00:00:00Z'`);
      filters.push(`fields/FechaApertura le '${toD}T23:59:59Z'`);
    } else {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      filters.push(`fields/FechaApertura ge '${toGraphDateTime(monthStart)}'`);
      filters.push(`fields/FechaApertura le '${toGraphDateTime(monthEnd)}'`);
    }

    return { filter: filters.join(" and ") };
  }, [range.from, range.to]);


  const getEstado = React.useCallback((t: any): string => {
    return (
      t?.Estadodesolicitud ??
      t?.EstadoSolicitud ??
      t?.EstadoDeSolicitud ??
      t?.Estado ??
      t?.fields?.Estadodesolicitud ??
      t?.fields?.EstadoSolicitud ??
      t?.fields?.EstadoDeSolicitud ??
      t?.fields?.Estado ??
      ""
    );
  }, []);

  const classifyEstado = React.useCallback((raw: string) => {
    const st = norm(raw).toLowerCase();

    const isAt = st === "cerrado" || st === "cerrado a tiempo";
    const isLate = st === "fuera de tiempo" || st === "cerrado fuera de tiempo";
    const isProg = st === "en atención" || st === "en atencion";

    return { st, isAt, isLate, isProg };
  }, []);

  const obtenerConteoUltimosMeses = React.useCallback(
    async (months: number): Promise<ConteoMes[]> => {
      setLoading(true);
      setError(null);
      try {
        const baseFilter = buildFilterTickets()?.filter?.trim();

        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

        const filter = [
          baseFilter,
          `fields/FechaApertura ge '${toGraphDateTime(start)}'`,
          `fields/FechaApertura le '${toGraphDateTime(end)}'`,
        ]
          .filter(Boolean)
          .join(" and ");

        const res = await TicketsSvc.getAll({ filter, top: 12000 });
        const list: Ticket[] = Array.isArray(res?.items)
          ? res.items
          : Array.isArray((res as any)?.value)
          ? (res as any).value
          : [];

        const toMonthKey = (v: string | Date) => {
          const d = typeof v === "string" ? new Date(v) : v;
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, "0");
          return `${y}-${m}`;
        };

        const map = new Map<string, number>();
        for (const t of list) {
          const key = toMonthKey((t as any)?.FechaApertura ?? (t as any)?.fields?.FechaApertura ?? now);
          map.set(key, (map.get(key) ?? 0) + 1);
        }

        const out: ConteoMes[] = [];
        const cur = new Date(start);
        while (cur <= end) {
          const key = toMonthKey(cur);
          out.push({ mes: key, total: map.get(key) ?? 0 });
          cur.setUTCMonth(cur.getUTCMonth() + 1, 1);
          cur.setUTCHours(0, 0, 0, 0);
        }

        setConteoPorMes(out);
        return out;
      } catch (e: any) {
        setError(e?.message ?? "Error al obtener conteo por mes");
        setConteoPorMes([]);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [TicketsSvc, buildFilterTickets]
  );

  const buildResolutores = React.useCallback(
    (ticketsIn: Ticket[]): ResolutorAgg[] => {
      const getResolvers = (t: any): Array<{ email: string; name: string }> => {
        const out: Array<{ email: string; name: string }> = [];
        const direct = t?.CorreoResolutor ?? "";
        const nombreResolutor = t?.Nombreresolutor ?? "";

        if (direct) {
          const parts = String(direct).split(/[;,]/).map((s) => s.trim()).filter(Boolean);

          for (const p of parts) {
            const m = p.match(/<?([\w.+-]+@[\w.-]+\.\w+)>?/);
            const email = (m ? m[1] : "").toLowerCase();
            const name = nombreResolutor || p.replace(/<.*?>/, "").trim() || (email ? email.split("@")[0] : "") || "(En blanco)";
            out.push({ email, name });
          }
        }

        if (!out.length) {
          out.push({ email: "", name: nombreResolutor || "(En blanco)" });
        }

        const seen = new Set<string>();
        return out.filter((r) => {
          const k = r.email || r.name.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };

      const byRes = new Map<string, { nombre: string; email: string; total: number; at: number; vencidos: number; enCurso: number }>();

      for (const t of ticketsIn) {
        const estado = getEstado(t as any);
        const cls = classifyEstado(estado);
        console.log(cls)

        for (const r of getResolvers(t as any)) {
          const key = r.email || r.name.toLowerCase();
          
          const rec =
            byRes.get(key) ?? {
              nombre: r.name,
              email: r.email,
              total: 0,
              at: 0,
              vencidos: 0,
              enCurso: 0,
            };

          rec.total++;
          if (cls.isAt) rec.at++;
          if (cls.isLate) rec.vencidos++;
          if (cls.isProg) rec.enCurso++;

          byRes.set(key, rec);
        }
      }

      const retorno = Array.from(byRes.values())
        .map((v) => ({
          correo: v.email,
          nombre: v.nombre,
          total: v.total,
          at: v.at,
          vencidos: v.vencidos,
          enCurso: v.enCurso,
          porcentaje: v.total ? v.at / v.total : 0,
        }))
        .sort((a, b) => b.total - a.total);
      console.log(retorno)

      return retorno
    },
    [getEstado, classifyEstado]
  );

  // =========================
  // Total / métricas
  // =========================
  const obtenerTotal = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { filter } = buildFilterTickets();
      const res = await TicketsSvc.getAll({ filter, top: 12000 });

      const list: Ticket[] = Array.isArray(res?.items)
        ? res.items
        : Array.isArray((res as any)?.value)
        ? (res as any).value
        : [];

      setTickets(list);
      const total = list.length;

      const buckets = { at: 0, late: 0, inprog: 0, otros: 0 };

      for (const t of list as any[]) {
        const cls = classifyEstado(getEstado(t));
        if (cls.isAt) buckets.at++;
        else if (cls.isLate) buckets.late++;
        else if (cls.isProg) buckets.inprog++;
        else buckets.otros++;
      }

      const pct = total ? buckets.at / total : 0;

      const countBy = (key: (t: Ticket) => string) => {
        const m = new Map<string, number>();
        for (const t of list) {
          const k = key(t) || "(En blanco)";
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return Array.from(m, ([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
      };

      const allSolicitantes = countBy((t) => String((t as any)?.Solicitante ?? (t as any)?.fields?.Solicitante ?? "").trim());
      const top5Solicitante = allSolicitantes.slice(0, 5);

      const allCats = countBy((t) => String((t as any)?.SubCategoria ?? (t as any)?.fields?.SubCategoria ?? "").trim());
      const top5 = allCats.slice(0, 5);

      const resols = buildResolutores(list);

      const dayKey = (d: any) => {
        const dd = new Date((d?.FechaApertura ?? d?.fields?.FechaApertura) as string);
        const y = dd.getUTCFullYear();
        const m = String(dd.getUTCMonth() + 1).padStart(2, "0");
        const da = String(dd.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${da}`;
      };

      const mapDay = new Map<string, number>();
      for (const t of list as any[]) mapDay.set(dayKey(t), (mapDay.get(dayKey(t)) ?? 0) + 1);
      const series = Array.from(mapDay, ([fecha, total]) => ({ fecha, total })).sort((a, b) =>
        a.fecha.localeCompare(b.fecha)
      );

      // dispara conteo mensual rolling (no bloquea)
      obtenerConteoUltimosMeses(5);

      setopSolicitante(top5Solicitante);

      setTotalCasos(total);
      setTotalencurso(buckets.inprog);
      setTotalFinalizados(buckets.at);
      setTotalFueraTiempo(buckets.late);
      setPorcentajeCumplimiento(pct);
      setTopCategorias(top5);
      setTotalCateogria(allCats);
      setCasosPorDia(series);
      setResolutores(resols);
    } catch (e: any) {
      setError(e?.message ?? "Error al cargar dashboard");
    } finally {
      setLoading(false);
    }
  }, [TicketsSvc, buildFilterTickets, buildResolutores, classifyEstado, getEstado, obtenerConteoUltimosMeses]);

  // =========================
  // Fuentes
  // =========================
  const obtenerFuentes = React.useCallback(async (): Promise<Fuente[]> => {
    setLoading(true);
    setError(null);
    try {
      if (!tickets.length) {
        setFuentes([]);
        return [];
      }

      const counts = new Map<string, number>();
      for (const t of tickets as any[]) {
        const key = String(t?.Fuente ?? t?.fields?.Fuente ?? "(En blanco)").trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const data: Fuente[] = Array.from(counts, ([label, total]) => ({ label, total })).sort(
        (a, b) => b.total - a.total
      );

      setFuentes(data);
      return data;
    } catch (e: any) {
      setError(e?.message ?? "Error al obtener fuentes");
      return [];
    } finally {
      setLoading(false);
    }
  }, [tickets]);

  return {
    obtenerTotal, setRange,  obtenerFuentes, buildResolutores, totalCasos, error, loading, totalEnCurso, totalFinalizados, totalFueraTiempo, porcentajeCumplimiento,
    topCategorias, range, totalCategorias,  resolutores, Fuentes, casosPorDia, topSolicitante, conteoPorMes, obtenerConteoUltimosMeses,
  };
}

export function useDashboard(TicketsSvc: TicketsService) {
  const [resolutores, setResolutores] = React.useState<ResolutorAgg[]>([])
  const [totalCasos, setTotalCasos] = React.useState<number>(0)
  const [totalEnCurso, setTotalencurso] = React.useState<number>(0)
  const [totalFueraTiempo, setTotalFueraTiempo] = React.useState<number>(0)
  const [totalFinalizados, setTotalFinalizados] = React.useState<number>(0)
  const [porcentajeCumplimiento, setPorcentajeCumplimiento] = React.useState<number>(0)
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const today = React.useMemo(() => toISODateFlex(new Date()), []);
  const [range, setRange] = React.useState<DateRange>({ from: today, to: today });
  const [topCategorias, setTopCategorias] = React.useState<TopCategoria[]>([]);
  const [totalCategorias, setTotalCateogria] = React.useState<TopCategoria[]>([]);
  const [topSolicitante, setTop5Solicitante] = React.useState<TopCategoria[]>([]);
  const [casosPorDia, setCasosPorDia] = React.useState<DailyPoint[]>([]);
  const [Fuentes, setFuentes] = React.useState<Fuente[]>([]);
  const [max, setMax] = React.useState<Date | null>(null);
  const [min, setMin] = React.useState<Date | null>(null);

  React.useEffect(() => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    setMax(end)
    setMin(start)
    setRange({from: toISODateFlex(start), to: toISODateFlex(end)})
  }, []);

   
    const { account } = useAuth();

    const buildFilterTickets = React.useCallback((mode: string): GetAllOpts => {
      const filters: string[] = [];

      // Helper: escapa comillas simples por seguridad en OData
      const esc = (s: string) => (s ?? "").replace(/'/g, "''");

      // Helper: construye límites día en Z
      const dayStartIso = (d: string) => `${d}T00:00:00Z`;
      const dayEndIso   = (d: string) => `${d}T23:59:59Z`;

      if (mode === "resumen") {
        const user = esc(account!.username);

        // Solo una condición para el resolutor
        filters.push(`fields/Correoresolutor eq '${user}'`);

        // Mes en curso [1..último día]
       const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        const fromIso = toGraphDateTime(monthStart);
        const toIso   = toGraphDateTime(monthEnd);
        // toGraphDateTime debería devolver ISO con Z (ej. 2025-11-01T00:00:00Z)
        filters.push(`fields/FechaApertura ge '${fromIso}'`);
        filters.push(`fields/FechaApertura le '${toIso}'`);
      }

      // Rango manual (si ambos están y son consistentes)
      if (range.from && range.to && range.from <= range.to) {
        // Evita duplicar el filtro del mes en curso si ya aplicaste "resumen"
        if (mode !== "resumen") {
          filters.push(`fields/FechaApertura ge '${dayStartIso(range.from)}'`);
          filters.push(`fields/FechaApertura le '${dayEndIso(range.to)}'`);
        }
      }

      return {
        filter: filters.join(" and "),
      };
      // deps: usa lo que lees adentro
    }, [account?.username, range.from, range.to]);

    const obtenerTotal = React.useCallback(async (mode: string, ) => {
        setLoading(true);
        setError(null);
        try {
        const filter = buildFilterTickets(mode)
        //Todos los casos
        const casos = (await TicketsSvc.getAll({filter: filter.filter, top: 12000})).items;
        const total = Array.isArray(casos) ? casos.length : Array.isArray((casos as any)?.value) ? (casos as any).value.length : 0;

        //Casos finalizados
        const casosFinalizados = (await TicketsSvc.getAll({filter: filter.filter + " and fields/Estadodesolicitud eq 'Cerrado'", top:12000})).items;
        const totalFinalizados = Array.isArray(casosFinalizados) ? casosFinalizados.length : Array.isArray((casosFinalizados as any)?.value) ? (casosFinalizados as any).value.length : 0;

        //Casos fuera de tiempo
        const casosVencidos = (await TicketsSvc.getAll({filter: filter.filter + " and (fields/Estadodesolicitud eq 'Fuera de tiempo' or fields/Estadodesolicitud eq 'Cerrado fuera de tiempo')", top: 12000 })).items;
        const totalVencidos = Array.isArray(casosVencidos) ? casosVencidos.length : Array.isArray((casosVencidos as any)?.value) ? (casosVencidos as any).value.length : 0;
        
        //Casos en curso
        const casosEnCurso = (await TicketsSvc.getAll({filter: filter.filter + " and fields/Estadodesolicitud eq 'En Atención'", top: 12000})).items;
        const totalEnCurso = Array.isArray(casosEnCurso) ? casosEnCurso.length : Array.isArray((casosEnCurso as any)?.value) ? (casosEnCurso as any).value.length : 0;
        
        //Porcentaje de cumplimiento
        const porcentajeCumplimiento = total > 0 ? ((totalFinalizados) / total) : 0;

        const countBySolicitante = (key: (t: Ticket)=>string) => {
          const m = new Map<string, number>()
          for (const t of casos) {
            const k = key(t) || "(En blanco)"
            m.set(k, (m.get(k) ?? 0) + 1)
          }
          return Array.from(m, ([nombre, total]) => ({ nombre, total }))
            .sort((a,b)=>b.total-a.total)
        }
        const allSolicitantes = countBySolicitante(t => String((t as any).Solicitante).trim())
        const top5Solicitante = allSolicitantes.slice(0,5)
        
        setTop5Solicitante(top5Solicitante)
        setPorcentajeCumplimiento(porcentajeCumplimiento);
        setTotalCasos(total);
        setTotalFinalizados(totalFinalizados);
        setTotalFueraTiempo(totalVencidos);
        setTotalencurso(totalEnCurso);
        } catch (e: any) {
        setError(e?.message ?? "Error al inicializar escalamiento");
        } finally {
        setLoading(false);
        }
    },
    [TicketsSvc, account?.username]
    );

    const obtenerTop5 = React.useCallback(async (mode: string) => {
      setLoading(true);
      setError(null);
      try {
        const filter = buildFilterTickets(mode);
        const res = await TicketsSvc.getAll({ filter: filter.filter, top: 12000 });
        const tickets: Ticket[] =
          Array.isArray(res?.items) ? res.items :
          Array.isArray((res as any)?.value) ? (res as any).value : [];

        if (!tickets.length) {
          setTopCategorias([]);
          return;
        }
      
        console.table(tickets)
        const counts = new Map<string, number>();
        for (const t of tickets) {
          const cat = String(t?.SubCategoria || "(En blanco)").trim();
          counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }


        // Calcular top 5
        const top = Array.from(counts.entries())
          .map(([nombre, totalCat]) => ({
            nombre,
            total: totalCat,
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

        setTopCategorias(top);
      } catch (e: any) {
        setError(e?.message ?? "Error al obtener top 5 de categorías");
      } finally {
        setLoading(false);
      }
    }, [TicketsSvc, buildFilterTickets]);

    

    const obtenerTotalCategoria = React.useCallback(async (mode: string) => {
      setLoading(true);
      setError(null);
      try {
        const { filter } = buildFilterTickets(mode);
        const res = await TicketsSvc.getAll({ filter, top: 12000 });

        const tickets: Ticket[] = Array.isArray(res?.items)
          ? res.items
          : Array.isArray((res as any)?.value)
          ? (res as any).value
          : [];

        // nada que contar
        if (!tickets.length) {
          setTotalCateogria([]);            
          return;
        }

        // contar por SubCategoria (ajusta el campo si quieres otra agrupación)
        const counts = new Map<string, number>();
        for (const t of tickets) {
          const key = String(t?.SubCategoria || "(En blanco)").trim();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        // convertir a array y ordenar DESC
        const allCats: TopCategoria[] = Array.from(counts, ([nombre, total]) => ({ nombre, total }))
          .sort((a, b) => b.total - a.total);

        setTotalCateogria(allCats);         
      } catch (e: any) {
        setError(e?.message ?? "Error al obtener categorías");
      } finally {
        setLoading(false);
      }
    }, [TicketsSvc, buildFilterTickets]);

    const obtenerTotalResolutor = React.useCallback(
      async (mode: string): Promise<ResolutorAgg[]> => {
        setLoading(true);
        setError(null);
        try {
          const { filter } = buildFilterTickets(mode);
          const res = await TicketsSvc.getAll({ filter, top: 12000 });

          const tickets: any[] = Array.isArray(res?.items)
            ? res.items
            : Array.isArray((res as any)?.value)
            ? (res as any).value
            : [];

          if (!tickets.length) {
            setResolutores([]);
            return [];
          }

          const totalTickets = tickets.length;

          // agregamos por correo; guardamos mejor display name
          const counts = new Map<string, number>();
          const nombrePorCorreo = new Map<string, string>();

          for (const t of tickets) {
            const correo = (t?.Correoresolutor ?? "").trim().toLowerCase() || "(en blanco)";
            const nombre = (t?.Nombreresolutor ?? "").trim();

            counts.set(correo, (counts.get(correo) ?? 0) + 1);
            if (nombre && !nombrePorCorreo.get(correo)) {
              nombrePorCorreo.set(correo, nombre);
            }
          }

          const data: ResolutorAgg[] = Array.from(counts.entries())
            .map(([correo, total]) => {
              const displayNombre =
                nombrePorCorreo.get(correo) ||
                (correo && correo.includes("@") ? correo.split("@")[0] : "(En blanco)");
              const porcentaje = totalTickets > 0 ? totalFinalizados / totalTickets : 0; // 0..1
              return {
                correo: correo === "(en blanco)" ? "" : correo,
                nombre: displayNombre,
                total,
                porcentaje,
              };
            })
            .sort((a, b) => b.total - a.total);

          setResolutores(data);
          return data;
        } catch (e: any) {
          setError(e?.message ?? "Error al obtener resolutores");
          return [];
        } finally {
          setLoading(false);
        }
      },
      [TicketsSvc, buildFilterTickets, totalCasos, totalFinalizados]
    );

    const obtenerFuentes = React.useCallback( async (mode: string): Promise<Fuente[]> => {
      setLoading(true);
      setError(null);
      try {
        const { filter } = buildFilterTickets(mode);
        const res = await TicketsSvc.getAll({ filter, top: 12000 });

        const tickets: any[] = Array.isArray(res?.items)
          ? res.items
          : Array.isArray((res as any)?.value)
          ? (res as any).value
          : [];

        if (!tickets.length) {
          setFuentes([]);
          return [];
        }

        // Contar por campo Fuente
        const counts = new Map<string, number>();
        for (const t of tickets) {
          const key = String(t?.Fuente || "(En blanco)").trim();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        // A arreglo + ordenar DESC
        const data: Fuente[] = Array.from(counts, ([label, total]) => ({ label, total }))
          .sort((a, b) => b.total - a.total);

        setFuentes(data);
        return data;
      } catch (e: any) {
        setError(e?.message ?? "Error al obtener fuentes");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [TicketsSvc, buildFilterTickets]
    );

    const obtenerCasosPorDia = React.useCallback(async (mode: string, fillGaps: boolean = true): Promise<DailyPoint[]> => {
        setLoading(true);
        setError(null);
        try {
          const { filter } = buildFilterTickets(mode);
          const res = await TicketsSvc.getAll({ filter, top: 12000 });

          const tickets: any[] = Array.isArray(res?.items)
            ? res.items
            : Array.isArray((res as any)?.value)
            ? (res as any).value
            : [];

          if (!tickets.length) {
            // setCasosPorDia?.([]);
            return [];
          }

          // Helper: toma YYYY-MM-DD en UTC (sin hora)
          const toDay = (v: string | Date) => {
            const d = typeof v === "string" ? new Date(v) : v;
            // normaliza a UTC -> YYYY-MM-DD
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            const day = String(d.getUTCDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
          };

          // Conteo por día usando el campo FechaApertura
          const counts = new Map<string, number>();
          for (const t of tickets) {
            const key = toDay(t?.FechaApertura ?? t?.fields?.FechaApertura ?? new Date());
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }

          let series: DailyPoint[] = Array.from(counts, ([fecha, total]) => ({ fecha, total }))
            .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

          if (fillGaps && range?.from && range?.to && range.from <= range.to) {
            const start = new Date(`${range.from}T00:00:00Z`);
            const end = new Date(`${range.to}T00:00:00Z`);
            const full: DailyPoint[] = [];
            for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
              const key = toDay(d);
              full.push({ fecha: key, total: counts.get(key) ?? 0 });
            }
            series = full;
          }

          setCasosPorDia(series);
          return series;
        } catch (e: any) {
          setError(e?.message ?? "Error al obtener casos por día");
          setCasosPorDia([]);
          return [];
        } finally {
          setLoading(false);
        }
      },
      [TicketsSvc, buildFilterTickets, range.from, range.to]
    );


  return {
    obtenerTotal, setRange, obtenerTop5, obtenerTotalCategoria, obtenerTotalResolutor, obtenerFuentes, obtenerCasosPorDia,
    totalCasos, error, loading, totalEnCurso, totalFinalizados, totalFueraTiempo, porcentajeCumplimiento, max, min,  topCategorias, range, totalCategorias, resolutores, Fuentes, casosPorDia, topSolicitante
  };
}
