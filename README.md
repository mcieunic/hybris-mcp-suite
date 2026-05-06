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

All files use the same JSON structure — an `"mcpServers"` object where each key is a server name and the value describes how to start it (see examples below).

> **After any config change you must restart the session** (restart Claude Code, relaunch Claude Desktop, or reload the IDE window). MCP servers are started once at session init and are not hot-reloaded.

### Storefront presets

Storefront login presets follow the naming pattern `STOREFRONT_<NAME>_URL` / `_USERNAME` / `_PASSWORD`.
The `<NAME>` part becomes the preset identifier (lowercased) — it should match the **site ID** so the tools know which storefront belongs to which site.
For example, `STOREFRONT_B2B_URL` registers a preset named `b2b` for the B2B site.

You can define as many presets as you need — just repeat the triplet with a different name.

### Runtime — local development instance

```json
"hybris-local": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/hybris-mcp-suite/packages/runtime/dist/index.js"],
  "env": {
    "HYBRIS_BASE_URL": "https://localhost:9002",
    "HYBRIS_USERNAME": "admin",
    "HYBRIS_PASSWORD": "nimda",
    "HYBRIS_LOG_PATH": "/path/to/project/hybris/log",
    "NODE_TLS_REJECT_UNAUTHORIZED": "0",
    "STOREFRONT_B2B_URL": "https://b2b.local:9002/yacceleratorstorefront",
    "STOREFRONT_B2B_USERNAME": "john.doe@example.com",
    "STOREFRONT_B2B_PASSWORD": "Test1234",
    "STOREFRONT_B2C_URL": "https://b2c.local:9002/yacceleratorstorefront",
    "STOREFRONT_B2C_USERNAME": "jane.doe@example.com",
    "STOREFRONT_B2C_PASSWORD": "Test1234"
  }
}
```

### Runtime — CCv2 remote environment

```json
"hybris-x1": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/hybris-mcp-suite/packages/runtime/dist/index.js"],
  "env": {
    "HYBRIS_BASE_URL": "https://backoffice.xxxxxxxx-yourproject-x1-public.model-t.cc.commerce.ondemand.com",
    "HYBRIS_USERNAME": "your.ccv2.user@company.com",
    "HYBRIS_PASSWORD": "YourSecurePassword",
    "NODE_TLS_REJECT_UNAUTHORIZED": "0",
    "STOREFRONT_B2B_URL": "https://b2b.xxxxxxxx-yourproject-x1-public.model-t.cc.commerce.ondemand.com",
    "STOREFRONT_B2B_USERNAME": "john.doe@example.com",
    "STOREFRONT_B2B_PASSWORD": "Test1234",
    "STOREFRONT_B2C_URL": "https://b2c.xxxxxxxx-yourproject-x1-public.model-t.cc.commerce.ondemand.com",
    "STOREFRONT_B2C_USERNAME": "jane.doe@example.com",
    "STOREFRONT_B2C_PASSWORD": "Test1234",
    "AZURE_BLOB_LOG_ACCOUNT_NAME": "your-storage-account-name",
    "AZURE_BLOB_LOG_ACCOUNT_KEY": "yourBase64EncodedAccountKey==",
    "AZURE_BLOB_LOG_CONTAINER": "commerce-logs-separated",
    "AZURE_BLOB_LOG_ENDPOINT": "https://your-storage-account-name.blob.core.windows.net",
    "AZURE_BLOB_LOG_CACHE_DIR": "/path/to/project/hybris/log/.azure-cache-x1"
  }
}
```

### Solr — local instance

```json
"hybris-solr": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/hybris-mcp-suite/packages/solr/dist/index.js"],
  "env": {
    "SOLR_URL": "http://localhost:8983/solr/",
    "NODE_TLS_REJECT_UNAUTHORIZED": "0"
  }
}
```

### Solr — CCv2 remote environment

```json
"hybris-solr-x1": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/hybris-mcp-suite/packages/solr/dist/index.js"],
  "env": {
    "SOLR_URL": "https://solr.xxxxxxxx-yourproject-x1-public.model-t.cc.commerce.ondemand.com/",
    "SOLR_USERNAME": "solradmin",
    "SOLR_PASSWORD": "YourSolrPassword",
    "NODE_TLS_REJECT_UNAUTHORIZED": "0"
  }
}
```

See [`.env.example`](./.env.example) for the full list of environment variables.

## How to use it

Once the servers are registered in your MCP client, just talk to your AI assistant in natural language. It will pick the right tool automatically.

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
