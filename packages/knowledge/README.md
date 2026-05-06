# @hybris-mcp/knowledge

MCP server scaffold for **Hybris knowledge sources**. The tool surface is intentionally empty — only `knowledge_ping` is wired up to verify the server is reachable.

## Status

Work in progress. Intended scope (subject to change):

- Type system / items.xml lookup
- Spring bean / extension reference
- Documentation snippets

## Run

```bash
npm run build --workspace @hybris-mcp/knowledge
node packages/knowledge/dist/index.js
```
