import type { Court, CourtSlot, CourtTime, ExtraShuttle, Member, MonthData, Session, SessionCourt } from '../types';
import { roundShare } from './money';
import { hoursBetween } from './time';

export function shuttleFee(count: number, price: number): number {
  return count * price;
}

export function extraShuttlesOf(session: Pick<Session, 'extraShuttles'>): ExtraShuttle[] {
  return session.extraShuttles ?? [];
}

export function extraShuttleFee(extras: ExtraShuttle[] | undefined): number {
  return (extras ?? []).reduce((sum, item) => sum + item.count * item.price, 0);
}

export function extraShuttleCount(extras: ExtraShuttle[] | undefined): number {
  return (extras ?? []).reduce((sum, item) => sum + item.count, 0);
}

export function courtsOf(session: Pick<Session, 'courts' | 'courtFee'>): SessionCourt[] {
  if (session.courts?.length) {
    return session.courts.map((item) => {
      const courtNumber = Math.max(1, Math.round(item.courtNumber || 1));
      return {
        ...item,
        courtNumber,
        slotId: item.slotId || `slot_${courtNumber}`,
        slotName: (item.slotName ?? '').trim() || `Sân ${courtNumber}`,
        startTime: item.startTime ?? '',
        endTime: item.endTime ?? '',
        hours: usageHours(item),
      };
    });
  }
  if (session.courtFee > 0) {
    return [
      {
        id: 'legacy',
        courtId: '',
        slotId: 'slot_1',
        name: 'Sân',
        slotName: 'Sân 1',
        pricePerHour: session.courtFee,
        courtNumber: 1,
        hours: 1,
        startTime: '',
        endTime: '',
      },
    ];
  }
  return [];
}

export function formatHours(n: number): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

export function usageHours(item: Pick<SessionCourt, 'hours' | 'startTime' | 'endTime'>): number {
  const computed = hoursBetween(item.startTime, item.endTime);
  if (computed > 0) return computed;
  return Math.max(0, item.hours || 0);
}

export function timesHours(times: Pick<CourtTime, 'startTime' | 'endTime'>[]): number {
  return times.reduce((sum, item) => sum + hoursBetween(item.startTime, item.endTime), 0);
}

export function groupUsagesBySlot(usages: SessionCourt[]): {
  key: string;
  name: string;
  items: SessionCourt[];
  hours: number;
  fee: number;
}[] {
  const order: string[] = [];
  const map = new Map<string, SessionCourt[]>();
  for (const item of usages) {
    const key = `${item.courtId || ''}:${item.slotId || item.id}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(item);
  }
  return order.map((key) => {
    const items = map.get(key) ?? [];
    const hours = items.reduce((sum, item) => sum + usageHours(item), 0);
    const fee = items.reduce((sum, item) => sum + usageHours(item) * item.pricePerHour, 0);
    return {
      key,
      name: items[0]?.slotName || (items[0] ? sessionCourtLabel(items[0]) : 'Sân'),
      items,
      hours,
      fee,
    };
  });
}

export function timesOf(slot: CourtSlot): CourtTime[] {
  return (slot.times ?? []).filter((item) => item.startTime && item.endTime);
}

export function slotsOf(court: Court): CourtSlot[] {
  if (court.slots?.length) {
    return court.slots.map((slot, index) => ({
      id: slot.id || `slot_${index + 1}`,
      name: slot.name.trim() || `Sân ${index + 1}`,
      times: timesOf(slot),
      pricePerHour: slot.pricePerHour,
    }));
  }
  const count = Math.max(1, Math.round(court.courtCount || 1));
  return Array.from({ length: count }, (_, index) => ({
    id: `slot_${index + 1}`,
    name: `Sân ${index + 1}`,
    times: [],
  }));
}

export function courtCountOf(court: Court): number {
  return slotsOf(court).length;
}

export function slotPricePerHour(court: Court, slot: Pick<CourtSlot, 'pricePerHour'>): number {
  return slot.pricePerHour && slot.pricePerHour > 0 ? slot.pricePerHour : court.pricePerHour;
}

export function courtNumberOf(item: Pick<SessionCourt, 'courtNumber'>): number {
  return Math.max(1, Math.round(item.courtNumber || 1));
}

export function sessionCourtLabel(item: SessionCourt): string {
  const venue = item.name.trim() || 'Sân';
  const slot = (item.slotName ?? '').trim();
  return slot ? `${venue} · ${slot}` : `${venue} · sân ${courtNumberOf(item)}`;
}

export function courtFeeFrom(usages: SessionCourt[]): number {
  return Math.round(usages.reduce((sum, item) => sum + usageHours(item) * item.pricePerHour, 0));
}

export function courtFeeOf(session: Pick<Session, 'courts' | 'courtFee'>): number {
  if (session.courts?.length) return courtFeeFrom(session.courts);
  return session.courtFee ?? 0;
}

export function sessionTotal(
  courtFee: number,
  shuttleCount: number,
  shuttlePrice: number,
  extras: ExtraShuttle[] = [],
): number {
  return courtFee + shuttleFee(shuttleCount, shuttlePrice) + extraShuttleFee(extras);
}

export function perPerson(total: number, people: number): number {
  if (people <= 0) return 0;
  return roundShare(total / people);
}

export function sessionPlayHours(
  usages: Pick<SessionCourt, 'hours' | 'startTime' | 'endTime'>[],
): number {
  return usages.reduce((sum, item) => sum + usageHours(item), 0);
}

export function hoursWeight(stored: number | undefined, fullHours: number): number {
  if (fullHours <= 0) return stored && stored > 0 ? stored : 1;
  if (stored != null && Number.isFinite(stored) && stored > 0) {
    return Math.min(fullHours, stored);
  }
  return fullHours;
}

export function splitAmountByHours(total: number, hours: number[]): number[] {
  const n = hours.length;
  if (n === 0) return [];
  const bill = Math.round(total);
  if (bill <= 0) return Array.from({ length: n }, () => 0);
  const totalHours = hours.reduce((sum, item) => sum + Math.max(0, item), 0);
  if (totalHours <= 0) {
    const even = roundShare(bill / n);
    return hours.map(() => even);
  }
  return hours.map((item) => roundShare((bill * Math.max(0, item)) / totalHours));
}

export function attendeeHoursOf(
  session: Pick<Session, 'attendeeIds' | 'attendeeHours'>,
): Record<string, number> {
  const stored = session.attendeeHours ?? {};
  const next: Record<string, number> = {};
  for (const id of session.attendeeIds) {
    const value = stored[id];
    if (value != null && Number.isFinite(value) && value > 0) next[id] = value;
  }
  return next;
}

export function paidIdsOf(session: Session): string[] {
  const paid = session.paidIds ?? [];
  return paid.filter((id) => session.attendeeIds.includes(id));
}

export function sessionSplit(session: Session, shuttlePrice: number) {
  const extras = extraShuttlesOf(session);
  const monthlyShuttle = shuttleFee(session.shuttleCount, shuttlePrice);
  const extra = extraShuttleFee(extras);
  const shuttle = monthlyShuttle + extra;
  const courtFee = courtFeeOf(session);
  const total = courtFee + shuttle;
  const ids = session.attendeeIds ?? [];
  const people = ids.length > 0 ? ids.length : Math.max(0, session.attendeeCount);
  const paidIds = paidIdsOf(session);
  const fullHours = sessionPlayHours(courtsOf(session));
  const stored = session.attendeeHours ?? {};
  const weights =
    ids.length > 0
      ? ids.map((id) => hoursWeight(stored[id], fullHours))
      : Array.from({ length: people }, () => hoursWeight(undefined, fullHours));
  const amounts = splitAmountByHours(total, weights);
  const byMemberId: Record<string, number> = {};
  const hoursByMemberId: Record<string, number> = {};
  ids.forEach((id, index) => {
    byMemberId[id] = amounts[index] ?? 0;
    hoursByMemberId[id] = weights[index] ?? 0;
  });
  const uneven = weights.some((item) => Math.abs(item - (weights[0] ?? 0)) > 0.001);
  const totalHours = weights.reduce((sum, item) => sum + item, 0);
  return {
    courtFee,
    monthlyShuttle,
    extra,
    shuttle,
    total,
    people,
    paidCount: paidIds.length,
    pieces: session.shuttleCount + extraShuttleCount(extras),
    perPerson: uneven ? 0 : perPerson(total, people),
    fullHours,
    totalHours,
    uneven,
    byMemberId,
    hoursByMemberId,
  };
}

export type MemberSummary = {
  member: Member;
  sessions: number;
  paidSessions: number;
  amount: number;
  paidAmount: number;
  remaining: number;
  allPaid: boolean;
};

export function monthTotals(month: MonthData) {
  let total = 0;
  let savedCount = 0;
  for (const date of month.playingDates) {
    const session = month.sessions[date];
    if (!session?.saved) continue;
    savedCount += 1;
    total += sessionSplit(session, month.shuttlePrice).total;
  }
  return { total, savedCount, sessionCount: month.playingDates.length };
}

export function memberSummaries(month: MonthData, members: Member[]): MemberSummary[] {
  return members
    .map((member) => {
      let sessions = 0;
      let paidSessions = 0;
      let amount = 0;
      let paidAmount = 0;
      for (const date of month.playingDates) {
        const session = month.sessions[date];
        if (!session?.saved) continue;
        if (!session.attendeeIds.includes(member.id)) continue;
        const split = sessionSplit(session, month.shuttlePrice);
        const share = split.byMemberId[member.id] ?? split.perPerson;
        sessions += 1;
        amount += share;
        if (paidIdsOf(session).includes(member.id)) {
          paidSessions += 1;
          paidAmount += share;
        }
      }
      const remaining = Math.max(0, amount - paidAmount);
      return {
        member,
        sessions,
        paidSessions,
        amount,
        paidAmount,
        remaining,
        allPaid: sessions > 0 && remaining === 0,
      };
    })
    .sort((a, b) => b.remaining - a.remaining || b.amount - a.amount || a.member.name.localeCompare(b.member.name, 'vi'));
}
