import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import * as activity from '@/data/activity';
import * as decks from '@/data/decks';
import { addDays, dayKey } from '@/lib/dates';
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

jest.mock('@/data/activity', () => ({ listActivity: jest.fn() }));

const mockedDecks = jest.mocked(decks);
const mockedActivity = jest.mocked(activity);

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
  mockedActivity.listActivity.mockResolvedValue([]);
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

    await fireEvent.press(screen.getByText('Ask AI to make notes or flashcards...'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/coming-soon',
      params: { feature: 'ai' },
    });
  });

  it('shows the day streak and best streak', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);
    const today = new Date();
    mockedActivity.listActivity.mockResolvedValue([
      { day: dayKey(addDays(today, -10)), cards: 3, seconds: 0 },
      { day: dayKey(addDays(today, -9)), cards: 3, seconds: 0 },
      { day: dayKey(addDays(today, -8)), cards: 3, seconds: 0 },
      { day: dayKey(addDays(today, -7)), cards: 3, seconds: 0 },
      { day: dayKey(addDays(today, -1)), cards: 5, seconds: 0 },
      { day: dayKey(today), cards: 12, seconds: 0 },
    ]);

    await render(<HomeScreen />);

    expect(await screen.findByText('2-day streak')).toBeOnTheScreen();
    expect(screen.getByText('4 days')).toBeOnTheScreen(); // best
    expect(screen.getByText('You studied today. Nice work!')).toBeOnTheScreen();
  });

  it('shows how long you studied on the day you tap', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);
    const today = new Date();
    mockedActivity.listActivity.mockResolvedValue([
      { day: dayKey(addDays(today, -1)), cards: 8, seconds: 3900 },
      { day: dayKey(today), cards: 3, seconds: 600 },
    ]);

    await render(<HomeScreen />);
    await screen.findByText('2-day streak');
    await fireEvent(screen.getByTestId('activity-heatmap'), 'layout', {
      nativeEvent: { layout: { width: 400, height: 200 } },
    });

    // Today is shown until another day is tapped.
    expect(screen.getByText('10 min · 3 cards')).toBeOnTheScreen();
    expect(screen.getByText('2 of', { exact: false })).toHaveTextContent(/1 h 15 min/);

    await fireEvent.press(screen.getByLabelText('Yesterday: 1 h 05 min · 8 cards'));
    expect(screen.getByText('Yesterday')).toBeOnTheScreen();
    expect(screen.getByText('1 h 05 min · 8 cards')).toBeOnTheScreen();
  });

  it('invites starting a streak when there is no study yet', async () => {
    mockedDecks.listDecks.mockResolvedValue([]);

    await render(<HomeScreen />);

    expect(await screen.findByText('Study a card to start a streak')).toBeOnTheScreen();
  });
});
