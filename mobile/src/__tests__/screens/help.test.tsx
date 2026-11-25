import { fireEvent, render, screen } from '@testing-library/react-native';

import HelpScreen from '@/app/help';
import HelpTopicScreen from '@/app/help/[topic]';
import * as settings from '@/data/settings';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/settings');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Help & guide', () => {
  it('lists the topics by section and opens one', async () => {
    await render(<HelpScreen />);

    expect(screen.getByText('Basics')).toBeOnTheScreen();
    expect(screen.getByText('Studying')).toBeOnTheScreen();
    expect(screen.getByText('Getting started')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Favourites'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/help/[topic]',
      params: { topic: 'favourites' },
    });
  });

  it('searches the guide', async () => {
    await render(<HelpScreen />);

    await fireEvent.changeText(screen.getByLabelText('Search the guide'), 'microphone permission');
    expect(screen.getByText('1 result')).toBeOnTheScreen();
    expect(screen.getByText('Questions and answers')).toBeOnTheScreen();
    expect(screen.queryByText('Decks')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Search the guide'), 'zebra');
    expect(screen.getByText('Nothing found')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByText('Decks')).toBeOnTheScreen();
  });

  it('brings the screen tips back', async () => {
    jest.mocked(settings.resetTips).mockResolvedValue();
    await render(<HelpScreen />);

    await fireEvent.press(screen.getByText('Show tips again'));

    expect(settings.resetTips).toHaveBeenCalled();
    expect(await screen.findByText('Tips will show again on each screen')).toBeOnTheScreen();
  });

  it('opens the app tour', async () => {
    await render(<HelpScreen />);
    await fireEvent.press(screen.getByText('Watch the quick app tour'));
    expect(mockRouter.router.push).toHaveBeenCalledWith('/welcome');
  });
});

describe('Help topic', () => {
  it('shows the topic and moves to the next one', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ topic: 'getting-started' });
    await render(<HelpTopicScreen />);

    expect(screen.getByText('Your first five minutes')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Previous/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Next: Decks'));
    expect(mockRouter.router.replace).toHaveBeenCalledWith({
      pathname: '/help/[topic]',
      params: { topic: 'decks' },
    });
  });

  it('shows a message for an unknown topic', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ topic: 'missing' });
    await render(<HelpTopicScreen />);
    expect(screen.getByText('Topic not found')).toBeOnTheScreen();
  });
});
