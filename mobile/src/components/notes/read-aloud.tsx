import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon, IconButton, useColors } from '@/components/ui';
import type { Note } from '@/data/types';
import { speechParts } from '@/lib/read-aloud';

/** Reading speeds the speed button steps through. */
export const READ_RATES = [0.75, 1, 1.25, 1.5];

// The last speed picked, kept while the app is open so the next note reads at the same speed.
let lastRate = 1;

export type ReadAloud = {
  /** The player is showing (reading, or paused part way). */
  open: boolean;
  /** The voice is talking right now. */
  playing: boolean;
  /** The part (about a sentence) being read, counting from 0, and how many there are. */
  index: number;
  total: number;
  part: string;
  rate: number;
  /** Header speaker: start from the top, or close the player. */
  toggle: () => void;
  /** Pause, or play from where it was (from the top once it has finished). */
  togglePlay: () => void;
  /** Back or forward by this many parts. */
  skip: (by: number) => void;
  seek: (index: number) => void;
  /** The next speed in READ_RATES. */
  cycleRate: () => void;
  stop: () => void;
};

/**
 * Reads a note out loud with the phone's own voice, a sentence at a time, so the
 * player can show what is being read and pause, skip and change speed in step with
 * the voice. Stops when the note changes (Previous / Next) or the screen closes, so
 * it never keeps talking in the background.
 */
export function useReadAloud(note: Note | null): ReadAloud {
  const parts = useMemo(
    () => (note ? speechParts(note, Math.min(Speech.maxSpeechInputLength || Infinity, 3900)) : []),
    [note],
  );
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [index, setIndexState] = useState(0);
  const [finished, setFinished] = useState(false);
  const [rate, setRateState] = useState(lastRate);
  // Refs, so callbacks from the voice see the latest values.
  const indexRef = useRef(0);
  const rateRef = useRef(lastRate);
  // Each run of speech gets a number, so callbacks from a run that was stopped are ignored.
  const run = useRef(0);

  const setIndex = useCallback((i: number) => {
    indexRef.current = i;
    setIndexState(i);
  }, []);

  /** Starts the voice at part `from` and carries on to the end. */
  const playFrom = useCallback(
    (from: number) => {
      if (parts.length === 0 || !Number.isFinite(from)) return;
      const mine = ++run.current;
      Speech.stop().catch(() => {}); // drop anything still queued
      setOpen(true);
      setPlaying(true);
      setFinished(false);
      const say = (i: number) => {
        if (run.current !== mine) return;
        setIndex(i);
        Speech.speak(parts[i], {
          rate: rateRef.current,
          onDone: () => {
            if (run.current !== mine) return;
            if (i + 1 < parts.length) {
              say(i + 1);
            } else {
              run.current += 1;
              setPlaying(false);
              setFinished(true);
            }
          },
          onError: () => {
            if (run.current === mine) setPlaying(false);
          },
        });
      };
      say(Math.max(0, Math.min(from, parts.length - 1)));
    },
    [parts, setIndex],
  );

  const pause = useCallback(() => {
    run.current += 1;
    setPlaying(false);
    Speech.stop().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    pause();
    setOpen(false);
    setFinished(false);
    setIndex(0);
  }, [pause, setIndex]);

  const seek = useCallback(
    (i: number) => {
      if (!Number.isFinite(i) || parts.length === 0) return; // NaN would get past the clamp below
      const to = Math.max(0, Math.min(Math.round(i), parts.length - 1));
      if (playing) playFrom(to);
      else {
        setIndex(to);
        setFinished(false);
      }
    },
    [parts.length, playing, playFrom, setIndex],
  );

  const cycleRate = useCallback(() => {
    const next = READ_RATES[(READ_RATES.indexOf(rateRef.current) + 1) % READ_RATES.length] ?? 1;
    rateRef.current = next;
    lastRate = next;
    setRateState(next);
    if (playing) playFrom(indexRef.current); // say this sentence again at the new speed
  }, [playing, playFrom]);

  // A different note, or leaving the screen: stop talking.
  const noteId = note?.id;
  useEffect(() => stop, [noteId, stop]);

  return {
    open,
    playing,
    index,
    total: parts.length,
    part: parts[index] ?? '',
    rate,
    toggle: open ? stop : () => playFrom(0),
    togglePlay: playing ? pause : () => playFrom(finished ? 0 : indexRef.current),
    skip: (by: number) => seek(indexRef.current + by),
    seek,
    cycleRate,
    stop,
  };
}

/** The speaker button in the note's header. */
export function ReadAloudButton({ speaking, onPress }: { speaking: boolean; onPress: () => void }) {
  return (
    <IconButton
      icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
      label={speaking ? 'Stop reading' : 'Read note aloud'}
      onPress={onPress}
    />
  );
}

/** "1×", "0.75×" */
function rateLabel(rate: number) {
  return `${rate}×`;
}

/**
 * The player shown while a note is read aloud: the sentence being read, a bar that
 * follows the voice (tap it to jump), and play / pause, skip, speed and close.
 */
export function ReadAloudPlayer({ readAloud }: { readAloud: ReadAloud }) {
  const colors = useColors();
  const [barWidth, setBarWidth] = useState(0);
  const { open, playing, index, total, part, rate } = readAloud;
  if (!open || total === 0) return null;
  const progress = total > 1 ? index / (total - 1) : 1;

  return (
    <View className="w-full max-w-3xl gap-2 self-center rounded-2xl bg-primary-soft px-3 pb-1 pt-3">
      <Text
        className="px-1 text-base text-ink"
        numberOfLines={3}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Reading: ${part}`}
      >
        {part}
      </Text>

      <View className="flex-row items-center gap-3 px-1">
        <Pressable
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            // Phones give locationX; on the web the press event is a mouse event with offsetX instead.
            const event = e.nativeEvent as { locationX?: number; offsetX?: number };
            const x = event.locationX ?? event.offsetX;
            if (barWidth > 0 && typeof x === 'number') readAloud.seek(Math.floor((x / barWidth) * total));
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Reading position"
          accessibilityValue={{ min: 1, max: total, now: index + 1, text: `Sentence ${index + 1} of ${total}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => readAloud.skip(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          className="h-6 flex-1 justify-center"
        >
          <View className="h-1.5 w-full overflow-hidden rounded-full bg-card">
            <View className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
          </View>
        </Pressable>
        <Text className="text-xs font-semibold text-muted">
          {index + 1} / {total}
        </Text>
      </View>

      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={readAloud.cycleRate}
          accessibilityRole="button"
          accessibilityLabel={`Reading speed ${rateLabel(rate)}`}
          className="h-12 min-w-12 items-center justify-center rounded-full px-2 active:bg-card"
        >
          <Text className="text-base font-bold text-primary">{rateLabel(rate)}</Text>
        </Pressable>
        <IconButton icon="play-skip-back" label="Previous sentence" onPress={() => readAloud.skip(-1)} />
        <Pressable
          onPress={readAloud.togglePlay}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause reading' : 'Play reading'}
          className="h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Icon name={playing ? 'pause' : 'play'} size={30} color={colors.white} />
        </Pressable>
        <IconButton icon="play-skip-forward" label="Next sentence" onPress={() => readAloud.skip(1)} />
        <IconButton icon="close" label="Close player" onPress={readAloud.stop} />
      </View>
    </View>
  );
}
