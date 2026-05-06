/**
 * Azure Blob Storage client for downloading Hybris log files.
 *
 * Mirrors the local layout: blob names are identical to local relative paths
 * (e.g. `tomcat/console-20260506.log`, `tomcat/access..2026-05-06.log`,
 * `integration_log.log`, `console-20260506.log.gz`). Downloaded blobs are
 * cached to a local directory preserving their layout, so the existing
 * `LogReader` (and therefore `read_log`/`search_logs`/`correlate_logs`) can
 * be pointed at the cache and Just Work — no parsing changes required.
 *
 * Two auth modes:
 *   1. SAS URL  — container-scoped, e.g.
 *        https://acc.blob.core.windows.net/abs-logs?sv=...&sig=...
 *      Configure via:
 *        AZURE_BLOB_LOG_SAS_URL
 *   2. Shared Key (Account Key) — HMAC-SHA256 signing per request.
 *      Configure via:
 *        AZURE_BLOB_LOG_ACCOUNT_NAME
 *        AZURE_BLOB_LOG_ACCOUNT_KEY        (base64 account key)
 *        AZURE_BLOB_LOG_CONTAINER          (container name)
 *        AZURE_BLOB_LOG_ENDPOINT           (optional; default
 *                                            https://<account>.blob.core.windows.net)
 *
 * Cache directory:
 *   AZURE_BLOB_LOG_CACHE_DIR              (default <HYBRIS_LOG_PATH>/.azure-cache)
 */

import { promises as fs, createWriteStream } from 'fs';
import { dirname, join, resolve, relative, sep } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createHmac } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SasAuthConfig {
  sasUrl: string;
}

export interface SharedKeyAuthConfig {
  accountName: string;
  accountKey: string;
  container: string;
  endpoint?: string;
}

export type AzureBlobLogClientConfig = (SasAuthConfig | SharedKeyAuthConfig) & {
  cacheDir: string;
};

export interface AzureLogBlobInfo {
  path: string;
  size: number;
  modified: string;
  gzipped: boolean;
  cached: boolean;
  cachedSize?: number;
  localPath?: string;
}

export interface DownloadResult {
  blob: string;
  localPath: string;
  bytesDownloaded: number;
  skipped: boolean;
}

type Auth =
  | { kind: 'sas'; sasQuery: string }
  | { kind: 'sharedKey'; accountName: string; accountKey: Buffer };

const STORAGE_API_VERSION = '2024-11-04';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AzureBlobLogClient {
  private readonly containerBaseUrl: string;
  private readonly auth: Auth;
  private readonly cacheDir: string;

  constructor(cfg: AzureBlobLogClientConfig) {
    if (!cfg.cacheDir) throw new Error('cacheDir is required');
    this.cacheDir = resolve(cfg.cacheDir);

    if ('sasUrl' in cfg && cfg.sasUrl) {
      const u = new URL(cfg.sasUrl);
      if (!u.search) {
        throw new Error('sasUrl must include a SAS query string (?sv=...&sig=...)');
      }
      this.auth = { kind: 'sas', sasQuery: u.search.replace(/^\?/, '') };
      u.search = '';
      u.pathname = u.pathname.replace(/\/+$/, '');
      this.containerBaseUrl = u.toString();
    } else if ('accountName' in cfg && cfg.accountName && cfg.accountKey && cfg.container) {
      const endpoint = (cfg.endpoint ?? `https://${cfg.accountName}.blob.core.windows.net`)
        .replace(/\/+$/, '');
      const container = cfg.container.replace(/^\/+|\/+$/g, '');
      this.containerBaseUrl = `${endpoint}/${container}`;
      let key: Buffer;
      try {
        key = Buffer.from(cfg.accountKey, 'base64');
      } catch {
        throw new Error('accountKey must be a base64 string');
      }
      if (key.length === 0) throw new Error('accountKey is empty after base64 decode');
      this.auth = { kind: 'sharedKey', accountName: cfg.accountName, accountKey: key };
    } else {
      throw new Error(
        'Azure auth not configured: provide either sasUrl, or accountName + accountKey + container'
      );
    }
  }

  // ---- listing ----

  async listBlobs(prefix?: string): Promise<AzureLogBlobInfo[]> {
    const blobs: AzureLogBlobInfo[] = [];
    let marker: string | undefined;

    do {
      const url = this.containerListUrl(prefix, marker);
      const res = await this.authedFetch(url, 'GET');
      if (!res.ok) {
        throw new Error(
          `Azure list failed (${res.status} ${res.statusText}): ${await res.text()}`
        );
      }
      const xml = await res.text();
      const page = parseListBlobsXml(xml);
      blobs.push(...page.blobs);
      marker = page.nextMarker;
    } while (marker);

    const filtered = blobs.filter((b) =>
      /\.(log(\.\d+)?(\.gz)?|txt|gz)$/i.test(b.path)
    );

    await Promise.all(
      filtered.map(async (b) => {
        const local = join(this.cacheDir, b.path);
        try {
          const st = await fs.stat(local);
          b.cached = true;
          b.cachedSize = st.size;
          b.localPath = local;
        } catch {
          b.cached = false;
        }
      })
    );

    filtered.sort((a, b) => (a.modified < b.modified ? 1 : -1));
    return filtered;
  }

  // ---- download ----

  async downloadBlob(
    blobPath: string,
    opts: { force?: boolean } = {}
  ): Promise<DownloadResult> {
    const safeRel = this.safeRel(blobPath);
    const localPath = resolve(this.cacheDir, safeRel);
    const url = this.blobUrl(safeRel);

    if (!opts.force) {
      try {
        const head = await this.authedFetch(url, 'HEAD');
        if (head.ok) {
          const remoteSize = Number(head.headers.get('content-length') ?? '0');
          try {
            const local = await fs.stat(localPath);
            if (remoteSize > 0 && local.size === remoteSize) {
              return {
                blob: safeRel,
                localPath,
                bytesDownloaded: 0,
                skipped: true,
              };
            }
          } catch { /* not cached yet — fall through */ }
        }
      } catch { /* swallow HEAD failures and let GET surface them */ }
    }

    await fs.mkdir(dirname(localPath), { recursive: true });
    const res = await this.authedFetch(url, 'GET');
    if (!res.ok || !res.body) {
      throw new Error(
        `Azure download failed (${res.status} ${res.statusText}): ${await res.text()}`
      );
    }

    const ws = createWriteStream(localPath);
    await pipeline(Readable.fromWeb(res.body as never), ws);
    const st = await fs.stat(localPath);

    return {
      blob: safeRel,
      localPath,
      bytesDownloaded: st.size,
      skipped: false,
    };
  }

  // ---- helpers ----

  resolveLocalPath(blobPath: string): string {
    return resolve(this.cacheDir, this.safeRel(blobPath));
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  // ---- internals ----

  private containerListUrl(prefix: string | undefined, marker?: string): string {
    const params = new URLSearchParams({ restype: 'container', comp: 'list' });
    if (prefix) params.set('prefix', prefix);
    if (marker) params.set('marker', marker);
    return this.applyAuthToUrl(`${this.containerBaseUrl}?${params.toString()}`);
  }

  private blobUrl(safeRel: string): string {
    const encoded = safeRel
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return this.applyAuthToUrl(`${this.containerBaseUrl}/${encoded}`);
  }

  private applyAuthToUrl(url: string): string {
    if (this.auth.kind !== 'sas') return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${this.auth.sasQuery}`;
  }

  private async authedFetch(url: string, method: 'GET' | 'HEAD'): Promise<Response> {
    if (this.auth.kind === 'sas') {
      return fetch(url, { method });
    }
    const headers = this.sharedKeyHeaders(method, url);
    return fetch(url, { method, headers });
  }

  private sharedKeyHeaders(method: 'GET' | 'HEAD', fullUrl: string): Record<string, string> {
    if (this.auth.kind !== 'sharedKey') return {};
    const date = new Date().toUTCString();
    const xms: Record<string, string> = {
      'x-ms-date': date,
      'x-ms-version': STORAGE_API_VERSION,
    };
    const stringToSign = buildStringToSign(method, fullUrl, this.auth.accountName, xms);
    const sig = createHmac('sha256', this.auth.accountKey).update(stringToSign, 'utf8').digest('base64');
    return {
      ...xms,
      Authorization: `SharedKey ${this.auth.accountName}:${sig}`,
    };
  }

  private safeRel(blobPath: string): string {
    if (!blobPath) throw new Error('blob path is required');
    const normalized = blobPath.replace(/^[/\\]+/, '');
    const absolute = resolve(this.cacheDir, normalized);
    const rel = relative(this.cacheDir, absolute);
    if (rel.startsWith('..') || rel === '' || rel.split(sep).includes('..')) {
      throw new Error(`Path escapes cache root: ${blobPath}`);
    }
    return normalized;
  }
}

// ---------------------------------------------------------------------------
// SharedKey signing
// https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key
// ---------------------------------------------------------------------------

function buildStringToSign(
  method: string,
  fullUrl: string,
  accountName: string,
  xmsHeaders: Record<string, string>
): string {
  const u = new URL(fullUrl);

  const xmsByLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(xmsHeaders)) {
    xmsByLower[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  }
  const canonicalizedHeaders = Object.keys(xmsByLower)
    .filter((k) => k.startsWith('x-ms-'))
    .sort()
    .map((k) => `${k}:${xmsByLower[k]}`)
    .join('\n');

  const queryByLower = new Map<string, string[]>();
  for (const [k, v] of u.searchParams) {
    const lk = k.toLowerCase();
    const arr = queryByLower.get(lk) ?? [];
    arr.push(v);
    queryByLower.set(lk, arr);
  }
  const queryLines = [...queryByLower.keys()]
    .sort()
    .map((k) => `${k}:${queryByLower.get(k)!.slice().sort().join(',')}`);
  const canonicalizedResource = [`/${accountName}${u.pathname}`, ...queryLines].join('\n');

  const lines = [
    method.toUpperCase(),
    '', // Content-Encoding
    '', // Content-Language
    '', // Content-Length (empty for requests without a body in API >= 2015-02-21)
    '', // Content-MD5
    '', // Content-Type
    '', // Date (empty because x-ms-date is set)
    '', // If-Modified-Since
    '', // If-Match
    '', // If-None-Match
    '', // If-Unmodified-Since
    '', // Range
    canonicalizedHeaders,
    canonicalizedResource,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Minimal XML parsing for ListBlobs response — avoids adding a dep.
// Format: https://learn.microsoft.com/en-us/rest/api/storageservices/list-blobs
// ---------------------------------------------------------------------------

interface ListPage {
  blobs: AzureLogBlobInfo[];
  nextMarker?: string;
}

function parseListBlobsXml(xml: string): ListPage {
  const blobs: AzureLogBlobInfo[] = [];
  const blobRe = /<Blob>([\s\S]*?)<\/Blob>/g;
  let m: RegExpExecArray | null;
  while ((m = blobRe.exec(xml))) {
    const body = m[1];
    const name = extractTag(body, 'Name');
    if (!name) continue;
    const size = Number(extractTag(body, 'Content-Length') ?? '0');
    const lm = extractTag(body, 'Last-Modified');
    blobs.push({
      path: name,
      size,
      modified: lm ? safeIso(lm) : '',
      gzipped: name.toLowerCase().endsWith('.gz'),
      cached: false,
    });
  }
  const nextMarker = extractTag(xml, 'NextMarker');
  return { blobs, nextMarker: nextMarker ? nextMarker : undefined };
}

function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  if (!m) return undefined;
  return decodeXmlEntities(m[1]).trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeIso(rfc1123: string): string {
  const t = Date.parse(rfc1123);
  return Number.isNaN(t) ? rfc1123 : new Date(t).toISOString();
}
