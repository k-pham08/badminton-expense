import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SecondaryButton } from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { currentMonthId } from '../utils/date';

type Tab = 'home' | 'members' | 'stats' | 'settings';

export function MembersScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const members = store.data.members;

  const [tab, setTab] = useState<Tab>('members');

  // Add member state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');

  // Edit member state
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState('');

  const addMember = () => {
    if (!newMemberName.trim()) {
      Alert.alert('Thiếu tên', 'Nhập tên thành viên.');
      return;
    }
    const id = store.addMember(newMemberName);
    if (!id) {
      Alert.alert('Lỗi', 'Không thêm được thành viên.');
      return;
    }
    setNewMemberName('');
    setShowAddModal(false);
    Alert.alert('Thành công', 'Đã thêm thành viên mới');
  };

  const removeMember = (id: string, memberName: string) => {
    Alert.alert('Xóa thành viên?', memberName, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => store.removeMember(id) },
    ]);
  };

  const startEditMember = (id: string, name: string) => {
    setEditMemberId(id);
    setEditMemberName(name);
  };

  const saveEditMember = () => {
    if (!editMemberId) return;
    const trimmed = editMemberName.trim();
    if (!trimmed) {
      Alert.alert('Thiếu tên', 'Nhập tên thành viên.');
      return;
    }
    store.renameMember(editMemberId, trimmed);
    setEditMemberId(null);
    setEditMemberName('');
    Alert.alert('Thành công', 'Đã cập nhật tên');
  };

  // Count sessions per member
  const memberStats = members.map(member => {
    const month = store.month(currentMonthId());
    const sessions = Object.values(month.sessions).filter(
      s => s.attendeeIds.includes(member.id)
    );
    return { member, sessionCount: sessions.length };
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👥 Thành viên</Text>
        <Text style={styles.headerSubtitle}>Badminton Expense</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* HOME TAB */}
        {tab === 'home' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>🏠 Trang chủ</Text>
              <Text style={styles.cardSubtitle}>Quản lý thành viên nhóm cầu lông</Text>
              <View style={styles.quickActions}>
                <Pressable
                  style={styles.quickAction}
                  onPress={() => setTab('members')}
                >
                  <Text style={styles.quickActionIcon}>👥</Text>
                  <Text style={styles.quickActionLabel}>Quản lý</Text>
                </Pressable>
                <Pressable
                  style={styles.quickAction}
                  onPress={() => setTab('stats')}
                >
                  <Text style={styles.quickActionIcon}>📊</Text>
                  <Text style={styles.quickActionLabel}>Thống kê</Text>
                </Pressable>
              </View>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>📊 Tổng quan</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{members.length}</Text>
                  <Text style={styles.statLabel}>Thành viên</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {Object.values(store.month(currentMonthId()).sessions).filter(s => s.saved).length}
                  </Text>
                  <Text style={styles.statLabel}>Buổi đã lưu</Text>
                </View>
              </View>
            </Card>

            <Pressable style={styles.addBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addBtnIcon}>➕</Text>
              <Text style={styles.addBtnText}>Thêm thành viên mới</Text>
            </Pressable>
          </>
        )}

        {/* MEMBERS TAB */}
        {tab === 'members' && (
          <>
            {/* Stats Card */}
            <Card>
              <Text style={styles.cardTitle}>📊 Thống kê</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{members.length}</Text>
                  <Text style={styles.statLabel}>Thành viên</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {Object.values(store.month(currentMonthId()).sessions).filter(s => s.saved).length}
                  </Text>
                  <Text style={styles.statLabel}>Buổi tháng này</Text>
                </View>
              </View>
            </Card>

            {/* Add Button */}
            <Pressable style={styles.addBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addBtnIcon}>➕</Text>
              <Text style={styles.addBtnText}>Thêm thành viên mới</Text>
            </Pressable>

            {/* Members List */}
            {members.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>Chưa có thành viên nào</Text>
                <Text style={styles.emptyHint}>Nhấn nút trên để thêm thành viên đầu tiên</Text>
              </Card>
            ) : (
              <Card>
                <Text style={styles.cardTitle}>Danh sách thành viên</Text>
                {members.map((member) => (
                  <View key={member.id} style={styles.memberItem}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberMeta}>
                        {memberStats.find(s => s.member.id === member.id)?.sessionCount || 0} buổi
                      </Text>
                    </View>
                    <Pressable
                      style={styles.editBtn}
                      onPress={() => startEditMember(member.id, member.name)}
                    >
                      <Text style={styles.editBtnText}>✏️</Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => removeMember(member.id, member.name)}
                    >
                      <Text style={styles.deleteBtnText}>🗑️</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {/* STATS TAB */}
        {tab === 'stats' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>📊 Thống kê tháng này</Text>
              <Text style={styles.cardSubtitle}>
                {Object.values(store.month(currentMonthId()).sessions).filter(s => s.saved).length} buổi đã nhập
              </Text>
            </Card>

            {members.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>Chưa có thành viên</Text>
                <Text style={styles.emptyHint}>Thêm thành viên để xem thống kê</Text>
              </Card>
            ) : (
              <Card>
                <Text style={styles.cardTitle}>Buổi đánh theo người</Text>
                {memberStats
                  .filter(s => s.sessionCount > 0)
                  .sort((a, b) => b.sessionCount - a.sessionCount)
                  .map((item) => (
                    <View key={item.member.id} style={styles.statRow}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {item.member.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.statName}>{item.member.name}</Text>
                      <Text style={styles.statCount}>{item.sessionCount} buổi</Text>
                    </View>
                  ))}
                {memberStats.every(s => s.sessionCount === 0) && (
                  <Text style={styles.emptyHint}>Chưa có buổi nào với thành viên</Text>
                )}
              </Card>
            )}
          </>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>⚙️ Cài đặt</Text>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Tổng thành viên</Text>
                <Text style={styles.settingValue}>{members.length}</Text>
              </View>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>ℹ️ Hướng dẫn</Text>
              <Text style={styles.guideText}>
                1. Thêm thành viên vào danh sách.{'\n'}
                2. Chọn thành viên khi nhập buổi đánh.{'\n'}
                3. App sẽ tự động chia tiền theo người.{'\n'}
                4. Đánh dấu ai đã chuyển tiền.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>      

      {/* Add Member Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm thành viên mới</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Tên thành viên</Text>
              <TextInput
                style={styles.textInput}
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholder="VD: Khoa, Tuấn, Minh..."
                placeholderTextColor={colors.muted}
                autoFocus
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={addMember}>
                <Text style={styles.modalConfirmText}>Thêm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Member Modal */}
      <Modal visible={editMemberId !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sửa tên thành viên</Text>
              <Pressable onPress={() => setEditMemberId(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Tên mới</Text>
              <TextInput
                style={styles.textInput}
                value={editMemberName}
                onChangeText={setEditMemberName}
                placeholder="Nhập tên mới"
                placeholderTextColor={colors.muted}
                autoFocus
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setEditMemberId(null)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={saveEditMember}>
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

  // Member Item
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  memberMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  editBtn: {
    padding: 8,
  },
  editBtnText: {
    fontSize: 18,
  },
  deleteBtn: {
    padding: 8,
  },
  deleteBtnText: {
    fontSize: 18,
  },

  // Stat Row
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 12,
  },
  statName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  statCount: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
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
});
