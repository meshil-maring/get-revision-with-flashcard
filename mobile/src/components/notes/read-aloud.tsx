import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { IconButton } from '@/components/ui';
import type { Note } from '@/data/types';
import { noteSpeechText, splitForSpeech } from '@/lib/read-aloud';

/**
 * Reads a note out loud with the phone's own voice. Stops when the note changes
 * (Previous / Next) or the screen closes, so it never keeps talking in the background.
 */
export function useReadAloud(note: Note | null) {
  const [speaking, setSpeaking] = useState(false);
  // Each read gets a number, so callbacks from a read that was stopped are ignored.
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current += 1;
    setSpeaking(false);
    Speech.stop().catch(() => {});
  }, []);

  const start = useCallback(() => {
    if (!note) return;
    const pieces = splitForSpeech(noteSpeechText(note), Math.min(Speech.maxSpeechInputLength || Infinity, 3900));
    if (pieces.length === 0) return;
    Speech.stop().catch(() => {}); // drop anything still queued from elsewhere
    const mine = ++run.current;
    const finished = () => {
      if (run.current === mine) setSpeaking(false);
    };
    setSpeaking(true);
    pieces.forEach((piece, i) => {
      const last = i === pieces.length - 1;
      Speech.speak(piece, {
        onDone: last ? finished : undefined,
        onStopped: finished,
        onError: finished,
      });
    });
  }, [note]);

  // A different note, or leaving the screen: stop talking.
  const noteId = note?.id;
  useEffect(() => stop, [noteId, stop]);

  return { speaking, toggle: speaking ? stop : start, stop };
}

/** The speaker button in the note's header. */
export function ReadAloudButton({ speaking, onPress }: { speaking: boolean; onPress: () => void }) {
  return (
    <IconButton
      icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
      label={speaking ? 'Stop reading' : 'Read note aloud'}
      onPress={onPress}
    />
  );
}
