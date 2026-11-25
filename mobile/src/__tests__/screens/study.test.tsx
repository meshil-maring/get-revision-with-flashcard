import { fireEvent, render, screen } from '@testing-library/react-native';

import StudyScreen from '@/app/(revision)/study/[id]';
import * as cards from '@/data/cards';
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

function card(n: number): Card {
  return {
    id: `card-${n}`,
    deckId: 'deck-1',
    front: `Question ${n}`,
    back: `Answer ${n}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.useLocalSearchParams.mockReturnValue({ id: 'deck-1' });
  mockedDecks.getDeck.mockResolvedValue({
    id: 'deck-1',
    name: 'Biology',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  });
});

describe('Study screen', () => {
  it('flips a card to show the answer', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);

    expect(await screen.findByText('Question 1')).toBeOnTheScreen();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('flip-card'));
    expect(screen.getByText('Answer 1')).toBeOnTheScreen();
  });

  it('moves next and previous, always starting on the question', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByTestId('flip-card')); // show answer 1
    await fireEvent.press(screen.getByText('Next →'));
    expect(screen.getByText('Question 2')).toBeOnTheScreen();
    expect(screen.getByText('2 / 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('← Previous'));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
  });

  it('shows the finish screen and can study again', async () => {
    mockedCards.listCards.mockResolvedValue([card(1), card(2)]);

    await render(<StudyScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByText('Next →'));
    await fireEvent.press(screen.getByText('Finish'));
    expect(screen.getByText('Well done!')).toBeOnTheScreen();
    expect(screen.getByText('You went through all 2 cards.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Study again'));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
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
    await fireEvent.press(screen.getByText('Next →'));

    await fireEvent.press(screen.getByText('🔀 Shuffle off'));

    expect(screen.getByText('🔀 Shuffle on')).toBeOnTheScreen();
    expect(screen.getByText('1 / 3')).toBeOnTheScreen();
  });
});
