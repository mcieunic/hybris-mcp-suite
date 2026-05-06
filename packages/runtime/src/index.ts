#!/usr/bin/env node

// Allow self-signed SSL certificates (common in local Hybris dev environments)
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  validateString,
  validateNumber,
  validateBoolean,
  validateStringArray,
} from '@hybris-mcp/shared';
import { HybrisClient, HybrisConfig } from './hybris-client.js';
import { LogReader } from './log-reader.js';
import { StorefrontClient } from './storefront-client.js';
import { createPlaceholderMedia } from './placeholder.js';

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Load configuration from environment variables
function getConfig(): HybrisConfig {
  const baseUrl = process.env.HYBRIS_BASE_URL;
  const username = process.env.HYBRIS_USERNAME;
  const password = process.env.HYBRIS_PASSWORD;

  if (!baseUrl || !username || !password) {
    console.error('Missing required environment variables:');
    console.error('  HYBRIS_BASE_URL - Base URL of your Hybris instance (e.g., https://localhost:9002)');
    console.error('  HYBRIS_USERNAME - Admin username');
    console.error('  HYBRIS_PASSWORD - Admin password');
    process.exit(1);
  }

  return {
    baseUrl,
    username,
    password,
    baseSiteId: process.env.HYBRIS_BASE_SITE_ID || 'electronics',
    catalogId: process.env.HYBRIS_CATALOG_ID || 'electronicsProductCatalog',
    catalogVersion: process.env.HYBRIS_CATALOG_VERSION || 'Online',
    hacPath: process.env.HYBRIS_HAC_PATH || '/hac',
  };
}

function getLogReader(): LogReader | null {
  const rootPath = process.env.HYBRIS_LOG_PATH;
  if (!rootPath) return null;
  return new LogReader({ rootPath });
}

interface StorefrontPreset {
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  loginPath?: string;
  loginSubmitPath?: string;
  secureCheckPath?: string;
}

/**
 * Discover storefront presets from environment variables.
 *
 * Naming: STOREFRONT_<NAME>_URL / _USERNAME / _PASSWORD
 *   (optionally _LOGIN_PATH, _LOGIN_SUBMIT_PATH, _SECURE_CHECK_PATH)
 *
 * Legacy single-storefront vars (STOREFRONT_URL / _USERNAME / _PASSWORD) are
 * registered under the preset name "default".
 */
function discoverStorefrontPresets(): Map<string, StorefrontPreset> {
  const presets = new Map<string, StorefrontPreset>();
  const byName = new Map<string, Record<string, string>>();

  for (const [key, rawValue] of Object.entries(process.env)) {
    if (rawValue === undefined) continue;
    const m = key.match(/^STOREFRONT_([A-Z0-9]+)_(URL|USERNAME|PASSWORD|LOGIN_PATH|LOGIN_SUBMIT_PATH|SECURE_CHECK_PATH)$/);
    if (!m) continue;
    const [, namePart, field] = m;
    const name = namePart.toLowerCase();
    if (!byName.has(name)) byName.set(name, {});
    byName.get(name)![field] = rawValue;
  }

  for (const [name, fields] of byName) {
    if (!fields.URL || !fields.USERNAME || !fields.PASSWORD) continue;
    presets.set(name, {
      name,
      baseUrl: fields.URL,
      username: fields.USERNAME,
      password: fields.PASSWORD,
      loginPath: fields.LOGIN_PATH,
      loginSubmitPath: fields.LOGIN_SUBMIT_PATH,
      secureCheckPath: fields.SECURE_CHECK_PATH,
    });
  }

  // Legacy single-storefront vars → "default" preset (unless already defined)
  if (!presets.has('default') && process.env.STOREFRONT_URL && process.env.STOREFRONT_USERNAME && process.env.STOREFRONT_PASSWORD) {
    presets.set('default', {
      name: 'default',
      baseUrl: process.env.STOREFRONT_URL,
      username: process.env.STOREFRONT_USERNAME,
      password: process.env.STOREFRONT_PASSWORD,
    });
  }

  return presets;
}

/**
 * Resolve a storefront config from tool arguments + presets.
 * Precedence: explicit args override the preset named by `storefront`
 * (or the single preset if only one exists / "default" if present).
 */
function resolveStorefront(
  args: Record<string, unknown> | undefined,
  presets: Map<string, StorefrontPreset>
): StorefrontPreset {
  const requestedName = validateString(args, 'storefront', false);

  let preset: StorefrontPreset | undefined;
  if (requestedName) {
    preset = presets.get(requestedName.toLowerCase());
    if (!preset) {
      throw new Error(
        `Unknown storefront "${requestedName}". Available: ${[...presets.keys()].join(', ') || '(none configured)'}`
      );
    }
  } else if (presets.size === 1) {
    preset = [...presets.values()][0];
  } else if (presets.has('default')) {
    preset = presets.get('default');
  }

  const baseUrl = validateString(args, 'storefrontUrl', false) ?? preset?.baseUrl;
  const username = validateString(args, 'username', false) ?? preset?.username;
  const password = validateString(args, 'password', false) ?? preset?.password;
  const loginPath = validateString(args, 'loginPath', false) ?? preset?.loginPath;
  const loginSubmitPath = validateString(args, 'loginSubmitPath', false) ?? preset?.loginSubmitPath;
  const secureCheckPath = validateString(args, 'secureCheckPath', false) ?? preset?.secureCheckPath;

  if (!baseUrl || !username || !password) {
    const available = [...presets.keys()];
    throw new Error(
      'Missing storefront credentials. Provide either:\n' +
      '  - `storefront` arg naming a configured preset (available: ' + (available.join(', ') || '(none)') + '), or\n' +
      '  - explicit `storefrontUrl` + `username` + `password` args, or\n' +
      '  - env vars STOREFRONT_<NAME>_URL / _USERNAME / _PASSWORD (also legacy STOREFRONT_URL / _USERNAME / _PASSWORD).'
    );
  }

  return {
    name: preset?.name ?? 'custom',
    baseUrl,
    username,
    password,
    loginPath,
    loginSubmitPath,
    secureCheckPath,
  };
}

// Define all available tools
const tools: Tool[] = [
  {
    name: 'search_products',
    description: 'Search for products in the Hybris catalog using a query string',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for products',
        },
        pageSize: {
          type: 'number',
          description: 'Number of results per page (default: 20)',
        },
        currentPage: {
          type: 'number',
          description: 'Page number to retrieve (0-indexed, default: 0)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description: 'Get detailed information about a specific product by its code',
    inputSchema: {
      type: 'object',
      properties: {
        productCode: {
          type: 'string',
          description: 'The product code/SKU',
        },
      },
      required: ['productCode'],
    },
  },
  {
    name: 'get_categories',
    description: 'Get the category tree from the product catalog',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'get_category',
    description: 'Get details about a specific category',
    inputSchema: {
      type: 'object',
      properties: {
        categoryCode: {
          type: 'string',
          description: 'The category code',
        },
      },
      required: ['categoryCode'],
    },
  },
  {
    name: 'get_orders',
    description: 'Get orders for a specific user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID or email',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_order',
    description: 'Get details of a specific order',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID or email',
        },
        orderCode: {
          type: 'string',
          description: 'Order code/number',
        },
      },
      required: ['userId', 'orderCode'],
    },
  },
  {
    name: 'flexible_search',
    description: 'Execute a FlexibleSearch query against the Hybris database. Use FlexibleSearch syntax.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'FlexibleSearch query (e.g., "SELECT {pk}, {code} FROM {Product}")',
        },
        maxCount: {
          type: 'number',
          description: 'Maximum number of results (default: 100)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute_groovy',
    description: 'Execute a Groovy script in the Hybris scripting console',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Groovy script to execute',
        },
        commit: {
          type: 'boolean',
          description: 'Whether to commit database changes (default: false)',
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'describe_type',
    description:
      'Describe a Hybris type: returns its attribute descriptors with flags (localized, mandatory, unique, partOf, writable) and attribute type code. ' +
      'Use this before writing ImpEx or FlexibleSearch to check which fields exist and which require a language suffix. Returns structured JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        typeCode: {
          type: 'string',
          description: 'Type code, e.g. "Product", "CMSLinkComponent", "ContentPage"',
        },
        includeInherited: {
          type: 'boolean',
          description: 'Include attributes inherited from supertypes (default: true)',
        },
        onlyLocalized: {
          type: 'boolean',
          description: 'Return only localized attributes (default: false)',
        },
      },
      required: ['typeCode'],
    },
  },
  {
    name: 'import_impex',
    description: 'Import data using ImpEx format',
    inputSchema: {
      type: 'object',
      properties: {
        impexContent: {
          type: 'string',
          description: 'ImpEx content to import',
        },
      },
      required: ['impexContent'],
    },
  },
  {
    name: 'export_impex',
    description: 'Export data to ImpEx format using a FlexibleSearch query',
    inputSchema: {
      type: 'object',
      properties: {
        flexQuery: {
          type: 'string',
          description: 'FlexibleSearch query for data to export',
        },
      },
      required: ['flexQuery'],
    },
  },
  {
    name: 'get_cronjobs',
    description: 'List all cron jobs and their status',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'trigger_cronjob',
    description: 'Trigger a cron job to run',
    inputSchema: {
      type: 'object',
      properties: {
        cronJobCode: {
          type: 'string',
          description: 'Code of the cron job to trigger',
        },
      },
      required: ['cronJobCode'],
    },
  },
  {
    name: 'get_cronjob_logs',
    description:
      'Inspect a CronJob: returns status/result/times, JobLog entries (paginated + filterable by level and message substring), and — for CatalogVersionSyncCronJob — sync counters and the list of sync ScheduleMedia attachments (code, real filename, mime, size, URL). ' +
      'Use this instead of dumping the full CronJob model (which can be >100k chars of noise) when you need to understand why a sync failed or see per-log details. ' +
      'For "sync ended with N unfinished items - see last sync media for details" errors, the scheduleMedias array tells you which media blobs hold the per-item schedule — download via the returned url.',
    inputSchema: {
      type: 'object',
      properties: {
        cronJobCode: {
          type: 'string',
          description: 'CronJob.code to inspect (e.g. "mcp_sync_1776851686092").',
        },
        includeLogs: {
          type: 'boolean',
          description: 'Include JobLog entries. Default true.',
        },
        logLimit: {
          type: 'number',
          description: 'Max JobLog entries to return (default 100, max 1000).',
        },
        logOffset: {
          type: 'number',
          description: 'JobLog pagination offset (default 0). Combined with logLimit for pagination.',
        },
        logLevel: {
          type: 'string',
          description: 'Filter logs by exact level: INFO, WARNING, ERROR, FATAL, DEBUG, UNKNOWN. Case-insensitive.',
        },
        messageContains: {
          type: 'string',
          description: 'Filter logs whose message contains this substring (case-insensitive).',
        },
        includeLogText: {
          type: 'boolean',
          description: 'Include the CronJob.logText field (raw serialized log). Default false — can be large.',
        },
        logTextLimit: {
          type: 'number',
          description: 'Truncate logText to this many chars when includeLogText=true. Default 5000, max 200000.',
        },
        includeScheduleMedias: {
          type: 'boolean',
          description: 'Include the sync ScheduleMedia attachments (only relevant for CatalogVersionSyncCronJob). Default true.',
        },
        includeScheduleMediaContent: {
          type: 'boolean',
          description: 'For each ScheduleMedia with a text-like mime (text/*, application/csv, application/json, application/xml), inline its content as UTF-8. Useful for sync_dump_*.csv which lists the unfinished item PKs. Default false.',
        },
        scheduleMediaContentLimit: {
          type: 'number',
          description: 'Max characters of inlined ScheduleMedia content per attachment. Default 20000, max 500000.',
        },
      },
      required: ['cronJobCode'],
    },
  },
  {
    name: 'clear_cache',
    description: 'Clear the Hybris cache',
    inputSchema: {
      type: 'object',
      properties: {
        cacheType: {
          type: 'string',
          description: 'Specific cache type to clear (optional, clears all if not specified)',
        },
      },
    },
  },
  {
    name: 'get_system_info',
    description: 'Get Hybris system information and health status',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'trigger_catalog_sync',
    description: 'Trigger a catalog synchronization between versions',
    inputSchema: {
      type: 'object',
      properties: {
        catalogId: {
          type: 'string',
          description: 'Catalog ID to sync',
        },
        sourceVersion: {
          type: 'string',
          description: 'Source catalog version (e.g., "Staged")',
        },
        targetVersion: {
          type: 'string',
          description: 'Target catalog version (e.g., "Online")',
        },
      },
      required: ['catalogId', 'sourceVersion', 'targetVersion'],
    },
  },
  {
    name: 'run_project_data_update',
    description:
      'Run "Update Running System" (project data) scoped to a single extension — equivalent to clicking Update in HAC for just this ext. ' +
      'Invokes <ExtName>SystemSetup.createProjectData(ctx) with SystemSetup.Process.UPDATE, so only @SystemSetup methods that match UPDATE (or ALL) for that extension run. ' +
      'Pass `params` to mirror HAC checkboxes (e.g. {"<extName>_import_sample_data": "true"}).',
    inputSchema: {
      type: 'object',
      properties: {
        extensionName: {
          type: 'string',
          description: 'Hybris extension name, e.g. "myprojectinitialdata". Must match [a-zA-Z0-9_]+.',
        },
        params: {
          type: 'object',
          description: 'Optional map of HAC parameters passed to SystemSetupContext (Map<String,String>). Keys typically follow "<extensionName>_<param>" convention.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['extensionName'],
    },
  },
  {
    name: 'create_placeholder_media',
    description:
      'Generate a placeholder SVG image (e.g. "placeholder - homepageBanner1") and write it to disk under <outputDir>/<code>.svg, ' +
      'or under <outputDir>/_<lang>/<code>.svg when `lang` is provided. The file name equals the media code, so the same code can be ' +
      'referenced in your impex now and the actual graphic dropped in later under the same name. Long labels are split into 2 lines automatically. ' +
      'This tool only writes the file — register the Media in Hybris by importing your impex (e.g. via import_impex).',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Media code, e.g. "homepageBanner1". Must match [A-Za-z0-9_-]+. Used both as filename (<code>.svg) and as label text on the placeholder.',
        },
        outputDir: {
          type: 'string',
          description: 'Absolute path to the images directory, e.g. ".../myContentCatalog/images". Localized files go into <outputDir>/_<lang>/.',
        },
        lang: {
          type: 'string',
          description: 'Optional language code (cs, sk, en, en_US...). When set, the file is written under <outputDir>/_<lang>/<code>.svg.',
        },
        width: {
          type: 'number',
          description: 'SVG width in px (default 800, 16..8192).',
        },
        height: {
          type: 'number',
          description: 'SVG height in px (default 600, 16..8192).',
        },
        label: {
          type: 'string',
          description: 'Override the rendered label. Defaults to "placeholder - <code>".',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing file if present (default false).',
        },
      },
      required: ['code', 'outputDir'],
    },
  },
  {
    name: 'health_check',
    description: 'Check if the Hybris instance is healthy and reachable',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'list_logs',
    description:
      'List Hybris server log files in the configured log directory (HYBRIS_LOG_PATH). Returns paths, sizes and modification times sorted newest-first. Tomcat logs live under the "tomcat/" subdirectory (console-YYYYMMDD.log, access..YYYY-MM-DD.log).',
    inputSchema: {
      type: 'object',
      properties: {
        subdir: {
          type: 'string',
          description: 'Optional subdirectory relative to the log root (e.g. "tomcat", "solr"). Defaults to the whole tree.',
        },
      },
    },
  },
  {
    name: 'read_log',
    description:
      'Read a Hybris log file by path (relative to HYBRIS_LOG_PATH). Returns log ENTRIES — multi-line stack traces are grouped into a single entry, and grep matches against the full entry text. ' +
      'Defaults to tail-mode (last N entries) with backward byte-seek so even GB-sized logs are fast. Transparently handles `.log.gz` archives. ' +
      'Filters: regex (grep), time window (since/until ISO timestamps). ' +
      'For live tailing, pass `fromByteOffset` (use `nextByteOffset` from a previous response) — stateless tail -f.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to log root, e.g. "tomcat/console-20260422.log" or "integration_log.log".',
        },
        entries: {
          type: 'number',
          description: 'Number of log entries to return (default 500, max 5000). One entry = one log line + any continuation lines (e.g. full stack trace).',
        },
        fromEnd: {
          type: 'boolean',
          description: 'If true (default) returns the LAST N entries (tail). If false, reads from the start of the file.',
        },
        grep: {
          type: 'string',
          description: 'Optional regex; only matching entries returned. Matched against full entry text (incl. stack trace), so searching by class name returns the whole trace.',
        },
        since: {
          type: 'string',
          description: 'ISO-8601 lower bound (e.g. "2026-04-22T08:30:00"). Entries with timestamps earlier than this are skipped.',
        },
        until: {
          type: 'string',
          description: 'ISO-8601 upper bound. Entries with timestamps later than this are skipped.',
        },
        parsed: {
          type: 'boolean',
          description: 'If true, include structured `entries` array (with timestamp/level/thread/logger fields) alongside raw `content`. Default false (smaller response).',
        },
        fromByteOffset: {
          type: 'number',
          description: 'FOLLOW MODE: read from this byte offset to current EOF. Use `nextByteOffset` from a previous response to poll for new content (stateless `tail -f`). Not supported for `.gz` files.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'tail_latest_log',
    description:
      'Convenience: tail the most recently modified active (non-gzipped) log whose filename contains the given hint. Useful for "show me the latest tomcat console log" without knowing the dated filename.',
    inputSchema: {
      type: 'object',
      properties: {
        nameHint: {
          type: 'string',
          description: 'Substring to match against filenames, e.g. "console", "access", "integration".',
        },
        entries: {
          type: 'number',
          description: 'Number of log entries to return (default 200, max 5000).',
        },
      },
      required: ['nameHint'],
    },
  },
  {
    name: 'search_logs',
    description:
      'Grep across Hybris log files using a regex. Matches against full log entries (so a hit on a class name returns the entire stack trace). ' +
      'By default scans only active (non-gzipped) logs for speed; pass includeGz=true to also search rotated archives. Optional filenameHint narrows which files are scanned (e.g. "console" for tomcat console logs). ' +
      'Time-range filtering via since/until ISO timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to match (case-sensitive; use (?i) inline flag for case-insensitive).',
        },
        subdir: {
          type: 'string',
          description: 'Restrict search to a subdirectory of the log root (e.g. "tomcat").',
        },
        filenameHint: {
          type: 'string',
          description: 'Only scan files whose name contains this substring (case-insensitive).',
        },
        includeGz: {
          type: 'boolean',
          description: 'Include gzipped rotated logs in the search (default false).',
        },
        maxHits: {
          type: 'number',
          description: 'Cap on returned hits (default 200, max 1000).',
        },
        since: {
          type: 'string',
          description: 'ISO-8601 lower bound — entries earlier than this are skipped.',
        },
        until: {
          type: 'string',
          description: 'ISO-8601 upper bound — entries later than this are skipped.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'correlate_logs',
    description:
      'Correlate log entries across multiple files within a time window of an anchor moment. ' +
      'Anchor can be either an ISO-8601 timestamp (e.g. "2026-04-22T08:36:58") OR a regex pattern — when a pattern, the first matching entry in `anchorPath` (or the first listed path) supplies the timestamp. ' +
      'Returns merged entries from all paths, sorted by timestamp. ' +
      'Classic use case: a 500 in tomcat/access..*.log → use the access line as anchor, list also tomcat/console-*.log to see what failed.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Log file paths to correlate (relative to log root).',
        },
        anchor: {
          type: 'string',
          description: 'ISO-8601 timestamp OR regex pattern to find the anchor entry.',
        },
        windowMs: {
          type: 'number',
          description: 'Window size in milliseconds around the anchor (default 5000 = ±5s).',
        },
        anchorPath: {
          type: 'string',
          description: 'When anchor is a regex, search for it in this file (default: first entry of paths).',
        },
      },
      required: ['paths', 'anchor'],
    },
  },
  {
    name: 'delete_content_catalog',
    description:
      'DESTRUCTIVE: Delete all items belonging to a content catalog. Removes every CMSItem (components, slots, pages, navigation nodes, restrictions, page templates, slot-for-page links) AND Media items in every catalog version. ' +
      'Optionally also removes the catalog versions and the ContentCatalog itself (removeCatalog=true). When removeCatalog=true, automatically clears the catalog activeCatalogVersion reference so CheckVersionsRemoveInterceptor does not block removal. ' +
      'Uses iterative removal (multiple passes) to handle foreign-key ordering. Returns a JSON report with per-version initialCounts/finalCounts/passes and per-step errors (top-level try/catch wraps all failures). ' +
      'DEFAULTS TO DRY-RUN: pass dryRun=false to actually commit. Always run once with dryRun=true first to see the counts.',
    inputSchema: {
      type: 'object',
      properties: {
        contentCatalogId: {
          type: 'string',
          description: 'ContentCatalog id, e.g. "myContentCatalog". Must match [a-zA-Z0-9_-]+.',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true (default) only counts items, does not delete. Set to false to actually commit.',
        },
        removeCatalog: {
          type: 'boolean',
          description: 'If true, also deletes the CatalogVersions and the ContentCatalog itself after clearing CMS items. Default false — only wipes contents.',
        },
        maxPasses: {
          type: 'number',
          description: 'Max iterative deletion passes per catalog version (default 10). Increase for very interlinked catalogs.',
        },
      },
      required: ['contentCatalogId'],
    },
  },
  {
    name: 'storefront_list',
    description:
      'List storefront presets configured via environment variables. Presets use the naming pattern STOREFRONT_<NAME>_URL / _USERNAME / _PASSWORD. Returns preset names and base URLs (passwords are NOT returned).',
    inputSchema: { type: 'object' },
  },
  {
    name: 'storefront_login',
    description:
      'Log into a Hybris Accelerator-style storefront using form-based Spring Security auth and return a verbose step-by-step trace. ' +
      'Use this to debug login/CSRF issues: response includes every HTTP hop, status codes, Set-Cookie values, Location headers, the detected CSRF field name/token, and a body snippet at each step. ' +
      'Storefront selection precedence: (1) explicit storefrontUrl/username/password args, (2) `storefront` arg naming a preset, (3) single preset if only one configured, (4) "default" preset. ' +
      'Configure presets with env vars STOREFRONT_<NAME>_URL / _USERNAME / _PASSWORD (also legacy STOREFRONT_URL / _USERNAME / _PASSWORD → "default"). Use storefront_list to see available presets.',
    inputSchema: {
      type: 'object',
      properties: {
        storefront: {
          type: 'string',
          description: 'Name of a configured preset (case-insensitive), e.g. "shop1" or "shop2". Omit to use the single/default preset or to pass explicit credentials.',
        },
        storefrontUrl: {
          type: 'string',
          description: 'Storefront base URL including context path, e.g. https://shop.local:9002/yourstorefront. Overrides the preset.',
        },
        username: { type: 'string', description: 'j_username to log in as. Overrides the preset.' },
        password: { type: 'string', description: 'j_password. Overrides the preset.' },
        loginPath: { type: 'string', description: 'Path to the login page (default "/login").' },
        loginSubmitPath: { type: 'string', description: 'Path form posts to (default "/j_spring_security_check").' },
        secureCheckPath: { type: 'string', description: 'Path to hit after login to verify auth (default "/my-account").' },
      },
    },
  },
  {
    name: 'export_cms_page',
    description:
      'Export a complete CMS ContentPage (slots, components, media, restrictions, navigation, localized fields) to a set of ImpEx files ready to import into another content catalog. ' +
      'Output is emitted against a *target* catalog/version so you can swap the CC (e.g. clone catalog A → catalog B). ' +
      'Returns { main, localized: { <lang>: impex }, stats }. Main must be imported first, then each localized file. Media are emitted as references by code — binaries must already exist in the target.',
    inputSchema: {
      type: 'object',
      properties: {
        pageUid: {
          type: 'string',
          description: 'uid of the ContentPage to export (e.g. "homepage").',
        },
        catalog: {
          type: 'string',
          description: 'Source content catalog id (required).',
        },
        catalogVersion: {
          type: 'string',
          description: 'Source catalog version. Default: "Staged".',
        },
        baseLang: {
          type: 'string',
          description: 'Base language written into the MAIN impex. Default: "en".',
        },
        extraLangs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional languages to emit as localized UPDATE impexes. Default: [] (no extra languages).',
        },
        targetCatalog: {
          type: 'string',
          description: 'Target content catalog id in the emitted impex. Defaults to `catalog` (identity clone).',
        },
        targetCatalogVersion: {
          type: 'string',
          description: 'Target catalog version in the emitted impex. Defaults to `catalogVersion`.',
        },
      },
      required: ['pageUid', 'catalog'],
    },
  },
  {
    name: 'storefront_get',
    description:
      'Log into the storefront, then GET the given path/URL with the authenticated session. Returns status, final URL after redirects, cookies, and a body snippet. Useful for confirming what the logged-in user actually sees. Storefront selection same as storefront_login.',
    inputSchema: {
      type: 'object',
      properties: {
        storefront: { type: 'string', description: 'Preset name (see storefront_list).' },
        storefrontUrl: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string' },
        path: { type: 'string', description: 'Absolute URL or path relative to storefront base (e.g. "/my-account/orders").' },
        loginPath: { type: 'string' },
        loginSubmitPath: { type: 'string' },
        secureCheckPath: { type: 'string' },
      },
      required: ['path'],
    },
  },
];

async function main() {
  const config = getConfig();
  const hybrisClient = new HybrisClient(config);
  const logReader = getLogReader();
  const storefrontPresets = discoverStorefrontPresets();

  const requireLogReader = (): LogReader => {
    if (!logReader) {
      throw new Error(
        'Log tools are disabled: HYBRIS_LOG_PATH is not set. Set it to your Hybris log directory (e.g. /path/to/hybris/log).'
      );
    }
    return logReader;
  };

  const server = new Server(
    {
      name: 'hybris-mcp-runtime',
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Graceful shutdown handlers
  const shutdown = async () => {
    console.error('Shutting down Hybris Runtime MCP server...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_products':
          result = await hybrisClient.searchProducts(
            validateString(args, 'query', true),
            validateNumber(args, 'pageSize', { min: 1, max: 100 }),
            validateNumber(args, 'currentPage', { min: 0 })
          );
          break;

        case 'get_product':
          result = await hybrisClient.getProduct(
            validateString(args, 'productCode', true)
          );
          break;

        case 'get_categories':
          result = await hybrisClient.getCategories();
          break;

        case 'get_category':
          result = await hybrisClient.getCategory(
            validateString(args, 'categoryCode', true)
          );
          break;

        case 'get_orders':
          result = await hybrisClient.getOrders(
            validateString(args, 'userId', true)
          );
          break;

        case 'get_order':
          result = await hybrisClient.getOrder(
            validateString(args, 'userId', true),
            validateString(args, 'orderCode', true)
          );
          break;

        case 'flexible_search':
          result = await hybrisClient.executeFlexibleSearch(
            validateString(args, 'query', true),
            validateNumber(args, 'maxCount', { min: 1, max: 10000 })
          );
          break;

        case 'execute_groovy':
          result = await hybrisClient.executeGroovyScript(
            validateString(args, 'script', true),
            validateBoolean(args, 'commit', false)
          );
          break;

        case 'describe_type': {
          const typeCode = validateString(args, 'typeCode', true)!;
          const includeInherited = validateBoolean(args, 'includeInherited', true);
          const onlyLocalized = validateBoolean(args, 'onlyLocalized', false);

          const escapedType = typeCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

          const script = `
import de.hybris.platform.core.model.type.ComposedTypeModel
import de.hybris.platform.core.model.type.AttributeDescriptorModel
import groovy.json.JsonOutput

def typeCode = "${escapedType}"
def includeInherited = ${includeInherited}
def onlyLocalized = ${onlyLocalized}

def typeService = spring.getBean("typeService")
def ct = null
try {
  ct = typeService.getComposedTypeForCode(typeCode) as ComposedTypeModel
} catch (Exception e) {
  println JsonOutput.toJson([error: "Unknown type: " + typeCode])
  return
}
if (ct == null) {
  println JsonOutput.toJson([error: "Unknown type: " + typeCode])
  return
}

def declaredQualifiers = ct.declaredattributedescriptors.collect { it.qualifier } as Set
def attrs = includeInherited ? ct.attributeDescriptors : ct.declaredattributedescriptors
if (onlyLocalized) attrs = attrs.findAll { it.localized }

def out = [
  type: ct.code,
  superType: ct.superType?.code,
  abstract: ct.abstract,
  attributeCount: attrs.size(),
  attributes: attrs.sort { it.qualifier }.collect { AttributeDescriptorModel a ->
    [
      qualifier: a.qualifier,
      localized: a.localized,
      mandatory: a.mandatory,
      unique: a.unique,
      partOf: a.partOf,
      writable: a.writable,
      type: a.attributeType?.code,
      declared: declaredQualifiers.contains(a.qualifier),
    ]
  }
]

println JsonOutput.toJson(out)
`;

          result = await hybrisClient.executeGroovyScript(script, false);
          break;
        }

        case 'import_impex':
          result = await hybrisClient.importImpex(
            validateString(args, 'impexContent', true)
          );
          break;

        case 'export_impex':
          result = await hybrisClient.exportImpex(
            validateString(args, 'flexQuery', true)
          );
          break;

        case 'get_cronjobs':
          result = await hybrisClient.getCronJobs();
          break;

        case 'trigger_cronjob':
          result = await hybrisClient.triggerCronJob(
            validateString(args, 'cronJobCode', true)
          );
          break;

        case 'get_cronjob_logs': {
          const cronJobCode = validateString(args, 'cronJobCode', true);
          const includeLogs = validateBoolean(args, 'includeLogs', true);
          const logLimit = validateNumber(args, 'logLimit', { min: 1, max: 1000 }) ?? 100;
          const logOffset = validateNumber(args, 'logOffset', { min: 0 }) ?? 0;
          const logLevel = validateString(args, 'logLevel', false);
          const messageContains = validateString(args, 'messageContains', false);
          const includeLogText = validateBoolean(args, 'includeLogText', false);
          const logTextLimit = validateNumber(args, 'logTextLimit', { min: 1, max: 200000 }) ?? 5000;
          const includeScheduleMedias = validateBoolean(args, 'includeScheduleMedias', true);
          const includeScheduleMediaContent = validateBoolean(args, 'includeScheduleMediaContent', false);
          const scheduleMediaContentLimit =
            validateNumber(args, 'scheduleMediaContentLimit', { min: 1, max: 500000 }) ?? 20000;

          const escapedCode = cronJobCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const escapedLevel = logLevel ? logLevel.replace(/\\/g, '\\\\').replace(/"/g, '\\"').toUpperCase() : '';
          const escapedMsg = messageContains
            ? messageContains.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            : '';

          const script = `
import de.hybris.platform.servicelayer.search.FlexibleSearchQuery
import de.hybris.platform.servicelayer.search.FlexibleSearchService
import de.hybris.platform.catalog.model.synchronization.CatalogVersionSyncCronJobModel
import groovy.json.JsonOutput

def flexSvc = spring.getBean("flexibleSearchService", FlexibleSearchService.class)

def cronJobCode = "${escapedCode}"
def includeLogs = ${includeLogs}
def logLimit = ${logLimit}
def logOffset = ${logOffset}
def logLevelFilter = "${escapedLevel}"
def messageContainsFilter = "${escapedMsg}".toLowerCase()
def includeLogText = ${includeLogText}
def logTextLimit = ${logTextLimit}
def includeScheduleMedias = ${includeScheduleMedias}
def includeScheduleMediaContent = ${includeScheduleMediaContent}
def scheduleMediaContentLimit = ${scheduleMediaContentLimit}

def mediaSvc = spring.getBean("mediaService")

try {
  def q = new FlexibleSearchQuery("SELECT {pk} FROM {CronJob} WHERE {code} = ?c")
  q.addQueryParameter("c", cronJobCode)
  def cj = flexSvc.search(q).result.find()
  if (!cj) {
    return JsonOutput.toJson([error: "CronJob not found: " + cronJobCode])
  }

  def out = [
    cronJob: [
      code: cj.code,
      type: cj.class.simpleName,
      status: cj.status?.code,
      result: cj.result?.code,
      startTime: cj.startTime?.toString(),
      endTime: cj.endTime?.toString(),
      durationMs: (cj.startTime && cj.endTime) ? (cj.endTime.time - cj.startTime.time) : null,
      active: cj.active,
      nodeID: cj.nodeID,
      errorMode: cj.errorMode?.code,
      currentStep: cj.currentStep?.code,
      logLevelDatabase: cj.logLevelDatabase?.code,
      logLevelFile: cj.logLevelFile?.code,
    ]
  ]

  if (cj instanceof CatalogVersionSyncCronJobModel) {
    out.syncStats = [
      fullSync: cj.fullSync,
      forceUpdate: cj.forceUpdate,
      createSavedValues: cj.createSavedValues,
      queryCount: cj.queryCount,
      filesCount: cj.filesCount,
      logsCount: cj.logsCount,
      finishedItemsCount: cj.finishedItems?.size() ?: 0,
      pendingItemsCount: cj.pendingItems?.size() ?: 0,
      sourceVersion: cj.job?.sourceVersion ? (cj.job.sourceVersion.catalog.id + ":" + cj.job.sourceVersion.version) : null,
      targetVersion: cj.job?.targetVersion ? (cj.job.targetVersion.catalog.id + ":" + cj.job.targetVersion.version) : null,
    ]
  }

  if (includeLogs) {
    def allLogs = cj.logs ?: []
    def filtered = []
    for (l in allLogs) {
      def lvl = l.level?.code
      if (logLevelFilter && lvl != logLevelFilter) continue
      def msg = l.message ?: ""
      if (messageContainsFilter && !msg.toLowerCase().contains(messageContainsFilter)) continue
      filtered << l
    }
    def total = filtered.size()
    def page = filtered.drop(logOffset).take(logLimit)
    def logsOut = page.collect { l ->
      [
        level: l.level?.code,
        message: l.message,
        shortMessage: l.shortMessage,
        step: l.step,
        timestamp: l.creationtime?.toString(),
      ]
    }
    out.logs = logsOut
    out.logsTotal = total
    out.logsReturned = logsOut.size()
    out.logsOffset = logOffset
    out.logsTruncated = (logOffset + logsOut.size()) < total
  }

  if (includeLogText) {
    def txt = cj.logText ?: ""
    out.logText = txt.length() > logTextLimit ? txt.substring(0, logTextLimit) : txt
    out.logTextTotalLength = txt.length()
    out.logTextTruncated = txt.length() > logTextLimit
  }

  if (includeScheduleMedias && cj instanceof CatalogVersionSyncCronJobModel) {
    def schedMedias = cj.scheduleMedias ?: []
    out.scheduleMedias = schedMedias.collect { sm ->
      def entry = [
        code: sm.code,
        realFileName: sm.realFileName,
        mime: sm.mime,
        size: sm.size,
        url: sm.URL,
        downloadURL: sm.downloadURL,
        folder: sm.folder?.qualifier,
        creationtime: sm.creationtime?.toString(),
      ]
      if (includeScheduleMediaContent) {
        def mime = (sm.mime ?: "").toLowerCase()
        def name = (sm.realFileName ?: "").toLowerCase()
        def looksTextual = mime.startsWith("text/") ||
          mime == "application/csv" ||
          mime == "application/json" ||
          mime == "application/xml" ||
          name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".json") || name.endsWith(".xml")
        if (looksTextual) {
          try {
            byte[] bytes = mediaSvc.getDataFromMedia(sm)
            def txt = new String(bytes, "UTF-8")
            entry.contentTruncated = txt.length() > scheduleMediaContentLimit
            entry.content = entry.contentTruncated ? txt.substring(0, scheduleMediaContentLimit) : txt
            entry.contentFullLength = txt.length()
          } catch (Throwable te) {
            entry.contentError = te.class.simpleName + ": " + te.message
          }
        } else {
          entry.contentSkipped = "non-textual mime"
        }
      }
      entry
    }
    out.scheduleMediasCount = out.scheduleMedias.size()
  }

  return JsonOutput.toJson(out)
} catch (Throwable t) {
  return JsonOutput.toJson([
    error: t.class.simpleName + ": " + t.message,
    stack: t.stackTrace.take(5).collect { it.toString() }
  ])
}
`;
          result = await hybrisClient.executeGroovyScript(script, false);
          break;
        }

        case 'clear_cache':
          result = await hybrisClient.clearCache(
            validateString(args, 'cacheType', false)
          );
          break;

        case 'get_system_info':
          result = await hybrisClient.getSystemInfo();
          break;

        case 'trigger_catalog_sync':
          result = await hybrisClient.triggerCatalogSync(
            validateString(args, 'catalogId', true),
            validateString(args, 'sourceVersion', true),
            validateString(args, 'targetVersion', true)
          );
          break;

        case 'run_project_data_update': {
          const extensionName = validateString(args, 'extensionName', true)!;
          const rawParams = args && typeof args === 'object' && 'params' in args
            ? (args as Record<string, unknown>).params
            : undefined;
          let params: Record<string, string> | undefined;
          if (rawParams !== undefined && rawParams !== null) {
            if (typeof rawParams !== 'object' || Array.isArray(rawParams)) {
              throw new Error('params must be an object mapping string keys to string values');
            }
            params = {};
            for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
              if (typeof v !== 'string') {
                throw new Error(`params.${k} must be a string (got ${typeof v})`);
              }
              params[k] = v;
            }
          }
          result = await hybrisClient.runProjectDataUpdate(extensionName, params);
          break;
        }

        case 'create_placeholder_media':
          result = await createPlaceholderMedia({
            code: validateString(args, 'code', true)!,
            outputDir: validateString(args, 'outputDir', true)!,
            lang: validateString(args, 'lang', false),
            width: validateNumber(args, 'width', { min: 16, max: 8192 }),
            height: validateNumber(args, 'height', { min: 16, max: 8192 }),
            label: validateString(args, 'label', false),
            overwrite: validateBoolean(args, 'overwrite', false),
          });
          break;

        case 'health_check':
          result = await hybrisClient.healthCheck();
          break;

        case 'list_logs':
          result = await requireLogReader().listLogs(
            validateString(args, 'subdir', false)
          );
          break;

        case 'read_log': {
          const reader = requireLogReader();
          const fromEnd = args && 'fromEnd' in args
            ? validateBoolean(args, 'fromEnd', true)
            : true;
          result = await reader.readLog(validateString(args, 'path', true), {
            entries: validateNumber(args, 'entries', { min: 1, max: 5000 }),
            fromEnd,
            grep: validateString(args, 'grep', false),
            since: validateString(args, 'since', false),
            until: validateString(args, 'until', false),
            parsed: validateBoolean(args, 'parsed', false),
            fromByteOffset: validateNumber(args, 'fromByteOffset', { min: 0 }),
          });
          break;
        }

        case 'tail_latest_log':
          result = await requireLogReader().tailLatest(
            validateString(args, 'nameHint', true),
            validateNumber(args, 'entries', { min: 1, max: 5000 }) ?? 200
          );
          break;

        case 'search_logs':
          result = await requireLogReader().searchLogs(
            validateString(args, 'pattern', true),
            {
              subdir: validateString(args, 'subdir', false),
              filenameHint: validateString(args, 'filenameHint', false),
              includeGz: validateBoolean(args, 'includeGz', false),
              maxHits: validateNumber(args, 'maxHits', { min: 1, max: 1000 }),
              since: validateString(args, 'since', false),
              until: validateString(args, 'until', false),
            }
          );
          break;

        case 'correlate_logs':
          result = await requireLogReader().correlateLogs({
            paths: validateStringArray(args, 'paths', true)!,
            anchor: validateString(args, 'anchor', true),
            windowMs: validateNumber(args, 'windowMs', { min: 1, max: 3600000 }),
            anchorPath: validateString(args, 'anchorPath', false),
          });
          break;

        case 'delete_content_catalog': {
          const contentCatalogId = validateString(args, 'contentCatalogId', true);
          if (!/^[a-zA-Z0-9_-]+$/.test(contentCatalogId)) {
            throw new Error('contentCatalogId must match [a-zA-Z0-9_-]+');
          }
          const dryRun = validateBoolean(args, 'dryRun', true);
          const removeCatalog = validateBoolean(args, 'removeCatalog', false);
          const maxPasses = validateNumber(args, 'maxPasses', { min: 1, max: 50 }) ?? 10;

          const script = `
import de.hybris.platform.servicelayer.search.FlexibleSearchQuery
import de.hybris.platform.servicelayer.search.FlexibleSearchService
import de.hybris.platform.servicelayer.model.ModelService
import groovy.json.JsonOutput

def flexSvc = spring.getBean("flexibleSearchService", FlexibleSearchService.class)
def modelSvc = spring.getBean("modelService", ModelService.class)

def catalogId = "${contentCatalogId}"
def dryRun = ${dryRun}
def removeCatalog = ${removeCatalog}
def maxPasses = ${maxPasses}

def ITEM_TYPES = ["CMSItem", "Media"]

try {
  def q = new FlexibleSearchQuery("SELECT {pk} FROM {ContentCatalog} WHERE {id} = ?id")
  q.addQueryParameter("id", catalogId)
  def catalog = flexSvc.search(q).result.find()
  if (!catalog) {
    return JsonOutput.toJson([error: "ContentCatalog not found: " + catalogId])
  }

  def countByType = { version, type ->
    def cq = new FlexibleSearchQuery("SELECT COUNT({pk}) FROM {" + type + "} WHERE {catalogVersion} = ?cv")
    cq.addQueryParameter("cv", version)
    cq.setResultClassList([Long.class])
    return (flexSvc.search(cq).result.find() ?: 0L) as long
  }

  def report = [catalogId: catalogId, dryRun: dryRun, removeCatalog: removeCatalog, versions: []]
  def versions = new ArrayList(catalog.catalogVersions)

  for (version in versions) {
    def vReport = [version: version.version, initialCounts: [:], passes: [], finalCounts: [:], versionRemoved: false]
    long totalInitial = 0
    for (type in ITEM_TYPES) {
      def c = countByType(version, type)
      vReport.initialCounts[type] = c
      totalInitial += c
    }

    if (!dryRun && totalInitial > 0) {
      for (int pass = 0; pass < maxPasses; pass++) {
        int attempted = 0
        int removed = 0
        int failed = 0
        def sampleErrors = []
        for (type in ITEM_TYPES) {
          def itemsQ = new FlexibleSearchQuery("SELECT {pk} FROM {" + type + "} WHERE {catalogVersion} = ?cv")
          itemsQ.addQueryParameter("cv", version)
          def items = flexSvc.search(itemsQ).result
          attempted += items.size()
          for (item in items) {
            try {
              modelSvc.remove(item)
              removed++
            } catch (Exception e) {
              failed++
              if (sampleErrors.size() < 3) sampleErrors << (item.getClass().simpleName + ": " + e.message)
            }
          }
        }
        vReport.passes << [pass: pass + 1, attempted: attempted, removed: removed, failed: failed, sampleErrors: sampleErrors]
        if (attempted == 0 || removed == 0) break
      }
    }

    long totalFinal = 0
    for (type in ITEM_TYPES) {
      def c = countByType(version, type)
      vReport.finalCounts[type] = c
      totalFinal += c
    }

    if (removeCatalog && !dryRun && totalFinal == 0) {
      if (catalog.activeCatalogVersion?.pk == version.pk) {
        catalog.setActiveCatalogVersion(null)
        modelSvc.save(catalog)
        vReport.clearedActiveCatalogVersion = true
      }
      try {
        modelSvc.remove(version)
        vReport.versionRemoved = true
      } catch (Exception e) {
        vReport.versionRemoveError = e.message
      }
    }

    report.versions << vReport
  }

  def allClear = report.versions.every {
    def fc = (it.finalCounts.values().sum() ?: 0) as long
    fc == 0 && it.versionRemoved
  }
  if (removeCatalog && !dryRun && allClear) {
    try {
      modelSvc.remove(catalog)
      report.catalogRemoved = true
    } catch (Exception e) {
      report.catalogRemoveError = e.message
    }
  }

  return JsonOutput.toJson(report)
} catch (Throwable t) {
  return JsonOutput.toJson([
    error: t.class.simpleName + ": " + t.message,
    stack: t.stackTrace.take(5).collect { it.toString() }
  ])
}
`;

          result = await hybrisClient.executeGroovyScript(script, !dryRun);
          break;
        }

        case 'storefront_list': {
          result = {
            presets: [...storefrontPresets.values()].map((p) => ({
              name: p.name,
              baseUrl: p.baseUrl,
              username: p.username,
              loginPath: p.loginPath,
              loginSubmitPath: p.loginSubmitPath,
              secureCheckPath: p.secureCheckPath,
            })),
          };
          break;
        }

        case 'storefront_login': {
          const resolved = resolveStorefront(args, storefrontPresets);
          const client = new StorefrontClient(resolved);
          result = { storefront: resolved.name, baseUrl: resolved.baseUrl, ...(await client.login()) };
          break;
        }

        case 'export_cms_page': {
          const pageUid = validateString(args, 'pageUid', true);
          const catalog = validateString(args, 'catalog', true);
          const catalogVersion = validateString(args, 'catalogVersion', false) ?? 'Staged';
          const baseLang = validateString(args, 'baseLang', false) ?? 'en';
          const extraLangs = validateStringArray(args, 'extraLangs', false) ?? [];
          const targetCatalog = validateString(args, 'targetCatalog', false) ?? catalog;
          const targetCatalogVersion =
            validateString(args, 'targetCatalogVersion', false) ?? catalogVersion;
          result = await hybrisClient.exportCmsPage({
            pageUid,
            catalog,
            catalogVersion,
            baseLang,
            extraLangs,
            targetCatalog,
            targetCatalogVersion,
          });
          break;
        }

        case 'storefront_get': {
          const resolved = resolveStorefront(args, storefrontPresets);
          const path = validateString(args, 'path', true);
          const client = new StorefrontClient(resolved);
          const loginResult = await client.login();
          if (!loginResult.isAuthenticated) {
            result = { storefront: resolved.name, loginFailed: true, loginResult };
            break;
          }
          const getResult = await client.authenticatedGet(
            { baseUrl: resolved.baseUrl, cookies: loginResult.cookies, csrfToken: loginResult.csrfToken },
            path
          );
          result = {
            storefront: resolved.name,
            loginSummary: { success: loginResult.success, finalUrl: loginResult.finalUrl },
            get: getResult,
          };
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hybris Runtime MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
