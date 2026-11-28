// Colours and type for the textbook reader. Components use these only as CSS variables
// (var(--tb-text) …, see textbook-styles.ts), so a theme is one set of values here.

export type TextbookTheme = 'light' | 'dark';

export type TextbookTokens = {
  page: string;
  text: string;
  secondary: string;
  heading: string;
  formula: string;
  border: string;
  example: string;
  /** Toolbars, the contents panel and table headers. */
  surface: string;
  /** Definitions: a warm ink, set apart from theorems (heading blue) and examples (blue). */
  definition: string;
  definitionFill: string;
  exampleFill: string;
  /** Final answers and solutions. */
  answer: string;
  answerFill: string;
  /** Hints and "medium" exercises. */
  hint: string;
  hard: string;
  /** Equations that could not be typeset. */
  error: string;
  errorFill: string;
  /** ==highlighted== text. */
  mark: string;
  link: string;
  /** The light plate diagrams sit on, so drawings made for white paper stay readable in the dark. */
  plate: string;
  shadow: string;
};

export const TEXTBOOK_THEMES: Record<TextbookTheme, TextbookTokens> = {
  light: {
    page: '#FAF9F6',
    text: '#292B30',
    secondary: '#686B73',
    heading: '#243B5A',
    formula: '#F0F3F8',
    border: '#E3E0D9',
    example: '#5276A5',
    surface: '#F3F1EC',
    definition: '#8A5A1F',
    definitionFill: '#F7F1E6',
    exampleFill: '#F3F6FA',
    answer: '#2F6B4F',
    answerFill: '#EDF5F0',
    hint: '#8A6514',
    hard: '#A3413A',
    error: '#B3261E',
    errorFill: '#FBEFEE',
    mark: '#F6E7A6',
    link: '#2F5E9E',
    plate: '#FFFFFF',
    shadow: 'rgba(36, 59, 90, 0.10)',
  },
  dark: {
    page: '#151719',
    text: '#E5E5E2',
    secondary: '#A5A7AC',
    heading: '#B6C9E5',
    formula: '#222831',
    border: '#33373E',
    example: '#91AED8',
    surface: '#1C1F23',
    definition: '#D9B97E',
    definitionFill: '#1F1C17',
    exampleFill: '#1A1F27',
    answer: '#8CC7A6',
    answerFill: '#16211B',
    hint: '#E0BE6E',
    hard: '#EBA29B',
    error: '#F2B8B5',
    errorFill: '#2A1A19',
    mark: 'rgba(230, 196, 92, 0.32)',
    link: '#9CB9E6',
    plate: '#F4F2EC',
    shadow: 'rgba(0, 0, 0, 0.35)',
  },
};

/** The tokens as CSS custom properties, e.g. "--tb-page:#FAF9F6;…". */
export function themeVariables(theme: TextbookTheme): string {
  return Object.entries(TEXTBOOK_THEMES[theme])
    .map(([name, value]) => `--tb-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(';');
}

/** Text size steps (Settings: Small … Extra large), as a scale on the type sizes. */
export const TEXT_SCALES = [0.9, 1, 1.1, 1.22] as const;
/** Reading column widths. A normal column holds about 70 characters of body text. */
export const COLUMN_WIDTHS = { narrow: 600, normal: 680, wide: 800 } as const;
export type ColumnWidth = keyof typeof COLUMN_WIDTHS;

export const FONTS = {
  body: "'StudyMe Serif', 'Source Serif 4', 'Literata', Georgia, 'Times New Roman', serif",
  heading: "'StudyMe Sans', 'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  code: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Roboto Mono', monospace",
};
