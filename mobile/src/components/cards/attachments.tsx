import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { Icon, scaled, useColors } from '@/components/ui';
import { ImageViewer } from '@/components/ui/image-viewer';
import type { AttachmentKind } from '@/data/types';
import { openFile } from '@/lib/attachment-files';
import { claimAudio, releaseAudio } from '@/lib/audio-focus';

/** What's needed to show an attachment, saved or not yet saved. */
export type AttachmentItem = {
  key: string;
  kind: AttachmentKind;
  /** '' while the file is still downloading from the account. */
  uri: string;
  name: string;
  mimeType: string | null;
  caption?: string | null;
  altText?: string | null;
};

type Tone = 'default' | 'onDark';

/** Images in a row of thumbnails, then PDFs and audio as chips. */
export function AttachmentList({
  items,
  tone = 'default',
  onRemove,
}: {
  items: AttachmentItem[];
  tone?: Tone;
  /** When given, each attachment gets a remove button (used in the card editor). */
  onRemove?: (item: AttachmentItem) => void;
}) {
  if (items.length === 0) return null;
  const images = items.filter((i) => i.kind === 'image');
  const others = items.filter((i) => i.kind !== 'image');

  return (
    <View className="w-full gap-2">
      {images.length > 0 ? (
        <View className="flex-row flex-wrap justify-center gap-2">
          {images.map((item) => (
            <Removable key={item.key} onRemove={onRemove && (() => onRemove(item))} name={item.name}>
              <ImageThumb item={item} large={images.length === 1 && !onRemove} />
            </Removable>
          ))}
        </View>
      ) : null}
      {others.map((item) => (
        <Removable key={item.key} onRemove={onRemove && (() => onRemove(item))} name={item.name}>
          {item.uri === '' ? (
            <DownloadingChip item={item} tone={tone} />
          ) : item.kind === 'audio' ? (
            <AudioChip item={item} tone={tone} />
          ) : (
            <FileChip item={item} tone={tone} />
          )}
        </Removable>
      ))}
    </View>
  );
}

function Removable({ children, onRemove, name }: { children: React.ReactNode; onRemove?: () => void; name: string }) {
  const colors = useColors();
  if (!onRemove) return <>{children}</>;
  return (
    <View className="flex-row items-center gap-1">
      <View className="flex-1">{children}</View>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${name}`}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
      >
        <Icon name="close-circle" size={26} color={colors.alert} />
      </Pressable>
    </View>
  );
}

function ImageThumb({ item, large }: { item: AttachmentItem; large: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const size = scaled(large ? 260 : 140);
  const width = large ? size * 1.4 : size;
  const box = { width, height: size, borderRadius: scaled(16), backgroundColor: colors.surface };
  return (
    <View style={{ width }} className="gap-1">
      {item.uri === '' ? (
        <View style={box} className="items-center justify-center gap-1 p-2" accessibilityLabel={`${item.name} is downloading`}>
          <Icon name="cloud-download-outline" size={24} color={colors.muted} />
          <Text className="text-center text-xs text-muted">Downloading…</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Open image ${item.altText || item.caption || item.name}`}
        >
          <Image source={{ uri: item.uri }} contentFit="cover" style={box} />
        </Pressable>
      )}
      {item.caption ? (
        <Text className="text-center text-xs italic text-muted" numberOfLines={2}>
          {item.caption}
        </Text>
      ) : null}
      <ImageViewer
        images={[{ key: item.key, uri: item.uri, name: item.name, caption: item.caption, altText: item.altText }]}
        index={open ? 0 : null}
        onIndexChange={() => undefined}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

function DownloadingChip({ item, tone }: { item: AttachmentItem; tone: Tone }) {
  const colors = useColors();
  return (
    <View className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${chipClasses(tone)}`}>
      <Icon name="cloud-download-outline" size={20} color={tone === 'onDark' ? colors.white : colors.muted} />
      <Text className={`flex-1 text-sm ${tone === 'onDark' ? 'text-white' : 'text-muted'}`} numberOfLines={1}>
        {item.name || 'File'}: downloading…
      </Text>
    </View>
  );
}

function chipClasses(tone: Tone) {
  return tone === 'onDark' ? 'bg-white/15 active:bg-white/25' : 'bg-surface active:bg-line';
}

function FileChip({ item, tone }: { item: AttachmentItem; tone: Tone }) {
  const colors = useColors();
  const text = tone === 'onDark' ? 'text-white' : 'text-ink';
  async function open() {
    try {
      await openFile(item.uri, item.mimeType, item.name);
    } catch {
      const message = 'There is no app on this device that can open this file.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Could not open file', message);
    }
  }
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
      className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${chipClasses(tone)}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-alert">
        <Icon name="document-text" size={20} color={colors.white} />
      </View>
      <Text className={`flex-1 text-sm font-semibold ${text}`} numberOfLines={1}>
        {item.name || 'PDF'}
      </Text>
      <Icon name="open-outline" size={20} color={tone === 'onDark' ? colors.white : colors.muted} />
    </Pressable>
  );
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function AudioChip({ item, tone }: { item: AttachmentItem; tone: Tone }) {
  const colors = useColors();
  const player = useAudioPlayer(item.uri);
  const status = useAudioPlayerStatus(player);
  const text = tone === 'onDark' ? 'text-white' : 'text-ink';
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  useEffect(() => () => releaseAudio(player), [player]);

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // Start again from the beginning once it has played to the end.
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) {
      await player.seekTo(0);
    }
    claimAudio(player); // pauses any other clip, so only one plays at a time
    player.play();
  }

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? `Pause ${item.name}` : `Play ${item.name}`}
      className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${chipClasses(tone)}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-cta">
        <Icon name={status.playing ? 'pause' : 'play'} size={18} color={colors.white} />
      </View>
      <View className="flex-1 gap-1.5">
        <Text className={`text-sm font-semibold ${text}`} numberOfLines={1}>
          {item.name || 'Audio'}
        </Text>
        <View className={`h-1.5 overflow-hidden rounded-full ${tone === 'onDark' ? 'bg-white/25' : 'bg-line'}`}>
          <View className="h-full rounded-full bg-cta" style={{ width: `${progress * 100}%` }} />
        </View>
      </View>
      <Text className={`text-xs ${tone === 'onDark' ? 'text-white/75' : 'text-muted'}`}>
        {formatTime(status.playing || status.currentTime > 0 ? status.currentTime : status.duration)}
      </Text>
    </Pressable>
  );
}
