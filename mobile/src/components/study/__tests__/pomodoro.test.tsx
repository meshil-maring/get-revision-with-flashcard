import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Vibration } from 'react-native';

import { FocusSoundButton } from '@/components/study/focus-sound';
import { getSetting, setSetting } from '@/data/settings';
import { catchUp, DEFAULT_CUSTOM, formatClock, nextPhase, parsePomodoroPrefs, POMODORO_PRESETS } from '@/lib/pomodoro';
import { FocusSoundProvider } from '@/providers/focus-sound';
import { PomodoroProvider } from '@/providers/pomodoro';

const mockDb = {};
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/data/settings', () => ({
  SETTINGS: { focusSound: 'focus_sound', pomodoro: 'pomodoro' },
  getSetting: jest.fn(async () => null),
  setSetting: jest.fn(async () => {}),
}));

const classic = POMODORO_PRESETS[0];
const MIN = 60_000;

describe('pomodoro lib', () => {
  it('goes focus → short break, and a long break after every set of rounds', () => {
    expect(nextPhase(classic, 'focus', 0)).toEqual({ phase: 'short', done: 1 });
    expect(nextPhase(classic, 'short', 1)).toEqual({ phase: 'focus', done: 1 });
    expect(nextPhase(classic, 'focus', 3)).toEqual({ phase: 'long', done: 4 });
    expect(nextPhase(classic, 'long', 4)).toEqual({ phase: 'focus', done: 4 });
  });

  it('catches up on phases that ended while away', () => {
    const run = { phase: 'focus' as const, done: 0, endsAt: 25 * MIN };
    expect(catchUp(classic, run, 10 * MIN)).toEqual({ ...run, changed: false });
    // 25 focus + 5 break, then 3 minutes into the next focus.
    expect(catchUp(classic, run, 33 * MIN)).toEqual({ phase: 'focus', done: 1, endsAt: 55 * MIN, changed: true });
  });

  it('formats time left', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(200)).toBe('0:01');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('reads saved lengths, falling back to the classic ones', () => {
    expect(parsePomodoroPrefs('{"presetId":"long"}')).toEqual({ presetId: 'long', custom: DEFAULT_CUSTOM });
    expect(parsePomodoroPrefs('{"presetId":"nope"}')).toEqual({ presetId: 'classic', custom: DEFAULT_CUSTOM });
    expect(parsePomodoroPrefs('bad')).toEqual({ presetId: 'classic', custom: DEFAULT_CUSTOM });
    expect(parsePomodoroPrefs(null)).toEqual({ presetId: 'classic', custom: DEFAULT_CUSTOM });
  });

  it('reads custom lengths, keeping them in range', () => {
    expect(
      parsePomodoroPrefs('{"presetId":"custom","custom":{"focus":40,"short":999,"long":"x","rounds":0}}'),
    ).toEqual({ presetId: 'custom', custom: { focus: 40, short: 30, long: DEFAULT_CUSTOM.long, rounds: 1 } });
  });
});

describe('Pomodoro timer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getSetting).mockImplementation(async () => null);
    jest.useFakeTimers();
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  });
  afterEach(() => jest.useRealTimers());

  async function openSheet() {
    await render(
      <FocusSoundProvider>
        <PomodoroProvider>
          <FocusSoundButton />
        </PomodoroProvider>
      </FocusSoundProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Study sounds and timer' }));
  }

  it('counts down, shows the time on the button, and buzzes into a break', async () => {
    await openSheet();
    expect(screen.getByLabelText('25:00 left')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Start 25 min focus'));
    await act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByLabelText('24:00 left')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Study sounds and timer, Focus 24:00 left' })).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTime(24 * MIN));
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Short break')).toBeOnTheScreen();
    expect(screen.getByLabelText('5:00 left')).toBeOnTheScreen();
    expect(screen.getByLabelText('Round 1 of 4')).toBeOnTheScreen();
  });

  it('pauses, resumes, skips and resets', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Start 25 min focus'));
    await act(() => jest.advanceTimersByTime(5 * MIN));
    await fireEvent.press(screen.getByText('Pause'));
    await act(() => jest.advanceTimersByTime(5 * MIN));
    expect(screen.getByLabelText('20:00 left')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Resume'));
    await fireEvent.press(screen.getByRole('button', { name: 'Skip to break' }));
    expect(screen.getByText('Short break')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Reset timer' }));
    expect(screen.getByText('Start 25 min focus')).toBeOnTheScreen();
    expect(screen.getByLabelText('Round 1 of 4')).toBeOnTheScreen();
  });

  it('remembers other lengths', async () => {
    await openSheet();
    await fireEvent.press(screen.getByRole('button', { name: '50 minutes focus, 10 minute breaks' }));
    expect(screen.getByText('Start 50 min focus')).toBeOnTheScreen();
    expect(setSetting).toHaveBeenLastCalledWith(
      {},
      'pomodoro',
      JSON.stringify({ presetId: 'long', custom: DEFAULT_CUSTOM }),
    );
  });

  it('times your own lengths with Custom', async () => {
    await openSheet();
    expect(screen.queryByText('Short break')).toBeNull(); // steppers hidden until Custom is picked
    await fireEvent.press(screen.getByRole('button', { name: 'Custom lengths' }));
    expect(screen.getByText('Start 30 min focus')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'More focus' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Less short break' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Less long break after' }));
    expect(screen.getByLabelText('Focus: 35 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Short break: 4 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Long break after: 3 rounds')).toBeOnTheScreen();
    expect(setSetting).toHaveBeenLastCalledWith(
      {},
      'pomodoro',
      JSON.stringify({ presetId: 'custom', custom: { focus: 35, short: 4, long: 15, rounds: 3 } }),
    );

    await fireEvent.press(screen.getByText('Start 35 min focus'));
    await act(() => jest.advanceTimersByTime(35 * MIN));
    expect(screen.getByLabelText('4:00 left')).toBeOnTheScreen();
    expect(screen.getByLabelText('Round 1 of 3')).toBeOnTheScreen();
  });

  it('stops at the limits', async () => {
    jest.mocked(getSetting).mockImplementation(async (_db, key) =>
      key === 'pomodoro' ? JSON.stringify({ presetId: 'custom', custom: { ...DEFAULT_CUSTOM, rounds: 8 } }) : null,
    );
    await openSheet();
    expect(await screen.findByLabelText('Long break after: 8 rounds')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'More long break after' })).toBeDisabled();
  });
});
