import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { colors, Icon } from '@/components/ui';
import type { PickedFile } from '@/lib/attachment-files';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onDone: (file: PickedFile) => void;
};

/** A popup to record a voice note for a card. */
export function AudioRecorderModal({ visible, onCancel, onDone }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-5">
        {/* Mounted only while open, so the microphone is released when it closes. */}
        {visible ? <Recorder onCancel={onCancel} onDone={onDone} /> : null}
      </View>
    </Modal>
  );
}

function Recorder({ onCancel, onDone }: Omit<Props, 'visible'>) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [error, setError] = useState<string | null>(null);
  const seconds = Math.floor(state.durationMillis / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  async function start() {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is needed to record. You can allow it in your settings.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stop() {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (recorder.uri) {
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      onDone({ kind: 'audio', uri: recorder.uri, name: `Voice note ${stamp}`, mimeType: null });
    }
  }

  async function cancel() {
    if (state.isRecording) await recorder.stop();
    onCancel();
  }

  return (
    <View className="w-full max-w-sm items-center rounded-3xl bg-white p-6 shadow-xl">
      <Text className="mb-1 text-xl font-bold text-ink">Record audio</Text>
      <Text className="mb-6 text-center text-sm text-muted">
        {state.isRecording ? 'Recording… tap stop when you are done.' : 'Tap the microphone to start.'}
      </Text>

      <Text className="mb-6 text-4xl font-extrabold text-ink">{time}</Text>

      <Pressable
        onPress={state.isRecording ? stop : start}
        accessibilityRole="button"
        accessibilityLabel={state.isRecording ? 'Stop recording' : 'Start recording'}
        className={`mb-6 h-20 w-20 items-center justify-center rounded-full ${
          state.isRecording ? 'bg-alert' : 'bg-cta active:bg-cta-dark'
        }`}
      >
        <Icon name={state.isRecording ? 'stop' : 'mic'} size={40} color={colors.white} />
      </Pressable>

      {error ? <Text className="mb-4 text-center text-sm text-alert">{error}</Text> : null}

      <Pressable onPress={cancel} className="w-full items-center rounded-xl border border-line py-3 active:bg-surface">
        <Text className="text-base font-semibold text-ink">Cancel</Text>
      </Pressable>
    </View>
  );
}
