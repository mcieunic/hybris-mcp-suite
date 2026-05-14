# Hybris MCP Suite

Monorepo containing MCP (Model Context Protocol) servers for SAP Commerce Cloud (Hybris):

| Package | Description |
|---|---|
| [`@hybris-mcp/runtime`](./packages/runtime) | Runtime operations against a running Hybris instance: FlexibleSearch, Groovy, ImpEx, CronJobs, caches, logs, storefront login, CMS export. |
| [`@hybris-mcp/solr`](./packages/solr) | Solr admin & query: list cores, query, schema inspection/edits, reload, swap, backup, restore. |
| [`@hybris-mcp/shared`](./packages/shared) | Shared validators and config types used by the servers above. |

## Layout

```
packages/
├── shared/      # validators + common types (no MCP server)
├── runtime/     # MCP server: hybris-mcp-runtime
└── solr/        # MCP server: hybris-mcp-solr
```

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

## Development

- `npm run build` — compile all packages (TypeScript project references)
- `npm run build:runtime` / `build:solr` / `build:shared` — single workspace
- `npm run clean` — remove all `dist/` folders

Each package has its own `README.md` with package-specific notes.

## Provenance

`runtime` and `solr` were extracted from the `hybris-runtime-mcp` standalone repo. The original repo is preserved unchanged for reference; future work happens here.
