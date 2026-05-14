import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

export type ServerType = 'runtime' | 'solr';

/**
 * Load environment variables from `mcp-hybris-suite-env/<envName>/<serverType>.env`.
 *
 * Resolves the project root by walking up from this file's location
 * (packages/shared/dist/) to the monorepo root.
 *
 * Exits the process with a clear error if HYBRIS_ENV is missing or the
 * env file does not exist.
 */
export function loadEnvFile(serverType: ServerType): void {
  const envName = process.env.HYBRIS_ENV;
  if (!envName) {
    console.error(
      'Missing HYBRIS_ENV environment variable.\n' +
      'Set it in your MCP client config, e.g.:\n' +
      '  "env": { "HYBRIS_ENV": "s1" }\n\n' +
      'Available environments: local, d1, s1, p1'
    );
    process.exit(1);
  }

  // packages/shared/dist/load-env.js  →  monorepo root (3 levels up)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(__dirname, '..', '..', '..');
  const envFilePath = resolve(projectRoot, 'mcp-hybris-suite-env', envName, `${serverType}.env`);

  if (!existsSync(envFilePath)) {
    console.error(
      `Env file not found: ${envFilePath}\n` +
      `Create it based on .env.example in the project root.\n\n` +
      `Expected structure:\n` +
      `  mcp-hybris-suite-env/${envName}/runtime.env\n` +
      `  mcp-hybris-suite-env/${envName}/solr.env`
    );
    process.exit(1);
  }

  config({ path: envFilePath });
}
