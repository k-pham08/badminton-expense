import { EMPTY_DATA, type AppData } from '../types';

export type BackupFile = AppData & {
  exportedAt?: string;
};

export function toBackupJson(data: AppData): string {
  const payload: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    members: data.members,
    zaloContacts: data.zaloContacts ?? [],
    courts: data.courts ?? [],
    months: data.months,
  };
  return JSON.stringify(payload, null, 2);
}

/** Share as raw text below this; use a .json file when larger. */
export const LARGE_BACKUP_CHARS = 50 * 1024;

export function isLargeBackup(json: string): boolean {
  return json.length > LARGE_BACKUP_CHARS;
}

export function backupFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `cau-long-${y}-${m}-${d}.json`;
}

export function parseBackup(raw: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Không phải JSON hợp lệ.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Not valid Badminton data.');
  }
  const value = parsed as Partial<BackupFile>;
  if (value.version !== 1 || !Array.isArray(value.members) || !value.months || typeof value.months !== 'object') {
    throw new Error('Not a valid Badminton app backup.');
  }
  return {
    ...EMPTY_DATA,
    version: 1,
    members: value.members,
    zaloContacts: value.zaloContacts ?? [],
    courts: value.courts ?? [],
    months: value.months,
  };
}
