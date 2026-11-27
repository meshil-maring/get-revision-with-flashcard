import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextStyle } from 'react-native';

import { TagChip } from '@/components/tags/tag-chip';
import { Icon, useColors } from '@/components/ui';
import type { Tag, TagColor } from '@/data/types';
import { nextTagColor } from '@/lib/tags';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** A tag that may not be saved yet: new ones have no id until the note is saved. */
export type TagChoice = { id?: string; name: string; color: TagColor };

/**
 * Pick a note's tags: tap existing tags to add or remove them, or type a new one.
 * New tags are only made when the note is saved.
 */
export function TagPicker({
  allTags,
  selected,
  onChange,
}: {
  allTags: Tag[];
  selected: TagChoice[];
  onChange: (tags: TagChoice[]) => void;
}) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const isSelected = (name: string) => selected.some((t) => same(t.name, name));
  // New tags not saved yet, shown with the existing ones.
  const unsaved = selected.filter((t) => !t.id && !allTags.some((tag) => same(tag.name, t.name)));

  function toggle(tag: TagChoice) {
    onChange(isSelected(tag.name) ? selected.filter((t) => !same(t.name, tag.name)) : [...selected, tag]);
  }

  function addTyped() {
    const name = text.trim();
    if (!name) return;
    setText('');
    if (isSelected(name)) return;
    const existing = allTags.find((t) => same(t.name, name));
    onChange([
      ...selected,
      existing
        ? { id: existing.id, name: existing.name, color: existing.color }
        : { name, color: nextTagColor(allTags.length + unsaved.length) },
    ]);
  }

  return (
    <View className="gap-3 rounded-3xl border border-line bg-card p-4">
      <View className="flex-row items-center gap-1.5">
        <Icon name="pricetags-outline" size={20} color={colors.ink} />
        <Text className="text-base font-bold text-ink">Tags</Text>
        <Text className="text-xs text-muted">· group notes from any folder</Text>
      </View>

      {allTags.length + unsaved.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {[...allTags.map((t) => ({ id: t.id, name: t.name, color: t.color })), ...unsaved].map((tag) => (
            <TagChip key={tag.id ?? `new-${tag.name}`} tag={tag} size="md" selected={isSelected(tag.name)} onPress={() => toggle(tag)} />
          ))}
        </View>
      ) : null}

      <View
        className="flex-row items-center gap-2 rounded-xl bg-surface pl-3"
        style={{ borderWidth: 1.5, borderColor: focused ? colors.primary : 'transparent' }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={addTyped}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={allTags.length > 0 ? 'New tag' : 'Add a tag, e.g. Exam 1 or Important'}
          placeholderTextColor={colors.faint}
          accessibilityLabel="New tag"
          returnKeyType="done"
          submitBehavior="submit"
          style={NO_WEB_FOCUS_RING}
          className="flex-1 py-2.5 text-base text-ink"
        />
        <Pressable
          onPress={addTyped}
          disabled={!text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add tag"
          className={`m-1 h-10 flex-row items-center gap-1 rounded-lg px-3 ${text.trim() ? 'bg-primary active:bg-primary-dark' : 'bg-line'}`}
        >
          <Icon name="add" size={20} color={text.trim() ? colors.white : colors.faint} />
          <Text className={`text-sm font-bold ${text.trim() ? 'text-white' : 'text-muted'}`}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}
