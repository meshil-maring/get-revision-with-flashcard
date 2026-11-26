import { localhostAddress } from '@/lib/dev-host';

describe('localhostAddress', () => {
  it('moves a page opened at 127.0.0.1 to localhost, keeping the rest of the address', () => {
    expect(localhostAddress('http://127.0.0.1:8081/account?x=1#top', 'http://localhost:4000')).toBe(
      'http://localhost:8081/account?x=1#top',
    );
  });

  it('stays put at localhost', () => {
    expect(localhostAddress('http://localhost:8081/account', 'http://localhost:4000')).toBeNull();
  });

  it('stays put when the server is somewhere else (a tunnel or a deployed server)', () => {
    expect(localhostAddress('http://127.0.0.1:8081/', 'https://api.studyme.app')).toBeNull();
  });

  it('leaves other addresses alone', () => {
    expect(localhostAddress('http://10.108.198.233:8081/', 'http://localhost:4000')).toBeNull();
    expect(localhostAddress('https://studyme.app/', 'http://localhost:4000')).toBeNull();
  });
});
