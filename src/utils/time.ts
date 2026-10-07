export function formatHm(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseHm(value?: string): { hours: number; minutes: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

function minutesOf(value?: string): number | null {
  const parsed = parseHm(value);
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

export function hoursBetween(start?: string, end?: string): number {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from == null || to == null) return 0;
  let diff = to - from;
  if (diff < 0) diff += 24 * 60;
  if (diff === 0) return 0;
  return Number((diff / 60).toFixed(2));
}

export function addHoursToTime(start: string, hours: number): string {
  const from = minutesOf(start);
  if (from == null || hours <= 0) return '';
  const total = (from + Math.round(hours * 60)) % (24 * 60);
  return formatHm(Math.floor(total / 60), total % 60);
}
