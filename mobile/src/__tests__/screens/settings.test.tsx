import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Uniwind } from 'uniwind';

import SettingsScreen from '@/app/settings';
import * as settings from '@/data/settings';
import { ReadingSizeProvider } from '@/providers/reading-size';
import { ThemeProvider } from '@/providers/theme';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/settings');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(settings.getThemePreference).mockResolvedValue('system');
  jest.mocked(settings.getReadingSize).mockResolvedValue('base');
  jest.mocked(settings.getNoteViewDefault).mockResolvedValue('auto');
});

async function renderSettings() {
  await render(
    <ThemeProvider>
      <ReadingSizeProvider>
        <SettingsScreen />
      </ReadingSizeProvider>
    </ThemeProvider>,
  );
}

describe('Settings', () => {
  it('applies the saved theme on start and shows it picked', async () => {
    jest.mocked(settings.getThemePreference).mockResolvedValue('dark');
    await renderSettings();

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked());
    expect(Uniwind.setTheme).toHaveBeenCalledWith('dark');
  });

  it('switches to light and saves the choice', async () => {
    await renderSettings();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Same as phone' })).toBeChecked());

    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));

    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(Uniwind.setTheme).toHaveBeenLastCalledWith('light');
    expect(settings.setThemePreference).toHaveBeenCalledWith(expect.anything(), 'light');
  });

  it('shows the saved text size and saves a new one, with a preview', async () => {
    jest.mocked(settings.getReadingSize).mockResolvedValue('lg');
    await renderSettings();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked());
    expect(screen.getByText('Photosynthesis')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Extra large' }));

    expect(screen.getByRole('radio', { name: 'Extra large' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Large' })).not.toBeChecked();
    expect(settings.setReadingSize).toHaveBeenCalledWith(expect.anything(), 'xl');
  });

  it('shows how notes open and saves a new choice', async () => {
    jest.mocked(settings.getNoteViewDefault).mockResolvedValue('standard');
    await renderSettings();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked());

    await fireEvent.press(screen.getByRole('radio', { name: 'Textbook' }));

    expect(screen.getByRole('radio', { name: 'Textbook' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Automatic' })).not.toBeChecked();
    expect(settings.setNoteViewDefault).toHaveBeenCalledWith(expect.anything(), 'textbook');
  });
});
