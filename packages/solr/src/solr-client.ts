/**
 * Solr client for the Hybris MCP server.
 *
 * Targets Hybris-style Solr (8.x+) running locally with the platform.
 * Uses the Admin/Cores and per-core /select and /schema endpoints.
 */

export interface SolrConfig {
  baseUrl: string;
  username?: string;
  password?: string;
}

export interface SolrCoreSummary {
  name: string;
  numDocs?: number;
  maxDoc?: number;
  deletedDocs?: number;
  sizeInBytes?: number;
  size?: string;
  lastModified?: string;
  uptime?: number;
  instanceDir?: string;
}

export interface SolrQueryParams {
  core: string;
  q?: string;
  fq?: string[];
  fl?: string;
  sort?: string;
  start?: number;
  rows?: number;
  facet?: boolean;
  facetField?: string[];
  defType?: string;
  qOp?: 'AND' | 'OR';
  extra?: Record<string, string | string[]>;
  requestHandler?: string;
}

export interface SolrFieldInfo {
  name: string;
  type: string;
  indexed?: boolean;
  stored?: boolean;
  multiValued?: boolean;
  required?: boolean;
  dynamicBase?: string;
}

export class SolrClient {
  private static readonly REQUEST_TIMEOUT_MS = 30000;
  private readonly base: string;
  private readonly authHeader?: string;

  constructor(private readonly config: SolrConfig) {
    this.base = config.baseUrl.replace(/\/+$/, '');
    if (config.username && config.password) {
      const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      this.authHeader = `Basic ${token}`;
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.authHeader) headers.Authorization = this.authHeader;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SolrClient.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Solr ${res.status} ${res.statusText} for ${url}: ${text.slice(0, 500)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Solr returned non-JSON for ${url}: ${text.slice(0, 500)}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson(url: string, body: unknown, contentType = 'application/json'): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': contentType,
    };
    if (this.authHeader) headers.Authorization = this.authHeader;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SolrClient.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Solr ${res.status} ${res.statusText} for ${url}: ${text.slice(0, 1000)}`);
      }
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async listCores(): Promise<SolrCoreSummary[]> {
    const url = `${this.base}/admin/cores?wt=json`;
    const data = (await this.fetchJson(url)) as {
      status?: Record<string, {
        name: string;
        instanceDir?: string;
        uptime?: number;
        index?: {
          numDocs?: number;
          maxDoc?: number;
          deletedDocs?: number;
          sizeInBytes?: number;
          size?: string;
          lastModified?: string;
        };
      }>;
    };
    const status = data?.status ?? {};
    return Object.values(status).map((c) => ({
      name: c.name,
      instanceDir: c.instanceDir,
      uptime: c.uptime,
      numDocs: c.index?.numDocs,
      maxDoc: c.index?.maxDoc,
      deletedDocs: c.index?.deletedDocs,
      sizeInBytes: c.index?.sizeInBytes,
      size: c.index?.size,
      lastModified: c.index?.lastModified,
    }));
  }

  async coreInfo(core: string): Promise<unknown> {
    const url = `${this.base}/admin/cores?action=STATUS&core=${encodeURIComponent(core)}&wt=json`;
    return this.fetchJson(url);
  }

  async query(params: SolrQueryParams): Promise<unknown> {
    if (!params.core) throw new Error('core is required');
    const handler = params.requestHandler || 'select';
    const u = new URL(`${this.base}/${encodeURIComponent(params.core)}/${handler}`);
    u.searchParams.set('wt', 'json');
    u.searchParams.set('q', params.q ?? '*:*');
    if (params.fq) for (const v of params.fq) u.searchParams.append('fq', v);
    if (params.fl) u.searchParams.set('fl', params.fl);
    if (params.sort) u.searchParams.set('sort', params.sort);
    if (params.start !== undefined) u.searchParams.set('start', String(params.start));
    if (params.rows !== undefined) u.searchParams.set('rows', String(params.rows));
    if (params.qOp) u.searchParams.set('q.op', params.qOp);
    if (params.defType) u.searchParams.set('defType', params.defType);
    if (params.facet) {
      u.searchParams.set('facet', 'true');
      if (params.facetField) for (const f of params.facetField) u.searchParams.append('facet.field', f);
    }
    if (params.extra) {
      for (const [k, v] of Object.entries(params.extra)) {
        if (Array.isArray(v)) for (const item of v) u.searchParams.append(k, item);
        else u.searchParams.set(k, v);
      }
    }
    return this.fetchJson(u.toString());
  }

  async reloadCore(core: string): Promise<unknown> {
    const url = `${this.base}/admin/cores?action=RELOAD&core=${encodeURIComponent(core)}&wt=json`;
    return this.fetchJson(url);
  }

  async swapCores(core: string, other: string): Promise<unknown> {
    const url = `${this.base}/admin/cores?action=SWAP&core=${encodeURIComponent(core)}&other=${encodeURIComponent(other)}&wt=json`;
    return this.fetchJson(url);
  }

  async backupCore(params: {
    core: string;
    name: string;
    location?: string;
    repository?: string;
    async?: string;
  }): Promise<unknown> {
    const u = new URL(`${this.base}/${encodeURIComponent(params.core)}/replication`);
    u.searchParams.set('command', 'backup');
    u.searchParams.set('wt', 'json');
    u.searchParams.set('name', params.name);
    if (params.location) u.searchParams.set('location', params.location);
    if (params.repository) u.searchParams.set('repository', params.repository);
    if (params.async) u.searchParams.set('async', params.async);
    return this.fetchJson(u.toString());
  }

  async restoreCore(params: {
    core: string;
    name: string;
    location?: string;
    repository?: string;
    async?: string;
  }): Promise<unknown> {
    const u = new URL(`${this.base}/${encodeURIComponent(params.core)}/replication`);
    u.searchParams.set('command', 'restore');
    u.searchParams.set('wt', 'json');
    u.searchParams.set('name', params.name);
    if (params.location) u.searchParams.set('location', params.location);
    if (params.repository) u.searchParams.set('repository', params.repository);
    if (params.async) u.searchParams.set('async', params.async);
    return this.fetchJson(u.toString());
  }

  async backupStatus(core: string): Promise<unknown> {
    const u = new URL(`${this.base}/${encodeURIComponent(core)}/replication`);
    u.searchParams.set('command', 'details');
    u.searchParams.set('wt', 'json');
    return this.fetchJson(u.toString());
  }

  async restoreStatus(core: string): Promise<unknown> {
    const u = new URL(`${this.base}/${encodeURIComponent(core)}/replication`);
    u.searchParams.set('command', 'restorestatus');
    u.searchParams.set('wt', 'json');
    return this.fetchJson(u.toString());
  }

  async schemaAddField(params: {
    core: string;
    name: string;
    type: string;
    indexed?: boolean;
    stored?: boolean;
    multiValued?: boolean;
    required?: boolean;
    docValues?: boolean;
    default?: string;
    copyTo?: string[];
    replace?: boolean;
  }): Promise<unknown> {
    const url = `${this.base}/${encodeURIComponent(params.core)}/schema?wt=json`;
    const fieldDef: Record<string, unknown> = {
      name: params.name,
      type: params.type,
    };
    if (params.indexed !== undefined) fieldDef.indexed = params.indexed;
    if (params.stored !== undefined) fieldDef.stored = params.stored;
    if (params.multiValued !== undefined) fieldDef.multiValued = params.multiValued;
    if (params.required !== undefined) fieldDef.required = params.required;
    if (params.docValues !== undefined) fieldDef.docValues = params.docValues;
    if (params.default !== undefined) fieldDef.default = params.default;

    const command = params.replace ? 'replace-field' : 'add-field';
    const payload: Record<string, unknown> = { [command]: fieldDef };
    const result = await this.postJson(url, payload);

    if (params.copyTo && params.copyTo.length > 0) {
      const copyPayload = {
        'add-copy-field': { source: params.name, dest: params.copyTo },
      };
      const copyResult = await this.postJson(url, copyPayload);
      return { addField: result, addCopyField: copyResult };
    }
    return result;
  }

  async schemaFields(core: string): Promise<{
    fields: SolrFieldInfo[];
    dynamicFields: SolrFieldInfo[];
    uniqueKey?: string;
  }> {
    const fieldsUrl = `${this.base}/${encodeURIComponent(core)}/schema/fields?wt=json`;
    const dynUrl = `${this.base}/${encodeURIComponent(core)}/schema/dynamicfields?wt=json`;
    const ukUrl = `${this.base}/${encodeURIComponent(core)}/schema/uniquekey?wt=json`;

    const [fieldsResp, dynResp, ukResp] = await Promise.all([
      this.fetchJson(fieldsUrl) as Promise<{ fields?: SolrFieldInfo[] }>,
      this.fetchJson(dynUrl) as Promise<{ dynamicFields?: SolrFieldInfo[] }>,
      this.fetchJson(ukUrl) as Promise<{ uniqueKey?: string }>,
    ]);

    return {
      fields: fieldsResp.fields ?? [],
      dynamicFields: dynResp.dynamicFields ?? [],
      uniqueKey: ukResp.uniqueKey,
    };
  }
}
