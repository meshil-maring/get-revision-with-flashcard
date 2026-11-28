// The textbook reader's page: toolbar with reading progress, the chapter, contents and reading
// controls (side columns on wide screens, a drawer and a panel on phones), and previous / next
// chapter at the end. Plain React DOM: it runs as part of the page on the web and inside the
// reader's web view on Android (textbook-reader.tsx).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ChapterHeading, ICONS, ReadingControls, TableOfContents } from '@/components/textbook/chrome';
import { ContentContext, FigureBlock, Nodes, type ContentContextValue } from '@/components/textbook/content';
import { TEXT_SCALES, TEXTBOOK_THEMES, type TextbookTheme } from '@/components/textbook/textbook-theme';
import type { TextbookPrefs, TextbookReaderProps } from '@/components/textbook/types';
import { buildTextbook, parseChapterTitle } from '@/lib/textbook';

/** The theme's tokens as CSS variables on the reader's root. */
function themeStyle(theme: TextbookTheme, scale: number): CSSProperties {
  const style: Record<string, string> = { '--tb-scale': String(scale) };
  for (const [name, value] of Object.entries(TEXTBOOK_THEMES[theme])) {
    style[`--tb-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
  }
  // The light / dark scheme for scrollbars and form controls.
  style.colorScheme = theme;
  return style as CSSProperties;
}

const call = (fn: ((...args: never[]) => unknown) | undefined, ...args: unknown[]) => {
  // Calls into the app may return a promise (on Android they cross the bridge); nothing waits for them.
  void (fn as ((...a: unknown[]) => unknown) | undefined)?.(...args);
};

export function TextbookView(props: TextbookReaderProps) {
  const { chapter, images, extraImages, appTheme, previous, next, focus = false } = props;
  const [prefs, setPrefs] = useState<TextbookPrefs>(props.prefs);
  const [bookmarks, setBookmarks] = useState<ReadonlySet<string>>(() => new Set(props.bookmarks));
  const [active, setActive] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [panel, setPanel] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLDivElement>(null);

  const theme: TextbookTheme = prefs.theme === 'app' ? appTheme : prefs.theme;
  const heading = useMemo(() => parseChapterTitle(chapter.title), [chapter.title]);
  // Parsing and numbering happen once per note text, not on every scroll or setting change.
  const book = useMemo(() => buildTextbook(chapter.body, { chapter: heading.number }), [chapter.body, heading.number]);

  const changePrefs = useCallback(
    (nextPrefs: TextbookPrefs) => {
      setPrefs(nextPrefs);
      call(props.onPrefsChange, nextPrefs);
    },
    [props.onPrefsChange],
  );

  const toggleBookmark = useCallback(
    (id: string) => {
      setBookmarks((current) => {
        const nextSet = new Set(current);
        if (nextSet.has(id)) nextSet.delete(id);
        else nextSet.add(id);
        call(props.onBookmarksChange, [...nextSet]);
        return nextSet;
      });
    },
    [props.onBookmarksChange],
  );

  const jump = useCallback((id: string) => {
    setDrawer(false);
    const target = scroller.current?.querySelector(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ block: 'start' });
  }, []);

  // Progress bar and the section being read, updated at most once a frame while scrolling.
  // The bar is moved directly, so scrolling never re-renders the chapter.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
      if (progress.current) progress.current.style.width = `${(ratio * 100).toFixed(2)}%`;
      bar.current?.setAttribute('data-scrolled', String(el.scrollTop > 160));
      let current: string | null = null;
      for (const h of el.querySelectorAll<HTMLElement>('[data-section]')) {
        if (h.getBoundingClientRect().top - el.getBoundingClientRect().top > 96) break;
        current = h.dataset.section ?? null;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [book]);

  // Escape closes whatever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDrawer(false);
      setPanel(false);
      setZoom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const content: ContentContextValue = useMemo(
    () => ({
      images,
      bookmarks,
      onOpenImage: (ref: string) => call(props.onOpenImage, ref),
      onZoom: (src: string, alt: string) => setZoom({ src, alt }),
    }),
    [images, bookmarks, props.onOpenImage],
  );

  const sections = book.toc.filter((entry) => entry.level === 1).length;
  const article = useMemo(
    () => (
      <ContentContext.Provider value={content}>
        <article className="tb-article" lang="en">
          <ChapterHeading
            chapter={chapter}
            number={heading.number}
            title={heading.title}
            minutes={book.minutes}
            sections={sections}
            onOpenTag={(id) => call(props.onOpenTag, id)}
          />
          <Nodes nodes={book.nodes} lead />
          {extraImages.map((ref) => (
            <FigureBlock key={ref} node={{ kind: 'figure', number: null, svg: null, imageRef: ref, caption: [] }} />
          ))}
        </article>
      </ContentContext.Provider>
    ),
    [content, chapter, heading, book, sections, extraImages, props.onOpenTag],
  );

  const contents = (
    <TableOfContents toc={book.toc} active={active} bookmarks={bookmarks} onJump={jump} onToggleBookmark={toggleBookmark} />
  );
  const controls = (
    <ReadingControls prefs={prefs} onChange={changePrefs} onUseStandard={() => call(props.onUseStandard)} />
  );
  const activeTitle = book.toc.find((entry) => entry.id === active);

  return (
    <div
      className="tb-shell"
      data-theme={theme}
      data-width={prefs.width}
      data-focus={focus}
      style={themeStyle(theme, TEXT_SCALES[prefs.size] ?? 1)}
    >
      <div className="tb-scroll" ref={scroller} data-testid="textbook-scroll">
        <div className="tb-bar" ref={bar} data-scrolled="false">
          <div className="tb-bar-row">
            <button
              type="button"
              className="tb-icon-btn tb-only-narrow"
              onClick={() => setDrawer(true)}
              aria-label="Contents"
              aria-expanded={drawer}
            >
              {ICONS.contents}
            </button>
            <div className="tb-bar-title" aria-hidden="true">
              {activeTitle ? `${activeTitle.number ? `${activeTitle.number}  ` : ''}${activeTitle.title}` : heading.title}
            </div>
            {active ? (
              <button
                type="button"
                className="tb-icon-btn"
                aria-pressed={bookmarks.has(active)}
                aria-label={bookmarks.has(active) ? 'Remove bookmark from this section' : 'Bookmark this section'}
                onClick={() => toggleBookmark(active)}
              >
                {bookmarks.has(active) ? ICONS.bookmarked : ICONS.bookmark}
              </button>
            ) : null}
            <button
              type="button"
              className="tb-icon-btn tb-focus-btn"
              aria-pressed={focus}
              aria-label={focus ? 'Exit focus mode' : 'Focus mode'}
              title={focus ? 'Exit focus mode' : 'Focus mode: just the text'}
              onClick={() => {
                setDrawer(false);
                setPanel(false);
                call(props.onFocusChange, !focus);
              }}
            >
              {focus ? ICONS.exitFocus : ICONS.focus}
              <span className="tb-btn-label">{focus ? 'Exit focus' : 'Focus'}</span>
            </button>
            <button
              type="button"
              className="tb-icon-btn tb-only-narrow"
              onClick={() => setPanel((open) => !open)}
              aria-label="Reading settings"
              aria-expanded={panel}
              style={{ fontFamily: 'var(--tb-font-serif, serif)', fontSize: 17 }}
            >
              Aa
            </button>
          </div>
          <div
            className="tb-progress"
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="tb-progress-fill" ref={progress} />
          </div>
        </div>

        <div className="tb-layout">
          <aside className="tb-side">{contents}</aside>
          <main className="tb-main">
            {article}
            {previous || next ? (
              <nav className="tb-pager" aria-label="Chapters">
                <button type="button" disabled={!previous} onClick={() => call(props.onNavigate, 'previous')}>
                  <small>Previous</small>
                  <span>{previous?.title}</span>
                </button>
                <button type="button" className="tb-next" disabled={!next} onClick={() => call(props.onNavigate, 'next')}>
                  <small>Next</small>
                  <span>{next?.title}</span>
                </button>
              </nav>
            ) : null}
          </main>
          <aside className="tb-side" aria-label="Reading settings">
            {controls}
          </aside>
        </div>
      </div>

      {drawer ? (
        <>
          <div className="tb-drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />
          <div className="tb-drawer" role="dialog" aria-modal="true" aria-label="Contents">
            <div className="tb-drawer-head">
              <span />
              <button type="button" className="tb-icon-btn" onClick={() => setDrawer(false)} aria-label="Close contents">
                {ICONS.close}
              </button>
            </div>
            {contents}
          </div>
        </>
      ) : null}

      {panel ? (
        <>
          <div className="tb-drawer-backdrop" style={{ background: 'transparent' }} onClick={() => setPanel(false)} aria-hidden="true" />
          <div className="tb-panel tb-only-narrow" role="dialog" aria-label="Reading settings">
            {controls}
          </div>
        </>
      ) : null}

      {zoom ? (
        <div className="tb-lightbox" onClick={() => setZoom(null)} role="dialog" aria-label={zoom.alt}>
          <img src={zoom.src} alt={zoom.alt} />
        </div>
      ) : null}
    </div>
  );
}
