import { fireEvent, render, screen } from '@testing-library/react-native';

import NewRevisionScreen from '@/app/new-revision';
import * as decks from '@/data/decks';
import type { DeckWithCount } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/decks');

const mockedDecks = jest.mocked(decks);

function deck(id: string, name: string, cardCount: number): DeckWithCount {
  return {
    id,
    name,
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    lastStudiedAt: null,
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
});
