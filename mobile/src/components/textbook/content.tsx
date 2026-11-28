// The parts of a chapter's text: paragraphs, headings, lists, tables, code and figures.
// Textbook blocks (definitions, examples…) are in academic.tsx.
import { createContext, memo, useContext } from 'react';

import { EnvBlock } from '@/components/textbook/academic';
import { MathBlock } from '@/components/textbook/math';
import { PageButton, usePageOpener } from '@/components/textbook/pages';
import { Spans } from '@/components/textbook/spans';
import type { TextbookImage } from '@/components/textbook/types';
import type { Span, TableRow } from '@/lib/rich-text';
import { svgDataUri } from '@/lib/svg';
import type { TextbookNode } from '@/lib/textbook';

/** What the text needs from the reader around it. */
export type ContentContextValue = {
  images: Record<string, TextbookImage>;
  /** An attached image was tapped (shown full screen by the app). */
  onOpenImage: (ref: string) => void;
  /** A diagram was tapped (shown full screen inside the reader). */
  onZoom: (src: string, alt: string) => void;
  bookmarks: ReadonlySet<string>;
};

export const ContentContext = createContext<ContentContextValue>({
  images: {},
  onOpenImage: () => {},
  onZoom: () => {},
  bookmarks: new Set(),
});

/** Academic blocks draw their content with this (passed in, so the two files don't import each other). */
const renderNodes = (nodes: TextbookNode[]) => <Nodes nodes={nodes} />;

const plain = (spans: Span[]) => spans.map((s) => s.text).join('').trim();

/** A run of the chapter's parts. */
export function Nodes({ nodes, lead = false }: { nodes: TextbookNode[]; lead?: boolean }) {
  // The first paragraph of the chapter, before any section, reads as its introduction.
  const leadIndex = lead ? nodes.findIndex((n) => n.kind === 'paragraph') : -1;
  const firstHeading = nodes.findIndex((n) => n.kind === 'heading');
  return nodes.map((node, i) => (
    <Node key={i} node={node} lead={i === leadIndex && (firstHeading === -1 || i < firstHeading)} />
  ));
}

export const Node = memo(function Node({ node, lead = false }: { node: TextbookNode; lead?: boolean }) {
  switch (node.kind) {
    case 'heading':
      return <SectionHeading node={node} />;
    case 'paragraph':
      return node.page ? (
        <Question page={node.page} spans={node.spans} Tag="p" />
      ) : (
        <p className={lead ? 'tb-lead' : undefined}>
          <Spans spans={node.spans} />
        </p>
      );
    case 'list': {
      const items = node.items.map((item, i) =>
        node.pages?.[i] ? (
          <Question key={i} page={node.pages[i]} spans={item} Tag="li" />
        ) : (
          <li key={i}>
            <Spans spans={item} />
          </li>
        ),
      );
      return node.ordered ? <ol start={node.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case 'math':
      return <MathBlock latex={node.latex} number={node.number} />;
    case 'code':
      return <CodeBlock code={node.code} lang={node.lang} />;
    case 'table':
      return <TableBlock header={node.header} rows={node.rows} />;
    case 'figure':
      return <FigureBlock node={node} />;
    case 'env':
      return <EnvBlock node={node} renderNodes={renderNodes} />;
    case 'box':
      return (
        <aside className={`tb-box tb-box-${node.box}`}>
          {plain(node.title) ? (
            <p className="tb-label">
              <Spans spans={node.title} />
            </p>
          ) : null}
          <div className="tb-env-body">
            <Nodes nodes={node.children} />
          </div>
        </aside>
      );
  }
});

const BOOKMARK_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
  </svg>
);

/** A question ("Q1. …") with its own handwriting page: tap it, or its pen, to write the answer. */
function Question({ page, spans, Tag }: { page: string; spans: Span[]; Tag: 'p' | 'li' }) {
  const title = plain(spans);
  const onClick = usePageOpener(page, title);
  return (
    <Tag className="tb-question-line" data-page={page} onClick={onClick}>
      <Spans spans={spans} />
      <PageButton page={page} title={title} />
    </Tag>
  );
}

/** "2.1  Important properties", numbered as in a book. Tap it to write about it on its own page. */
function SectionHeading({ node }: { node: Extract<TextbookNode, { kind: 'heading' }> }) {
  const { bookmarks } = useContext(ContentContext);
  const title = `${node.number ? `${node.number} ` : ''}${node.text}`;
  const onClick = usePageOpener(node.page, title);
  const Tag = node.level === 1 ? 'h2' : node.level === 2 ? 'h3' : node.level === 3 ? 'h4' : 'h5';
  return (
    <div className="tb-h-wrap">
      {bookmarks.has(node.id) ? (
        <span className="tb-h-mark" title="Bookmarked">
          {BOOKMARK_ICON}
        </span>
      ) : null}
      <Tag
        id={node.id}
        className={`tb-h tb-h${node.level}${onClick ? ' tb-h-page' : ''}`}
        data-section={node.level <= 2 ? node.id : undefined}
        onClick={onClick}
      >
        {node.number ? <span className="tb-num">{node.number}</span> : null}
        <Spans spans={node.spans} />
        <PageButton page={node.page} title={title} />
      </Tag>
    </div>
  );
}

/** A table ruled like a printed book. Wide tables scroll sideways inside their own box. */
export function TableBlock({ header, rows }: { header: TableRow | null; rows: TableRow[] }) {
  const columns = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  if (columns === 0) return null;
  const cells = (row: TableRow, Cell: 'th' | 'td') =>
    Array.from({ length: columns }, (_, c) => (
      <Cell key={c} scope={Cell === 'th' ? 'col' : undefined}>
        <Spans spans={row[c] ?? []} />
      </Cell>
    ));
  return (
    <div className="tb-table-wrap" tabIndex={0} role="region" aria-label={`Table with ${columns} columns`}>
      <table className="tb-table">
        {header ? (
          <thead>
            <tr>{cells(header, 'th')}</tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{cells(row, 'td')}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CodeBlock({ code, lang }: { code: string; lang: string | null }) {
  return (
    <div className="tb-code">
      {lang ? <div className="tb-code-lang">{lang}</div> : null}
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A diagram (SVG from the note) or an attached image, numbered "Figure 2.1". */
export function FigureBlock({ node }: { node: Extract<TextbookNode, { kind: 'figure' }> }) {
  const { images, onOpenImage, onZoom } = useContext(ContentContext);
  const label = node.number ? `Figure ${node.number}` : null;

  if (node.svg !== null) {
    const src = svgDataUri(node.svg);
    const caption = plain(node.caption);
    const alt = [label, caption].filter(Boolean).join(': ') || 'Diagram';
    return (
      <figure className="tb-figure">
        {src ? (
          <button type="button" className="tb-figure-plate" onClick={() => onZoom(src, alt)} aria-label={`${alt}. Enlarge`}>
            <img src={src} alt={alt} />
          </button>
        ) : (
          <div className="tb-figure-missing">This diagram can&apos;t be shown.</div>
        )}
        <figcaption>
          {label ? <b>{label}</b> : null}
          <Spans spans={node.caption} />
        </figcaption>
      </figure>
    );
  }

  const image = images[node.imageRef ?? ''];
  // A ":::image" line for an image the note doesn't have shows nothing, as in the standard view.
  if (!image) return null;
  const caption = image.caption ?? '';
  const alt = image.alt || caption || image.name || label || 'Image';
  return (
    <figure className="tb-figure">
      {image.uri ? (
        <button type="button" className="tb-figure-plate" onClick={() => onOpenImage(node.imageRef ?? '')} aria-label={`${alt}. Open full screen`}>
          <img src={image.uri} alt={alt} loading="lazy" decoding="async" />
        </button>
      ) : (
        <div className="tb-figure-missing">This image is still downloading. It appears after the next sync.</div>
      )}
      <figcaption>
        {label ? <b>{label}</b> : null}
        {caption}
      </figcaption>
    </figure>
  );
}
