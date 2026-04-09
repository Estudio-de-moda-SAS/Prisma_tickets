import * as React from "react";
import type { Holiday } from "festivos-colombianos";
import { fetchHolidays } from "../../../../services/Festivos.service";


export function useTicketHolidays() {
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const hs = await fetchHolidays();
        if (!cancel) setHolidays(hs);
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? "Error cargando festivos");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, []);

  return { holidays, loading, error };
}