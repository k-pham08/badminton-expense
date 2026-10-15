import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackupCard } from '../components/BackupCard';
import { Calendar } from '../components/Calendar';
import { Card, MoneyInput, PrimaryButton } from '../components/ui';
import { lastSavedSession, useStore } from '../store';
import { colors, radius } from '../theme';
import { sessionSplit } from '../utils/calc';
import { addMonths, formatDateVi, monthLabel, WEEKDAY_LABELS } from '../utils/date';
import { formatVnd } from '../utils/money';

type Props = {
  monthId: string;
  onChangeMonth: (monthId: string) => void;
  onOpenSession: (date: string) => void;
};

export function MonthScreen({ monthId, onChangeMonth, onOpenSession }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const month = store.month(monthId);
  const [shuttleNameDraft, setShuttleNameDraft] = useState(month.shuttleName ?? '');
  const [showAllSessions, setShowAllSessions] = useState(false);
  const savedDates = month.playingDates.filter((date) => month.sessions[date]?.saved);

  useEffect(() => {
    setShuttleNameDraft(month.shuttleName ?? '');
  }, [monthId, month.shuttleName]);

  const toggleWeekday = (day: number) => {
    const current = month.weekdays ?? [];
    const next = current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort();
    store.setWeekdays(monthId, next);
  };

  const onPressDate = (date: string) => {
    if (!month.playingDates.includes(date)) {
      store.addPlayingDate(monthId, date);
    }
    onOpenSession(date);
  };

  const onLongPressDate = (date: string) => {
    if (!month.playingDates.includes(date)) return;
    const hasData = month.sessions[date]?.saved;
    Alert.alert(
      'Bỏ ngày này?',
      hasData ? `${formatDateVi(date)} đã có số liệu, xóa sẽ mất dữ liệu buổi đó.` : formatDateVi(date),
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Bỏ ngày',
          style: 'destructive',
          onPress: () => store.removePlayingDate(monthId, date),
        },
      ],
    );
  };

  // Quick add weekday
  const addWeekdayDates = () => {
    const weekdays = month.weekdays ?? [];
    if (weekdays.length === 0) {
      Alert.alert('Chưa chọn thứ', 'Chọn thứ đánh cả tháng trước.');
      return;
    }
    Alert.alert(
      'Thêm ngày đánh?',
      `Thêm tất cả ${weekdays.length} thứ vào tháng này?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Thêm',
          onPress: () => {
            const [year, monthNum] = monthId.split('-').map(Number);
            const daysInMonth = new Date(year, monthNum, 0).getDate();
            let added = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const date = new Date(year, monthNum - 1, d);
              const dow = (date.getDay() + 6) % 7; // Mon=0
              if (weekdays.includes(dow)) {
                const dateId = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                if (!month.playingDates.includes(dateId)) {
                  store.addPlayingDate(monthId, dateId);
                  added++;
                }
              }
            }
            Alert.alert('Thành công', `Đã thêm ${added} ngày`);
          },
        },
      ],
    );
  };

  // Quick stats
  const totalSessions = month.playingDates.length;
  const savedSessions = savedDates.length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header - Fixed */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📅 Tháng</Text>
        <Text style={styles.headerSubtitle}>Badminton Expense</Text>
      </View>

      {/* Month Navigator - Fixed, Always Visible */}
      <View style={styles.monthNav}>
        <Pressable onPress={() => onChangeMonth(addMonths(monthId, -1))} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <View style={styles.monthCenter}>
          <Text style={styles.monthTitle}>{monthLabel(monthId)}</Text>
          <View style={styles.statsBadge}>
            <Text style={styles.statsBadgeText}>
              {savedSessions}/{totalSessions} buổi
            </Text>
          </View>
        </View>
        <Pressable onPress={() => onChangeMonth(addMonths(monthId, 1))} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      {/* Scrollable Bottom Section - Less Important */}
      <ScrollView style={styles.bottomScroll} contentContainerStyle={styles.bottomContent}>
              {/* Weekday Selection - Fixed */}
      <View style={styles.weekdaySection}>
        <Text style={styles.weekdayLabel}>Thứ đánh cả tháng:</Text>
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, index) => {
            const on = (month.weekdays ?? []).includes(index);
            return (
              <Pressable
                key={label}
                onPress={() => toggleWeekday(index)}
                style={[styles.weekdayChip, on && styles.weekdayChipOn]}
              >
                <Text style={[styles.weekdayText, on && styles.weekdayTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable style={styles.addWeekdayBtn} onPress={addWeekdayDates}>
          <Text style={styles.addWeekdayBtnText}>+ Thêm vào tháng</Text>
        </Pressable>
      </View>

      {/* Calendar - Fixed, Most Important */}
      <View style={styles.calendarSection}>
        <Calendar
          monthId={monthId}
          playingDates={month.playingDates}
          savedDates={savedDates}
          onPressDate={onPressDate}
          onLongPressDate={onLongPressDate}
        />
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primarySoft }]} />
            <Text style={styles.legendText}>Đã chọn</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Đã nhập</Text>
          </View>
        </View>
      </View>

      {/* Sessions List - Fixed, Important */}
      <View style={styles.sessionsSection}>
        <View style={styles.sessionsHeader}>
          <Text style={styles.sessionsTitle}>📋 Buổi đánh ({totalSessions})</Text>
          <Text style={styles.sessionsSubtitle}>{savedSessions} đã nhập</Text>
        </View>
        
        {totalSessions === 0 ? (
          <View style={styles.emptySessions}>
            <Text style={styles.emptyText}>Chưa có ngày đánh nào</Text>
            <Text style={styles.emptyHint}>Chọn thứ đánh hoặc chạm ngày trên lịch</Text>
          </View>
        ) : (
          <View style={styles.sessionsList}>
            {month.playingDates.slice(0, showAllSessions ? undefined : 5).map((date) => {
              const session = month.sessions[date];
              const split = session?.saved ? sessionSplit(session, month.shuttlePrice) : null;
              const last = lastSavedSession(month, date);
              const isSaved = savedDates.includes(date);

              return (
                <Pressable
                  key={date}
                  onPress={() => onOpenSession(date)}
                  onLongPress={() => onLongPressDate(date)}
                  style={styles.sessionRow}
                >
                  <View style={[styles.sessionDot, isSaved && styles.sessionDotSaved]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionDate}>{formatDateVi(date)}</Text>
                    <Text style={styles.sessionMeta}>
                      {split
                        ? `${split.people} người · ${formatVnd(split.perPerson)}/người`
                        : last
                          ? 'Chưa nhập'
                          : 'Chưa nhập'}
                    </Text>
                  </View>
                  <Text style={[styles.sessionAmount, !split && styles.muted]}>
                    {split
                      ? split.uneven
                        ? formatVnd(split.total)
                        : formatVnd(split.perPerson)
                      : '—'}
                  </Text>
                </Pressable>
              );
            })}
            {totalSessions > 5 && (
              <Pressable 
                style={styles.moreBtn}
                onPress={() => setShowAllSessions(!showAllSessions)}
              >
                <Text style={styles.moreBtnText}>
                  {showAllSessions ? '↑ Thu gọn' : `↓ Xem thêm ${totalSessions - 5} buổi`}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
        {/* Shuttle Settings */}
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>🏸 Cầu tháng</Text>
          
          <Text style={styles.inputLabel}>Tên cầu</Text>
          <TextInput
            style={styles.textInput}
            value={shuttleNameDraft}
            onChangeText={setShuttleNameDraft}
            onBlur={() => store.setShuttleName(monthId, shuttleNameDraft)}
            onSubmitEditing={() => store.setShuttleName(monthId, shuttleNameDraft)}
            placeholder="Yonex, cầu chính..."
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.inputLabel}>Giá 1 trái</Text>
          <TextInput
            style={styles.textInput}
            value={month.shuttlePrice > 0 ? String(month.shuttlePrice) : ''}
            onChangeText={(text) => store.setShuttlePrice(monthId, Number(text) || 0)}
            placeholder="26000"
            keyboardType="numeric"
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>⚡ Thao tác nhanh</Text>
          <View style={styles.quickActions}>
            <Pressable
              style={styles.quickAction}
              onPress={() => onOpenSession(month.playingDates[0] || '')}
              disabled={month.playingDates.length === 0}
            >
              <Text style={styles.quickActionIcon}>📝</Text>
              <Text style={styles.quickActionLabel}>Nhập buổi</Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() => {
                const today = new Date();
                const todayId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                store.addPlayingDate(monthId, todayId);
              }}
            >
              <Text style={styles.quickActionIcon}>📅</Text>
              <Text style={styles.quickActionLabel}>Thêm hôm nay</Text>
            </Pressable>
          </View>
        </View>

        {/* Backup */}
        <View style={styles.backupSection}>
          <BackupCard />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  
  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
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
  
  // Month Navigator
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  navBtnText: {
    fontSize: 28,
    color: colors.text,
    marginTop: -2,
  },
  monthCenter: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  statsBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  statsBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  
  // Weekday Section
  weekdaySection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  weekdayLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  weekdayChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekdayChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  weekdayTextOn: {
    color: colors.primaryText,
  },
  addWeekdayBtn: {
    backgroundColor: colors.primarySoft,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addWeekdayBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  
  // Calendar Section
  calendarSection: {
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    color: colors.muted,
  },
  
  // Sessions Section
  sessionsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sessionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sessionsSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  sessionsList: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptySessions: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 12,
  },
  sessionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.line,
  },
  sessionDotSaved: {
    backgroundColor: colors.primary,
  },
  sessionDate: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sessionMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sessionAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  muted: {
    color: colors.muted,
    fontWeight: '500',
  },
  moreBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  moreBtnText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  
  // Bottom Scrollable Section
  bottomScroll: {
    flex: 1,
    marginTop: 16,
  },
  bottomContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 12,
  },
  bottomCard: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  
  // Input
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  
  // Backup
  backupSection: {
    marginTop: 4,
  },
});
