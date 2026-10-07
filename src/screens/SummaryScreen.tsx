import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, PaidChip, SectionTitle } from '../components/ui';
import { useStore } from '../store';
import { colors, space } from '../theme';
import { memberSummaries, monthTotals } from '../utils/calc';
import { addMonths, monthLabel } from '../utils/date';
import { formatVnd } from '../utils/money';

type Props = {
  monthId: string;
  onChangeMonth: (monthId: string) => void;
};

export function SummaryScreen({ monthId, onChangeMonth }: Props) {
  const store = useStore();
  const month = store.month(monthId);
  const members = store.data.members;
  const totals = monthTotals(month);
  const rows = memberSummaries(month, members);
  const owedTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const paidTotal = rows.reduce((sum, row) => sum + row.paidAmount, 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
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
        <SectionTitle>Cả tháng</SectionTitle>
        <Text style={styles.big}>{formatVnd(totals.total)}</Text>
        <Text style={styles.meta}>
          {totals.savedCount}/{totals.sessionCount} buổi đã nhập
          {month.shuttlePrice > 0 ? ` · cầu ${formatVnd(month.shuttlePrice)}/trái` : ''}
        </Text>
        {owedTotal > 0 ? (
          <Text style={styles.meta}>
            Đã chuyển {formatVnd(paidTotal)} · còn {formatVnd(Math.max(0, owedTotal - paidTotal))}
          </Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Từng người</SectionTitle>
        {members.length === 0 ? (
          <Text style={styles.empty}>
            Thêm thành viên rồi chọn họ trong từng buổi để app cộng nợ theo người.
          </Text>
        ) : rows.every((row) => row.sessions === 0) ? (
          <Text style={styles.empty}>Chưa có buổi nào chọn tên người đánh.</Text>
        ) : (
          <>
            {rows.map((row) => (
              <View key={row.member.id} style={styles.personRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{row.member.name}</Text>
                  <Text style={styles.meta}>
                    {row.sessions} buổi · {formatVnd(row.amount)}
                    {row.sessions > 0
                      ? row.allPaid
                        ? ' · đã chuyển hết'
                        : ` · còn ${formatVnd(row.remaining)}`
                      : ''}
                  </Text>
                </View>
                {row.sessions > 0 ? (
                  <PaidChip
                    paid={row.allPaid}
                    onPress={() => store.setMemberMonthPaid(monthId, row.member.id, !row.allPaid)}
                  />
                ) : null}
              </View>
            ))}
            <Text style={styles.footer}>
              Bấm Đã chuyển / Chưa chuyển để đánh dấu cả tháng. Trong từng buổi vẫn đánh dấu từng người.
            </Text>
          </>
        )}
      </Card>
    </ScrollView>
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
  big: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 12,
  },
  personName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
});
