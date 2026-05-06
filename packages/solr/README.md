# @hybris-mcp/solr

MCP server for **Hybris Solr** administration and querying.

## Tools

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

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SOLR_URL` | `http://localhost:8983/solr/` | Base URL of the Solr instance |
| `SOLR_USERNAME` | — | Optional basic-auth user |
| `SOLR_PASSWORD` | — | Optional basic-auth password |

## Run

```bash
npm run build --workspace @hybris-mcp/solr
node packages/solr/dist/index.js
```
