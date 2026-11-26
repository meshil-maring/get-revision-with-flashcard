import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DatabaseGate, isDatabaseInUse } from '@/components/database-gate';

// A stand-in for expo-sqlite's provider: fails to open while `mockOpen.broken` is set.
const mockOpen = { broken: false, message: '', opens: 0 };
jest.mock('expo-sqlite', () => ({
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => {
    mockOpen.opens += 1;
    if (mockOpen.broken) throw new Error(mockOpen.message);
    return children;
  },
}));
jest.mock('@/data/db', () => ({ DATABASE_NAME: 'test.db', migrateDbIfNeeded: jest.fn() }));

const IN_USE =
  "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.";

let consoleError: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  Object.assign(mockOpen, { broken: false, message: IN_USE, opens: 0 });
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined); // React logs caught errors
});
afterEach(() => {
  jest.useRealTimers();
  consoleError.mockRestore();
});

const app = (
  <DatabaseGate>
    <Text>Home</Text>
  </DatabaseGate>
);

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('DatabaseGate', () => {
  it('recognises the "open in another tab" error', () => {
    expect(isDatabaseInUse(new Error(IN_USE))).toBe(true);
    expect(isDatabaseInUse(new Error('disk I/O error'))).toBe(false);
  });

  it('opens the app when the database opens', async () => {
    await render(app);
    expect(screen.getByText('Home')).toBeOnTheScreen();
  });

  it('tries again on its own when the last page has not let go yet', async () => {
    mockOpen.broken = true;
    await render(app);
    await wait(500);
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.queryByText('StudyMe is open in another tab')).toBeNull(); // still quietly retrying
    mockOpen.broken = false; // the old page let go
    await wait(500);
    expect(screen.getByText('Home')).toBeOnTheScreen();
  });

  it('asks to close the other tab when it stays in use, and opens once it is closed', async () => {
    mockOpen.broken = true;
    await render(app);
    for (let i = 0; i < 8; i++) await wait(500);
    expect(screen.getByText('StudyMe is open in another tab')).toBeOnTheScreen();

    const opensBefore = mockOpen.opens;
    await wait(5000);
    expect(mockOpen.opens).toBe(opensBefore); // no more retrying on its own

    mockOpen.broken = false; // the other tab was closed
    await fireEvent.press(screen.getByText('Try again'));
    expect(screen.getByText('Home')).toBeOnTheScreen();
  });

  it('explains other errors without retrying', async () => {
    mockOpen.broken = true;
    mockOpen.message = 'disk I/O error';
    await render(app);
    expect(screen.getByText("Your notes and cards couldn't be opened")).toBeOnTheScreen();
    const opensBefore = mockOpen.opens;
    await wait(5000);
    expect(mockOpen.opens).toBe(opensBefore);
    mockOpen.broken = false;
    await fireEvent.press(screen.getByText('Try again'));
    expect(screen.getByText('Home')).toBeOnTheScreen();
  });
});
