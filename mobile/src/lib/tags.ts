import type { TagColor } from '@/data/types';

/** The colours a tag can have, in the order they're offered. */
export const TAG_COLORS: { key: TagColor; label: string; value: string }[] = [
  { key: 'blue', label: 'Blue', value: '#2f6bd8' },
  { key: 'teal', label: 'Teal', value: '#23988a' },
  { key: 'orange', label: 'Orange', value: '#e07a12' },
  { key: 'red', label: 'Red', value: '#dc3b3b' },
  { key: 'amber', label: 'Amber', value: '#b7800a' },
  { key: 'purple', label: 'Purple', value: '#7a4fd0' },
  { key: 'pink', label: 'Pink', value: '#cc3f86' },
  { key: 'gray', label: 'Gray', value: '#5c6773' },
];

/** The most tags a note can have. */
export const MAX_TAGS_PER_NOTE = 3;

const BY_KEY = new Map(TAG_COLORS.map((c) => [c.key, c.value]));

export function isTagColor(value: string): value is TagColor {
  return BY_KEY.has(value as TagColor);
}

/** The colour value for a tag colour (blue if unknown). */
export function tagColor(color: string): string {
  return BY_KEY.get(color as TagColor) ?? TAG_COLORS[0].value;
}

/** A colour for the next new tag, so tags made one after another look different. */
export function nextTagColor(existingCount: number): TagColor {
  return TAG_COLORS[existingCount % TAG_COLORS.length].key;
}
