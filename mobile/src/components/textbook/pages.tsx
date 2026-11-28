// Handwriting pages in the textbook reader: each heading, question ("Q1. …") and exercise has
// its own page to write on. Tapping one (or its pen button) asks the app to open that page.
import { createContext, useContext, type MouseEvent } from 'react';

export type PagesContextValue = {
  /** Keys of the pages that have writing on them. */
  written: ReadonlySet<string>;
  /** Opens a page; null when the reader isn't given a way to (nothing is shown then). */
  open: ((page: string, title: string) => void) | null;
};

export const PagesContext = createContext<PagesContextValue>({ written: new Set(), open: null });

const PEN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** A click on a heading or question that opens its page (not when selecting text or tapping a link). */
export function usePageOpener(page: string | null | undefined, title: string) {
  const { open } = useContext(PagesContext);
  if (!page || !open) return undefined;
  return (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, summary')) return;
    if (window.getSelection?.()?.toString()) return;
    open(page, title);
  };
}

/** The pen next to a heading or question: outlined, or filled when its page has writing. */
export function PageButton({ page, title }: { page: string | null | undefined; title: string }) {
  const { written, open } = useContext(PagesContext);
  if (!page || !open) return null;
  const has = written.has(page);
  return (
    <>
    {' '}
    <button
      type="button"
      className="tb-pen"
      data-written={has}
      aria-label={has ? `Open your handwritten notes for ${title}` : `Write notes by hand for ${title}`}
      title={has ? 'Your handwritten notes' : 'Write notes by hand'}
      onClick={(e) => {
        e.stopPropagation();
        open(page, title);
      }}
    >
      {PEN}
    </button>
    </>
  );
}
