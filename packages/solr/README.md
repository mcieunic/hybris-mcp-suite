# @hybris-mcp/solr

MCP server for **Hybris Solr** administration and querying. Two transports:

- **Direct Solr HTTP** — fastest, but requires the Solr URL to be reachable from the MCP host (local dev, on-prem).
- **HAC Groovy console** — uses Hybris's `solrServerService.getSolrServer` from inside a HAC scripting console call. Use this on CCV2 where Solr isn't externally reachable.

## Tools — direct Solr HTTP

| Tool | Purpose |
|---|---|
| `solr_list_cores` | List cores with doc counts and size |
| `solr_core_info` | Full STATUS payload for a single core |
| `solr_query` | Run /select queries with full param surface |
| `solr_schema_fields` | List schema/dynamic fields and uniqueKey |
| `solr_reload_core` | Reload core (after schema/config edits) |
| `solr_swap_core` | Atomic SWAP for blue-green index promotion |
| `solr_backup_core` | Snapshot via Replication handler |
| `solr_restore_core` | Restore from a snapshot (DESTRUCTIVE) |
| `solr_backup_status` | Read backup history for a core |
| `solr_restore_status` | Read restore status for a core |
| `solr_schema_add_field` | Add/replace a schema field + optional copyField |

Mutating tools (`reload`, `swap`, `backup`, `restore`, `schema_add_field`) require `confirm: true`; otherwise they return a dry-run summary.

## Tools — via HAC (`*_via_hac`)

Read-only mirrors of the direct tools that go through Hybris HAC instead of hitting Solr directly. All per-core tools accept an optional `facetSearchConfig` to skip auto-discovery — by default the script iterates every `FacetSearchConfig` and finds the one that owns the requested core.

| Tool | Purpose |
|---|---|
| `solr_list_cores_via_hac` | List cores on every Solr server configured in Hybris, deduped by endpoint |
| `solr_core_info_via_hac` | Full CoreAdmin STATUS for a single core |
| `solr_query_via_hac` | `/select` query (same param surface as `solr_query`) |
| `solr_schema_fields_via_hac` | Schema fields, dynamic fields, uniqueKey |
| `solr_backup_status_via_hac` | Replication `details` (backup history) |
| `solr_restore_status_via_hac` | Replication `restorestatus` |

Under the hood: each tool runs a single Groovy script through HAC's `/console/scripting/execute` and parses one JSON line from the script's output. The script uses `facetSearchConfigService.getConfiguration(...)` → `solrServerService.getSolrServer(solrConfig[, coreName])` to obtain a Solr client.

## Configuration

| Variable | Default | Used by | Description |
|---|---|---|---|
| `SOLR_URL` | `https://localhost:8983/solr/` | direct | Base URL of the Solr instance. Hybris bundles Solr with SSL on by default; self-signed certs are accepted (server entry point sets `NODE_TLS_REJECT_UNAUTHORIZED=0` unless already defined). |
| `SOLR_USERNAME` | — | direct | Optional basic-auth user |
| `SOLR_PASSWORD` | — | direct | Optional basic-auth password |
| `HYBRIS_BASE_URL` | — | `*_via_hac` | Base URL of the Hybris instance (HAC) |
| `HYBRIS_USERNAME` | — | `*_via_hac` | HAC user |
| `HYBRIS_PASSWORD` | — | `*_via_hac` | HAC password |
| `HYBRIS_HAC_PATH` | `/hac` | `*_via_hac` | Optional HAC path override |

The HAC credentials are the same as those used by `@hybris-mcp/runtime` — re-use the values from your `runtime.env` in `solr.env`. The `*_via_hac` tools throw a clear "disabled" error if any of the three HAC vars is missing.

## Run

```bash
npm run build --workspace @hybris-mcp/solr
node packages/solr/dist/index.js
```
