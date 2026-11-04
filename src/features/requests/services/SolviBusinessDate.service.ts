import { TZDate } from '@date-fns/tz';
import { addMinutes, isSaturday, isSunday } from 'date-fns';
import { fetchHolidays, type Holiday } from './HolidayService.service';

const TIMEZONE = 'America/Bogota';
// Jornada hábil continua 7:00-16:30 (mesa de ayuda siempre cubierta), en
// minutos desde medianoche.
const WORK_START = 7 * 60;
const WORK_END = 16 * 60 + 30;
const HORAS_POR_DIA = (WORK_END - WORK_START) / 60;
// Fallback cuando no hay ANS cargado en SharePoint para la combinación
// categoría/subcategoría/artículo elegida (lista "ANS" vacía o incompleta).
export const DEFAULT_SLA_HORAS = 4;

const pad = (n: number) => String(n).padStart(2, '0');

const sliceYMD = (s?: string) => (s ? s.slice(0, 10) : '');

const toYMD = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(12, 0, 0, 0);
  return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
};

const isHoliday = (date: Date, holidays: Holiday[]) => {
  const ymd = toYMD(date);
  return holidays.some((h) => sliceYMD(h.date) === ymd);
};

const minutosDelDia = (d: TZDate) => d.getHours() * 60 + d.getMinutes();

const atMinuto = (d: TZDate, minuto: number, sumarDias = 0) =>
  new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + sumarDias, Math.floor(minuto / 60), minuto % 60, 0, TIMEZONE);

const nextWorkDayStart = (from: TZDate) => atMinuto(from, WORK_START, 1);

export function parseDateFlex(v?: string | Date | null): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  const s = String(v).trim();
  if (!s) return null;

  // 1) Intento directo (ISO u otros)
  const attempt = new Date(s);
  if (!Number.isNaN(attempt.getTime())) return attempt;

  // 2) dd/mm/yyyy [hh[:mm]]
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?)?$/.exec(s);
  if (m) {
    const [, dd, mm, yy, hh = '0', mi = '0'] = m;
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const month = Number(mm) - 1;
    const day = Number(dd);
    const hour = Number(hh);
    const min = Number(mi);
    const d = new Date(year, month, day, hour, min, 0);
    if (
      d.getFullYear() === year &&
      d.getMonth() === month &&
      d.getDate() === day
    ) return d;
  }

  return null;
}

export function toISODateTimeFlex(v?: string | Date | null): string {
  const d = parseDateFlex(v);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// true fuera del horario laboral (antes de las 7:00 o desde las 16:30, hora Bogotá).
export function isTurnoNocturnoAhora(): boolean {
  const minuto = minutosDelDia(new TZDate(new Date(), TIMEZONE));
  return minuto < WORK_START || minuto >= WORK_END;
}

/** Formatea un ANS (en horas hábiles) para mostrarlo al usuario: si supera
 *  una jornada lo expresa en días (horas/HORAS_POR_DIA) para que sea más
 *  legible. Siempre aclara "hábil(es)" para no confundirlo con horas/días
 *  corridos. */
export function formatSlaHorasHabiles(horas: number): string {
  if (horas <= HORAS_POR_DIA) {
    return `${horas} ${horas === 1 ? 'hora hábil' : 'horas hábiles'}`;
  }
  const dias = horas / HORAS_POR_DIA;
  const diasLabel = Number.isInteger(dias) ? String(dias) : dias.toFixed(1);
  return `${diasLabel} ${dias === 1 ? 'día hábil' : 'días hábiles'} (${horas} horas hábiles)`;
}

// Suma `ansHoras` horas hábiles (L-V, 7:00-16:30 continuo, excluyendo
// festivos) a partir de "ahora". Si no se pasa un ANS válido (combinación sin
// match en la lista "ANS" de SharePoint), cae al fallback de DEFAULT_SLA_HORAS.
export async function calcularFechaSolucion(ansHoras?: number | null): Promise<TZDate> {
  const horas = ansHoras != null && ansHoras > 0 ? ansHoras : DEFAULT_SLA_HORAS;
  let restante = horas * 60;
  let actual = new TZDate(new Date(), TIMEZONE);
  const holidays = await fetchHolidays();

  while (restante > 0) {
    if (isSaturday(actual) || isSunday(actual) || isHoliday(actual, holidays)) {
      actual = nextWorkDayStart(actual);
      continue;
    }

    const minuto = minutosDelDia(actual);

    if (minuto < WORK_START) {
      actual = atMinuto(actual, WORK_START);
      continue;
    }

    if (minuto >= WORK_END) {
      actual = nextWorkDayStart(actual);
      continue;
    }

    const aConsumir = Math.min(restante, WORK_END - minuto);
    actual = new TZDate(addMinutes(actual, aConsumir), TIMEZONE);
    restante -= aConsumir;
  }

  return actual;
}
