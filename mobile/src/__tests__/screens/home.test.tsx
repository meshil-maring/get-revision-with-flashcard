import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import * as decks from '@/data/decks';
import type { DeckWithCount } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
// Keep the real pickContinueDeck; only the database calls are mocked.
jest.mock('@/data/decks', () => ({
  ...jest.requireActual('@/data/decks'),
  listDecks: jest.fn(),
}));

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
    cardCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Home screen', () => {
  it('continues the most recently studied deck', async () => {
    mockedDecks.listDecks.mockResolvedValue([
      deck({ id: 'maths', name: 'Maths', cardCount: 5 }),
      deck({ id: 'chem', name: 'Chemistry', cardCount: 12, lastStudiedAt: '2026-02-01T00:00:00.000Z' }),
    ]);

    await render(<HomeScreen />);

    expect(await screen.findByText('12 flashcards')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Continue studying Chemistry'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/study/[id]',
      params: { id: 'chem' },
    });
  });

  it('shows decks as subjects and opens one', async () => {
    mockedDecks.listDecks.mockResolvedValue([deck({ id: 'phys', name: 'Physics', cardCount: 2 })]);

    await render(<HomeScreen />);

    await fireEvent.press(await screen.findByLabelText('Open subject Physics'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/deck/[id]',
      params: { id: 'phys' },
    });
  });

  it('suggests creating a deck when there is nothing to study', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<HomeScreen />);

    await fireEvent.press(await screen.findByText('Nothing to study yet'));
    expect(mockRouter.router.navigate).toHaveBeenCalledWith({
      pathname: '/flashcards',
      params: { new: 'deck' },
    });
  });

  it('opens Coming soon for features that are not built yet', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<HomeScreen />);
    await screen.findByText('Nothing to study yet');

    await fireEvent.press(screen.getByText('AI Study'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/coming-soon',
      params: { feature: 'ai-study' },
    });
  });
});
