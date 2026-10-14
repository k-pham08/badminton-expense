import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackupCard } from '../components/BackupCard';
import { Calendar } from '../components/Calendar';
import { Card, MoneyInput, SectionTitle, TextField } from '../components/ui';
import { lastSavedSession, useStore } from '../store';
import { colors, space } from '../theme';
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
  const month = store.month(monthId);
  const [shuttleNameDraft, setShuttleNameDraft] = useState(month.shuttleName ?? '');
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

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.monthNav}>
        <Pressable onPress={() => onChangeMonth(addMonths(monthId, -1))} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{monthLabel(monthId)}</Text>
        <Pressable onPress={() => onChangeMonth(addMonths(monthId, 1))} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      <Card>
        <SectionTitle>Cầu dùng cả tháng</SectionTitle>
        <Text style={styles.hint}>Tên và giá 1 trái. Dùng cho mọi buổi, trừ loại cầu phát sinh.</Text>
        <TextField
          label="Tên cầu"
          value={shuttleNameDraft}
          onChangeText={setShuttleNameDraft}
          onBlur={() => store.setShuttleName(monthId, shuttleNameDraft)}
          onSubmitEditing={() => store.setShuttleName(monthId, shuttleNameDraft)}
          placeholder="Yonex, cầu chính..."
        />
        <MoneyInput
          label="Giá 1 trái"
          value={month.shuttlePrice}
          onChange={(price) => store.setShuttlePrice(monthId, price)}
          placeholder="26.000"
        />
      </Card>

      <Card>
        <SectionTitle>Thứ đánh cả tháng</SectionTitle>
        <Text style={styles.hint}>
          Chọn một lần, áp dụng mọi tuần. Ví dụ T3 và T6. Muốn đổi sân/người thì vào đúng ngày đó.
        </Text>
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
      </Card>

      <Card>
        <SectionTitle>Ngày đánh</SectionTitle>
        <Text style={styles.hint}>Chạm ngày để xem hoặc chỉnh. Giữ lâu để bỏ ngày này.</Text>
        <Calendar
          monthId={monthId}
          playingDates={month.playingDates}
          savedDates={savedDates}
          onPressDate={onPressDate}
          onLongPressDate={onLongPressDate}
        />
        <View style={styles.legend}>
          <Legend color={colors.primarySoft} label="Đã chọn" />
          <Legend color={colors.primary} label="Đã nhập tiền" light />
        </View>
      </Card>

      <Card>
        <SectionTitle>Các buổi ({month.playingDates.length})</SectionTitle>
        {month.playingDates.length === 0 ? (
          <Text style={styles.empty}>Chọn thứ đánh ở trên, hoặc chạm một ngày trên lịch để thêm lẻ.</Text>
        ) : (
          month.playingDates.map((date) => {
            const session = month.sessions[date];
            const split = session?.saved ? sessionSplit(session, month.shuttlePrice) : null;
            const last = lastSavedSession(month, date);
            return (
              <Pressable
                key={date}
                onPress={() => onOpenSession(date)}
                onLongPress={() => onLongPressDate(date)}
                style={styles.sessionRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionDate}>{formatDateVi(date)}</Text>
                  <Text style={styles.sessionMeta}>
                    {split
                      ? `${split.people} người · ${split.pieces} trái cầu${
                          session.attendeeIds.length
                            ? ` · ${split.paidCount}/${session.attendeeIds.length} đã chuyển`
                            : ''
                        }`
                      : last
                        ? 'Chưa nhập — bấm để điền'
                        : 'Chưa nhập'}
                  </Text>
                </View>
                <Text style={[styles.sessionAmount, !split && styles.muted]}>
                  {split
                    ? split.uneven
                      ? formatVnd(split.total)
                      : `${formatVnd(split.perPerson)}/người`
                    : '—'}
                </Text>
              </Pressable>
            );
          })
        )}
      </Card>

      <BackupCard />
    </ScrollView>
  );
}

function Legend({ color, label, light }: { color: string; label: string; light?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, light && { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    paddingBottom: 40,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 28,
    color: colors.text,
    marginTop: -2,
  },
  monthTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 20,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  weekdayChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekdayChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  weekdayTextOn: {
    color: colors.primaryText,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
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
    fontSize: 13,
    color: colors.muted,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  sessionDate: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  sessionMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  sessionAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  muted: {
    color: colors.muted,
    fontWeight: '500',
  },
});
