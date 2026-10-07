export function toDateId(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthIdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function currentMonthId(): string {
  return monthIdFromDate(new Date());
}

export function todayId(): string {
  return toDateId(new Date());
}

export function parseMonthId(id: string): { year: number; month: number } {
  const [year, month] = id.split('-').map(Number);
  return { year, month };
}

export function addMonths(monthId: string, delta: number): string {
  const { year, month } = parseMonthId(monthId);
  return monthIdFromDate(new Date(year, month - 1 + delta, 1));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 0 = Monday ... 6 = Sunday */
export function mondayIndex(year: number, month: number, day: number): number {
  const js = new Date(year, month - 1, day).getDay();
  return js === 0 ? 6 : js - 1;
}

export function monthLabel(monthId: string): string {
  const { year, month } = parseMonthId(monthId);
  return `Tháng ${month}/${year}`;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export function formatDateVi(dateId: string): string {
  const [y, m, d] = dateId.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

const WEEKDAYS_LONG = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
] as const;

export function formatDateLongVi(dateId: string): string {
  const [y, m, d] = dateId.split('-').map(Number);
  const weekday = WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()];
  return `${weekday}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function dateIdInMonth(monthId: string, day: number): string {
  const { year, month } = parseMonthId(monthId);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export const WEEKDAY_LONG = [
  'thứ hai',
  'thứ ba',
  'thứ tư',
  'thứ năm',
  'thứ sáu',
  'thứ bảy',
  'chủ nhật',
] as const;

export function weekdayMon0FromDateId(dateId: string): number {
  const [y, m, d] = dateId.split('-').map(Number);
  return mondayIndex(y, m, d);
}

export function datesForWeekdays(monthId: string, weekdays: number[]): string[] {
  if (!weekdays.length) return [];
  const { year, month } = parseMonthId(monthId);
  const total = daysInMonth(year, month);
  const selected = new Set(weekdays);
  const dates: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    if (selected.has(mondayIndex(year, month, day))) {
      dates.push(dateIdInMonth(monthId, day));
    }
  }
  return dates;
}

export function computePlayingDates(
  monthId: string,
  weekdays: number[],
  skippedDates: string[] = [],
  extraDates: string[] = [],
): string[] {
  const skipped = new Set(skippedDates);
  const generated = datesForWeekdays(monthId, weekdays).filter((date) => !skipped.has(date));
  const extras = extraDates.filter((date) => !generated.includes(date) && !skipped.has(date));
  return [...generated, ...extras].sort();
}
