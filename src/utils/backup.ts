import { documentDirectory, cacheDirectory, EncodingType, getInfoAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_DATA, type AppData } from '../types';

const AUTO_BACKUP_FILE = 'auto-backup.json';
const AUTO_BACKUP_KEY = 'auto-backup-timestamp';

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

// ============ Auto-backup functions ============

function getAutoBackupDir(): string {
  return documentDirectory ?? cacheDirectory ?? '';
}

export async function saveAutoBackup(data: AppData): Promise<void> {
  try {
    const dir = getAutoBackupDir();
    if (!dir) return;
    
    const json = toBackupJson(data);
    const path = `${dir}${AUTO_BACKUP_FILE}`;
    await writeAsStringAsync(path, json, { encoding: EncodingType.UTF8 });
    
    // Also save timestamp to AsyncStorage for quick access
    await AsyncStorage.setItem(AUTO_BACKUP_KEY, new Date().toISOString());
  } catch (error) {
    console.warn('Auto-backup failed:', error);
  }
}

export async function loadAutoBackup(): Promise<{ data: AppData | null; timestamp: string | null }> {
  try {
    const dir = getAutoBackupDir();
    if (!dir) return { data: null, timestamp: null };

    const path = `${dir}${AUTO_BACKUP_FILE}`;
    const info = await getInfoAsync(path);
    if (!info.exists) return { data: null, timestamp: null };

    const json = await readAsStringAsync(path, { encoding: EncodingType.UTF8 });
    const data = parseBackup(json);

    const timestamp = await AsyncStorage.getItem(AUTO_BACKUP_KEY);

    return { data, timestamp };
  } catch (error) {
    console.warn('Load auto-backup failed:', error);
    return { data: null, timestamp: null };
  }
}

export function formatBackupTime(isoString: string | null): string {
  if (!isoString) return 'Chưa có backup tự động';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  
  return date.toLocaleDateString('vi-VN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
