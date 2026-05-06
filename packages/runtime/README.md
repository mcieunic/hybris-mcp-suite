# @hybris-mcp/runtime

MCP server for **runtime operations** against a running SAP Commerce Cloud (Hybris) instance.

Splits off from the original `hybris-runtime-mcp` repo. Solr-specific tools moved to [`@hybris-mcp/solr`](../solr).

## Tool groups

- **Catalog/Orders:** `search_products`, `get_product`, `get_categories`, `get_category`, `get_orders`, `get_order`
- **Power tools:** `flexible_search`, `execute_groovy`, `describe_type`
- **ImpEx:** `import_impex`, `export_impex`
- **CronJobs:** `get_cronjobs`, `trigger_cronjob`, `get_cronjob_logs`
- **Ops:** `clear_cache`, `get_system_info`, `trigger_catalog_sync`, `run_project_data_update`, `health_check`
- **Logs (filesystem):** `list_logs`, `read_log`, `tail_latest_log`, `search_logs`, `correlate_logs`
- **Content:** `delete_content_catalog`, `export_cms_page`, `create_placeholder_media`
- **Storefront debug:** `storefront_list`, `storefront_login`, `storefront_get`

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `HYBRIS_BASE_URL` | yes | — | Base URL (e.g. `https://localhost:9002`) |
| `HYBRIS_USERNAME` | yes | — | HAC admin user |
| `HYBRIS_PASSWORD` | yes | — | HAC admin password |
| `HYBRIS_BASE_SITE_ID` | no | `electronics` | OCC base site |
| `HYBRIS_CATALOG_ID` | no | `electronicsProductCatalog` | Product catalog id |
| `HYBRIS_CATALOG_VERSION` | no | `Online` | Catalog version |
| `HYBRIS_HAC_PATH` | no | `/hac` | HAC mount path |
| `HYBRIS_LOG_PATH` | no | — | Enables log tools when set |
| `STOREFRONT_<NAME>_URL` etc. | no | — | Storefront login presets |

See [`../../.env.example`](../../.env.example) for the full list.

## Run

```bash
npm run build --workspace @hybris-mcp/runtime
node packages/runtime/dist/index.js
```
