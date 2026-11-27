import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';

import type { AttachmentItem } from '@/components/cards/attachments';
import { ScreenTip } from '@/components/ui/screen-tip';
import { FlipCard } from '@/components/cards/flip-card';
import { Button, EmptyState, Icon, type IconName, plural, ratingColors, ratingIcons, SubjectIcon, useColors } from '@/components/ui';
import { recordReview, recordStudyTime } from '@/data/activity';
import { listAttachmentsForCards } from '@/data/attachments';
import { getCard, rateCard, setFavorite } from '@/data/cards';
import { addStudyTime } from '@/data/decks';
import type { Attachment, Card, Rating } from '@/data/types';
import { groupByRating, rankByTime, RATING_LABELS, SESSION_GROUP_LABELS, SESSION_GROUP_ORDER } from '@/lib/revision';
import { shuffle } from '@/lib/shuffle';
import { formatDuration, useStudyTimer } from '@/hooks/use-study-timer';

type Props = {
  title: string;
  cards: Card[]; // original order
  emptyText: string;
  backLabel: string;
  /** Start in a random order (default). Shuffle can be turned off during the session. */
  initialShuffle?: boolean;
  /** Optional small label above the card, e.g. which deck it comes from. */
  cardLabel?: (card: Card) => string | undefined;
  /** Seconds before moving to the next card by itself; 0 or missing = off. */
  autoNextSeconds?: number;
  /** Hold the countdown while the answer is showing. */
  pauseOnAnswer?: boolean;
};

const RATINGS: Rating[] = ['hard', 'ok', 'easy'];

function toItems(attachments: Attachment[] | undefined, side: 'front' | 'back'): AttachmentItem[] {
  return (attachments ?? [])
    .filter((a) => a.side === side)
    .map((a) => ({ key: a.id, kind: a.kind, uri: a.uri, name: a.name, mimeType: a.mimeType }));
}

/**
 * Go through cards one at a time: shared by single-deck study and multi-deck revision.
 * Each card starts on its question; after showing the answer you rate it Hard, OK or
 * Easy. At the end you see how it went and can revise the cards you pick again.
 */
export function StudySession({
  title,
  cards,
  emptyText,
  backLabel,
  initialShuffle = true, // cards come in a random order unless you turn Shuffle off
  cardLabel,
  autoNextSeconds = 0,
  pauseOnAnswer = false,
}: Props) {
  const colors = useColors();
  const db = useSQLiteContext();
  // The cards in this round: all of them at first, or the ones picked on the summary.
  const [pool, setPool] = useState<Card[]>(cards);
  const [shuffled, setShuffled] = useState(initialShuffle);
  const [order, setOrder] = useState<Card[]>(() => (initialShuffle ? shuffle(cards) : cards));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map());
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(cards.filter((c) => c.favoritedAt).map((c) => c.id)),
  );
  const [attachments, setAttachments] = useState<Map<string, Attachment[]>>(new Map());
  // Cards already counted for the streak in this round (going back and forward doesn't count twice).
  const counted = useRef(new Set<string>());
  // The card open in the editor; study time and the countdown wait until you come back.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Goes up for every new round or shuffle, so per-card countdowns start fresh.
  const [round, setRound] = useState(0);
  // Time spent on this round; paused on the summary and while the app is in the background.
  const timer = useStudyTimer(!finished && order.length > 0 && editingId === null);
  useDeckStudyTime(db, timer.seconds, finished ? undefined : order[index]?.deckId);
  const autoNext = useAutoNext(
    autoNextSeconds,
    !finished && order.length > 0 && editingId === null && !(pauseOnAnswer && flipped),
    `${round}:${index}`,
    next,
  );

  // Time spent on each card in this round, for the ranking on the summary.
  const { times: cardTimes, start: startCardTime, stop: stopCardTime, reset: resetCardTimes } = useCardTimes();
  // Round + card id: a new round on the same first card still starts a fresh timing.
  const timingKey = finished || order.length === 0 || !order[index] ? null : `${round}|${order[index].id}`;
  useFocusEffect(
    useCallback(() => {
      if (!timingKey) return;
      const timingId = timingKey.slice(timingKey.indexOf('|') + 1);
      startCardTime(timingId);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') startCardTime(timingId);
        else stopCardTime();
      });
      return () => {
        sub.remove();
        stopCardTime();
      };
    }, [timingKey, startCardTime, stopCardTime]),
  );

  // Back from the editor: show the edited card (and its files) without restarting.
  useFocusEffect(
    useCallback(() => {
      if (!editingId) return;
      let cancelled = false;
      Promise.all([getCard(db, editingId), listAttachmentsForCards(db, [editingId])]).then(([updated, byCard]) => {
        if (cancelled) return;
        if (updated) {
          const swap = (list: Card[]) => list.map((c) => (c.id === updated.id ? updated : c));
          setOrder(swap);
          setPool(swap);
        }
        setAttachments((prev) => new Map(prev).set(editingId, byCard.get(editingId) ?? []));
        setEditingId(null);
      });
      return () => {
        cancelled = true;
      };
    }, [db, editingId]),
  );

  function editCard(card: Card) {
    setEditingId(card.id);
    router.push({ pathname: '/card-editor', params: { deckId: card.deckId, cardId: card.id } });
  }

  useEffect(() => {
    let cancelled = false;
    listAttachmentsForCards(db, cards.map((c) => c.id)).then((byCard) => {
      if (!cancelled && byCard) setAttachments(byCard);
    });
    return () => {
      cancelled = true;
    };
  }, [db, cards]);

  function restart(nextPool: Card[], nextShuffled: boolean) {
    setPool(nextPool);
    setShuffled(nextShuffled);
    setOrder(nextShuffled ? shuffle(nextPool) : nextPool);
    setIndex(0);
    setFlipped(false);
    setFinished(false);
    setRatings(new Map());
    counted.current = new Set();
    resetCardTimes();
    setRound((r) => r + 1);
  }

  function goTo(nextIndex: number) {
    setFlipped(false);
    setIndex(nextIndex);
  }

  /** Move on without rating; after the last card, go to the summary. */
  function next() {
    if (index < order.length - 1) goTo(index + 1);
    else setFinished(true);
  }

  function rate(rating: Rating) {
    const card = order[index];
    setRatings((prev) => new Map(prev).set(card.id, rating));
    rateCard(db, card.id, rating);
    // A card counts as reviewed (for the streak) the first time it's rated in a round.
    if (!counted.current.has(card.id)) {
      counted.current.add(card.id);
      recordReview(db);
    }
    if (index < order.length - 1) {
      goTo(index + 1);
    } else {
      setFinished(true);
    }
  }

  function toggleFavorite(card: Card) {
    const next = !favorites.has(card.id);
    setFavorites((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(card.id);
      else copy.delete(card.id);
      return copy;
    });
    setFavorite(db, card.id, next);
  }

  if (order.length === 0) {
    return (
      <Centered title={title}>
        <EmptyState icon="copy-outline" title="No cards to study" text={emptyText} />
        <Button label={backLabel} icon="arrow-back" onPress={() => router.back()} className="w-full" />
      </Centered>
    );
  }

  if (finished) {
    return (
      <Summary
        title={title}
        cards={order}
        ratings={ratings}
        backLabel={backLabel}
        cardLabel={cardLabel}
        seconds={timer.seconds}
        times={cardTimes}
        onReviseSelected={(selected) => {
          timer.reset();
          restart(selected, shuffled);
        }}
        onStudyAgain={() => {
          timer.reset();
          restart(pool, shuffled);
        }}
      />
    );
  }

  const card = order[index];
  const isFirst = index === 0;
  const isLast = index === order.length - 1;
  const label = cardLabel?.(card);
  const favorite = favorites.has(card.id);
  const currentRating = ratings.get(card.id);

  return (
    <View className="flex-1 bg-page px-5 pb-6 pt-2">
      <Stack.Screen options={{ title, headerRight: () => <TimerPill seconds={timer.seconds} /> }} />

      <View className="mx-auto w-full max-w-xl flex-1">
        {/* Progress, time left on this card, favourite and shuffle */}
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Text className="text-base font-bold text-muted">
              <Text className="text-ink">{index + 1}</Text> / {order.length}
            </Text>
            {autoNextSeconds > 0 ? (
              <CardCountdown
                left={autoNext.left}
                total={autoNextSeconds}
                paused={autoNext.paused}
                onAnswer={pauseOnAnswer && flipped}
                onPress={autoNext.togglePause}
              />
            ) : null}
          </View>
          <View className="flex-row items-center gap-2.5">
            <Pressable
              onPress={() => toggleFavorite(card)}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityLabel="Favourite"
              accessibilityState={{ checked: favorite }}
              className={`h-14 w-14 items-center justify-center rounded-full shadow-sm ${
                favorite ? 'bg-warning' : 'border border-line bg-card active:bg-surface'
              }`}
            >
              <Icon name={favorite ? 'star' : 'star-outline'} size={24} color={favorite ? colors.white : colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => restart(pool, !shuffled)}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityLabel="Shuffle"
              accessibilityState={{ checked: shuffled }}
              className={`h-14 w-14 items-center justify-center rounded-full shadow-sm ${
                shuffled ? 'bg-primary' : 'border border-line bg-card active:bg-surface'
              }`}
            >
              <Icon name="shuffle" size={24} color={shuffled ? colors.white : colors.ink} />
            </Pressable>
          </View>
        </View>
        <View className="mb-5 h-3 overflow-hidden rounded-full bg-primary-soft">
          <View className="h-full rounded-full bg-primary" style={{ width: `${((index + 1) / order.length) * 100}%` }} />
        </View>

        <ScreenTip id="study" className="mb-3" />

        {label ? (
          <View className="mb-3 flex-row items-center gap-2 self-center rounded-full border border-line bg-card px-3 py-1.5">
            <SubjectIcon name={label} size={16} />
            <Text className="text-sm font-semibold text-ink">{label}</Text>
          </View>
        ) : null}

        {/* key = card id: a new card always starts on its front, with no flip animation. */}
        <FlipCard
          key={card.id}
          front={card.front}
          back={card.back}
          frontAttachments={toItems(attachments.get(card.id), 'front')}
          backAttachments={toItems(attachments.get(card.id), 'back')}
          flipped={flipped}
          onPress={() => setFlipped((f) => !f)}
          onEdit={() => editCard(card)}
        />

        {/* Rate how it went. Locked until the answer is showing: think first, then rate. */}
        <View className="mt-5 flex-row gap-2.5">
          {RATINGS.map((rating) => {
            const chosen = currentRating === rating;
            const color = ratingColors[rating];
            return (
              <Pressable
                key={rating}
                disabled={!flipped}
                onPress={() => rate(rating)}
                accessibilityRole="button"
                accessibilityLabel={RATING_LABELS[rating]}
                accessibilityState={{ selected: chosen, disabled: !flipped }}
                className={`h-14 flex-1 flex-row items-center justify-center gap-1.5 rounded-full shadow-sm active:opacity-80 ${
                  flipped ? '' : 'opacity-50'
                }`}
                style={{
                  backgroundColor: chosen ? `${color}26` : colors.white,
                  borderWidth: 1.5,
                  borderColor: chosen ? color : colors.line,
                }}
              >
                <Icon name={ratingIcons[rating]} size={20} color={color} />
                <Text className="text-base font-bold" style={{ color: chosen ? color : colors.ink }}>
                  {RATING_LABELS[rating]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="mt-2 text-center text-xs text-muted">
          {flipped ? 'How well did you know it?' : 'Show the answer, then rate it'}
        </Text>

        {/* Move between cards, and turn the card over. */}
        <View className="mt-4 flex-row items-center gap-2.5">
          <NavButton label="Prev" icon="arrow-back" disabled={isFirst} onPress={() => goTo(index - 1)} accessibilityLabel="Previous" />
          <Pressable
            onPress={() => setFlipped((f) => !f)}
            accessibilityRole="button"
            style={{ flex: 1.6 }}
            className="h-16 flex-row items-center justify-center gap-2 rounded-full bg-primary shadow-md active:bg-primary-dark"
          >
            <Icon name={flipped ? 'help-circle-outline' : 'eye-outline'} size={24} color={colors.white} />
            <Text className="text-base font-bold text-white">{flipped ? 'Show question' : 'Show answer'}</Text>
          </Pressable>
          <NavButton
            label={isLast ? 'Finish' : 'Next'}
            icon={isLast ? 'flag-outline' : 'arrow-forward'}
            iconAfter
            onPress={next}
            accessibilityLabel={isLast ? 'Finish' : 'Next'}
          />
        </View>
      </View>
    </View>
  );
}

function NavButton({
  label,
  icon,
  iconAfter = false,
  disabled = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: IconName;
  iconAfter?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useColors();
  const color = disabled ? colors.faint : colors.ink;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      className={`h-16 flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-line shadow-sm ${
        disabled ? 'bg-surface' : 'bg-card active:bg-surface'
      }`}
    >
      {iconAfter ? null : <Icon name={icon} size={20} color={color} />}
      <Text className="text-base font-semibold" style={{ color }}>
        {label}
      </Text>
      {iconAfter ? <Icon name={icon} size={20} color={color} /> : null}
    </Pressable>
  );
}

/**
 * Adds up the time each card is on screen (ms). `start` begins timing a card (ending the
 * one before), `stop` ends it; leaving the screen or the app stops the clock.
 */
function useCardTimes() {
  const [times, setTimes] = useState<Map<string, number>>(() => new Map());
  const current = useRef<{ id: string; since: number } | null>(null);

  const stop = useCallback(() => {
    const running = current.current;
    if (!running) return;
    current.current = null;
    const ms = Date.now() - running.since;
    setTimes((prev) => new Map(prev).set(running.id, (prev.get(running.id) ?? 0) + ms));
  }, []);

  const start = useCallback(
    (id: string) => {
      stop();
      current.current = { id, since: Date.now() };
    },
    [stop],
  );

  /** Forget all times (a new round). The card being timed is dropped, not added. */
  const reset = useCallback(() => {
    current.current = null;
    setTimes(new Map());
  }, []);

  return { times, start, stop, reset };
}

/**
 * Counts down the time left on the current card and calls `onTimeUp` at zero.
 * `cardKey` changes for every card (and new round), which starts a fresh countdown.
 */
function useAutoNext(seconds: number, running: boolean, cardKey: string, onTimeUp: () => void) {
  const [ticks, setTicks] = useState({ cardKey, elapsed: 0 });
  const [paused, setPaused] = useState(false);

  const counting = seconds > 0 && running && !paused;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => {
      setTicks((t) => ({ cardKey, elapsed: (t.cardKey === cardKey ? t.elapsed : 0) + 1 }));
    }, 1000);
    return () => clearInterval(id);
  }, [counting, cardKey]);

  const elapsed = ticks.cardKey === cardKey ? ticks.elapsed : 0;
  const left = Math.max(0, seconds - elapsed);

  useEffect(() => {
    if (counting && left === 0) onTimeUp();
  }, [counting, left, onTimeUp]);

  return { left, paused, togglePause: () => setPaused((p) => !p) };
}

/**
 * Adds the time spent to the deck of the card on screen (so a revision that mixes
 * decks credits each one). Saved every ~10 seconds, at the end and when leaving.
 */
function useDeckStudyTime(db: ReturnType<typeof useSQLiteContext>, seconds: number, deckId: string | undefined) {
  const lastSeconds = useRef(seconds);
  const pending = useRef(new Map<string, number>());

  const flush = useCallback(() => {
    for (const [id, secs] of pending.current) {
      addStudyTime(db, id, secs);
      recordStudyTime(db, secs); // for the day's total on Home
    }
    pending.current = new Map();
  }, [db]);

  useEffect(() => {
    const delta = seconds - lastSeconds.current;
    lastSeconds.current = seconds;
    if (delta <= 0 || !deckId) return; // a reset back to 0:00 adds nothing
    const total = (pending.current.get(deckId) ?? 0) + delta;
    pending.current.set(deckId, total);
    if (total >= 10) flush();
  }, [seconds, deckId, flush]);

  // Reaching the summary, or leaving the screen.
  useEffect(() => {
    if (!deckId) flush();
  }, [deckId, flush]);
  useEffect(() => flush, [flush]);
}

/**
 * Total study time, in the header. Kept quiet (no pill, grey stopwatch) so it isn't
 * mixed up with the per-card countdown, which is coloured and says "Next in".
 */
function TimerPill({ seconds }: { seconds: number }) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={`Study time ${formatDuration(seconds)}`}
      className="flex-row items-center gap-1.5 pr-1"
    >
      <Icon name="stopwatch-outline" size={26} color={colors.muted} />
      <View className="items-start">
        <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
          Study time
        </Text>
        <Text className="text-base font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
          {formatDuration(seconds)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Time left before the next card shows by itself. Orange, says "Next in", and its
 * fill drains as time runs out; red in the last 5 seconds. Tap to pause.
 */
function CardCountdown({
  left,
  total,
  paused: pausedByTap,
  onAnswer,
  onPress,
}: {
  left: number;
  total: number;
  paused: boolean;
  /** Waiting because the answer is showing (Pause on answer is on). */
  onAnswer: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const paused = pausedByTap || onAnswer;
  const urgent = !paused && left <= 5;
  const tint = paused ? colors.muted : urgent ? colors.alert : colors.cta;
  const share = total > 0 ? left / total : 0;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        !pausedByTap && onAnswer
          ? `Auto next waits while the answer shows, ${left} seconds left`
          : `${paused ? 'Resume' : 'Pause'} auto next, ${left} seconds left`
      }
      className="overflow-hidden rounded-full"
      style={{ borderWidth: 1.5, borderColor: tint, backgroundColor: colors.card }}
    >
      {/* The fill shrinks from right to left as the time runs out. */}
      <View
        pointerEvents="none"
        className="absolute bottom-0 left-0 top-0"
        style={{ width: `${share * 100}%`, backgroundColor: `${tint}26` }}
      />
      <View className="flex-row items-center gap-1 px-3 py-1.5">
        <Icon name={!pausedByTap && onAnswer ? 'eye-outline' : paused ? 'play' : 'play-skip-forward'} size={16} color={tint} />
        <Text className="text-sm font-bold" style={{ color: tint, fontVariant: ['tabular-nums'] }}>
          {pausedByTap ? 'Paused' : onAnswer ? 'Reading · ' : 'Next in '}
          {pausedByTap ? null : <Text>{formatDuration(left)}</Text>}
        </Text>
        {paused ? null : <Icon name="pause" size={14} color={tint} />}
      </View>
    </Pressable>
  );
}

// --- End of a round ----------------------------------------------------------------

function Summary({
  title,
  cards,
  ratings,
  backLabel,
  cardLabel,
  seconds,
  times,
  onReviseSelected,
  onStudyAgain,
}: {
  title: string;
  cards: Card[];
  ratings: Map<string, Rating>;
  seconds: number;
  /** Time spent on each card, in ms. */
  times: Map<string, number>;
  backLabel: string;
  cardLabel?: (card: Card) => string | undefined;
  onReviseSelected: (cards: Card[]) => void;
  onStudyAgain: () => void;
}) {
  const colors = useColors();
  const groups = groupByRating(cards, ratings);
  // Hard cards are picked for the next round to start with; change it as you like.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(cards.filter((c) => ratings.get(c.id) === 'hard').map((c) => c.id)),
  );
  const selectedCards = cards.filter((c) => selected.has(c.id));

  function toggle(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerClassName="w-full max-w-xl self-center px-5 pb-8 pt-4">
        <View className="mb-5 items-center">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-calm-soft">
            <Icon name="trophy" size={40} color={colors.warning} />
          </View>
          <Text className="mb-1 text-3xl font-bold text-ink">Well done!</Text>
          <Text className="text-center text-base text-muted">You went through all {plural(cards.length, 'card')}.</Text>
          <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1.5">
            <Icon name="time-outline" size={20} color={colors.primary} />
            <Text className="text-sm font-bold text-primary">Study time {formatDuration(seconds)}</Text>
          </View>
        </View>

        {/* How it went */}
        <View className="mb-6 flex-row gap-2">
          {SESSION_GROUP_ORDER.map((rating) => {
            const count = cards.filter((c) => (ratings.get(c.id) ?? 'new') === rating).length;
            if (rating === 'new' && count === 0) return null; // only when cards were skipped
            return (
              <View
                key={rating}
                accessibilityLabel={`${SESSION_GROUP_LABELS[rating]}: ${count}`}
                className="flex-1 items-center rounded-2xl py-3"
                style={{ backgroundColor: `${ratingColors[rating]}1f` }}
              >
                <Icon name={ratingIcons[rating]} size={24} color={ratingColors[rating]} />
                <Text className="mt-1 text-2xl font-extrabold text-ink">{count}</Text>
                <Text className="text-sm font-semibold text-muted">{SESSION_GROUP_LABELS[rating]}</Text>
              </View>
            );
          })}
        </View>

        {groups.some((g) => g.rating === 'hard') ? <ScreenTip id="summary" className="mb-4" /> : null}

        <Text className="mb-1 text-xl font-bold text-ink">Revise again</Text>
        <Text className="mb-3 text-sm text-muted">Pick the cards for a new round. Hard ones are picked for you.</Text>

        {groups.map((group) => {
          const ids = group.cards.map((c) => c.id);
          const allOn = ids.every((id) => selected.has(id));
          const color = ratingColors[group.rating];
          return (
            <View key={group.rating} className="mb-4 overflow-hidden rounded-2xl border border-line bg-card">
              <View className="flex-row items-center gap-2 px-4 py-3" style={{ backgroundColor: `${color}1f` }}>
                <Icon name={ratingIcons[group.rating]} size={20} color={color} />
                <Text className="flex-1 text-base font-bold text-ink">
                  {SESSION_GROUP_LABELS[group.rating]} · {group.cards.length}
                </Text>
                <Pressable
                  onPress={() => toggle(ids, !allOn)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${allOn ? 'Clear' : 'Select all'} ${SESSION_GROUP_LABELS[group.rating]}`}
                >
                  <Text className="text-sm font-semibold text-primary">{allOn ? 'Clear' : 'Select all'}</Text>
                </Pressable>
              </View>
              {group.cards.map((card) => {
                const on = selected.has(card.id);
                const label = cardLabel?.(card);
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => toggle([card.id], !on)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center gap-3 border-t border-line px-4 py-3 active:bg-surface"
                  >
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                        on ? 'border-primary bg-primary' : 'border-line'
                      }`}
                    >
                      {on ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base text-ink" numberOfLines={2}>
                        {card.front}
                      </Text>
                      {label ? <Text className="text-xs text-muted">{label}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        <TimeRanking cards={cards} times={times} selected={selected} onToggle={toggle} />

        <View className="mt-2 gap-3">
          <Button
            label={selectedCards.length > 0 ? `Revise selected (${selectedCards.length})` : 'Select cards to revise'}
            icon="play"
            variant="cta"
            disabled={selectedCards.length === 0}
            onPress={() => onReviseSelected(selectedCards)}
          />
          <Button label="Study all again" icon="refresh" variant="primary" onPress={onStudyAgain} />
          <Button label={backLabel} variant="secondary" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Which cards took longest, slowest first. Hidden until "Show" is tapped, so the
 * summary stays about how well you knew the cards; tick slow ones to revise them.
 */
function TimeRanking({
  cards,
  times,
  selected,
  onToggle,
}: {
  cards: Card[];
  times: Map<string, number>;
  selected: Set<string>;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const colors = useColors();
  const [shown, setShown] = useState(false);
  const ranked = rankByTime(cards, times);
  const slowest = ranked[0]?.ms || 1;
  const totalMs = ranked.reduce((sum, r) => sum + r.ms, 0);
  const average = cards.length > 0 ? totalMs / cards.length / 1000 : 0;
  const top3 = ranked.slice(0, 3).map((r) => r.card.id);
  const top3On = top3.length > 0 && top3.every((id) => selected.has(id));

  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-line bg-card">
      <View className="flex-row items-center gap-2 bg-primary-soft px-4 py-3">
        <Icon name="podium-outline" size={22} color={colors.primary} />
        <View className="flex-1">
          <Text className="text-base font-bold text-ink">Time per card</Text>
          <Text className="text-xs text-muted">Which cards took you longest</Text>
        </View>
        <Pressable
          onPress={() => setShown((s) => !s)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide time ranking' : 'Show time ranking'}
          className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
            shown ? 'border border-primary bg-card' : 'bg-primary active:bg-primary-dark'
          }`}
        >
          <Icon name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={shown ? colors.primary : colors.white} />
          <Text className={`text-sm font-bold ${shown ? 'text-primary' : 'text-white'}`}>{shown ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>

      {shown ? (
        <>
          <View className="flex-row items-center justify-between border-t border-line px-4 py-2.5">
            <Text className="text-sm text-muted">
              Average <Text className="font-bold text-ink">{formatDuration(average)}</Text> a card
            </Text>
            <Pressable
              onPress={() => onToggle(top3, !top3On)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={top3On ? 'Clear slowest 3' : 'Select slowest 3'}
            >
              <Text className="text-sm font-semibold text-primary">{top3On ? 'Clear slowest 3' : 'Select slowest 3'}</Text>
            </Pressable>
          </View>
          {ranked.map(({ card, ms }, i) => {
            const on = selected.has(card.id);
            const time = formatDuration(ms / 1000);
            const podium = i < 3 && ms > 0;
            return (
              <Pressable
                key={card.id}
                onPress={() => onToggle([card.id], !on)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${i + 1}. ${card.front}, ${time}`}
                className="flex-row items-center gap-3 border-t border-line px-4 py-3 active:bg-surface"
              >
                <View
                  className={`h-8 w-8 items-center justify-center rounded-full ${podium ? 'bg-cta' : 'bg-surface'}`}
                >
                  <Text className={`text-xs font-extrabold ${podium ? 'text-white' : 'text-muted'}`}>{i + 1}</Text>
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="text-base text-ink" numberOfLines={1}>
                    {card.front}
                  </Text>
                  <View className="h-1.5 overflow-hidden rounded-full bg-surface">
                    <View
                      className={`h-full rounded-full ${podium ? 'bg-cta' : 'bg-primary/50'}`}
                      style={{ width: `${(ms / slowest) * 100}%` }}
                    />
                  </View>
                </View>
                <Text className="w-12 text-right text-sm font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
                  {time}
                </Text>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                    on ? 'border-primary bg-primary' : 'border-line'
                  }`}
                >
                  {on ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                </View>
              </Pressable>
            );
          })}
        </>
      ) : (
        <Text className="border-t border-line px-4 py-3 text-sm text-muted">
          Hidden for now. Tap Show to see your slowest cards and tick them to revise.
        </Text>
      )}
    </View>
  );
}

export function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center bg-page px-8">
      <Stack.Screen options={{ title }} />
      <View className="w-full max-w-sm items-center">{children}</View>
    </View>
  );
}
