import * as React from "react";
import Select, { components, type OptionProps, type SingleValue } from "react-select";
import "./NuevoTicket.css";
import "../../App.css";
import type { UserOption } from "../../Models/Commons";
import { useGraphServices } from "../../graph/GrapServicesContext";
import { useUsuarios } from "../../Funcionalidades/Usuarios";
import { norm, pick, s } from "../../utils/Commons";
import RichTextBase64 from "../RichTextBase64/RichTextBase64";
import { useFranquicias } from "../../Funcionalidades/Franquicias";
import { useWorkers } from "../../Funcionalidades/Workers";
import { useANS } from "../../Funcionalidades/Ans";
import { useNuevoTicketForm } from "../../Funcionalidades/Tickets/hooks/forms/useNuevoTicketForm";

export type UserOptionEx = UserOption & { source?: "Empleado" | "Franquicia" };

export type TreeOption = {
  value: string; // "sub:<id>" | "art:<id>"
  label: string; // "Cat > Sub" | "Cat > Sub > Art"
  meta: {
    catId: string | number;
    subId: string | number;
    artId?: string | number;
    catTitle: string;
    subTitle: string;
    artTitle?: string; // vacío cuando solo Cat/Sub
    kind: "sub" | "art";
  };
};

export default function NuevoTicketForm() {
  const {Franquicias: FranquiciasSvc,  Usuarios: UsuariosSPServiceSvc, ANS} = useGraphServices();
  const {state, errors, submitting, categorias, subcategoriasAll, loadingCatalogos, setField, handleSubmit,} = useNuevoTicketForm();
  const { franqOptions, loading: loadingFranq, error: franqError } = useFranquicias(FranquiciasSvc!);
  const { workersOptions, loadingWorkers, error: usersError } = useWorkers({ onlyEnabled: true });
  const { UseruserOptions, loading, error } = useUsuarios(UsuariosSPServiceSvc!);
  const {obtainANS} = useANS(ANS)

  const opcionesFuentes = [
    { value: "Correo", label: "Correo" },
    { value: "Disponibilidad", label: "Disponibilidad" },
    { value: "Teams", label: "Teams" },
    { value: "Presencial", label: "Presencial" },
    { value: "WhatsApp", label: "WhatsApp" },
  ];


  // ====== Combinar usuarios con franquicias
  const combinedOptions: UserOptionEx[] = React.useMemo(() => {
    const map = new Map<string, UserOptionEx>();
    for (const o of [...workersOptions, ...franqOptions]) {
      const key = (o.value || "").toLowerCase();
      if (!map.has(key)) map.set(key, o);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [workersOptions, franqOptions]);

  // ✅ TreeOptions = Subcategorías (sin artículo) + Artículos (con artículo)
  const treeOptions: TreeOption[] = React.useMemo(() => {
    if (!categorias.length || !subcategoriasAll.length) return [];

    const catById = new Map(categorias.map((c: any) => [s(c.ID), c]));

    // 1) base: Cat > Sub
    const base: TreeOption[] = subcategoriasAll.map((sub: any) => {
      const catIdRaw = pick(sub, ["Id_categoria", "Id_Categoria", "CategoriaId", "IdCategoria"]);
      const cat = catById.get(s(catIdRaw));

      const catTitle = cat?.Title ?? "(Sin categoría)";
      const subTitle = sub?.Title ?? "(Sin subcategoría)";

      return {
        value: `sub:${s(sub.ID)}`,
        label: `${catTitle} > ${subTitle}`,
        meta: {
          kind: "sub",
          catId: catIdRaw ?? "",
          subId: sub.ID ?? "",
          catTitle,
          subTitle,
          artTitle: "",
        },
      };
    });


    return [...base, ].sort((x, y) => x.label.localeCompare(y.label));
  }, [categorias, subcategoriasAll,]);

  // ✅ value actual del select (basado en tus 3 fields de state: Categoria/SubCategoria/SubSubCategoria)
  const treeValue: TreeOption | null = React.useMemo(() => {
    if (!state.Categoria || !state.SubCategoria) return null;

    const nCat = norm(state.Categoria || "");
    const nSub = norm(state.SubCategoria || "");

    return (
      treeOptions.find(
        (o) =>
          o.meta.kind === "sub" &&
          norm(o.meta.catTitle) === nCat &&
          norm(o.meta.subTitle) === nSub
      ) ?? null
    );
  }, [state.Categoria, state.SubCategoria, treeOptions]);

  const userFilter = (option: any, raw: string) => {
    const q = norm(raw);
    if (!q) return true;
    const label = option?.label ?? "";
    const data = option?.data as UserOptionEx | undefined;
    const email = (data as any)?.email ?? "";
    const job = (data as any)?.jobTitle ?? "";
    const haystack = norm(`${label} ${email} ${job}`);
    return haystack.includes(q);
  };

  const Option = (props: OptionProps<UserOptionEx, false>) => {
    const { data, label } = props;
    return (
      <components.Option {...props}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block truncate font-semibold text-[var(--ink)]">{label}</span>
          </div>
          {data.source && (
            <span className="shrink-0 rounded-md border border-[var(--bd)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">
              {data.source}
            </span>
          )}
        </div>
      </components.Option>
    );
  };

  const onTreeChange = async (opt: SingleValue<TreeOption>) => {
    if (!opt) {
      setField("Categoria", "");
      setField("SubCategoria", "");
      return;
    }

    // Guardas títulos (como lo venías haciendo) + artículo vacío si no aplica
    setField("Categoria", opt.meta.catTitle);
    setField("SubCategoria", opt.meta.subTitle);
    setField("id_Categoria", String(opt.meta.catId));
    setField("Id_Subcategoria", String(opt.meta.subId));

    const ans = await obtainANS(String(opt.meta.catId), String(opt.meta.subId) ?? "", opt.meta.kind === "art" ? String(opt.meta.artId) : "")
    alert(ans?.Title)
    setField("ANS", ans?.Title)
  };

  const disabledCats = submitting || loadingCatalogos;

  const selectedSolicitnate =
    combinedOptions.find(
      (o) => o.value.toLocaleLowerCase() === state.CorreoSolicitante?.trim().toLocaleLowerCase()
    ) ?? null;

  const selectedResolutor =
    UseruserOptions.find(
      (o) => o.value.toLocaleLowerCase() === state.Correoresolutor?.trim().toLocaleLowerCase()
    ) ?? null;

  return (
    <div className="ticket-form">
      <div className="form-header">
        <h2 className="tf-title">Nuevo Ticket</h2>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e, state.ANS ?? "");}} noValidate className="tf-grid">
        {/* Solicitante */}
        <div className="tf-field">
          <label className="tf-label">Solicitante</label>
          <Select<UserOptionEx, false>
            options={combinedOptions}
            placeholder={loadingWorkers || loadingFranq ? "Cargando opciones…" : "Buscar solicitante…"}
            value={selectedSolicitnate}
            onChange={(opt) => {
              setField("CorreoSolicitante", opt?.value);
              setField("Solicitante", opt?.label);
            }}
            classNamePrefix="rs"
            isDisabled={submitting || loadingWorkers || loadingFranq}
            isLoading={loadingWorkers || loadingFranq}
            components={{ Option }}
            noOptionsMessage={() => (usersError || franqError ? "Error cargando opciones" : "Sin coincidencias")}
            isClearable
          />
          {errors.Solicitante && <small className="error">{errors.Solicitante}</small>}
        </div>

        {/* Resolutor */}
        <div className="tf-field">
          <label className="tf-label">Resolutor</label>
          <Select<UserOption, false>
            options={UseruserOptions}
            placeholder={loading ? "Cargando usuarios…" : "Buscar resolutor…"}
            value={selectedResolutor}
            onChange={async (opt) => {
              if (opt?.jobTitle === "Tecnico") {
                setField("Correoresolutor", opt.value);
                setField("Nombreresolutor", opt.label);
              } else {
                setField("Correoresolutor", opt?.value);
                setField("Nombreresolutor", opt?.label);
              }
            }}
            classNamePrefix="rs"
            isDisabled={submitting || loading}
            isLoading={loading}
            filterOption={userFilter as any}
            components={{ Option: Option as any }}
            noOptionsMessage={() => (error ? "Error cargando usuarios" : "Sin coincidencias")}
            isClearable
          />
          {errors.Nombreresolutor && <small className="error">{errors.Nombreresolutor}</small>}
        </div>

        {/* Fuente */}
        <div className="tf-field">
          <label className="tf-label" htmlFor="fuente">Fuente Solicitante</label>
          <Select inputId="nomina" options={opcionesFuentes} classNamePrefix="rs" placeholder="Selecciona tipo de nómina..." value={opcionesFuentes.find((o) => o.value === state.Fuente) ?? null} onChange={(opt) => setField("Fuente", opt?.label ?? "")} isClearable/>
          {errors.Fuente && <small className="error">{errors.Fuente}</small>}
        </div>

        {/* Motivo */}
        <div className="tf-field">
          <label className="tf-label" htmlFor="motivo">Asunto</label>
          <input id="motivo" type="text" placeholder="Ingrese el motivo" value={state.Title} onChange={(e) => setField("Title", e.target.value)} disabled={submitting} className="tf-input" maxLength={300}/>
          {errors.Title && <small className="error">{errors.Title}</small>}
        </div>

        {/* Descripción */}
        <div className={`tf-field tf-col-2 ${errors.Descripcion ? "has-error" : ""}`}>
          <label className="tf-label">Descripción</label>
          <div className="rtb-box">
            <RichTextBase64 value={state.Descripcion ?? ""} onChange={(html) => setField("Descripcion", html)} placeholder="Describe el problema y pega capturas (Ctrl+V)..."/>
          </div>
          {errors.Descripcion && <small className="error">{errors.Descripcion}</small>}
        </div>

        {/* Categoría / Subcategoría*/}
        <div className="tf-row tf-row--cats tf-col-2">
          <div className="tf-field">
            <label className="tf-label">Categoría</label>
            <Select<TreeOption, false>
              classNamePrefix="rs"
              placeholder={loadingCatalogos ? "Cargando catálogo..." : "Buscar categoría/sub/artículo…"}
              options={treeOptions}
              value={treeValue}
              onChange={onTreeChange}
              isDisabled={disabledCats}
              isClearable
            />
            {errors.Categoria && <small className="error">{errors.Categoria}</small>}
          </div>
        </div>

        {/* Submit */}
        <div className="tf-actions tf-col-2">
          <button type="submit" disabled={submitting || loadingCatalogos} className="btn btn-primary-final">
            {submitting ? "Enviando..." : "Enviar Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
