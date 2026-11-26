import { chooseApiUrl } from '@/services/api';

const TUNNEL = 'https://studyme-dev.ngrok-free.app';

describe('chooseApiUrl', () => {
  it('sends phones to the tunnel and keeps the web on localhost', () => {
    expect(chooseApiUrl('android', 'http://localhost:4000', TUNNEL)).toBe(TUNNEL);
    expect(chooseApiUrl('ios', 'http://localhost:4000', TUNNEL)).toBe(TUNNEL);
    expect(chooseApiUrl('web', 'http://localhost:4000', TUNNEL)).toBe('http://localhost:4000');
  });

  it('uses the one address everywhere when no phone address is set', () => {
    expect(chooseApiUrl('android', 'https://api.studyme.app')).toBe('https://api.studyme.app');
    expect(chooseApiUrl('web', 'https://api.studyme.app', '')).toBe('https://api.studyme.app');
  });

  it('falls back to this computer', () => {
    expect(chooseApiUrl('web')).toBe('http://localhost:4000');
    expect(chooseApiUrl('ios')).toBe('http://localhost:4000');
    expect(chooseApiUrl('android')).toBe('http://10.0.2.2:4000');
  });

  it('drops a trailing slash', () => {
    expect(chooseApiUrl('android', undefined, `${TUNNEL}/`)).toBe(TUNNEL);
  });
});
