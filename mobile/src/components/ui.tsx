// Shared building blocks so every screen uses the same NoteMe look.
// Colour classes (bg-brand, text-ink, bg-cream…) are defined in src/global.css.
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export type IconName = ComponentProps<typeof Ionicons>['name'];
type SubjectIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Icon and badge size multiplier. Keep in step with --spacing in src/global.css
 * (0.15rem there = 0.6 here) so icons match the rest of the layout.
 */
export const SCALE = 0.6;

/** Scales a design size (in the original, full-size layout) to the app's size. */
export function scaled(size: number) {
  return Math.round(size * SCALE);
}

// Same values as global.css, for places that need a colour value (icons, headers).
export const colors = {
  brand: '#5b2410',
  page: '#fffdfb',
  cream: '#f8f1ec',
  peach: '#fde8d8',
  line: '#efe3da',
  ink: '#2a1810',
  muted: '#7a685f',
  faint: '#b8a89f',
  accent: '#f28c28',
  danger: '#c62828',
  white: '#ffffff',
};

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={scaled(size)} color={color} />;
}

// --- Buttons ---------------------------------------------------------------

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
};

export function Button({ label, onPress, icon, variant = 'primary', disabled, className = '' }: ButtonProps) {
  const primary = variant === 'primary';
  const color = disabled ? colors.faint : primary ? colors.white : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center justify-center gap-2 rounded-2xl px-5 py-4 ${
        disabled
          ? 'bg-line'
          : primary
            ? 'bg-brand active:bg-brand-dark'
            : 'border border-line bg-white active:bg-cream'
      } ${className}`}
    >
      {icon ? <Icon name={icon} size={20} color={color} /> : null}
      <Text
        className={`text-base font-semibold ${
          disabled ? 'text-muted' : primary ? 'text-white' : 'text-ink'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A small round icon-only button, e.g. edit or delete on a list item. */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'default',
}: {
  icon: IconName;
  onPress: () => void;
  label: string; // for screen readers
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10} // keeps small buttons easy to tap
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-12 w-12 items-center justify-center rounded-full active:bg-cream"
    >
      <Icon name={icon} size={26} color={tone === 'danger' ? colors.danger : colors.muted} />
    </Pressable>
  );
}

/** The floating "+" button in the bottom-right corner. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="absolute bottom-6 right-5 flex-row items-center gap-2 rounded-2xl bg-brand py-4 pl-5 pr-6 shadow-lg active:bg-brand-dark"
    >
      <Icon name="add" size={22} color={colors.white} />
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

// --- Layout pieces -----------------------------------------------------------

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center px-8 py-16">
      <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl bg-peach">
        <Icon name={icon} size={36} color={colors.brand} />
      </View>
      <Text className="mb-2 text-center text-xl font-bold text-ink">{title}</Text>
      <Text className="mb-6 max-w-xs text-center text-base leading-6 text-muted">{text}</Text>
      {action}
    </View>
  );
}

/** A rounded tag, e.g. "12 cards". */
export function Pill({ icon, label }: { icon?: IconName; label: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-cream px-2.5 py-1">
      {icon ? <Icon name={icon} size={13} color={colors.muted} /> : null}
      <Text className="text-xs font-semibold text-muted">{label}</Text>
    </View>
  );
}

/** A bold section title with an optional ">" link on the right, like "Continue Studying". */
export function SectionHeader({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-xl font-bold text-ink">{title}</Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={10} accessibilityRole="button" accessibilityLabel={`See all ${title}`}>
          <Icon name="chevron-forward" size={22} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

// --- Subject icons -------------------------------------------------------------

// Pick an icon from the deck's name, so "Chemistry" gets a flask, "Maths" a sigma, etc.
const SUBJECT_ICONS: [RegExp, SubjectIconName][] = [
  [/chem/i, 'flask-outline'],
  [/math|algebra|calcul|geometr|statist/i, 'sigma'],
  [/physic/i, 'atom'],
  [/\bcs\b|comput|program|coding|software|it\b/i, 'laptop'],
  [/bio|cell|anatom/i, 'dna'],
  [/hist/i, 'bank-outline'],
  [/geo/i, 'earth'],
  [/english|literat|grammar|writing/i, 'book-open-page-variant-outline'],
  [/french|spanish|german|language|vocab|hindi|japan|chinese/i, 'translate'],
  [/econ|business|account|financ/i, 'chart-line'],
  [/music/i, 'music-note-outline'],
  [/art|design|draw/i, 'palette-outline'],
];

export function subjectIcon(name: string): SubjectIconName {
  return SUBJECT_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? 'book-outline';
}

export function SubjectIcon({ name, size = 26, color = colors.brand }: { name: string; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={subjectIcon(name)} size={scaled(size)} color={color} />;
}

/** A peach square with the subject's icon, used for decks everywhere. */
export function DeckBadge({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <View
      className="items-center justify-center rounded-2xl bg-peach"
      style={{ width: scaled(size), height: scaled(size) }}
    >
      <SubjectIcon name={name} size={size * 0.52} />
    </View>
  );
}
