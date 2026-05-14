# @hybris-mcp/shared

Internal package — shared helpers used by `@hybris-mcp/runtime`, `@hybris-mcp/solr`, and `@hybris-mcp/knowledge`.

```ts
import {
  // Tool argument validators
  validateString,
  validateNumber,
  validateBoolean,
  validateStringArray,

  // Env loading: reads mcp-hybris-suite-env/<HYBRIS_ENV>/<pkg>.env
  loadEnvFile,

  // Minimal HAC client — CSRF/cookie session + executeGroovyScript
  HacClient,
} from '@hybris-mcp/shared';
```

`HacClient` is the canonical low-level primitive for talking to HAC. New consumers that need to run Groovy through the scripting console should build on top of it instead of reimplementing login/CSRF handling.

Not published independently.
