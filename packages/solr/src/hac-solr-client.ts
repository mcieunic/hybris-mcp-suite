/**
 * Solr-over-HAC client. Wraps `HacClient.executeGroovyScript` for Solr tools that can't
 * hit Solr directly (e.g. CCV2 where Solr isn't externally reachable). All operations
 * go through Hybris's `solrServerService.getSolrServer(...)` inside the HAC scripting
 * console — see `hac-solr-scripts.ts` for the generated Groovy.
 */

import { HacClient } from '@hybris-mcp/shared';
import {
  listCoresScript,
  coreInfoScript,
  queryScript,
  schemaFieldsScript,
  backupStatusScript,
  restoreStatusScript,
  QueryParamsInput,
} from './hac-solr-scripts.js';

const GROOVY_TIMEOUT_MS = 60_000;

export class HacSolrClient {
  constructor(private readonly hac: HacClient) {}

  async listCores(): Promise<unknown> {
    return this.runScript(listCoresScript());
  }

  async coreInfo(core: string, fsConfig?: string): Promise<unknown> {
    return this.runScript(coreInfoScript(core, fsConfig));
  }

  async query(core: string, params: QueryParamsInput, fsConfig?: string): Promise<unknown> {
    return this.runScript(queryScript(core, params, fsConfig));
  }

  async schemaFields(core: string, fsConfig?: string): Promise<unknown> {
    return this.runScript(schemaFieldsScript(core, fsConfig));
  }

  async backupStatus(core: string, fsConfig?: string): Promise<unknown> {
    return this.runScript(backupStatusScript(core, fsConfig));
  }

  async restoreStatus(core: string, fsConfig?: string): Promise<unknown> {
    return this.runScript(restoreStatusScript(core, fsConfig));
  }

  private async runScript(script: string): Promise<unknown> {
    const { output } = await this.hac.executeGroovyScript(script, false, GROOVY_TIMEOUT_MS);
    return parseJsonOutput(output);
  }
}

/**
 * Scripts println exactly one JSON line. Trim, then try a strict parse;
 * if that fails (e.g. extra log noise), fall back to first `{` ... last `}`.
 */
function parseJsonOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return { rawOutput: output, error: 'Groovy script produced no output' };
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.substring(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return { rawOutput: output, error: 'Failed to parse Groovy output as JSON' };
  }
}
