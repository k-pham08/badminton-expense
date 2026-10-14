import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ZaloBar } from '../components/ZaloBar';
import { Card, PrimaryButton, SectionTitle } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { formatDateVi, monthLabel } from '../utils/date';
import type { ZaloBridgePerson, ZaloPoll } from '../utils/zaloBridge';
import type { Member, Session, ZaloContact } from '../types';
import { comparePollToMonth, type MonthVoteRow } from '../utils/zaloVoteDiff';
import { loadZalo, peopleForPoll, useZaloSyncState } from '../utils/zaloSync';

export function ZaloScreen({ monthId }: { monthId: string }) {
  const store = useStore();
  const sync = useZaloSyncState();
  const month = store.month(monthId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const members = store.data.members;
  const contacts = store.data.zaloContacts ?? [];
  const roster = zaloRoster(sync.people, contacts);

  useEffect(() => {
    void loadZalo(false);
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text style={styles.title}>Zalo</Text>
      <Card>
        <SectionTitle>Phiếu ghim</SectionTitle>
        <Text style={styles.hint}>
          Tải phiếu từ nhóm. Mỗi phiếu bên dưới có nút Áp dụng vào tháng. Bấm nút đó để xem chênh lệch, rồi mới quyết
          định ghi vào lịch. Tháng, thành viên và tiền không tự đổi.
        </Text>
        <Text style={styles.meta}>Đang xem {monthLabel(monthId)}. Đổi tháng ở tab Tháng.</Text>
        <ZaloBar />
      </Card>

      {sync.phase === 'ok' && sync.polls.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nhóm chưa ghim phiếu nào.</Text>
        </Card>
      ) : null}

      {sync.polls.map((poll) => {
        const open = openId === poll.id;
        const canApply = !poll.anonymous && poll.days.length > 0;
        return (
          <Card key={poll.id}>
            <Pressable
              onPress={() => {
                setOpenId(open ? null : poll.id);
                if (open && reviewId === poll.id) setReviewId(null);
              }}
            >
              <Text style={styles.pollTitle}>{poll.question}</Text>
              <Text style={styles.meta}>{pollSummary(poll)}</Text>
            </Pressable>
            {canApply ? (
              <View style={styles.applyBtn}>
                <PrimaryButton
                  label={`Áp dụng vào ${monthLabel(monthId)}`}
                  onPress={() => {
                    setOpenId(poll.id);
                    setReviewId(poll.id);
                  }}
                />
              </View>
            ) : null}
            {open ? (
              <PollBody
                poll={poll}
                people={sync.people}
                members={members}
                contacts={contacts}
                monthId={monthId}
                playingDates={month.playingDates}
                sessionOn={(date) => month.sessions[date]}
                reviewing={reviewId === poll.id}
                onCloseReview={() => setReviewId(null)}
                onCreate={(person) => store.ensureZaloMember(person)}
                onApply={(days, summary) => {
                  store.applyLinkedZaloVote(monthId, days);
                  setReviewId(null);
                  Alert.alert('Đã áp dụng phiếu', `${monthLabel(monthId)}\n${summary}`);
                }}
              />
            ) : null}
          </Card>
        );
      })}

      <Card>
        <SectionTitle>Gắn với thành viên</SectionTitle>
        <Text style={styles.hint}>
          Bấm một người Zalo, rồi bấm thành viên đang có trong app. Tên khác nhau vẫn gắn được.
        </Text>
        {pickedId ? (
          <Text style={styles.pickHint}>
            Đang chọn {roster.find((person) => person.id === pickedId)?.name}. Bấm một thành viên bên dưới người đó.
          </Text>
        ) : null}
        {roster.length === 0 ? (
          <Text style={styles.empty}>Tải phiếu ghim để thấy người trong phiếu.</Text>
        ) : (
          roster.map((person) => (
            <ZaloPersonRow
              key={person.id}
              person={person}
              member={linkedMember(person.id, members, contacts)}
              picked={pickedId === person.id}
              members={members}
              onPick={() => setPickedId((current) => (current === person.id ? null : person.id))}
              onLink={(memberId) => {
                store.linkZaloPerson(person, memberId);
                setPickedId(null);
              }}
              onUnlink={() => store.unlinkZaloContact(person.id)}
              onCreate={() => {
                store.ensureZaloMember(person);
                setPickedId(null);
              }}
            />
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function ZaloPersonRow({
  person,
  member,
  picked,
  members,
  onPick,
  onLink,
  onUnlink,
  onCreate,
}: {
  person: ZaloBridgePerson;
  member: Member | undefined;
  picked: boolean;
  members: Member[];
  onPick: () => void;
  onLink: (memberId: string) => void;
  onUnlink: () => void;
  onCreate: () => void;
}) {
  return (
    <View style={[styles.personBlock, picked && styles.personOn]}>
      <View style={styles.person}>
        {person.avatar ? (
          <Image source={{ uri: person.avatar.replace(/&amp;/g, '&') }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]} />
        )}
        <Pressable style={{ flex: 1 }} onPress={onPick}>
          <Text style={styles.personName}>{person.name}</Text>
          <Text style={styles.meta}>{member ? `→ ${member.name}` : 'Chưa gắn'}</Text>
        </Pressable>
        {member ? (
          <Pressable onPress={onUnlink}>
            <Text style={styles.unlink}>Gỡ</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onCreate}>
            <Text style={styles.link}>Tạo</Text>
          </Pressable>
        )}
      </View>
      {picked ? (
        members.length === 0 ? (
          <Text style={styles.meta}>Chưa có thành viên. Thêm ở tab Thành viên.</Text>
        ) : (
          members.map((item) => (
            <Pressable key={item.id} onPress={() => onLink(item.id)} style={styles.memberChoice}>
              <Text style={styles.personName}>{item.name}</Text>
              <Text style={styles.meta}>{item.id === member?.id ? 'Đang gắn' : 'Bấm để gắn'}</Text>
            </Pressable>
          ))
        )
      ) : null}
    </View>
  );
}

function linkedMember(personId: string, members: Member[], contacts: ZaloContact[]): Member | undefined {
  const contact = contacts.find((item) => item.id === personId);
  return members.find((item) => item.id === contact?.memberId);
}

function zaloRoster(people: ZaloBridgePerson[], contacts: ZaloContact[]): ZaloBridgePerson[] {
  const map = new Map<string, ZaloBridgePerson>();
  for (const contact of contacts) {
    map.set(contact.id, { id: contact.id, name: contact.name, avatar: contact.avatar });
  }
  for (const person of people) map.set(person.id, person);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function PollBody({
  poll,
  people,
  members,
  contacts,
  monthId,
  playingDates,
  sessionOn,
  reviewing,
  onCloseReview,
  onCreate,
  onApply,
}: {
  poll: ZaloPoll;
  people: ZaloBridgePerson[];
  members: Member[];
  contacts: ZaloContact[];
  monthId: string;
  playingDates: string[];
  sessionOn: (date: string) => Session | undefined;
  reviewing: boolean;
  onCloseReview: () => void;
  onCreate: (person: ZaloBridgePerson) => void;
  onApply: (days: { date: string; memberIds: string[] }[], summary: string) => void;
}) {
  const voters = peopleForPoll(poll, people);
  const compare = comparePollToMonth(poll, monthId, playingDates, sessionOn, members, contacts);
  const label = monthLabel(monthId);

  const confirmApply = () => {
    if (!compare.applyDays.length) return;
    const summary = compare.applyDays
      .map((day) => {
        const row = compare.rows.find((item) => item.date === day.date);
        const bits = [
          row?.add.length ? `thêm ${row.add.join(', ')}` : '',
          row?.remove.length ? `bớt ${row.remove.join(', ')}` : '',
        ].filter(Boolean);
        return `${formatDateVi(day.date)}${bits.length ? ` · ${bits.join(', ')}` : ''}`;
      })
      .join('\n');
    onApply(compare.applyDays, summary);
  };

  return (
    <View style={styles.detail}>
      {reviewing && !poll.anonymous ? (
        <View style={styles.option}>
          <Text style={styles.optionTitle}>Chênh lệch với {label}</Text>
          <Text style={styles.meta}>
            Chỉ người đã gắn Zalo được thay theo phiếu. Người tạo bằng tay giữ nguyên.
          </Text>
          {compare.rows.length === 0 ? (
            <Text style={styles.meta}>
              {compare.matched
                ? 'Phiếu khớp với các ngày đã có trong tháng.'
                : 'Tháng này không có ngày tới để so với phiếu.'}
            </Text>
          ) : (
            compare.rows.map((row) => <DiffRow key={row.date} row={row} />)
          )}
          {compare.matched > 0 && compare.rows.length > 0 ? (
            <Text style={styles.meta}>{compare.matched} ngày khớp phiếu, không đổi.</Text>
          ) : null}
          {compare.past.length > 0 ? (
            <Text style={styles.meta}>
              Bỏ qua ngày đã qua: {compare.past.map((date) => formatDateVi(date)).join(', ')}
            </Text>
          ) : null}
          {compare.outside.length > 0 ? (
            <Text style={styles.meta}>
              Ngoài tháng này: {compare.outside.map((date) => formatDateVi(date)).join(', ')}
            </Text>
          ) : null}
          <View style={styles.reviewActions}>
            {compare.applyDays.length > 0 ? (
              <PrimaryButton label="Áp dụng phiếu vào tháng" onPress={confirmApply} />
            ) : (
              <Text style={styles.meta}>Không có gì để áp dụng.</Text>
            )}
            <Pressable onPress={onCloseReview}>
              <Text style={styles.link}>Không áp dụng</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {poll.options.map((option) => (
        <View key={option.content} style={styles.option}>
          <Text style={styles.optionTitle}>
            {option.content}
            {poll.anonymous ? '' : ` · ${option.names.length} người`}
          </Text>
          {option.names.length > 0 ? <Text style={styles.meta}>{option.names.join(', ')}</Text> : null}
        </View>
      ))}
      {voters.length > 0 ? (
        <View style={styles.people}>
          {voters.map((person) => {
            const contact = contacts.find((item) => item.id === person.id);
            const member = members.find((item) => item.id === contact?.memberId);
            return (
              <View key={person.id} style={styles.person}>
                {person.avatar ? (
                  <Image source={{ uri: person.avatar.replace(/&amp;/g, '&') }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text style={styles.meta}>{member ? `→ ${member.name}` : 'Chưa gắn'}</Text>
                </View>
                {member ? null : (
                  <Pressable onPress={() => onCreate(person)}>
                    <Text style={styles.link}>Tạo</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      {!reviewing && compare.datedCount === 0 ? (
        <Text style={styles.meta}>
          {poll.anonymous ? 'Phiếu ẩn danh, không đưa vào lịch.' : 'Phiếu này không có ngày đánh.'}
        </Text>
      ) : null}
    </View>
  );
}

function DiffRow({ row }: { row: MonthVoteRow }) {
  const result = !row.onCalendar
    ? 'Chưa có trên lịch tháng này, không thêm ngày.'
    : row.paid
      ? 'Giữ nguyên, buổi đã có tiền.'
      : row.changed
        ? `Sau: ${row.after.length ? row.after.join(', ') : 'chưa có ai'}`
        : 'Người đã gắn không đổi.';
  const addLabel = row.changed ? 'Thêm' : 'Phiếu thêm';
  const removeLabel = row.changed ? 'Bớt' : 'Phiếu bớt';
  return (
    <View style={styles.diffDay}>
      <Text style={styles.optionTitle}>{formatDateVi(row.date)}</Text>
      <Text style={styles.meta}>Trước: {row.before.length ? row.before.join(', ') : 'chưa có ai'}</Text>
      <Text style={styles.meta}>Phiếu đã gắn: {row.voteLinked.length ? row.voteLinked.join(', ') : 'không có'}</Text>
      {row.add.length > 0 ? <Text style={styles.addLine}>{addLabel}: {row.add.join(', ')}</Text> : null}
      {row.remove.length > 0 ? <Text style={styles.removeLine}>{removeLabel}: {row.remove.join(', ')}</Text> : null}
      {row.keepManual.length > 0 ? (
        <Text style={styles.meta}>Giữ người tạo tay: {row.keepManual.join(', ')}</Text>
      ) : null}
      {row.unlinked.length > 0 ? (
        <Text style={styles.meta}>Chưa gắn, không đưa vào: {row.unlinked.join(', ')}</Text>
      ) : null}
      <Text style={styles.meta}>{result}</Text>
    </View>
  );
}

function pollSummary(poll: ZaloPoll): string {
  if (poll.anonymous) return 'Ẩn danh';
  if (poll.days.length) return poll.days.map((day) => day.title).join(' · ');
  return 'Không có ngày';
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  pollTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  applyBtn: {
    marginTop: 10,
  },
  detail: {
    marginTop: 12,
    gap: 10,
  },
  option: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  people: {
    gap: 4,
  },
  personBlock: {
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  personOn: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  memberChoice: {
    marginLeft: 46,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pickHint: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  unlink: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.line,
  },
  avatarEmpty: {
    backgroundColor: colors.line,
  },
  personName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  link: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  diffDay: {
    marginTop: 8,
    gap: 2,
  },
  addLine: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: '700',
  },
  removeLine: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: '700',
  },
  reviewActions: {
    gap: 8,
    alignItems: 'flex-start',
  },
});
