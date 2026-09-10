import dns from 'node:dns/promises';
import net from 'node:net';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { AppError } from '../http/errors.js';
import { extractFromHtml } from './html-to-text.js';

export interface FetchedDocument {
  title: string | null;
  text: string;
  contentType: string;
  finalUrl: string;
  bytes: number;
}

const TEXTUAL_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
  'text/markdown',
  'application/json',
];

/**
 * Server-side URL ingestion. The interesting part is not the fetch, it is the
 * refusal to fetch: an endpoint that takes a user URL and requests it from
 * inside the network is a textbook SSRF primitive. Guards applied here:
 *   - http/https only (no file:, no gopher:, no data:)
 *   - every resolved address is checked against private/loopback/link-local
 *     ranges, including after redirects
 *   - hard byte cap enforced while streaming, not after
 *   - request timeout
 */
export class UrlFetcher {
  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async fetchDocument(rawUrl: string): Promise<FetchedDocument> {
    const url = this.parseUrl(rawUrl);
    await this.assertPublicHost(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.fetch.timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          // Some sites reject an unidentified client. Be honest about who we are.
          'user-agent': 'AIKnowledgeInbox/1.0 (personal knowledge inbox)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'accept-language': 'en',
        },
      });

      // A redirect can land somewhere private even when the first host was fine.
      const finalUrl = new URL(response.url || url.toString());
      if (finalUrl.hostname !== url.hostname) await this.assertPublicHost(finalUrl.hostname);

      if (!response.ok) {
        throw new AppError(
          'fetch_failed',
          `The page returned HTTP ${response.status} (${response.statusText || 'error'}).`,
          { details: { url: url.toString(), status: response.status } },
        );
      }

      const contentType = (response.headers.get('content-type') ?? 'application/octet-stream')
        .split(';')[0]!
        .trim()
        .toLowerCase();

      if (!TEXTUAL_CONTENT_TYPES.includes(contentType)) {
        throw new AppError(
          'unsupported_content',
          `Cannot read "${contentType}" content. Only HTML, plain text, markdown and JSON pages are supported.`,
          { details: { url: url.toString(), contentType } },
        );
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (declaredLength > this.config.fetch.maxBytes) {
        throw new AppError(
          'payload_too_large',
          `That page is ${formatBytes(declaredLength)}, over the ${formatBytes(this.config.fetch.maxBytes)} limit.`,
          { details: { url: url.toString(), bytes: declaredLength } },
        );
      }

      const body = await this.readCapped(response, url.toString());
      const extracted =
        contentType === 'text/html' || contentType === 'application/xhtml+xml'
          ? extractFromHtml(body)
          : { title: null, text: body };

      if (extracted.text.trim().length === 0) {
        throw new AppError(
          'unsupported_content',
          'The page loaded but contained no readable text. It may render its content with JavaScript.',
          { details: { url: url.toString(), contentType } },
        );
      }

      this.logger.info('url fetched', {
        event: 'ingest.fetch',
        url: url.toString(),
        finalUrl: finalUrl.toString(),
        contentType,
        bytes: Buffer.byteLength(body),
        textChars: extracted.text.length,
      });

      return {
        title: extracted.title,
        text: extracted.text,
        contentType,
        finalUrl: finalUrl.toString(),
        bytes: Buffer.byteLength(body),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'fetch_failed',
          `The page did not respond within ${this.config.fetch.timeoutMs / 1000}s.`,
          { cause: error, details: { url: url.toString() } },
        );
      }
      throw new AppError('fetch_failed', `Could not load that URL: ${(error as Error).message}`, {
        cause: error,
        details: { url: url.toString() },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private parseUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw AppError.validation('That does not look like a valid URL.', { url: rawUrl });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw AppError.validation(`Unsupported URL scheme "${url.protocol}". Use http or https.`, {
        url: rawUrl,
      });
    }
    return url;
  }

  private async assertPublicHost(hostname: string): Promise<void> {
    if (this.config.fetch.allowPrivate) return;

    const addresses = net.isIP(hostname)
      ? [hostname]
      : await dns.lookup(hostname, { all: true }).then(
          (entries) => entries.map((entry) => entry.address),
          () => {
            throw new AppError('fetch_failed', `Could not resolve the host "${hostname}".`);
          },
        );

    for (const address of addresses) {
      if (isPrivateAddress(address)) {
        throw AppError.validation(
          `Refusing to fetch "${hostname}": it resolves to a private network address (${address}).`,
          { hostname, address },
        );
      }
    }
  }

  /** Enforces the byte cap while reading, so a lying content-length cannot exhaust memory. */
  private async readCapped(response: Response, url: string): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder('utf-8');
    const parts: string[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.config.fetch.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError(
          'payload_too_large',
          `That page exceeds the ${formatBytes(this.config.fetch.maxBytes)} download limit.`,
          { details: { url } },
        );
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  }
}

/** RFC1918, loopback, link-local, CGNAT, and the IPv6 equivalents. */
export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);

  if (version === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (version === 6) {
    const normalised = address.toLowerCase().replace(/^\[|\]$/g, '');
    if (normalised === '::1' || normalised === '::') return true;
    if (normalised.startsWith('fe80')) return true; // link-local
    if (/^f[cd]/.test(normalised)) return true; // unique local
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalised); // IPv4-mapped
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return false;
  }

  return false;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)}KB`;
  return `${bytes}B`;
}
