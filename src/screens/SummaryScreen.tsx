import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, PaidChip } from '../components/ui';
import { useStore } from '../store';
import { colors, radius } from '../theme';
import { memberSummaries, monthTotals } from '../utils/calc';
import { addMonths, monthLabel } from '../utils/date';
import { formatVnd } from '../utils/money';

type Props = {
  monthId: string;
  onChangeMonth: (monthId: string) => void;
};

type Tab = 'overview' | 'members' | 'stats' | 'settings';

export function SummaryScreen({ monthId, onChangeMonth }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const month = store.month(monthId);
  const members = store.data.members;
  const totals = monthTotals(month);
  const rows = memberSummaries(month, members);
  const owedTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const paidTotal = rows.reduce((sum, row) => sum + row.paidAmount, 0);

  const [tab, setTab] = useState<Tab>('overview');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Tổng kết</Text>
        <Text style={styles.headerSubtitle}>Badminton Expense</Text>
      </View>

      {/* Month Navigator */}
      <View style={styles.monthNav}>
        <Pressable onPress={() => onChangeMonth(addMonths(monthId, -1))} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{monthLabel(monthId)}</Text>
        <Pressable onPress={() => onChangeMonth(addMonths(monthId, 1))} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabNav}>
        <Pressable
          style={[styles.tabItem, tab === 'overview' && styles.tabItemActive]}
          onPress={() => setTab('overview')}
        >
          <Text style={[styles.tabItemText, tab === 'overview' && styles.tabItemTextActive]}>📈 Tổng quan</Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, tab === 'members' && styles.tabItemActive]}
          onPress={() => setTab('members')}
        >
          <Text style={[styles.tabItemText, tab === 'members' && styles.tabItemTextActive]}>👥 Theo người</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <>
            {/* Main Stats Card */}
            <Card>
              <Text style={styles.cardTitle}>💰 Tổng chi phí</Text>
              <Text style={styles.bigValue}>{formatVnd(totals.total)}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  {totals.savedCount}/{totals.sessionCount} buổi đã nhập
                </Text>
              </View>
              {month.shuttlePrice > 0 && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    🏸 Cầu {formatVnd(month.shuttlePrice)}/trái
                  </Text>
                </View>
              )}
            </Card>

            {/* Payment Status Card */}
            {owedTotal > 0 && (
              <Card>
                <Text style={styles.cardTitle}>💸 Trạng thái chuyển tiền</Text>
                <View style={styles.paymentStats}>
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>Tổng nợ</Text>
                    <Text style={styles.paymentValue}>{formatVnd(owedTotal)}</Text>
                  </View>
                  <View style={styles.paymentDivider} />
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>Đã chuyển</Text>
                    <Text style={[styles.paymentValue, { color: colors.primary }]}>
                      {formatVnd(paidTotal)}
                    </Text>
                  </View>
                  <View style={styles.paymentDivider} />
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>Còn lại</Text>
                    <Text style={[styles.paymentValue, { color: colors.danger }]}>
                      {formatVnd(Math.max(0, owedTotal - paidTotal))}
                    </Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Quick Stats */}
            <Card>
              <Text style={styles.cardTitle}>📊 Thống kê nhanh</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{totals.sessionCount}</Text>
                  <Text style={styles.statBoxLabel}>Tổng buổi</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{totals.savedCount}</Text>
                  <Text style={styles.statBoxLabel}>Đã nhập</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{totals.sessionCount - totals.savedCount}</Text>
                  <Text style={styles.statBoxLabel}>Chưa nhập</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{rows.filter(r => r.sessions > 0).length}</Text>
                  <Text style={styles.statBoxLabel}>Người đánh</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* MEMBERS TAB */}
        {tab === 'members' && (
          <>
            {members.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>Chưa có thành viên nào</Text>
                <Text style={styles.emptyHint}>Thêm thành viên rồi chọn họ trong từng buổi để app cộng nợ theo người.</Text>
              </Card>
            ) : rows.every((row) => row.sessions === 0) ? (
              <Card>
                <Text style={styles.emptyText}>Chưa có buổi nào chọn tên người đánh</Text>
                <Text style={styles.emptyHint}>Vào buổi đánh và chọn thành viên để xem thống kê theo người.</Text>
              </Card>
            ) : (
              <>
                <Card>
                  <Text style={styles.cardTitle}>👥 Chi tiêu theo người</Text>
                  <Text style={styles.hint}>
                    Bấm Đã chuyển / Chưa chuyển để đánh dấu cả tháng. Trong từng buổi vẫn đánh dấu từng người.
                  </Text>
                </Card>

                {rows
                  .filter(row => row.sessions > 0)
                  .sort((a, b) => b.amount - a.amount)
                  .map((row) => (
                    <Card key={row.member.id}>
                      <View style={styles.memberRow}>
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>
                            {row.member.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{row.member.name}</Text>
                          <Text style={styles.memberMeta}>
                            {row.sessions} buổi · {formatVnd(row.amount)}
                          </Text>
                        </View>
                        <PaidChip
                          paid={row.allPaid}
                          onPress={() => store.setMemberMonthPaid(monthId, row.member.id, !row.allPaid)}
                        />
                      </View>

                      {/* Payment Detail */}
                      <View style={styles.paymentDetail}>
                        <View style={styles.paymentRow}>
                          <Text style={styles.paymentRowLabel}>Tổng tiền</Text>
                          <Text style={styles.paymentRowValue}>{formatVnd(row.amount)}</Text>
                        </View>
                        <View style={styles.paymentRow}>
                          <Text style={styles.paymentRowLabel}>Đã chuyển</Text>
                          <Text style={[styles.paymentRowValue, { color: colors.primary }]}>
                            {formatVnd(row.paidAmount)}
                          </Text>
                        </View>
                        {!row.allPaid && row.remaining > 0 && (
                          <View style={styles.paymentRow}>
                            <Text style={styles.paymentRowLabel}>Còn lại</Text>
                            <Text style={[styles.paymentRowValue, { color: colors.danger }]}>
                              {formatVnd(row.remaining)}
                            </Text>
                          </View>
                        )}
                        {row.allPaid && (
                          <View style={styles.paidBadge}>
                            <Text style={styles.paidBadgeText}>✓ Đã chuyển hết</Text>
                          </View>
                        )}
                      </View>
                    </Card>
                  ))}
              </>
            )}
          </>
        )}
      </ScrollView>
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
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 20,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  monthTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  tabNav: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabItemText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  tabItemTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },

  // Card
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },

  // Big Value
  bigValue: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    marginVertical: 8,
  },
  metaRow: {
    marginTop: 4,
  },
  metaText: {
    fontSize: 14,
    color: colors.muted,
  },

  // Payment Stats
  paymentStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  paymentItem: {
    alignItems: 'center',
    flex: 1,
  },
  paymentDivider: {
    width: 1,
    backgroundColor: colors.line,
  },
  paymentLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  paymentValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  statBoxValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
  },
  statBoxLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },

  // Hint
  hint: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 20,
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
    lineHeight: 20,
  },

  // Member Row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
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
  memberName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  memberMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },

  // Payment Detail
  paymentDetail: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  paymentRowLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  paymentRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  paidBadge: {
    backgroundColor: colors.primarySoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: 8,
  },
  paidBadgeText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
});
