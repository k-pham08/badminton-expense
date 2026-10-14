import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DayBrief } from '../components/DayBrief';
import { Card, MoneyInput, PaidChip, PrimaryButton, SecondaryButton, SectionTitle, Stepper, TextField } from '../components/ui';
import { lastSavedSession, useStore } from '../store';
import { colors, radius, space } from '../theme';
import type { Court, ExtraShuttle, Session, SessionCourt } from '../types';
import {
  attendeeHoursOf,
  courtCountOf,
  courtFeeFrom,
  courtNumberOf,
  courtsOf,
  extraShuttleFee,
  formatHours,
  groupUsagesBySlot,
  hoursWeight,
  sessionCourtLabel,
  sessionPlayHours,
  sessionSplit,
  sessionTotal,
  shuttleFee,
  slotPricePerHour,
  slotsOf,
  timesHours,
  timesOf,
  usageHours,
} from '../utils/calc';
import { formatDateVi, WEEKDAY_LONG, weekdayMon0FromDateId } from '../utils/date';
import { formatVnd } from '../utils/money';
import { hoursBetween } from '../utils/time';

function newExtraId(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function newUsageId(): string {
  return `cu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

type Props = {
  monthId: string;
  date: string;
  onBack: () => void;
};

export function SessionScreen({ monthId, date, onBack }: Props) {
  const store = useStore();
  const saveSession = store.saveSession;
  const month = store.month(monthId);
  const members = store.data.members;
  const savedCourts = store.data.courts;
  const existing = month.sessions[date];
  const previous = lastSavedSession(month, date);

  const [usages, setUsages] = useState<SessionCourt[]>(() => {
    const source = existing ?? previous;
    if (!source) return [];
    return courtsOf(source).map((item) => ({
      ...item,
      id: existing ? item.id : newUsageId(),
    }));
  });
  const [newCourtName, setNewCourtName] = useState('');
  const [newCourtPrice, setNewCourtPrice] = useState(0);
  const [newSlotNames, setNewSlotNames] = useState(['Sân 1', 'Sân 2']);
  const [newSlotNameByVenue, setNewSlotNameByVenue] = useState<Record<string, string>>({});
  const [shuttleCount, setShuttleCount] = useState(existing?.shuttleCount ?? 0);
  const [extras, setExtras] = useState<ExtraShuttle[]>(
    (existing?.extraShuttles ?? []).map((item) => ({
      ...item,
      name: item.name ?? '',
    })),
  );
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    existing?.attendeeIds ?? previous?.attendeeIds ?? [],
  );
  const [attendeeCount, setAttendeeCount] = useState(
    existing?.attendeeCount ?? previous?.attendeeCount ?? previous?.attendeeIds.length ?? 0,
  );
  const [attendeeHours, setAttendeeHours] = useState<Record<string, number>>(() =>
    attendeeHoursOf({
      attendeeIds: existing?.attendeeIds ?? previous?.attendeeIds ?? [],
      attendeeHours: existing?.attendeeHours ?? previous?.attendeeHours,
    }),
  );
  const [paidIds, setPaidIds] = useState<string[]>(existing?.paidIds ?? []);
  const [newMemberName, setNewMemberName] = useState('');
  const [courtPickerOpen, setCourtPickerOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const shuttlePrice = month.shuttlePrice;
  const shuttleName = (month.shuttleName ?? '').trim();
  const monthlyShuttle = shuttleFee(shuttleCount, shuttlePrice);
  const extraFee = extraShuttleFee(extras);
  const courtFee = courtFeeFrom(usages);
  const sharedTotal = sessionTotal(courtFee, shuttleCount, shuttlePrice, extras);
  const people = attendeeIds.length > 0 ? attendeeIds.length : attendeeCount;
  const fullHours = sessionPlayHours(usages);
  const attendeeNames = members
    .filter((member) => attendeeIds.includes(member.id))
    .map((member) => member.name);

  const venueGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, SessionCourt[]>();
    for (const item of usages) {
      const key = item.courtId || item.id;
      if (!map.has(key)) {
        order.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }
    return order.map((key) => {
      const items = [...(map.get(key) ?? [])].sort((a, b) => {
        const byNumber = courtNumberOf(a) - courtNumberOf(b);
        if (byNumber !== 0) return byNumber;
        return (a.slotName || '').localeCompare(b.slotName || '', 'vi');
      });
      return {
        key,
        items,
        name: items[0]?.name || 'Sân',
        pricePerHour: items[0]?.pricePerHour ?? 0,
      };
    });
  }, [usages]);

  const hasSlotTime = (courtId: string, slotId: string, startTime: string, endTime: string) =>
    usages.some(
      (item) =>
        item.courtId === courtId &&
        item.slotId === slotId &&
        item.startTime === startTime &&
        item.endTime === endTime,
    );

  const addSlotTime = (
    court: Court,
    slot: { id: string; name: string; pricePerHour?: number },
    time: { startTime: string; endTime: string },
    index: number,
  ) => {
    const hours = hoursBetween(time.startTime, time.endTime);
    if (hours <= 0) {
      Alert.alert('Chưa có giờ cố định', 'Thêm giờ bắt đầu / kết thúc cho sân này ở tab Sân.');
      return;
    }
    setUsages((current) => {
      if (
        current.some(
          (item) =>
            item.courtId === court.id &&
            item.slotId === slot.id &&
            item.startTime === time.startTime &&
            item.endTime === time.endTime,
        )
      ) {
        return current;
      }
      return [
        ...current,
        {
          id: newUsageId(),
          courtId: court.id,
          slotId: slot.id,
          name: court.name,
          slotName: slot.name,
          pricePerHour: slotPricePerHour(court, slot),
          courtNumber: index + 1,
          hours,
          startTime: time.startTime,
          endTime: time.endTime,
        },
      ];
    });
  };

  const addVenue = (court: Court) => {
    const slots = slotsOf(court);
    setUsages((current) => {
      const extra: SessionCourt[] = [];
      slots.forEach((slot, index) => {
        timesOf(slot).forEach((time) => {
          const exists = current.some(
            (item) =>
              item.courtId === court.id &&
              item.slotId === slot.id &&
              item.startTime === time.startTime &&
              item.endTime === time.endTime,
          );
          if (exists) return;
          extra.push({
            id: newUsageId(),
            courtId: court.id,
            slotId: slot.id,
            name: court.name,
            slotName: slot.name,
            pricePerHour: slotPricePerHour(court, slot),
            courtNumber: index + 1,
            hours: hoursBetween(time.startTime, time.endTime),
            startTime: time.startTime,
            endTime: time.endTime,
          });
        });
      });
      return extra.length ? [...current, ...extra] : current;
    });
  };

  const removeUsage = (id: string) => {
    setUsages((current) => current.filter((item) => item.id !== id));
  };

  const saveAndAddCourt = () => {
    const venue = store.addCourt(newCourtName, newCourtPrice, newSlotNames);
    if (!venue) {
      Alert.alert('Thiếu thông tin sân', 'Nhập tên chi nhánh và giá 1 giờ.');
      return;
    }
    addVenue(venue);
    setNewCourtName('');
    setNewCourtPrice(0);
    setNewSlotNames(['Sân 1', 'Sân 2']);
  };

  const addNamedSlotToVenue = (courtId: string) => {
    const slotName = (newSlotNameByVenue[courtId] ?? '').trim();
    const slotId = store.addCourtSlot(courtId, slotName);
    if (!slotId) {
      Alert.alert('Thiếu tên sân', 'Nhập tên sân rồi thêm.');
      return;
    }
    setNewSlotNameByVenue((current) => ({ ...current, [courtId]: '' }));
  };

  const removeVenue = (courtId: string) => {
    setUsages((current) => current.filter((item) => item.courtId !== courtId));
  };

  const addExtra = () => {
    setExtras((current) => [...current, { id: newExtraId(), name: '', price: 0, count: 1 }]);
  };

  const updateExtra = (id: string, patch: Partial<ExtraShuttle>) => {
    setExtras((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeExtra = (id: string) => {
    setExtras((current) => current.filter((item) => item.id !== id));
  };

  const toggleMember = (id: string) => {
    setAttendeeIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      setAttendeeCount((count) => {
        if (next.length > current.length) return Math.max(count, next.length);
        return Math.max(next.length, count - 1);
      });
      setPaidIds((paid) => paid.filter((paidId) => next.includes(paidId)));
      if (!next.includes(id)) {
        setAttendeeHours((hours) => {
          const { [id]: _, ...rest } = hours;
          return rest;
        });
      }
      return next;
    });
  };

  const setMemberHours = (id: string, hours: number) => {
    setAttendeeHours((current) => {
      if (fullHours > 0 && Math.abs(hours - fullHours) < 0.001) {
        const { [id]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: hours };
    });
  };

  const togglePaid = (memberId: string) => {
    const next = paidIds.includes(memberId)
      ? paidIds.filter((id) => id !== memberId)
      : [...paidIds, memberId];
    const allowed = next.filter((id) => attendeeIds.includes(id));
    setPaidIds(allowed);
  };

  const onChangePeople = (n: number) => {
    setAttendeeCount(n);
    if (n < attendeeIds.length) {
      setAttendeeIds((ids) => {
        const next = ids.slice(0, n);
        setAttendeeHours((hours) => attendeeHoursOf({ attendeeIds: next, attendeeHours: hours }));
        return next;
      });
    }
  };

  const selectAll = () => {
    const ids = members.map((m) => m.id);
    setAttendeeIds(ids);
    setAttendeeCount(ids.length);
  };

  const addMemberToDay = () => {
    const id = store.addMember(newMemberName);
    if (!id) return;
    setAttendeeIds((current) => (current.includes(id) ? current : [...current, id]));
    setNewMemberName('');
  };

  const sessionDraft = useMemo<Session>(() => {
    const hasContent =
      courtFee > 0 ||
      shuttleCount > 0 ||
      extras.some((item) => item.count > 0 && item.price > 0) ||
      attendeeIds.length > 0;
    return {
      date,
      courtFee,
      courts: usages
        .filter((item) => usageHours(item) > 0 && item.pricePerHour > 0)
        .map((item) => ({ ...item, hours: usageHours(item) })),
      shuttleCount,
      extraShuttles: extras.map((item) => ({ ...item, name: item.name.trim() })),
      attendeeIds,
      attendeeCount: people,
      attendeeHours: attendeeHoursOf({ attendeeIds, attendeeHours }),
      paidIds: paidIds.filter((id) => attendeeIds.includes(id)),
      saved: hasContent,
    };
  }, [attendeeCount, attendeeHours, attendeeIds, courtFee, date, extras, paidIds, people, shuttleCount, usages]);

  const split = sessionSplit(sessionDraft, shuttlePrice);
  const share = split.perPerson;

  const persist = useCallback(() => {
    saveSession(monthId, sessionDraft);
  }, [monthId, saveSession, sessionDraft]);

  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    persist();
  }, [persist]);

  const goBack = () => {
    persist();
    onBack();
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Tháng</Text>
        </Pressable>
        <Text style={styles.title}>{formatDateVi(date)}</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Card>
          <SectionTitle>Chi phí buổi này</SectionTitle>
          {venueGroups.map((group) => (
            <View key={group.key} style={styles.courtBlock}>
              <View style={styles.extraHeader}>
                <Text style={styles.extraTitle}>{group.name}</Text>
                <Pressable onPress={() => removeVenue(group.key)}>
                  <Text style={styles.deleteText}>Xóa</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Giá theo từng sân · mặc định chi nhánh {formatVnd(group.pricePerHour)}/h</Text>
              {groupUsagesBySlot(group.items).map((slot) => (
                <View key={slot.key} style={styles.courtNumberBlock}>
                  <View style={styles.extraHeader}>
                    <Text style={styles.extraTitle}>{slot.name}</Text>
                    <Pressable
                      onPress={() => {
                        const ids = new Set(slot.items.map((item) => item.id));
                        setUsages((current) => current.filter((item) => !ids.has(item.id)));
                      }}
                    >
                      <Text style={styles.deleteText}>Xóa</Text>
                    </Pressable>
                  </View>
                  {slot.items.map((item) => (
                    <Text key={item.id} style={styles.hint}>
                      {item.startTime && item.endTime
                        ? `${item.startTime}–${item.endTime}`
                        : `${formatHours(usageHours(item))} giờ`}
                    </Text>
                  ))}
                  {slot.hours > 0 ? (
                    <Text style={styles.computed}>
                      Tổng {formatHours(slot.hours)} giờ × {formatVnd(slot.items[0]?.pricePerHour ?? 0)} ={' '}
                      {formatVnd(slot.fee)}
                    </Text>
                  ) : (
                    <Text style={styles.hint}>Chưa có giờ cố định — thêm ở tab Sân</Text>
                  )}
                </View>
              ))}
            </View>
          ))}
          <View style={{ marginTop: venueGroups.length ? 8 : 0 }}>
            <PrimaryButton label="Thêm sân / chi nhánh" onPress={() => setCourtPickerOpen(true)} />
          </View>
          {usages.length === 0 ? (
            <Text style={[styles.hint, { marginTop: 8 }]}>Chưa có sân. Bấm Thêm sân / chi nhánh.</Text>
          ) : (
            <Text style={[styles.computed, { marginTop: 12 }]}>
              Tổng sân: {formatVnd(courtFee)}
              {fullHours > 0 ? ` · ${formatHours(fullHours)} giờ` : ''}
            </Text>
          )}
          <View style={styles.shuttleDivider} />
          <Stepper
            label={shuttleName ? `Số trái ${shuttleName}` : 'Số trái cầu'}
            value={shuttleCount}
            onChange={setShuttleCount}
          />
          <Text style={styles.computed}>
            {shuttlePrice > 0
              ? `${shuttleName ? shuttleName + ' · ' : ''}${shuttleCount} × ${formatVnd(shuttlePrice)} = ${formatVnd(monthlyShuttle)}`
              : 'chưa đặt giá cầu tháng'}
          </Text>

          {extras.map((item, index) => (
            <View key={item.id} style={styles.extraBlock}>
              <View style={styles.extraHeader}>
                <Text style={styles.extraTitle}>{item.name.trim() || `Cầu khác ${index + 1}`}</Text>
                <Pressable onPress={() => removeExtra(item.id)}>
                  <Text style={styles.deleteText}>Xóa</Text>
                </Pressable>
              </View>
              <TextField
                label="Tên cầu"
                value={item.name}
                onChangeText={(name) => updateExtra(item.id, { name })}
                placeholder="Cầu tập, cầu vàng..."
              />
              <MoneyInput
                label="Giá 1 trái"
                value={item.price}
                onChange={(price) => updateExtra(item.id, { price })}
                placeholder="35.000"
              />
              <Stepper
                label="Số trái"
                value={item.count}
                onChange={(count) => updateExtra(item.id, { count })}
              />
              <Text style={styles.computed}>
                {item.price > 0
                  ? `${item.count} × ${formatVnd(item.price)} = ${formatVnd(item.count * item.price)}`
                  : 'nhập giá loại cầu này'}
              </Text>
            </View>
          ))}

          <View style={{ marginTop: extras.length ? 4 : 12 }}>
            <SecondaryButton label="Thêm loại cầu khác" onPress={addExtra} />
          </View>
        </Card>

        <Card>
          <SectionTitle>Người đánh ({people})</SectionTitle>
          <Text style={styles.hint}>
            Chọn ai đánh hôm nay. Ở phần chia tiền, ai đến trễ / về sớm thì bớt giờ.
          </Text>
          {members.length > 0 ? (
            <View style={styles.memberHeader}>
              <Pressable onPress={selectAll}>
                <Text style={styles.link}>Chọn tất cả</Text>
              </Pressable>
            </View>
          ) : null}
          {members.map((member) => {
            const checked = attendeeIds.includes(member.id);
            return (
              <Pressable
                key={member.id}
                onPress={() => toggleMember(member.id)}
                style={styles.memberRow}
              >
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text style={styles.memberName}>{member.name}</Text>
              </Pressable>
            );
          })}
          <TextField
            label="Thêm thành viên vào buổi này"
            value={newMemberName}
            onChangeText={setNewMemberName}
            placeholder="Tên người đánh"
            onSubmitEditing={addMemberToDay}
          />
          <SecondaryButton label="Lưu và thêm vào buổi này" onPress={addMemberToDay} />
          {attendeeIds.length === 0 ? (
            <>
              <Text style={[styles.hint, { marginTop: 12 }]}>
                Chưa chọn tên thì nhập số người để chia tạm.
              </Text>
              <Stepper label="Số người chia" value={attendeeCount} onChange={onChangePeople} min={0} />
            </>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>Chia tiền</SectionTitle>
          {usages.filter((item) => usageHours(item) > 0 && item.pricePerHour > 0).length === 0 ? (
            <Row label="Sân" value={formatVnd(0)} />
          ) : (
            groupUsagesBySlot(
              usages.filter((item) => usageHours(item) > 0 && item.pricePerHour > 0),
            ).map((slot) => (
              <Row
                key={slot.key}
                label={`${sessionCourtLabel(slot.items[0])} · ${formatHours(slot.hours)}h`}
                value={formatVnd(slot.fee)}
              />
            ))
          )}
          <Row
            label={shuttleName || (extraFee > 0 ? 'Cầu tháng' : 'Cầu')}
            value={formatVnd(monthlyShuttle)}
          />
          {extras
            .filter((item) => item.count > 0 && item.price > 0)
            .map((item) => (
              <Row
                key={item.id}
                label={item.name.trim() || 'Cầu khác'}
                value={formatVnd(item.count * item.price)}
              />
            ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tổng</Text>
            <Text style={styles.totalValue}>{formatVnd(sharedTotal)}</Text>
          </View>
          <View style={styles.shareBox}>
            {split.uneven ? (
              <>
                <Text style={styles.shareLabel}>{people} người · chia theo giờ đánh</Text>
                <Text style={styles.shareNote}>
                  Đủ {formatHours(split.fullHours)} giờ (tổng mọi sân) trả nhiều hơn người ít giờ hơn. Làm tròn 1.000đ.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.shareLabel}>
                  {people > 0 ? `${people} người, mỗi người` : 'Mỗi người'}
                </Text>
                <Text style={styles.shareValue}>{people > 0 ? formatVnd(share) : '—'}</Text>
                {people > 0 ? (
                  <Text style={styles.shareNote}>Làm tròn 1.000đ cho dễ chuyển.</Text>
                ) : null}
              </>
            )}
          </View>
          {attendeeIds.length > 0 ? (
            <View style={styles.payList}>
              <Text style={styles.payHint}>
                {fullHours > 0
                  ? `Mặc định ${formatHours(fullHours)} giờ (tổng mọi sân). Ai đánh ít hơn thì bớt giờ. Đánh dấu đã chuyển.`
                  : 'Đánh dấu ai đã chuyển tiền'}
              </Text>
              {members
                .filter((member) => attendeeIds.includes(member.id))
                .map((member) => {
                  const hours = hoursWeight(attendeeHours[member.id], fullHours);
                  const amount = split.byMemberId[member.id] ?? share;
                  return (
                    <View key={member.id} style={styles.payBlock}>
                      <View style={styles.payRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{member.name}</Text>
                          <Text style={styles.payAmount}>
                            {fullHours > 0
                              ? `${formatHours(hours)} giờ · ${formatVnd(amount)}`
                              : formatVnd(amount)}
                          </Text>
                        </View>
                        <PaidChip paid={paidIds.includes(member.id)} onPress={() => togglePaid(member.id)} />
                      </View>
                      {fullHours > 0 ? (
                        <Stepper
                          value={hours}
                          onChange={(value) => setMemberHours(member.id, value)}
                          min={0.5}
                          max={fullHours}
                          step={0.5}
                          format={(value) => `${formatHours(value)}h`}
                        />
                      ) : null}
                    </View>
                  );
                })}
            </View>
          ) : null}
        </Card>

        <PrimaryButton
          label="Thông tin gửi nhóm"
          onPress={() => {
            persist();
            setBriefOpen(true);
          }}
        />
        <View style={{ height: 10 }} />
        <SecondaryButton
          label={`Áp dụng cho mọi ${WEEKDAY_LONG[weekdayMon0FromDateId(date)]}`}
          onPress={() => {
            persist();
            store.applySessionToWeekday(monthId, sessionDraft);
            Alert.alert(
              'Đã áp dụng',
              `Sân, cầu và người chơi của ngày này đã copy sang mọi ${WEEKDAY_LONG[weekdayMon0FromDateId(date)]} trong tháng. Ngày đã chỉnh riêng vẫn bị ghi đè.`,
            );
          }}
        />

      </ScrollView>

      <DayBrief
        visible={briefOpen}
        date={date}
        venueGroups={venueGroups}
        usages={usages}
        shuttleName={shuttleName}
        shuttleCount={shuttleCount}
        shuttlePrice={shuttlePrice}
        extras={extras}
        people={people}
        attendeeNames={attendeeNames}
        attendees={members
          .filter((member) => attendeeIds.includes(member.id))
          .map((member) => ({
            name: member.name,
            hours: split.hoursByMemberId[member.id] ?? split.fullHours,
            amount: split.byMemberId[member.id] ?? share,
          }))}
        uneven={split.uneven}
        fullHours={split.fullHours}
        share={share}
        onClose={() => setBriefOpen(false)}
      />

      <Modal visible={courtPickerOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.pickerSafe}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Thêm sân</Text>
            <Pressable onPress={() => setCourtPickerOpen(false)}>
              <Text style={styles.link}>Xong</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.pickerBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          >
            <Text style={styles.hint}>
              Giờ lấy từ tab Sân (bước 5 phút). Sân đã thêm được tô xanh.
            </Text>
            {savedCourts.length === 0 ? (
              <Text style={styles.hint}>Chưa có chi nhánh lưu. Tạo mới bên dưới.</Text>
            ) : (
              savedCourts.map((court) => {
                const slots = slotsOf(court);
                const combos = slots.flatMap((slot) => timesOf(slot));
                const addedCount = slots.reduce(
                  (sum, slot) =>
                    sum +
                    timesOf(slot).filter((time) =>
                      hasSlotTime(court.id, slot.id, time.startTime, time.endTime),
                    ).length,
                  0,
                );
                const venueActive = addedCount > 0;
                return (
                  <View key={court.id} style={[styles.pickerVenue, venueActive && styles.pickerVenueOn]}>
                    <View style={styles.extraHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.extraTitle}>{court.name}</Text>
                        <Text style={styles.hint}>
                          {addedCount}/{Math.max(combos.length, 0)} khung giờ · tổng{' '}
                          {formatHours(timesHours(combos))} giờ · {formatVnd(court.pricePerHour)}/h
                        </Text>
                      </View>
                      <Pressable onPress={() => addVenue(court)}>
                        <Text style={styles.link}>Thêm tất cả</Text>
                      </Pressable>
                    </View>
                    {slots.map((slot, index) => {
                      const times = timesOf(slot);
                      if (times.length === 0) {
                        return (
                          <View key={slot.id} style={styles.slotPick}>
                            <Text style={styles.slotPickText}>{slot.name}</Text>
                            <Text style={styles.slotPickMeta}>Chưa có giờ</Text>
                          </View>
                        );
                      }
                      return times.map((time) => {
                        const added = hasSlotTime(court.id, slot.id, time.startTime, time.endTime);
                        return (
                          <Pressable
                            key={`${slot.id}-${time.id}`}
                            onPress={() => addSlotTime(court, slot, time, index)}
                            style={[styles.slotPick, added && styles.slotPickOn]}
                          >
                            <Text style={[styles.slotPickText, added && styles.slotPickTextOn]}>
                              {slot.name} · {time.startTime}–{time.endTime} ·{' '}
                              {formatHours(hoursBetween(time.startTime, time.endTime))}h ·{' '}
                              {formatVnd(slotPricePerHour(court, slot))}/h
                            </Text>
                            <Text style={[styles.slotPickMeta, added && styles.slotPickTextOn]}>
                              {added ? 'Đã thêm' : 'Thêm'}
                            </Text>
                          </Pressable>
                        );
                      });
                    })}
                    <TextField
                      label="Thêm sân mới vào chi nhánh"
                      value={newSlotNameByVenue[court.id] ?? ''}
                      onChangeText={(text) =>
                        setNewSlotNameByVenue((current) => ({ ...current, [court.id]: text }))
                      }
                      placeholder="Tên sân"
                      onSubmitEditing={() => addNamedSlotToVenue(court.id)}
                    />
                    <SecondaryButton
                      label="Lưu sân này"
                      onPress={() => addNamedSlotToVenue(court.id)}
                    />
                  </View>
                );
              })
            )}

            <View style={styles.pickerNew}>
              <SectionTitle>Chi nhánh mới</SectionTitle>
              <TextField
                label="Tên chi nhánh"
                value={newCourtName}
                onChangeText={setNewCourtName}
                placeholder="Tên chi nhánh"
              />
              <MoneyInput
                label="Giá 1 giờ / sân"
                value={newCourtPrice}
                onChange={setNewCourtPrice}
                placeholder="150.000"
              />
              {newSlotNames.map((slotName, index) => (
                <TextField
                  key={`ns-${index}`}
                  label={`Tên sân ${index + 1}`}
                  value={slotName}
                  onChangeText={(text) =>
                    setNewSlotNames((current) => current.map((item, i) => (i === index ? text : item)))
                  }
                  placeholder={`Sân ${index + 1}`}
                />
              ))}
              <SecondaryButton
                label="Thêm tên sân"
                onPress={() => setNewSlotNames((current) => [...current, `Sân ${current.length + 1}`])}
              />
              <View style={{ height: 10 }} />
              <PrimaryButton label="Lưu chi nhánh và thêm vào buổi" onPress={saveAndAddCourt} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
  },
  backBtn: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  backText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: space.md,
    paddingBottom: 40,
  },
  computed: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  courtBlock: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  courtNumberBlock: {
    marginTop: 8,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  pickerSafe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  pickerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  pickerBody: {
    padding: space.md,
    paddingBottom: 40,
  },
  pickerVenue: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pickerVenueOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pickerNew: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: 4,
  },
  slotPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: '#FAFAFA',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  slotPickOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotPickText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  slotPickTextOn: {
    color: colors.primaryText,
  },
  slotPickMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  savedCourt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  savedCourtName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  shuttleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 16,
  },
  extraBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  extraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  extraTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 15,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voteInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFAFA',
    marginBottom: space.md,
  },
  voteDayRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    marginBottom: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  voteDayOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  voteDayText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  voteDayTextOn: {
    color: colors.primary,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.primaryText,
    fontWeight: '700',
    fontSize: 16,
  },
  memberName: {
    fontSize: 17,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.muted,
  },
  rowValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  shareBox: {
    marginTop: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  shareLabel: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  shareValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 4,
  },
  shareNote: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
  },
  payList: {
    marginTop: 12,
  },
  payBlock: {
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  payHint: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 4,
  },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  payAmount: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
});
