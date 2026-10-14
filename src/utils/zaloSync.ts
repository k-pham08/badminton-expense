import { useSyncExternalStore } from 'react';
import { toDateId } from './date';
import { dateIdFromVoteTitle } from './vote';
import {
  ZaloBridgeError,
  fetchZaloBoard,
  loadZaloConfig,
  type ZaloBridgePerson,
  type ZaloPoll,
  type ZaloPollDay,
} from './zaloBridge';

const THROTTLE_MS = 2 * 60 * 1000;

export type ZaloSyncPhase = 'idle' | 'updating' | 'ok' | 'offline' | 'needLogin' | 'unauthorized' | 'unconfigured' | 'error';

export type ZaloSyncState = {
  phase: ZaloSyncPhase;
  message: string;
  updatedAt: number | null;
  groupName: string;
  polls: ZaloPoll[];
  people: ZaloBridgePerson[];
};

type SyncStore = {
  applyZaloPoll: (
    people: { id: string; name: string; avatar: string }[],
    create: { id?: string; name: string }[],
    entries: { date: string; names: string[]; voterIds?: string[] }[],
  ) => void;
};

let state: ZaloSyncState = {
  phase: 'idle',
  message: '',
  updatedAt: null,
  groupName: '',
  polls: [],
  people: [],
};
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let boardAt = 0;
let cachedKey = '';

function emit(next: ZaloSyncState) {
  state = next;
  for (const listener of listeners) listener();
}

function patch(partial: Partial<ZaloSyncState>) {
  emit({ ...state, ...partial });
}

export function zaloStatusLine(sync: ZaloSyncState): string {
  if (sync.phase === 'updating') return 'Đang tải phiếu';
  if (sync.phase === 'offline') return 'Không tới được Mac';
  if (sync.phase === 'needLogin') return 'Cần quét QR trên Mac';
  if (sync.phase === 'unauthorized') return 'Sai token';
  if (sync.phase === 'unconfigured') return 'Chưa kết nối Zalo';
  if (sync.phase === 'error') return sync.message || 'Không tải được phiếu';
  if (sync.updatedAt) {
    const date = new Date(sync.updatedAt);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const name = sync.groupName ? `${sync.groupName} · ` : '';
    return `Zalo · ${name}${hh}:${mm}`;
  }
  return sync.groupName ? `Zalo · ${sync.groupName}` : 'Zalo';
}

export function useZaloSyncState(): ZaloSyncState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

function phaseOf(error: unknown): Pick<ZaloSyncState, 'phase' | 'message'> {
  if (error instanceof ZaloBridgeError) {
    if (error.code === 'needLogin') return { phase: 'needLogin', message: error.message };
    if (error.code === 'unauthorized') return { phase: 'unauthorized', message: error.message };
    if (error.code === 'unconfigured') return { phase: 'unconfigured', message: error.message };
    if (error.code === 'offline') return { phase: 'offline', message: error.message };
    return { phase: 'error', message: error.message };
  }
  return { phase: 'offline', message: 'Không tới được Mac' };
}

export function nearestDateId(title: string, today = new Date()): string | null {
  const year = today.getFullYear();
  const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let best: { id: string; distance: number } | null = null;
  for (const hint of [year - 1, year, year + 1]) {
    const id = dateIdFromVoteTitle(title, hint);
    if (!id) continue;
    const [y, m, d] = id.split('-').map(Number);
    const distance = Math.abs(new Date(y, m - 1, d).getTime() - todayTime);
    if (!best || distance < best.distance) best = { id, distance };
  }
  return best?.id ?? null;
}

export type ZaloPollEntry = ZaloPollDay & { date: string };

export function entriesForPoll(poll: ZaloPoll, today = new Date()): ZaloPollEntry[] {
  const byDate = new Map<string, ZaloPollEntry>();
  for (const day of poll.days) {
    const date = nearestDateId(day.title, today);
    if (!date || day.names.length === 0) continue;
    const prev = byDate.get(date);
    if (!prev || day.names.length >= prev.names.length) {
      byDate.set(date, { ...day, date });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function upcomingPollEntries(entries: ZaloPollEntry[], today = new Date()): ZaloPollEntry[] {
  const todayKey = toDateId(today);
  return entries.filter((entry) => entry.date >= todayKey);
}

export function peopleForPoll(poll: ZaloPoll, people: ZaloBridgePerson[]): ZaloBridgePerson[] {
  const ids = new Set<string>();
  for (const option of poll.options) for (const id of option.voterIds) ids.add(id);
  for (const day of poll.days) for (const id of day.voterIds) ids.add(id);
  return people.filter((person) => ids.has(person.id));
}

export function syncChosenPoll(
  store: SyncStore,
  poll: ZaloPoll,
  people: ZaloBridgePerson[],
  create: { id?: string; name: string }[],
) {
  const entries = upcomingPollEntries(entriesForPoll(poll)).map((entry) => ({
    date: entry.date,
    names: entry.names,
    voterIds: entry.voterIds,
  }));
  store.applyZaloPoll(peopleForPoll(poll, people), create, entries);
}

async function runLoad(force: boolean) {
  const config = await loadZaloConfig();
  if (!config) {
    patch({ phase: 'unconfigured', message: 'Chưa kết nối Zalo', groupName: '', polls: [], people: [] });
    return;
  }
  const key = `${config.host}\n${config.groupId}`;
  if (!force && cachedKey === key && state.phase === 'ok' && Date.now() - boardAt < THROTTLE_MS) {
    return;
  }
  patch({ phase: 'updating', message: 'Đang tải phiếu', groupName: config.groupName });
  try {
    const board = await fetchZaloBoard(config);
    boardAt = Date.now();
    cachedKey = key;
    patch({
      phase: 'ok',
      message: '',
      updatedAt: Date.now(),
      groupName: config.groupName,
      polls: board.polls,
      people: board.people,
    });
  } catch (error) {
    patch({ ...phaseOf(error), groupName: config.groupName });
  }
}

export function loadZalo(force: boolean): Promise<void> {
  if (inflight) return inflight;
  inflight = runLoad(force).finally(() => {
    inflight = null;
  });
  return inflight;
}
