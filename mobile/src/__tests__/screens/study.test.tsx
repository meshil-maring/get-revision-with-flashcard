import { act, fireEvent, render, screen } from '@testing-library/react-native';

import StudyScreen from '@/app/study/[id]';
import * as cards from '@/data/cards';
import * as activity from '@/data/activity';
import * as attachments from '@/data/attachments';
import * as decks from '@/data/decks';
import * as settings from '@/data/settings';
import type { Card } from '@/data/types';
import { shuffle } from '@/lib/shuffle';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
// The same db object on every render, like the real SQLiteProvider.
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/decks');
jest.mock('@/data/cards');
jest.mock('@/data/activity');
jest.mock('@/data/attachments');
jest.mock('@/data/settings');
// Shuffle is on by default; keep the order in tests so they can check which card shows.
jest.mock('@/lib/shuffle', () => ({ shuffle: jest.fn((items: unknown[]) => [...items]) }));
// Replace the animated card with a plain one: these tests check the study flow, not the animation.
jest.mock('@/components/cards/flip-card', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlipCard: ({
      front,
      back,
      flipped,
      onPress,
      onEdit,
    }: {
      front: string;
      back: string;
      flipped: boolean;
      onPress: () => void;
      onEdit?: () => void;
    }) => (
      <>
        <Pressable onPress={onPress} testID="flip-card">
          <Text>{flipped ? back : front}</Text>
        </Pressable>
        {onEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit card">
            <Text>Edit</Text>
          </Pressable>
        ) : null}
      </>
    ),
  };
});

const mockedDecks = jest.mocked(decks);
const mockedCards = jest.mocked(cards);
const mockedActivity = jest.mocked(activity);
const mockedAttachments = jest.mocked(attachments);
const mockedSettings = jest.mocked(settings);

function card(n: number): Card {
  return {
    id: `card-${n}`,
    deckId: 'deck-1',
    groupId: null,
    front: `Question ${n}`,
    back: `Answer ${n}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    favoritedAt: null,
    rating: null,
    ratedAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.useLocalSearchParams.mockReturnValue({ id: 'deck-1' });
  mockedAttachments.listAttachmentsForCards.mockResolvedValue(new Map());
  mockedSettings.getAutoNext.mockResolvedValue(0);
  mockedSettings.getAutoNextPauseOnAnswer.mockResolvedValue(false);
  mockedSettings.isTipDismissed.mockResolvedValue(true);
  mockedDecks.getDeck.mockResolvedValue({
    id: 'deck-1',
    name: 'Biology',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    lastStudiedAt: null,
    studySeconds: 0,
  });
});

describe('Study screen', () => {
  it('shows only the question until the answer is asked for', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);

    expect(await screen.findByText('Question 1')).toBeOnTheScreen();
    expect(screen.queryByText('Answer 1')).toBeNull();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
    // Rating is locked until the answer is shown.
    expect(screen.getByRole('button', { name: 'Hard' })).toBeDisabled();

    await fireEvent.press(screen.getByText('Show answer'));
    expect(screen.getByText('Answer 1')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hard' })).toBeEnabled();
  });

  it('skips to the next card without rating, and finishes after the last', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question 2')).toBeOnTheScreen();
    expect(mockedCards.rateCard).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByText('Well done!')).toBeOnTheScreen();
  });

  it('flips the card by tapping it too', async () => {
    mockedCards.listCards.mockResolvedValue([card(1)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByTestId('flip-card'));
    expect(screen.getByText('Answer 1')).toBeOnTheScreen();
  });

  it('rates a card, saves the rating and moves to the next question', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'Hard' }));

    expect(mockedCards.rateCard).toHaveBeenCalledWith(expect.anything(), 'card-1', 'hard');
    expect(screen.getByText('Question 2')).toBeOnTheScreen();
    expect(screen.getByText('2 / 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Previous'));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
  });

  it('shows a summary grouped by rating and revises the picked cards again', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2), card(3)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    for (const rating of ['Hard', 'Easy', 'Hard']) {
      await fireEvent.press(screen.getByText('Show answer'));
      await fireEvent.press(screen.getByRole('button', { name: rating }));
    }

    expect(screen.getByText('Well done!')).toBeOnTheScreen();
    expect(screen.getByText('You went through all 3 cards.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hard: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('OK: 0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Easy: 1')).toBeOnTheScreen();
    expect(screen.getByText('Hard · 2')).toBeOnTheScreen();
    expect(screen.getByText('Easy · 1')).toBeOnTheScreen();

    // Hard cards are picked to start with; add the easy one, then take it out again.
    expect(screen.getByText('Revise selected (2)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Question 2'));
    expect(screen.getByText('Revise selected (3)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Question 2'));

    await fireEvent.press(screen.getByText('Revise selected (2)'));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
  });

  it('can study the whole round again from the summary', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');
    for (let i = 0; i < 2; i += 1) {
      await fireEvent.press(screen.getByText('Show answer'));
      await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
    }

    await fireEvent.press(screen.getByText('Study all again'));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
  });

  it('marks a card as a favourite', async () => {
    mockedCards.listCards.mockResolvedValue([card(1)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    expect(screen.getByRole('switch', { name: 'Favourite' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('switch', { name: 'Favourite' }));

    expect(screen.getByRole('switch', { name: 'Favourite' })).toBeChecked();
    expect(mockedCards.setFavorite).toHaveBeenCalledWith(expect.anything(), 'card-1', true);
  });

  it('shows a message when the deck has no cards', async () => {
    mockedCards.listCards.mockResolvedValue([]);

    await render(<StudyScreen />);

    expect(await screen.findByText('No cards to study')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Back to deck'));
    expect(mockRouter.router.back).toHaveBeenCalled();
  });

  it('shuffles by default, and shuffle can be turned off (restarting from the first card)', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2), card(3)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');
    expect(shuffle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch', { name: 'Shuffle' })).toBeChecked();

    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('2 / 3')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('switch', { name: 'Shuffle' }));
    expect(screen.getByRole('switch', { name: 'Shuffle' })).not.toBeChecked();
    expect(screen.getByText('1 / 3')).toBeOnTheScreen();
    expect(shuffle).toHaveBeenCalledTimes(1); // the original order now
  });

  it('counts each card once for the streak, even when rated again', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'OK' })); // card 1 reviewed
    await fireEvent.press(screen.getByLabelText('Previous'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'Easy' })); // card 1 again: not counted
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'Hard' })); // card 2 reviewed

    expect(mockedActivity.recordReview).toHaveBeenCalledTimes(2);
  });

  it('opens the editor for the card on screen', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);
    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Edit card' }));

    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/card-editor',
      params: { deckId: 'deck-1', cardId: 'card-2' },
    });
  });

  it('groups skipped cards as Unmarked, then Easy, OK and Hard', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2), card(3)]);
    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'Hard' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' })); // card 2 skipped
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'Easy' }));

    expect(screen.getByLabelText('Unmarked: 1')).toBeOnTheScreen();
    const headings = screen.getAllByText(/ · \d$/).map((t) => t.props.children.join(''));
    expect(headings).toEqual(['Unmarked · 1', 'Easy · 1', 'Hard · 1']);
  });

  describe('time ranking', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('stays hidden until Show, ranks the slowest first, and ticks cards to revise', async () => {
      mockedCards.listCards.mockResolvedValue([card(1), card(2)]);
      await render(<StudyScreen />);
      await screen.findByText('Question 1');

      await act(() => jest.advanceTimersByTime(4000)); // card 1: 4 s
      await fireEvent.press(screen.getByText('Show answer'));
      await fireEvent.press(screen.getByRole('button', { name: 'Easy' }));
      await act(() => jest.advanceTimersByTime(12000)); // card 2: 12 s
      await fireEvent.press(screen.getByText('Show answer'));
      await fireEvent.press(screen.getByRole('button', { name: 'Easy' }));

      expect(screen.getByText('Well done!')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^1\. /)).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Show time ranking' }));
      expect(screen.getByLabelText('1. Question 2, 0:12')).toBeOnTheScreen();
      expect(screen.getByLabelText('2. Question 1, 0:04')).toBeOnTheScreen();
      expect(screen.getByText('0:08')).toBeOnTheScreen(); // average

      expect(screen.getByText('Select cards to revise')).toBeOnTheScreen();
      await fireEvent.press(screen.getByLabelText('1. Question 2, 0:12'));
      expect(screen.getByText('Revise selected (1)')).toBeOnTheScreen();
    });
  });

  describe('time per card', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('moves to the next card when the time runs out, and finishes after the last', async () => {
      mockedSettings.getAutoNext.mockResolvedValue(10);
      mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

      await render(<StudyScreen />);
      await screen.findByText('Question 1');
      expect(screen.getByText('0:10')).toBeOnTheScreen();

      await act(() => jest.advanceTimersByTime(4000));
      expect(screen.getByText('0:06')).toBeOnTheScreen();

      await act(() => jest.advanceTimersByTime(6000));
      expect(screen.getByText('Question 2')).toBeOnTheScreen();
      expect(screen.getByText('0:10')).toBeOnTheScreen(); // a fresh countdown
      expect(mockedCards.rateCard).not.toHaveBeenCalled();

      await act(() => jest.advanceTimersByTime(10000));
      expect(screen.getByText('Well done!')).toBeOnTheScreen();
    });

    it('can be paused', async () => {
      mockedSettings.getAutoNext.mockResolvedValue(10);
      mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

      await render(<StudyScreen />);
      await screen.findByText('Question 1');

      await fireEvent.press(screen.getByLabelText(/^Pause auto next/));
      await act(() => jest.advanceTimersByTime(30000));
      expect(screen.getByText('Question 1')).toBeOnTheScreen();
      expect(screen.getByText('Paused')).toBeOnTheScreen();
    });

    it('waits while the answer shows, when Pause on answer is on', async () => {
      mockedSettings.getAutoNext.mockResolvedValue(10);
      mockedSettings.getAutoNextPauseOnAnswer.mockResolvedValue(true);
      mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

      await render(<StudyScreen />);
      await screen.findByText('Question 1');
      await act(() => jest.advanceTimersByTime(3000));

      await fireEvent.press(screen.getByText('Show answer'));
      await act(() => jest.advanceTimersByTime(30000));
      expect(screen.getByText('Answer 1')).toBeOnTheScreen();
      expect(screen.getByText('0:07')).toBeOnTheScreen();

      // Back to the question: the countdown carries on.
      await fireEvent.press(screen.getByText('Show question'));
      await act(() => jest.advanceTimersByTime(7000));
      expect(screen.getByText('Question 2')).toBeOnTheScreen();
    });

    it('keeps counting on the answer when Pause on answer is off', async () => {
      mockedSettings.getAutoNext.mockResolvedValue(10);
      mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

      await render(<StudyScreen />);
      await screen.findByText('Question 1');
      await fireEvent.press(screen.getByText('Show answer'));
      await act(() => jest.advanceTimersByTime(10000));
      expect(screen.getByText('Question 2')).toBeOnTheScreen();
    });

    it('is not shown when off', async () => {
      mockedCards.listCards.mockResolvedValue([card(1)]);
      await render(<StudyScreen />);
      await screen.findByText('Question 1');
      expect(screen.queryByLabelText(/auto next/)).toBeNull();
    });
  });
});
