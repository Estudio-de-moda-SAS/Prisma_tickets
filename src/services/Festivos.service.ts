import holidaysColombia, { type Holiday } from "festivos-colombianos";

export async function fetchHolidays(): Promise<Holiday[]> {
  const year = new Date().getFullYear(); //Obtener el año actual
  const holidays = holidaysColombia(year);
  return holidays
}
