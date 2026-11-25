import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/index';
import * as decks from '@/data/decks';
import type { DeckWithCount } from '@/data/types';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
// The same db object on every render, like the real SQLiteProvider.
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/decks');

const mockedDecks = jest.mocked(decks);

function deck(overrides: Partial<DeckWithCount>): DeckWithCount {
  return {
    id: 'deck-1',
    name: 'Biology',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    cardCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Home screen', () => {
  it('shows a message when there are no decks', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<HomeScreen />);

    expect(await screen.findByText('No decks yet')).toBeOnTheScreen();
  });

  it('lists decks with their card counts', async () => {
    mockedDecks.listDecks.mockResolvedValue([
      deck({ id: 'a', name: 'Biology', description: 'Cells', cardCount: 1 }),
      deck({ id: 'b', name: 'History', cardCount: 12 }),
    ]);

    await render(<HomeScreen />);

    expect(await screen.findByText('Biology')).toBeOnTheScreen();
    expect(screen.getByText('Cells')).toBeOnTheScreen();
    expect(screen.getByText('1 card')).toBeOnTheScreen();
    expect(screen.getByText('History')).toBeOnTheScreen();
    expect(screen.getByText('12 cards')).toBeOnTheScreen();
  });

  it('creates a deck from the form', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);
    mockedDecks.createDeck.mockResolvedValue('new-id');

    await render(<HomeScreen />);
    await screen.findByText('No decks yet');

    await fireEvent.press(screen.getByText('+ New deck'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Biology – Cells'), 'Chemistry');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockedDecks.createDeck).toHaveBeenCalledWith(expect.anything(), {
        name: 'Chemistry',
        description: '',
      }),
    );
    // The list is reloaded after saving.
    await waitFor(() => expect(mockedDecks.listDecks).toHaveBeenCalledTimes(2));
  });

  it('does not save a deck without a name', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<HomeScreen />);
    await screen.findByText('No decks yet');

    await fireEvent.press(screen.getByText('+ New deck'));
    await fireEvent.press(screen.getByText('Save'));

    expect(mockedDecks.createDeck).not.toHaveBeenCalled();
  });
});
