# hybris-mcp-suite

MCP servers for SAP Commerce Cloud (Hybris) operations. TypeScript monorepo with three packages, each shipping its own stdio MCP server binary.

## Packages

- `packages/shared` — common helpers: `loadEnvFile(pkg)` (reads `.env` per package), arg validators (`validateString` / `validateNumber` / `validateBoolean` / `validateStringArray`), and `HacClient` (minimal HAC session + `executeGroovyScript`). `HacClient` is the canonical low-level HAC primitive — runtime's bigger `HybrisClient` still owns its own session today, but new HAC consumers (e.g. solr) should use `HacClient` from shared.
- `packages/runtime` — Owns `HybrisClient` (browser-style session against HAC), log readers (local + Azure blob), storefront client, CMS export. Server name: `hybris-mcp-runtime`. Tools: `execute_groovy`, `flexible_search`, `describe_type`, `import_impex`, `export_impex`, `get_cronjobs`, `trigger_cronjob`, log/storefront/CMS tools.
- `packages/solr` — Solr tools, two transports:
  - direct Solr HTTP via `SolrClient`: `solr_list_cores`, `solr_core_info`, `solr_query`, `solr_schema_fields`, `solr_reload_core`, `solr_swap_core`, `solr_backup_core`, `solr_restore_core`, `solr_backup_status`, `solr_restore_status`, `solr_schema_add_field`.
  - via HAC Groovy console (for CCV2 where Solr isn't reachable) using `solrServerService.getSolrServer` — `HacSolrClient` + scripts in `hac-solr-scripts.ts`: `solr_list_cores_via_hac`, `solr_core_info_via_hac`, `solr_query_via_hac`, `solr_schema_fields_via_hac`, `solr_backup_status_via_hac`, `solr_restore_status_via_hac`. Read-only. Server name: `hybris-mcp-solr`.

The runtime MCP can be instantiated multiple times with different envs (e.g. `hybris-runtime` vs `hybris-runtime-s1`) — same code, different `.env`.

## Architecture split

- **Transport**: runtime is HAC-only (`/console/scripting/execute`, FlexibleSearch, ImpEx). solr supports both — direct Solr HTTP via `SolrClient`, and HAC-Groovy via `HacSolrClient` (uses shared's `HacClient`). Choose the HAC variant for CCV2 (Solr is internal) or whenever the local Solr URL isn't reachable from the MCP host.
- **Where HAC lives**: shared owns the HAC session primitive (`HacClient`). Consumers (runtime, solr) build domain logic on top of it. Don't reimplement HAC login in new packages — import from shared.
- HTTPS to local Hybris uses self-signed certs; entry points set `NODE_TLS_REJECT_UNAUTHORIZED=0` when not already defined.

## Adding a tool

Each server's `src/index.ts` follows the same shape:

1. Append a `Tool` entry to the `tools: Tool[]` array — `name`, `description`, `inputSchema` (JSONSchema, `required` listed explicitly).
2. Add a `case '<name>':` to the `CallToolRequestSchema` switch.
3. Pull args via `validateString(args, 'field', required)` etc. — never trust shape.
4. Return data; the wrapper serialises to JSON in `content[0].text`. Errors throw → wrapper returns `{ isError: true }`.

## Confirm pattern for destructive ops

Tools that mutate state take `confirm: boolean` (default false). When `confirm !== true`, return `{ dryRun: true, action, ...planned, hint: 'Pass confirm=true to execute.' }` instead of executing. See `solr_reload_core`, `solr_swap_core`, `solr_backup_core`, `solr_restore_core` (latter adds a `warning: 'DESTRUCTIVE'`), `solr_schema_add_field`.

## HAC Groovy execution

`HybrisClient.executeGroovyScript(script, commit?, timeoutMs?)` POSTs form-encoded `script` + `scriptType=groovy` + `commit` to `${baseUrl}${hacPrefix}/console/scripting/execute`. Returns `{ output, result }` mapped from HAC's `outputText` / `executionResult`. Groovy scripts that need to return structured data should `println JsonOutput.toJson(...)` — the caller parses `output`.

When embedding user input in Groovy, escape backslashes and quotes (see `describe_type` for the pattern, `escapeGroovyString` helper for impex).

## Solr core naming (Hybris convention)

`<master|slave>_<indexName>_<type>_<config>`, e.g. `master_<index>_Product_default`. Worth surfacing in tool descriptions so callers can guess core names.

## Env

- runtime: HAC creds (`HYBRIS_BASE_URL`, `HYBRIS_USERNAME`, `HYBRIS_PASSWORD`) + `HYBRIS_LOG_PATH` (local logs) + Azure blob log vars (`AZURE_BLOB_LOG_SAS_URL` or `AZURE_BLOB_LOG_ACCOUNT_NAME` + key + container; cache dir from `AZURE_BLOB_LOG_CACHE_DIR` or falls back to `HYBRIS_LOG_PATH`). Log tools throw a clear "disabled — set X" error when env is missing.
- solr:
  - direct: `SOLR_URL` (default `https://localhost:8983/solr/` — Hybris bundles Solr with SSL enabled), `SOLR_USERNAME`, `SOLR_PASSWORD`.
  - HAC variants (`*_via_hac`): same HAC creds as runtime — `HYBRIS_BASE_URL`, `HYBRIS_USERNAME`, `HYBRIS_PASSWORD` (and optional `HYBRIS_HAC_PATH`, defaults to `/hac`). Read from `mcp-hybris-suite-env/<env>/solr.env`. Throws a clear "disabled" error if missing. Re-use the same values you have in `runtime.env`.
