import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { Tag } from '@/data/types';
import { tagColor } from '@/lib/tags';

/**
 * A tag's coloured label. Small ones sit under a note's title; larger ones can be
 * tapped (to open the tag, or to pick it for a note when `selected` is given).
 */
export function TagChip({
  tag,
  size = 'sm',
  count,
  selected,
  onPress,
}: {
  tag: Pick<Tag, 'name' | 'color'>;
  size?: 'sm' | 'md';
  count?: number;
  /** When given, the chip is a toggle: filled when selected. */
  selected?: boolean;
  onPress?: () => void;
}) {
  const color = tagColor(tag.color);
  const toggle = selected !== undefined;
  const filled = toggle && selected;
  const small = size === 'sm';

  const body = (
    <View
      className={`flex-row items-center gap-1 rounded-full ${small ? 'px-2 py-0.5' : 'px-3 py-1.5'}`}
      style={{
        backgroundColor: filled ? color : `${color}1f`,
        borderWidth: toggle ? 1.5 : 0,
        borderColor: color,
      }}
    >
      {toggle ? <Icon name={selected ? 'checkmark' : 'add'} size={small ? 12 : 16} color={filled ? '#fff' : color} /> : null}
      {!toggle ? <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
      <Text
        className={`${small ? 'text-xs' : 'text-sm'} font-bold`}
        style={{ color: filled ? '#fff' : color }}
        numberOfLines={1}
      >
        {tag.name}
        {count !== undefined ? <Text className="font-semibold opacity-70"> {count}</Text> : null}
      </Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={small ? 6 : 2}
      accessibilityRole={toggle ? 'checkbox' : 'button'}
      accessibilityState={toggle ? { checked: selected } : undefined}
      accessibilityLabel={toggle ? `Tag ${tag.name}` : `Open tag ${tag.name}`}
      className="active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

/** A row of small tag chips, e.g. under a note's title. */
export function TagRow({ tags }: { tags: Pick<Tag, 'id' | 'name' | 'color'>[] }) {
  if (tags.length === 0) return null;
  return (
    <View className="mt-1 flex-row flex-wrap gap-1">
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
    </View>
  );
}
