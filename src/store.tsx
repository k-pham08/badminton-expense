import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { EMPTY_DATA, type AppData, type Court, type CourtSlot, type MonthData, type Session, type ZaloContact } from './types';
import { findMemberByName, matchVoteNames, zaloPersonId, type ZaloPerson } from './utils/vote';
import { computePlayingDates, datesForWeekdays, weekdayMon0FromDateId } from './utils/date';
import { hoursBetween } from './utils/time';
import { attendeeHoursOf, slotsOf } from './utils/calc';

const STORAGE_KEY = 'cau-long-data-v1';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyMonth(id: string): MonthData {
  return {
    id,
    shuttleName: '',
    shuttlePrice: 0,
    weekdays: [],
    skippedDates: [],
    extraDates: [],
    playingDates: [],
    sessions: {},
  };
}

function withPlayingDates(month: MonthData): MonthData {
  const playingDates = computePlayingDates(
    month.id,
    month.weekdays ?? [],
    month.skippedDates ?? [],
    month.extraDates ?? [],
  );
  const sessions: Record<string, Session> = {};
  for (const date of playingDates) {
    if (month.sessions[date]) sessions[date] = month.sessions[date];
  }
  return { ...month, playingDates, sessions };
}

type Store = {
  ready: boolean;
  data: AppData;
  month: (monthId: string) => MonthData;
  addMember: (name: string) => string | null;
  renameMember: (id: string, name: string) => void;
  addMemberZaloName: (id: string, zaloName: string) => void;
  removeMemberZaloName: (id: string, zaloName: string) => void;
  applyZaloLinks: (rows: { zaloName: string; memberId: string }[]) => void;
  importZaloPeople: (people: ZaloPerson[], options?: { complete?: boolean }) => number;
  syncVoteAttendees: (
    monthId: string,
    entries: { date: string; names: string[]; voterIds?: string[] }[],
    options?: { restoreSkipped?: boolean },
  ) => { applied: string[]; drifted: string[] };
  linkZaloContact: (contactId: string, memberId: string) => void;
  unlinkZaloContact: (contactId: string) => void;
  createMemberFromZalo: (contactId: string) => string | null;
  removeMember: (id: string) => void;
  addCourt: (name: string, pricePerHour: number, slotNames?: string[]) => Court | null;
  removeCourt: (id: string) => void;
  addCourtSlot: (courtId: string, name: string) => string | null;
  renameCourtSlot: (courtId: string, slotId: string, name: string) => void;
  setCourtSlotPrice: (courtId: string, slotId: string, pricePerHour: number) => void;
  removeCourtSlot: (courtId: string, slotId: string) => void;
  addCourtTime: (courtId: string, slotId: string, startTime: string, endTime: string) => string | null;
  removeCourtTime: (courtId: string, slotId: string, timeId: string) => void;
  setShuttleName: (monthId: string, name: string) => void;
  setShuttlePrice: (monthId: string, price: number) => void;
  setWeekdays: (monthId: string, weekdays: number[]) => void;
  addPlayingDate: (monthId: string, date: string) => void;
  removePlayingDate: (monthId: string, date: string) => void;
  saveSession: (monthId: string, session: Session) => void;
  setSessionAttendees: (monthId: string, date: string, attendeeIds: string[]) => void;
  applyMonthVote: (monthId: string, entries: { date: string; attendeeIds: string[] }[]) => number;
  applySessionToWeekday: (monthId: string, session: Session) => void;
  setSessionPaidIds: (monthId: string, date: string, paidIds: string[]) => void;
  setMemberMonthPaid: (monthId: string, memberId: string, paid: boolean) => void;
  importData: (next: AppData) => void;
  ensureZaloMember: (person: ZaloPerson) => void;
  linkZaloPerson: (person: ZaloPerson, memberId: string) => void;
  applyZaloPoll: (
    people: ZaloPerson[],
    create: { id?: string; name: string }[],
    entries: { date: string; names: string[]; voterIds?: string[] }[],
  ) => void;
  applyLinkedZaloVote: (monthId: string, days: { date: string; memberIds: string[] }[]) => void;
  applySessionToMonth: (monthId: string, date: string, attendeeIds: string[]) => void;
};

const StoreContext = createContext<Store | null>(null);

function withMonth(data: AppData, monthId: string, updater: (month: MonthData) => MonthData): AppData {
  const current = data.months[monthId] ?? emptyMonth(monthId);
  return {
    ...data,
    months: {
      ...data.months,
      [monthId]: updater(current),
    },
  };
}

function nameKey(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function avatarKey(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/\?.*$/, '').trim().toLowerCase();
}

function onlyOne(items: ZaloContact[] | undefined): ZaloContact | undefined {
  return items?.length === 1 ? items[0] : undefined;
}

export function sessionHasMoney(session: Session | undefined): boolean {
  if (!session) return false;
  if ((session.courtFee ?? 0) > 0) return true;
  if ((session.shuttleCount ?? 0) > 0) return true;
  if ((session.extraShuttles ?? []).some((item) => item.count > 0 || item.price > 0)) return true;
  if ((session.paidIds ?? []).length > 0) return true;
  if ((session.courts ?? []).length > 0) return true;
  return false;
}

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(left);
  return right.every((id) => ids.has(id));
}

function dataWithImportedPeople(prev: AppData, people: ZaloPerson[], complete: boolean): AppData {
  if (!people.length && !complete) return prev;
  const map = new Map<string, ZaloContact>();
  const byName = new Map<string, ZaloContact[]>();
  const byAvatar = new Map<string, ZaloContact[]>();
  for (const item of prev.zaloContacts ?? []) {
    const id = item.id || zaloPersonId(item.name, item.avatar);
    const contact = { ...item, id };
    map.set(id, contact);
    const named = nameKey(contact.name);
    if (named) byName.set(named, [...(byName.get(named) ?? []), contact]);
    const imaged = avatarKey(contact.avatar);
    if (imaged) byAvatar.set(imaged, [...(byAvatar.get(imaged) ?? []), contact]);
  }
  const consumed = new Set<string>();
  for (const person of people) {
    const id = person.id || zaloPersonId(person.name, person.avatar);
    let old = map.get(id);
    if (!old) {
      const found = onlyOne(byName.get(nameKey(person.name))) ?? onlyOne(byAvatar.get(avatarKey(person.avatar)));
      if (found && found.id !== id && !consumed.has(found.id)) {
        old = found;
        map.delete(found.id);
        consumed.add(found.id);
      }
    }
    const auto = old?.memberId || findMemberByName(prev.members, person.name)?.id;
    map.set(id, {
      id,
      name: person.name.trim(),
      avatar: person.avatar || old?.avatar || '',
      memberId: auto,
    });
  }
  if (complete) {
    const incoming = new Set(people.map((person) => person.id || zaloPersonId(person.name, person.avatar)));
    for (const [id, contact] of map) {
      if (!incoming.has(id) && !contact.memberId) map.delete(id);
    }
  }
  const zaloContacts = [...map.values()];
  const members = prev.members.map((member) => {
    const contact = zaloContacts.find((item) => item.memberId === member.id);
    if (!contact) return member;
    const zaloNames = (member.zaloNames ?? []).filter(
      (item) => item.trim().toLowerCase() !== contact.name.toLowerCase(),
    );
    const nextNames =
      member.name.trim().toLowerCase() === contact.name.toLowerCase() ? zaloNames : [...zaloNames, contact.name];
    return {
      ...member,
      zaloNames: nextNames,
      zaloAvatar: contact.avatar || member.zaloAvatar,
    };
  });
  return { ...prev, zaloContacts, members };
}

function dataWithLinkedContact(prev: AppData, contactId: string, memberId: string): AppData {
  if (!contactId || !memberId) return prev;
  const zaloContacts = (prev.zaloContacts ?? []).map((item) => {
    const id = item.id || zaloPersonId(item.name, item.avatar);
    if (id === contactId) return { ...item, id, memberId };
    if (item.memberId === memberId) return { ...item, id, memberId: undefined };
    return { ...item, id };
  });
  const contact = zaloContacts.find((item) => item.id === contactId);
  if (!contact) return prev;
  const key = contact.name.trim().toLowerCase();
  const members = prev.members.map((member) => {
    let zaloNames = (member.zaloNames ?? []).filter((item) => item.trim().toLowerCase() !== key);
    if (member.id !== memberId) {
      return {
        ...member,
        zaloNames,
        zaloAvatar: member.zaloAvatar === contact.avatar ? undefined : member.zaloAvatar,
      };
    }
    if (member.name.trim().toLowerCase() !== key) zaloNames = [...zaloNames, contact.name];
    return { ...member, zaloNames, zaloAvatar: contact.avatar || member.zaloAvatar };
  });
  return { ...prev, zaloContacts, members };
}

function dataWithCreatedZaloMember(prev: AppData, contactId: string): AppData {
  const contact = (prev.zaloContacts ?? []).find(
    (item) => (item.id || zaloPersonId(item.name, item.avatar)) === contactId,
  );
  if (!contact) return prev;
  const found = findMemberByName(prev.members, contact.name);
  const id = found?.id || newId('m');
  const members = found
    ? prev.members.map((member) =>
        member.id === id ? { ...member, zaloAvatar: contact.avatar || member.zaloAvatar } : member,
      )
    : [...prev.members, { id, name: contact.name, zaloAvatar: contact.avatar }];
  const zaloContacts = (prev.zaloContacts ?? []).map((item) => {
    const itemId = item.id || zaloPersonId(item.name, item.avatar);
    return itemId === contactId ? { ...item, id: itemId, memberId: id } : { ...item, id: itemId };
  });
  return { ...prev, members, zaloContacts };
}

function dataWithNamedMember(prev: AppData, name: string): AppData {
  const trimmed = name.trim();
  if (!trimmed || findMemberByName(prev.members, trimmed)) return prev;
  return { ...prev, members: [...prev.members, { id: newId('m'), name: trimmed }] };
}

function dataWithVoteDays(
  prev: AppData,
  monthId: string,
  entries: { date: string; names: string[]; voterIds?: string[] }[],
  restoreSkipped: boolean,
): { data: AppData; applied: string[]; drifted: string[] } {
  let applied: string[] = [];
  let drifted: string[] = [];
  const data = withMonth(prev, monthId, (month) => {
    const unique = new Map<string, string[]>();
    for (const entry of entries) {
      if (!entry.date.startsWith(`${monthId}-`) || entry.names.length === 0) continue;
      const { matched } = matchVoteNames(entry.names, prev.members, entry.voterIds, prev.zaloContacts);
      if (!matched.length) continue;
      const ids = matched.map((member) => member.id);
      const prevIds = unique.get(entry.date);
      if (!prevIds || ids.length >= prevIds.length) unique.set(entry.date, ids);
    }
    const skipped = new Set(month.skippedDates ?? []);
    let skippedDates = [...(month.skippedDates ?? [])];
    const generated = datesForWeekdays(monthId, month.weekdays ?? []);
    const extraDates = [...(month.extraDates ?? [])];
    const drift: string[] = [];
    const apply = new Map<string, string[]>();
    for (const [date, ids] of unique) {
      const session = month.sessions[date];
      if (sessionHasMoney(session)) {
        if (session && !sameIdSet(session.attendeeIds ?? [], ids)) drift.push(date);
        continue;
      }
      if (skipped.has(date)) {
        if (!restoreSkipped) continue;
        skippedDates = skippedDates.filter((item) => item !== date);
      }
      if (!generated.includes(date) && !extraDates.includes(date)) extraDates.push(date);
      apply.set(date, ids);
    }
    applied = [...apply.keys()];
    drifted = drift;
    if (
      !apply.size &&
      sameIdSet(extraDates, month.extraDates ?? []) &&
      sameIdSet(skippedDates, month.skippedDates ?? [])
    ) {
      return month;
    }
    const next = withPlayingDates({ ...month, extraDates, skippedDates });
    const sessions = { ...next.sessions };
    for (const [date, ids] of apply) {
      const existing = sessions[date];
      if (!existing) {
        sessions[date] = {
          date,
          courtFee: 0,
          courts: [],
          shuttleCount: 0,
          extraShuttles: [],
          attendeeIds: ids,
          attendeeCount: ids.length,
          attendeeHours: {},
          paidIds: [],
          saved: false,
        };
        continue;
      }
      sessions[date] = {
        ...existing,
        attendeeIds: ids,
        attendeeCount: ids.length,
        attendeeHours: attendeeHoursOf({ attendeeIds: ids, attendeeHours: existing.attendeeHours }),
        paidIds: (existing.paidIds ?? []).filter((id) => ids.includes(id)),
        saved: existing.saved,
      };
    }
    return { ...next, sessions };
  });
  return { data, applied, drifted };
}

function dataWithLinkedVote(
  prev: AppData,
  monthId: string,
  days: { date: string; memberIds: string[] }[],
): AppData {
  const linked = new Set<string>();
  for (const contact of prev.zaloContacts ?? []) if (contact.memberId) linked.add(contact.memberId);
  const known = new Set(prev.members.map((member) => member.id));
  return withMonth(prev, monthId, (month) => {
    const playing = new Set(
      computePlayingDates(month.id, month.weekdays ?? [], month.skippedDates ?? [], month.extraDates ?? []),
    );
    const sessions = { ...month.sessions };
    let changed = false;
    for (const day of days) {
      if (!playing.has(day.date)) continue;
      const existing = sessions[day.date];
      if (sessionHasMoney(existing)) continue;
      const current = existing?.attendeeIds ?? [];
      const manual = current.filter((id) => known.has(id) && !linked.has(id));
      const fromVote = day.memberIds.filter((id) => linked.has(id) && known.has(id));
      const ids = [...new Set([...manual, ...fromVote])];
      if (existing && sameIdSet(ids, current)) continue;
      if (!existing && ids.length === 0) continue;
      changed = true;
      if (!existing) {
        sessions[day.date] = {
          date: day.date,
          courtFee: 0,
          courts: [],
          shuttleCount: 0,
          extraShuttles: [],
          attendeeIds: ids,
          attendeeCount: ids.length,
          attendeeHours: {},
          paidIds: [],
          saved: false,
        };
        continue;
      }
      sessions[day.date] = {
        ...existing,
        attendeeIds: ids,
        attendeeCount: ids.length,
        attendeeHours: attendeeHoursOf({ attendeeIds: ids, attendeeHours: existing.attendeeHours }),
        paidIds: (existing.paidIds ?? []).filter((id) => ids.includes(id)),
        saved: existing.saved,
      };
    }
    if (!changed) return month;
    return { ...month, sessions };
  });
}

function sessionWithAttendees(
  date: string,
  attendeeIds: string[],
  existing: Session | undefined,
  previous: Session | undefined,
): Session {
  const ids = [...new Set(attendeeIds)];
  const source = existing ?? previous;
  if (source) {
    return {
      ...source,
      date,
      attendeeIds: ids,
      attendeeCount: ids.length,
      attendeeHours: attendeeHoursOf({ attendeeIds: ids, attendeeHours: source.attendeeHours }),
      paidIds: (existing?.paidIds ?? []).filter((id) => ids.includes(id)),
      saved: true,
      courts: (source.courts ?? []).map((item) => ({ ...item })),
      extraShuttles: (source.extraShuttles ?? []).map((item) => ({ ...item })),
    };
  }
  return {
    date,
    courtFee: 0,
    courts: [],
    shuttleCount: 0,
    extraShuttles: [],
    attendeeIds: ids,
    attendeeCount: ids.length,
    attendeeHours: {},
    paidIds: [],
    saved: true,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as AppData;
          if (parsed?.version === 1 && parsed.members && parsed.months) {
            setData({
              ...EMPTY_DATA,
              ...parsed,
              courts: parsed.courts ?? [],
              zaloContacts: parsed.zaloContacts ?? [],
            });
          }
        }
      } catch {
        // Keep empty data if storage is unreadable.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, ready]);

  const month = useCallback(
    (monthId: string): MonthData => {
      const stored = data.months[monthId];
      if (!stored) return emptyMonth(monthId);
      const weekdays = stored.weekdays ?? [];
      const extraDates =
        stored.extraDates ?? (weekdays.length ? [] : stored.playingDates ?? []);
      return withPlayingDates({
        ...emptyMonth(monthId),
        ...stored,
        shuttleName: stored.shuttleName ?? '',
        weekdays,
        skippedDates: stored.skippedDates ?? [],
        extraDates,
      });
    },
    [data.months],
  );

  const addMember = useCallback((name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    let id = '';
    setData((prev) => {
      const found = findMemberByName(prev.members, trimmed);
      if (found) {
        id = found.id;
        return prev;
      }
      id = newId('m');
      return { ...prev, members: [...prev.members, { id, name: trimmed }] };
    });
    return id || null;
  }, []);

  const renameMember = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      members: prev.members.map((member) => {
        if (member.id !== id) return member;
        const zaloNames = (member.zaloNames ?? []).filter(
          (item) => item.trim().toLowerCase() !== trimmed.toLowerCase(),
        );
        return { ...member, name: trimmed, zaloNames };
      }),
    }));
  }, []);

  const addMemberZaloName = useCallback((id: string, zaloName: string) => {
    const trimmed = zaloName.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      members: prev.members.map((member) => {
        const zaloNames = (member.zaloNames ?? []).filter(
          (item) => item.trim().toLowerCase() !== trimmed.toLowerCase(),
        );
        if (member.id !== id) return { ...member, zaloNames };
        if (member.name.trim().toLowerCase() === trimmed.toLowerCase()) {
          return { ...member, zaloNames };
        }
        return { ...member, zaloNames: [...zaloNames, trimmed] };
      }),
    }));
  }, []);

  const applyZaloLinks = useCallback((rows: { zaloName: string; memberId: string }[]) => {
    setData((prev) => {
      let members = [...prev.members];
      for (const row of rows) {
        const zaloName = row.zaloName.trim();
        if (!zaloName) continue;
        let targetId = row.memberId;
        if (!targetId) {
          const existing = findMemberByName(members, zaloName);
          if (existing) {
            targetId = existing.id;
          } else {
            targetId = newId('m');
            members = [...members, { id: targetId, name: zaloName }];
          }
        }
        members = members.map((member) => {
          const zaloNames = (member.zaloNames ?? []).filter(
            (item) => item.trim().toLowerCase() !== zaloName.toLowerCase(),
          );
          if (member.id !== targetId) return { ...member, zaloNames };
          if (member.name.trim().toLowerCase() === zaloName.toLowerCase()) {
            return { ...member, zaloNames };
          }
          return { ...member, zaloNames: [...zaloNames, zaloName] };
        });
      }
      return { ...prev, members };
    });
  }, []);

  const importZaloPeople = useCallback((people: ZaloPerson[], options?: { complete?: boolean }): number => {
    if (!people.length && !options?.complete) return 0;
    setData((prev) => {
      const map = new Map<string, ZaloContact>();
      const byName = new Map<string, ZaloContact[]>();
      const byAvatar = new Map<string, ZaloContact[]>();
      for (const item of prev.zaloContacts ?? []) {
        const id = item.id || zaloPersonId(item.name, item.avatar);
        const contact = { ...item, id };
        map.set(id, contact);
        const named = nameKey(contact.name);
        if (named) byName.set(named, [...(byName.get(named) ?? []), contact]);
        const imaged = avatarKey(contact.avatar);
        if (imaged) byAvatar.set(imaged, [...(byAvatar.get(imaged) ?? []), contact]);
      }
      const consumed = new Set<string>();
      for (const person of people) {
        const id = person.id || zaloPersonId(person.name, person.avatar);
        let old = map.get(id);
        if (!old) {
          const found = onlyOne(byName.get(nameKey(person.name))) ?? onlyOne(byAvatar.get(avatarKey(person.avatar)));
          if (found && found.id !== id && !consumed.has(found.id)) {
            old = found;
            map.delete(found.id);
            consumed.add(found.id);
          }
        }
        const auto = old?.memberId || findMemberByName(prev.members, person.name)?.id;
        map.set(id, {
          id,
          name: person.name.trim(),
          avatar: person.avatar || old?.avatar || '',
          memberId: auto,
        });
      }
      if (options?.complete) {
        const incoming = new Set(people.map((person) => person.id || zaloPersonId(person.name, person.avatar)));
        for (const [id, contact] of map) {
          if (!incoming.has(id) && !contact.memberId) map.delete(id);
        }
      }
      const zaloContacts = [...map.values()];
      const members = prev.members.map((member) => {
        const contact = zaloContacts.find((item) => item.memberId === member.id);
        if (!contact) return member;
        const zaloNames = (member.zaloNames ?? []).filter(
          (item) => item.trim().toLowerCase() !== contact.name.toLowerCase(),
        );
        const nextNames =
          member.name.trim().toLowerCase() === contact.name.toLowerCase()
            ? zaloNames
            : [...zaloNames, contact.name];
        return {
          ...member,
          zaloNames: nextNames,
          zaloAvatar: contact.avatar || member.zaloAvatar,
        };
      });
      return { ...prev, zaloContacts, members };
    });
    return people.length;
  }, []);

  const linkZaloContact = useCallback((contactId: string, memberId: string) => {
    if (!contactId || !memberId) return;
    setData((prev) => dataWithLinkedContact(prev, contactId, memberId));
  }, []);

  const linkZaloPerson = useCallback((person: ZaloPerson, memberId: string) => {
    if (!person.id || !memberId) return;
    setData((prev) => dataWithLinkedContact(dataWithImportedPeople(prev, [person], false), person.id, memberId));
  }, []);

  const unlinkZaloContact = useCallback((contactId: string) => {
    setData((prev) => {
      const contact = (prev.zaloContacts ?? []).find(
        (item) => (item.id || zaloPersonId(item.name, item.avatar)) === contactId,
      );
      const key = contact?.name.trim().toLowerCase();
      const zaloContacts = (prev.zaloContacts ?? []).map((item) => {
        const id = item.id || zaloPersonId(item.name, item.avatar);
        return id === contactId ? { ...item, id, memberId: undefined } : { ...item, id };
      });
      const members = prev.members.map((member) => ({
        ...member,
        zaloNames: key
          ? (member.zaloNames ?? []).filter((item) => item.trim().toLowerCase() !== key)
          : member.zaloNames,
      }));
      return { ...prev, zaloContacts, members };
    });
  }, []);

  const createMemberFromZalo = useCallback((contactId: string): string | null => {
    let id = '';
    setData((prev) => {
      const contact = (prev.zaloContacts ?? []).find(
        (item) => (item.id || zaloPersonId(item.name, item.avatar)) === contactId,
      );
      if (!contact) return prev;
      const found = findMemberByName(prev.members, contact.name);
      id = found?.id || newId('m');
      const members = found
        ? prev.members.map((member) =>
            member.id === id ? { ...member, zaloAvatar: contact.avatar || member.zaloAvatar } : member,
          )
        : [...prev.members, { id, name: contact.name, zaloAvatar: contact.avatar }];
      const zaloContacts = (prev.zaloContacts ?? []).map((item) => {
        const itemId = item.id || zaloPersonId(item.name, item.avatar);
        return itemId === contactId ? { ...item, id: itemId, memberId: id } : { ...item, id: itemId };
      });
      return { ...prev, members, zaloContacts };
    });
    return id || null;
  }, []);

  const removeMemberZaloName = useCallback((id: string, zaloName: string) => {
    const key = zaloName.trim().toLowerCase();
    setData((prev) => ({
      ...prev,
      members: prev.members.map((member) =>
        member.id === id
          ? {
              ...member,
              zaloNames: (member.zaloNames ?? []).filter((item) => item.trim().toLowerCase() !== key),
            }
          : member,
      ),
    }));
  }, []);

  const removeMember = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      members: prev.members.filter((member) => member.id !== id),
      zaloContacts: (prev.zaloContacts ?? []).map((item) =>
        item.memberId === id ? { ...item, memberId: undefined } : item,
      ),
      months: Object.fromEntries(
        Object.entries(prev.months).map(([monthId, monthData]) => {
          const nextSessions: Record<string, Session> = {};
          for (const [date, session] of Object.entries(monthData.sessions)) {
            const attendeeIds = session.attendeeIds.filter((attendeeId) => attendeeId !== id);
            const attendeeHours = { ...(session.attendeeHours ?? {}) };
            delete attendeeHours[id];
            nextSessions[date] = {
              ...session,
              extraShuttles: session.extraShuttles ?? [],
              courts: session.courts ?? [],
              attendeeIds,
              attendeeHours,
              paidIds: (session.paidIds ?? []).filter((paidId) => paidId !== id && attendeeIds.includes(paidId)),
            };
          }
          return [monthId, { ...monthData, sessions: nextSessions }];
        }),
      ),
    }));
  }, []);

  const addCourt = useCallback((name: string, pricePerHour: number, slotNames: string[] = []): Court | null => {
    const trimmed = name.trim();
    if (!trimmed || pricePerHour <= 0) return null;
    const names = slotNames.map((item) => item.trim()).filter(Boolean);
    const slots: CourtSlot[] = (names.length ? names : ['Sân 1']).map((slotName, index) => ({
      id: newId('s'),
      name: slotName || `Sân ${index + 1}`,
      times: [],
    }));
    let created: Court | null = null;
    setData((prev) => {
      const found = prev.courts.find((court) => court.name.toLowerCase() === trimmed.toLowerCase());
      if (found) {
        created = { ...found, pricePerHour, slots: slotsOf(found) };
        return {
          ...prev,
          courts: prev.courts.map((court) =>
            court.id === found.id ? { ...court, pricePerHour } : court,
          ),
        };
      }
      created = { id: newId('c'), name: trimmed, pricePerHour, slots };
      return { ...prev, courts: [...prev.courts, created] };
    });
    return created;
  }, []);

  const removeCourt = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      courts: prev.courts.filter((court) => court.id !== id),
    }));
  }, []);

  const addCourtSlot = useCallback((courtId: string, name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    let slotId = '';
    setData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) => {
        if (court.id !== courtId) return court;
        const slots = slotsOf(court);
        const exists = slots.find((slot) => slot.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) {
          slotId = exists.id;
          return { ...court, slots };
        }
        slotId = newId('s');
        return { ...court, slots: [...slots, { id: slotId, name: trimmed, times: [] }] };
      }),
    }));
    return slotId || null;
  }, []);

  const renameCourtSlot = useCallback((courtId: string, slotId: string, name: string) => {
    setData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) => {
        if (court.id !== courtId) return court;
        return {
          ...court,
          slots: slotsOf(court).map((slot) =>
            slot.id === slotId ? { ...slot, name } : slot,
          ),
        };
      }),
    }));
  }, []);

  const setCourtSlotPrice = useCallback((courtId: string, slotId: string, pricePerHour: number) => {
    setData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) => {
        if (court.id !== courtId) return court;
        return {
          ...court,
          slots: slotsOf(court).map((slot) =>
            slot.id === slotId
              ? { ...slot, pricePerHour: Math.max(0, pricePerHour) }
              : slot,
          ),
        };
      }),
    }));
  }, []);

  const removeCourtSlot = useCallback((courtId: string, slotId: string) => {
    setData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) => {
        if (court.id !== courtId) return court;
        const slots = slotsOf(court).filter((slot) => slot.id !== slotId);
        return {
          ...court,
          slots: slots.length ? slots : [{ id: newId('s'), name: 'Sân 1', times: [] }],
        };
      }),
    }));
  }, []);

  const addCourtTime = useCallback(
    (courtId: string, slotId: string, startTime: string, endTime: string): string | null => {
      if (!startTime || !endTime || hoursBetween(startTime, endTime) <= 0) return null;
      let timeId = '';
      setData((prev) => ({
        ...prev,
        courts: prev.courts.map((court) => {
          if (court.id !== courtId) return court;
          return {
            ...court,
            slots: slotsOf(court).map((slot) => {
              if (slot.id !== slotId) return slot;
              const exists = (slot.times ?? []).find(
                (item) => item.startTime === startTime && item.endTime === endTime,
              );
              if (exists) {
                timeId = exists.id;
                return slot;
              }
              timeId = newId('t');
              return {
                ...slot,
                times: [...(slot.times ?? []), { id: timeId, startTime, endTime }],
              };
            }),
          };
        }),
      }));
      return timeId || null;
    },
    [],
  );

  const removeCourtTime = useCallback((courtId: string, slotId: string, timeId: string) => {
    setData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) => {
        if (court.id !== courtId) return court;
        return {
          ...court,
          slots: slotsOf(court).map((slot) =>
            slot.id === slotId
              ? { ...slot, times: (slot.times ?? []).filter((item) => item.id !== timeId) }
              : slot,
          ),
        };
      }),
    }));
  }, []);

  const setShuttleName = useCallback((monthId: string, name: string) => {
    setData((prev) => withMonth(prev, monthId, (m) => ({ ...m, shuttleName: name })));
  }, []);

  const setShuttlePrice = useCallback((monthId: string, price: number) => {
    setData((prev) => withMonth(prev, monthId, (m) => ({ ...m, shuttlePrice: Math.max(0, price) })));
  }, []);

  const setWeekdays = useCallback((monthId: string, weekdays: number[]) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const unique = [...new Set(weekdays)].filter((day) => day >= 0 && day <= 6).sort();
        const generated = datesForWeekdays(monthId, unique);
        const skippedDates = (m.skippedDates ?? []).filter((date) => generated.includes(date));
        const extraDates = (m.extraDates ?? []).filter((date) => !generated.includes(date));
        return withPlayingDates({
          ...m,
          weekdays: unique,
          skippedDates,
          extraDates,
        });
      }),
    );
  }, []);

  const addPlayingDate = useCallback((monthId: string, date: string) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const generated = datesForWeekdays(monthId, m.weekdays ?? []);
        if (generated.includes(date)) {
          return withPlayingDates({
            ...m,
            skippedDates: (m.skippedDates ?? []).filter((item) => item !== date),
          });
        }
        if ((m.extraDates ?? []).includes(date) || m.playingDates.includes(date)) return m;
        return withPlayingDates({
          ...m,
          extraDates: [...(m.extraDates ?? []), date],
        });
      }),
    );
  }, []);

  const removePlayingDate = useCallback((monthId: string, date: string) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const generated = datesForWeekdays(monthId, m.weekdays ?? []);
        const sessions = { ...m.sessions };
        delete sessions[date];
        if (generated.includes(date)) {
          return withPlayingDates({
            ...m,
            skippedDates: [...new Set([...(m.skippedDates ?? []), date])],
            sessions,
          });
        }
        return withPlayingDates({
          ...m,
          extraDates: (m.extraDates ?? []).filter((item) => item !== date),
          sessions,
        });
      }),
    );
  }, []);

  const saveSession = useCallback((monthId: string, session: Session) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const generated = datesForWeekdays(monthId, m.weekdays ?? []);
        const extraDates =
          generated.includes(session.date) || (m.extraDates ?? []).includes(session.date)
            ? m.extraDates ?? []
            : [...(m.extraDates ?? []), session.date];
        const next = withPlayingDates({
          ...m,
          extraDates,
          skippedDates: (m.skippedDates ?? []).filter((item) => item !== session.date),
          sessions: {
            ...m.sessions,
            [session.date]: { ...session },
          },
        });
        const weekday = weekdayMon0FromDateId(session.date);
        const sessions = { ...next.sessions };
        for (const date of next.playingDates) {
          if (date === session.date) continue;
          if (weekdayMon0FromDateId(date) !== weekday) continue;
          if (sessions[date]) continue;
          sessions[date] = {
            ...session,
            date,
            paidIds: [],
            courts: (session.courts ?? []).map((item) => ({ ...item })),
            extraShuttles: (session.extraShuttles ?? []).map((item) => ({ ...item })),
            attendeeHours: { ...(session.attendeeHours ?? {}) },
          };
        }
        return { ...next, sessions };
      }),
    );
  }, []);

  const setSessionAttendees = useCallback((monthId: string, date: string, attendeeIds: string[]) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const generated = datesForWeekdays(monthId, m.weekdays ?? []);
        const extraDates =
          generated.includes(date) || (m.extraDates ?? []).includes(date)
            ? m.extraDates ?? []
            : [...(m.extraDates ?? []), date];
        const next = withPlayingDates({
          ...m,
          extraDates,
          skippedDates: (m.skippedDates ?? []).filter((item) => item !== date),
        });
        return {
          ...next,
          sessions: {
            ...next.sessions,
            [date]: sessionWithAttendees(date, attendeeIds, next.sessions[date], lastSavedSession(next, date)),
          },
        };
      }),
    );
  }, []);

  const syncVoteAttendees = useCallback(
    (
      monthId: string,
      entries: { date: string; names: string[]; voterIds?: string[] }[],
      options?: { restoreSkipped?: boolean },
    ): { applied: string[]; drifted: string[] } => {
      let applied: string[] = [];
      let drifted: string[] = [];
      setData((prev) => {
        const result = dataWithVoteDays(prev, monthId, entries, Boolean(options?.restoreSkipped));
        applied = result.applied;
        drifted = result.drifted;
        return result.data;
      });
      return { applied, drifted };
    },
    [],
  );

  const ensureZaloMember = useCallback((person: ZaloPerson) => {
    setData((prev) => {
      const imported = dataWithImportedPeople(prev, [person], false);
      const created = dataWithCreatedZaloMember(imported, person.id);
      return findMemberByName(created.members, person.name) ? created : dataWithNamedMember(created, person.name);
    });
  }, []);

  const applyZaloPoll = useCallback(
    (
      people: ZaloPerson[],
      create: { id?: string; name: string }[],
      entries: { date: string; names: string[]; voterIds?: string[] }[],
    ) => {
      setData((prev) => {
        let data = dataWithImportedPeople(prev, people, false);
        for (const item of create) {
          if (item.id) data = dataWithCreatedZaloMember(data, item.id);
          if (!findMemberByName(data.members, item.name)) data = dataWithNamedMember(data, item.name);
        }
        const byMonth = new Map<string, { date: string; names: string[]; voterIds?: string[] }[]>();
        for (const entry of entries) {
          const monthId = entry.date.slice(0, 7);
          const list = byMonth.get(monthId) ?? [];
          list.push(entry);
          byMonth.set(monthId, list);
        }
        for (const [monthId, list] of byMonth) {
          data = dataWithVoteDays(data, monthId, list, true).data;
        }
        return data;
      });
    },
    [],
  );

  const applyLinkedZaloVote = useCallback((monthId: string, days: { date: string; memberIds: string[] }[]) => {
    setData((prev) => dataWithLinkedVote(prev, monthId, days));
  }, []);

  const applyMonthVote = useCallback(
    (monthId: string, entries: { date: string; attendeeIds: string[] }[]): number => {
      const unique = new Map<string, string[]>();
      for (const entry of entries) {
        if (!entry.date.startsWith(`${monthId}-`)) continue;
        unique.set(entry.date, [...new Set(entry.attendeeIds)]);
      }
      const dates = [...unique.keys()].sort();
      if (!dates.length) return 0;
      setData((prev) =>
        withMonth(prev, monthId, (m) => {
          const generated = datesForWeekdays(monthId, m.weekdays ?? []);
          let extraDates = [...(m.extraDates ?? [])];
          let skippedDates = [...(m.skippedDates ?? [])];
          for (const date of dates) {
            skippedDates = skippedDates.filter((item) => item !== date);
            if (!generated.includes(date) && !extraDates.includes(date)) extraDates.push(date);
          }
          const next = withPlayingDates({ ...m, extraDates, skippedDates });
          const sessions = { ...next.sessions };
          for (const date of dates) {
            const monthNow = { ...next, sessions };
            sessions[date] = sessionWithAttendees(
              date,
              unique.get(date) ?? [],
              sessions[date],
              lastSavedSession(monthNow, date),
            );
          }
          return { ...next, sessions };
        }),
      );
      return dates.length;
    },
    [],
  );

  const applySessionToWeekday = useCallback((monthId: string, session: Session) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const weekday = weekdayMon0FromDateId(session.date);
        const sessions = { ...m.sessions, [session.date]: { ...session } };
        for (const date of m.playingDates) {
          if (weekdayMon0FromDateId(date) !== weekday) continue;
          sessions[date] = {
            ...session,
            date,
            paidIds: date === session.date ? session.paidIds : [],
            courts: (session.courts ?? []).map((item) => ({ ...item })),
            extraShuttles: (session.extraShuttles ?? []).map((item) => ({ ...item })),
            attendeeHours: { ...(session.attendeeHours ?? {}) },
          };
        }
        return { ...m, sessions };
      }),
    );
  }, []);

  const applySessionToMonth = useCallback((monthId: string, date: string, attendeeIds: string[]) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const existing = m.sessions[date];
        // Keep existing data if session has money, only update attendees
        const session: Session = existing
          ? {
              ...existing,
              attendeeIds,
              attendeeCount: attendeeIds.length,
            }
          : {
              date,
              courtFee: 0,
              courts: [],
              shuttleCount: 0,
              extraShuttles: [],
              attendeeIds,
              attendeeCount: attendeeIds.length,
              paidIds: [],
              saved: false,
            };

        // Add date to extraDates so it persists when month is reloaded
        const extraDates = (m.extraDates ?? []).includes(date)
          ? m.extraDates
          : [...(m.extraDates ?? []), date];

        return {
          ...m,
          sessions: { ...m.sessions, [date]: session },
          extraDates,
        };
      }),
    );
  }, []);

  const setSessionPaidIds = useCallback((monthId: string, date: string, paidIds: string[]) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const session = m.sessions[date];
        if (!session) return m;
        const allowed = new Set(session.attendeeIds);
        return {
          ...m,
          sessions: {
            ...m.sessions,
            [date]: {
              ...session,
              paidIds: paidIds.filter((id) => allowed.has(id)),
            },
          },
        };
      }),
    );
  }, []);

  const importData = useCallback((next: AppData) => {
    setData({
      version: 1,
      members: next.members ?? [],
      zaloContacts: next.zaloContacts ?? [],
      courts: next.courts ?? [],
      months: next.months ?? {},
    });
  }, []);

  const setMemberMonthPaid = useCallback((monthId: string, memberId: string, paid: boolean) => {
    setData((prev) =>
      withMonth(prev, monthId, (m) => {
        const sessions: Record<string, Session> = { ...m.sessions };
        for (const date of m.playingDates) {
          const session = sessions[date];
          if (!session?.saved || !session.attendeeIds.includes(memberId)) continue;
          const without = (session.paidIds ?? []).filter((id) => id !== memberId);
          sessions[date] = {
            ...session,
            paidIds: paid ? [...without, memberId] : without,
          };
        }
        return { ...m, sessions };
      }),
    );
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      data,
      month,
      addMember,
      renameMember,
      addMemberZaloName,
      removeMemberZaloName,
      applyZaloLinks,
      importZaloPeople,
      linkZaloContact,
      unlinkZaloContact,
      createMemberFromZalo,
      removeMember,
      addCourt,
      removeCourt,
      addCourtSlot,
      renameCourtSlot,
      setCourtSlotPrice,
      removeCourtSlot,
      addCourtTime,
      removeCourtTime,
      setShuttleName,
      setShuttlePrice,
      setWeekdays,
      addPlayingDate,
      removePlayingDate,
      saveSession,
      setSessionAttendees,
      applyMonthVote,
      syncVoteAttendees,
      applySessionToWeekday,
      applySessionToMonth,
      setSessionPaidIds,
      setMemberMonthPaid,
      importData,
      ensureZaloMember,
      linkZaloPerson,
      applyZaloPoll,
      applyLinkedZaloVote,
    }),
    [
      ready,
      data,
      month,
      addMember,
      renameMember,
      addMemberZaloName,
      removeMemberZaloName,
      applyZaloLinks,
      importZaloPeople,
      linkZaloContact,
      unlinkZaloContact,
      createMemberFromZalo,
      removeMember,
      addCourt,
      removeCourt,
      addCourtSlot,
      renameCourtSlot,
      setCourtSlotPrice,
      removeCourtSlot,
      addCourtTime,
      removeCourtTime,
      setShuttleName,
      setShuttlePrice,
      setWeekdays,
      addPlayingDate,
      removePlayingDate,
      saveSession,
      setSessionAttendees,
      applyMonthVote,
      syncVoteAttendees,
      applySessionToWeekday,
      applySessionToMonth,
      setSessionPaidIds,
      setMemberMonthPaid,
      importData,
      ensureZaloMember,
      linkZaloPerson,
      applyZaloPoll,
      applyLinkedZaloVote,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export function lastSavedSession(month: MonthData, beforeDate?: string): Session | undefined {
  const weekday = beforeDate ? weekdayMon0FromDateId(beforeDate) : null;
  const saved = month.playingDates
    .filter((date) => month.sessions[date]?.saved && (!beforeDate || date < beforeDate))
    .sort();
  const sameWeekday =
    weekday == null ? saved : saved.filter((date) => weekdayMon0FromDateId(date) === weekday);
  const last = (sameWeekday.length ? sameWeekday : saved).at(-1);
  return last ? month.sessions[last] : undefined;
}
