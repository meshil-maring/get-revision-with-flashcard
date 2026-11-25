import { useState } from 'react';
import { Text, View } from 'react-native';

import { colors, plural, scaled } from '@/components/ui';
import { addDays, dayKey } from '@/lib/dates';

// Like GitHub's contribution graph: one column per week (Sunday at the top),
// one square per day, darker = more cards studied that day.
const CELL = scaled(20); // square size
const GAP = scaled(5);
const DAY_LABEL_WIDTH = scaled(46);
const MONTH_LABEL_HEIGHT = scaled(26);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

// Calm teal shades from "none" to "a lot".
const LEVEL_COLORS = [colors.line, '#bfe6df', '#86d0c4', '#45b0a2', '#1f8a7d'];

/** 0 = no study, 1–4 = how much (cards reviewed that day). */
export function activityLevel(cards: number): number {
  if (cards <= 0) return 0;
  if (cards < 5) return 1;
  if (cards < 10) return 2;
  if (cards < 20) return 3;
  return 4;
}

type Props = {
  /** Cards reviewed per day, keyed "YYYY-MM-DD". */
  counts: ReadonlyMap<string, number>;
  today: Date;
};

export function ActivityHeatmap({ counts, today }: Props) {
  const [width, setWidth] = useState(0);

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
  for (const days of columns) {
    for (const day of days) {
      if (day > today) continue;
      shownDays += 1;
      if ((counts.get(dayKey(day)) ?? 0) > 0) studiedDays += 1;
    }
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View
          accessible
          accessibilityLabel={`Studied on ${plural(studiedDays, 'day')} of the last ${plural(shownDays, 'day')}`}
        >
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
                  const level = activityLevel(counts.get(key) ?? 0);
                  return (
                    <View
                      key={key}
                      style={{
                        width: CELL,
                        height: CELL,
                        marginBottom: GAP,
                        borderRadius: scaled(5),
                        backgroundColor: future ? 'transparent' : LEVEL_COLORS[level],
                        borderWidth: key === todayKey ? 1.5 : 0,
                        borderColor: colors.ink,
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          {/* Summary and legend */}
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-muted">
              {studiedDays} of {plural(shownDays, 'day')}
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
