import * as React from "react";
import Select, { components, type FilterOptionOption, type OptionProps} from "react-select";
import "./ModalsStyles.css";
import type { UserOption } from "../../../Models/Commons";
import { useGraphServices } from "../../../graph/GrapServicesContext";
import type { Ticket } from "../../../Models/Tickets";
import { norm } from "../../../utils/Commons";
import { useFranquicias } from "../../../Funcionalidades/Franquicias";
import { useWorkers } from "../../../Funcionalidades/Workers";
import { useAsignarObservador } from "../../../Funcionalidades/Tickets/hooks/forms/useAsignarObservador";

type UserOptionEx = UserOption & { source?: "Empleado" | "Franquicia" };

export default function AsignarObservador({ticket, onDone}: {ticket: Ticket, onDone: () => void}) {

  const {Franquicias: FranquiciasSvc, } = useGraphServices() 
  const {state,errors, submitting, setField, handleObservador,} = useAsignarObservador(ticket);
  const { franqOptions, loading: loadingFranq, error: franqError } = useFranquicias(FranquiciasSvc!);
  const { workersOptions, loadingWorkers, error: usersError } = useWorkers({onlyEnabled: true,});

  // ====== Combinar usuarios con franquicias
  const combinedOptions: UserOptionEx[] = React.useMemo(() => {
    const map = new Map<string, UserOptionEx>();
    for (const o of [...workersOptions, ...franqOptions]) {
      const key = (o.value || "").toLowerCase();
      if (!map.has(key)) map.set(key, o);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [workersOptions, franqOptions]);

  // ====== Filtro genérico (insensible a acentos) para react-select

  const userFilter = (option: FilterOptionOption<UserOptionEx>, raw: string) => {
    const q = norm(raw);
    if (!q) return true;
    const label = option?.label ?? "";
    const data = option?.data as UserOptionEx | undefined;
    const email = data?.email ?? "";
    const job = data?.jobTitle ?? "";
    const haystack = norm(`${label} ${email} ${job}`);
    return haystack.includes(q);
  };

  const Option = (props: OptionProps<UserOptionEx, false>) => {
    const { data, label } = props;
    return (
      <components.Option {...props}>
        <div className="rs-opt">
          <div className="rs-opt__text">
            <span className="rs-opt__title">{label}</span>
            {(data as any).email && <span className="rs-opt__meta">{(data as any).email}</span>}
            {(data as any).jobTitle && <span className="rs-opt__meta">{(data as any).jobTitle}</span>}
          </div>
          {data.source && <span className="rs-opt__tag">{data.source}</span>}
        </div>
      </components.Option>
    );
  };

  return (
    <div className="dta-form">
      <form onSubmit={(e) => {handleObservador(e); onDone()}} noValidate className="dta-grid">
        {/* Solicitante */}
        <div className="dta-field">
          <label className="dta-label">Solicitante</label>
          <Select<UserOptionEx, false>
            options={combinedOptions}
            placeholder={loadingWorkers || loadingFranq ? "Cargando opciones…" : "Buscar solicitante…"}
            value={state.observador as UserOptionEx | null}
            onChange={(opt) => setField("observador", opt ?? null)}
            classNamePrefix="rs"
            isDisabled={submitting || loadingWorkers || loadingFranq}
            isLoading={loadingWorkers || loadingFranq}
            filterOption={userFilter}
            components={{ Option }}
            noOptionsMessage={() => (usersError || franqError ? "Error cargando opciones" : "Sin coincidencias")}
            isClearable
            menuPosition="fixed"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            styles={{
              menuPortal: (base) => ({ ...base, zIndex: 999999 }),
            }}
          />
          {errors.observador && <small className="error">{errors.observador}</small>}
        </div>

        {/* Submit */}
        <div className="dta-actions dta-col-2">
          <button type="submit" disabled={submitting } className="btn-primary">
            {submitting ? "Asignando..." : "Asignar observador"}
          </button>
        </div>
      </form>
    </div>
  );
}
