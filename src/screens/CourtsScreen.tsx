import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  MoneyInput,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  TextField,
  TimeField,
} from '../components/ui';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import { formatHours, slotsOf, timesHours, timesOf } from '../utils/calc';
import { formatVnd } from '../utils/money';
import { hoursBetween } from '../utils/time';

export function CourtsScreen() {
  const store = useStore();
  const courts = store.data.courts;
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [slotNames, setSlotNames] = useState(['Sân 1', 'Sân 2']);
  const [newSlotByVenue, setNewSlotByVenue] = useState<Record<string, string>>({});
  const [draftStart, setDraftStart] = useState<Record<string, string>>({});
  const [draftEnd, setDraftEnd] = useState<Record<string, string>>({});

  const add = () => {
    const created = store.addCourt(name, price, slotNames);
    if (!created) {
      Alert.alert('Thiếu thông tin', 'Nhập tên chi nhánh và giá 1 giờ.');
      return;
    }
    setName('');
    setPrice(0);
    setSlotNames(['Sân 1', 'Sân 2']);
  };

  const remove = (id: string, courtName: string) => {
    Alert.alert('Xóa chi nhánh?', courtName, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => store.removeCourt(id),
      },
    ]);
  };

  const saveTime = (courtId: string, slotId: string) => {
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
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>Sân</Text>
      <Card>
        <SectionTitle>Thêm chi nhánh</SectionTitle>
        <Text style={styles.hint}>
          Đặt tên sân, giờ cố định, và giá từng sân nếu khác chi nhánh. Để trống giá sân thì dùng giá chi nhánh.
        </Text>
        <TextField
          label="Tên chi nhánh"
          value={name}
          onChangeText={setName}
          placeholder="Sân Nguyễn Du, sân club..."
        />
        <MoneyInput
          label="Giá 1 giờ / sân"
          value={price}
          onChange={setPrice}
          placeholder="150.000"
        />
        {slotNames.map((slotName, index) => (
          <View key={`new-${index}`} style={styles.slotEdit}>
            <View style={{ flex: 1 }}>
              <TextField
                label={`Sân ${index + 1}`}
                value={slotName}
                onChangeText={(text) =>
                  setSlotNames((current) => current.map((item, i) => (i === index ? text : item)))
                }
                placeholder={`Sân ${index + 1}`}
              />
            </View>
            {slotNames.length > 1 ? (
              <Pressable
                onPress={() => setSlotNames((current) => current.filter((_, i) => i !== index))}
                style={styles.slotDelete}
              >
                <Text style={styles.deleteText}>Xóa</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <SecondaryButton
          label="Thêm sân"
          onPress={() => setSlotNames((current) => [...current, `Sân ${current.length + 1}`])}
        />
        <View style={{ height: 10 }} />
        <PrimaryButton
          label="Lưu chi nhánh"
          onPress={add}
          disabled={!name.trim() || price <= 0}
        />
      </Card>
      <Card>
        <SectionTitle>Đã lưu ({courts.length})</SectionTitle>
        {courts.length === 0 ? (
          <Text style={styles.empty}>Chưa có chi nhánh. Thêm ở trên.</Text>
        ) : (
          courts.map((court) => {
            const slots = slotsOf(court);
            return (
              <View key={court.id} style={styles.venue}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{court.name}</Text>
                    <Text style={styles.meta}>
                      {slots.length} sân · {formatVnd(court.pricePerHour)} / giờ
                    </Text>
                  </View>
                  <Pressable onPress={() => remove(court.id, court.name)} style={styles.deleteBtn}>
                    <Text style={styles.deleteText}>Xóa</Text>
                  </Pressable>
                </View>
                {slots.map((slot, index) => {
                  const key = `${court.id}:${slot.id}`;
                  const times = timesOf(slot);
                  return (
                    <View key={slot.id} style={styles.slotBlock}>
                      <View style={styles.slotEdit}>
                        <View style={{ flex: 1 }}>
                          <TextField
                            label={`Sân ${index + 1}`}
                            value={slot.name}
                            onChangeText={(text) => store.renameCourtSlot(court.id, slot.id, text)}
                          />
                        </View>
                        <Pressable
                          onPress={() => store.removeCourtSlot(court.id, slot.id)}
                          style={styles.slotDelete}
                        >
                          <Text style={styles.deleteText}>Xóa</Text>
                        </Pressable>
                      </View>
                      <MoneyInput
                        label={`Giá 1 giờ (trống = ${formatVnd(court.pricePerHour)} chi nhánh)`}
                        value={slot.pricePerHour ?? 0}
                        onChange={(price) => store.setCourtSlotPrice(court.id, slot.id, price)}
                        placeholder={formatVnd(court.pricePerHour).replace('đ', '')}
                        compact
                      />
                      {times.map((time) => (
                        <View key={time.id} style={styles.timeSaved}>
                          <Text style={styles.timeSavedText}>
                            {time.startTime}–{time.endTime} · {formatHours(hoursBetween(time.startTime, time.endTime))} giờ
                            {slot.pricePerHour && slot.pricePerHour > 0
                              ? ` · ${formatVnd(slot.pricePerHour)}/h`
                              : ''}
                          </Text>
                          <Pressable onPress={() => store.removeCourtTime(court.id, slot.id, time.id)}>
                            <Text style={styles.deleteText}>Xóa</Text>
                          </Pressable>
                        </View>
                      ))}
                      {times.length > 0 ? (
                        <Text style={styles.meta}>Tổng {formatHours(timesHours(times))} giờ</Text>
                      ) : null}
                      <View style={styles.timeRow}>
                        <TimeField
                          label="Bắt đầu"
                          value={draftStart[key] ?? ''}
                          onChange={(value) => setDraftStart((current) => ({ ...current, [key]: value }))}
                        />
                        <TimeField
                          label="Kết thúc"
                          value={draftEnd[key] ?? ''}
                          onChange={(value) => setDraftEnd((current) => ({ ...current, [key]: value }))}
                        />
                      </View>
                      <SecondaryButton label="Lưu giờ cố định" onPress={() => saveTime(court.id, slot.id)} />
                    </View>
                  );
                })}
                <TextField
                  label="Thêm sân vào chi nhánh"
                  value={newSlotByVenue[court.id] ?? ''}
                  onChangeText={(text) =>
                    setNewSlotByVenue((current) => ({ ...current, [court.id]: text }))
                  }
                  placeholder="Tên sân, ví dụ Sân 3, sân trong..."
                  onSubmitEditing={() => {
                    const added = store.addCourtSlot(court.id, newSlotByVenue[court.id] ?? '');
                    if (added) setNewSlotByVenue((current) => ({ ...current, [court.id]: '' }));
                  }}
                />
                <SecondaryButton
                  label="Lưu sân này"
                  onPress={() => {
                    const added = store.addCourtSlot(court.id, newSlotByVenue[court.id] ?? '');
                    if (!added) {
                      Alert.alert('Thiếu tên', 'Nhập tên sân rồi lưu.');
                      return;
                    }
                    setNewSlotByVenue((current) => ({ ...current, [court.id]: '' }));
                  }}
                />
              </View>
            );
          })
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.md,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  venue: {
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  name: {
    fontSize: 17,
    color: colors.text,
    fontWeight: '600',
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  slotBlock: {
    marginBottom: 12,
  },
  slotEdit: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  slotDelete: {
    marginBottom: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  timeSaved: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  timeSavedText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '700',
  },
});
