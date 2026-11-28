import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import FlashcardsScreen from '@/app/(tabs)/flashcards';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import type { DeckWithCount } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
// The same db object on every render, like the real SQLiteProvider.
// The tab screens read the phone's safe areas (notch, status bar).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/decks');
jest.mock('@/data/cards');

const mockedDecks = jest.mocked(decks);

function deck(overrides: Partial<DeckWithCount>): DeckWithCount {
  return {
    id: 'deck-1',
    name: 'Biology',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    lastStudiedAt: null,
    studySeconds: 0,
    cardCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.useLocalSearchParams.mockReturnValue({});
});

describe('Flashcards screen', () => {
  it('shows a message when there are no decks', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<FlashcardsScreen />);

    expect(await screen.findByText('No decks yet')).toBeOnTheScreen();
  });

  it('lists decks with their card counts', async () => {
    mockedDecks.listDecks.mockResolvedValue([
      deck({ id: 'a', name: 'Biology', description: 'Cells', cardCount: 1 }),
      deck({ id: 'b', name: 'History', cardCount: 12 }),
    ]);

    await render(<FlashcardsScreen />);

    expect(await screen.findByText('Biology')).toBeOnTheScreen();
    expect(screen.getByText('1 card · Cells')).toBeOnTheScreen();
    expect(screen.getByText('History')).toBeOnTheScreen();
    expect(screen.getByText('12 cards')).toBeOnTheScreen();
  });

  it('creates a deck from the form', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);
    mockedDecks.createDeck.mockResolvedValue('new-id');

    await render(<FlashcardsScreen />);
    await screen.findByText('No decks yet');

    await fireEvent.press(screen.getByText('New deck'));
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

  it('opens the new-deck form when asked from another screen', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);
    mockRouter.useLocalSearchParams.mockReturnValue({ new: 'deck' });

    await render(<FlashcardsScreen />);

    expect(await screen.findByPlaceholderText('e.g. Biology – Cells')).toBeOnTheScreen();
    expect(mockRouter.router.setParams).toHaveBeenCalledWith({ new: undefined });
  });

  it('does not save a deck without a name', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<FlashcardsScreen />);
    await screen.findByText('No decks yet');

    await fireEvent.press(screen.getByText('New deck'));
    await fireEvent.press(screen.getByText('Save'));

    expect(mockedDecks.createDeck).not.toHaveBeenCalled();
  });

  it('searches decks and cards', async () => {
    mockedDecks.listDecks.mockResolvedValue([
      deck({ id: 'a', name: 'Biology', cardCount: 2 }),
      deck({ id: 'b', name: 'History', cardCount: 1 }),
    ]);
    jest.mocked(cards.searchCards).mockResolvedValue([
      {
        id: 'card-1',
        deckId: 'b',
        deckName: 'History',
        groupId: null,
        front: 'When did the Biology society start?',
        back: 'In 1850',
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
        favoritedAt: null,
        rating: null,
        ratedAt: null,
      },
    ]);

    await render(<FlashcardsScreen />);
    await screen.findByText('History');

    await fireEvent.changeText(screen.getByLabelText('Search decks and cards'), 'biology');

    expect(await screen.findByText('When did the Biology society start?')).toBeOnTheScreen();
    expect(cards.searchCards).toHaveBeenCalledWith(expect.anything(), 'biology');
    expect(screen.getByText('Decks · 1')).toBeOnTheScreen();
    expect(screen.queryByText('Create revision')).toBeNull();

    // A card opens its deck with the search already filled in.
    await fireEvent.press(screen.getByText('When did the Biology society start?'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/deck/[id]', params: { id: 'b', q: 'biology' } });
  });

  it('says when nothing matches', async () => {
    mockedDecks.listDecks.mockResolvedValue([deck({ id: 'a', name: 'Biology', cardCount: 2 })]);
    jest.mocked(cards.searchCards).mockResolvedValue([]);

    await render(<FlashcardsScreen />);
    await screen.findByText('Biology');

    await fireEvent.changeText(screen.getByLabelText('Search decks and cards'), 'zzz');

    expect(await screen.findByText('Nothing found')).toBeOnTheScreen();
  });
});
