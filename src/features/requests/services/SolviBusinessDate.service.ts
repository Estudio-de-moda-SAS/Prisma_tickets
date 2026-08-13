import { TZDate } from '@date-fns/tz';
import { addMinutes, isSaturday, isSunday } from 'date-fns';
import { fetchHolidays, type Holiday } from './HolidayService.service';

const TIMEZONE = 'America/Bogota';
const WORK_START = 7;
const WORK_END = 17;
const SLA_MINUTES = 4 * 60;

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

const nextWorkDayStart = (from: TZDate) =>
  new TZDate(from.getFullYear(), from.getMonth(), from.getDate() + 1, WORK_START, 0, 0, TIMEZONE);

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

// true fuera del horario laboral (antes de las 7:00 o desde las 17:00, hora Bogotá).
export function isTurnoNocturnoAhora(): boolean {
  const hora = new TZDate(new Date(), TIMEZONE).getHours();
  return hora < WORK_START || hora >= WORK_END;
}

// Suma 4h hábiles (L-V, 7:00-17:00, excluyendo festivos) a partir de "ahora".
export async function calcularFechaSolucion(): Promise<TZDate> {
  let restante = SLA_MINUTES;
  let actual = new TZDate(new Date(), TIMEZONE);
  const holidays = await fetchHolidays();

  while (restante > 0) {
    const hora = actual.getHours();

    if (isSaturday(actual) || isSunday(actual) || isHoliday(actual, holidays)) {
      actual = nextWorkDayStart(actual);
      continue;
    }

    if (hora < WORK_START) {
      actual = new TZDate(actual.getFullYear(), actual.getMonth(), actual.getDate(), WORK_START, 0, 0, TIMEZONE);
      continue;
    }

    if (hora >= WORK_END) {
      actual = nextWorkDayStart(actual);
      continue;
    }

    const minutosHastaFin = (WORK_END - hora) * 60 - actual.getMinutes();
    const aConsumir = Math.min(restante, minutosHastaFin);
    actual = new TZDate(addMinutes(actual, aConsumir), TIMEZONE);
    restante -= aConsumir;

    if (restante > 0) {
      actual = nextWorkDayStart(actual);
    }
  }

  return actual;
}
