import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { formatHm, parseHm } from '../utils/time';
import { formatVndNumber, parseDigits } from '../utils/money';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryBtn,
        danger && styles.dangerBtn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.secondaryBtnText, danger && styles.dangerBtnText]}>{label}</Text>
    </Pressable>
  );
}

export function PaidChip({ paid, onPress }: { paid: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.paidChip, paid && styles.paidChipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.paidText, paid && styles.paidTextOn]}>
        {paid ? 'Đã chuyển' : 'Chưa chuyển'}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'words',
  onSubmitEditing,
  onBlur,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onSubmitEditing?: () => void;
  onBlur?: () => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        onBlur={onBlur}
        style={styles.input}
      />
    </View>
  );
}

export function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
  compact,
}: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && styles.fieldCompact]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value ? formatVndNumber(value) : ''}
        onChangeText={(text) => onChange(parseDigits(text))}
        keyboardType="number-pad"
        placeholder={placeholder ?? '0'}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseHm(value);
  const [hour, setHour] = useState(parsed?.hours ?? 19);
  const [minute, setMinute] = useState(parsed ? (Math.round(parsed.minutes / 5) * 5) % 60 : 0);

  const openPicker = () => {
    const current = parseHm(value);
    setHour(current?.hours ?? 19);
    setMinute(current ? Math.min(55, Math.round(current.minutes / 5) * 5) : 0);
    setOpen(true);
  };

  return (
    <View style={styles.timeField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={openPicker} style={styles.timeBtn}>
        <Text style={[styles.timeBtnText, !value && styles.timePlaceholder]}>
          {value || 'Chọn giờ'}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.timeModal}>
          <Text style={styles.timeModalTitle}>{label}</Text>
          <View style={styles.timeColumns}>
            <ScrollView style={styles.timeCol}>
              {HOURS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setHour(item)}
                  style={[styles.timeOption, hour === item && styles.timeOptionOn]}
                >
                  <Text style={[styles.timeOptionText, hour === item && styles.timeOptionTextOn]}>
                    {String(item).padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={styles.timeCol}>
              {MINUTES.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setMinute(item)}
                  style={[styles.timeOption, minute === item && styles.timeOptionOn]}
                >
                  <Text style={[styles.timeOptionText, minute === item && styles.timeOptionTextOn]}>
                    {String(item).padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Pressable
            onPress={() => {
              onChange(formatHm(hour, minute));
              setOpen(false);
            }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Chọn {formatHm(hour, minute)}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
            style={[styles.secondaryBtn, { marginTop: 10 }]}
          >
            <Text style={styles.secondaryBtnText}>Xóa giờ</Text>
          </Pressable>
          <Pressable onPress={() => setOpen(false)} style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={styles.secondaryBtnText}>Đóng</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function snapStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(2));
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  format,
}: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
}) {
  const clamp = (n: number) => {
    const snapped = snapStep(n, step);
    if (max == null) return Math.max(min, snapped);
    return Math.min(max, Math.max(min, snapped));
  };
  return (
    <View style={label ? styles.stepperRow : styles.stepperOnly}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{format ? format(value) : String(value)}</Text>
        <Pressable
          onPress={() => onChange(max != null && value < max && value + step > max ? max : clamp(value + step))}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primaryBtnText: {
    color: colors.primaryText,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    backgroundColor: colors.primarySoft,
  },
  secondaryBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  dangerBtn: {
    backgroundColor: colors.dangerSoft,
  },
  dangerBtnText: {
    color: colors.danger,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  field: {
    marginBottom: space.md,
  },
  fieldCompact: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    fontSize: 20,
    color: colors.text,
    backgroundColor: '#FAFAFA',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  stepperOnly: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '600',
    marginTop: -2,
  },
  stepValue: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  paidChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  paidChipOn: {
    backgroundColor: colors.primarySoft,
  },
  paidText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.warning,
  },
  paidTextOn: {
    color: colors.primary,
  },
  timeField: {
    flex: 1,
  },
  timeBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  timeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  timePlaceholder: {
    color: colors.muted,
    fontWeight: '500',
  },
  timeModal: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: space.md,
    paddingTop: 28,
  },
  timeModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  timeColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: space.md,
  },
  timeCol: {
    flex: 1,
  },
  timeOption: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  timeOptionOn: {
    backgroundColor: colors.primarySoft,
  },
  timeOptionText: {
    fontSize: 22,
    color: colors.text,
  },
  timeOptionTextOn: {
    color: colors.primary,
    fontWeight: '800',
  },
});
