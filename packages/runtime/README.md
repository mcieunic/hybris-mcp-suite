# @hybris-mcp/runtime

MCP server for **runtime operations** against a running SAP Commerce Cloud (Hybris) instance.

Splits off from the original `hybris-runtime-mcp` repo. Solr-specific tools moved to [`@hybris-mcp/solr`](../solr).

## Tool groups

- **Power tools:** `flexible_search`, `execute_groovy`, `describe_type`
- **ImpEx:** `import_impex`, `export_impex`
- **CronJobs:** `get_cronjobs`, `trigger_cronjob`, `get_cronjob_logs`
- **Ops:** `clear_cache`, `get_system_info`, `trigger_catalog_sync`, `run_project_data_update`, `health_check`
- **Logs (filesystem):** `list_logs`, `read_log`, `tail_latest_log`, `search_logs`, `correlate_logs`
- **Logs (Azure Blob):** `azure_list_logs`, `azure_download_log`, `azure_read_log`
- **Storefront debug:** `storefront_list`, `storefront_login`, `storefront_get`

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `HYBRIS_BASE_URL` | yes | — | Base URL (e.g. `https://localhost:9002`) |
| `HYBRIS_USERNAME` | yes | — | HAC admin user |
| `HYBRIS_PASSWORD` | yes | — | HAC admin password |
| `HYBRIS_HAC_PATH` | no | `/hac` | HAC mount path |
| `HYBRIS_LOG_PATH` | no | — | Enables filesystem log tools when set |
| `AZURE_BLOB_LOG_SAS_URL` | no | — | Container-scoped SAS URL — enables `azure_list_logs`/`azure_download_log`/`azure_read_log` |
| `AZURE_BLOB_LOG_CACHE_DIR` | no | `$HYBRIS_LOG_PATH/.azure-cache` | Local cache directory for downloaded blobs |
| `STOREFRONT_<NAME>_URL` etc. | no | — | Storefront login presets |

See [`../../runtime.env.example`](../../runtime.env.example) for the full list.

### Azure Blob log fetch (CCv2 / remote envs)

The Azure log tools download blob files into a local cache that mirrors the
on-disk Hybris log layout — blob name `tomcat/console-20260506.log` lands at
`<cache>/tomcat/console-20260506.log`, so `read_log`/`search_logs`/`correlate_logs`
work transparently against the cache.

| Tool | Description |
|------|-------------|
| `azure_list_logs` | List blobs under the container (optional `prefix`, e.g. `tomcat/`). Reports remote size, mtime and whether a copy is already cached. |
| `azure_download_log` | Download one blob into the cache, preserving its path. Idempotent (skips when cached size matches; pass `force: true` to override). |
| `azure_read_log` | Download (if needed) + parse in one call — same options as `read_log` (`entries`, `fromEnd`, `grep`, `since`/`until`, `parsed`). |

## Run

```bash
npm run build --workspace @hybris-mcp/runtime
node packages/runtime/dist/index.js
```
