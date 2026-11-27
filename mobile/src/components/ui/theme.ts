import { useUniwind } from 'uniwind';

// Colour values for places that need a value rather than a class (icons, headers, inline
// styles). The app colours match src/global.css; keep the two in step.

export const lightColors = {
  primary: '#2f6bd8',
  primarySoft: '#e6eefc',
  calm: '#23988a',
  calmSoft: '#def3ef',
  cta: '#f08a24',
  alert: '#dc3b3b',
  warning: '#f2a516',
  page: '#f9fafb',
  card: '#ffffff',
  surface: '#eef1f5',
  line: '#e1e5eb',
  ink: '#1f2933',
  muted: '#5c6773',
  faint: '#9aa4b0',
  /** White in both themes: icons and text on primary, calm and cta backgrounds. */
  white: '#ffffff',

  // Notes: the Cornell paper sheet and the rich-text look (components/notes, ui/rich-text).
  paper: '#fffdf6',
  paperEdge: '#e8e0cb',
  paperRule: '#d5e3f3',
  paperSummary: '#fbf5e2',
  marginRed: '#e0786d',
  /** Blue ink: Cornell cues, labels and heading underlines. */
  inkBlue: '#1f3f8f',
  /** Heading 1 and the article heading bar. */
  headingBlue: '#2b7fff',
  /** Heading 2 and the lighter accent bar. */
  headingNavy: '#1e3a8a',
  headingBar: '#93b4f5',
  /** The article look's big heading text. */
  headingInk: '#111827',
  notePurple: '#7c5cd6',
  /** Highlighter yellow behind titles; text on it uses highlightInk in both themes. */
  highlight: '#fdeb8f',
  highlightInk: '#1f2933',
  goodBorder: '#9fd5ae',
  goodFill: '#f3fbf5',
  goodIcon: '#2e9d4f',
  badBorder: '#f1a7a7',
  badFill: '#fff5f5',
  badIcon: '#d64545',
  noteBorder: '#c9bdf0',
  noteFill: '#f8f5ff',
  /** The study heatmap, from no activity to a lot. */
  heat: ['#e1e5eb', '#bfe6df', '#86d0c4', '#45b0a2', '#1f8a7d'],
};

export type Colors = typeof lightColors;

export const darkColors: Colors = {
  primary: '#4a82e8',
  primarySoft: '#1c2a45',
  calm: '#2fae9e',
  calmSoft: '#15312d',
  cta: '#f08a24',
  alert: '#ec5a5a',
  warning: '#f2b02e',
  page: '#111418',
  card: '#1a1f25',
  surface: '#222830',
  line: '#2f3740',
  ink: '#e6eaef',
  muted: '#9aa5b1',
  faint: '#66717d',
  white: '#ffffff',

  paper: '#1c1f24',
  paperEdge: '#323840',
  paperRule: '#2b3a4f',
  paperSummary: '#22252b',
  marginRed: '#b8574e',
  inkBlue: '#8fb0f0',
  headingBlue: '#5c9dff',
  headingNavy: '#a9c2f5',
  headingBar: '#4f74b8',
  headingInk: '#f1f4f8',
  notePurple: '#a58cf0',
  highlight: '#fdeb8f',
  highlightInk: '#1f2933',
  goodBorder: '#2f6b42',
  goodFill: '#16241b',
  goodIcon: '#52c27a',
  badBorder: '#7a3434',
  badFill: '#2a1819',
  badIcon: '#f07070',
  noteBorder: '#4d4480',
  noteFill: '#1f1b2e',
  heat: ['#2f3740', '#1d4a43', '#22695f', '#2a8e80', '#3cb8a8'],
};

/** The colours of the theme in use; components re-render when it changes. */
export function useColors(): Colors {
  return useUniwind().theme === 'dark' ? darkColors : lightColors;
}
