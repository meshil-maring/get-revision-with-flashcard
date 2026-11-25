import { fireEvent, render, screen } from '@testing-library/react-native';

import { ScreenTip, TIPS } from '@/components/screen-tip';
import * as settings from '@/data/settings';
import { GUIDE_TOPICS } from '@/lib/guide';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/settings');

const mockedSettings = jest.mocked(settings);

beforeEach(() => {
  jest.clearAllMocks();
  mockedSettings.dismissTip.mockResolvedValue();
});

describe('ScreenTip', () => {
  it('shows the tip until "Got it" is pressed, and remembers that', async () => {
    mockedSettings.isTipDismissed.mockResolvedValue(false);
    await render(<ScreenTip id="study" />);

    expect(await screen.findByText('Think first, then rate')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Got it'));

    expect(screen.queryByText('Think first, then rate')).toBeNull();
    expect(mockedSettings.dismissTip).toHaveBeenCalledWith(expect.anything(), 'study');
  });

  it('can also be closed with the ×', async () => {
    mockedSettings.isTipDismissed.mockResolvedValue(false);
    await render(<ScreenTip id="deck" />);

    await fireEvent.press(await screen.findByLabelText('Close tip'));

    expect(screen.queryByText(TIPS.deck.title)).toBeNull();
    expect(mockedSettings.dismissTip).toHaveBeenCalledWith(expect.anything(), 'deck');
  });

  it('stays hidden once dismissed', async () => {
    mockedSettings.isTipDismissed.mockResolvedValue(true);
    await render(<ScreenTip id="study" />);
    await Promise.resolve();

    expect(screen.queryByText('Think first, then rate')).toBeNull();
  });

  it('opens the matching guide topic', async () => {
    mockedSettings.isTipDismissed.mockResolvedValue(false);
    await render(<ScreenTip id="revision" />);

    await fireEvent.press(await screen.findByText('Learn more'));

    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/help/[topic]',
      params: { topic: 'revision' },
    });
  });

  it('every tip links to a real guide topic', () => {
    const topics = new Set(GUIDE_TOPICS.map((t) => t.id));
    for (const [id, tip] of Object.entries(TIPS)) {
      expect({ id, ok: topics.has(tip.topic) }).toEqual({ id, ok: true });
    }
  });
});
