import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import AccountScreen from '@/app/account';
import { createDeck, listDecks } from '@/data/decks';
import { countPendingChanges } from '@/data/sync';
import { AccountProvider } from '@/providers/account';
import { authClient } from '@/services/auth-client';
import { confirm } from '@/lib/confirm';
import { fetchServerConfig, postSync } from '@/services/sync-api';
import { mockRouter } from '@/test-utils/mock-router';
import { TestQueryProvider } from '@/test-utils/query';
import { createTestDb } from '@/test-utils/test-db';

let mockDb: SQLiteDatabase;
let mockSession: { user: { id: string; name: string; email: string } } | null = null;

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('@/services/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mockSession, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signUp: { email: jest.fn() },
    signOut: jest.fn(async () => ({})),
    requestPasswordReset: jest.fn(),
  },
}));
jest.mock('@/services/sync-api', () => ({
  postSync: jest.fn(async () => ({ cursor: 1, changes: [], more: false })),
  fetchServerConfig: jest.fn(async () => ({ providers: [] })),
}));
jest.mock('@/lib/confirm', () => ({ confirm: jest.fn(async () => true) }));

function renderAccount() {
  return render(
    <TestQueryProvider>
      <AccountProvider>
        <AccountScreen />
      </AccountProvider>
    </TestQueryProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockDb = await createTestDb();
  mockSession = null;
});

describe('Account screen, signed out', () => {
  it('signs in with email and password', async () => {
    jest.mocked(authClient.signIn.email).mockResolvedValue({ data: {}, error: null } as never);
    await renderAccount();

    await fireEvent.changeText(screen.getByLabelText('Email'), ' asha@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse');
    await fireEvent.press(screen.getAllByText('Sign in')[1]);

    expect(authClient.signIn.email).toHaveBeenCalledWith({ email: 'asha@example.com', password: 'correct-horse' });
  });

  it('shows and hides the password', async () => {
    await renderAccount();
    const password = screen.getByLabelText('Password');
    expect(password.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('sends a reset link for a forgotten password', async () => {
    jest.mocked(authClient.requestPasswordReset).mockResolvedValue({ data: { status: true }, error: null } as never);
    await renderAccount();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');

    await fireEvent.press(screen.getByText('Forgot password?'));
    expect(screen.getByText('Reset your password')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Password')).toBeNull();

    await fireEvent.press(screen.getByText('Send reset link'));
    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({ email: 'asha@example.com' });
    expect(await screen.findByText(/a link to choose a new password is on its way/)).toBeOnTheScreen();
    expect(screen.getByText('Send the link again')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Back to sign in'));
    expect(screen.getByText('Welcome back')).toBeOnTheScreen();
  });

  it('asks for an email before sending a reset link', async () => {
    await renderAccount();
    await fireEvent.press(screen.getByText('Forgot password?'));
    await fireEvent.press(screen.getByText('Send reset link'));
    expect(screen.getByText('Enter the email you signed up with.')).toBeOnTheScreen();
    expect(authClient.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("shows the server's error", async () => {
    jest.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { message: 'Invalid email or password' },
    } as never);
    await renderAccount();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password');
    await fireEvent.press(screen.getAllByText('Sign in')[1]);

    expect(await screen.findByText('Invalid email or password')).toBeOnTheScreen();
  });

  it('checks the form before creating an account', async () => {
    await renderAccount();
    await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Asha');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    await fireEvent.press(screen.getAllByText('Create account')[1]);

    expect(screen.getByText('Use at least 8 characters for your password.')).toBeOnTheScreen();
    expect(authClient.signUp.email).not.toHaveBeenCalled();
  });

  it('offers only the sign-in providers the server has', async () => {
    await renderAccount();
    expect(screen.queryByText('Continue with Google')).toBeNull();

    jest.mocked(fetchServerConfig).mockResolvedValueOnce({ providers: ['google', 'facebook'] });
    await screen.unmount();
    await renderAccount();
    expect(await screen.findByText('Continue with Google')).toBeOnTheScreen();
    expect(screen.getByText('Continue with Facebook')).toBeOnTheScreen();
    expect(screen.queryByText('Continue with Microsoft')).toBeNull();
  });

  it("says when the sign-in options couldn't be loaded, and retries", async () => {
    jest.mocked(fetchServerConfig).mockRejectedValueOnce(new Error('Network request failed'));
    await renderAccount();
    expect(await screen.findByText(/Couldn't reach the server for Google/)).toBeOnTheScreen();

    jest.mocked(fetchServerConfig).mockResolvedValueOnce({ providers: ['google'] });
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Continue with Google')).toBeOnTheScreen();
    expect(screen.queryByText(/Couldn't reach the server/)).toBeNull();
  });

  it('starts sign-in with the provider you tap', async () => {
    jest.mocked(fetchServerConfig).mockResolvedValueOnce({ providers: ['microsoft'] });
    jest.mocked(authClient.signIn.social).mockResolvedValueOnce({ error: { message: 'Cancelled.' } } as never);
    await renderAccount();

    await fireEvent.press(await screen.findByText('Continue with Microsoft'));

    expect(authClient.signIn.social).toHaveBeenCalledWith({ provider: 'microsoft', callbackURL: '/account' });
    expect(await screen.findByText('Cancelled.')).toBeOnTheScreen();
  });
});

describe('Account screen, signed in', () => {
  beforeEach(() => {
    mockSession = { user: { id: 'user-1', name: 'Asha', email: 'asha@example.com' } };
  });

  it('uploads guest data on sign-in and shows the sync time', async () => {
    await createDeck(mockDb, { name: 'Physics' });
    await renderAccount();

    expect(screen.getByText('asha@example.com')).toBeOnTheScreen();
    expect(await screen.findByText('Synced just now')).toBeOnTheScreen();
    const request = jest.mocked(postSync).mock.calls[0][0];
    expect(request.changes.map((c) => c.data.name)).toEqual(['Physics']);
    expect(await countPendingChanges(mockDb)).toBe(0);
  });

  it('shows a sync error', async () => {
    jest.mocked(postSync).mockRejectedValueOnce(new Error('Network request failed'));
    await renderAccount();
    expect(await screen.findByText('Network request failed')).toBeOnTheScreen();
  });

  it('signs out and removes the data from this device', async () => {
    await createDeck(mockDb, { name: 'Physics' });
    await renderAccount();
    await screen.findByText('Synced just now');

    await fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
    expect(await listDecks(mockDb)).toEqual([]);
    expect(mockRouter.router.back).toHaveBeenCalled();
  });

  it('warns before losing changes that could not be sent', async () => {
    await renderAccount();
    await screen.findByText('Synced just now');
    await createDeck(mockDb, { name: 'Made offline' });
    jest.mocked(postSync).mockRejectedValue(new Error('offline'));
    jest.mocked(confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(jest.mocked(confirm).mock.calls[1][0]).toBe('Some changes are not saved');
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect((await listDecks(mockDb)).map((d) => d.name)).toEqual(['Made offline']);
  });
});
