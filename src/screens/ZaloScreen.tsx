import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZaloBar } from '../components/ZaloBar';
import { Card, PrimaryButton, SectionTitle } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { daysInMonth, formatDateVi, monthLabel, parseMonthId, weekdayMon0FromDateId, todayId } from '../utils/date';
import {
  createZaloPoll,
  fetchZaloGroups,
  loadZaloConfig,
  saveZaloGroup,
  getWhitelistStatus,
  addGroupToWhitelist,
  removeGroupFromWhitelist,
  clearWhitelist,
  type ZaloGroup,
  type WhitelistStatus,
} from '../utils/zaloBridge';

function thisMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
import type { ZaloBridgePerson, ZaloPoll } from '../utils/zaloBridge';
import type { Member, ZaloContact } from '../types';
import type { ZaloPerson } from '../utils/vote';
import { matchVoteNames } from '../utils/vote';
import { entriesForPoll, loadZalo, peopleForPoll, useZaloSyncState } from '../utils/zaloSync';

type Tab = 'home' | 'create' | 'members' | 'settings';

interface SelectedDate {
  date: string;
  title: string;
  /** Tên người vote trên Zalo cho ngày này. */
  people: string[];
  /** Zalo voter id cùng thứ tự với people. */
  voterIds: string[];
}

export function ZaloScreen({ monthId: currentMonthId }: { monthId: string }) {
  const store = useStore();
  const sync = useZaloSyncState();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('home');
  const [showPollSelector, setShowPollSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  
  // Poll selection state
  const [selectedPollIds, setSelectedPollIds] = useState<Set<string>>(new Set());
  const [selectedDates, setSelectedDates] = useState<SelectedDate[]>([]);
  
  // Create poll state
  const [createMonthId, setCreateMonthId] = useState(thisMonthId());
  const [createSelectedDates, setCreateSelectedDates] = useState<string[]>([]);
  const [createWeekdays, setCreateWeekdays] = useState<number[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [groups, setGroups] = useState<ZaloGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  
  // Settings state
  const [whitelistStatus, setWhitelistStatus] = useState<WhitelistStatus | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [whitelistSelectedGroups, setWhitelistSelectedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadZalo(false);
  }, []);

  const todayStr = todayId();
  
  const dates = selectedPollIds.size > 0
    ? sync.polls
        .filter(p => selectedPollIds.has(p.id))
        .flatMap(p =>
          entriesForPoll(p).map(e => ({
            date: e.date,
            title: p.question,
            people: e.names,
            voterIds: e.voterIds,
          }))
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const handleSelectAll = () => {
    const future = dates.filter(d => d.date >= todayStr);
    setSelectedDates(future.map(d => ({
      date: d.date,
      title: d.title,
      people: d.people,
      voterIds: d.voterIds,
    })));
  };

  const handleClearAll = () => setSelectedDates([]);

  const handleToggleDate = (date: string, title: string) => {
    setSelectedDates(prev => {
      const exists = prev.find(d => d.date === date);
      if (exists) return prev.filter(d => d.date !== date);
      const found = dates.find(d => d.date === date);
      return [...prev, {
        date,
        title,
        people: found?.people ?? [],
        voterIds: found?.voterIds ?? [],
      }];
    });
  };

  const handleApplyToMonth = async () => {
    if (selectedDates.length === 0) {
      Alert.alert('Thông báo', 'Chưa chọn ngày nào');
      return;
    }
    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      return;
    }
    const members = store.data.members;
    const contacts = store.data.zaloContacts ?? [];
    const entries: { date: string; attendeeIds: string[]; voters: number; matched: number }[] = [];
    const skippedNoMatch: string[] = [];
    const unmatchedNames = new Set<string>();
    for (const item of selectedDates) {
      const { matched, unknown } = matchVoteNames(item.people, members, item.voterIds, contacts);
      // Bỏ qua ngày không khớp được thành viên nào (vote rỗng hoặc tên chưa liên kết)
      if (matched.length === 0) {
        skippedNoMatch.push(item.date);
        continue;
      }
      entries.push({
        date: item.date,
        attendeeIds: matched.map((member) => member.id),
        voters: item.people.length,
        matched: matched.length,
      });
      for (const name of unknown) unmatchedNames.add(name);
    }
    const totalVoters = entries.reduce((sum, e) => sum + e.voters, 0);
    const totalMatched = entries.reduce((sum, e) => sum + e.matched, 0);
    const summary =
      `${entries.length} ngày · khớp ${totalMatched}/${totalVoters} vote` +
      (unmatchedNames.size > 0 ? ` · ${unmatchedNames.size} tên chưa liên kết` : '') +
      (skippedNoMatch.length > 0 ? ` · ${skippedNoMatch.length} ngày không khớp ai` : '');
    Alert.alert(
      'Áp dụng',
      `${summary}\n\nÁp dụng sẽ thay người đánh của các ngày này bằng người đã vote.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Áp dụng',
          onPress: () => {
            // applyMonthVote vừa thêm ngày (extraDates) vừa set attendees thay thế danh sách vote
            const applied = store.applyMonthVote(currentMonthId, entries);
            const tail = applied < entries.length
              ? ` (một số ngày nằm ngoài tháng ${currentMonthId})`
              : '';
            const tail2 = skippedNoMatch.length > 0
              ? ` · bỏ qua ${skippedNoMatch.length} ngày chưa khớp ai`
              : '';
            Alert.alert(
              'Thành công',
              `Đã thay ${applied} ngày bằng thành viên từ phiếu vote${tail}${tail2}.`
            );
            setSelectedDates([]);
            setShowDatePicker(false);
          },
        },
      ]
    );
  };

  const loadGroups = useCallback(async () => {
    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      return;
    }
    try {
      const list = await fetchZaloGroups(config.host, config.token);
      setGroups(list);
      if (list.length === 1) setSelectedGroupId(list[0].id);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không tải được nhóm');
    }
  }, []);

  const handleCreatePoll = useCallback(async () => {
    if (!createTitle.trim()) {
      Alert.alert('Lỗi', 'Nhập tiêu đề phiếu');
      return;
    }
    if (createSelectedDates.length === 0 && createWeekdays.length === 0) {
      Alert.alert('Lỗi', 'Chọn ngày hoặc ngày trong tuần');
      return;
    }
    if (!selectedGroupId) {
      Alert.alert('Lỗi', 'Chọn nhóm Zalo');
      return;
    }
    setCreateLoading(true);
    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      setCreateLoading(false);
      return;
    }
    try {
      await createZaloPoll(config, createTitle.trim(), createSelectedDates);
      Alert.alert('Thành công', 'Đã tạo phiếu bình chọn');
      setCreateTitle('');
      setCreateSelectedDates([]);
      setCreateWeekdays([]);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Tạo phiếu thất bại');
    } finally {
      setCreateLoading(false);
    }
  }, [createTitle, createSelectedDates, createWeekdays, selectedGroupId]);

  // Whitelist functions
  const loadWhitelist = useCallback(async () => {
    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      return;
    }
    setWhitelistLoading(true);
    try {
      const status = await getWhitelistStatus(config);
      setWhitelistStatus(status);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không tải được whitelist');
    } finally {
      setWhitelistLoading(false);
    }
  }, []);

  const handleAddToWhitelist = useCallback(async (group: ZaloGroup) => {
    const config = await loadZaloConfig();
    if (!config) {
      Alert.alert('Lỗi', 'Chưa kết nối Zalo');
      return;
    }
    try {
      const status = await addGroupToWhitelist(config, group.id, group.name);
      setWhitelistStatus(status);
      setShowGroupPicker(false);
      Alert.alert('Thành công', `Đã thêm "${group.name}" vào whitelist`);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thêm được');
    }
  }, []);

  const handleRemoveFromWhitelist = useCallback(async (groupId: string, groupName?: string) => {
    Alert.alert(
      'Xóa khỏi whitelist',
      `Bạn có chắc muốn xóa "${groupName || groupId}" khỏi whitelist?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            const config = await loadZaloConfig();
            if (!config) return;
            try {
              const status = await removeGroupFromWhitelist(config, groupId);
              setWhitelistStatus(status);
            } catch (error) {
              Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không xóa được');
            }
          },
        },
      ]
    );
  }, []);

  const handleClearWhitelist = useCallback(async () => {
    Alert.alert(
      'Xóa whitelist',
      'Bạn có chắc muốn xóa toàn bộ whitelist? Tất cả nhóm sẽ được phép.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            const config = await loadZaloConfig();
            if (!config) return;
            try {
              const status = await clearWhitelist(config);
              setWhitelistStatus(status);
            } catch (error) {
              Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không xóa được');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={[styles.container]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ Zalo</Text>
        <Text style={styles.headerSubtitle}>Badminton Expense</Text>
      </View>

      <ZaloBar />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* HOME TAB */}
        {tab === 'home' && (
          <>
            {/* Quick Actions Card */}
            <Card>
              <Text style={styles.cardTitle}>Hành động nhanh</Text>
              <View style={styles.quickActions}>
                <Pressable style={styles.quickAction} onPress={() => { setShowPollSelector(true); }}>
                  <Text style={styles.quickActionIcon}>📊</Text>
                  <Text style={styles.quickActionLabel}>Chọn phiếu</Text>
                </Pressable>
                <Pressable style={styles.quickAction} onPress={() => { setShowDatePicker(true); }}>
                  <Text style={styles.quickActionIcon}>📅</Text>
                  <Text style={styles.quickActionLabel}>Chọn ngày</Text>
                </Pressable>
              </View>
            </Card>

            {/* Selected Polls Summary */}
            {selectedPollIds.size > 0 && (
              <Card>
                <View style={styles.selectionHeader}>
                  <Text style={styles.selectionTitle}>📊 {selectedPollIds.size} phiếu đã chọn</Text>
                  <Pressable onPress={() => { setSelectedPollIds(new Set()); }}>
                    <Text style={styles.clearText}>Xóa</Text>
                  </Pressable>
                </View>
                <Text style={styles.selectionMeta}>
                  {dates.length} ngày trong các phiếu
                </Text>
                <Pressable style={styles.actionBtn} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.actionBtnText}>Tiếp tục →</Text>
                </Pressable>
              </Card>
            )}

            {/* Selected Dates Summary */}
            {selectedDates.length > 0 && (
              <Card>
                <View style={styles.selectionHeader}>
                  <Text style={styles.selectionTitle}>📅 {selectedDates.length} ngày đã chọn</Text>
                  <Pressable onPress={handleClearAll}>
                    <Text style={styles.clearText}>Xóa</Text>
                  </Pressable>
                </View>
                <View style={styles.datePreview}>
                  {selectedDates.slice(0, 3).map((d) => (
                    <View key={d.date} style={styles.dateChip}>
                      <Text style={styles.dateChipText}>{formatDateVi(d.date).slice(0, 5)}</Text>
                    </View>
                  ))}
                  {selectedDates.length > 3 && (
                    <View style={styles.dateChip}>
                      <Text style={styles.dateChipText}>+{selectedDates.length - 3}</Text>
                    </View>
                  )}
                </View>
                <Pressable style={styles.applyBtn} onPress={handleApplyToMonth}>
                  <Text style={styles.applyBtnText}>Áp dụng vào lịch</Text>
                </Pressable>
              </Card>
            )}

            {/* Polls List */}
            <Card>
              <Text style={styles.cardTitle}>Phiếu gần đây ({sync.polls.length})</Text>
              {sync.polls.length === 0 ? (
                <Text style={styles.emptyText}>Chưa có phiếu nào</Text>
              ) : (
                sync.polls.slice(0, 5).map((poll) => (
                  <Pressable
                    key={poll.id}
                    style={styles.pollItem}
                    onPress={() => {
                      setSelectedPollIds(prev => {
                        const next = new Set(prev);
                        if (next.has(poll.id)) next.delete(poll.id);
                        else next.add(poll.id);
                        return next;
                      });
                    }}
                  >
                    <View style={[styles.pollCheckbox, selectedPollIds.has(poll.id) && styles.pollCheckboxActive]}>
                      {selectedPollIds.has(poll.id) && <Text style={styles.pollCheckmark}>✓</Text>}
                    </View>
                    <View style={styles.pollInfo}>
                      <Text style={styles.pollName}>{poll.question}</Text>
                      <Text style={styles.pollMeta}>{entriesForPoll(poll).length} ngày</Text>
                    </View>
                  </Pressable>
                ))
              )}
              {sync.polls.length > 5 && (
                <Pressable style={styles.viewMore} onPress={() => setShowPollSelector(true)}>
                  <Text style={styles.viewMoreText}>Xem tất cả ({sync.polls.length})</Text>
                </Pressable>
              )}
            </Card>
          </>
        )}

        {/* CREATE TAB */}
        {tab === 'create' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>Tạo phiếu bình chọn mới</Text>
              
              <Text style={styles.inputLabel}>Tiêu đề phiếu</Text>
              <TextInput
                style={styles.textInput}
                value={createTitle}
                onChangeText={setCreateTitle}
                placeholder="VD: Chọn ngày đánh tháng này"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.inputLabel}>Chọn nhóm Zalo</Text>
              <Pressable style={styles.selector} onPress={() => { loadGroups(); setShowGroupPicker(true); }}>
                <Text style={styles.selectorText}>
                  {groups.find(g => g.id === selectedGroupId)?.name || 'Chọn nhóm...'}
                </Text>
                <Text style={styles.selectorArrow}>▼</Text>
              </Pressable>

              <Text style={styles.inputLabel}>Hoặc chọn ngày cụ thể</Text>
              <Pressable style={styles.dateSelectorBtn} onPress={() => Alert.alert('Chọn ngày', 'Tính năng đang phát triển')}>
                <Text style={styles.dateSelectorText}>+ Thêm ngày cụ thể</Text>
              </Pressable>

              {createSelectedDates.length > 0 && (
                <View style={styles.selectedDates}>
                  {createSelectedDates.map((date) => (
                    <View key={date} style={styles.selectedDateChip}>
                      <Text style={styles.selectedDateText}>{date}</Text>
                      <Pressable onPress={() => setCreateSelectedDates(prev => prev.filter(d => d !== date))}>
                        <Text style={styles.removeDateText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Hoặc chọn ngày trong tuần</Text>
              <View style={styles.weekdayGrid}>
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day, i) => (
                  <Pressable
                    key={day}
                    style={[styles.weekdayBtn, createWeekdays.includes(i) && styles.weekdayBtnActive]}
                    onPress={() => {
                      setCreateWeekdays(prev =>
                        prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                      );
                    }}
                  >
                    <Text style={[styles.weekdayText, createWeekdays.includes(i) && styles.weekdayTextActive]}>
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.createBtn, createLoading && styles.createBtnDisabled]}
                onPress={handleCreatePoll}
                disabled={createLoading}
              >
                <Text style={styles.createBtnText}>
                  {createLoading ? 'Đang tạo...' : '🚀 Tạo phiếu bình chọn'}
                </Text>
              </Pressable>
            </Card>
          </>
        )}

        {/* MEMBERS TAB */}
        {tab === 'members' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>👥 Thành viên nhóm</Text>
              <Text style={styles.cardSubtitle}>{sync.people.length} thành viên</Text>
              
              <View style={styles.memberGrid}>
                {sync.people.slice(0, 12).map((person) => (
                  <View key={person.id} style={styles.memberItem}>
                    <View style={styles.memberAvatar}>
                      {person.avatar ? (
                        <Image source={{ uri: person.avatar }} style={styles.memberAvatarImg} />
                      ) : (
                        <Text style={styles.memberAvatarText}>{person.name.charAt(0)}</Text>
                      )}
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>{person.name}</Text>
                  </View>
                ))}
              </View>
              {sync.people.length > 12 && (
                <Text style={styles.moreText}>+{sync.people.length - 12} thành viên khác</Text>
              )}
            </Card>
          </>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>⚙️ Cài đặt</Text>
              
              {/* Whitelist Status */}
              <View style={styles.settingSection}>
                <Text style={styles.settingLabel}>🔒 Whitelist nhóm</Text>
                <Text style={styles.settingHint}>
                  Whitelist giới hạn nhóm Zalo được phép tương tác
                </Text>
                <View style={styles.statusBox}>
                  <Text style={styles.statusText}>
                    {whitelistStatus?.isEmpty
                      ? '🔓 Tất cả nhóm đều được phép'
                      : `🔒 ${whitelistStatus?.groups?.length || 0} nhóm được phép`}
                  </Text>
                </View>
              </View>

              {/* Current Whitelist */}
              {!whitelistStatus?.isEmpty && whitelistStatus?.groups && whitelistStatus.groups.length > 0 && (
                <View style={styles.whitelistList}>
                  <Text style={styles.settingLabel}>Nhóm trong whitelist:</Text>
                  {whitelistStatus.groups.map((groupId) => {
                    const group = groups.find(g => g.id === groupId);
                    return (
                      <View key={groupId} style={styles.whitelistItem}>
                        <Text style={styles.whitelistId}>{group?.name || groupId.slice(0, 16) + '...'}</Text>
                        <Pressable
                          style={styles.removeBtn}
                          onPress={() => void handleRemoveFromWhitelist(groupId, group?.name)}
                        >
                          <Text style={styles.removeBtnText}>Xóa</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Actions */}
              <View style={styles.settingActions}>
                <Pressable
                  style={styles.settingBtn}
                  onPress={async () => {
                    setWhitelistSelectedGroups(new Set(whitelistStatus?.groups || []));
                    await loadGroups();
                    setShowGroupPicker(true);
                  }}
                >
                  <Text style={styles.settingBtnText}>+ Thêm nhóm vào whitelist</Text>
                </Pressable>
                {!whitelistStatus?.isEmpty && (
                  <Pressable style={styles.clearBtn} onPress={() => void handleClearWhitelist()}>
                    <Text style={styles.clearBtnText}>Xóa toàn bộ whitelist</Text>
                  </Pressable>
                )}
              </View>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>ℹ️ Thông tin</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tài khoản Zalo</Text>
                <Text style={styles.infoValue}>Đăng Khoa</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phiếu đang hoạt động</Text>
                <Text style={styles.infoValue}>{sync.polls.length}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Thành viên đã sync</Text>
                <Text style={styles.infoValue}>{sync.people.length}</Text>
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav]}>
        <Pressable style={[styles.navItem, tab === 'home' && styles.navItemActive]} onPress={() => setTab('home')}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={[styles.navLabel, tab === 'home' && styles.navLabelActive]}>Trang chủ</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === 'create' && styles.navItemActive]} onPress={() => setTab('create')}>
          <Text style={styles.navIcon}>➕</Text>
          <Text style={[styles.navLabel, tab === 'create' && styles.navLabelActive]}>Tạo phiếu</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === 'members' && styles.navItemActive]} onPress={() => setTab('members')}>
          <Text style={styles.navIcon}>👥</Text>
          <Text style={[styles.navLabel, tab === 'members' && styles.navLabelActive]}>Thành viên</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === 'settings' && styles.navItemActive]} onPress={() => { setTab('settings'); void loadWhitelist(); void loadGroups(); }}>
          <Text style={styles.navIcon}>⚙️</Text>
          <Text style={[styles.navLabel, tab === 'settings' && styles.navLabelActive]}>Cài đặt</Text>
        </Pressable>
      </View>

      {/* Poll Selector Modal */}
      <Modal visible={showPollSelector} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn phiếu bình chọn</Text>
              <Pressable onPress={() => setShowPollSelector(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {sync.polls.map((poll) => {
                const isSelected = selectedPollIds.has(poll.id);
                const entryCount = entriesForPoll(poll).length;
                return (
                  <Pressable
                    key={poll.id}
                    style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                    onPress={() => {
                      setSelectedPollIds(prev => {
                        const next = new Set(prev);
                        if (next.has(poll.id)) next.delete(poll.id);
                        else next.add(poll.id);
                        return next;
                      });
                    }}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={styles.modalItemInfo}>
                      <Text style={styles.modalItemTitle}>{poll.question}</Text>
                      <Text style={styles.modalItemMeta}>{entryCount} ngày</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowPollSelector(false)}>
                <Text style={styles.modalCancelText}>Đóng</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={() => {
                  setShowPollSelector(false);
                  if (selectedPollIds.size > 0) setShowDatePicker(true);
                }}
              >
                <Text style={styles.modalConfirmText}>
                  Tiếp tục ({selectedPollIds.size})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn ngày áp dụng</Text>
              <Pressable onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              <View style={styles.datePickerActions}>
                <Pressable onPress={handleSelectAll}>
                  <Text style={styles.linkText}>Tất cả (tương lai)</Text>
                </Pressable>
                <Text style={styles.separator}>·</Text>
                <Pressable onPress={handleClearAll}>
                  <Text style={styles.linkText}>Bỏ chọn</Text>
                </Pressable>
              </View>
              {dates.map((item) => {
                const isSelected = selectedDates.some(d => d.date === item.date);
                const isPast = item.date < todayStr;
                return (
                  <Pressable
                    key={item.date}
                    style={[styles.dateItem, isSelected && styles.dateItemSelected, isPast && styles.dateItemPast]}
                    onPress={() => handleToggleDate(item.date, item.title)}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={styles.dateItemInfo}>
                      <Text style={[styles.dateItemText, isPast && styles.dateItemTextPast]}>
                        {formatDateVi(item.date)}
                      </Text>
                      <Text style={styles.dateItemMeta}>{item.title}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={handleApplyToMonth}>
                <Text style={styles.modalConfirmText}>
                  Áp dụng ({selectedDates.length})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group Picker Modal */}
      <Modal visible={showGroupPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn nhóm cho whitelist</Text>
              <Pressable onPress={() => setShowGroupPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {groups.length === 0 ? (
                <Text style={styles.emptyText}>Không có nhóm nào</Text>
              ) : (
                groups.map((group) => {
                  const isSelected = whitelistSelectedGroups.has(group.id);
                  return (
                    <Pressable
                      key={group.id}
                      style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                      onPress={() => {
                        setWhitelistSelectedGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        });
                      }}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={styles.modalItemInfo}>
                        <Text style={styles.modalItemTitle}>{group.name}</Text>
                        <Text style={styles.modalItemMeta}>{group.totalMember} thành viên</Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowGroupPicker(false)}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={async () => {
                  setShowGroupPicker(false);
                  const config = await loadZaloConfig();
                  if (!config) return;
                  // Add each selected group that's not already in whitelist
                  for (const groupId of whitelistSelectedGroups) {
                    const group = groups.find(g => g.id === groupId);
                    if (group && !whitelistStatus?.groups?.includes(groupId)) {
                      await addGroupToWhitelist(config, groupId, group.name);
                    }
                  }
                  // Remove groups that were unchecked
                  if (whitelistStatus?.groups) {
                    for (const groupId of whitelistStatus.groups) {
                      if (!whitelistSelectedGroups.has(groupId)) {
                        await removeGroupFromWhitelist(config, groupId);
                      }
                    }
                  }
                  await loadWhitelist();
                  Alert.alert('Thành công', 'Đã cập nhật whitelist');
                }}
              >
                <Text style={styles.modalConfirmText}>
                  Lưu ({whitelistSelectedGroups.size})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    backgroundColor: colors.bg,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },

  // Quick Actions
  quickCard: {
    padding: 16,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickActionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },

  // Selection Cards
  selectionCard: {
    padding: 16,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  clearText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  selectionMeta: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
  },
  datePreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  dateChip: {
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateChipText: {
    fontSize: 13,
    color: colors.text,
  },
  actionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  applyBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Poll Items
  pollItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pollCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollCheckboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pollCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pollInfo: {
    flex: 1,
  },
  pollName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  pollMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  viewMore: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewMoreText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Create Tab
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.card,
  },
  selectorText: {
    fontSize: 15,
    color: colors.text,
  },
  selectorArrow: {
    fontSize: 12,
    color: colors.muted,
  },
  dateSelectorBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  dateSelectorText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  selectedDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  selectedDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  selectedDateText: {
    fontSize: 13,
    color: colors.primary,
  },
  removeDateText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  weekdayGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  weekdayBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekdayBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  weekdayTextActive: {
    color: '#fff',
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 24,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Members Tab
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 12,
  },
  memberItem: {
    alignItems: 'center',
    width: 70,
  },
  memberAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarImg: {
    width: '100%',
    height: '100%',
  },
  memberAvatarText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.primary,
  },
  memberName: {
    fontSize: 12,
    color: colors.text,
    marginTop: 6,
    textAlign: 'center',
  },
  moreText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
  },

  // Settings Tab
  settingSection: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  settingHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  statusBox: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  whitelistList: {
    marginTop: 12,
  },
  whitelistItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  whitelistId: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  removeBtn: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  removeBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  settingActions: {
    gap: 12,
    marginTop: 16,
  },
  settingBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  settingBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  clearBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearBtnText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },

  // Bottom Navigation
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navItemActive: {
    // Active state
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  navLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalClose: {
    fontSize: 20,
    color: colors.muted,
    padding: 4,
  },
  modalScroll: {
    padding: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  modalItemSelected: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  modalItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  modalItemTitle: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  modalItemMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.line,
    borderRadius: radius.md,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  datePickerActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  linkText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  separator: {
    color: colors.muted,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dateItemSelected: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  dateItemPast: {
    opacity: 0.5,
  },
  dateItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  dateItemText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  dateItemTextPast: {
    color: colors.muted,
  },
  dateItemMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
});
