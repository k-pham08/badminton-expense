// Old format: "Thứ 3 10/11" or "Chủ nhật 10/11"
// New format: "T3 - 10/11" or "CN 10/11"
const DATE_TITLE =
  /(Chủ\s*nhật|Thứ\s*[2-7])\s+(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?(?:\s*\((\d+)\))?/i;

const DATE_TITLE_NEW =
  /(T[2-7]|CN)\s*[-–]\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/i;

const ATTENDANCE =
  /^(đi|ko đi|không đi|không|vang|vắng|có|ok)$/i;

const GOING = /^(đi|có|ok)$/i;

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDateTitle(value) {
  const trimmed = String(value ?? '').trim();
  return DATE_TITLE.test(trimmed) || DATE_TITLE_NEW.test(trimmed);
}

/** Extract date (DD/MM) from title using new format */
function extractDateFromNewFormat(title, yearHint) {
  const match = DATE_TITLE_NEW.exec(title);
  if (!match) return null;
  const day = Number(match[2]);
  const month = Number(match[3]);
  let year = yearHint;
  if (match[4]) {
    year = Number(match[4]);
    if (year < 100) year += 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** Extract date (DD/MM) from title */
function extractDateFromTitle(title, yearHint) {
  let match = DATE_TITLE.exec(title);
  if (match) {
    const day = Number(match[2]);
    const month = Number(match[3]);
    let year = yearHint;
    if (match[4]) {
      year = Number(match[4]);
      if (year < 100) year += 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
  // Try new format
  return extractDateFromNewFormat(title, yearHint);
}

export function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** Group member ids. `memVerList` looks like `uid_version`. */
export function memberIdsFromGroup(group) {
  const list =
    Array.isArray(group?.memVerList) && group.memVerList.length
      ? group.memVerList
      : Array.isArray(group?.memberIds)
        ? group.memberIds
        : [];
  const ids = [];
  let weird = false;
  for (const item of list) {
    if (typeof item !== 'string' && typeof item !== 'number') {
      weird = true;
      continue;
    }
    const id = String(item).split('_')[0].trim();
    if (id) ids.push(id);
  }
  return { ids: [...new Set(ids)], weird };
}

export function peopleFromProfiles(profiles) {
  const people = [];
  const seen = new Set();
  for (const [key, profile] of Object.entries(profiles ?? {})) {
    if (!profile || typeof profile !== 'object') continue;
    const id = String(profile.id || key).trim();
    const name = String(profile.displayName || profile.zaloName || '').trim();
    if (!id || name.length < 2 || seen.has(id)) continue;
    seen.add(id);
    people.push({
      id,
      name,
      avatar: String(profile.avatar || ''),
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return people;
}

function rowFromVoters(title, voterIds, nameById) {
  const names = [];
  const ids = [];
  for (const raw of voterIds ?? []) {
    const id = String(raw);
    const name = nameById.get(id);
    if (!name) continue;
    names.push(name);
    ids.push(id);
  }
  return { title: String(title ?? '').trim(), names, voterIds: ids, anonymous: false };
}

export function asPoll(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.options)) return value;
  if (value.data && Array.isArray(value.data.options)) return value.data;
  return null;
}

export function votesFromPoll(poll, nameById) {
  const parsed = asPoll(poll);
  if (!parsed) return [];
  if (parsed.is_anonymous) {
    return [
      {
        title: String(parsed.question ?? '').trim(),
        names: [],
        voterIds: [],
        anonymous: true,
      },
    ];
  }
  const options = parsed.options ?? [];
  const dated = options.filter((option) => isDateTitle(option?.content));
  if (dated.length) {
    return dated.map((option) => rowFromVoters(option.content, option.voters, nameById));
  }
  const question = String(parsed.question ?? '').trim();
  const attendanceOnly =
    options.length > 0 && options.every((option) => ATTENDANCE.test(normalizeText(option?.content)));
  if (isDateTitle(question) && attendanceOnly) {
    const going = options.find((option) => GOING.test(normalizeText(option?.content)));
    if (!going) return [];
    return [rowFromVoters(question, going.voters, nameById)];
  }
  return [];
}

function isMemberPoll(poll) {
  const parsed = asPoll(poll);
  if (!parsed || parsed.is_anonymous) return false;
  const options = parsed.options ?? [];
  if (options.some((option) => isDateTitle(option?.content))) return true;
  const question = String(parsed.question ?? '').trim();
  if (!isDateTitle(question) || options.length === 0) return false;
  return options.every((option) => ATTENDANCE.test(normalizeText(option?.content)));
}

export function voterIdsFromPolls(polls) {
  const ids = [];
  const seen = new Set();
  for (const poll of polls ?? []) {
    if (!isMemberPoll(poll)) continue;
    const parsed = asPoll(poll);
    for (const option of parsed.options ?? []) {
      for (const raw of option.voters ?? []) {
        const id = String(raw ?? '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

export function pollsForApp(polls, nameById) {
  const out = [];
  const seen = new Set();
  for (const poll of polls ?? []) {
    const parsed = asPoll(poll);
    if (!parsed) continue;
    const question = String(parsed.question ?? '').trim();
    const id = String(parsed.poll_id || question).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const anonymous = Boolean(parsed.is_anonymous);
    const options = (parsed.options ?? [])
      .map((option) => {
        const content = String(option?.content ?? '').trim();
        if (!content) return null;
        if (anonymous) return { content, names: [], voterIds: [] };
        const row = rowFromVoters(content, option?.voters, nameById);
        return { content, names: row.names, voterIds: row.voterIds };
      })
      .filter(Boolean);
    const days = votesFromPoll(parsed, nameById)
      .filter((row) => !row.anonymous && row.title)
      .map((row) => ({ title: row.title, names: row.names, voterIds: row.voterIds }));
    out.push({
      id,
      question: question || 'Phiếu',
      anonymous,
      options,
      days,
    });
  }
  return out;
}

export function votesFromPolls(polls, nameById) {
  const byTitle = new Map();
  for (const poll of polls ?? []) {
    for (const row of votesFromPoll(poll, nameById)) {
      const key = normalizeText(row.title);
      if (!key) continue;
      const prev = byTitle.get(key);
      if (!prev || row.names.length >= prev.names.length) byTitle.set(key, row);
    }
  }
  return [...byTitle.values()];
}
