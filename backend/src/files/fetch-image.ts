import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import type { IncomingMessage } from 'node:http';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

import { ImageError, mb } from './images.ts';

// Downloads an image an AI app points to (an https link, or ChatGPT's download_url for a file
// the user attached). The server fetches it, so the link must not reach anything private:
// only https, and every address the host name resolves to must be on the public internet.
// The check runs when connecting (not before), so a host name can't change its address
// between the check and the download (DNS rebinding).

// One list per family: a single BlockList also checks IPv4 addresses against IPv6 rules (as
// IPv4-mapped addresses), so the ::ffff:0:0/96 rule would block every IPv4 address.
const PRIVATE_V4 = new BlockList();
const PRIVATE_V6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  PRIVATE_V4.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 127], // unspecified and loopback (::1)
  ['::ffff:0:0', 96], // IPv4-mapped: refused outright rather than unwrapped
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  PRIVATE_V6.addSubnet(net, prefix, 'ipv6');
}

/** True for an address on the public internet; false for private, local or reserved ones. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return family === 4 ? !PRIVATE_V4.check(address, 'ipv4') : !PRIVATE_V6.check(address, 'ipv6');
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses host names resolving to any non-public address. */
function publicOnlyLookup(hostname: string, options: { all?: boolean; family?: number | string }, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true } as { all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      const blocked = Object.assign(new Error(`${hostname} is not on the public internet.`), { code: 'EBLOCKED' });
      return callback(blocked, '');
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

export type FetchedImage = { bytes: Uint8Array; contentType: string | null; fileName: string | null };

export type FetchOptions = { maxBytes: number; timeoutMs?: number; maxRedirects?: number };

/** Something that downloads an image link; tests replace it to avoid the network. */
export type ImageFetcher = (url: string, options: FetchOptions) => Promise<FetchedImage>;

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageError('That is not a valid link.');
  }
  if (url.protocol !== 'https:') throw new ImageError('Only https:// image links can be fetched.');
  if (url.username || url.password) throw new ImageError('Image links cannot contain a user name or password.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) throw new ImageError('That link points to a private address.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new ImageError('That link points to a private address.');
  }
  return url;
}

function fileNameFrom(url: URL, disposition: string | undefined): string | null {
  const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '')?.[1];
  if (fromHeader) {
    try {
      return decodeURIComponent(fromHeader);
    } catch {
      return fromHeader;
    }
  }
  const last = url.pathname.split('/').filter(Boolean).pop();
  return last ? decodeURIComponent(last) : null;
}

function getOnce(url: URL, timeoutMs: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        lookup: publicOnlyLookup as never,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'StudyMe-ImageFetch/1.0', Accept: 'image/png,image/jpeg,image/webp,image/*;q=0.5' },
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(new ImageError('The image link took too long to answer.', 502)));
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error instanceof ImageError) return reject(error);
      if (error.code === 'EBLOCKED') return reject(new ImageError('That link points to a private address.'));
      reject(new ImageError(`Could not download the image (${error.code ?? error.message}).`, 502));
    });
    req.end();
  });
}

/** Downloads an https image link with the checks above, following up to 3 redirects. */
export const fetchImage: ImageFetcher = async (raw, { maxBytes, timeoutMs = 15_000, maxRedirects = 3 }) => {
  let url = checkUrl(raw);
  const deadline = Date.now() + timeoutMs * 2;
  for (let hop = 0; ; hop++) {
    const res = await getOnce(url, timeoutMs);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop >= maxRedirects) throw new ImageError('The image link redirects too many times.', 502);
      url = checkUrl(new URL(res.headers.location, url).toString());
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new ImageError(`The image link answered ${status}${status === 403 || status === 410 ? ' (it may have expired)' : ''}.`, 502);
    }
    const declaredLength = Number(res.headers['content-length'] ?? 0);
    if (declaredLength > maxBytes) {
      res.destroy();
      throw new ImageError(`Images can be up to ${mb(maxBytes)}; this one is ${mb(declaredLength)}.`, 413);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > maxBytes) {
        res.destroy();
        throw new ImageError(`Images can be up to ${mb(maxBytes)}.`, 413);
      }
      if (Date.now() > deadline) {
        res.destroy();
        throw new ImageError('The image took too long to download.', 502);
      }
      chunks.push(chunk);
    }
    return {
      bytes: new Uint8Array(Buffer.concat(chunks)),
      contentType: res.headers['content-type'] ?? null,
      fileName: fileNameFrom(url, res.headers['content-disposition']),
    };
  }
};
