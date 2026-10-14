import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import { ImageEdit } from './ImageEdit';
import { colors, radius, space } from '../theme';
import type { ExtraShuttle, SessionCourt } from '../types';
import {
  courtFeeFrom,
  extraShuttleFee,
  formatHours,
  groupUsagesBySlot,
  shuttleFee,
  usageHours,
} from '../utils/calc';
import { formatDateLongVi } from '../utils/date';
import { formatVnd } from '../utils/money';

type Group = {
  key: string;
  name: string;
  items: SessionCourt[];
};

type AttendeeShare = {
  name: string;
  hours: number;
  amount: number;
};

type Props = {
  visible: boolean;
  date: string;
  venueGroups: Group[];
  usages: SessionCourt[];
  shuttleName: string;
  shuttleCount: number;
  shuttlePrice: number;
  extras: ExtraShuttle[];
  people: number;
  attendeeNames: string[];
  attendees?: AttendeeShare[];
  uneven?: boolean;
  fullHours?: number;
  share: number;
  onClose: () => void;
};

function timeSpan(usages: SessionCourt[]): string | null {
  const timed = usages.filter((item) => item.startTime && item.endTime);
  if (!timed.length) return null;
  const starts = timed.map((item) => item.startTime).sort();
  const ends = timed.map((item) => item.endTime).sort();
  return `${starts[0]} – ${ends[ends.length - 1]}`;
}

export function DayBrief({
  visible,
  date,
  venueGroups,
  usages,
  shuttleName,
  shuttleCount,
  shuttlePrice,
  extras,
  people,
  attendeeNames,
  attendees = [],
  uneven = false,
  fullHours = 0,
  share,
  onClose,
}: Props) {
  const shotRef = useRef<ViewShotRef>(null);
  const [busy, setBusy] = useState(false);
  const [editUri, setEditUri] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setEditUri(null);
  }, [visible]);
  const courtFee = courtFeeFrom(usages);
  const shuttle = shuttleFee(shuttleCount, shuttlePrice);
  const extra = extraShuttleFee(extras);
  const total = courtFee + shuttle + extra;
  const hasShuttle = shuttleCount > 0 || extras.some((item) => item.count > 0);
  const showMoney = hasShuttle;
  const span = timeSpan(usages);
  const activeCourts = venueGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => usageHours(item) > 0),
    }))
    .filter((group) => group.items.length > 0);
  const guestCount = Math.max(0, people - attendeeNames.length);
  const memberCount = attendeeNames.length || people;
  const attendeeRows =
    attendees.length > 0
      ? attendees
      : attendeeNames.map((name) => ({ name, hours: fullHours, amount: share }));

  const captureForEdit = async () => {
    try {
      setBusy(true);
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      setEditUri(uri);
    } catch (error) {
      Alert.alert('Chụp thất bại', error instanceof Error ? error.message : 'Thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      {editUri ? (
        <ImageEdit uri={editUri} onClose={() => setEditUri(null)} />
      ) : (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ViewShot ref={shotRef} style={styles.sheet} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>BADMINTON</Text>
            <Text style={styles.date}>{formatDateLongVi(date)}</Text>
            {span ? <Text style={styles.span}>{span}</Text> : null}
          </View>

          <View style={styles.body}>
            <Text style={styles.section}>Sân</Text>
            {activeCourts.length === 0 ? (
              <Text style={styles.empty}>Chưa chọn sân</Text>
            ) : (
              activeCourts.map((group) => (
                <View key={group.key} style={styles.block}>
                  <Text style={styles.venue}>{group.name}</Text>
                  {groupUsagesBySlot(group.items).map((slot) => (
                    <View key={slot.key} style={styles.line}>
                      <Text style={styles.lineName}>{slot.name}</Text>
                      <Text style={styles.lineMeta}>
                        {slot.items
                          .map((item) =>
                            item.startTime && item.endTime
                              ? `${item.startTime}–${item.endTime}`
                              : `${formatHours(usageHours(item))}h`,
                          )
                          .join(' · ')}
                        {` · ${formatHours(slot.hours)} giờ`}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}

            <Text style={styles.section}>Người chơi ({memberCount})</Text>
            {attendeeNames.length ? (
              uneven ? (
                <View>
                  {attendeeRows.map((person, index) => (
                    <View key={`${person.name}-${index}`} style={styles.shareRow}>
                      <Text style={styles.memberIndex}>{index + 1}.</Text>
                      <Text style={styles.shareName} numberOfLines={1}>
                        {person.name}
                        {fullHours > 0 && Math.abs(person.hours - fullHours) > 0.001
                          ? ` · ${formatHours(person.hours)}h`
                          : ''}
                      </Text>
                      {showMoney ? (
                        <Text style={styles.shareAmount}>{formatVnd(person.amount)}</Text>
                      ) : null}
                    </View>
                  ))}
                  {guestCount > 0 ? (
                    <Text style={styles.people}>+{guestCount} khách</Text>
                  ) : null}
                </View>
              ) : (
              <View style={styles.memberGrid}>
                {attendeeNames.map((name, index) => (
                  <View key={`${name}-${index}`} style={styles.memberCell}>
                    <Text style={styles.memberIndex}>{index + 1}.</Text>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                ))}
                {guestCount > 0 ? (
                  <View style={styles.memberCell}>
                    <Text style={styles.memberIndex}>{attendeeNames.length + 1}.</Text>
                    <Text style={styles.memberName}>+{guestCount} khách</Text>
                  </View>
                ) : null}
              </View>
              )
            ) : (
              <Text style={styles.empty}>{people > 0 ? `${people} người` : 'Chưa chọn người'}</Text>
            )}

            {hasShuttle ? (
              <>
                <Text style={styles.section}>Cầu</Text>
                {shuttleCount > 0 ? (
                  <Text style={styles.people}>
                    {shuttleName || 'Cầu tháng'} · {shuttleCount} trái
                  </Text>
                ) : null}
                {extras
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <Text key={item.id} style={styles.people}>
                      {item.name.trim() || 'Cầu khác'} · {item.count} trái
                    </Text>
                  ))}
              </>
            ) : null}

            {showMoney ? (
              <View style={styles.footer}>
                <Text style={styles.sectionFirst}>Chi tiết</Text>
                {activeCourts.length === 0 ? (
                  <View style={styles.moneyRow}>
                    <Text style={styles.moneyLabel}>Sân</Text>
                    <Text style={styles.moneyValue}>{formatVnd(0)}</Text>
                  </View>
                ) : (
                  activeCourts.flatMap((group) =>
                    groupUsagesBySlot(group.items).map((slot) => (
                      <View key={slot.key} style={styles.moneyRow}>
                        <Text style={styles.moneyLabel} numberOfLines={2}>
                          {slot.name} · {formatHours(slot.hours)}h
                        </Text>
                        <Text style={styles.moneyValue}>{formatVnd(slot.fee)}</Text>
                      </View>
                    )),
                  )
                )}
                {shuttleCount > 0 ? (
                  <View style={styles.moneyRow}>
                    <Text style={styles.moneyLabel}>
                      {shuttleName || 'Cầu tháng'} · {shuttleCount} trái
                    </Text>
                    <Text style={styles.moneyValue}>{formatVnd(shuttle)}</Text>
                  </View>
                ) : null}
                {extras
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <View key={item.id} style={styles.moneyRow}>
                      <Text style={styles.moneyLabel}>
                        {item.name.trim() || 'Cầu khác'} · {item.count} trái
                      </Text>
                      <Text style={styles.moneyValue}>{formatVnd(item.count * item.price)}</Text>
                    </View>
                  ))}
                <View style={styles.footerTotals}>
                  {people > 0 && !uneven ? (
                    <View>
                      <Text style={styles.eachLabel}>Mỗi người</Text>
                      <Text style={styles.eachValue}>{formatVnd(share)}</Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  <View style={styles.totalBox}>
                    <Text style={styles.eachLabel}>Tổng</Text>
                    <Text style={styles.totalValue}>{formatVnd(total)}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ViewShot>

        <View style={styles.actions}>
          <Pressable onPress={() => void captureForEdit()} style={styles.sendBtn} disabled={busy}>
            <Text style={styles.sendText}>{busy ? 'Đang chụp…' : 'Chụp để chỉnh'}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Đóng</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B5C38',
    paddingHorizontal: space.md,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 22,
    overflow: 'hidden',
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: 18,
  },
  kicker: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  date: {
    color: colors.primaryText,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
  span: {
    color: colors.primaryText,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: 12,
  },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  empty: {
    fontSize: 16,
    color: colors.muted,
  },
  block: {
    marginBottom: 6,
  },
  venue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  lineName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  lineMeta: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
  },
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberCell: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    paddingVertical: 3,
  },
  memberIndex: {
    width: 22,
    fontSize: 15,
    fontWeight: '700',
    color: colors.muted,
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 3,
    gap: 4,
  },
  shareName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  shareAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  people: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    fontWeight: '500',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  sectionFirst: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 3,
    gap: 8,
  },
  moneyLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  moneyValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '700',
  },
  footerTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  eachLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eachValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 2,
  },
  totalBox: {
    alignItems: 'flex-end',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  sendBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  closeBtn: {
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  closeText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryText,
  },
});
