import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getSetting, setSetting, SETTINGS } from '@/data/settings';
import { DEFAULT_FOCUS_VOLUME, FOCUS_SOUNDS, findFocusSound, parseFocusPrefs, type FocusSound } from '@/lib/focus-sounds';

type FocusSoundState = {
  /** The sound picked (playing or not); the last one used is remembered. */
  sound: FocusSound;
  playing: boolean;
  volume: number;
  /** Plays a sound; picking the one already playing keeps it going. */
  play: (soundId: string) => void;
  stop: () => void;
  /** Play the picked sound, or stop it. */
  toggle: () => void;
  setVolume: (volume: number) => void;
};

const FocusSoundContext = createContext<FocusSoundState | null>(null);

/**
 * Background sound while studying (rain, noise or calm music), from the music button on the
 * study and note screens. One player for the whole app, so the sound carries on from one
 * screen to the next until you stop it. It never starts by itself when the app opens.
 */
export function FocusSoundProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [soundId, setSoundId] = useState(FOCUS_SOUNDS[0].id);
  const [volume, setVolumeState] = useState(DEFAULT_FOCUS_VOLUME);
  const [playing, setPlaying] = useState(false);
  const player = useRef<AudioPlayer | null>(null);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetting(db, SETTINGS.focusSound)
      .then((raw) => {
        // A sound picked before the saved choice was read wins.
        if (cancelled || player.current) return;
        const prefs = parseFocusPrefs(raw);
        setSoundId(prefs.soundId);
        setVolumeState(prefs.volume);
      })
      .catch(() => {}); // keep the defaults if settings can't be read
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Quiet while the app is in the background (the phone's other sounds come first), and back
  // where it was when you return.
  useEffect(() => {
    if (!playing) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') player.current?.play();
      else if (state === 'background') player.current?.pause();
    });
    return () => sub.remove();
  }, [playing]);

  // Let the player go when the app closes.
  useEffect(
    () => () => {
      player.current?.remove();
      player.current = null;
    },
    [],
  );

  const save = useCallback(
    (next: { soundId: string; volume: number }) => {
      setSetting(db, SETTINGS.focusSound, JSON.stringify(next)).catch(() => {});
    },
    [db],
  );

  const play = useCallback(
    (id: string) => {
      const sound = findFocusSound(id);
      if (!sound) return;
      if (!player.current) {
        player.current = createAudioPlayer(sound.source);
        loadedId.current = sound.id;
      } else if (loadedId.current !== sound.id) {
        player.current.replace(sound.source);
        loadedId.current = sound.id;
      }
      player.current.loop = true;
      player.current.volume = volume;
      player.current.play();
      setSoundId(sound.id);
      setPlaying(true);
      save({ soundId: sound.id, volume });
    },
    [volume, save],
  );

  const stop = useCallback(() => {
    player.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) stop();
    else play(soundId);
  }, [playing, play, stop, soundId]);

  const setVolume = useCallback(
    (next: number) => {
      setVolumeState(next);
      if (player.current) player.current.volume = next;
      save({ soundId, volume: next });
    },
    [soundId, save],
  );

  const sound = findFocusSound(soundId) ?? FOCUS_SOUNDS[0];
  return (
    <FocusSoundContext.Provider value={{ sound, playing, volume, play, stop, toggle, setVolume }}>
      {children}
    </FocusSoundContext.Provider>
  );
}

export function useFocusSound(): FocusSoundState {
  const value = useContext(FocusSoundContext);
  if (!value) throw new Error('useFocusSound must be used inside FocusSoundProvider');
  return value;
}
