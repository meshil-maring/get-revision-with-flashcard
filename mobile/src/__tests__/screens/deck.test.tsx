import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import DeckScreen from '@/app/deck/[id]';
import * as attachments from '@/data/attachments';
import * as cardGroups from '@/data/card-groups';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import * as settings from '@/data/settings';
import type { Card, Rating } from '@/data/types';
import { confirm } from '@/lib/confirm';
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
jest.mock('@/lib/confirm', () => ({ confirm: jest.fn(() => Promise.resolve(true)) }));
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

  it('searches the cards by question or answer', async () => {
    await render(<DeckScreen />);
    await screen.findByText('Question 1');

    await fireEvent.changeText(screen.getByLabelText('Search cards'), 'answer 2');

    expect(screen.getByText('Question 2')).toBeOnTheScreen();
    expect(screen.queryByText('Question 1')).toBeNull();
    expect(screen.getByText('Showing 1 of 3 cards')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Search cards'), 'nothing like this');
    expect(screen.getByText('No matching cards')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
    expect(screen.getByText('Question 3')).toBeOnTheScreen();
  });

  it('filters the cards by rating and favourites', async () => {
    jest.mocked(cards.listCards).mockResolvedValue([
      card(1, 'easy'),
      { ...card(2, 'ok'), favoritedAt: '2026-01-02T00:00:00.000Z' },
      card(3, null),
    ]);
    await render(<DeckScreen />);
    await screen.findByText('Question 1');

    // Search and the filter button share one row; the chips are in a sheet.
    await fireEvent.press(screen.getByLabelText('Filter cards'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'New' }));
    expect(screen.getByLabelText('Filter cards, 1 on')).toBeOnTheScreen();
    expect(screen.getByText('Question 3')).toBeOnTheScreen();
    expect(screen.queryByText('Question 1')).toBeNull();

    // Ratings add up: New or Easy.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Easy' }));
    expect(screen.getByText('Question 1')).toBeOnTheScreen();
    expect(screen.queryByText('Question 2')).toBeNull();

    await fireEvent.press(screen.getByText('Clear'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Favourites' }));
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('Question 2')).toBeOnTheScreen();
    expect(screen.queryByText('Question 1')).toBeNull();
    expect(screen.queryByText('Question 3')).toBeNull();
  });

  it('starts with the search from the Flashcards tab filled in', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'deck-1', q: 'Question 3' });

    await render(<DeckScreen />);

    expect(await screen.findByText('Question 3')).toBeOnTheScreen();
    expect(screen.queryByText('Question 1')).toBeNull();
  });

  describe('select mode', () => {
    async function selectFirstTwo() {
      await render(<DeckScreen />);
      await screen.findByText('Question 1');
      await fireEvent(screen.getByText('Question 1'), 'longPress');
      expect(screen.getByText('1 selected')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Question 2' }));
      expect(screen.getByText('2 selected')).toBeOnTheScreen();
    }

    it('starts with a long press, ticks cards, and selects all or none', async () => {
      await selectFirstTwo();

      // Ticking a card again unticks it.
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Question 2' }));
      expect(screen.getByText('1 selected')).toBeOnTheScreen();

      await fireEvent.press(screen.getByText('Select all'));
      expect(screen.getByText('3 selected')).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Select none'));
      expect(screen.getByText('Tap cards to select')).toBeOnTheScreen();

      await fireEvent.press(screen.getByLabelText('Stop selecting'));
      expect(screen.getByText('Cards')).toBeOnTheScreen();
      expect(screen.queryByText('Tap cards to select')).toBeNull();
    });

    it('studies just the selected cards', async () => {
      await selectFirstTwo();

      await fireEvent.press(screen.getByLabelText('Study selected cards'));

      expect(mockRouter.router.push).toHaveBeenCalledWith({
        pathname: '/study/[id]',
        params: { id: 'deck-1', cards: 'card-1,card-2' },
      });
    });

    it('puts the selected cards in a new group', async () => {
      jest.mocked(cardGroups.createGroup).mockResolvedValue('g-new');
      await selectFirstTwo();

      await fireEvent.press(screen.getByLabelText('Put selected cards in a group'));
      await fireEvent.press(screen.getByText('New group…'));
      await fireEvent.changeText(screen.getByPlaceholderText('e.g. Chapter 1, Formulas'), 'Cells');
      await fireEvent.press(screen.getByText('Save'));

      await waitFor(() =>
        expect(cards.setCardsGroup).toHaveBeenCalledWith(expect.anything(), ['card-1', 'card-2'], 'g-new'),
      );
      expect(cardGroups.createGroup).toHaveBeenCalledWith(expect.anything(), 'deck-1', 'Cells');
    });

    it('moves the selected cards to another deck', async () => {
      const other = {
        id: 'deck-2',
        name: 'Chapter 2',
        description: '',
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
        lastStudiedAt: null,
        studySeconds: 0,
        cardCount: 0,
      };
      jest.mocked(decks.listDecks).mockResolvedValue([{ ...other, id: 'deck-1', name: 'This deck' }, other]);
      await selectFirstTwo();

      await fireEvent.press(screen.getByLabelText('Move selected cards to another deck'));
      expect(await screen.findByText('Move 2 cards to')).toBeOnTheScreen();
      expect(screen.queryByText('This deck')).toBeNull(); // not offered: the cards are already here
      await fireEvent.press(screen.getByText('Chapter 2'));

      await waitFor(() =>
        expect(cards.moveCardsToDeck).toHaveBeenCalledWith(expect.anything(), ['card-1', 'card-2'], 'deck-2'),
      );
    });

    it('stars and deletes the selected cards', async () => {
      await selectFirstTwo();
      await fireEvent.press(screen.getByText('Star'));
      await waitFor(() =>
        expect(cards.setFavorites).toHaveBeenCalledWith(expect.anything(), ['card-1', 'card-2'], true),
      );

      await fireEvent(screen.getByText('Question 1'), 'longPress');
      await fireEvent.press(screen.getByLabelText('Delete selected cards'));
      await waitFor(() => expect(cards.deleteCards).toHaveBeenCalledWith(expect.anything(), ['card-1']));
      expect(confirm).toHaveBeenCalledWith('Delete 1 card?', 'The selected cards will be deleted.');
    });
  });
});
