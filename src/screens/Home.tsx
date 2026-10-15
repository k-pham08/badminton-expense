import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { TabName } from '../types';
import { currentMonthId } from '../utils/date';
import { CourtsScreen } from './CourtsScreen';
import { MembersScreen } from './MembersScreen';
import { MonthScreen } from './MonthScreen';
import { SessionScreen } from './SessionScreen';
import { SummaryScreen } from './SummaryScreen';
import { ZaloScreen } from './ZaloScreen';

const TABS: { key: TabName; label: string; icon: string }[] = [
  { key: 'month', label: 'Tháng', icon: '📅' },
  { key: 'summary', label: 'Tổng kết', icon: '📊' },
  { key: 'members', label: 'Thành viên', icon: '👥' },
  { key: 'courts', label: 'Sân', icon: '🏸' },
  { key: 'zalo', label: 'Zalo', icon: '⚡' },
];

export function Home() {
  const insets = useSafeAreaInsets();
  const [monthId, setMonthId] = useState(currentMonthId);
  const [tab, setTab] = useState<TabName>('month');
  const [sessionDate, setSessionDate] = useState<string | null>(null);

  if (sessionDate) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <SessionScreen monthId={monthId} date={sessionDate} onBack={() => setSessionDate(null)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        {tab === 'month' ? (
          <MonthScreen
            monthId={monthId}
            onChangeMonth={setMonthId}
            onOpenSession={setSessionDate}
          />
        ) : null}
        {tab === 'summary' ? (
          <SummaryScreen monthId={monthId} onChangeMonth={setMonthId} />
        ) : null}
        {tab === 'members' ? <MembersScreen /> : null}
        {tab === 'courts' ? <CourtsScreen /> : null}
        {tab === 'zalo' ? <ZaloScreen monthId={monthId} /> : null}
      </View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={styles.tab}
            >
              <Text style={styles.tabIcon}>{item.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
