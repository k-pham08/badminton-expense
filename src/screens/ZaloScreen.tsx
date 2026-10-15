import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ZaloBar } from '../components/ZaloBar';
import { Card, PrimaryButton, SectionTitle } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { formatDateVi, monthLabel } from '../utils/date';

function thisMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
import type { ZaloBridgePerson, ZaloPoll } from '../utils/zaloBridge';
import type { Member, ZaloContact } from '../types';
import { entriesForPoll, loadZalo, peopleForPoll, upcomingPollEntries, useZaloSyncState } from '../utils/zaloSync';

type Tab = 'dates' | 'members' | 'apply';

interface SelectedDate {
  date: string;
  title: string;
  people: string[]; // Zalo person IDs who voted for this date
}

export function ZaloScreen({ monthId: currentMonthId }: { monthId: string }) {
  const store = useStore();
  const sync = useZaloSyncState();

  const [tab, setTab] = useState<Tab>('dates');
  const [selectedDates, setSelectedDates] = useState<SelectedDate[]>([]);
  const [pickedPersonId, setPickedPersonId] = useState<string | null>(null);
  const [applyMonthId, setApplyMonthId] = useState(currentMonthId || thisMonthId());

  useEffect(() => {
    void loadZalo(false);
  }, []);

  // Extract all dates from all polls
  const allDates = useCallback((): SelectedDate[] => {
    const dateMap = new Map<string, SelectedDate>();
    const today = new Date();

    for (const poll of sync.polls) {
      if (poll.anonymous) continue;
      const entries = upcomingPollEntries(entriesForPoll(poll, today));
      for (const entry of entries) {
        const existing = dateMap.get(entry.date);
        const allPeople = [...(existing?.people ?? []), ...(entry.voterIds ?? [])];
        dateMap.set(entry.date, {
          date: entry.date,
          title: entry.title,
          people: [...new Set(allPeople)],
        });
      }
    }

    return [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [sync.polls]);

  const toggleDate = useCallback((date: string) => {
    setSelectedDates((prev) => {
      if (prev.some((d) => d.date === date)) {
        return prev.filter((d) => d.date !== date);
      }
      const newDate = allDates().find((d) => d.date === date);
      if (!newDate) return prev;
      return [...prev, newDate];
    });
  }, [allDates]);

  const toggleAllDates = useCallback((futureOnly = true) => {
    const dates = allDates();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (futureOnly) {
      const futureDates = dates.filter((d) => d.date >= todayStr);
      setSelectedDates(futureDates);
    } else {
      setSelectedDates(dates);
    }
  }, [allDates]);

  const clearDates = useCallback(() => {
    setSelectedDates([]);
  }, []);

  const handleApplyToMonth = useCallback(() => {
    if (selectedDates.length === 0) {
      Alert.alert('Chưa chọn ngày', 'Hãy chọn ít nhất một ngày để áp dụng.');
      return;
    }

    // Get linked members for each date
    const contacts = store.data.zaloContacts;

    let appliedCount = 0;
    let skippedCount = 0;

    for (const selDate of selectedDates) {
      // Get Zalo person IDs who voted for this date
      const zaloIds = selDate.people;

      // Convert to member IDs that are linked
      const memberIds: string[] = [];
      for (const zaloId of zaloIds) {
        const contact = contacts.find((c) => c.id === zaloId);
        if (contact?.memberId) {
          memberIds.push(contact.memberId);
        }
      }

      if (memberIds.length === 0) {
        skippedCount++;
        continue;
      }

      // Apply to month
      store.applySessionToMonth(applyMonthId, selDate.date, memberIds);
      appliedCount++;
    }

    const summary = `${appliedCount} ngày đã thêm${skippedCount > 0 ? `, ${skippedCount} ngày bỏ qua (chưa gắn thành viên)` : ''}`;
    Alert.alert('Đã áp dụng', summary);

    // Clear selected dates after applying
    setSelectedDates([]);
    setTab('dates');
  }, [selectedDates, applyMonthId, store, store.data.zaloContacts]);

  const people = sync.people;
  const contacts = store.data.zaloContacts;
  const members = store.data.members;

  // Get linked member for a Zalo person
  const linkedMember = useCallback((personId: string): Member | undefined => {
    const contact = contacts.find((c) => c.id === personId);
    return members.find((m) => m.id === contact?.memberId);
  }, [contacts, members]);

  // Handle link a Zalo person to a member
  const handleLinkToMember = useCallback((personId: string, memberId: string) => {
    store.linkZaloContact(personId, memberId);
    setPickedPersonId(null);
  }, [store]);

  // Handle create member from Zalo person
  const handleCreateMember = useCallback((person: ZaloBridgePerson) => {
    const newId = store.addMember(person.name);
    if (newId) {
      store.linkZaloContact(person.id, newId);
    }
    setPickedPersonId(null);
  }, [store]);

  // Get people from all polls (unique)
  const pollPeople = useCallback((): ZaloBridgePerson[] => {
    const idSet = new Set<string>();
    const result: ZaloBridgePerson[] = [];

    for (const poll of sync.polls) {
      const pollPeople = peopleForPoll(poll, people);
      for (const p of pollPeople) {
        if (!idSet.has(p.id)) {
          idSet.add(p.id);
          result.push(p);
        }
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [sync.polls, people]);

  const dates = allDates();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const futureDates = dates.filter((d) => d.date >= todayStr);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Zalo</Text>

      {/* Tab buttons */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === 'dates' && styles.tabActive]}
          onPress={() => setTab('dates')}
        >
          <Text style={[styles.tabText, tab === 'dates' && styles.tabTextActive]}>Ngày đánh</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'members' && styles.tabActive]}
          onPress={() => setTab('members')}
        >
          <Text style={[styles.tabText, tab === 'members' && styles.tabTextActive]}>Thành viên</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'apply' && styles.tabActive]}
          onPress={() => setTab('apply')}
        >
          <Text style={[styles.tabText, tab === 'apply' && styles.tabTextActive]}>Áp dụng</Text>
          {selectedDates.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{selectedDates.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ZaloBar />

      {/* Tab: Ngày đánh */}
      {tab === 'dates' && (
        <Card>
          <SectionTitle>Ngày từ phiếu Zalo</SectionTitle>
          <Text style={styles.hint}>
            Chọn ngày muốn thêm vào lịch. Chỉ hiện ngày trong tương lai từ các phiếu đã ghim.
          </Text>

          {sync.polls.length === 0 ? (
            <Text style={styles.empty}>Chưa tải được phiếu. Kiểm tra kết nối Zalo.</Text>
          ) : dates.length === 0 ? (
            <Text style={styles.empty}>Không có ngày nào trong các phiếu.</Text>
          ) : (
            <>
              <View style={styles.dateActions}>
                <Pressable onPress={() => toggleAllDates(true)}>
                  <Text style={styles.link}>Chọn tất cả (tương lai)</Text>
                </Pressable>
                <Text style={styles.separator}> · </Text>
                <Pressable onPress={() => toggleAllDates(false)}>
                  <Text style={styles.link}>Tất cả</Text>
                </Pressable>
                <Text style={styles.separator}> · </Text>
                <Pressable onPress={clearDates}>
                  <Text style={styles.link}>Bỏ chọn</Text>
                </Pressable>
              </View>

              {dates.map((item) => {
                const isSelected = selectedDates.some((d) => d.date === item.date);
                const isPast = item.date < todayStr;
                return (
                  <Pressable
                    key={item.date}
                    style={[styles.dateRow, isSelected && styles.dateRowSelected, isPast && styles.dateRowPast]}
                    onPress={() => !isPast && toggleDate(item.date)}
                    disabled={isPast}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={styles.dateInfo}>
                      <Text style={[styles.dateText, isPast && styles.dateTextPast]}>
                        {formatDateVi(item.date)}
                      </Text>
                      <Text style={styles.meta}>
                        {item.people.length} người trong phiếu
                        {isPast ? ' · Đã qua' : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.selectedCount}>
                Đã chọn: {selectedDates.length} / {futureDates.length} ngày tương lai
              </Text>
            </>
          )}
        </Card>
      )}

      {/* Tab: Thành viên */}
      {tab === 'members' && (
        <Card>
          <SectionTitle>Gắn người Zalo với thành viên</SectionTitle>
          <Text style={styles.hint}>
            Bấm một người Zalo, rồi bấm thành viên để gắn. Người đã gắn sẽ được thêm vào lịch khi áp dụng.
          </Text>

          {pickedPersonId ? (
            <View style={styles.pickedInfo}>
              <Text style={styles.pickedLabel}>
                Đang gắn: <Text style={styles.pickedName}>
                  {pollPeople().find((p) => p.id === pickedPersonId)?.name}
                </Text>
              </Text>
              <Pressable onPress={() => setPickedPersonId(null)}>
                <Text style={styles.cancelLink}>Hủy</Text>
              </Pressable>
            </View>
          ) : null}

          {pollPeople().length === 0 ? (
            <Text style={styles.empty}>Chưa có người trong phiếu.</Text>
          ) : (
            pollPeople().map((person) => {
              const member = linkedMember(person.id);
              const isPicked = pickedPersonId === person.id;

              return (
                <View key={person.id}>
                  <Pressable
                    style={[styles.personRow, isPicked && styles.personRowPicked]}
                    onPress={() => setPickedPersonId(isPicked ? null : person.id)}
                  >
                    {person.avatar ? (
                      <Image source={{ uri: person.avatar.replace(/&amp;/g, '&') }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]} />
                    )}
                    <View style={styles.personInfo}>
                      <Text style={styles.personName}>{person.name}</Text>
                      <Text style={styles.meta}>
                        {member ? `→ ${member.name}` : 'Chưa gắn'}
                      </Text>
                    </View>
                    {member && (
                      <Pressable
                        onPress={() => store.unlinkZaloContact(person.id)}
                        style={styles.unlinkBtn}
                      >
                        <Text style={styles.unlinkText}>Gỡ</Text>
                      </Pressable>
                    )}
                  </Pressable>

                  {isPicked && (
                    <View style={styles.memberList}>
                      {members.length === 0 ? (
                        <Text style={styles.hint}>Chưa có thành viên. Thêm ở tab Thành viên.</Text>
                      ) : (
                        members.map((m) => (
                          <Pressable
                            key={m.id}
                            style={styles.memberChoice}
                            onPress={() => handleLinkToMember(person.id, m.id)}
                          >
                            <Text style={styles.memberChoiceText}>{m.name}</Text>
                            {m.id === member?.id && (
                              <Text style={styles.linkedLabel}> (đã gắn)</Text>
                            )}
                          </Pressable>
                        ))
                      )}
                      <Pressable
                        style={styles.memberChoice}
                        onPress={() => handleCreateMember(person)}
                      >
                        <Text style={styles.createText}>+ Tạo thành viên mới</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>
      )}

      {/* Tab: Áp dụng */}
      {tab === 'apply' && (
        <>
          <Card>
            <SectionTitle>Áp dụng vào tháng</SectionTitle>

            <Text style={styles.label}>Chọn tháng:</Text>
            <View style={styles.monthInput}>
              <TextInput
                style={styles.textInput}
                value={applyMonthId}
                onChangeText={setApplyMonthId}
                placeholder="2025-10"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={styles.monthBtn}
                onPress={() => setApplyMonthId(thisMonthId())}
              >
                <Text style={styles.monthBtnText}>Tháng này</Text>
              </Pressable>
            </View>

            {selectedDates.length === 0 ? (
              <Text style={styles.empty}>
                Chưa chọn ngày nào. Quay lại tab "Ngày đánh" để chọn.
              </Text>
            ) : (
              <>
                <Text style={styles.label}>Ngày sẽ thêm:</Text>
                {selectedDates.map((d) => (
                  <Text key={d.date} style={styles.datePreview}>
                    • {formatDateVi(d.date)}
                  </Text>
                ))}

                <Text style={styles.hint}>
                  Mỗi ngày sẽ tạo một buổi đánh với những người đã gắn Zalo. Ngày đã có lịch sẽ được cập nhật.
                </Text>

                <PrimaryButton
                  label={`Áp dụng ${selectedDates.length} ngày vào ${monthLabel(applyMonthId)}`}
                  onPress={handleApplyToMonth}
                />
              </>
            )}
          </Card>

          {/* Quick actions */}
          <Card>
            <SectionTitle>Thao tác nhanh</SectionTitle>
            <View style={styles.quickActions}>
              <Pressable
                style={styles.quickBtn}
                onPress={() => {
                  setApplyMonthId(thisMonthId());
                  setTab('dates');
                }}
              >
                <Text style={styles.quickBtnText}>Chọn ngày</Text>
              </Pressable>
              <Pressable
                style={styles.quickBtn}
                onPress={() => setTab('members')}
              >
                <Text style={styles.quickBtnText}>Gắn thành viên</Text>
              </Pressable>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
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
    textAlign: 'center',
    paddingVertical: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 8,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  tabTextActive: {
    color: '#fff',
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Date selection
  dateActions: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  separator: {
    color: colors.muted,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  dateRowSelected: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  dateRowPast: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  dateInfo: {
    flex: 1,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dateTextPast: {
    color: colors.muted,
  },
  selectedCount: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Person / Member
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  personRowPicked: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  avatarEmpty: {
    backgroundColor: colors.line,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  unlinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unlinkText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  pickedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    padding: 10,
    borderRadius: radius.sm,
    marginBottom: 10,
  },
  pickedLabel: {
    fontSize: 14,
  },
  pickedName: {
    fontWeight: '700',
    color: colors.primary,
  },
  cancelLink: {
    color: colors.muted,
    fontSize: 14,
  },
  memberList: {
    marginLeft: 50,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  memberChoice: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  memberChoiceText: {
    fontSize: 15,
    color: colors.text,
  },
  linkedLabel: {
    color: colors.primary,
    fontSize: 13,
  },
  createText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },

  // Apply tab
  monthInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  monthBtn: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  monthBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  datePreview: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 8,
    marginVertical: 2,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
