// Picking, keeping and opening files attached to cards.
// On a phone, files are copied into the app's own storage (so they stay even if the
// original is deleted). On web there is no file storage, so files are kept as data: URLs.
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { AttachmentKind } from '@/data/types';

/** A file chosen by the user, not saved yet. */
export type PickedFile = { kind: AttachmentKind; uri: string; name: string; mimeType: string | null };

export async function pickImage(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    kind: 'image',
    uri: asset.uri,
    name: asset.fileName ?? 'Image',
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

export async function pickPdf(): Promise<PickedFile | null> {
  return pickDocument('pdf', 'application/pdf');
}

export async function pickAudioFile(): Promise<PickedFile | null> {
  return pickDocument('audio', 'audio/*');
}

async function pickDocument(kind: AttachmentKind, type: string): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { kind, uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null };
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

function extensionFor(file: Pick<PickedFile, 'name' | 'uri' | 'mimeType'>): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1] ?? /\.([a-z0-9]{1,5})$/i.exec(file.uri)?.[1];
  return (fromName ?? EXTENSIONS[file.mimeType ?? ''] ?? 'bin').toLowerCase();
}

/** Copies a picked or recorded file somewhere permanent and returns its new URI. */
export async function keepFile(file: Pick<PickedFile, 'name' | 'uri' | 'mimeType'>): Promise<string> {
  if (Platform.OS === 'web') return toDataUrl(file.uri);

  const folder = new Directory(Paths.document, 'attachments');
  folder.create({ idempotent: true, intermediates: true });
  const target = new File(folder, `${randomUUID()}.${extensionFor(file)}`);
  await new File(file.uri).copy(target);
  return target.uri;
}

/** Deletes a kept file. Missing files are ignored. */
export function removeFile(uri: string): void {
  if (Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone: nothing to do.
  }
}

/** Opens a file (e.g. a PDF) in the phone's viewer, or a new browser tab on web. */
export async function openFile(uri: string, mimeType: string | null, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Browsers block opening data: URLs directly, so open a blob: URL made from it.
    const blob = await (await fetch(uri)).blob();
    window.open(URL.createObjectURL(blob), '_blank');
    return;
  }
  await new File(uri).preview({ title, mimeType: mimeType ?? undefined });
}

async function toDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
