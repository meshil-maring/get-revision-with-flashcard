import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';

import { RichText } from '@/components/rich-text';
import { colors, scaled } from '@/components/ui';
import { toggleLinePrefix, wrapSelection, type Edit, type Selection } from '@/lib/rich-text';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

type ToolIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Tool = { icon: ToolIcon; label: string; apply: (text: string, sel: Selection) => Edit };

const TOOLS: Tool[] = [
  { icon: 'format-header-1', label: 'Heading', apply: (t, s) => toggleLinePrefix(t, s, '# ') },
  { icon: 'format-header-2', label: 'Subheading', apply: (t, s) => toggleLinePrefix(t, s, '## ') },
  { icon: 'format-bold', label: 'Bold', apply: (t, s) => wrapSelection(t, s, '**') },
  { icon: 'format-italic', label: 'Italic', apply: (t, s) => wrapSelection(t, s, '*') },
  { icon: 'format-underline', label: 'Underline', apply: (t, s) => wrapSelection(t, s, '__') },
  { icon: 'marker', label: 'Highlight', apply: (t, s) => wrapSelection(t, s, '==') },
  { icon: 'format-list-bulleted', label: 'Bullet list', apply: (t, s) => toggleLinePrefix(t, s, '- ') },
  { icon: 'format-list-numbered', label: 'Numbered list', apply: (t, s) => toggleLinePrefix(t, s, '1. ') },
];

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

/** A text box with a formatting toolbar (headings, bold, underline, highlight, lists) and a preview. */
export function RichTextInput({ value, onChangeText, placeholder }: Props) {
  const selection = useRef<Selection>({ start: value.length, end: value.length });
  // Set only right after a toolbar edit, to put the cursor in the right place; then let the user move it.
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState(false);

  function applyTool(tool: Tool) {
    const edit = tool.apply(value, selection.current);
    selection.current = edit.selection;
    onChangeText(edit.text);
    setForcedSelection(edit.selection);
  }

  return (
    <View
      className="overflow-hidden rounded-xl"
      style={{ borderWidth: 1.5, borderColor: focused ? colors.primary : colors.line }}
    >
      <View className="flex-row items-center border-b border-line bg-surface">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-1" keyboardShouldPersistTaps="always">
          {TOOLS.map((tool) => (
            <Pressable
              key={tool.label}
              onPress={() => applyTool(tool)}
              disabled={preview}
              accessibilityRole="button"
              accessibilityLabel={tool.label}
              className={`h-11 w-10 items-center justify-center rounded-lg active:bg-line ${preview ? 'opacity-40' : ''}`}
            >
              <MaterialCommunityIcons name={tool.icon} size={scaled(30)} color={colors.ink} />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          onPress={() => setPreview((p) => !p)}
          accessibilityRole="switch"
          accessibilityLabel="Preview"
          accessibilityState={{ checked: preview }}
          className={`mx-1 rounded-lg px-2.5 py-1.5 ${preview ? 'bg-primary' : 'bg-white'}`}
        >
          <Text className={`text-xs font-bold ${preview ? 'text-white' : 'text-primary'}`}>Preview</Text>
        </Pressable>
      </View>

      {preview ? (
        <View className="min-h-32 bg-white px-4 py-3">
          {value.trim() ? <RichText text={value} /> : <Text className="text-base text-muted">Nothing to preview yet</Text>}
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          multiline
          textAlignVertical="top"
          selection={forcedSelection}
          onSelectionChange={(e) => {
            selection.current = e.nativeEvent.selection;
            if (forcedSelection) setForcedSelection(undefined);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel="Answer"
          style={NO_WEB_FOCUS_RING}
          className="min-h-32 bg-white px-4 py-3 text-base text-ink"
        />
      )}
    </View>
  );
}
