import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, plural, scaled } from '@/components/ui';
import type { DayActivity } from '@/data/activity';
import { formatStudyTotal } from '@/hooks/use-study-timer';
import { addDays, dayKey } from '@/lib/dates';

// Like GitHub's contribution graph: one column per week (Sunday at the top),
// one square per day, darker = more cards studied that day.
const CELL = scaled(20); // square size
const GAP = scaled(5);
const DAY_LABEL_WIDTH = scaled(46);
const MONTH_LABEL_HEIGHT = scaled(26);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Calm teal shades from "none" to "a lot".
const LEVEL_COLORS = [colors.line, '#bfe6df', '#86d0c4', '#45b0a2', '#1f8a7d'];

/**
 * 0 = no study, 1–4 = how much: cards reviewed that day, or minutes studied
 * (whichever shows more, so a long session on a few hard cards still counts).
 */
export function activityLevel(cards: number, seconds = 0): number {
  const minutes = seconds / 60;
  if (cards <= 0 && seconds <= 0) return 0;
  if (cards >= 20 || minutes >= 60) return 4;
  if (cards >= 10 || minutes >= 30) return 3;
  if (cards >= 5 || minutes >= 10) return 2;
  return 1;
}

/** "Tue, Nov 24", or "Today" / "Yesterday". */
export function dayTitle(day: Date, today: Date): string {
  const key = dayKey(day);
  if (key === dayKey(today)) return 'Today';
  if (key === dayKey(addDays(today, -1))) return 'Yesterday';
  return `${WEEKDAYS[day.getDay()]}, ${MONTHS[day.getMonth()]} ${day.getDate()}`;
}

/** One day's study in words, e.g. "1 h 05 min · 12 cards". */
export function describeDay(activity: Pick<DayActivity, 'cards' | 'seconds'> | undefined): string {
  const cards = activity?.cards ?? 0;
  const seconds = activity?.seconds ?? 0;
  if (cards <= 0 && seconds <= 0) return 'No study';
  const parts: string[] = [];
  if (seconds > 0) parts.push(formatStudyTotal(seconds));
  if (cards > 0) parts.push(plural(cards, 'card'));
  return parts.join(' · ');
}

type Props = {
  /** Study per day, keyed "YYYY-MM-DD". */
  activity: ReadonlyMap<string, DayActivity>;
  today: Date;
};

export function ActivityHeatmap({ activity, today }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null); // tapped day, "YYYY-MM-DD"

  // As many whole weeks as fit; the last column is the current week.
  const weeks = Math.max(1, Math.floor((width - DAY_LABEL_WIDTH + GAP) / (CELL + GAP)));
  const firstDay = addDays(today, -today.getDay() - (weeks - 1) * 7); // a Sunday
  const columns = Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => addDays(firstDay, week * 7 + weekday)),
  );

  // Month name above the first week that starts in a new month (skip if too close to the last one).
  const monthLabels: { week: number; label: string }[] = [];
  columns.forEach((days, week) => {
    const month = days[0].getMonth();
    const previous = monthLabels[monthLabels.length - 1];
    const isNewMonth = week === 0 ? days[0].getDate() <= 7 : columns[week - 1][0].getMonth() !== month;
    if (isNewMonth && (!previous || week - previous.week >= 3)) {
      monthLabels.push({ week, label: MONTHS[month] });
    }
  });

  const todayKey = dayKey(today);
  let studiedDays = 0;
  let shownDays = 0;
  let shownSeconds = 0;
  for (const days of columns) {
    for (const day of days) {
      if (day > today) continue;
      shownDays += 1;
      const entry = activity.get(dayKey(day));
      if (entry) {
        studiedDays += 1;
        shownSeconds += entry.seconds;
      }
    }
  }

  // The tapped day (today until you tap one).
  const selectedKey = selected ?? todayKey;
  const [y, m, d] = selectedKey.split('-').map(Number);
  const selectedDay = new Date(y, m - 1, d);

  return (
    <View testID="activity-heatmap" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View>
          {/* Month labels */}
          <View style={{ height: MONTH_LABEL_HEIGHT }}>
            {monthLabels.map(({ week, label }) => (
              <Text
                key={`${week}-${label}`}
                className="absolute text-xs text-muted"
                style={{ left: DAY_LABEL_WIDTH + week * (CELL + GAP) }}
              >
                {label}
              </Text>
            ))}
          </View>

          <View className="flex-row">
            {/* Mon / Wed / Fri */}
            <View style={{ width: DAY_LABEL_WIDTH }}>
              {Array.from({ length: 7 }, (_, weekday) => (
                <View key={weekday} style={{ height: CELL, marginBottom: GAP }} className="justify-center">
                  <Text className="text-xs text-muted">{DAY_LABELS[weekday] ?? ''}</Text>
                </View>
              ))}
            </View>

            {/* Squares */}
            {columns.map((days, week) => (
              <View key={week} style={{ marginRight: week < weeks - 1 ? GAP : 0 }}>
                {days.map((day) => {
                  const key = dayKey(day);
                  const future = day > today && key !== todayKey;
                  const entry = activity.get(key);
                  const level = activityLevel(entry?.cards ?? 0, entry?.seconds ?? 0);
                  const isSelected = key === selectedKey;
                  return (
                    <Pressable
                      key={key}
                      disabled={future}
                      onPress={() => setSelected(key)}
                      hitSlop={GAP / 2}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${dayTitle(day, today)}: ${describeDay(entry)}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        marginBottom: GAP,
                        borderRadius: scaled(5),
                        backgroundColor: future ? 'transparent' : LEVEL_COLORS[level],
                        borderWidth: isSelected ? 2.5 : key === todayKey ? 1.5 : 0,
                        borderColor: isSelected ? colors.primary : colors.ink,
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          {/* The tapped day */}
          <View
            accessibilityLiveRegion="polite"
            className="mt-1 flex-row items-center justify-between rounded-2xl bg-white px-3 py-2"
          >
            <Text className="text-sm font-semibold text-ink">{dayTitle(selectedDay, today)}</Text>
            <Text className="text-sm text-ink">{describeDay(activity.get(selectedKey))}</Text>
          </View>

          {/* Summary and legend */}
          <View className="mt-3 flex-row items-center justify-between">
            <Text
              className="text-xs text-muted"
              accessibilityLabel={`Studied on ${plural(studiedDays, 'day')} of the last ${plural(shownDays, 'day')}`}
            >
              {studiedDays} of {plural(shownDays, 'day')}
              {shownSeconds > 0 ? ` · ${formatStudyTotal(shownSeconds)}` : ''}
            </Text>
            <View className="flex-row items-center" style={{ gap: GAP }}>
              <Text className="text-xs text-muted">Less</Text>
              {LEVEL_COLORS.map((color) => (
                <View
                  key={color}
                  style={{ width: CELL, height: CELL, borderRadius: scaled(5), backgroundColor: color }}
                />
              ))}
              <Text className="text-xs text-muted">More</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
