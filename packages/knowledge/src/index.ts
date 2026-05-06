#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { loadIndexes } from './indexes.js';
import { ripgrep } from './search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// HYBRIS_KB_ROOT must point at the knowledge-base directory containing
// `extensions/`, `index/`, and (optionally) `learnings.md`. By default we use
// the package root itself — the data folders ship inside this package.
// HYBRIS_BIN_PATH is the live Hybris source tree that ripgrep searches.
const PACKAGE_ROOT = join(__dirname, '..');
const KB_ROOT = process.env.HYBRIS_KB_ROOT || PACKAGE_ROOT;
const HYBRIS_BIN =
  process.env.HYBRIS_BIN_PATH ||
  '/Users/magdalenadabrowska/Documents/work/sniezka/sniezka2211jdk21/core-customize/hybris/bin';

function str(args: Record<string, unknown> | undefined, key: string, required = false): string | undefined {
  const v = args?.[key];
  if (v === undefined || v === null) {
    if (required) throw new Error(`${key} is required`);
    return undefined;
  }
  if (typeof v !== 'string') throw new Error(`${key} must be a string`);
  return v;
}

function num(args: Record<string, unknown> | undefined, key: string, def?: number): number | undefined {
  const v = args?.[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number') throw new Error(`${key} must be a number`);
  return v;
}

function bool(args: Record<string, unknown> | undefined, key: string, def = false): boolean {
  const v = args?.[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'boolean') throw new Error(`${key} must be a boolean`);
  return v;
}

function matchesQuery(name: string, query: string, fuzzy = true): boolean {
  if (!fuzzy) return name === query;
  return name.toLowerCase().includes(query.toLowerCase());
}

const TOOLS: Tool[] = [
  {
    name: 'hybris_kb_find_extension',
    description:
      'Find a Hybris extension by name. Returns metadata (path, requires, kinds, meta) and — if available — a Markdown summary from extensions/<name>.md. Use this when you need to understand what an extension does, what depends on it, or its high-level structure.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact or partial extension name (e.g., "sniezkacore", "commerceservices")' },
        include_summary: { type: 'boolean', description: 'Include Markdown summary if available (default: true)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hybris_kb_find_type',
    description:
      'Find a Hybris item type (from *-items.xml). Returns code, parent type (extends), deployment table, attribute count, sample attributes, defining extension, and source file. Use this for questions about domain entities (Order, Cart, Customer, custom types).',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Item type code (e.g., "Order", "Invoice", "B2BUnit")' },
        fuzzy: { type: 'boolean', description: 'Substring match (default: true)' },
        extension: { type: 'string', description: 'Optional filter by defining extension' },
        max: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'hybris_kb_find_bean',
    description:
      'Find a Spring bean by id or class. Searches both Spring XML config (*-spring*.xml). Returns bean id, class, parent, scope, abstract flag, defining extension, source file. Use this when looking for service implementations, populators, strategies, factories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Bean id or class FQN/short name (substring match)' },
        match: { type: 'string', enum: ['id', 'class', 'either'], description: 'Where to match (default: either)' },
        extension: { type: 'string', description: 'Optional filter by defining extension' },
        max: { type: 'number', description: 'Max results (default: 30)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'hybris_kb_find_dto',
    description:
      'Find a DTO/bean class from *-beans.xml (the data transfer beans, not Spring beans). Use this when looking for request/response data classes used by facades and OCC controllers.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'DTO class name or substring (e.g., "CartData", "ProductData")' },
        extension: { type: 'string', description: 'Optional filter' },
        max: { type: 'number', description: 'Max results (default: 30)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hybris_kb_find_interface',
    description:
      'Find a Service/Facade/Strategy/DAO/Resolver/Provider/Handler/Manager/Validator/Builder/Calculator/Converter/Populator/Notifier interface in src/. Returns interface name, kind, package, defining extension, source file.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Interface name or substring' },
        kind: {
          type: 'string',
          description: 'Optional filter: Service|Facade|Strategy|DAO|Resolver|Provider|Handler|Manager|Validator|Builder|Calculator|Converter|Populator|Notifier',
        },
        extension: { type: 'string', description: 'Optional filter by extension' },
        max: { type: 'number', description: 'Max results (default: 30)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hybris_kb_search_code',
    description:
      'Run ripgrep over the live Hybris source tree (HYBRIS_BIN_PATH). Returns matching lines with file path and line number. Use for keyword search when JSON indexes are not enough — e.g., finding usages, log strings, or code patterns. Prefer JSON-index tools when looking up types/beans/interfaces.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Regex pattern (ripgrep syntax)' },
        ext: { type: 'string', description: 'Optional defining extension to scope search to its directory' },
        glob: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional ripgrep glob filters (e.g., ["**/*.java", "**/*.xml"])',
        },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive match (default: false)' },
        max: { type: 'number', description: 'Max hits to return (default: 50, hard cap 200)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'hybris_kb_list_extensions',
    description:
      'List Hybris extensions discovered by the scanner. Optionally filter by name substring or section (platform/ext, custom, modules). Returns name, section, path, kinds.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optional substring filter on name' },
        section: { type: 'string', description: 'Optional section: platform/ext | custom | modules' },
        max: { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },
  {
    name: 'hybris_kb_get_summary',
    description:
      'Read the full Markdown summary for an extension from extensions/<name>.md. Use this when find_extension hints a summary exists and you need the full content.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact extension name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hybris_kb_learnings',
    description:
      'Read learnings.md — organic notes from past sessions (problem → root cause → fix → extension/area). Skim this when starting a non-trivial task; recent entries are at the top.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const server = new Server(
  { name: 'hybris-mcp-knowledge', version: pkg.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await dispatch(name, args ?? {});
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

async function dispatch(tool: string, args: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'hybris_kb_find_extension':
      return findExtension(str(args, 'name', true)!, bool(args, 'include_summary', true));
    case 'hybris_kb_find_type':
      return findType(str(args, 'code', true)!, bool(args, 'fuzzy', true), str(args, 'extension'), num(args, 'max', 20)!);
    case 'hybris_kb_find_bean':
      return findBean(str(args, 'query', true)!, (str(args, 'match') ?? 'either') as 'id' | 'class' | 'either', str(args, 'extension'), num(args, 'max', 30)!);
    case 'hybris_kb_find_dto':
      return findDto(str(args, 'name', true)!, str(args, 'extension'), num(args, 'max', 30)!);
    case 'hybris_kb_find_interface':
      return findInterface(str(args, 'name', true)!, str(args, 'kind'), str(args, 'extension'), num(args, 'max', 30)!);
    case 'hybris_kb_search_code':
      return searchCode(
        str(args, 'query', true)!,
        str(args, 'ext'),
        (args.glob as string[] | undefined) ?? undefined,
        bool(args, 'case_insensitive', false),
        Math.min(num(args, 'max', 50)!, 200)
      );
    case 'hybris_kb_list_extensions':
      return listExtensions(str(args, 'filter'), str(args, 'section'), num(args, 'max', 50)!);
    case 'hybris_kb_get_summary':
      return getSummary(str(args, 'name', true)!);
    case 'hybris_kb_learnings':
      return getLearnings();
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

function findExtension(name: string, includeSummary: boolean) {
  const idx = loadIndexes(KB_ROOT);
  const matches = idx.extensions.filter((e) => matchesQuery(e.name, name));
  if (matches.length === 0) return { hits: 0, suggestion: 'No extension found. Try hybris_kb_list_extensions with a broader filter.' };
  return {
    hits: matches.length,
    extensions: matches.slice(0, 10).map((e) => {
      const summaryPath = join(KB_ROOT, 'extensions', `${e.name}.md`);
      const summaryExists = existsSync(summaryPath);
      const out: Record<string, unknown> = {
        name: e.name,
        section: e.section,
        path: e.path,
        kinds: e.kinds,
        requires: e.requires,
        meta: e.meta,
        summary_available: summaryExists,
      };
      if (includeSummary && summaryExists) {
        out.summary = readFileSync(summaryPath, 'utf-8');
      }
      return out;
    }),
  };
}

function findType(code: string, fuzzy: boolean, ext: string | undefined, max: number) {
  const idx = loadIndexes(KB_ROOT);
  let matches = idx.items.filter((i) => matchesQuery(i.code, code, fuzzy));
  if (ext) matches = matches.filter((i) => i.extension === ext);
  return {
    hits: matches.length,
    items: matches.slice(0, max),
  };
}

function findBean(query: string, match: 'id' | 'class' | 'either', ext: string | undefined, max: number) {
  const idx = loadIndexes(KB_ROOT);
  const q = query.toLowerCase();
  let matches = idx.springBeans.filter((b) => {
    const idHit = b.id?.toLowerCase().includes(q) ?? false;
    const classHit = b.class?.toLowerCase().includes(q) ?? false;
    if (match === 'id') return idHit;
    if (match === 'class') return classHit;
    return idHit || classHit;
  });
  if (ext) matches = matches.filter((b) => b.extension === ext);
  return {
    hits: matches.length,
    beans: matches.slice(0, max),
  };
}

function findDto(name: string, ext: string | undefined, max: number) {
  const idx = loadIndexes(KB_ROOT);
  let matches = idx.beans.filter((b) => matchesQuery(b.class, name));
  if (ext) matches = matches.filter((b) => b.extension === ext);
  return {
    hits: matches.length,
    dtos: matches.slice(0, max),
  };
}

function findInterface(name: string, kind: string | undefined, ext: string | undefined, max: number) {
  const idx = loadIndexes(KB_ROOT);
  let matches = idx.servicesFacades.filter((s) => matchesQuery(s.interface, name));
  if (kind) matches = matches.filter((s) => s.kind.toLowerCase() === kind.toLowerCase());
  if (ext) matches = matches.filter((s) => s.extension === ext);
  return {
    hits: matches.length,
    interfaces: matches.slice(0, max),
  };
}

async function searchCode(
  query: string,
  extName: string | undefined,
  glob: string[] | undefined,
  ci: boolean,
  max: number
) {
  let paths: string[] = [HYBRIS_BIN];
  if (extName) {
    const idx = loadIndexes(KB_ROOT);
    const ext = idx.extensions.find((e) => e.name === extName);
    if (!ext) throw new Error(`Extension not found: ${extName}`);
    paths = [ext.abs_path];
  }
  const hits = await ripgrep(query, {
    paths,
    glob,
    maxCount: max,
    caseInsensitive: ci,
  });
  return {
    hits: hits.length,
    truncated: hits.length >= max,
    matches: hits.slice(0, max),
  };
}

function listExtensions(filter: string | undefined, section: string | undefined, max: number) {
  const idx = loadIndexes(KB_ROOT);
  let list = idx.extensions;
  if (filter) list = list.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
  if (section) list = list.filter((e) => e.section === section);
  return {
    total: list.length,
    extensions: list.slice(0, max).map((e) => ({
      name: e.name,
      section: e.section,
      kinds: e.kinds,
      path: e.path,
    })),
  };
}

function getSummary(name: string) {
  const p = join(KB_ROOT, 'extensions', `${name}.md`);
  if (!existsSync(p)) {
    const dir = join(KB_ROOT, 'extensions');
    const available = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')) : [];
    return { found: false, available };
  }
  return { found: true, name, content: readFileSync(p, 'utf-8') };
}

function getLearnings() {
  const p = join(KB_ROOT, 'learnings.md');
  if (!existsSync(p)) return { found: false };
  return { found: true, content: readFileSync(p, 'utf-8') };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('hybris-mcp-knowledge ready');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
