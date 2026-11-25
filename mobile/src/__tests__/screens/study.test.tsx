import { fireEvent, render, screen } from '@testing-library/react-native';

import StudyScreen from '@/app/study/[id]';
import * as cards from '@/data/cards';
import * as activity from '@/data/activity';
import * as attachments from '@/data/attachments';
import * as decks from '@/data/decks';
import type { Card } from '@/data/types';
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
// Replace the animated card with a plain one: these tests check the study flow, not the animation.
jest.mock('@/components/flip-card', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlipCard: ({
      front,
      back,
      flipped,
      onPress,
    }: {
      front: string;
      back: string;
      flipped: boolean;
      onPress: () => void;
    }) => (
      <Pressable onPress={onPress} testID="flip-card">
        <Text>{flipped ? back : front}</Text>
      </Pressable>
    ),
  };
});

const mockedDecks = jest.mocked(decks);
const mockedCards = jest.mocked(cards);
const mockedActivity = jest.mocked(activity);
const mockedAttachments = jest.mocked(attachments);

function card(n: number): Card {
  return {
    id: `card-${n}`,
    deckId: 'deck-1',
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
  mockedDecks.getDeck.mockResolvedValue({
    id: 'deck-1',
    name: 'Biology',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    lastStudiedAt: null,
  });
});

describe('Study screen', () => {
  it('shows only the question until the answer is asked for', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);

    expect(await screen.findByText('Question 1')).toBeOnTheScreen();
    expect(screen.queryByText('Answer 1')).toBeNull();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
    // No rating buttons before the answer is shown.
    expect(screen.queryByRole('button', { name: 'Hard' })).toBeNull();

    await fireEvent.press(screen.getByText('Show answer'));
    expect(screen.getByText('Answer 1')).toBeOnTheScreen();
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

  it('turns shuffle on and restarts from the first card', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2), card(3)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByRole('button', { name: 'OK' }));

    expect(screen.getByRole('switch', { name: 'Shuffle' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('switch', { name: 'Shuffle' }));

    expect(screen.getByRole('switch', { name: 'Shuffle' })).toBeChecked();
    expect(screen.getByText('1 / 3')).toBeOnTheScreen();
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
});
