import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import {
  dateIdInMonth,
  daysInMonth,
  mondayIndex,
  parseMonthId,
  todayId,
} from '../utils/date';

const HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

type Props = {
  monthId: string;
  playingDates: string[];
  savedDates: string[];
  onPressDate: (date: string) => void;
  onLongPressDate: (date: string) => void;
};

export function Calendar({ monthId, playingDates, savedDates, onPressDate, onLongPressDate }: Props) {
  const { year, month } = parseMonthId(monthId);
  const total = daysInMonth(year, month);
  const offset = mondayIndex(year, month, 1);
  const today = todayId();
  const cells: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View>
      <View style={styles.headerRow}>
        {HEADERS.map((label) => (
          <Text key={label} style={styles.header}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((day, colIndex) => {
            if (!day) return <View key={`e-${colIndex}`} style={styles.cell} />;
            const date = dateIdInMonth(monthId, day);
            const playing = playingDates.includes(date);
            const saved = savedDates.includes(date);
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                onPress={() => onPressDate(date)}
                onLongPress={() => onLongPressDate(date)}
                delayLongPress={350}
                style={[
                  styles.cell,
                  playing && styles.playing,
                  saved && styles.saved,
                  isToday && styles.today,
                ]}
              >
                <Text
                  style={[styles.day, playing && styles.dayPlaying, saved && styles.daySaved]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  header: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    margin: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playing: {
    backgroundColor: colors.primarySoft,
  },
  saved: {
    backgroundColor: colors.primary,
  },
  today: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  day: {
    fontSize: 16,
    color: colors.text,
  },
  dayPlaying: {
    color: colors.primary,
    fontWeight: '700',
  },
  daySaved: {
    color: colors.primaryText,
    fontWeight: '700',
  },
});
