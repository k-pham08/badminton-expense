import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateIdFromVoteTitle, type ZaloVoteDay } from './vote';

const HOST_KEY = 'zaloBridgeHost';
const TOKEN_KEY = 'zaloBridgeToken';
const GROUP_KEY = 'zaloGroupId';
const GROUP_NAME_KEY = 'zaloGroupName';

export type ZaloConfig = {
  host: string;
  token: string;
  groupId: string;
  groupName: string;
};

export type ZaloGroup = {
  id: string;
  name: string;
  totalMember: number;
};

export type ZaloBridgePerson = {
  id: string;
  name: string;
  avatar: string;
};

export type ZaloBridgeVote = {
  title: string;
  names: string[];
  voterIds: string[];
  anonymous?: boolean;
};

export type ZaloPollChoice = {
  content: string;
  names: string[];
  voterIds: string[];
};

export type ZaloPollDay = {
  title: string;
  names: string[];
  voterIds: string[];
};

export type ZaloPoll = {
  id: string;
  question: string;
  anonymous: boolean;
  options: ZaloPollChoice[];
  days: ZaloPollDay[];
};

export class ZaloBridgeError extends Error {
  code: 'offline' | 'needLogin' | 'unauthorized' | 'unconfigured' | 'bad';

  constructor(message: string, code: ZaloBridgeError['code']) {
    super(message);
    this.code = code;
  }
}

export function normalizeHost(value: string): string {
  let host = value.trim().replace(/\/+$/, '');
  if (!host) return '';
  if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
  return host;
}

export async function loadZaloConfig(): Promise<ZaloConfig | null> {
  const [host, token, groupId, groupName] = await Promise.all([
    AsyncStorage.getItem(HOST_KEY),
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(GROUP_KEY),
    AsyncStorage.getItem(GROUP_NAME_KEY),
  ]);
  if (!host?.trim() || !token?.trim() || !groupId?.trim()) return null;
  return {
    host: normalizeHost(host),
    token: token.trim(),
    groupId: groupId.trim(),
    groupName: groupName?.trim() || '',
  };
}

export async function saveZaloConnection(host: string, token: string): Promise<void> {
  await AsyncStorage.multiSet([
    [HOST_KEY, normalizeHost(host)],
    [TOKEN_KEY, token.trim()],
  ]);
}

export async function saveZaloGroup(groupId: string, groupName: string): Promise<void> {
  await AsyncStorage.multiSet([
    [GROUP_KEY, groupId.trim()],
    [GROUP_NAME_KEY, groupName.trim()],
  ]);
}

async function zaloGet<T>(host: string, token: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${normalizeHost(host)}${path}`, {
      headers: { Authorization: `Bearer ${token.trim()}` },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as (T & { needLogin?: boolean; error?: string }) | null;
    if (response.status === 401) {
      if (body?.needLogin) throw new ZaloBridgeError('Cần quét QR trên Mac', 'needLogin');
      throw new ZaloBridgeError('Sai token', 'unauthorized');
    }
    if (!response.ok || !body) {
      throw new ZaloBridgeError(body?.error || 'Mac không trả lời', 'bad');
    }
    return body;
  } catch (error) {
    if (error instanceof ZaloBridgeError) throw error;
    throw new ZaloBridgeError('Không tới được Mac', 'offline');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchZaloGroups(host: string, token: string): Promise<ZaloGroup[]> {
  const body = await zaloGet<{ groups?: ZaloGroup[] }>(host, token, '/groups');
  return body.groups ?? [];
}

export async function fetchZaloMembers(config: ZaloConfig): Promise<{ people: ZaloBridgePerson[]; complete: boolean }> {
  const body = await zaloGet<{ people?: ZaloBridgePerson[]; complete?: boolean }>(
    config.host,
    config.token,
    `/groups/${encodeURIComponent(config.groupId)}/members`,
  );
  return { people: body.people ?? [], complete: Boolean(body.complete) };
}

export function bridgeVotesToDays(votes: ZaloBridgeVote[], year: number): ZaloVoteDay[] {
  return (votes ?? [])
    .filter((vote) => vote.title && !vote.anonymous)
    .map((vote) => ({
      title: vote.title,
      dateId: dateIdFromVoteTitle(vote.title, year),
      names: vote.names ?? [],
      voterIds: vote.voterIds ?? [],
      anonymous: false,
    }));
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}

function normalizePoll(raw: Partial<ZaloPoll> | null | undefined): ZaloPoll | null {
  const question = String(raw?.question ?? '').trim();
  const id = String(raw?.id ?? question).trim();
  if (!id) return null;
  const options = (raw?.options ?? [])
    .map((option) => ({
      content: String(option?.content ?? '').trim(),
      names: textList(option?.names),
      voterIds: textList(option?.voterIds),
    }))
    .filter((option) => option.content);
  const days = (raw?.days ?? [])
    .map((day) => ({
      title: String(day?.title ?? '').trim(),
      names: textList(day?.names),
      voterIds: textList(day?.voterIds),
    }))
    .filter((day) => day.title);
  return {
    id,
    question: question || 'Phiếu',
    anonymous: Boolean(raw?.anonymous),
    options,
    days,
  };
}

export function pollsFromBoard(body: {
  polls?: Partial<ZaloPoll>[];
  votes?: ZaloBridgeVote[];
}): ZaloPoll[] {
  const polls = (body.polls ?? []).map((poll) => normalizePoll(poll)).filter((poll): poll is ZaloPoll => Boolean(poll));
  if (polls.length) return polls;
  return (body.votes ?? [])
    .filter((vote) => vote.title)
    .map((vote) =>
      normalizePoll({
        id: vote.title,
        question: vote.title,
        anonymous: Boolean(vote.anonymous),
        options: [{ content: vote.title, names: vote.names ?? [], voterIds: vote.voterIds ?? [] }],
        days: vote.anonymous ? [] : [{ title: vote.title, names: vote.names ?? [], voterIds: vote.voterIds ?? [] }],
      }),
    )
    .filter((poll): poll is ZaloPoll => Boolean(poll));
}

export async function fetchZaloBoard(config: ZaloConfig): Promise<{
  votes: ZaloBridgeVote[];
  polls: ZaloPoll[];
  people: ZaloBridgePerson[];
  complete: boolean;
}> {
  const body = await zaloGet<{
    votes?: ZaloBridgeVote[];
    polls?: Partial<ZaloPoll>[];
    people?: ZaloBridgePerson[];
    complete?: boolean;
  }>(config.host, config.token, `/groups/${encodeURIComponent(config.groupId)}/votes`);
  return {
    votes: body.votes ?? [],
    polls: pollsFromBoard(body),
    people: body.people ?? [],
    complete: Boolean(body.complete),
  };
}

export type CreatePollResult = {
  ok: boolean;
  pollId?: string;
  message?: string;
  error?: string;
};

async function zaloPost<T>(host: string, token: string, path: string, body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${normalizeHost(host)}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => null)) as T & { error?: string; needLogin?: boolean };
    if (response.status === 401) {
      if (result?.needLogin) throw new ZaloBridgeError('Cần quét QR trên Mac', 'needLogin');
      throw new ZaloBridgeError('Sai token', 'unauthorized');
    }
    if (!response.ok) {
      throw new ZaloBridgeError(result?.error || 'Mac không trả lời', 'bad');
    }
    return result;
  } catch (error) {
    if (error instanceof ZaloBridgeError) throw error;
    throw new ZaloBridgeError('Không tới được Mac', 'offline');
  } finally {
    clearTimeout(timer);
  }
}

export async function createZaloPoll(
  config: ZaloConfig,
  question: string,
  options: string[],
): Promise<CreatePollResult> {
  return zaloPost<CreatePollResult>(config.host, config.token, '/polls', {
    groupId: config.groupId,
    question,
    options,
  });
}

