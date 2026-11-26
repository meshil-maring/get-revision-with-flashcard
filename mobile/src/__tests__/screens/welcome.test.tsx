import { fireEvent, render, screen } from '@testing-library/react-native';

import WelcomeScreen from '@/app/welcome';
import * as settings from '@/data/settings';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/settings');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockedSettings = jest.mocked(settings);

beforeEach(() => {
  jest.clearAllMocks();
  mockedSettings.markWelcomeSeen.mockResolvedValue();
});

describe('Welcome tour', () => {
  it('walks through every step and finishes', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('Welcome to StudyMe')).toBeOnTheScreen();
    expect(screen.getByText('1 of 4')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('Make your cards')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('Study and rate')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('Make your cards')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Go to step 4'));
    expect(screen.getByText('Revise smarter')).toBeOnTheScreen();
    expect(screen.queryByText('Skip')).toBeNull();

    await fireEvent.press(screen.getByText('Get started'));
    expect(mockedSettings.markWelcomeSeen).toHaveBeenCalled();
    expect(mockRouter.router.back).toHaveBeenCalled();
  });

  it('can be skipped, and is not shown again', async () => {
    await render(<WelcomeScreen />);

    await fireEvent.press(screen.getByText('Skip'));

    expect(mockedSettings.markWelcomeSeen).toHaveBeenCalled();
    expect(mockRouter.router.back).toHaveBeenCalled();
  });

  it('goes to Home when there is nothing to go back to', async () => {
    mockRouter.router.canGoBack.mockReturnValueOnce(false);
    await render(<WelcomeScreen />);

    await fireEvent.press(screen.getByText('Skip'));

    expect(mockRouter.router.replace).toHaveBeenCalledWith('/');
  });
});
