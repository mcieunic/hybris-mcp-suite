# @hybris-mcp/knowledge

Offline MCP server over a local Hybris **knowledge base**: JSON indexes (extensions, item types, beans, Spring beans, service/facade interfaces) plus per-extension Markdown summaries plus ripgrep over the live source tree.

The knowledge data ships **inside the package**:

```
packages/knowledge/
├── extensions/      # per-extension Markdown summaries
├── index/           # JSON indexes (extensions, items, beans, spring-beans, services-facades, summary)
├── learnings.md     # organic lessons-learned
├── scripts/scan.py  # regenerates index/ from a Hybris source tree
└── src/             # MCP server
```

`HYBRIS_KB_ROOT` defaults to this package directory. Override via env to point at a different KB layout if needed.

## Tools

| Tool | Purpose |
|---|---|
| `hybris_kb_find_extension` | Extension metadata + Markdown summary |
| `hybris_kb_find_type` | Item type from `index/items.json` |
| `hybris_kb_find_bean` | Spring bean by id or class |
| `hybris_kb_find_dto` | DTO from `index/beans.json` (i.e. `*-beans.xml`) |
| `hybris_kb_find_interface` | Service/Facade/Strategy/DAO/... |
| `hybris_kb_search_code` | ripgrep over `HYBRIS_BIN_PATH` |
| `hybris_kb_list_extensions` | List all scanned extensions |
| `hybris_kb_get_summary` | Full Markdown summary for an extension |
| `hybris_kb_learnings` | Read `learnings.md` |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `HYBRIS_KB_ROOT` | this package directory | Directory containing `index/`, `extensions/`, optional `learnings.md` |
| `HYBRIS_BIN_PATH` | `/Users/magdalenadabrowska/Documents/work/sniezka/sniezka2211jdk21/core-customize/hybris/bin` | Live Hybris source tree (target for `hybris_kb_search_code`) |

Requires `rg` (ripgrep) on `PATH` for `hybris_kb_search_code`.

## Run

```bash
npm run build --workspace @hybris-mcp/knowledge
node packages/knowledge/dist/index.js
```

## Regenerating indexes

After a Hybris upgrade or new extensions, regenerate `index/`:

```bash
python3 packages/knowledge/scripts/scan.py \
  --hybris-bin "$HYBRIS_BIN_PATH" \
  --out packages/knowledge/index
```
