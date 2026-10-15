import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ZaloBar } from '../components/ZaloBar';
import { Card, PrimaryButton, SectionTitle } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { daysInMonth, formatDateVi, monthLabel, parseMonthId, weekdayMon0FromDateId } from '../utils/date';
import { createZaloPoll, fetchZaloGroups, loadZaloConfig, saveZaloGroup, type ZaloGroup } from '../utils/zaloBridge';

function thisMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
import type { ZaloBridgePerson, ZaloPoll } from '../utils/zaloBridge';
import type { Member, ZaloContact } from '../types';
import type { ZaloPerson } from '../utils/vote';
import { entriesForPoll, loadZalo, peopleForPoll, useZaloSyncState } from '../utils/zaloSync';

type Tab = 'polls' | 'dates' | 'members' | 'apply' | 'create';

interface SelectedDate {
  date: string;
  title: string;
  people: string[]; // Zalo person IDs who voted for this date
}

export function ZaloScreen({ monthId: currentMonthId }: { monthId: string }) {
  const store = useStore();
  const sync = useZaloSyncState();

  const [tab, setTab] = useState<Tab>('polls');
  const [selectedPollIds, setSelectedPollIds] = useState<Set<string>>(new Set());
  const [selectedDates, setSelectedDates] = useState<SelectedDate[]>([]);
  const [pickedPersonId, setPickedPersonId] = useState<string | null>(null);
  const [applyMonthId, setApplyMonthId] = useState(currentMonthId || thisMonthId());
  
  // Create poll state
  const [createMonthId, setCreateMonthId] = useState(thisMonthId());
  const [createSelectedDates, setCreateSelectedDates] = useState<string[]>([]);
  const [createWeekdays, setCreateWeekdays] = useState<number[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [groups, setGroups] = useState<ZaloGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  useEffect(() => {
    void loadZalo(false);
  }, []);

  // Load groups for create poll
  const loadGroups = useCallback(async () => {
    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      return;
    }
    try {
      const groupList = await fetchZaloGroups(config.host, config.token);
      setGroups(groupList);
      if (groupList.length > 0 && !selectedGroupId) {
        setSelectedGroupId(config.groupId || groupList[0].id);
      }
      setShowGroupPicker(true);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không tải được nhóm');
    }
  }, [selectedGroupId]);

  // Toggle weekday selection for create poll
  const toggleCreateWeekday = useCallback((weekday: number) => {
    setCreateWeekdays((prev) => {
      if (prev.includes(weekday)) {
        return prev.filter((d) => d !== weekday);
      }
      return [...prev, weekday].sort();
    });
  }, []);

  // Select all weekdays in month
  const selectAllCreateWeekdays = useCallback(() => {
    setCreateWeekdays([0, 1, 2, 3, 4, 5, 6]);
  }, []);

  // Clear weekdays
  const clearCreateWeekdays = useCallback(() => {
    setCreateWeekdays([]);
  }, []);

  // Toggle date for create poll
  const toggleCreateDate = useCallback((date: string) => {
    setCreateSelectedDates((prev) => {
      if (prev.includes(date)) {
        return prev.filter((d) => d !== date);
      }
      return [...prev, date].sort();
    });
  }, []);

  // Select all dates in month
  const selectAllCreateDates = useCallback(() => {
    const { year, month } = parseMonthId(createMonthId);
    const total = daysInMonth(year, month);
    const allDates: string[] = [];
    for (let day = 1; day <= total; day++) {
      allDates.push(`${createMonthId}-${String(day).padStart(2, '0')}`);
    }
    setCreateSelectedDates(allDates);
  }, [createMonthId]);

  // Clear dates
  const clearCreateDates = useCallback(() => {
    setCreateSelectedDates([]);
  }, []);

  // Get dates based on selected weekdays
  const weekdayDates = useCallback((): string[] => {
    const { year, month } = parseMonthId(createMonthId);
    const total = daysInMonth(year, month);
    const allDates: string[] = [];
    for (let day = 1; day <= total; day++) {
      allDates.push(`${createMonthId}-${String(day).padStart(2, '0')}`);
    }
    return allDates.filter((date: string) => createWeekdays.includes(weekdayMon0FromDateId(date)));
  }, [createMonthId, createWeekdays]);

  // All selected dates (from weekdays + manual)
  const allCreateSelectedDates = useCallback((): string[] => {
    const wdDates = weekdayDates();
    const all = new Set([...wdDates, ...createSelectedDates]);
    return [...all].sort();
  }, [weekdayDates, createSelectedDates]);

  // Format date for Zalo poll (T3 - 10/11)
  const formatDateForPoll = useCallback((dateId: string): string => {
    const [y, m, d] = dateId.split('-').map(Number);
    const weekday = weekdayMon0FromDateId(dateId);
    const weekdayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${weekdayLabels[weekday]} - ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }, []);

  // Create poll
  const handleCreatePoll = useCallback(async () => {
    const dates = allCreateSelectedDates();
    if (dates.length < 2) {
      Alert.alert('Lỗi', 'Cần chọn ít nhất 2 ngày để tạo poll');
      return;
    }
    
    // Limit to 20 dates per poll (Zalo limit)
    const maxDates = 20;
    const limitedDates = dates.slice(0, maxDates);
    if (dates.length > maxDates) {
      Alert.alert('Giới hạn', `Zalo chỉ cho tối đa ${maxDates} ngày mỗi poll. Sẽ tạo poll với ${maxDates} ngày đầu tiên.`);
    }

    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      return;
    }

    const groupId = selectedGroupId || config.groupId;
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      await saveZaloGroup(groupId, group.name);
    }

    setCreateLoading(true);
    try {
      const options = limitedDates.map(formatDateForPoll);
      const result = await createZaloPoll(config, 'Đánh cầu lông', options);
      if (result.ok) {
        Alert.alert('Thành công', `Đã tạo poll với ${limitedDates.length} ngày`);
        // Reload polls
        await loadZalo(true);
        setTab('polls');
      } else {
        Alert.alert('Lỗi', result.error || 'Không tạo được poll');
      }
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không tạo được poll');
    } finally {
      setCreateLoading(false);
    }
  }, [allCreateSelectedDates, formatDateForPoll, selectedGroupId, groups]);

  // Extract dates from selected polls
  const allDates = useCallback((): SelectedDate[] => {
    const dateMap = new Map<string, SelectedDate>();

    // If no polls selected, return empty
    if (selectedPollIds.size === 0) return [];

    for (const poll of sync.polls) {
      if (poll.anonymous) continue;
      // Only include selected polls
      if (!selectedPollIds.has(poll.id)) continue;
      
      const entries = entriesForPoll(poll);
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
  }, [sync.polls, selectedPollIds]);

  // Toggle poll selection
  const togglePoll = useCallback((pollId: string) => {
    setSelectedPollIds((prev) => {
      const next = new Set(prev);
      if (next.has(pollId)) {
        next.delete(pollId);
      } else {
        next.add(pollId);
      }
      return next;
    });
    // Clear selected dates when polls change
    setSelectedDates([]);
  }, []);

  // Select all polls
  const selectAllPolls = useCallback(() => {
    setSelectedPollIds(new Set(sync.polls.filter(p => !p.anonymous).map(p => p.id)));
    setSelectedDates([]);
  }, [sync.polls]);

  // Clear poll selection
  const clearPolls = useCallback(() => {
    setSelectedPollIds(new Set());
    setSelectedDates([]);
  }, []);

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
  const handleLinkToMember = useCallback((person: ZaloBridgePerson, memberId: string) => {
    // First, ensure person exists in zaloContacts using importZaloPeople
    const zaloPerson: ZaloPerson = {
      id: person.id,
      name: person.name,
      avatar: person.avatar ?? '',
    };
    store.importZaloPeople([zaloPerson]);
    // Now link the contact to member
    store.linkZaloContact(person.id, memberId);
    setPickedPersonId(null);
  }, [store]);

  // Handle create member from Zalo person
  const handleCreateMember = useCallback((person: ZaloBridgePerson) => {
    // First, ensure person exists in zaloContacts
    const zaloPerson: ZaloPerson = {
      id: person.id,
      name: person.name,
      avatar: person.avatar ?? '',
    };
    store.importZaloPeople([zaloPerson]);
    // Then create member and link
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
          style={[styles.tab, tab === 'polls' && styles.tabActive]}
          onPress={() => setTab('polls')}
        >
          <Text style={[styles.tabText, tab === 'polls' && styles.tabTextActive]}>Phiếu</Text>
          {selectedPollIds.size > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{selectedPollIds.size}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'dates' && styles.tabActive]}
          onPress={() => setTab('dates')}
        >
          <Text style={[styles.tabText, tab === 'dates' && styles.tabTextActive]}>Ngày</Text>
          {selectedDates.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{selectedDates.length}</Text>
            </View>
          )}
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
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'create' && styles.tabActive]}
          onPress={() => setTab('create')}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>+Tạo</Text>
        </Pressable>
      </View>

      <ZaloBar />

      {/* Tab: Phiếu */}
      {tab === 'polls' && (
        <Card>
          <SectionTitle>Chọn phiếu ghim</SectionTitle>
          <Text style={styles.hint}>
            Bấm phiếu để chọn/bỏ chọn. Chỉ hiện ngày từ phiếu đã chọn.
          </Text>

          {sync.polls.length === 0 ? (
            <Text style={styles.empty}>
              Chưa tải được phiếu.{'\n'}
              Kết nối Zalo và tải lại.
            </Text>
          ) : (
            <>
              <View style={styles.dateActions}>
                <Pressable onPress={selectAllPolls}>
                  <Text style={styles.link}>Chọn tất cả</Text>
                </Pressable>
                <Text style={styles.separator}> · </Text>
                <Pressable onPress={clearPolls}>
                  <Text style={styles.link}>Bỏ chọn</Text>
                </Pressable>
              </View>

              {sync.polls.map((poll) => {
                const isSelected = selectedPollIds.has(poll.id);
                const entryCount = entriesForPoll(poll).length;
                return (
                  <Pressable
                    key={poll.id}
                    style={[styles.pollRow, isSelected && styles.pollRowSelected]}
                    onPress={() => togglePoll(poll.id)}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={styles.pollInfo}>
                      <Text style={styles.pollTitle}>{poll.question}</Text>
                      <Text style={styles.meta}>
                        {entryCount} ngày{poll.anonymous ? ' · Ẩn danh' : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              {selectedPollIds.size > 0 && (
                <Pressable
                  style={styles.nextBtn}
                  onPress={() => setTab('dates')}
                >
                  <Text style={styles.nextBtnText}>
                    Xem ngày ({selectedPollIds.size} phiếu) →
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </Card>
      )}

      {/* Tab: Ngày đánh */}
      {tab === 'dates' && (
        <Card>
          <SectionTitle>Chọn ngày</SectionTitle>
          <Text style={styles.hint}>
            Chọn ngày muốn thêm vào lịch. Chưa chọn phiếu?{' '}
            <Text style={styles.link} onPress={() => setTab('polls')}>Quay lại tab Phiếu</Text>
          </Text>

          {selectedPollIds.size === 0 ? (
            <Text style={styles.empty}>Chưa chọn phiếu nào.{'\n'}Bấm tab Phiếu để chọn.</Text>
          ) : dates.length === 0 ? (
            <Text style={styles.empty}>Không có ngày nào trong các phiếu đã chọn.</Text>
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
                            onPress={() => handleLinkToMember(person, m.id)}
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

      {/* Tab: Tạo poll */}
      {tab === 'create' && (
        <>
          <Card>
            <SectionTitle>Tạo poll mới</SectionTitle>
            <Text style={styles.hint}>
              Chọn tháng và các ngày đánh, sau đó tạo poll trong nhóm Zalo.
            </Text>

            {/* Month selector */}
            <Text style={styles.label}>Tháng:</Text>
            <View style={styles.monthPickerRow}>
              <Pressable
                style={styles.monthArrowBtn}
                onPress={() => {
                  const { year, month } = parseMonthId(createMonthId);
                  const newMonth = month === 1 ? 12 : month - 1;
                  const newYear = month === 1 ? year - 1 : year;
                  setCreateMonthId(`${newYear}-${String(newMonth).padStart(2, '0')}`);
                }}
              >
                <Text style={styles.monthArrowText}>◀</Text>
              </Pressable>
              <TextInput
                style={styles.monthInputField}
                value={createMonthId}
                onChangeText={setCreateMonthId}
                placeholder="2025-10"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={styles.monthArrowBtn}
                onPress={() => {
                  const { year, month } = parseMonthId(createMonthId);
                  const newMonth = month === 12 ? 1 : month + 1;
                  const newYear = month === 12 ? year + 1 : year;
                  setCreateMonthId(`${newYear}-${String(newMonth).padStart(2, '0')}`);
                }}
              >
                <Text style={styles.monthArrowText}>▶</Text>
              </Pressable>
              <Pressable
                style={styles.monthBtn}
                onPress={() => setCreateMonthId(thisMonthId())}
              >
                <Text style={styles.monthBtnText}>Tháng này</Text>
              </Pressable>
            </View>

            {/* Weekday selector */}
            <Text style={styles.label}>Chọn thứ (chọn tất cả = đánh mỗi tuần):</Text>
            <View style={styles.weekdayRow}>
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label, index) => (
                <Pressable
                  key={index}
                  style={[styles.weekdayBtn, createWeekdays.includes(index) && styles.weekdayBtnActive]}
                  onPress={() => toggleCreateWeekday(index)}
                >
                  <Text style={[styles.weekdayBtnText, createWeekdays.includes(index) && styles.weekdayBtnTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.dateActions}>
              <Pressable onPress={selectAllCreateWeekdays}>
                <Text style={styles.link}>Chọn tất cả</Text>
              </Pressable>
              <Text style={styles.separator}> · </Text>
              <Pressable onPress={clearCreateWeekdays}>
                <Text style={styles.link}>Bỏ chọn</Text>
              </Pressable>
            </View>

            {/* Extra dates */}
            <Text style={styles.label}>Ngày thêm (ngoài lịch hàng tuần):</Text>
            {(() => {
              const { year, month } = parseMonthId(createMonthId);
              const total = daysInMonth(year, month);
              const allDates: string[] = [];
              for (let day = 1; day <= total; day++) {
                allDates.push(`${createMonthId}-${String(day).padStart(2, '0')}`);
              }
              return (
                <View style={styles.datesGrid}>
                  {allDates.map((dateId) => {
                    const isFromWeekday = createWeekdays.includes(weekdayMon0FromDateId(dateId));
                    const isSelected = createSelectedDates.includes(dateId);
                    return (
                      <Pressable
                        key={dateId}
                        style={[
                          styles.dateCell,
                          isFromWeekday && styles.dateCellWeekday,
                          isSelected && styles.dateCellSelected,
                        ]}
                        onPress={() => toggleCreateDate(dateId)}
                      >
                        <Text style={[
                          styles.dateCellText,
                          isFromWeekday && styles.dateCellTextWeekday,
                          isSelected && styles.dateCellTextSelected,
                        ]}>
                          {dateId.split('-')[2]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })()}

            <View style={styles.dateActions}>
              <Pressable onPress={selectAllCreateDates}>
                <Text style={styles.link}>Chọn tất cả ngày</Text>
              </Pressable>
              <Text style={styles.separator}> · </Text>
              <Pressable onPress={clearCreateDates}>
                <Text style={styles.link}>Bỏ chọn</Text>
              </Pressable>
            </View>

            {/* Summary */}
            <View style={styles.pollSummary}>
              <Text style={styles.pollSummaryText}>
                {allCreateSelectedDates().length} ngày được chọn
              </Text>
              {allCreateSelectedDates().slice(0, 5).map((date) => (
                <Text key={date} style={styles.pollSummaryItem}>
                  • {formatDateForPoll(date)}
                </Text>
              ))}
              {allCreateSelectedDates().length > 5 && (
                <Text style={styles.pollSummaryMore}>
                  ... và {allCreateSelectedDates().length - 5} ngày khác
                </Text>
              )}
            </View>

            {/* Create button */}
            {createLoading ? (
              <View style={styles.busy}>
                <Text style={styles.busyText}>Đang tạo poll...</Text>
              </View>
            ) : (
              <PrimaryButton
                label={`Tạo poll với ${allCreateSelectedDates().length} ngày`}
                onPress={handleCreatePoll}
                disabled={allCreateSelectedDates().length < 2}
              />
            )}
          </Card>

          {/* Group selector */}
          <Card>
            <SectionTitle>Nhóm Zalo</SectionTitle>
            <Pressable style={styles.groupSelector} onPress={() => void loadGroups()}>
              <Text style={styles.groupSelectorText}>
                {groups.find((g) => g.id === selectedGroupId)?.name || 'Chọn nhóm...'}
              </Text>
              <Text style={styles.groupSelectorIcon}>▼</Text>
            </Pressable>
          </Card>

          {/* Group picker modal */}
          <Modal visible={showGroupPicker} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Chọn nhóm Zalo</Text>
                <ScrollView style={styles.groupList}>
                  {groups.map((group) => (
                    <Pressable
                      key={group.id}
                      style={[styles.groupItem, group.id === selectedGroupId && styles.groupItemSelected]}
                      onPress={() => {
                        setSelectedGroupId(group.id);
                        setShowGroupPicker(false);
                      }}
                    >
                      <Text style={styles.groupItemName}>{group.name}</Text>
                      <Text style={styles.groupItemMembers}>{group.totalMember} thành viên</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <PrimaryButton label="Đóng" onPress={() => setShowGroupPicker(false)} />
              </View>
            </View>
          </Modal>
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

  // Poll selection
  pollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pollRowSelected: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  pollInfo: {
    flex: 1,
  },
  pollTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  nextBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
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

  // Create poll tab
  monthPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  monthArrowBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  monthArrowText: {
    fontSize: 16,
    color: colors.primary,
  },
  monthInputField: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    marginHorizontal: 2,
  },
  weekdayBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  weekdayBtnTextActive: {
    color: '#fff',
  },
  datesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  dateCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: -1,
    marginRight: -1,
  },
  dateCellWeekday: {
    backgroundColor: colors.bg,
  },
  dateCellSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  dateCellText: {
    fontSize: 14,
    color: colors.text,
  },
  dateCellTextWeekday: {
    fontWeight: '600',
  },
  dateCellTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  pollSummary: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: radius.sm,
    marginVertical: 12,
  },
  pollSummaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  pollSummaryItem: {
    fontSize: 13,
    color: colors.muted,
    marginLeft: 8,
  },
  pollSummaryMore: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 4,
    marginLeft: 8,
  },
  busy: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyText: {
    color: colors.muted,
    fontSize: 14,
  },
  groupSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  groupSelectorText: {
    fontSize: 15,
    color: colors.text,
  },
  groupSelectorIcon: {
    fontSize: 12,
    color: colors.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  groupList: {
    maxHeight: 300,
  },
  groupItem: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  groupItemSelected: {
    backgroundColor: colors.primarySoft,
  },
  groupItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  groupItemMembers: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
});
