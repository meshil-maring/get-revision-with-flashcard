import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import ConnectAiScreen from '@/app/connect-ai';
import { useAccount } from '@/providers/account';
import { isReachableFromInternet, MCP_URL } from '@/services/api';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/providers/account', () => ({ useAccount: jest.fn() }));

const signedIn = { user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAccount).mockReturnValue(signedIn as never);
});

describe('Connect AI screen', () => {
  it('shows the connector link and copies it', async () => {
    await render(<ConnectAiScreen />);
    expect(screen.getByLabelText('Connector link')).toHaveTextContent(MCP_URL);
    expect(MCP_URL).toMatch(/\/mcp$/);

    await fireEvent.press(screen.getByText('Copy link'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(MCP_URL);
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('shows the steps for ChatGPT and Claude', async () => {
    await render(<ConnectAiScreen />);
    expect(screen.getByText('ChatGPT')).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.queryByText('Sign in first')).toBeNull();
  });

  it('asks a guest to sign in first', async () => {
    jest.mocked(useAccount).mockReturnValue({ user: null } as never);
    await render(<ConnectAiScreen />);
    await fireEvent.press(screen.getByText('Sign in or create account'));
    expect(mockRouter.router.push).toHaveBeenCalledWith('/account');
  });

  it('warns when the server is only on this network', async () => {
    await render(<ConnectAiScreen />);
    // Tests use the default local server address.
    expect(screen.getByText(/This is a local address/)).toBeTruthy();
  });
});

describe('isReachableFromInternet', () => {
  it.each([
    ['https://noteme.example.com/mcp', true],
    ['https://abc.trycloudflare.com/mcp', true],
    ['http://noteme.example.com/mcp', false],
    ['https://localhost:4000/mcp', false],
    ['http://10.0.2.2:4000/mcp', false],
    ['https://192.168.1.5/mcp', false],
    ['https://172.20.0.1/mcp', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isReachableFromInternet(url)).toBe(expected);
  });
});
