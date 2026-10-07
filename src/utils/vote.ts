import type { Member } from '../types';

const SKIP =
  /^(đi|ko đi|không đi|không|vang|vắng|có|ok|vote|bình chọn|binh chon|đã bình chọn|xem tất cả|xem thêm|thu gọn|kết bạn|phó nhóm|trưởng nhóm|admin|người|trái|sân)$/i;

function normalize(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripLine(value: string): string {
  return value
    .replace(/^\s*[-*•–—]+/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/\s+\(\d+\)\s*$/, '')
    .trim();
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = decodeEntities(value);
    const key = normalize(name);
    if (name.length < 2 || SKIP.test(name) || /^\d+$/.test(name) || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function parseVoteLines(raw: string): string[] {
  return uniqueNames(raw.split(/\r?\n/).map(stripLine));
}

export type ZaloPerson = {
  id: string;
  name: string;
  avatar: string;
};

export function zaloPersonId(name: string, avatar: string): string {
  const av = avatar.replace(/\?.*$/, '').split('/').filter(Boolean).slice(-2).join('_');
  const key = (av || normalize(name)).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48);
  return `z_${key || 'unknown'}`;
}

function avatarSrcFromTag(tag: string): string {
  const src = tag.match(/\bsrc="([^"]+)"/i)?.[1] ?? '';
  return decodeEntities(src);
}

function isAvatarImg(tag: string): boolean {
  const src = avatarSrcFromTag(tag);
  return /a-child/i.test(tag) || /ava-talk|zadn\.vn/i.test(src);
}

function uniquePeople(people: Omit<ZaloPerson, 'id'>[]): ZaloPerson[] {
  const seen = new Set<string>();
  const out: ZaloPerson[] = [];
  for (const person of people) {
    const name = decodeEntities(person.name);
    if (name.length < 2 || SKIP.test(name) || /^\d+$/.test(name)) continue;
    const id = zaloPersonId(name, person.avatar);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, avatar: person.avatar });
  }
  return out;
}

function peopleFromBlocks(raw: string, openTag: RegExp): ZaloPerson[] {
  const opens = [...raw.matchAll(openTag)];
  if (!opens.length) return [];
  const people: Omit<ZaloPerson, 'id'>[] = [];
  for (let index = 0; index < opens.length; index += 1) {
    const start = opens[index].index ?? 0;
    const end = index + 1 < opens.length ? (opens[index + 1].index ?? raw.length) : raw.length;
    const chunk = raw.slice(start, end);
    const title = chunk.match(/\btitle="([^"]+)"/)?.[1];
    const labeled = chunk.match(
      /<(?:span|div)[^>]*class="[^"]*\b(?:name|conv-item-title|member-name|font-semibold)[^"]*"[^>]*>([^<]+)/i,
    );
    const name = decodeEntities((title || labeled?.[1] || '').trim());
    const img = [...chunk.matchAll(/<img\b[^>]*>/gi)].map((item) => item[0]).find(isAvatarImg);
    const avatar = img ? avatarSrcFromTag(img) : '';
    if (name.length >= 2) people.push({ name, avatar });
  }
  return uniquePeople(people);
}

/** HTML thành viên nhóm Zalo: `.chat-box-member__info` + `title` + `img.a-child`. */
export function parseZaloPeople(raw: string): ZaloPerson[] {
  const members = peopleFromBlocks(
    raw,
    /<div[^>]*class="[^"]*chat-box-member__info(?!__)[^"]*"[^>]*>/gi,
  );
  if (members.length) return members;
  const voter = peopleFromBlocks(raw, /<div[^>]*class="[^"]*voter-section[^"]*"[^>]*>/gi);
  if (voter.length) return voter;
  const grouped = peopleFromBlocks(
    raw,
    /<div[^>]*class="[^"]*(?:member-item|conv-item|chat-item|group-mem|friend-item)[^"]*"[^>]*>/gi,
  );
  if (grouped.length) return grouped;

  const imgs = [...raw.matchAll(/<img\b[^>]*>/gi)]
    .map((item) => item[0])
    .filter(isAvatarImg)
    .map(avatarSrcFromTag);
  const names = [
    ...[...raw.matchAll(/<(?:span|div)[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([^<]+)/gi)].map((item) => item[1]),
    ...[...raw.matchAll(/<(?:span|div)[^>]*class="[^"]*conv-item-title[^"]*"[^>]*>([^<]+)/gi)].map((item) => item[1]),
  ]
    .map((item) => decodeEntities(item))
    .filter((item) => item.length >= 2 && !SKIP.test(item));
  if (imgs.length && names.length) {
    const count = Math.min(imgs.length, names.length);
    return uniquePeople(Array.from({ length: count }, (_, index) => ({ name: names[index], avatar: imgs[index] })));
  }
  return uniquePeople(names.map((name) => ({ name, avatar: '' })));
}

/** HTML copy từ Zalo Desktop Inspect: `.voter-section span.name` */
export function namesFromZaloHtml(raw: string): string[] {
  if (!/voter-section|title-section|class="name"/i.test(raw)) return [];
  const fromSpan = [...raw.matchAll(/<span\b[^>]*\bclass="[^"]*\bname\b[^"]*"[^>]*>([^<]*)<\/span>/gi)].map(
    (match) => match[1],
  );
  if (fromSpan.length) return uniqueNames(fromSpan);
  const fromTitle = [...raw.matchAll(/class="voter-section"[^>]*\btitle="([^"]+)"/gi)].map((match) => match[1]);
  return uniqueNames(fromTitle);
}

export function voteSectionTitle(raw: string): string | null {
  const match = raw.match(/class="title-section"[^>]*>([^<]+)/i);
  if (!match) return null;
  const title = decodeEntities(match[1]);
  return title || null;
}

export type ZaloVoteDay = {
  title: string;
  dateId: string | null;
  names: string[];
};

const TITLE_DATE =
  /(Chủ\s*nhật|Thứ\s*[2-7])\s+(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?(?:\s*\((\d+)\))?/i;

export function dateIdFromVoteTitle(title: string, yearHint: number): string | null {
  const match = TITLE_DATE.exec(title);
  if (!match) return null;
  const day = Number(match[2]);
  const month = Number(match[3]);
  let year = yearHint;
  if (match[4]) {
    year = Number(match[4]);
    if (year < 100) year += 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Mỗi `.detail-section-wrapper` là một ngày vote. */
export function parseZaloVoteDays(raw: string, yearHint: number): ZaloVoteDay[] {
  if (!/detail-section-wrapper|voter-section|title-section/i.test(raw)) return [];
  const chunks = /detail-section-wrapper/i.test(raw)
    ? raw.split(/<div[^>]*class="[^"]*detail-section-wrapper[^"]*"[^>]*>/i).slice(1)
    : [raw];
  const days: ZaloVoteDay[] = [];
  for (const chunk of chunks) {
    const title = voteSectionTitle(chunk) ?? '';
    const names = namesFromZaloHtml(chunk);
    if (!title && !names.length) continue;
    days.push({
      title: title || `${names.length} người`,
      dateId: title ? dateIdFromVoteTitle(title, yearHint) : null,
      names,
    });
  }
  return days;
}

export function voteNamesOf(member: Member): string[] {
  return uniqueNames([member.name, ...(member.zaloNames ?? [])]);
}

function tokensOf(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean);
}

/** Cụm từ ngắn nằm trọn, liền nhau trong cụm dài. "minh nhật" ⊂ "nguyễn minh nhật". Một tiếng ("nhật") không khớp. */
function hasContiguousTokens(hay: string[], needle: string[]): boolean {
  if (needle.length < 2 || needle.length > hay.length) return false;
  for (let index = 0; index <= hay.length - needle.length; index += 1) {
    if (needle.every((token, offset) => hay[index + offset] === token)) return true;
  }
  return false;
}

export function namesMatch(voteName: string, memberName: string): boolean {
  const vote = normalize(voteName);
  const member = normalize(memberName);
  if (!vote || !member) return false;
  if (vote === member) return true;
  const voteTokens = tokensOf(vote);
  const memberTokens = tokensOf(member);
  return hasContiguousTokens(memberTokens, voteTokens) || hasContiguousTokens(voteTokens, memberTokens);
}

export function memberMatchesName(member: Member, name: string): boolean {
  return voteNamesOf(member).some((item) => namesMatch(name, item));
}

export function pickMemberForVoteName(name: string, members: Member[]): Member | undefined {
  const hits = members.filter((member) => memberMatchesName(member, name));
  if (!hits.length) return undefined;
  const key = normalize(name);
  const exact = hits.filter((member) => voteNamesOf(member).some((item) => normalize(item) === key));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  return hits.length === 1 ? hits[0] : undefined;
}

export function matchVoteNames(
  names: string[],
  members: Member[],
): { matched: Member[]; unknown: string[]; pairs: { name: string; member: Member | null }[] } {
  const matched: Member[] = [];
  const unknown: string[] = [];
  const pairs: { name: string; member: Member | null }[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const member = pickMemberForVoteName(name, members) ?? null;
    pairs.push({ name, member });
    if (!member) {
      unknown.push(name);
      continue;
    }
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    matched.push(member);
  }
  return { matched, unknown, pairs };
}

export function findMemberByName(members: Member[], name: string): Member | undefined {
  const key = normalize(name);
  return members.find((member) => voteNamesOf(member).some((item) => normalize(item) === key));
}

export function suggestMember(zaloName: string, members: Member[]): Member | null {
  const exact = findMemberByName(members, zaloName);
  if (exact) return exact;
  const fuzzy = members.filter((member) => memberMatchesName(member, zaloName));
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
}

export function membersInVoteText(raw: string, members: Member[]): Member[] {
  const hay = normalize(raw);
  if (!hay) return [];
  return members.filter((member) =>
    voteNamesOf(member).some((item) => {
      const name = normalize(item);
      if (name.length < 2) return false;
      const pattern = new RegExp(`(?:^|[\\s,;:•\\-\\d.(])${escapeRegExp(name)}(?:$|[\\s,;:•)\\-])`);
      return pattern.test(hay);
    }),
  );
}

export function extractVoteNames(
  raw: string,
  yearHint = new Date().getFullYear(),
): { names: string[]; title: string | null; days: ZaloVoteDay[] } {
  const days = parseZaloVoteDays(raw, yearHint);
  if (days.length) {
    const names = uniqueNames(days.flatMap((day) => day.names));
    return {
      names,
      title: days.length > 1 ? `${days.length} ngày vote` : days[0]?.title ?? null,
      days,
    };
  }
  const htmlNames = namesFromZaloHtml(raw);
  const names = htmlNames.length ? htmlNames : parseVoteLines(raw);
  return { names, title: voteSectionTitle(raw), days: [] };
}

export function matchVoteText(
  raw: string,
  members: Member[],
  dateId?: string,
  yearHint = new Date().getFullYear(),
): {
  matched: Member[];
  unknown: string[];
  title: string | null;
  names: string[];
  days: ZaloVoteDay[];
  activeDay: ZaloVoteDay | null;
} {
  const year =
    dateId && /^\d{4}-/.test(dateId) ? Number(dateId.slice(0, 4)) : yearHint;
  const days = parseZaloVoteDays(raw, year);
  const activeDay =
    (dateId
      ? days.find((day) => day.dateId === dateId || day.title === dateId)
      : null) ?? (days.length === 1 ? days[0] : null);
  const names = activeDay
    ? activeDay.names
    : days.length
      ? uniqueNames(days.flatMap((day) => day.names))
      : namesFromZaloHtml(raw).length
        ? namesFromZaloHtml(raw)
        : parseVoteLines(raw);
  if (!names.length) {
    const matched = membersInVoteText(raw, members);
    return {
      matched,
      unknown: [],
      title: activeDay?.title ?? voteSectionTitle(raw),
      names: matched.map((item) => item.name),
      days,
      activeDay,
    };
  }
  const { matched, unknown } = matchVoteNames(names, members);
  return {
    matched,
    unknown,
    title: activeDay?.title ?? (days.length > 1 ? `${days.length} ngày vote` : voteSectionTitle(raw)),
    names,
    days,
    activeDay,
  };
}
