// Getting a diagram's SVG ready to show. Diagrams come from notes (often written by an AI
// app), so they are cleaned first: no scripts, event handlers, embedded HTML or outside
// links. They are drawn as images (an <img> on web, expo-image on Android), which never
// run scripts anyway; cleaning is a second line of defence.

/** Diagrams bigger than this are not shown (a normal one is 2–10 KB). */
export const MAX_SVG_LENGTH = 60_000;

/** Removes anything that could run code or load something from elsewhere. */
export function cleanSvg(svg: string): string {
  return (
    svg
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script[^>]*\/>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
      .replace(/<(iframe|object|embed|image|use)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, (tag) =>
        // <use href="#arrow"> (a part of this same drawing) is fine; anything else goes.
        /^<use\b/i.test(tag) && !/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(tag) ? tag : '',
      )
      // on…="" handlers, and links that aren't to a part of this same drawing.
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
      .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, 'none')
      .replace(/@import[^;]*;?/gi, '')
  );
}

/** Adds what an SVG needs to be shown as an image, if the writer left it out. */
function withNamespace(svg: string): string {
  return /<svg\b[^>]*\sxmlns\s*=/i.test(svg) ? svg : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Width ÷ height, from the viewBox or the width and height; 4:3 if neither says. */
export function svgAspectRatio(svg: string): number {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(open);
  if (box && Number(box[1]) > 0 && Number(box[2]) > 0) return Number(box[1]) / Number(box[2]);
  const width = Number(/\swidth\s*=\s*["']\s*([\d.]+)/i.exec(open)?.[1]);
  const height = Number(/\sheight\s*=\s*["']\s*([\d.]+)/i.exec(open)?.[1]);
  return width > 0 && height > 0 ? width / height : 4 / 3;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64[n & 63] : '=';
  }
  return out;
}

/** The cleaned diagram as a data: URL an image can show, or null if it can't be shown. */
export function svgDataUri(svg: string): string | null {
  if (!svg || svg.length > MAX_SVG_LENGTH) return null;
  return `data:image/svg+xml;base64,${utf8ToBase64(withNamespace(cleanSvg(svg)))}`;
}
