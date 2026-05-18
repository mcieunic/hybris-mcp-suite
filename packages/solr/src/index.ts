#!/usr/bin/env node

// Load environment from .env file before anything reads process.env
import { loadEnvFile } from '@hybris-mcp/shared';
loadEnvFile('solr');

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
  HacClient,
  HacConfig,
  resolveHacPrefix,
} from '@hybris-mcp/shared';
import { SolrClient, SolrConfig } from './solr-client.js';
import { HacSolrClient } from './hac-solr-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

function getSolrClient(): SolrClient {
  const cfg: SolrConfig = {
    baseUrl: process.env.SOLR_URL || 'https://localhost:8983/solr/',
    username: process.env.SOLR_USERNAME,
    password: process.env.SOLR_PASSWORD,
  };
  return new SolrClient(cfg);
}

let hacSolrClientSingleton: HacSolrClient | null = null;
function getHacSolrClient(): HacSolrClient {
  if (hacSolrClientSingleton) return hacSolrClientSingleton;
  const baseUrl = process.env.HYBRIS_BASE_URL;
  const username = process.env.HYBRIS_USERNAME;
  const password = process.env.HYBRIS_PASSWORD;
  if (!baseUrl || !username || !password) {
    throw new Error(
      'HAC tools are disabled: set HYBRIS_BASE_URL, HYBRIS_USERNAME and HYBRIS_PASSWORD in this package env (mcp-hybris-suite-env/<env>/solr.env).'
    );
  }
  const cfg: HacConfig = {
    baseUrl,
    username,
    password,
    hacPath: resolveHacPrefix(process.env.HYBRIS_HAC_PATH),
  };
  hacSolrClientSingleton = new HacSolrClient(new HacClient(cfg));
  return hacSolrClientSingleton;
}

const tools: Tool[] = [
  {
    name: 'solr_list_cores',
    description:
      'List Solr cores (indexes) with doc counts and size. Solr URL via env SOLR_URL (default https://localhost:8983/solr/ — Hybris bundles Solr with SSL enabled). Hybris cores follow the pattern <master|slave>_<indexName>_<type>_<config> (e.g. master_<index>_Product_default).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'solr_core_info',
    description: 'Return full STATUS payload for a single Solr core (index, schema/config files, uptime, data dir, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name as returned by solr_list_cores (e.g. master_<index>_Product_default).' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_query',
    description:
      'Execute a Solr query against a specific core. Supports the standard /select params: q, fq (array), fl, sort, start, rows, q.op, defType, faceting and arbitrary extras. Returns the raw Solr JSON response (response.docs, facet_counts, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name (see solr_list_cores).' },
        q: { type: 'string', description: 'Main query. Defaults to *:*.' },
        fq: { type: 'array', items: { type: 'string' }, description: 'Filter queries (one entry per fq).' },
        fl: { type: 'string', description: 'Comma-separated field list to return.' },
        sort: { type: 'string', description: 'Sort spec, e.g. "score desc, code_string asc".' },
        start: { type: 'number', minimum: 0 },
        rows: { type: 'number', minimum: 0, maximum: 1000, description: 'Max rows. Defaults to Solr default (10) if omitted.' },
        qOp: { type: 'string', enum: ['AND', 'OR'], description: 'q.op default operator.' },
        defType: { type: 'string', description: 'Query parser (e.g. edismax).' },
        facet: { type: 'boolean', description: 'Enable faceting.' },
        facetField: { type: 'array', items: { type: 'string' }, description: 'facet.field entries.' },
        requestHandler: { type: 'string', description: 'Request handler path under the core. Defaults to "select".' },
        extra: {
          type: 'object',
          description: 'Arbitrary extra Solr params (string or string[]). Use for hl, group, debug, etc.',
          additionalProperties: true,
        },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_schema_fields',
    description: 'Return schema fields, dynamic fields, and uniqueKey for a Solr core. Useful for finding the right field name (e.g. *_text_pl, *_string).',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name (see solr_list_cores).' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_reload_core',
    description:
      'Reload a Solr core to pick up changes to solrconfig.xml / schema.xml / managed-schema without restarting Solr. Safe to call after schema edits or config changes. Requires confirm=true to execute.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name to reload (see solr_list_cores).' },
        confirm: { type: 'boolean', description: 'Must be true to execute (default false → dry-run that returns the planned action).' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_swap_core',
    description:
      'Swap two Solr cores atomically (Admin/Cores SWAP). Useful for blue-green index promotion: build into a shadow core, then swap names so traffic on the original name now hits the new index. Both cores must already exist. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'First core name (typically the live one).' },
        other: { type: 'string', description: 'Second core name to swap with.' },
        confirm: { type: 'boolean', description: 'Must be true to execute (default false → dry-run).' },
      },
      required: ['core', 'other'],
    },
  },
  {
    name: 'solr_backup_core',
    description:
      'Snapshot a Solr core via the Replication handler (command=backup). Stores a snapshot named "snapshot.<name>" under `location` (or core data dir if omitted). Use solr_backup_status to check progress / latest backups. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name to back up.' },
        name: { type: 'string', description: 'Backup name suffix — final dir is "snapshot.<name>".' },
        location: { type: 'string', description: 'Absolute filesystem path where the snapshot should be written (must be writable by Solr). If omitted, Solr uses the core data dir.' },
        repository: { type: 'string', description: 'Optional named backup repository configured in solr.xml.' },
        async: { type: 'string', description: 'Optional async request id for non-blocking execution (poll with REQUESTSTATUS).' },
        confirm: { type: 'boolean', description: 'Must be true to execute (default false → dry-run).' },
      },
      required: ['core', 'name'],
    },
  },
  {
    name: 'solr_restore_core',
    description:
      'Restore a Solr core from a snapshot taken with solr_backup_core (replication handler command=restore). The core must exist; data is replaced with the snapshot. Use solr_restore_status to check progress. Requires confirm=true. DESTRUCTIVE — overwrites the index.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Target core to restore into.' },
        name: { type: 'string', description: 'Snapshot name (the suffix used in solr_backup_core; matches "snapshot.<name>" on disk).' },
        location: { type: 'string', description: 'Absolute filesystem path where the snapshot lives.' },
        repository: { type: 'string', description: 'Optional named backup repository.' },
        async: { type: 'string', description: 'Optional async request id.' },
        confirm: { type: 'boolean', description: 'Must be true to execute (default false → dry-run).' },
      },
      required: ['core', 'name'],
    },
  },
  {
    name: 'solr_backup_status',
    description: 'Read replication details for a core, including the list of recent backups (snapshots), their status and timestamps. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name.' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_restore_status',
    description: 'Read the status of the most recent restore operation on a core (replication command=restorestatus). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name.' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_schema_add_field',
    description:
      'Add (or replace) a field in a Solr core schema via the Schema API. Optionally also adds copyField rules from this field to the listed destinations. Reload is NOT automatic — call solr_reload_core afterwards if needed (managed-schema reloads itself, but classic schema.xml does not). Requires confirm=true. ' +
      'Typical use: attach extra localized fields (e.g. name_text_cs / name_text_sk) to a CZ/SK core without touching solrconfig.xml.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name.' },
        name: { type: 'string', description: 'Field name (e.g. "name_text_cs").' },
        type: { type: 'string', description: 'Field type defined in the schema (e.g. "text_pl", "string", "pdouble").' },
        indexed: { type: 'boolean', description: 'Default true.' },
        stored: { type: 'boolean', description: 'Default true.' },
        multiValued: { type: 'boolean' },
        required: { type: 'boolean' },
        docValues: { type: 'boolean' },
        default: { type: 'string', description: 'Default value when missing.' },
        copyTo: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of destination fields to add as copyField sources from this field (e.g. ["autosuggest_cs","spellcheck_cs"]).',
        },
        replace: { type: 'boolean', description: 'If true, use replace-field instead of add-field (modifies existing). Default false.' },
        confirm: { type: 'boolean', description: 'Must be true to execute (default false → dry-run that returns the planned payload).' },
      },
      required: ['core', 'name', 'type'],
    },
  },
  {
    name: 'solr_list_cores_via_hac',
    description:
      'List Solr cores via Hybris HAC (Groovy console) using solrServerService.getSolrServer. Use when Solr is not reachable directly (e.g. CCV2). ' +
      'Iterates every FacetSearchConfig in the system, dedupes by Solr server endpoint, and returns numDocs/sizeInBytes/instanceDir per core. ' +
      'Requires HYBRIS_BASE_URL/HYBRIS_USERNAME/HYBRIS_PASSWORD in solr.env.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'solr_core_info_via_hac',
    description:
      'Return full CoreAdmin STATUS for a single core via HAC. Auto-resolves which FacetSearchConfig owns the core unless `facetSearchConfig` is provided.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name (e.g. master_<index>_Product_default).' },
        facetSearchConfig: { type: 'string', description: 'Optional FacetSearchConfig name to scope the lookup (skips auto-discovery).' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_query_via_hac',
    description:
      'Execute a Solr /select query against a specific core through HAC. Mirrors solr_query params (q, fq, fl, sort, start, rows, qOp, defType, facet, facetField, requestHandler, extra). Returns the raw Solr response tree (response.docs, facet_counts, ...).',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string', description: 'Core name.' },
        facetSearchConfig: { type: 'string', description: 'Optional FacetSearchConfig name (skips auto-discovery).' },
        q: { type: 'string', description: 'Main query. Defaults to *:*.' },
        fq: { type: 'array', items: { type: 'string' } },
        fl: { type: 'string' },
        sort: { type: 'string' },
        start: { type: 'number', minimum: 0 },
        rows: { type: 'number', minimum: 0, maximum: 1000 },
        qOp: { type: 'string', enum: ['AND', 'OR'] },
        defType: { type: 'string' },
        facet: { type: 'boolean' },
        facetField: { type: 'array', items: { type: 'string' } },
        requestHandler: { type: 'string', description: 'Request handler path, defaults to "select".' },
        extra: { type: 'object', description: 'Arbitrary extra Solr params (string or string[]).', additionalProperties: true },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_schema_fields_via_hac',
    description: 'Return schema fields, dynamic fields, and uniqueKey for a core via HAC (SchemaRequest.Fields / DynamicFields / UniqueKey).',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string' },
        facetSearchConfig: { type: 'string' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_backup_status_via_hac',
    description: 'Replication details for a core via HAC (command=details). Includes recent backups and replication status. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string' },
        facetSearchConfig: { type: 'string' },
      },
      required: ['core'],
    },
  },
  {
    name: 'solr_restore_status_via_hac',
    description: 'Status of the most recent restore on a core via HAC (replication command=restorestatus). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        core: { type: 'string' },
        facetSearchConfig: { type: 'string' },
      },
      required: ['core'],
    },
  },
];

async function main() {
  const server = new Server(
    {
      name: 'hybris-mcp-solr',
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const shutdown = async () => {
    console.error('Shutting down Hybris Solr MCP server...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'solr_list_cores': {
          const solr = getSolrClient();
          result = { cores: await solr.listCores() };
          break;
        }

        case 'solr_core_info': {
          const solr = getSolrClient();
          result = await solr.coreInfo(validateString(args, 'core', true));
          break;
        }

        case 'solr_query': {
          const solr = getSolrClient();
          const core = validateString(args, 'core', true);
          const q = validateString(args, 'q', false);
          const fq = validateStringArray(args, 'fq', false);
          const fl = validateString(args, 'fl', false);
          const sort = validateString(args, 'sort', false);
          const start = validateNumber(args, 'start', { min: 0 });
          const rows = validateNumber(args, 'rows', { min: 0, max: 1000 });
          const qOp = validateString(args, 'qOp', false);
          const defType = validateString(args, 'defType', false);
          const facet = validateBoolean(args, 'facet', false);
          const facetField = validateStringArray(args, 'facetField', false);
          const requestHandler = validateString(args, 'requestHandler', false);
          const extraRaw = args?.extra;
          let extra: Record<string, string | string[]> | undefined;
          if (extraRaw !== undefined && extraRaw !== null) {
            if (typeof extraRaw !== 'object' || Array.isArray(extraRaw)) {
              throw new Error('extra must be an object');
            }
            extra = {};
            for (const [k, v] of Object.entries(extraRaw as Record<string, unknown>)) {
              if (typeof v === 'string') extra[k] = v;
              else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) extra[k] = v as string[];
              else throw new Error(`extra.${k} must be a string or string[]`);
            }
          }
          if (qOp !== undefined && qOp !== 'AND' && qOp !== 'OR') {
            throw new Error('qOp must be "AND" or "OR"');
          }
          result = await solr.query({
            core,
            q,
            fq,
            fl,
            sort,
            start,
            rows,
            qOp: qOp as 'AND' | 'OR' | undefined,
            defType,
            facet,
            facetField,
            requestHandler,
            extra,
          });
          break;
        }

        case 'solr_schema_fields': {
          const solr = getSolrClient();
          result = await solr.schemaFields(validateString(args, 'core', true));
          break;
        }

        case 'solr_reload_core': {
          const core = validateString(args, 'core', true);
          const confirm = validateBoolean(args, 'confirm', false);
          if (!confirm) {
            result = { dryRun: true, action: 'RELOAD', core, hint: 'Pass confirm=true to execute.' };
            break;
          }
          const solr = getSolrClient();
          result = { action: 'RELOAD', core, response: await solr.reloadCore(core) };
          break;
        }

        case 'solr_swap_core': {
          const core = validateString(args, 'core', true);
          const other = validateString(args, 'other', true);
          const confirm = validateBoolean(args, 'confirm', false);
          if (!confirm) {
            result = { dryRun: true, action: 'SWAP', core, other, hint: 'Pass confirm=true to execute.' };
            break;
          }
          const solr = getSolrClient();
          result = { action: 'SWAP', core, other, response: await solr.swapCores(core, other) };
          break;
        }

        case 'solr_backup_core': {
          const core = validateString(args, 'core', true);
          const name = validateString(args, 'name', true);
          const location = validateString(args, 'location', false);
          const repository = validateString(args, 'repository', false);
          const asyncId = validateString(args, 'async', false);
          const confirm = validateBoolean(args, 'confirm', false);
          if (!confirm) {
            result = { dryRun: true, action: 'BACKUP', core, name, location, repository, async: asyncId, hint: 'Pass confirm=true to execute.' };
            break;
          }
          const solr = getSolrClient();
          result = {
            action: 'BACKUP',
            core,
            name,
            response: await solr.backupCore({ core, name, location, repository, async: asyncId }),
          };
          break;
        }

        case 'solr_restore_core': {
          const core = validateString(args, 'core', true);
          const name = validateString(args, 'name', true);
          const location = validateString(args, 'location', false);
          const repository = validateString(args, 'repository', false);
          const asyncId = validateString(args, 'async', false);
          const confirm = validateBoolean(args, 'confirm', false);
          if (!confirm) {
            result = { dryRun: true, action: 'RESTORE', core, name, location, repository, async: asyncId, warning: 'DESTRUCTIVE: overwrites index. Pass confirm=true to execute.' };
            break;
          }
          const solr = getSolrClient();
          result = {
            action: 'RESTORE',
            core,
            name,
            response: await solr.restoreCore({ core, name, location, repository, async: asyncId }),
          };
          break;
        }

        case 'solr_backup_status': {
          const solr = getSolrClient();
          result = await solr.backupStatus(validateString(args, 'core', true));
          break;
        }

        case 'solr_restore_status': {
          const solr = getSolrClient();
          result = await solr.restoreStatus(validateString(args, 'core', true));
          break;
        }

        case 'solr_schema_add_field': {
          const core = validateString(args, 'core', true);
          const fieldName = validateString(args, 'name', true);
          const type = validateString(args, 'type', true);
          const indexed = args && 'indexed' in args ? validateBoolean(args, 'indexed', true) : undefined;
          const stored = args && 'stored' in args ? validateBoolean(args, 'stored', true) : undefined;
          const multiValued = args && 'multiValued' in args ? validateBoolean(args, 'multiValued', false) : undefined;
          const required = args && 'required' in args ? validateBoolean(args, 'required', false) : undefined;
          const docValues = args && 'docValues' in args ? validateBoolean(args, 'docValues', false) : undefined;
          const defaultVal = validateString(args, 'default', false);
          const copyTo = validateStringArray(args, 'copyTo', false);
          const replace = validateBoolean(args, 'replace', false);
          const confirm = validateBoolean(args, 'confirm', false);

          const planned = {
            core,
            field: { name: fieldName, type, indexed, stored, multiValued, required, docValues, default: defaultVal },
            copyTo,
            replace,
          };
          if (!confirm) {
            result = { dryRun: true, action: replace ? 'replace-field' : 'add-field', planned, hint: 'Pass confirm=true to execute.' };
            break;
          }
          const solr = getSolrClient();
          result = {
            action: replace ? 'replace-field' : 'add-field',
            planned,
            response: await solr.schemaAddField({
              core,
              name: fieldName,
              type,
              indexed,
              stored,
              multiValued,
              required,
              docValues,
              default: defaultVal,
              copyTo,
              replace,
            }),
          };
          break;
        }

        case 'solr_list_cores_via_hac': {
          result = await getHacSolrClient().listCores();
          break;
        }

        case 'solr_core_info_via_hac': {
          const core = validateString(args, 'core', true)!;
          const fsConfig = validateString(args, 'facetSearchConfig', false);
          result = await getHacSolrClient().coreInfo(core, fsConfig);
          break;
        }

        case 'solr_query_via_hac': {
          const core = validateString(args, 'core', true)!;
          const fsConfig = validateString(args, 'facetSearchConfig', false);
          const q = validateString(args, 'q', false);
          const fq = validateStringArray(args, 'fq', false);
          const fl = validateString(args, 'fl', false);
          const sort = validateString(args, 'sort', false);
          const start = validateNumber(args, 'start', { min: 0 });
          const rows = validateNumber(args, 'rows', { min: 0, max: 1000 });
          const qOp = validateString(args, 'qOp', false);
          const defType = validateString(args, 'defType', false);
          const facet = validateBoolean(args, 'facet', false);
          const facetField = validateStringArray(args, 'facetField', false);
          const requestHandler = validateString(args, 'requestHandler', false);
          const extraRaw = args?.extra;
          let extra: Record<string, string | string[]> | undefined;
          if (extraRaw !== undefined && extraRaw !== null) {
            if (typeof extraRaw !== 'object' || Array.isArray(extraRaw)) {
              throw new Error('extra must be an object');
            }
            extra = {};
            for (const [k, v] of Object.entries(extraRaw as Record<string, unknown>)) {
              if (typeof v === 'string') extra[k] = v;
              else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) extra[k] = v as string[];
              else throw new Error(`extra.${k} must be a string or string[]`);
            }
          }
          if (qOp !== undefined && qOp !== 'AND' && qOp !== 'OR') {
            throw new Error('qOp must be "AND" or "OR"');
          }
          result = await getHacSolrClient().query(
            core,
            {
              q,
              fq,
              fl,
              sort,
              start,
              rows,
              qOp: qOp as 'AND' | 'OR' | undefined,
              defType,
              facet,
              facetField,
              requestHandler,
              extra,
            },
            fsConfig
          );
          break;
        }

        case 'solr_schema_fields_via_hac': {
          const core = validateString(args, 'core', true)!;
          const fsConfig = validateString(args, 'facetSearchConfig', false);
          result = await getHacSolrClient().schemaFields(core, fsConfig);
          break;
        }

        case 'solr_backup_status_via_hac': {
          const core = validateString(args, 'core', true)!;
          const fsConfig = validateString(args, 'facetSearchConfig', false);
          result = await getHacSolrClient().backupStatus(core, fsConfig);
          break;
        }

        case 'solr_restore_status_via_hac': {
          const core = validateString(args, 'core', true)!;
          const fsConfig = validateString(args, 'facetSearchConfig', false);
          result = await getHacSolrClient().restoreStatus(core, fsConfig);
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hybris Solr MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
