'use dom';

// The textbook reader as an Expo DOM component: on Android (and iOS) it runs in one web view,
// where KaTeX and real typography are available; on the web it is simply part of the page.
// Its props cross into the web view, so they are plain data (see types.ts).
import type { DOMProps } from 'expo/dom';

import { KATEX_CSS, TEXT_FONTS_CSS } from '@/components/textbook/fonts.generated';
import { TEXTBOOK_CSS } from '@/components/textbook/textbook-styles';
import { TextbookView } from '@/components/textbook/textbook-view';
import type { TextbookReaderProps } from '@/components/textbook/types';

/** A short fingerprint of a stylesheet, so its href changes when it does. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

// React keeps the first stylesheet it was given for an href (it doesn't update one in place), so
// the href carries the contents' fingerprint: after a change, the new styles are used.
const FONTS_HREF = `studyme-textbook-fonts-${fingerprint(KATEX_CSS + TEXT_FONTS_CSS)}`;
const STYLES_HREF = `studyme-textbook-${fingerprint(TEXTBOOK_CSS)}`;

export default function TextbookReader(props: TextbookReaderProps & { dom?: DOMProps }) {
  const { dom: _dom, ...rest } = props;
  return (
    <>
      {/* React puts these in <head> once, however many readers are open. */}
      <style href={FONTS_HREF} precedence="low">
        {KATEX_CSS + TEXT_FONTS_CSS}
      </style>
      <style href={STYLES_HREF} precedence="medium">
        {TEXTBOOK_CSS}
      </style>
      <TextbookView {...rest} />
    </>
  );
}
