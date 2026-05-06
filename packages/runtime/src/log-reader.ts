/**
 * Log reader for a running Hybris server.
 *
 * Reads log files from a configured directory (typically `${HYBRIS_HOME}/log`).
 * Handles plain `.log` files and gzipped rotated logs (`.log.gz`).
 *
 * Features:
 *  - True backward seek for tail-mode on plain files (avoid full scan of GB logs)
 *  - Hybris log line parser (Wrapper outer + Log4j inner formats, ANSI-aware)
 *  - Multi-line stacktrace grouping into single logical entries
 *  - Time-range filtering (since/until)
 *  - Follow mode via byte offsets (stateless tail -f equivalent)
 *  - Cross-file correlation around a timestamp anchor
 *
 * Path safety: all user-supplied file names are resolved relative to the
 * configured root and rejected if they escape it (path traversal protection).
 */

import {
  promises as fs,
  createReadStream,
  Stats,
  Dirent,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import { resolve, relative, sep, join, basename } from 'path';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogReaderConfig {
  /** Absolute path to the Hybris log root, e.g. `/.../hybris/log`. */
  rootPath: string;
  /** Hard cap on bytes returned in a single read response. Default 1 MiB. */
  maxBytes?: number;
  /** Hard cap on number of entries returned. Default 5000. */
  maxEntries?: number;
}

export interface LogFileInfo {
  /** Path relative to the log root (the value to pass back to other tools). */
  path: string;
  /** Size in bytes (uncompressed for `.log`, compressed for `.gz`). */
  size: number;
  /** Last modification time (ISO-8601). */
  modified: string;
  /** True if this is a gzipped rotated log. */
  gzipped: boolean;
}

export interface ParsedLogEntry {
  /** 1-based line number of the entry's first line within the SCANNED region.
   * For tail-seek reads this is relative to the scanned chunk, not the file. */
  firstLineNum: number;
  /** Number of source lines this entry spans (>1 for stacktraces). */
  lineCount: number;
  /** ISO-8601 timestamp parsed from the entry, if recognizable. */
  timestamp?: string;
  /** Log level (ERROR | WARN | INFO | DEBUG | TRACE | FATAL). */
  level?: string;
  /** Thread name if present (e.g. "hybrisHTTP18", "main"). */
  thread?: string;
  /** Logger / class name if present. */
  logger?: string;
  /** Message portion without prefix metadata. */
  message: string;
  /** Full raw text including continuation lines (e.g. stacktrace). */
  raw: string;
  /** True if the entry has continuation lines (stacktrace / multi-line msg). */
  multiLine: boolean;
}

export interface ReadLogOptions {
  /** Number of entries to return (capped by maxEntries). Default 500. */
  entries?: number;
  /** True (default) = tail (last N entries). False = read from start. */
  fromEnd?: boolean;
  /** Regex applied to full entry text (incl. stacktrace continuation). */
  grep?: string;
  /** ISO timestamp lower bound (entries with timestamp < since are skipped). */
  since?: string;
  /** ISO timestamp upper bound (entries with timestamp > until are skipped). */
  until?: string;
  /** Include structured `entries` array in response. Default false. */
  parsed?: boolean;
  /** FOLLOW MODE: read from this byte offset to EOF (stateless tail -f). */
  fromByteOffset?: number;
}

export interface ReadLogResult {
  path: string;
  /** Total entries scanned (omitted if tail-seek skipped part of the file). */
  totalEntries?: number;
  returnedEntries: number;
  truncated: boolean;
  content: string;
  /** Structured entries (only when options.parsed = true). */
  entries?: ParsedLogEntry[];
  /** Pass back as `fromByteOffset` to follow new content. Omitted for .gz. */
  nextByteOffset?: number;
  /** Byte offset where the scan started (useful for tail mode). */
  scanStartByte?: number;
}

export interface SearchHit {
  path: string;
  /** First line number of the matched entry (1-based). */
  line: number;
  timestamp?: string;
  level?: string;
  /** Full entry text including any stacktrace continuation. */
  text: string;
}

export interface SearchLogsOptions {
  subdir?: string;
  filenameHint?: string;
  includeGz?: boolean;
  maxHits?: number;
  since?: string;
  until?: string;
}

export interface SearchLogsResult {
  pattern: string;
  totalHits: number;
  truncated: boolean;
  hits: SearchHit[];
}

export interface CorrelateLogsOptions {
  /** Files to correlate (relative paths). */
  paths: string[];
  /** ISO-8601 timestamp OR regex pattern to find anchor in `anchorPath`. */
  anchor: string;
  /** Window in milliseconds around anchor. Default 5000 (±5s). */
  windowMs?: number;
  /** When `anchor` is a regex, which file to search (default: paths[0]). */
  anchorPath?: string;
}

export interface CorrelateLogsResult {
  anchor: {
    timestamp: string;
    source?: string;
    matchedLine?: number;
    matchedText?: string;
  };
  windowMs: number;
  totalEntries: number;
  truncated: boolean;
  entries: Array<{ path: string } & ParsedLogEntry>;
}

// ---------------------------------------------------------------------------
// Hybris log line parsing
// ---------------------------------------------------------------------------

/** Outer Wrapper format:
 *  `INFO   | jvm 1    | main    | yyyy/MM/dd HH:mm:ss.SSS | <inner>` */
const WRAPPER_RE =
  /^(STATUS|INFO|WARN|ERROR|DEBUG|FATAL|FINE|FINEST)\s*\|\s*\S+\s+\S+\s*\|\s*(\S+)\s*\|\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s*\|\s*(.*)$/;

/** Inner Log4j-ish format:
 *  `WARN  [hybrisHTTP18] [com.foo.Bar] message` (may be ANSI-colored). */
const INNER_RE =
  /^(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/;

/** Standalone Log4j format:
 *  `yyyy-MM-dd HH:mm:ss,SSS LEVEL [thread] [class] message` */
const STD_RE =
  /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3})\s+(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s+\[([^\]]+)\]\s+\[?([^\]\s]+)\]?\s*(.*)$/;

/** Tomcat access log: `1.2.3.4 - user [22/Apr/2026:08:36:58 +0200] "GET ..." 200 1234` */
const ACCESS_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\]\s+"([^"]*)"\s+(\d+)\s+(\S+)/;

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** Strip ANSI escape sequences (Hybris colors stack trace markers). */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function parseWrapperTs(s: string): string | undefined {
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}`;
}

function parseStdTs(s: string): string | undefined {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}`;
}

/**
 * Parse a single line. Returns null if the line doesn't look like the START
 * of a log entry (so it's likely a continuation: stacktrace, "Caused by:", etc.).
 */
export function parseHybrisLine(
  rawLine: string
): Omit<ParsedLogEntry, 'firstLineNum' | 'lineCount' | 'raw' | 'multiLine'> | null {
  // 1. Wrapper format (most tomcat console-*.log lines)
  const wrap = rawLine.match(WRAPPER_RE);
  if (wrap) {
    const [, outerLevel, thread, ts, inner] = wrap;
    const innerStripped = stripAnsi(inner);
    const innerMatch = innerStripped.match(INNER_RE);
    if (innerMatch) {
      const [, innerLevel, innerThread, logger, msg] = innerMatch;
      return {
        timestamp: parseWrapperTs(ts),
        level: innerLevel,
        thread: innerThread,
        logger,
        message: msg,
      };
    }
    return {
      timestamp: parseWrapperTs(ts),
      level: outerLevel,
      thread,
      message: innerStripped,
    };
  }

  const stripped = stripAnsi(rawLine);

  // 2. Standalone Log4j format
  const std = stripped.match(STD_RE);
  if (std) {
    const [, ts, level, thread, logger, msg] = std;
    return {
      timestamp: parseStdTs(ts),
      level,
      thread,
      logger,
      message: msg,
    };
  }

  // 3. Bare inner format (some logs have no outer timestamp)
  const inner = stripped.match(INNER_RE);
  if (inner) {
    const [, level, thread, logger, msg] = inner;
    return { level, thread, logger, message: msg };
  }

  // 4. Tomcat access log (no level, but has timestamp + standalone semantics)
  const access = stripped.match(ACCESS_RE);
  if (access) {
    const [, , dd, mon, yyyy, hh, mm, ss, , request, status] = access;
    const ts = MONTH_MAP[mon]
      ? `${yyyy}-${MONTH_MAP[mon]}-${dd}T${hh}:${mm}:${ss}.000`
      : undefined;
    return {
      timestamp: ts,
      level: status.startsWith('5') ? 'ERROR' : status.startsWith('4') ? 'WARN' : 'INFO',
      message: `${request} → ${status}`,
    };
  }

  return null;
}

/** True for lines that should be treated as continuation of the previous entry. */
function isContinuationLine(line: string): boolean {
  const stripped = stripAnsi(line);
  if (/^\s*at\s+\w/.test(stripped)) return true;       // "  at com.foo.Bar(...)"
  if (/^(Caused by|Suppressed):/.test(stripped)) return true;
  if (/^\s*\.\.\.\s+\d+\s+more\s*$/.test(stripped)) return true;
  if (/^\s+/.test(stripped) && stripped.trim().length > 0) return true; // any indented line
  return false;
}

// ---------------------------------------------------------------------------
// LogReader
// ---------------------------------------------------------------------------

export class LogReader {
  private static readonly DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MiB
  private static readonly DEFAULT_MAX_ENTRIES = 5000;
  private static readonly TAIL_SEEK_CHUNK = 64 * 1024;
  /** Reserve this many lines per requested entry when seeking (stacktrace headroom). */
  private static readonly TAIL_SEEK_LINE_MULTIPLIER = 8;

  private readonly rootPath: string;
  private readonly maxBytes: number;
  private readonly maxEntries: number;

  constructor(config: LogReaderConfig) {
    this.rootPath = resolve(config.rootPath);
    this.maxBytes = config.maxBytes ?? LogReader.DEFAULT_MAX_BYTES;
    this.maxEntries = config.maxEntries ?? LogReader.DEFAULT_MAX_ENTRIES;
  }

  /** Resolve a user-supplied relative path; throws on traversal escape. */
  private safeResolve(relativePath: string): string {
    const normalized = relativePath.replace(/^[/\\]+/, '');
    const absolute = resolve(this.rootPath, normalized);
    const rel = relative(this.rootPath, absolute);
    if (rel.startsWith('..') || rel === '' || rel.split(sep).includes('..')) {
      throw new Error(`Path escapes log root: ${relativePath}`);
    }
    return absolute;
  }

  private isLogFile(name: string): boolean {
    return /\.log(\.\d+)?(\.gz)?$/i.test(name) || /\.txt$/i.test(name);
  }

  // ---- listing ----

  async listLogs(subdir?: string): Promise<LogFileInfo[]> {
    const startDir = subdir ? this.safeResolve(subdir) : this.rootPath;
    const results: LogFileInfo[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && this.isLogFile(entry.name)) {
          let stat: Stats;
          try {
            stat = await fs.stat(full);
          } catch {
            continue;
          }
          results.push({
            path: relative(this.rootPath, full),
            size: stat.size,
            modified: stat.mtime.toISOString(),
            gzipped: entry.name.toLowerCase().endsWith('.gz'),
          });
        }
      }
    };

    await walk(startDir);
    results.sort((a, b) => (a.modified < b.modified ? 1 : -1));
    return results;
  }

  // ---- low-level streaming ----

  private openLineStream(absolutePath: string, startByte = 0): {
    lines: AsyncIterable<string>;
    close: () => void;
  } {
    const isGz = absolutePath.toLowerCase().endsWith('.gz');
    const fileStream = createReadStream(
      absolutePath,
      isGz ? undefined : { start: startByte }
    );
    const source: Readable = isGz ? fileStream.pipe(createGunzip()) : fileStream;
    const rl = createInterface({ input: source, crlfDelay: Infinity });
    return {
      lines: rl,
      close: () => {
        rl.close();
        fileStream.destroy();
      },
    };
  }

  /**
   * For non-gz files: find a byte offset such that streaming forward yields
   * at least `targetLines` complete lines. Reads in 64 KB chunks from the end
   * counting newlines until enough are seen, then advances past the next
   * newline boundary so the stream starts on a clean line.
   *
   * Returns 0 if file is small enough to scan fully.
   */
  private findTailOffsetSync(absolutePath: string, fileSize: number, targetLines: number): number {
    if (fileSize === 0) return 0;
    const fd = openSync(absolutePath, 'r');
    try {
      let offset = fileSize;
      let newlines = 0;
      const buf = Buffer.alloc(LogReader.TAIL_SEEK_CHUNK);

      while (offset > 0 && newlines <= targetLines) {
        const chunkSize = Math.min(LogReader.TAIL_SEEK_CHUNK, offset);
        offset -= chunkSize;
        const bytesRead = readSync(fd, buf, 0, chunkSize, offset);
        for (let i = 0; i < bytesRead; i++) {
          if (buf[i] === 0x0a) newlines++;
        }
      }
      if (offset === 0) return 0;

      // Advance to the byte AFTER the next newline → clean line boundary.
      const probe = Buffer.alloc(1);
      while (offset < fileSize) {
        const n = readSync(fd, probe, 0, 1, offset);
        offset++;
        if (n === 0 || probe[0] === 0x0a) break;
      }
      return offset;
    } finally {
      closeSync(fd);
    }
  }

  // ---- entry iteration (multi-line stacktrace grouping) ----

  /**
   * Iterate parsed entries from a line stream. Lines that don't parse as a
   * new entry AND look like a continuation (indented, "at ...", "Caused by:")
   * are appended to the previous entry. Standalone unparseable lines (e.g.
   * banners, comments) become single-line entries.
   */
  private async *iterEntries(
    lineStream: AsyncIterable<string>,
    startLineNum = 1
  ): AsyncGenerator<ParsedLogEntry> {
    let lineNum = startLineNum - 1;
    let current: ParsedLogEntry | null = null;

    for await (const line of lineStream) {
      lineNum++;
      const parsed = parseHybrisLine(line);

      if (parsed) {
        if (current) yield current;
        current = {
          firstLineNum: lineNum,
          lineCount: 1,
          ...parsed,
          raw: line,
          multiLine: false,
        };
        continue;
      }

      if (current && isContinuationLine(line)) {
        current.raw += '\n' + line;
        current.lineCount++;
        current.multiLine = true;
        continue;
      }

      // Unparseable, non-continuation line: emit current, start a fresh entry.
      if (current) yield current;
      current = {
        firstLineNum: lineNum,
        lineCount: 1,
        message: line,
        raw: line,
        multiLine: false,
      };
    }
    if (current) yield current;
  }

  // ---- public read methods ----

  async readLog(relPath: string, options: ReadLogOptions = {}): Promise<ReadLogResult> {
    const absolute = this.safeResolve(relPath);
    const isGz = absolute.toLowerCase().endsWith('.gz');
    const stat = await fs.stat(absolute);

    // ---- FOLLOW MODE ----
    if (options.fromByteOffset !== undefined) {
      if (isGz) {
        throw new Error('Follow mode (fromByteOffset) is not supported for .gz files');
      }
      const start = Math.max(0, Math.min(options.fromByteOffset, stat.size));
      return this.readByteRange(relPath, absolute, start, stat.size, options);
    }

    const requested = Math.min(options.entries ?? 500, this.maxEntries);
    const fromEnd = options.fromEnd !== false;
    const grep = options.grep ? this.compileRegex(options.grep) : null;
    const since = options.since ? Date.parse(options.since) : NaN;
    const until = options.until ? Date.parse(options.until) : NaN;

    // True tail seek: only safe when no filtering is required (filters might
    // discard most entries and force us to read further back).
    let scanStartByte = 0;
    if (
      fromEnd &&
      !isGz &&
      !grep &&
      isNaN(since) &&
      isNaN(until)
    ) {
      scanStartByte = this.findTailOffsetSync(
        absolute,
        stat.size,
        requested * LogReader.TAIL_SEEK_LINE_MULTIPLIER
      );
    }

    const { lines, close } = this.openLineStream(absolute, scanStartByte);
    const collected: ParsedLogEntry[] = [];
    let totalEntries = 0;
    let bytes = 0;
    let truncated = false;

    try {
      for await (const entry of this.iterEntries(lines, 1)) {
        totalEntries++;

        if (!isNaN(since) && entry.timestamp && Date.parse(entry.timestamp) < since) continue;
        if (!isNaN(until) && entry.timestamp && Date.parse(entry.timestamp) > until) continue;
        if (grep && !grep.test(entry.raw)) continue;

        if (fromEnd) {
          collected.push(entry);
          if (collected.length > requested) collected.shift();
        } else {
          if (collected.length >= requested) {
            truncated = true;
            close();
            break;
          }
          bytes += Buffer.byteLength(entry.raw, 'utf8') + 1;
          if (bytes > this.maxBytes) {
            truncated = true;
            close();
            break;
          }
          collected.push(entry);
        }
      }
    } finally {
      close();
    }

    // Tail mode: enforce maxBytes by trimming oldest entries.
    if (fromEnd) {
      let total = collected.reduce(
        (acc, e) => acc + Buffer.byteLength(e.raw, 'utf8') + 1,
        0
      );
      while (total > this.maxBytes && collected.length > 0) {
        const removed = collected.shift()!;
        total -= Buffer.byteLength(removed.raw, 'utf8') + 1;
        truncated = true;
      }
    }

    const result: ReadLogResult = {
      path: relPath,
      // totalEntries is meaningful only when we read the whole file.
      totalEntries: scanStartByte === 0 ? totalEntries : undefined,
      returnedEntries: collected.length,
      truncated,
      content: collected.map((e) => e.raw).join('\n'),
      scanStartByte,
    };
    if (options.parsed) result.entries = collected;
    if (!isGz) result.nextByteOffset = stat.size;
    return result;
  }

  /** Stream a byte range as entries (used by follow mode). */
  private async readByteRange(
    relPath: string,
    absolutePath: string,
    startByte: number,
    endByte: number,
    options: ReadLogOptions
  ): Promise<ReadLogResult> {
    if (startByte >= endByte) {
      return {
        path: relPath,
        returnedEntries: 0,
        truncated: false,
        content: '',
        nextByteOffset: endByte,
        scanStartByte: startByte,
      };
    }

    const grep = options.grep ? this.compileRegex(options.grep) : null;
    const since = options.since ? Date.parse(options.since) : NaN;
    const until = options.until ? Date.parse(options.until) : NaN;
    const limit = Math.min(options.entries ?? this.maxEntries, this.maxEntries);

    const { lines, close } = this.openLineStream(absolutePath, startByte);
    const collected: ParsedLogEntry[] = [];
    let bytes = 0;
    let truncated = false;

    try {
      for await (const entry of this.iterEntries(lines, 1)) {
        if (!isNaN(since) && entry.timestamp && Date.parse(entry.timestamp) < since) continue;
        if (!isNaN(until) && entry.timestamp && Date.parse(entry.timestamp) > until) continue;
        if (grep && !grep.test(entry.raw)) continue;

        bytes += Buffer.byteLength(entry.raw, 'utf8') + 1;
        if (collected.length >= limit || bytes > this.maxBytes) {
          truncated = true;
          close();
          break;
        }
        collected.push(entry);
      }
    } finally {
      close();
    }

    const result: ReadLogResult = {
      path: relPath,
      returnedEntries: collected.length,
      truncated,
      content: collected.map((e) => e.raw).join('\n'),
      nextByteOffset: endByte,
      scanStartByte: startByte,
    };
    if (options.parsed) result.entries = collected;
    return result;
  }

  async tailLatest(nameHint: string, entries = 200): Promise<ReadLogResult> {
    const all = await this.listLogs();
    const hint = nameHint.toLowerCase();
    const candidates = all.filter(
      (f) => !f.gzipped && basename(f.path).toLowerCase().includes(hint)
    );
    if (candidates.length === 0) {
      throw new Error(`No active (non-gzipped) log file matching: ${nameHint}`);
    }
    return this.readLog(candidates[0].path, { entries, fromEnd: true });
  }

  // ---- search ----

  async searchLogs(
    pattern: string,
    options: SearchLogsOptions = {}
  ): Promise<SearchLogsResult> {
    const regex = this.compileRegex(pattern);
    const maxHits = Math.min(options.maxHits ?? 200, 1000);
    const since = options.since ? Date.parse(options.since) : NaN;
    const until = options.until ? Date.parse(options.until) : NaN;
    const files = await this.listLogs(options.subdir);

    const hits: SearchHit[] = [];
    let totalHits = 0;
    let truncated = false;

    for (const file of files) {
      if (!options.includeGz && file.gzipped) continue;
      if (
        options.filenameHint &&
        !basename(file.path).toLowerCase().includes(options.filenameHint.toLowerCase())
      ) {
        continue;
      }

      const absolute = this.safeResolve(file.path);
      const { lines, close } = this.openLineStream(absolute);
      try {
        for await (const entry of this.iterEntries(lines, 1)) {
          if (!isNaN(since) && entry.timestamp && Date.parse(entry.timestamp) < since) continue;
          if (!isNaN(until) && entry.timestamp && Date.parse(entry.timestamp) > until) continue;
          if (!regex.test(entry.raw)) continue;

          totalHits++;
          if (hits.length < maxHits) {
            hits.push({
              path: file.path,
              line: entry.firstLineNum,
              timestamp: entry.timestamp,
              level: entry.level,
              text: entry.raw,
            });
          } else {
            truncated = true;
          }
        }
      } finally {
        close();
      }
    }

    return { pattern, totalHits, truncated, hits };
  }

  // ---- correlation ----

  /**
   * Cross-file correlation: collect entries from `paths` whose timestamps fall
   * within ±`windowMs` of `anchor`. The anchor can be either an ISO-8601
   * timestamp or a regex pattern; for regex, the first matching entry in
   * `anchorPath` (or `paths[0]`) supplies the timestamp.
   *
   * Note: assumes entries are roughly time-ordered within each file. Uses
   * early break once we cross the upper bound to avoid scanning whole logs.
   */
  async correlateLogs(options: CorrelateLogsOptions): Promise<CorrelateLogsResult> {
    if (!options.paths || options.paths.length === 0) {
      throw new Error('At least one path is required for correlation');
    }
    const windowMs = options.windowMs ?? 5000;

    // ---- resolve anchor → epoch ms + metadata ----
    const directParse = Date.parse(options.anchor);
    let anchorTs: number;
    let anchorMeta: CorrelateLogsResult['anchor'];

    if (!isNaN(directParse)) {
      anchorTs = directParse;
      anchorMeta = { timestamp: new Date(anchorTs).toISOString() };
    } else {
      const searchPath = options.anchorPath ?? options.paths[0];
      const regex = this.compileRegex(options.anchor);
      const absolute = this.safeResolve(searchPath);
      const { lines, close } = this.openLineStream(absolute);
      let found: ParsedLogEntry | null = null;
      try {
        for await (const entry of this.iterEntries(lines, 1)) {
          if (regex.test(entry.raw) && entry.timestamp) {
            found = entry;
            break;
          }
        }
      } finally {
        close();
      }
      if (!found || !found.timestamp) {
        throw new Error(
          `Anchor pattern "${options.anchor}" not found (or matched entry has no timestamp) in ${searchPath}`
        );
      }
      anchorTs = Date.parse(found.timestamp);
      anchorMeta = {
        timestamp: found.timestamp,
        source: searchPath,
        matchedLine: found.firstLineNum,
        matchedText: found.raw.split('\n')[0],
      };
    }

    const lo = anchorTs - windowMs;
    const hi = anchorTs + windowMs;
    const merged: Array<{ path: string } & ParsedLogEntry> = [];

    for (const p of options.paths) {
      const absolute = this.safeResolve(p);
      const { lines, close } = this.openLineStream(absolute);
      let pastWindow = false;
      try {
        for await (const entry of this.iterEntries(lines, 1)) {
          if (!entry.timestamp) continue;
          const t = Date.parse(entry.timestamp);
          if (t < lo) continue;
          if (t > hi) {
            // Early break is safe for monotonically-ordered logs (Hybris
            // wrapper is single-writer). Allow a tiny overshoot for jitter.
            if (pastWindow) break;
            pastWindow = true;
            continue;
          }
          pastWindow = false;
          merged.push({ path: p, ...entry });
        }
      } finally {
        close();
      }
    }

    merged.sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));

    const cap = Math.min(this.maxEntries, 2000);
    const truncated = merged.length > cap;
    const entries = truncated ? merged.slice(0, cap) : merged;

    return {
      anchor: anchorMeta,
      windowMs,
      totalEntries: merged.length,
      truncated,
      entries,
    };
  }

  // ---- helpers ----

  private compileRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern);
    } catch (err) {
      throw new Error(
        `Invalid regex pattern "${pattern}": ${(err as Error).message}`
      );
    }
  }
}
