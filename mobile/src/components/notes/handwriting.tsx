// Handwritten notes: a paper page to write on with a finger or a digital pen, the tools for
// it (pen, highlighter, eraser, colours, undo), and the finished page shown in a note.
//
// The page is drawn as one SVG picture (see src/lib/ink.ts). The line being drawn right now is
// drawn with small rounded views on top, so writing feels instant; once the picture with
// the new line has loaded, those views go.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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

import { ColorPickerModal, useRecentColors } from '@/components/notes/color-picker';
import { useColors } from '@/components/ui';
import { ImageViewer } from '@/components/ui/image-viewer';
import { confirm } from '@/lib/confirm';
import {
  emptyInk,
  clampMove,
  hasInk,
  inkDataUri,
  lowestPoint,
  moveStrokes,
  MAX_INK_LENGTH,
  MAX_PAGE_HEIGHT,
  MAX_SHEETS,
  MORE_SPACE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  serializeInk,
  strokeAt,
  strokeHit,
  strokesBounds,
  strokesInLasso,
  type Ink,
  type Paper,
  type Stroke,
} from '@/lib/ink';

type McIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type InkTool = 'pen' | 'highlighter' | 'eraser' | 'select' | 'hand';

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
type SizedTool = Exclude<InkTool, 'hand' | 'select'>;
const hasSizes = (tool: InkTool): tool is SizedTool => tool !== 'hand' && tool !== 'select';
/** Thin, medium, thick — in page units (the page is 1000 wide). */
const SIZES: Record<SizedTool, number[]> = {
  pen: [3, 5, 9],
  highlighter: [18, 28, 40],
  eraser: [10, 22, 40],
};
const SIZE_NAMES = ['Thin', 'Medium', 'Thick'];
/** Points closer together than this (page units) are skipped, which keeps notes small. */
const MIN_STEP = 1.5;
const HISTORY = 100;
/** How far a copy is put from what it copies, so both can be seen. */
const DUPLICATE_SHIFT = 50;

/** Everything the handwriting editor keeps: the page, undo / redo and the chosen tool. */
export function useInkEditor() {
  const [ink, setInk] = useState<Ink>(() => emptyInk());
  const [past, setPast] = useState<Ink[]>([]);
  const [future, setFuture] = useState<Ink[]>([]);
  const [tool, setToolState] = useState<InkTool>('pen');
  /** The selected lines (their places in `ink.strokes`), when the select tool is in use. */
  const [selection, setSelection] = useState<number[]>([]);
  const [penColor, setPenColor] = useState(PEN_COLORS[0].color);
  const [highlighterColor, setHighlighterColor] = useState(HIGHLIGHTER_COLORS[0].color);
  const [sizeIndex, setSizeIndex] = useState<Record<SizedTool, number>>({
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
    setSelection([]);
  }, []);

  /**
   * A change that can be undone. `before` is the page as it was (default: as it is now). The
   * selection goes, unless `keep` gives the lines to stay selected.
   */
  function commit(next: Ink, before: Ink = ink, keep: number[] = []) {
    setPast((p) => [...p.slice(-(HISTORY - 1)), before]);
    setFuture([]);
    setInk(next);
    setSelection(keep);
  }

  function setTool(next: InkTool) {
    setToolState(next);
    if (next !== 'select') setSelection([]);
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
    setSelection([]);
    setFull(false);
  }

  function redo() {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast((p) => [...p, ink]);
    setInk(next);
    setSelection([]);
  }

  const size = hasSizes(tool) ? SIZES[tool][sizeIndex[tool]] : 0;
  const chosen = new Set(selection);

  return {
    ink,
    load,
    tool,
    setTool,
    penColor,
    setPenColor,
    highlighterColor,
    setHighlighterColor,
    sizeIndex: hasSizes(tool) ? sizeIndex[tool] : -1,
    setSize: (index: number) => {
      if (hasSizes(tool)) setSizeIndex((s) => ({ ...s, [tool]: index }));
    },
    selection,
    select: setSelection,
    deselect: () => setSelection([]),
    /** Moves the selected lines by (dx, dy) page units; they stay selected. */
    moveSelection: (dx: number, dy: number) => {
      if (selection.length > 0 && (dx !== 0 || dy !== 0)) commit(moveStrokes(ink, selection, dx, dy), ink, selection);
    },
    deleteSelection: () => {
      if (selection.length > 0) commit({ ...ink, strokes: ink.strokes.filter((_, i) => !chosen.has(i)) });
    },
    /** Copies the selected lines a little down and right; the copies become the selection. */
    duplicateSelection: () => {
      const copies = ink.strokes.filter((_, i) => chosen.has(i));
      const bounds = strokesBounds(copies);
      if (!bounds) return;
      const [dx, dy] = clampMove(bounds, DUPLICATE_SHIFT, DUPLICATE_SHIFT, ink.height);
      const moved = moveStrokes({ ...ink, strokes: copies }, copies.map((_, i) => i), dx, dy).strokes;
      const next = { ...ink, strokes: [...ink.strokes, ...moved] };
      if (serializeInk(next).length > MAX_INK_LENGTH) {
        setFull(true);
        return;
      }
      setFull(false);
      commit(next, ink, moved.map((_, i) => ink.strokes.length + i));
    },
    /** Gives the selected lines a new colour. */
    recolorSelection: (color: string) => {
      if (selection.length === 0) return;
      commit({ ...ink, strokes: ink.strokes.map((s, i) => (chosen.has(i) ? { ...s, c: color } : s)) }, ink, selection);
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
      if (paper !== ink.paper) commit({ ...ink, paper }, ink, selection);
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
  { tool: 'select', icon: 'lasso', label: 'Select' },
  { tool: 'hand', icon: 'hand-back-right-outline', label: 'Scroll the page' },
];

const PAPER_CHOICES: { paper: Paper; icon: McIcon; label: string }[] = [
  { paper: 'lined', icon: 'format-align-justify', label: 'Lined paper' },
  { paper: 'grid', icon: 'grid', label: 'Squared paper' },
  { paper: 'dotted', icon: 'dots-grid', label: 'Dotted paper' },
  { paper: 'plain', icon: 'checkbox-blank-outline', label: 'Plain paper' },
];

/**
 * Pen, highlighter, eraser, select and scroll; colours and sizes for the chosen tool (or what
 * to do with the selection); undo and redo;
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
  const picked = editor.selection.map((i) => editor.ink.strokes[i]).filter((s): s is Stroke => !!s);
  const selecting = tool === 'select';
  const swatches =
    tool === 'pen' || (selecting && picked.length > 0) ? PEN_COLORS : tool === 'highlighter' ? HIGHLIGHTER_COLORS : [];
  // With a selection: its colour, if all of it is one colour.
  const chosen = selecting
    ? picked.length > 0 && picked.every((s) => s.c === picked[0].c)
      ? picked[0].c
      : ''
    : tool === 'pen'
      ? editor.penColor
      : editor.highlighterColor;
  const pick = selecting ? editor.recolorSelection : tool === 'pen' ? editor.setPenColor : editor.setHighlighterColor;
  const recentColors = useRecentColors();
  const [picking, setPicking] = useState(false);
  // A colour picked with the custom picker that isn't one of the ready-made ones.
  const custom = swatches.length > 0 && chosen && !swatches.some((s) => s.color === chosen) ? chosen : null;

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
      ) : selecting && picked.length === 0 ? (
        <Text className="px-2 pb-1.5 text-xs text-muted">
          Draw a loop round your writing to select it, or tap a line.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center" accessibilityRole="radiogroup">
            {swatches.map((s) => (
              <Swatch key={s.color} color={s.color} name={s.name} selected={chosen === s.color} onPress={() => pick(s.color)} />
            ))}
            {custom ? <Swatch color={custom} name={`Custom colour ${custom}`} selected onPress={() => setPicking(true)} /> : null}
            {swatches.length > 0 ? (
              <Pressable
                onPress={() => setPicking(true)}
                accessibilityRole="button"
                accessibilityLabel="Pick any colour"
                className="h-11 w-9 items-center justify-center"
              >
                <View
                  className="items-center justify-center border border-dashed border-muted"
                  style={{ width: 26, height: 26, borderRadius: 13 }}
                >
                  <MaterialCommunityIcons name="palette-outline" size={16} color={colors.ink} />
                </View>
              </Pressable>
            ) : null}
            {swatches.length > 0 ? <View className="mx-1 h-7 w-px bg-line" /> : null}
            {selecting ? (
              <>
                <Text className="px-1.5 text-sm font-semibold text-ink" accessibilityLiveRegion="polite">
                  {picked.length} selected
                </Text>
                <ToolButton icon="content-copy" label="Duplicate the selection" onPress={editor.duplicateSelection} />
                <ToolButton icon="delete-outline" label="Delete the selection" onPress={editor.deleteSelection} />
                <ToolButton icon="selection-off" label="Select nothing" onPress={editor.deselect} />
              </>
            ) : null}
            {selecting ? null : SIZE_NAMES.map((name, index) => {
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
      <ColorPickerModal
        visible={picking}
        title={selecting ? 'Colour of the selection' : tool === 'highlighter' ? 'Highlighter colour' : 'Pen colour'}
        initial={chosen || PEN_COLORS[0].color}
        recent={recentColors.recent}
        onCancel={() => setPicking(false)}
        onPick={(color) => {
          pick(color);
          recentColors.add(color);
          setPicking(false);
        }}
      />
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

/** The selected lines as a picture drawn from the top-left corner, and where it goes (page units). */
type SelectionLayer = { uri: string; x: number; y: number; strokes: Stroke[] };
/** Room round the selection's picture for the width of its lines (page units). */
const LAYER_MARGIN = 60;

/** Adds a point to a line, skipping ones too close to the last to matter. */
function addPoint(points: number[], x: number, y: number): number[] {
  const lx = points[points.length - 2];
  const ly = points[points.length - 1];
  return Math.hypot(x - lx, y - ly) < MIN_STEP ? points : [...points, x, y];
}

/** Stops the browser scrolling or selecting text while writing with a touch screen or pen. */
const WEB_NO_TOUCH_SCROLL = (Platform.OS === 'web'
  ? { touchAction: 'none', userSelect: 'none', cursor: 'crosshair' }
  : {}) as unknown as ViewStyle;

/**
 * The paper page. Write with a finger, a digital pen or a mouse. When the hand tool is
 * picked, touches go to the screen's scrolling instead. With the select tool, a loop drawn
 * round some writing (or a tap on a line) selects it; drag inside the box to move it.
 */
export function InkCanvas({ editor }: { editor: InkEditor }) {
  const colors = useColors();
  const { ink, tool, selection } = editor;
  const [width, setWidth] = useState(0);
  const scale = width / PAGE_WIDTH;
  // The line being drawn now (page units), and the page as it was when erasing started.
  const [live, setLive] = useState<number[] | null>(null);
  const erasingFrom = useRef<Ink | null>(null);
  // The loop being drawn round writing to select it (page units).
  const [lasso, setLasso] = useState<number[] | null>(null);
  // Moving the selection: where the drag started, and how far it has gone (page units).
  const dragFrom = useRef<readonly [number, number] | null>(null);
  const [offset, setOffset] = useState<[number, number]>([0, 0]);

  // The selected lines are drawn as a picture of their own on top (the page's picture leaves
  // them out), so they move smoothly. That picture is drawn from the top-left corner and moved
  // into place, so moving the lines doesn't change it: nothing has to load after a move.
  const ready = width > 0;
  const { base, uri, layer, selected } = useMemo(() => {
    const chosen = new Set(selection);
    const picked = ink.strokes.filter((_, i) => chosen.has(i));
    const rest = picked.length > 0 ? { ...ink, strokes: ink.strokes.filter((_, i) => !chosen.has(i)) } : ink;
    const b = strokesBounds(picked);
    let selectionLayer: SelectionLayer | null = null;
    if (ready && b) {
      // Room round the lines for their width (at most 100), so nothing is cut off.
      const x = b.left - LAYER_MARGIN;
      const y = b.top - LAYER_MARGIN;
      const shifted = moveStrokes({ ...ink, strokes: picked }, picked.map((_, i) => i), -x, -y);
      selectionLayer = { uri: inkDataUri(shifted, { paper: false }), x, y, strokes: picked };
    }
    return { base: rest, selected: picked, uri: ready ? inkDataUri(rest) : null, layer: selectionLayer };
  }, [ink, selection, ready]);
  const bounds = strokesBounds(selected);
  const pad = Math.max(0, ...selected.map((s) => s.w / 2)) + 14;
  const count = base.strokes.length;

  // How many lines the picture showed when it last finished loading, and whether nothing was
  // selected then; newer lines are drawn as views until the picture catches up.
  const [shown, setShown] = useState({ count: 0, plain: true });

  // After selecting nothing, the page's picture still leaves out the lines that were selected
  // until its new picture has loaded; until then, keep showing them on top.
  const [lastLayer, setLastLayer] = useState<SelectionLayer | null>(null);
  if (layer && lastLayer !== layer) setLastLayer(layer);
  const shownLayer =
    layer ??
    (lastLayer && !shown.plain && lastLayer.strokes.every((s) => ink.strokes.includes(s)) ? lastLayer : null);

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

  const insideSelection = (x: number, y: number) =>
    !!bounds && x >= bounds.left - pad && x <= bounds.right + pad && y >= bounds.top - pad && y <= bounds.bottom + pad;

  function start(e: GestureResponderEvent) {
    if (scale <= 0) return;
    const [x, y] = pointOf(e);
    if (tool === 'eraser') {
      erasingFrom.current = ink;
      erase(x, y);
    } else if (tool === 'select') {
      if (insideSelection(x, y)) {
        dragFrom.current = [x, y];
        setOffset([0, 0]);
      } else {
        // The old selection stays until the new loop is finished.
        setLasso([x, y]);
      }
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
    if (tool === 'select') {
      const from = dragFrom.current;
      if (from && bounds) setOffset(clampMove(bounds, x - from[0], y - from[1], ink.height));
      else setLasso((points) => (points ? addPoint(points, x, y) : points));
      return;
    }
    setLive((points) => (points ? addPoint(points, x, y) : points));
  }

  function finish() {
    if (tool === 'eraser') {
      const before = erasingFrom.current;
      erasingFrom.current = null;
      if (before && before !== ink) editor.remember(before);
      return;
    }
    if (tool === 'select') {
      if (dragFrom.current) {
        dragFrom.current = null;
        if (offset[0] !== 0 || offset[1] !== 0) editor.moveSelection(offset[0], offset[1]);
        setOffset([0, 0]);
        return;
      }
      if (!lasso) return;
      const b = strokesBounds([{ c: '', w: 0, p: lasso }]);
      // A tap (or a very small loop) picks the line under the finger.
      if (!b || Math.max(b.right - b.left, b.bottom - b.top) < 16) {
        const hit = strokeAt(ink, lasso[0], lasso[1], 16);
        editor.select(hit >= 0 ? [hit] : []);
      } else {
        editor.select(strokesInLasso(ink, lasso));
      }
      setLasso(null);
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
  const waiting = selection.length === 0 && shown.plain ? base.strokes.slice(Math.min(shown.count, count)) : [];
  const total = ink.strokes.length;

  return (
    <View className="gap-2">
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={`Handwriting page. ${total === 0 ? 'Nothing written yet.' : `${total} lines written.`}${
          selection.length > 0 ? ` ${selection.length} selected.` : ''
        }`}
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
              onLoad={() => setShown({ count, plain: selection.length === 0 })}
            />
          ) : null}
          {waiting.map((s, i) => (
            <View key={`w${i}`} style={{ position: 'absolute', inset: 0, opacity: s.h ? 0.35 : 1 }}>
              <ViewStroke points={s.p} width={s.w} color={s.c} scale={scale} />
            </View>
          ))}
          {shownLayer ? (
            <Image
              source={{ uri: shownLayer.uri }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                transform: [
                  { translateX: (shownLayer.x + (layer ? offset[0] : 0)) * scale },
                  { translateY: (shownLayer.y + (layer ? offset[1] : 0)) * scale },
                ],
              }}
              contentFit="fill"
              transition={0}
              accessible={false}
            />
          ) : null}
          {bounds && !lasso ? (
            <View
              style={{
                position: 'absolute',
                left: (bounds.left - pad + offset[0]) * scale,
                top: (bounds.top - pad + offset[1]) * scale,
                width: (bounds.right - bounds.left + pad * 2) * scale,
                height: (bounds.bottom - bounds.top + pad * 2) * scale,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.primary,
                borderRadius: 8,
              }}
            />
          ) : null}
          {lasso ? (
            <View style={{ position: 'absolute', inset: 0, opacity: 0.7 }}>
              <ViewStroke points={lasso} width={scale > 0 ? 2 / scale : 2} color={colors.primary} scale={scale} />
            </View>
          ) : null}
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
