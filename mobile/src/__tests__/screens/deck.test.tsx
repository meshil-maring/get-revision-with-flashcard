import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import DeckScreen from '@/app/deck/[id]';
import * as attachments from '@/data/attachments';
import * as cardGroups from '@/data/card-groups';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import * as settings from '@/data/settings';
import type { Card, Rating } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/data/decks');
jest.mock('@/data/cards');
jest.mock('@/data/attachments');
jest.mock('@/data/card-groups');
jest.mock('@/data/settings', () => ({
  ...jest.requireActual('@/data/settings'),
  getAutoNext: jest.fn(),
  getAutoNextPauseOnAnswer: jest.fn(),
  setAutoNextPauseOnAnswer: jest.fn(),
  setAutoNext: jest.fn(),
  getLastCustomAutoNext: jest.fn(),
  setLastCustomAutoNext: jest.fn(),
  isTipDismissed: jest.fn(),
}));

function card(n: number, rating: Rating | null): Card {
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
    rating,
    ratedAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.useLocalSearchParams.mockReturnValue({ id: 'deck-1' });
  jest.mocked(decks.getDeck).mockResolvedValue({
    id: 'deck-1',
    name: 'Chapter 1',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    lastStudiedAt: null,
    studySeconds: 180,
  });
  jest.mocked(cards.listCards).mockResolvedValue([card(1, 'easy'), card(2, 'ok'), card(3, null)]);
  jest.mocked(attachments.listAttachmentsForCards).mockResolvedValue(new Map());
  jest.mocked(cardGroups.listGroups).mockResolvedValue([]);
  jest.mocked(settings.getAutoNext).mockResolvedValue(0);
  jest.mocked(settings.getAutoNextPauseOnAnswer).mockResolvedValue(false);
  jest.mocked(settings.getLastCustomAutoNext).mockResolvedValue(0);
  jest.mocked(settings.isTipDismissed).mockResolvedValue(true);
});

describe('Deck screen', () => {
  it('shows the deck summary apart from its cards', async () => {
    await render(<DeckScreen />);

    expect(await screen.findByText('Question 1')).toBeOnTheScreen();
    expect(screen.getByText('3 cards')).toBeOnTheScreen();
    expect(screen.getByText('3 min studied')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ratings: 1 Easy, 1 OK, 1 New')).toBeOnTheScreen();
    expect(screen.getByText('Cards')).toBeOnTheScreen();
  });

  it('starts studying and opens the time per card picker', async () => {
    await render(<DeckScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByText('Study'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/study/[id]', params: { id: 'deck-1' } });

    await fireEvent.press(screen.getByLabelText('Time per card: Off'));
    expect(screen.getByText('Time per card')).toBeOnTheScreen();
  });

  it('shows cards under their groups, folds a group, and studies one group', async () => {
    const group = (id: string, name: string, position: number) => ({
      id,
      deckId: 'deck-1',
      name,
      position,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    });
    jest.mocked(cardGroups.listGroups).mockResolvedValue([group('g1', 'Formulas', 0), group('g2', 'Empty one', 1)]);
    jest
      .mocked(cards.listCards)
      .mockResolvedValue([{ ...card(1, null), groupId: 'g1' }, card(2, null), { ...card(3, null), groupId: 'g1' }]);

    await render(<DeckScreen />);

    expect(await screen.findByLabelText('Formulas, 2 cards')).toBeOnTheScreen();
    expect(screen.getByLabelText('Other cards, 1 card')).toBeOnTheScreen();
    expect(screen.getByText('No cards yet · add one')).toBeOnTheScreen(); // the empty group

    await fireEvent.press(screen.getByLabelText('Formulas, 2 cards'));
    expect(screen.queryByText('Question 1')).toBeNull();
    expect(screen.getByText('Question 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Study Formulas'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/study/[id]',
      params: { id: 'deck-1', groupId: 'g1' },
    });
  });

  it('makes a new group', async () => {
    await render(<DeckScreen />);
    await screen.findByText('Question 1');

    await fireEvent.press(screen.getByLabelText('New group'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Chapter 1, Formulas'), 'Chapter 1');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(cardGroups.createGroup).toHaveBeenCalledWith(expect.anything(), 'deck-1', 'Chapter 1'));
  });
});
