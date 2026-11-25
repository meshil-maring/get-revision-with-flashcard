import { claimAudio, releaseAudio } from '@/lib/audio-focus';

const player = () => ({ pause: jest.fn() });

describe('audio focus', () => {
  it('pauses the clip already playing when another starts', () => {
    const a = player();
    const b = player();

    claimAudio(a);
    expect(a.pause).not.toHaveBeenCalled();

    claimAudio(b);
    expect(a.pause).toHaveBeenCalledTimes(1);
    expect(b.pause).not.toHaveBeenCalled();

    claimAudio(b); // playing the same clip again pauses nothing
    expect(b.pause).not.toHaveBeenCalled();
    releaseAudio(b);
  });

  it('forgets a released player, and copes with one that cannot pause', () => {
    const a = player();
    claimAudio(a);
    releaseAudio(a);
    claimAudio(player());
    expect(a.pause).not.toHaveBeenCalled();

    const broken = {
      pause: () => {
        throw new Error('released');
      },
    };
    claimAudio(broken);
    expect(() => claimAudio(player())).not.toThrow();
  });
});
