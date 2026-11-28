// Around the text: the chapter heading, the table of contents and the reading controls.
import type { TextbookChapter, TextbookPrefs } from '@/components/textbook/types';
import { TEXT_SCALES } from '@/components/textbook/textbook-theme';
import type { TocEntry } from '@/lib/textbook';

export const ICONS = {
  contents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
    </svg>
  ),
  bookmarked: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
    </svg>
  ),
  focus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  exitFocus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
};

const SIZE_NAMES = ['Small', 'Medium', 'Large', 'Extra large'];

/** "Mathematics · Chapter 3", the title, then reading time, sections, who wrote it and tags. */
export function ChapterHeading({
  chapter,
  number,
  title,
  minutes,
  sections,
  onOpenTag,
}: {
  chapter: TextbookChapter;
  number: number | null;
  title: string;
  minutes: number;
  sections: number;
  onOpenTag: (id: string) => void;
}) {
  const subject = chapter.path.length > 0 ? chapter.path[chapter.path.length - 1] : null;
  return (
    <header className="tb-chapter">
      {subject ? <p className="tb-eyebrow">{subject}</p> : null}
      <h1 className="tb-chapter-title">
        {number !== null ? <span className="tb-chapter-num">Chapter {number}</span> : null}
        {title}
      </h1>
      <div className="tb-meta">
        <span>{minutes} min read</span>
        {sections > 0 ? (
          <span>
            {sections} {sections === 1 ? 'section' : 'sections'}
          </span>
        ) : null}
        {chapter.createdBy ? <span>Written with {chapter.createdBy}</span> : null}
        {chapter.tags.map((tag) => (
          <button key={tag.id} type="button" className="tb-tag" onClick={() => onOpenTag(tag.id)}>
            <i style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>
    </header>
  );
}

/** The chapter's sections; the one being read is marked. Each can be bookmarked. */
export function TableOfContents({
  toc,
  active,
  bookmarks,
  onJump,
  onToggleBookmark,
}: {
  toc: TocEntry[];
  active: string | null;
  bookmarks: ReadonlySet<string>;
  onJump: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}) {
  const marked = toc.filter((entry) => bookmarks.has(entry.id));
  return (
    <nav className="tb-toc" aria-label="Contents">
      <h2>Contents</h2>
      {toc.length === 0 ? <p style={{ fontSize: 13, color: 'var(--tb-secondary)' }}>This chapter has no sections.</p> : null}
      <ol>
        {toc.map((entry) => (
          <li key={entry.id} className={entry.level === 2 ? 'tb-toc-sub' : undefined}>
            <a
              href={`#${entry.id}`}
              aria-current={entry.id === active ? true : undefined}
              onClick={(e) => {
                e.preventDefault();
                onJump(entry.id);
              }}
            >
              {entry.number ? <span className="tb-toc-num">{entry.number}</span> : null}
              <span>{entry.title}</span>
            </a>
            <button
              type="button"
              className="tb-toc-mark"
              aria-pressed={bookmarks.has(entry.id)}
              aria-label={`${bookmarks.has(entry.id) ? 'Remove bookmark from' : 'Bookmark'} ${entry.title}`}
              onClick={() => onToggleBookmark(entry.id)}
            >
              {bookmarks.has(entry.id) ? ICONS.bookmarked : ICONS.bookmark}
            </button>
          </li>
        ))}
      </ol>
      {marked.length > 0 ? (
        <div className="tb-bookmarks">
          <h2>Bookmarks</h2>
          <ol>
            {marked.map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`} onClick={(e) => (e.preventDefault(), onJump(entry.id))}>
                  {entry.number ? <span className="tb-toc-num">{entry.number}</span> : null}
                  <span>{entry.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </nav>
  );
}

/** Text size, column width (wide screens only) and theme, and a way back to the standard view. */
export function ReadingControls({
  prefs,
  onChange,
  onUseStandard,
}: {
  prefs: TextbookPrefs;
  onChange: (prefs: TextbookPrefs) => void;
  onUseStandard: () => void;
}) {
  const segmented = <T extends string>(value: T, options: [T, string][], set: (v: T) => void) => (
    <div className="tb-segmented">
      {options.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => set(key)}>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="tb-controls">
      <div>
        <div className="tb-control-label" id="tb-size-label">
          Text size
        </div>
        <div className="tb-size-row" role="group" aria-labelledby="tb-size-label">
          <button
            type="button"
            aria-label="Smaller text"
            disabled={prefs.size <= 0}
            onClick={() => onChange({ ...prefs, size: prefs.size - 1 })}
            style={{ fontSize: 14 }}
          >
            A
          </button>
          <output aria-live="polite">{SIZE_NAMES[prefs.size]}</output>
          <button
            type="button"
            aria-label="Larger text"
            disabled={prefs.size >= TEXT_SCALES.length - 1}
            onClick={() => onChange({ ...prefs, size: prefs.size + 1 })}
            style={{ fontSize: 21 }}
          >
            A
          </button>
        </div>
      </div>
      <div className="tb-only-wide">
        <div className="tb-control-label">Page width</div>
        {segmented(prefs.width, [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']], (width) => onChange({ ...prefs, width }))}
      </div>
      <div>
        <div className="tb-control-label">Theme</div>
        {segmented(prefs.theme, [['app', 'App'], ['light', 'Light'], ['dark', 'Dark']], (theme) => onChange({ ...prefs, theme }))}
      </div>
      <button type="button" className="tb-link-btn" onClick={onUseStandard}>
        Switch to the standard note view
      </button>
    </div>
  );
}
