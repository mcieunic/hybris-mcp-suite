# Hybris MCP Suite

Monorepo containing three MCP (Model Context Protocol) servers for SAP Commerce Cloud (Hybris):

| Package | Description |
|---|---|
| [`@hybris-mcp/runtime`](./packages/runtime) | Runtime operations against a running Hybris instance: products, orders, FlexibleSearch, Groovy, ImpEx, CronJobs, caches, logs, storefront login, CMS export. |
| [`@hybris-mcp/solr`](./packages/solr) | Solr admin & query: list cores, query, schema inspection/edits, reload, swap, backup, restore. |
| [`@hybris-mcp/knowledge`](./packages/knowledge) | Knowledge MCP scaffold (work in progress). |
| [`@hybris-mcp/shared`](./packages/shared) | Shared validators and config types used by the three servers above. |

## Layout

```
packages/
├── shared/      # validators + common types (no MCP server)
├── runtime/     # MCP server: hybris-mcp-runtime
├── solr/        # MCP server: hybris-mcp-solr
└── knowledge/   # MCP server: hybris-mcp-knowledge (scaffold)
```

## Setup

```bash
npm install
npm run build
```

This builds all four workspaces (`shared` first, then the three servers).

## Running an MCP server

Each server is wired up as a `bin` and run over stdio. Example MCP client config (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "hybris-runtime": {
      "command": "node",
      "args": ["/abs/path/hybris-mcp-suite/packages/runtime/dist/index.js"],
      "env": {
        "HYBRIS_BASE_URL": "https://localhost:9002",
        "HYBRIS_USERNAME": "admin",
        "HYBRIS_PASSWORD": "nimda"
      }
    },
    "hybris-solr": {
      "command": "node",
      "args": ["/abs/path/hybris-mcp-suite/packages/solr/dist/index.js"],
      "env": {
        "SOLR_URL": "http://localhost:8983/solr/"
      }
    }
  }
}
```

See [`.env.example`](./.env.example) for the full list of environment variables.

## Development

- `npm run build` — compile all packages (TypeScript project references)
- `npm run build:runtime` / `build:solr` / `build:knowledge` / `build:shared` — single workspace
- `npm run clean` — remove all `dist/` folders

Each package has its own `README.md` with package-specific notes.

## Provenance

`runtime` and `solr` were extracted from the `hybris-runtime-mcp` standalone repo. The original repo is preserved unchanged for reference; future work happens here.
