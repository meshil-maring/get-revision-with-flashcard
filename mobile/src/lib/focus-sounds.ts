// Background sounds to study to: made by scripts/generate-focus-sounds.mjs, so they are free to
// ship with no credits needed. Each file is a seamless loop, and the player repeats it.
//
// To add a track (your own, or one from a free library such as Pixabay Music or a CC0 track
// from the Free Music Archive — check its licence lets you put it in an app), drop the file in
// assets/sounds/ and add an entry here. Short loops keep the app small.

import type { IconName } from '@/components/ui';

export type FocusSound = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  kind: 'music' | 'noise';
  source: number; // require()d asset
};

export const FOCUS_SOUNDS: FocusSound[] = [
  {
    id: 'calm-pads',
    title: 'Calm pads',
    description: 'Slow, warm chords',
    icon: 'cloudy-night-outline',
    kind: 'music',
    source: require('../../assets/sounds/calm-pads.wav'),
  },
  {
    id: 'lofi-beat',
    title: 'Lo-fi beat',
    description: 'Soft drums and mellow chords',
    icon: 'headset-outline',
    kind: 'music',
    source: require('../../assets/sounds/lofi-beat.wav'),
  },
  {
    id: 'soft-keys',
    title: 'Soft keys',
    description: 'Gentle lo-fi piano',
    icon: 'musical-notes-outline',
    kind: 'music',
    source: require('../../assets/sounds/soft-keys.wav'),
  },
  {
    id: 'night-piano',
    title: 'Night piano',
    description: 'Slow, quiet piano',
    icon: 'moon-outline',
    kind: 'music',
    source: require('../../assets/sounds/night-piano.wav'),
  },
  {
    id: 'chimes',
    title: 'Dreamy chimes',
    description: 'Wind chimes over a hum',
    icon: 'sparkles-outline',
    kind: 'music',
    source: require('../../assets/sounds/chimes.wav'),
  },
  {
    id: 'deep-space',
    title: 'Deep space',
    description: 'A low, drifting drone',
    icon: 'planet-outline',
    kind: 'music',
    source: require('../../assets/sounds/deep-space.wav'),
  },
  {
    id: 'rain',
    title: 'Rain',
    description: 'Steady rainfall',
    icon: 'rainy-outline',
    kind: 'noise',
    source: require('../../assets/sounds/rain.wav'),
  },
  {
    id: 'ocean-waves',
    title: 'Ocean waves',
    description: 'Waves on a beach',
    icon: 'boat-outline',
    kind: 'noise',
    source: require('../../assets/sounds/ocean-waves.wav'),
  },
  {
    id: 'stream',
    title: 'Forest stream',
    description: 'Running, bubbling water',
    icon: 'leaf-outline',
    kind: 'noise',
    source: require('../../assets/sounds/stream.wav'),
  },
  {
    id: 'fire',
    title: 'Crackling fire',
    description: 'A cosy fireplace',
    icon: 'flame-outline',
    kind: 'noise',
    source: require('../../assets/sounds/fire.wav'),
  },
  {
    id: 'wind',
    title: 'Wind',
    description: 'Gusts rising and falling',
    icon: 'cloudy-outline',
    kind: 'noise',
    source: require('../../assets/sounds/wind.wav'),
  },
  {
    id: 'white-noise',
    title: 'White noise',
    description: 'Bright hiss, hides chatter',
    icon: 'radio-outline',
    kind: 'noise',
    source: require('../../assets/sounds/white-noise.wav'),
  },
  {
    id: 'pink-noise',
    title: 'Pink noise',
    description: 'Soft hiss, like a fan',
    icon: 'pulse-outline',
    kind: 'noise',
    source: require('../../assets/sounds/pink-noise.wav'),
  },
  {
    id: 'brown-noise',
    title: 'Brown noise',
    description: 'Deep, low rumble',
    icon: 'water-outline',
    kind: 'noise',
    source: require('../../assets/sounds/brown-noise.wav'),
  },
];

export function findFocusSound(id: string | null | undefined): FocusSound | undefined {
  return FOCUS_SOUNDS.find((s) => s.id === id);
}

/** Volume steps offered in the player (0–1). Background sound should sit under your thoughts. */
export const FOCUS_VOLUMES = [0.15, 0.3, 0.5, 0.75, 1];
export const DEFAULT_FOCUS_VOLUME = 0.3;

/** The saved choice: the last sound picked and its volume. Bad or missing values fall back to defaults. */
export function parseFocusPrefs(raw: string | null): { soundId: string; volume: number } {
  const fallback = { soundId: FOCUS_SOUNDS[0].id, volume: DEFAULT_FOCUS_VOLUME };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as { soundId?: unknown; volume?: unknown };
    const soundId = typeof value.soundId === 'string' && findFocusSound(value.soundId) ? value.soundId : fallback.soundId;
    const volume =
      typeof value.volume === 'number' && value.volume > 0 && value.volume <= 1 ? value.volume : fallback.volume;
    return { soundId, volume };
  } catch {
    return fallback;
  }
}
