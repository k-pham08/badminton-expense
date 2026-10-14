import type { Member, Session, ZaloContact } from '../types';
import { sessionHasMoney } from '../store';
import { toDateId } from './date';
import { nearestDateId, type ZaloPollEntry } from './zaloSync';
import type { ZaloPoll } from './zaloBridge';

export type MonthVoteRow = {
  date: string;
  onCalendar: boolean;
  paid: boolean;
  before: string[];
  voteLinked: string[];
  add: string[];
  remove: string[];
  keepManual: string[];
  unlinked: string[];
  after: string[];
  memberIds: string[];
  changed: boolean;
};

export type MonthVoteCompare = {
  rows: MonthVoteRow[];
  applyDays: { date: string; memberIds: string[] }[];
  matched: number;
  past: string[];
  outside: string[];
  datedCount: number;
};

export function datedPollEntries(poll: ZaloPoll, today = new Date()): ZaloPollEntry[] {
  const byDate = new Map<string, ZaloPollEntry>();
  for (const day of poll.days) {
    const date = nearestDateId(day.title, today);
    if (!date) continue;
    const prev = byDate.get(date);
    if (!prev || day.names.length >= prev.names.length) byDate.set(date, { ...day, date });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function sameIds(left: string[], right: string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function namesOf(ids: string[], members: Member[]): string[] {
  const byId = new Map(members.map((member) => [member.id, member.name]));
  return ids.flatMap((id) => {
    const name = byId.get(id);
    return name ? [name] : [];
  });
}

function voteLinks(
  names: string[],
  voterIds: string[],
  members: Member[],
  contacts: ZaloContact[],
): { ids: string[]; names: string[]; unlinked: string[] } {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const ids: string[] = [];
  const linkedNames: string[] = [];
  const unlinked: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const memberId = voterIds[index] ? contactById.get(voterIds[index])?.memberId : undefined;
    const member = memberId ? memberById.get(memberId) : undefined;
    if (!member) {
      if (name) unlinked.push(name);
      continue;
    }
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    ids.push(member.id);
    linkedNames.push(member.name);
  }
  return { ids, names: linkedNames, unlinked };
}

export function comparePollToMonth(
  poll: ZaloPoll,
  monthId: string,
  playingDates: string[],
  sessionOn: (date: string) => Session | undefined,
  members: Member[],
  contacts: ZaloContact[],
  today = new Date(),
): MonthVoteCompare {
  const todayKey = toDateId(today);
  const playing = new Set(playingDates);
  const linked = new Set<string>();
  for (const contact of contacts) if (contact.memberId) linked.add(contact.memberId);
  const entries = datedPollEntries(poll, today);
  const past: string[] = [];
  const outside: string[] = [];
  const rows: MonthVoteRow[] = [];
  let matched = 0;

  for (const entry of entries) {
    if (!entry.date.startsWith(`${monthId}-`)) {
      if (entry.date >= todayKey) outside.push(entry.date);
      continue;
    }
    if (entry.date < todayKey) {
      past.push(entry.date);
      continue;
    }
    const onCalendar = playing.has(entry.date);
    const session = onCalendar ? sessionOn(entry.date) : undefined;
    const paid = sessionHasMoney(session);
    const current = onCalendar ? (session?.attendeeIds ?? []) : [];
    const manualIds = current.filter((id) => !linked.has(id));
    const vote = voteLinks(entry.names, entry.voterIds, members, contacts);
    const voteSet = new Set(vote.ids);
    const addIds = onCalendar ? vote.ids.filter((id) => !current.includes(id)) : [];
    const removeIds = onCalendar ? current.filter((id) => linked.has(id) && !voteSet.has(id)) : [];
    const nextIds = onCalendar && !paid ? [...new Set([...manualIds, ...vote.ids])] : current;
    const changed = onCalendar && !paid && !sameIds(nextIds, current);
    const discrepancy = !onCalendar || addIds.length > 0 || removeIds.length > 0 || vote.unlinked.length > 0;
    if (!discrepancy) {
      matched += 1;
      continue;
    }
    rows.push({
      date: entry.date,
      onCalendar,
      paid,
      before: namesOf(current, members),
      voteLinked: vote.names,
      add: namesOf(addIds, members),
      remove: namesOf(removeIds, members),
      keepManual: namesOf(manualIds, members),
      unlinked: vote.unlinked,
      after: namesOf(nextIds, members),
      memberIds: vote.ids,
      changed,
    });
  }

  return {
    rows,
    applyDays: rows.filter((row) => row.changed).map((row) => ({ date: row.date, memberIds: row.memberIds })),
    matched,
    past,
    outside,
    datedCount: entries.length,
  };
}
