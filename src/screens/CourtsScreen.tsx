import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SecondaryButton } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { formatHours, slotsOf, timesHours, timesOf } from '../utils/calc';
import { formatVnd } from '../utils/money';
import { hoursBetween } from '../utils/time';

type Tab = 'home' | 'courts' | 'members' | 'settings';

interface NewCourtDraft {
  name: string;
  price: number;
  slotNames: string[];
}

export function CourtsScreen({ navigation }: { navigation?: { navigate: (screen: string) => void } }) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const courts = store.data.courts;

  const [tab, setTab] = useState<Tab>('courts');

  // Add court form state
  const [draft, setDraft] = useState<NewCourtDraft>({
    name: '',
    price: 0,
    slotNames: ['Sân 1', 'Sân 2'],
  });

  // Edit court state
  const [editCourtId, setEditCourtId] = useState<string | null>(null);
  const [editSlots, setEditSlots] = useState<Record<string, { name: string; price?: number }>>({});
  const [newSlotName, setNewSlotName] = useState('');
  const [draftStart, setDraftStart] = useState<Record<string, string>>({});
  const [draftEnd, setDraftEnd] = useState<Record<string, string>>({});

  // Modal state
  const [showAddCourtModal, setShowAddCourtModal] = useState(false);
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [selectedSlotForTime, setSelectedSlotForTime] = useState<{ courtId: string; slotId: string } | null>(null);

  const addCourt = () => {
    if (!draft.name.trim() || draft.price <= 0) {
      Alert.alert('Thiếu thông tin', 'Nhập tên chi nhánh và giá 1 giờ.');
      return;
    }
    store.addCourt(draft.name, draft.price, draft.slotNames);
    setDraft({ name: '', price: 0, slotNames: ['Sân 1', 'Sân 2'] });
    setShowAddCourtModal(false);
    Alert.alert('Thành công', 'Đã thêm chi nhánh mới');
  };

  const removeCourt = (id: string, courtName: string) => {
    Alert.alert('Xóa chi nhánh?', courtName, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => store.removeCourt(id),
      },
    ]);
  };

  const addSlotToCourt = (courtId: string) => {
    if (!newSlotName.trim()) {
      Alert.alert('Thiếu tên', 'Nhập tên sân.');
      return;
    }
    store.addCourtSlot(courtId, newSlotName.trim());
    setNewSlotName('');
    setShowAddSlotModal(false);
  };

  const removeSlot = (courtId: string, slotId: string) => {
    Alert.alert('Xóa sân?', 'Sân này sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => store.removeCourtSlot(courtId, slotId),
      },
    ]);
  };

  const saveTime = () => {
    if (!selectedSlotForTime) return;
    const { courtId, slotId } = selectedSlotForTime;
    const key = `${courtId}:${slotId}`;
    const start = draftStart[key] ?? '';
    const end = draftEnd[key] ?? '';
    const added = store.addCourtTime(courtId, slotId, start, end);
    if (!added) {
      Alert.alert('Giờ chưa hợp lệ', 'Chọn giờ bắt đầu và kết thúc, lệch tối thiểu 5 phút.');
      return;
    }
    setDraftStart((current) => ({ ...current, [key]: '' }));
    setDraftEnd((current) => ({ ...current, [key]: '' }));
    setShowAddTimeModal(false);
    setSelectedSlotForTime(null);
    Alert.alert('Thành công', 'Đã lưu giờ cố định');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏸 Sân</Text>
        <Text style={styles.headerSubtitle}>Badminton Expense</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* COURTS TAB */}
        {tab === 'courts' && (
          <>
            {/* Quick Stats Card */}
            <Card>
              <Text style={styles.cardTitle}>📊 Thống kê</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{courts.length}</Text>
                  <Text style={styles.statLabel}>Chi nhánh</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {courts.reduce((sum, c) => sum + slotsOf(c).length, 0)}
                  </Text>
                  <Text style={styles.statLabel}>Sân</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {formatVnd(courts[0]?.pricePerHour || 0).replace('đ', '')}
                  </Text>
                  <Text style={styles.statLabel}>Giá cơ bản</Text>
                </View>
              </View>
            </Card>

            {/* Add Court Button */}
            <Pressable style={styles.addBtn} onPress={() => setShowAddCourtModal(true)}>
              <Text style={styles.addBtnIcon}>➕</Text>
              <Text style={styles.addBtnText}>Thêm chi nhánh mới</Text>
            </Pressable>

            {/* Courts List */}
            {courts.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>Chưa có chi nhánh nào</Text>
                <Text style={styles.emptyHint}>Nhấn nút trên để thêm chi nhánh đầu tiên</Text>
              </Card>
            ) : (
              courts.map((court) => {
                const slots = slotsOf(court);
                return (
                  <Card key={court.id}>
                    <View style={styles.courtHeader}>
                      <View style={styles.courtInfo}>
                        <Text style={styles.courtName}>{court.name}</Text>
                        <Text style={styles.courtMeta}>
                          {slots.length} sân · {formatVnd(court.pricePerHour)} / giờ
                        </Text>
                      </View>
                      <Pressable
                        style={styles.deleteBtn}
                        onPress={() => removeCourt(court.id, court.name)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️</Text>
                      </Pressable>
                    </View>

                    {/* Slots */}
                    {slots.map((slot, index) => {
                      const key = `${court.id}:${slot.id}`;
                      const times = timesOf(slot);
                      return (
                        <View key={slot.id} style={styles.slotBlock}>
                          <View style={styles.slotHeader}>
                            <View style={styles.slotBadge}>
                              <Text style={styles.slotBadgeText}>{slot.name}</Text>
                            </View>
                            {slot.pricePerHour && slot.pricePerHour > 0 && (
                              <Text style={styles.slotPrice}>{formatVnd(slot.pricePerHour)}/h</Text>
                            )}
                            <Pressable
                              style={styles.slotDeleteBtn}
                              onPress={() => removeSlot(court.id, slot.id)}
                            >
                              <Text style={styles.slotDeleteText}>×</Text>
                            </Pressable>
                          </View>

                          {/* Saved Times */}
                          {times.length > 0 && (
                            <View style={styles.timesList}>
                              {times.map((time) => (
                                <View key={time.id} style={styles.timeChip}>
                                  <Text style={styles.timeChipText}>
                                    {time.startTime}–{time.endTime}
                                  </Text>
                                  <Text style={styles.timeDuration}>
                                    {formatHours(hoursBetween(time.startTime, time.endTime))}h
                                  </Text>
                                  <Pressable
                                    onPress={() => store.removeCourtTime(court.id, slot.id, time.id)}
                                  >
                                    <Text style={styles.timeDeleteText}>×</Text>
                                  </Pressable>
                                </View>
                              ))}
                              <Text style={styles.totalTime}>
                                Tổng: {formatHours(timesHours(times))}
                              </Text>
                            </View>
                          )}

                          {/* Add Time Button */}
                          <Pressable
                            style={styles.addTimeBtn}
                            onPress={() => {
                              setSelectedSlotForTime({ courtId: court.id, slotId: slot.id });
                              setShowAddTimeModal(true);
                            }}
                          >
                            <Text style={styles.addTimeBtnText}>+ Thêm giờ cố định</Text>
                          </Pressable>
                        </View>
                      );
                    })}

                    {/* Add Slot Button */}
                    <Pressable
                      style={styles.addSlotBtn}
                      onPress={() => setShowAddSlotModal(true)}
                    >
                      <Text style={styles.addSlotBtnText}>+ Thêm sân mới</Text>
                    </Pressable>
                  </Card>
                );
              })
            )}
          </>
        )}

        {/* HOME TAB (Quick Access) */}
        {tab === 'home' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>🏠 Trang chủ</Text>
              <Text style={styles.cardSubtitle}>Quản lý sân cầu lông</Text>
              <View style={styles.quickActions}>
                <Pressable
                  style={styles.quickAction}
                  onPress={() => setTab('courts')}
                >
                  <Text style={styles.quickActionIcon}>🏸</Text>
                  <Text style={styles.quickActionLabel}>Quản lý sân</Text>
                </Pressable>
                <Pressable
                  style={styles.quickAction}
                  onPress={() => navigation?.navigate('Home')}
                >
                  <Text style={styles.quickActionIcon}>📊</Text>
                  <Text style={styles.quickActionLabel}>Chi phí</Text>
                </Pressable>
              </View>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>📊 Tổng quan</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{courts.length}</Text>
                  <Text style={styles.statLabel}>Chi nhánh</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {courts.reduce((sum, c) => sum + slotsOf(c).length, 0)}
                  </Text>
                  <Text style={styles.statLabel}>Sân</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {courts.reduce(
                      (sum, c) =>
                        sum + slotsOf(c).reduce((s, slot) => s + timesOf(slot).length, 0),
                      0
                    )}
                  </Text>
                  <Text style={styles.statLabel}>Giờ đã lưu</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* MEMBERS TAB placeholder */}
        {tab === 'members' && (
          <Card>
            <Text style={styles.cardTitle}>👥 Thành viên</Text>
            <Text style={styles.cardSubtitle}>Thông tin thành viên nhóm</Text>
            <Pressable
              style={styles.actionBtn}
              onPress={() => navigation?.navigate('Members')}
            >
              <Text style={styles.actionBtnText}>Xem danh sách thành viên</Text>
            </Pressable>
          </Card>
        )}

        {/* SETTINGS TAB placeholder */}
        {tab === 'settings' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>⚙️ Cài đặt</Text>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Tổng chi nhánh</Text>
                <Text style={styles.settingValue}>{courts.length}</Text>
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Tổng sân</Text>
                <Text style={styles.settingValue}>
                  {courts.reduce((sum, c) => sum + slotsOf(c).length, 0)}
                </Text>
              </View>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>ℹ️ Hướng dẫn</Text>
              <Text style={styles.guideText}>
                1. Thêm chi nhánh với tên và giá mỗi giờ.{'\n'}
                2. Thêm các sân trong chi nhánh.{'\n'}
                3. Lưu giờ cố định cho từng sân.{'\n'}
                4. Giá sân riêng ghi đè giá chi nhánh.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Add Court Modal */}
      <Modal visible={showAddCourtModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm chi nhánh mới</Text>
              <Pressable onPress={() => setShowAddCourtModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Tên chi nhánh</Text>
              <TextInput
                style={styles.textInput}
                value={draft.name}
                onChangeText={(text) => setDraft((d) => ({ ...d, name: text }))}
                placeholder="VD: Sân Nguyễn Du, Sân Club..."
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.inputLabel}>Giá 1 giờ / sân</Text>
              <TextInput
                style={styles.textInput}
                value={draft.price > 0 ? String(draft.price) : ''}
                onChangeText={(text) => setDraft((d) => ({ ...d, price: Number(text) || 0 }))}
                placeholder="150000"
                keyboardType="numeric"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.inputLabel}>Tên các sân</Text>
              {draft.slotNames.map((name, index) => (
                <View key={`slot-${index}`} style={styles.slotNameRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={name}
                    onChangeText={(text) =>
                      setDraft((d) => ({
                        ...d,
                        slotNames: d.slotNames.map((s, i) => (i === index ? text : s)),
                      }))
                    }
                    placeholder={`Sân ${index + 1}`}
                    placeholderTextColor={colors.muted}
                  />
                  {draft.slotNames.length > 1 && (
                    <Pressable
                      style={styles.removeSlotBtn}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          slotNames: d.slotNames.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Text style={styles.removeSlotText}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable
                style={styles.addMoreSlot}
                onPress={() =>
                  setDraft((d) => ({
                    ...d,
                    slotNames: [...d.slotNames, `Sân ${d.slotNames.length + 1}`],
                  }))
                }
              >
                <Text style={styles.addMoreSlotText}>+ Thêm sân</Text>
              </Pressable>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowAddCourtModal(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={addCourt}>
                <Text style={styles.modalConfirmText}>Lưu</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Slot Modal */}
      <Modal visible={showAddSlotModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm sân mới</Text>
              <Pressable onPress={() => setShowAddSlotModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Tên sân</Text>
              <TextInput
                style={styles.textInput}
                value={newSlotName}
                onChangeText={setNewSlotName}
                placeholder="VD: Sân 3, Sân trong..."
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowAddSlotModal(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={() => {
                  if (courts.length > 0) {
                    addSlotToCourt(courts[0].id);
                  }
                }}
              >
                <Text style={styles.modalConfirmText}>Thêm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Time Modal */}
      <Modal visible={showAddTimeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm giờ cố định</Text>
              <Pressable onPress={() => setShowAddTimeModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Giờ bắt đầu</Text>
              <TextInput
                style={styles.textInput}
                value={selectedSlotForTime ? draftStart[`${selectedSlotForTime.courtId}:${selectedSlotForTime.slotId}`] || '' : ''}
                onChangeText={(text) => {
                  if (selectedSlotForTime) {
                    const key = `${selectedSlotForTime.courtId}:${selectedSlotForTime.slotId}`;
                    setDraftStart((d) => ({ ...d, [key]: text }));
                  }
                }}
                placeholder="18:00"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.inputLabel}>Giờ kết thúc</Text>
              <TextInput
                style={styles.textInput}
                value={selectedSlotForTime ? draftEnd[`${selectedSlotForTime.courtId}:${selectedSlotForTime.slotId}`] || '' : ''}
                onChangeText={(text) => {
                  if (selectedSlotForTime) {
                    const key = `${selectedSlotForTime.courtId}:${selectedSlotForTime.slotId}`;
                    setDraftEnd((d) => ({ ...d, [key]: text }));
                  }
                }}
                placeholder="21:00"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowAddTimeModal(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={saveTime}>
                <Text style={styles.modalConfirmText}>Lưu</Text>
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

  // Card
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

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },

  // Quick Actions
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

  // Add Button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    gap: 8,
  },
  addBtnIcon: {
    fontSize: 18,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Empty
  emptyText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },

  // Court Header
  courtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  courtInfo: {
    flex: 1,
  },
  courtName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  courtMeta: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
  },
  deleteBtnText: {
    fontSize: 18,
  },

  // Slot Block
  slotBlock: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  slotBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  slotBadgeText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  slotPrice: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  slotDeleteBtn: {
    marginLeft: 'auto',
    padding: 4,
  },
  slotDeleteText: {
    fontSize: 20,
    color: colors.muted,
    fontWeight: '600',
  },

  // Times List
  timesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  timeChipText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  timeDuration: {
    color: colors.primary,
    fontSize: 12,
  },
  timeDeleteText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  totalTime: {
    fontSize: 13,
    color: colors.muted,
    width: '100%',
    marginTop: 4,
  },

  // Add Time Button
  addTimeBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    borderStyle: 'dashed',
  },
  addTimeBtnText: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 14,
  },

  // Add Slot Button
  addSlotBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    marginTop: 8,
  },
  addSlotBtnText: {
    color: colors.muted,
    fontWeight: '500',
    fontSize: 14,
  },

  // Settings
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  settingLabel: {
    fontSize: 15,
    color: colors.text,
  },
  settingValue: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
  guideText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 22,
  },

  // Action Button
  actionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 12,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    opacity: 1,
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

  // Modal
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 24,
    color: colors.muted,
    padding: 4,
  },
  modalScroll: {
    padding: 16,
  },
  modalBody: {
    padding: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  modalCancelText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  modalConfirmText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },

  // Input
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
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
  slotNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  removeSlotBtn: {
    padding: 10,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
  },
  removeSlotText: {
    fontSize: 20,
    color: colors.danger,
    fontWeight: '600',
  },
  addMoreSlot: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    marginTop: 8,
  },
  addMoreSlotText: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 14,
  },
});
