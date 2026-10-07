export function parseDigits(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** 26000, 26.000, 26k, 26K → number of đồng */
export function parseMoney(input: string): number {
  const trimmed = input.trim().toLowerCase().replace(/\s/g, '');
  if (!trimmed) return 0;
  const hasK = trimmed.endsWith('k');
  const raw = hasK ? trimmed.slice(0, -1) : trimmed;
  const n = Number(raw.replace(/\./g, '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(hasK ? n * 1000 : n);
}

/** Đơn vị làm tròn tiền mỗi người (dễ chuyển khoản) */
export const SHARE_UNIT = 1000;

export function roundShare(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const rounded = Math.round(n / SHARE_UNIT) * SHARE_UNIT;
  return rounded === 0 ? SHARE_UNIT : rounded;
}

export function formatVnd(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

export function formatVndNumber(n: number): string {
  if (!n) return '';
  return Math.round(n).toLocaleString('vi-VN');
}
