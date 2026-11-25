// Only one audio clip plays at a time: starting a clip pauses the one already playing
// (on either side of a card, in the editor, anywhere in the app).

type Pausable = { pause: () => void };

let active: Pausable | null = null;

/** Call right before playing: pauses whichever other clip is playing. */
export function claimAudio(player: Pausable): void {
  if (active && active !== player) {
    try {
      active.pause();
    } catch {
      // That player was already released; nothing to pause.
    }
  }
  active = player;
}

/** Call when a player goes away, so it isn't paused later by mistake. */
export function releaseAudio(player: Pausable): void {
  if (active === player) active = null;
}
