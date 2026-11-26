import { fireEvent, render, screen } from '@testing-library/react-native';

import NewRevisionScreen from '@/app/new-revision';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import type { Card, DeckWithCount, Rating } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/decks');
jest.mock('@/data/cards');

const mockedDecks = jest.mocked(decks);
const mockedCards = jest.mocked(cards);

function card(id: string, deckId: string, rating: Rating | null, favorite = false): Card {
  return {
    id,
    deckId,
    groupId: null,
    front: `Q ${id}`,
    back: `A ${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    favoritedAt: favorite ? '2026-01-02T00:00:00.000Z' : null,
    rating,
    ratedAt: null,
  };
}

function deck(id: string, name: string, cardCount: number): DeckWithCount {
  return {
    id,
    name,
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    lastStudiedAt: null,
    studySeconds: 0,
    cardCount,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDecks.listDecks.mockResolvedValue([
    deck('a', 'Biology', 3),
    deck('b', 'History', 2),
    deck('c', 'Empty', 0),
  ]);
  mockedCards.listCardsForDecks.mockResolvedValue([
    card('a1', 'a', 'hard', true),
    card('a2', 'a', 'easy'),
    card('a3', 'a', null),
    card('b1', 'b', 'ok'),
    card('b2', 'b', 'hard'),
  ]);
});

describe('Create Revision screen', () => {
  it('starts a revision with the selected decks', async () => {
    await render(<NewRevisionScreen />);
    await screen.findByText('Biology');
    expect(screen.getByText('Select at least one deck')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Biology'));
    await fireEvent.press(screen.getByText('History'));
    expect(screen.getByText('2 decks · 5 cards')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start revision'));

    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/revise',
      params: { decks: 'a,b' },
    });
  });

  it('unselects a deck when pressed again', async () => {
    await render(<NewRevisionScreen />);
    await screen.findByText('Biology');

    await fireEvent.press(screen.getByText('Biology'));
    expect(screen.getByText('1 deck · 3 cards')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Biology'));
    expect(screen.getByText('Select at least one deck')).toBeOnTheScreen();
  });

  it('select all skips decks without cards', async () => {
    await render(<NewRevisionScreen />);
    await screen.findByText('Biology');

    await fireEvent.press(screen.getByText('Select all'));
    expect(screen.getByText('2 decks · 5 cards')).toBeOnTheScreen();
    expect(screen.getByText('No cards yet')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Clear'));
    expect(screen.getByText('Select at least one deck')).toBeOnTheScreen();
  });

  it('revises only the cards with the chosen ratings', async () => {
    await render(<NewRevisionScreen />);
    await screen.findByText('Biology');
    await fireEvent.press(screen.getByText('Select all'));

    // Leave only Hard on.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'OK' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Easy' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'New' }));
    expect(screen.getByText('2 decks · 2 cards')).toBeOnTheScreen();
    expect(screen.getByText('1 of 3 cards match')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Start revision'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/revise',
      params: { decks: 'a,b', ratings: 'hard' },
    });
  });

  it('can revise favourites only', async () => {
    await render(<NewRevisionScreen />);
    await screen.findByText('Biology');
    await fireEvent.press(screen.getByText('History'));

    await fireEvent.press(screen.getByRole('switch', { name: 'Favourites only' }));
    expect(screen.getByText('No cards match the filter')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Biology'));
    expect(screen.getByText('2 decks · 1 card')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start revision'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/revise',
      params: { decks: 'a,b', favorites: '1' },
    });
  });
});
