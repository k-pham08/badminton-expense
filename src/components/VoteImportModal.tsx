import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { formatDateVi, monthLabel } from '../utils/date';
import type { Member } from '../types';
import { matchVoteNames, matchVoteText, namesMatch, parseZaloVoteDays, type ZaloVoteDay } from '../utils/vote';
import { PrimaryButton, SecondaryButton } from './ui';

type Props = {
  visible: boolean;
  monthId: string;
  onClose: () => void;
};

type DayRow = ZaloVoteDay & {
  matchedIds: string[];
  unknown: string[];
  pairs: { name: string; memberName: string | null }[];
  inMonth: boolean;
  inCalendar: boolean;
  hadPeople: boolean;
};

async function readClipboard(): Promise<string> {
  try {
    return (await Clipboard.getStringAsync()).trim();
  } catch {
    return '';
  }
}

export function VoteImportModal({ visible, monthId, onClose }: Props) {
  const store = useStore();
  const month = store.month(monthId);
  const members = store.data.members;
  const [voteText, setVoteText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);

  const year = Number(monthId.slice(0, 4));
  const days = useMemo(() => parseZaloVoteDays(voteText, year), [voteText, year]);

  const rows: DayRow[] = useMemo(
    () =>
      days.map((day) => {
        const { matched, unknown, pairs } = matchVoteNames(day.names, members);
        const inMonth = Boolean(day.dateId?.startsWith(`${monthId}-`));
        return {
          ...day,
          matchedIds: matched.map((member) => member.id),
          unknown,
          pairs: pairs.map((pair) => ({
            name: pair.name,
            memberName: pair.member?.name ?? null,
          })),
          inMonth,
          inCalendar: Boolean(day.dateId && month.playingDates.includes(day.dateId)),
          hadPeople: Boolean(day.dateId && (month.sessions[day.dateId]?.attendeeIds.length ?? 0) > 0),
        };
      }),
    [days, members, month.playingDates, month.sessions, monthId],
  );

  const monthRows = rows.filter((row) => row.inMonth && row.dateId);
  const otherRows = rows.filter((row) => !row.inMonth);
  const picked = monthRows.filter((row) => selected.has(row.dateId as string));
  const unknownNames = uniqueKeep(picked.flatMap((row) => row.unknown));
  const matchCount = picked.reduce((sum, row) => sum + row.matchedIds.length, 0);
  const overwrite = picked.filter((row) => row.hadPeople).length;
  const extraDays = picked.filter((row) => !row.inCalendar).length;

  const loadHtml = useCallback(
    (html: string) => {
      setVoteText(html);
      const parsed = parseZaloVoteDays(html, year);
      setSelected(
        new Set(
          parsed
            .map((day) => day.dateId)
            .filter((dateId): dateId is string => Boolean(dateId?.startsWith(`${monthId}-`))),
        ),
      );
      setOpenKey(null);
    },
    [monthId, year],
  );

  const paste = useCallback(async () => {
    const html = await readClipboard();
    loadHtml(html);
    if (!html) {
      Alert.alert('Clipboard trống', 'Copy outerHTML `.group-poll-detail-v3` trên Zalo Desktop trước.');
    }
  }, [loadHtml]);

  useEffect(() => {
    if (!visible) {
      setVoteText('');
      setSelected(new Set());
      setOpenKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const html = await readClipboard();
      if (!cancelled) loadHtml(html);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, loadHtml]);

  const toggle = (dateId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(dateId)) next.delete(dateId);
      else next.add(dateId);
      return next;
    });
  };

  const apply = (includeUnknown: boolean) => {
    const extras: { id: string; name: string }[] = [];
    if (includeUnknown) {
      for (const name of unknownNames) {
        const id = store.addMember(name);
        if (id) extras.push({ id, name });
      }
    }
    const entries = picked
      .map((row) => {
        const extraIds = extras
          .filter((item) => row.names.some((name) => namesMatch(name, item.name)))
          .map((item) => item.id);
        return {
          date: row.dateId as string,
          attendeeIds: [...new Set([...row.matchedIds, ...extraIds])],
        };
      })
      .filter((entry) => entry.attendeeIds.length > 0);
    if (!entries.length) {
      Alert.alert(
        'Chưa khớp tên',
        'Gắn tên Zalo ở tab Thành viên, hoặc thêm tên lạ khi áp dụng, rồi dán lại phiếu.',
      );
      return;
    }
    const count = store.applyMonthVote(monthId, entries);
    const people = entries.reduce((sum, entry) => sum + entry.attendeeIds.length, 0);
    onClose();
    Alert.alert('Đã gán vote', `${count} buổi trong ${monthLabel(monthId)}. ${people} lượt người.`);
  };

  const confirmApply = () => {
    if (!picked.length) {
      Alert.alert('Chưa chọn ngày', 'Bấm ngày thuộc tháng này để chọn.');
      return;
    }
    if (picked.every((row) => row.matchedIds.length === 0) && unknownNames.length === 0) {
      Alert.alert('Không thấy tên', 'Dán HTML cả phiếu `.group-poll-detail-v3`.');
      return;
    }
    const bits = [
      `${picked.length} buổi`,
      matchCount ? `khớp ${matchCount} lượt` : 'chưa khớp tên',
      extraDays ? `thêm ${extraDays} ngày lẻ` : '',
      overwrite ? `ghi đè ${overwrite} buổi đã có người` : '',
    ].filter(Boolean);
    if (unknownNames.length === 0) {
      Alert.alert(monthLabel(monthId), bits.join(' · '), [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Áp dụng', onPress: () => apply(false) },
      ]);
      return;
    }
    Alert.alert(
      bits.join(' · '),
      `Tên lạ: ${unknownNames.join(', ')}. Thêm vào thành viên rồi gán vào buổi?`,
      [
        { text: 'Bỏ qua tên lạ', onPress: () => apply(false) },
        { text: 'Thêm tên lạ', onPress: () => apply(true) },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Vote {monthLabel(monthId)}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Đóng</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.hint}>
            Zalo Desktop: copy outerHTML khối `.group-poll-detail-v3`, rồi dán. Không cần sửa HTML.
          </Text>
          <SecondaryButton label="Dán phiếu từ clipboard" onPress={() => void paste()} />
          {voteText ? (
            <Text style={days.length ? styles.status : styles.warn}>
              {days.length
                ? `Đã dán · ${days.length} ngày${monthRows.length ? ` · ${monthRows.length} ngày tháng này` : ''}`
                : 'Không thấy ngày vote. Cần HTML có `.detail-section-wrapper` từng ngày.'}
            </Text>
          ) : (
            <Text style={styles.status}>Chưa dán phiếu.</Text>
          )}

          {monthRows.length > 0 ? (
            <View style={styles.toolbar}>
              <Text style={styles.summary}>{monthRows.length} ngày tháng này</Text>
              <Pressable
                onPress={() =>
                  setSelected(
                    selected.size === monthRows.length
                      ? new Set()
                      : new Set(monthRows.map((row) => row.dateId as string)),
                  )
                }
              >
                <Text style={styles.link}>{selected.size === monthRows.length ? 'Bỏ chọn' : 'Chọn hết'}</Text>
              </Pressable>
            </View>
          ) : null}

          {monthRows.map((row) => {
            const dateId = row.dateId as string;
            const on = selected.has(dateId);
            const open = openKey === dateId;
            return (
              <View key={dateId} style={[styles.day, on && styles.dayOn]}>
                <View style={styles.dayHead}>
                  <Pressable
                    onPress={() => toggle(dateId)}
                    hitSlop={8}
                    style={[styles.checkbox, on && styles.checkboxOn]}
                  >
                    {on ? <Text style={styles.checkMark}>✓</Text> : null}
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => setOpenKey(open ? null : dateId)}>
                    <Text style={[styles.dayTitle, on && styles.dayTitleOn]}>
                      {formatDateVi(dateId)}
                      {` · ${row.names.length} người`}
                    </Text>
                    <Text style={styles.dayMeta}>
                      {row.matchedIds.length ? `khớp ${row.matchedIds.length}` : 'chưa khớp'}
                      {row.unknown.length ? ` · lạ ${row.unknown.length}` : ''}
                      {row.inCalendar ? '' : ' · thêm ngày lẻ'}
                      {row.hadPeople ? ' · đã có người' : ''}
                    </Text>
                  </Pressable>
                </View>
                {open ? (
                  <View style={styles.names}>
                    {row.pairs.map((pair) => (
                      <Text
                        key={pair.name}
                        style={pair.memberName ? styles.nameLine : styles.unknownLine}
                      >
                        {pair.memberName
                          ? pair.memberName === pair.name
                            ? pair.name
                            : `${pair.name} → ${pair.memberName}`
                          : `${pair.name} · lạ`}
                      </Text>
                    ))}
                    {!row.pairs.length ? (
                      <Text style={styles.nameLine}>Không đọc được tên ngày này.</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {otherRows.length > 0 ? (
            <Text style={styles.hint}>
              {otherRows.length} ngày tháng khác: {otherRows.map((row) => row.title || row.dateId).join(', ')}
            </Text>
          ) : null}
        </ScrollView>

        {monthRows.length > 0 ? (
          <View style={styles.footer}>
            {unknownNames.length > 0 ? (
              <Text style={styles.footerWarn} numberOfLines={2}>
                Tên lạ: {unknownNames.join(', ')}
              </Text>
            ) : null}
            <PrimaryButton
              label={`Áp dụng ${picked.length} buổi`}
              onPress={confirmApply}
              disabled={picked.length === 0}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

export function DayVoteModal({
  visible,
  date,
  members,
  onClose,
  onApply,
}: {
  visible: boolean;
  date: string;
  members: Member[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const store = useStore();
  const [voteText, setVoteText] = useState('');
  const [voteDayId, setVoteDayId] = useState<string | null>(null);
  const year = Number(date.slice(0, 4));
  const days = useMemo(() => parseZaloVoteDays(voteText, year), [voteText, year]);
  const autoId =
    days.find((day) => day.dateId === date)?.dateId ?? days[0]?.dateId ?? days[0]?.title ?? date;
  const pickId = voteDayId ?? autoId;
  const preview = matchVoteText(voteText, members, pickId, year);

  const loadHtml = (html: string) => {
    setVoteText(html);
    const parsed = parseZaloVoteDays(html, year);
    const match = parsed.find((day) => day.dateId === date);
    setVoteDayId(match?.dateId ?? parsed[0]?.dateId ?? parsed[0]?.title ?? null);
  };

  const paste = async () => {
    const html = await readClipboard();
    loadHtml(html);
    if (!html) {
      Alert.alert('Clipboard trống', 'Copy outerHTML phiếu vote trên Zalo Desktop trước.');
    }
  };

  useEffect(() => {
    if (!visible) {
      setVoteText('');
      setVoteDayId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const html = await readClipboard();
      if (!cancelled) loadHtml(html);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, date]);

  const confirm = () => {
    const { matched, unknown, title } = preview;
    if (matched.length === 0 && unknown.length === 0) {
      Alert.alert('Không thấy tên', 'Dán HTML từ Inspect phiếu vote Zalo.');
      return;
    }
    const applyMatched = (extraIds: string[] = []) => {
      onApply([...new Set([...matched.map((member) => member.id), ...extraIds])]);
      onClose();
    };
    const heading = title ? `${title} · ${matched.length} người` : `Khớp ${matched.length} người`;
    if (unknown.length === 0) {
      Alert.alert(heading, matched.map((member) => member.name).join(', '), [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Chọn vào buổi này', onPress: () => applyMatched() },
      ]);
      return;
    }
    Alert.alert(heading, `Chưa có trong app: ${unknown.join(', ')}. Thêm luôn vào buổi này?`, [
      { text: 'Bỏ qua tên lạ', onPress: () => applyMatched() },
      {
        text: 'Thêm tên lạ',
        onPress: () => {
          const extraIds = unknown
            .map((name) => store.addMember(name))
            .filter((id): id is string => Boolean(id));
          applyMatched(extraIds);
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Vote ngày này</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Đóng</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Copy outerHTML phiếu vote, rồi dán. Phiếu cả tháng: tab Tháng. Không cần sửa HTML.
          </Text>
          <SecondaryButton label="Dán phiếu từ clipboard" onPress={() => void paste()} />
          {voteText ? (
            <Text style={preview.names.length ? styles.status : styles.warn}>
              {preview.names.length
                ? `${preview.title ? `${preview.title} · ` : ''}${preview.names.length} tên${
                    preview.matched.length ? ` · khớp ${preview.matched.length}` : ''
                  }${preview.unknown.length ? ` · lạ ${preview.unknown.length}` : ''}`
                : 'Không thấy tên trong HTML.'}
            </Text>
          ) : (
            <Text style={styles.status}>Chưa dán phiếu.</Text>
          )}
          {days.length > 1
            ? days.map((day) => {
                const selected = day.dateId === pickId || day.title === pickId;
                return (
                  <Pressable
                    key={day.title}
                    onPress={() => setVoteDayId(day.dateId ?? day.title)}
                    style={[styles.day, selected && styles.dayOn]}
                  >
                    <Text style={[styles.dayTitle, selected && styles.dayTitleOn]}>
                      {day.title}
                      {day.dateId === date ? ' · buổi này' : ''}
                      {` · ${day.names.length} người`}
                    </Text>
                  </Pressable>
                );
              })
            : null}
        </ScrollView>
        {preview.names.length > 0 ? (
          <View style={styles.footer}>
            {preview.unknown.length > 0 ? (
              <Text style={styles.footerWarn} numberOfLines={2}>
                Tên lạ: {preview.unknown.join(', ')}
              </Text>
            ) : null}
            <PrimaryButton label="Chọn vào buổi này" onPress={confirm} />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function uniqueKeep(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  link: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  body: {
    padding: space.md,
    paddingBottom: 24,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  status: {
    marginTop: 10,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  warn: {
    marginTop: 10,
    marginBottom: 12,
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  day: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dayOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.primaryText,
    fontWeight: '800',
    fontSize: 14,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  dayTitleOn: {
    color: colors.primary,
  },
  dayMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  names: {
    marginTop: 8,
    marginLeft: 36,
    gap: 4,
  },
  nameLine: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  unknownLine: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    gap: 8,
  },
  footerWarn: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
});
