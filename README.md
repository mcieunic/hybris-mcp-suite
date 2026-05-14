# Hybris MCP Suite

Monorepo containing MCP (Model Context Protocol) servers for SAP Commerce Cloud (Hybris):

| Package | Description |
|---|---|
| [`@hybris-mcp/runtime`](./packages/runtime) | Runtime operations against a running Hybris instance: FlexibleSearch, Groovy, ImpEx, CronJobs, caches, logs, storefront login, CMS export. |
| [`@hybris-mcp/solr`](./packages/solr) | Solr admin & query: list cores, query, schema inspection/edits, reload, swap, backup, restore. Direct Solr HTTP plus a read-only `*_via_hac` variant that proxies through HAC's Groovy console (use on CCV2 where Solr isn't reachable). |
| [`@hybris-mcp/shared`](./packages/shared) | Shared validators, env loader, and `HacClient` (HAC session + Groovy exec) used by the servers above. |

## Layout

```
packages/
├── shared/      # validators + common types (no MCP server)
├── runtime/     # MCP server: hybris-mcp-runtime
└── solr/        # MCP server: hybris-mcp-solr
```

## What's new

### Local Solr — credentials via env

Local / on-prem Solr is now authenticated. Hybris bundles Solr with basic auth enabled, so the direct `solr_*` tools read credentials from `mcp-hybris-suite-env/local/solr.env`:

```bash
SOLR_URL=https://localhost:8983/solr/
SOLR_USERNAME=solrserver
SOLR_PASSWORD=<your-solr-password>
```

Nothing else moves — `.mcp.json` still only sets `HYBRIS_ENV=local`. Credentials never enter version control (`mcp-hybris-suite-env/` is gitignored).

### CCv2 Solr — read-only access via HAC

On CCv2 the Solr endpoint is internal and not reachable from your machine. The suite proxies read operations through HAC's Groovy console using your existing HAC credentials in `solr.env` (`HYBRIS_BASE_URL` / `HYBRIS_USERNAME` / `HYBRIS_PASSWORD`).

| Tool | What it does |
|---|---|
| `solr_list_cores_via_hac` | List all cores with doc counts, size, last modified |
| `solr_core_info_via_hac` | Detailed info for a single core (index version, segments, schema/config name) |
| `solr_query_via_hac` | Run a Solr query with field selection, filters, facets, sort, paging |
| `solr_schema_fields_via_hac` | List schema fields and their types |
| `solr_backup_status_via_hac` | Status of an in-progress / last backup |
| `solr_restore_status_via_hac` | Status of an in-progress / last restore |

All `*_via_hac` tools are **read-only**. Mutating operations (`solr_reload_core`, `solr_swap_core`, `solr_schema_add_field`, `solr_backup_core`, `solr_restore_core`) require direct Solr access and only work on local / on-prem environments.

## Setup

```bash
npm install
npm run build
```

This builds all workspaces (`shared` first, then the servers).

## MCP client configuration

Each server communicates over **stdio** — you register it as a JSON entry in your MCP client config. Where that config lives depends on the client:

| Client | Config file | Scope |
|---|---|---|
| **Claude Code** | `.mcp.json` in the project root | Project — shared via git, every team member gets the same servers |
| **Claude Code** | `~/.claude.json` | Global — available in every project on this machine |

All files use the same JSON structure — an `"mcpServers"` object where each key is a server name and the value describes how to start it.

> **After any config change you must restart the session** (restart Claude Code, relaunch Claude Desktop, or reload the IDE window). MCP servers are started once at session init and are not hot-reloaded.

### Environment-based credentials

Credentials are **not** stored in `.mcp.json`. Instead, each server reads a `HYBRIS_ENV` variable and loads the matching `.env` file from a gitignored directory:

```
mcp-hybris-suite-env/
├── local/
│   ├── runtime.env
│   └── solr.env
├── s1/
│   ├── runtime.env
│   └── solr.env
└── p1/
    ├── runtime.env
    └── solr.env
```

1. Copy the relevant sections from [`.env.example`](./.env.example) into the appropriate `runtime.env` / `solr.env` files and fill in your credentials.
2. In `.mcp.json`, only set `HYBRIS_ENV` — the server resolves everything else from the env files.

The `mcp-hybris-suite-env/` directory is gitignored — credentials never enter version control.

### Registering the servers

With env files in place, `.mcp.json` stays minimal — one entry per server per environment:

```json
{
  "mcpServers": {
    "hybris-local": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/hybris-mcp-suite/packages/runtime/dist/index.js"],
      "env": { "HYBRIS_ENV": "local" }
    },
    "hybris-s1": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/hybris-mcp-suite/packages/runtime/dist/index.js"],
      "env": { "HYBRIS_ENV": "s1" }
    },
    "hybris-solr": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/hybris-mcp-suite/packages/solr/dist/index.js"],
      "env": { "HYBRIS_ENV": "local" }
    }
  }
}
```

#### Solr: local vs CCv2

The Solr server's `.mcp.json` entry is the same on both — only `solr.env` differs:

| Environment | `solr.env` contains | Tools to use |
|---|---|---|
| **Local / on-prem** (Solr reachable from MCP host) | `SOLR_URL`, `SOLR_USERNAME`, `SOLR_PASSWORD` | `solr_*` (direct HTTP) |
| **CCv2** (Solr is internal, not reachable) | `HYBRIS_BASE_URL`, `HYBRIS_USERNAME`, `HYBRIS_PASSWORD` (same as `runtime.env`) | `solr_*_via_hac` (proxied through HAC Groovy console, read-only) |

You can populate both sets in the same `solr.env` — direct tools fail loudly when `SOLR_URL` is unreachable, `*_via_hac` tools fail loudly when HAC creds are missing.

### Storefront presets

Storefront login presets follow the naming pattern `STOREFRONT_<NAME>_URL` / `_USERNAME` / `_PASSWORD` inside `runtime.env`.
The `<NAME>` part becomes the preset identifier (lowercased) — it should match the **site ID** so the tools know which storefront belongs to which site.
For example, `STOREFRONT_B2B_URL` registers a preset named `b2b` for the B2B site.

You can define as many presets as you need — just repeat the triplet with a different name.

See [`.env.example`](./.env.example) for the full list of environment variables.

## How to use it

Once the servers are registered in your MCP client, just talk to your AI assistant in natural languokage. It will pick the right tool automatically.

### Querying & scripting

- *"Run a FlexibleSearch: SELECT {pk}, {code}, {name[en]} FROM {Product} WHERE {code} LIKE '%550%'"*
- *"Describe the type B2BUnit — show me all attributes including inherited ones"*
- *"Execute this Groovy script to fix the catalog version flag…"*
- *"Import impex abcd.impex"*

### CronJobs & system

- *"Show me all running CronJobs"*
- *"Trigger the full catalog sync CronJob"*
- *"Show me the last 20 ERROR-level log entries for the solrIndexerJob"*
- *"Clear all caches"*
- *"What Hybris version is running on this instance?"*
- *"Sync the staged content catalog to online"*


### Log analysis

- *"Show me the last 50 ERROR entries from the console log"*
- *"Search all logs for 'OutOfMemoryError' in the last 24 hours"*
- *"Read the last 100 ERROR entries from today's backgroundprocessing log on CCV2"*

### Storefront debugging

- *"Log in to the B2B storefront and show me each step"*
- *"Fetch /my-account/orders as the test user on the B2C storefront"*

### Solr

- *"List all Solr cores and their document counts"*
- *"Query the product core for 'camera' — show code, name, and price fields, faceted by category"*
- *"Show me all fields in the product core schema"*
- *"List Solr cores on CCV2 via HAC"* (uses `solr_list_cores_via_hac` — needs HAC creds in `solr.env`)
- *"Query the master_<index>_Product_default core on s1 through HAC for code:550*"*

## Development

- `npm run build` — compile all packages (TypeScript project references)
- `npm run build:runtime` / `build:solr` / `build:shared` — single workspace
- `npm run clean` — remove all `dist/` folders

Each package has its own `README.md` with package-specific notes.

## Provenance

`runtime` and `solr` were extracted from the `hybris-runtime-mcp` standalone repo. The original repo is preserved unchanged for reference; future work happens here.
