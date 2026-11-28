// Handwritten notes: a paper page to write on with a finger or a digital pen, the tools for
// it (pen, highlighter, eraser, colours, undo), and the finished page shown in a note.
//
// The page is drawn as one SVG picture (see src/lib/ink.ts). The line being drawn right now is
// drawn with small rounded views on top, so writing feels instant; once the picture with
// the new line has loaded, those views go.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { useColors } from '@/components/ui';
import { ImageViewer } from '@/components/ui/image-viewer';
import { confirm } from '@/lib/confirm';
import {
  emptyInk,
  hasInk,
  inkDataUri,
  lowestPoint,
  MAX_INK_LENGTH,
  MAX_PAGE_HEIGHT,
  MAX_SHEETS,
  MORE_SPACE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  serializeInk,
  strokeHit,
  type Ink,
  type Paper,
  type Stroke,
} from '@/lib/ink';

type McIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type InkTool = 'pen' | 'highlighter' | 'eraser' | 'hand';

export const PEN_COLORS = [
  { color: '#1f2933', name: 'Black' },
  { color: '#1f3f8f', name: 'Blue' },
  { color: '#d64545', name: 'Red' },
  { color: '#2e9d4f', name: 'Green' },
  { color: '#7c5cd6', name: 'Purple' },
];
export const HIGHLIGHTER_COLORS = [
  { color: '#f5d90a', name: 'Yellow' },
  { color: '#5fd38a', name: 'Green' },
  { color: '#ff7eb6', name: 'Pink' },
  { color: '#6fb8ff', name: 'Blue' },
];
/** Thin, medium, thick — in page units (the page is 1000 wide). */
const SIZES: Record<Exclude<InkTool, 'hand'>, number[]> = {
  pen: [3, 5, 9],
  highlighter: [18, 28, 40],
  eraser: [10, 22, 40],
};
const SIZE_NAMES = ['Thin', 'Medium', 'Thick'];
/** Points closer together than this (page units) are skipped, which keeps notes small. */
const MIN_STEP = 1.5;
const HISTORY = 100;

/** Everything the handwriting editor keeps: the page, undo / redo and the chosen tool. */
export function useInkEditor() {
  const [ink, setInk] = useState<Ink>(() => emptyInk());
  const [past, setPast] = useState<Ink[]>([]);
  const [future, setFuture] = useState<Ink[]>([]);
  const [tool, setTool] = useState<InkTool>('pen');
  const [penColor, setPenColor] = useState(PEN_COLORS[0].color);
  const [highlighterColor, setHighlighterColor] = useState(HIGHLIGHTER_COLORS[0].color);
  const [sizeIndex, setSizeIndex] = useState<Record<Exclude<InkTool, 'hand'>, number>>({
    pen: 1,
    highlighter: 1,
    eraser: 1,
  });
  const [full, setFull] = useState(false);

  /** Starts with a saved page, with nothing to undo. */
  const load = useCallback((next: Ink) => {
    setInk(next);
    setPast([]);
    setFuture([]);
  }, []);

  /** A change that can be undone. `before` is the page as it was (default: as it is now). */
  function commit(next: Ink, before: Ink = ink) {
    setPast((p) => [...p.slice(-(HISTORY - 1)), before]);
    setFuture([]);
    setInk(next);
  }

  function addStroke(stroke: Stroke) {
    const next = { ...ink, strokes: [...ink.strokes, stroke] };
    if (serializeInk(next).length > MAX_INK_LENGTH) {
      setFull(true);
      return;
    }
    setFull(false);
    commit(next);
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture((f) => [ink, ...f]);
    setInk(previous);
    setFull(false);
  }

  function redo() {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast((p) => [...p, ink]);
    setInk(next);
  }

  const size = tool === 'hand' ? 0 : SIZES[tool][sizeIndex[tool]];

  return {
    ink,
    load,
    tool,
    setTool,
    penColor,
    setPenColor,
    highlighterColor,
    setHighlighterColor,
    sizeIndex: tool === 'hand' ? -1 : sizeIndex[tool],
    setSize: (index: number) => {
      if (tool !== 'hand') setSizeIndex((s) => ({ ...s, [tool]: index }));
    },
    /** Width of the pen or highlighter, or the eraser's radius, in page units. */
    size,
    full,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    addStroke,
    /** Shows a change straight away (while erasing); `remember` adds it to undo afterwards. */
    preview: setInk,
    remember: (before: Ink) => {
      setPast((p) => [...p.slice(-(HISTORY - 1)), before]);
      setFuture([]);
      setFull(false);
    },
    setPaper: (paper: Paper) => {
      if (paper !== ink.paper) commit({ ...ink, paper });
    },
    canAddSpace: ink.height + MORE_SPACE <= MAX_PAGE_HEIGHT,
    addSpace: () => commit({ ...ink, height: Math.min(MAX_PAGE_HEIGHT, ink.height + MORE_SPACE) }),
    /** Takes off empty space at the bottom (never below the writing or a page's normal size). */
    canTrim: ink.height > Math.max(PAGE_HEIGHT, lowestPoint(ink) + 40),
    trim: () => {
      const height = Math.max(PAGE_HEIGHT, Math.ceil((lowestPoint(ink) + 40) / 100) * 100);
      if (height < ink.height) commit({ ...ink, height });
    },
    clear: async () => {
      if (!hasInk(ink)) return;
      if (await confirm('Clear the page?', 'Everything written on this page will be removed. You can undo this.', 'Clear')) {
        commit({ ...ink, strokes: [] });
      }
    },
  };
}

export type InkEditor = ReturnType<typeof useInkEditor>;

// --- More than one page ----------------------------------------------------------------

/**
 * The pages of a handwritten note (or of one heading's notes). The page being written on lives
 * in the editor; the others wait here. Going to another page starts its own undo history.
 */
export function useInkSheets(editor: InkEditor) {
  const [sheets, setSheets] = useState<Ink[]>(() => [emptyInk()]);
  const [index, setIndex] = useState(0);
  const loadEditor = editor.load;
  /** Every page, with the one being written on as it is now. */
  const all = sheets.map((s, i) => (i === index ? editor.ink : s));

  function show(list: Ink[], at: number) {
    setSheets(list);
    setIndex(at);
    loadEditor(list[at]);
  }

  return {
    all,
    index,
    count: all.length,
    /** Starts with saved pages, on the first one. */
    load: useCallback(
      (list: Ink[]) => {
        const pages = list.length > 0 ? list : [emptyInk()];
        setSheets(pages);
        setIndex(0);
        loadEditor(pages[0]);
      },
      [loadEditor],
    ),
    go: (at: number) => {
      if (at !== index && at >= 0 && at < all.length) show(all, at);
    },
    canAdd: all.length < MAX_SHEETS,
    /** A new blank page (same paper) straight after this one. */
    add: () => {
      if (all.length >= MAX_SHEETS) return;
      const next = [...all.slice(0, index + 1), emptyInk(editor.ink.paper), ...all.slice(index + 1)];
      show(next, index + 1);
    },
    /** Removes this page (after asking, if something is written on it). The last page is only cleared. */
    remove: async () => {
      const page = all[index];
      if (
        hasInk(page) &&
        !(await confirm(`Delete page ${index + 1}?`, 'Everything written on this page will be removed.', 'Delete'))
      ) {
        return;
      }
      if (all.length === 1) return show([emptyInk(page.paper)], 0);
      const next = all.filter((_, i) => i !== index);
      show(next, Math.min(index, next.length - 1));
    },
  };
}

export type InkSheets = ReturnType<typeof useInkSheets>;

/**
 * "Page 2 of 3" with ‹ › to turn pages, Delete page and Add page. It is the toolbar's bottom
 * row, so it stays in sight however long the page is.
 */
function SheetBar({ sheets }: { sheets: InkSheets }) {
  const colors = useColors();
  const { index, count } = sheets;
  return (
    <View className="flex-row items-center gap-2 border-t border-line pt-1">
      <View className="flex-row items-center">
        <Pressable
          onPress={() => sheets.go(index - 1)}
          disabled={index === 0}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          accessibilityState={{ disabled: index === 0 }}
          className={`h-10 w-10 items-center justify-center rounded-full active:bg-surface ${index === 0 ? 'opacity-30' : ''}`}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <Text className="min-w-20 text-center text-sm font-semibold text-ink" accessibilityLiveRegion="polite">
          Page {index + 1} of {count}
        </Text>
        <Pressable
          onPress={() => sheets.go(index + 1)}
          disabled={index >= count - 1}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          accessibilityState={{ disabled: index >= count - 1 }}
          className={`h-10 w-10 items-center justify-center rounded-full active:bg-surface ${index >= count - 1 ? 'opacity-30' : ''}`}
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.ink} />
        </Pressable>
      </View>
      <View className="flex-1" />
      {count > 1 ? (
        <ToolButton icon="file-remove-outline" label="Delete page" onPress={() => void sheets.remove()} />
      ) : null}
      {sheets.canAdd ? (
        <Pressable
          onPress={sheets.add}
          accessibilityRole="button"
          accessibilityLabel="Add page"
          className="h-10 flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 active:opacity-80"
        >
          <MaterialCommunityIcons name="file-plus-outline" size={20} color={colors.white} />
          <Text className="text-sm font-bold text-white">Add page</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- Full screen -------------------------------------------------------------------------

/**
 * Full-screen writing: the screen hides its header, titles and other bars so the page and tools
 * fill it. Android's back button leaves full screen first.
 */
export function useFullScreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOn(false);
      return true;
    });
    return () => sub.remove();
  }, [on]);
  return { on, toggle: () => setOn((v) => !v), exit: () => setOn(false) };
}

export type FullScreen = ReturnType<typeof useFullScreen>;

// --- Toolbar ---------------------------------------------------------------------------

function ToolButton({
  icon,
  label,
  selected = false,
  disabled = false,
  onPress,
}: {
  icon: McIcon;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      className={`h-11 w-10 items-center justify-center rounded-xl ${
        selected ? 'bg-primary' : 'active:bg-surface'
      } ${disabled ? 'opacity-30' : ''}`}
    >
      <MaterialCommunityIcons name={icon} size={24} color={selected ? colors.white : colors.ink} />
    </Pressable>
  );
}

function Swatch({ color, name, selected, onPress }: { color: string; name: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      className="h-11 w-9 items-center justify-center"
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: color,
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? colors.primary : colors.line,
        }}
      />
    </Pressable>
  );
}

const TOOLS: { tool: InkTool; icon: McIcon; label: string }[] = [
  { tool: 'pen', icon: 'pen', label: 'Pen' },
  { tool: 'highlighter', icon: 'marker', label: 'Highlighter' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
  { tool: 'hand', icon: 'hand-back-right-outline', label: 'Scroll the page' },
];

const PAPER_CHOICES: { paper: Paper; icon: McIcon; label: string }[] = [
  { paper: 'lined', icon: 'format-align-justify', label: 'Lined paper' },
  { paper: 'grid', icon: 'grid', label: 'Squared paper' },
  { paper: 'plain', icon: 'checkbox-blank-outline', label: 'Plain paper' },
];

/**
 * Pen, highlighter, eraser and scroll; colours and sizes for the chosen tool; undo and redo;
 * and, when `sheets` is given, the page controls (Page 1 of 2, Add page).
 */
export function InkToolbar({
  editor,
  sheets,
  fullScreen,
}: {
  editor: InkEditor;
  sheets?: InkSheets;
  /** Shows the full-screen button. */
  fullScreen?: FullScreen;
}) {
  const colors = useColors();
  const { tool } = editor;
  const swatches = tool === 'pen' ? PEN_COLORS : tool === 'highlighter' ? HIGHLIGHTER_COLORS : [];
  const chosen = tool === 'pen' ? editor.penColor : editor.highlighterColor;
  const pick = tool === 'pen' ? editor.setPenColor : editor.setHighlighterColor;

  return (
    <View className="gap-1 rounded-2xl border border-line bg-card px-1.5 py-1">
      <View className="flex-row items-center">
        {TOOLS.map((t) => (
          <ToolButton
            key={t.tool}
            icon={t.icon}
            label={t.label}
            selected={tool === t.tool}
            onPress={() => editor.setTool(t.tool)}
          />
        ))}
        <View className="mx-1 h-7 w-px bg-line" />
        <ToolButton icon="undo-variant" label="Undo" disabled={!editor.canUndo} onPress={editor.undo} />
        <ToolButton icon="redo-variant" label="Redo" disabled={!editor.canRedo} onPress={editor.redo} />
        <View className="flex-1" />
        <ToolButton icon="delete-outline" label="Clear the page" disabled={!hasInk(editor.ink)} onPress={editor.clear} />
        {fullScreen ? (
          <ToolButton
            icon={fullScreen.on ? 'fullscreen-exit' : 'fullscreen'}
            label={fullScreen.on ? 'Exit full screen' : 'Full screen'}
            selected={fullScreen.on}
            onPress={fullScreen.toggle}
          />
        ) : null}
      </View>

      {tool === 'hand' ? (
        <Text className="px-2 pb-1.5 text-xs text-muted">Scroll the page. Pick the pen to write again.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center" accessibilityRole="radiogroup">
            {swatches.map((s) => (
              <Swatch key={s.color} color={s.color} name={s.name} selected={chosen === s.color} onPress={() => pick(s.color)} />
            ))}
            {swatches.length > 0 ? <View className="mx-1 h-7 w-px bg-line" /> : null}
            {SIZE_NAMES.map((name, index) => {
              const selected = editor.sizeIndex === index;
              const dot = 6 + index * 5;
              return (
                <Pressable
                  key={name}
                  onPress={() => editor.setSize(index)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${name} ${tool === 'eraser' ? 'eraser' : 'line'}`}
                  accessibilityState={{ checked: selected }}
                  className={`h-11 w-10 items-center justify-center rounded-xl ${selected ? 'bg-primary-soft' : 'active:bg-surface'}`}
                >
                  <View
                    style={{
                      width: dot,
                      height: dot,
                      borderRadius: dot / 2,
                      backgroundColor: tool === 'eraser' ? 'transparent' : selected ? colors.primary : colors.muted,
                      borderWidth: tool === 'eraser' ? 1.5 : 0,
                      borderColor: selected ? colors.primary : colors.muted,
                    }}
                  />
                </Pressable>
              );
            })}
            <View className="mx-1 h-7 w-px bg-line" />
            {PAPER_CHOICES.map((p) => (
              <ToolButton
                key={p.paper}
                icon={p.icon}
                label={p.label}
                selected={editor.ink.paper === p.paper}
                onPress={() => editor.setPaper(p.paper)}
              />
            ))}
          </View>
        </ScrollView>
      )}
      {sheets ? <SheetBar sheets={sheets} /> : null}
    </View>
  );
}

// --- The page you write on -------------------------------------------------------------

/** A line drawn with rounded views: one short bar per step between points. Screen units. */
function ViewStroke({ points, width, color, scale }: { points: number[]; width: number; color: string; scale: number }) {
  const w = Math.max(1, width * scale);
  const bars: ViewStyle[] = [];
  if (points.length === 2) {
    bars.push({ left: points[0] * scale - w / 2, top: points[1] * scale - w / 2, width: w });
  }
  for (let i = 0; i + 3 < points.length; i += 2) {
    const x1 = points[i] * scale;
    const y1 = points[i + 1] * scale;
    const x2 = points[i + 2] * scale;
    const y2 = points[i + 3] * scale;
    const length = Math.hypot(x2 - x1, y2 - y1);
    bars.push({
      left: (x1 + x2) / 2 - (length + w) / 2,
      top: (y1 + y2) / 2 - w / 2,
      width: length + w,
      transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
    });
  }
  return (
    <>
      {bars.map((bar, i) => (
        <View
          key={i}
          style={[{ position: 'absolute', height: w, borderRadius: w / 2, backgroundColor: color }, bar]}
        />
      ))}
    </>
  );
}

/** Stops the browser scrolling or selecting text while writing with a touch screen or pen. */
const WEB_NO_TOUCH_SCROLL = (Platform.OS === 'web'
  ? { touchAction: 'none', userSelect: 'none', cursor: 'crosshair' }
  : {}) as unknown as ViewStyle;

/**
 * The paper page. Write with a finger, a digital pen or a mouse. When the hand tool is
 * picked, touches go to the screen's scrolling instead.
 */
export function InkCanvas({ editor }: { editor: InkEditor }) {
  const { ink, tool } = editor;
  const [width, setWidth] = useState(0);
  const scale = width / PAGE_WIDTH;
  // The line being drawn now (page units), and the page as it was when erasing started.
  const [live, setLive] = useState<number[] | null>(null);
  const erasingFrom = useRef<Ink | null>(null);
  // How many lines the picture showed when it last finished loading; newer ones are drawn as views.
  const [shownCount, setShownCount] = useState(0);
  const uri = width > 0 ? inkDataUri(ink) : null;
  const count = ink.strokes.length;

  const drawing = tool !== 'hand';
  const pointOf = (e: GestureResponderEvent) => {
    const x = Math.round(Math.min(PAGE_WIDTH, Math.max(0, e.nativeEvent.locationX / scale)));
    const y = Math.round(Math.min(ink.height, Math.max(0, e.nativeEvent.locationY / scale)));
    return [x, y] as const;
  };

  function erase(x: number, y: number) {
    const kept = ink.strokes.filter((s) => !strokeHit(s, x, y, editor.size));
    if (kept.length !== ink.strokes.length) editor.preview({ ...ink, strokes: kept });
  }

  function start(e: GestureResponderEvent) {
    if (scale <= 0) return;
    const [x, y] = pointOf(e);
    if (tool === 'eraser') {
      erasingFrom.current = ink;
      erase(x, y);
    } else {
      setLive([x, y]);
    }
  }

  function move(e: GestureResponderEvent) {
    if (scale <= 0) return;
    // A second finger (or a palm) ends the line rather than drawing a jump between them.
    if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) return finish();
    const [x, y] = pointOf(e);
    if (tool === 'eraser') return erase(x, y);
    setLive((points) => {
      if (!points) return points;
      const lx = points[points.length - 2];
      const ly = points[points.length - 1];
      return Math.hypot(x - lx, y - ly) < MIN_STEP ? points : [...points, x, y];
    });
  }

  function finish() {
    if (tool === 'eraser') {
      const before = erasingFrom.current;
      erasingFrom.current = null;
      if (before && before !== ink) editor.remember(before);
      return;
    }
    if (!live) return;
    const highlighter = tool === 'highlighter';
    editor.addStroke({
      c: highlighter ? editor.highlighterColor : editor.penColor,
      w: editor.size,
      ...(highlighter ? { h: 1 as const } : {}),
      p: live,
    });
    setLive(null);
  }

  const liveColor = tool === 'highlighter' ? editor.highlighterColor : editor.penColor;
  // Lines saved but not in the picture yet (it is still loading).
  const waiting = ink.strokes.slice(Math.min(shownCount, count));

  return (
    <View className="gap-2">
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={`Handwriting page. ${count === 0 ? 'Nothing written yet.' : `${count} lines written.`}`}
        onStartShouldSetResponder={() => drawing}
        onMoveShouldSetResponder={() => drawing}
        onResponderTerminationRequest={() => false}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={finish}
        onResponderTerminate={finish}
        className="overflow-hidden rounded-xl border border-line"
        style={[{ width: '100%', height: ink.height * scale || 300 }, drawing ? WEB_NO_TOUCH_SCROLL : null]}
      >
        {/* Nothing inside takes touches, so positions are always measured from the page itself. */}
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
          {uri ? (
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="fill"
              transition={0}
              accessible={false}
              onLoad={() => setShownCount(count)}
            />
          ) : null}
          {waiting.map((s, i) => (
            <View key={`w${i}`} style={{ position: 'absolute', inset: 0, opacity: s.h ? 0.35 : 1 }}>
              <ViewStroke points={s.p} width={s.w} color={s.c} scale={scale} />
            </View>
          ))}
          {live ? (
            <View style={{ position: 'absolute', inset: 0, opacity: tool === 'highlighter' ? 0.35 : 1 }}>
              <ViewStroke points={live} width={editor.size} color={liveColor} scale={scale} />
            </View>
          ) : null}
        </View>
      </View>

      {editor.full ? (
        <Text className="px-1 text-center text-sm font-semibold text-alert">
          This note is full. Start a new handwritten note to keep writing.
        </Text>
      ) : null}

      <View className="flex-row justify-center gap-2">
        {editor.canAddSpace ? (
          <PageButton icon="arrow-expand-down" label="More space" onPress={editor.addSpace} />
        ) : null}
        {editor.canTrim ? <PageButton icon="arrow-collapse-up" label="Trim empty space" onPress={editor.trim} /> : null}
      </View>
    </View>
  );
}

function PageButton({ icon, label, onPress }: { icon: McIcon; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-1.5 rounded-full border border-dashed border-primary px-4 py-2 active:bg-primary-soft"
    >
      <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
      <Text className="text-sm font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}

// --- Reading a handwritten note -----------------------------------------------------------

/** A handwritten note's page. Tap it to see it full screen and zoom in. */
export function HandwrittenPage({ sheets, title }: { sheets: Ink[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const pages = sheets.map((ink, i) => ({
    ink,
    uri: inkDataUri(ink),
    name: sheets.length > 1 ? `${title} · Page ${i + 1} of ${sheets.length}` : title,
  }));
  return (
    <View className="gap-4">
      {pages.map((page, i) => (
        <View key={i} className="gap-1.5">
          {pages.length > 1 ? (
            <Text className="px-1 text-xs font-bold uppercase tracking-wider text-muted">
              Page {i + 1} of {pages.length}
            </Text>
          ) : null}
          <Pressable
            onPress={() => setOpen(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Handwritten page: ${page.name}. Tap to zoom.`}
            className="w-full overflow-hidden rounded-xl border border-line"
          >
            <Image
              source={{ uri: page.uri }}
              contentFit="contain"
              style={{ width: '100%', aspectRatio: PAGE_WIDTH / page.ink.height }}
              accessible={false}
            />
          </Pressable>
        </View>
      ))}
      <ImageViewer
        images={pages.map((p, i) => ({ key: String(i), uri: p.uri, name: p.name }))}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}
