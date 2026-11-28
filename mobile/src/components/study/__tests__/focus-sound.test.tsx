import { fireEvent, render, screen } from '@testing-library/react-native';
import { createAudioPlayer } from 'expo-audio';

import { FocusSoundButton } from '@/components/study/focus-sound';
import { getSetting, setSetting } from '@/data/settings';
import { parseFocusPrefs } from '@/lib/focus-sounds';
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

const mockedCreate = jest.mocked(createAudioPlayer);

function lastPlayer() {
  return mockedCreate.mock.results.at(-1)!.value as {
    play: jest.Mock;
    pause: jest.Mock;
    replace: jest.Mock;
    loop: boolean;
    volume: number;
  };
}

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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getSetting).mockImplementation(async () => null);
});

describe('parseFocusPrefs', () => {
  it('reads the saved sound and volume', () => {
    expect(parseFocusPrefs('{"soundId":"rain","volume":0.5}')).toEqual({ soundId: 'rain', volume: 0.5 });
  });

  it('falls back to the defaults for missing or bad values', () => {
    const defaults = { soundId: 'calm-pads', volume: 0.3 };
    expect(parseFocusPrefs(null)).toEqual(defaults);
    expect(parseFocusPrefs('not json')).toEqual(defaults);
    expect(parseFocusPrefs('{"soundId":"gone","volume":7}')).toEqual(defaults);
  });
});

describe('Study sounds', () => {
  it('does not play until a sound is picked', async () => {
    await openSheet();
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Calm pads')).toBeOnTheScreen();
    expect(screen.getByText('Rain')).toBeOnTheScreen();
  });

  it('plays a sound on a loop, switches sound, and stops', async () => {
    await openSheet();

    await fireEvent.press(screen.getByRole('button', { name: /^Rain/ }));
    const player = lastPlayer();
    expect(player.play).toHaveBeenCalled();
    expect(player.loop).toBe(true);
    expect(player.volume).toBe(0.3);
    expect(screen.getByRole('button', { name: 'Rain, Steady rainfall, playing' })).toBeOnTheScreen();
    expect(setSetting).toHaveBeenLastCalledWith({}, 'focus_sound', '{"soundId":"rain","volume":0.3}');

    // One player for the app: another sound replaces what it plays.
    await fireEvent.press(screen.getByRole('button', { name: /^Brown noise/ }));
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(player.replace).toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Stop'));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByText('Play Brown noise')).toBeOnTheScreen();
  });

  it('changes the volume of the sound playing and remembers it', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Play Calm pads'));
    await fireEvent.press(screen.getByRole('button', { name: 'Volume 75%' }));
    expect(lastPlayer().volume).toBe(0.75);
    expect(setSetting).toHaveBeenLastCalledWith({}, 'focus_sound', '{"soundId":"calm-pads","volume":0.75}');
  });

  it('starts with the sound and volume used last time', async () => {
    jest.mocked(getSetting).mockImplementation(async (_db, key) =>
      key === 'focus_sound' ? '{"soundId":"soft-keys","volume":0.5}' : null,
    );
    await openSheet();
    await fireEvent.press(await screen.findByText('Play Soft keys'));
    expect(lastPlayer().volume).toBe(0.5);
  });
});
