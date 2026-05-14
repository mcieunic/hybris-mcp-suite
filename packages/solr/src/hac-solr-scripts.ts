/**
 * Groovy script generators for Solr-over-HAC tools.
 *
 * Each function returns a self-contained Groovy script that:
 *   - resolves a SolrConfig via Hybris's facetSearchConfigService + solrServerService,
 *   - performs a Solr operation through the SolrClient returned by getSolrServer,
 *   - println a single line of JSON with the result (or an error envelope).
 *
 * Inputs are passed in as base64-encoded JSON to dodge Groovy string-escaping foot-guns.
 */

import { HacClient } from '@hybris-mcp/shared';

const esc = HacClient.escapeGroovyString;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');
}

/**
 * Groovy block that resolves which FacetSearchConfig owns a given core
 * and exposes `solrConfig` + `matchedFsName`. Bails out (returns from script)
 * with a JSON error envelope if not found.
 *
 * Caller-visible variables defined: coreName, fsConfigNames, solrConfig, matchedFsName.
 */
function resolveCoreSnippet(coreName: string, fsConfigFilter: string | undefined): string {
  const escCore = esc(coreName);
  const fsFilterLiteral = fsConfigFilter ? `"${esc(fsConfigFilter)}"` : 'null';
  return `
def coreName = "${escCore}"
def fsConfigNameFilter = ${fsFilterLiteral}

def facetSearchConfigService = spring.getBean("facetSearchConfigService")
def solrServerService = spring.getBean("solrServerService")
def flexibleSearchService = spring.getBean("flexibleSearchService")

def fsConfigNames = fsConfigNameFilter != null
    ? [fsConfigNameFilter]
    : flexibleSearchService.search("SELECT {name} FROM {FacetSearchConfig}").result.collect { it as String }

def solrConfig = null
def matchedFsName = null
def coreResolveErrors = []

fsConfigNames.each { fsName ->
    if (solrConfig != null) return
    try {
        def fsCfg = facetSearchConfigService.getConfiguration(fsName)
        def adminClient = solrServerService.getSolrServer(fsCfg.solrConfig)
        def status = org.apache.solr.client.solrj.request.CoreAdminRequest
            .getStatus(coreName, adminClient).coreStatus.get(coreName)
        if (status != null && status.size() > 0) {
            solrConfig = fsCfg.solrConfig
            matchedFsName = fsName
        }
    } catch (Exception e) {
        coreResolveErrors << [facetSearchConfig: fsName, error: (e.message ?: e.class.name)]
    }
}

if (solrConfig == null) {
    println groovy.json.JsonOutput.toJson([
        error: "Core not found: " + coreName,
        triedConfigs: fsConfigNames,
        errors: coreResolveErrors
    ])
    return
}
`;
}

export function listCoresScript(): string {
  return `
import org.apache.solr.client.solrj.SolrClient
import org.apache.solr.client.solrj.request.CoreAdminRequest
import groovy.json.JsonOutput

def facetSearchConfigService = spring.getBean("facetSearchConfigService")
def solrServerService = spring.getBean("solrServerService")
def flexibleSearchService = spring.getBean("flexibleSearchService")

def fsConfigNames = flexibleSearchService
    .search("SELECT {name} FROM {FacetSearchConfig}").result
    .collect { it as String }

def seenServers = [:]
def servers = []

fsConfigNames.each { fsName ->
    def entry = [facetSearchConfig: fsName]
    try {
        def fsCfg = facetSearchConfigService.getConfiguration(fsName)
        def solrConfig = fsCfg.solrConfig
        def signature = solrConfig.toString()
        if (seenServers.containsKey(signature)) {
            entry.duplicateOf = seenServers[signature]
        } else {
            seenServers[signature] = fsName
            entry.mode = solrConfig.mode?.toString()
            SolrClient client = solrServerService.getSolrServer(solrConfig)
            def resp = CoreAdminRequest.getStatus(null, client)
            def cores = []
            resp.coreStatus.each { coreName, status ->
                def idx = status.get("index")
                cores << [
                    name: coreName,
                    numDocs: idx?.get("numDocs"),
                    sizeInBytes: idx?.get("sizeInBytes"),
                    instanceDir: status.get("instanceDir"),
                    dataDir: status.get("dataDir"),
                    uptime: status.get("uptime"),
                    startTime: status.get("startTime")?.toString()
                ]
            }
            entry.cores = cores
        }
    } catch (Exception e) {
        entry.error = (e.message ?: e.class.name)
    }
    servers << entry
}

println JsonOutput.toJson([servers: servers])
`;
}

export function coreInfoScript(core: string, fsConfig?: string): string {
  return resolveCoreSnippet(core, fsConfig) + `
import org.apache.solr.client.solrj.request.CoreAdminRequest
import groovy.json.JsonOutput

def adminClient = solrServerService.getSolrServer(solrConfig)
def status = CoreAdminRequest.getStatus(coreName, adminClient).coreStatus.get(coreName)

println JsonOutput.toJson([
    core: coreName,
    facetSearchConfig: matchedFsName,
    status: (status != null ? status.asMap(20) : null)
])
`;
}

export interface QueryParamsInput {
  q?: string;
  fq?: string[];
  fl?: string;
  sort?: string;
  start?: number;
  rows?: number;
  qOp?: 'AND' | 'OR';
  defType?: string;
  facet?: boolean;
  facetField?: string[];
  requestHandler?: string;
  extra?: Record<string, string | string[]>;
}

export function queryScript(core: string, params: QueryParamsInput, fsConfig?: string): string {
  return resolveCoreSnippet(core, fsConfig) + `
import org.apache.solr.client.solrj.SolrClient
import org.apache.solr.client.solrj.request.QueryRequest
import org.apache.solr.common.params.ModifiableSolrParams
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def queryParamsB64 = "${b64(params)}"
def queryParamsJson = new String(java.util.Base64.decoder.decode(queryParamsB64), "UTF-8")
def queryParams = new JsonSlurper().parseText(queryParamsJson)

SolrClient client = solrServerService.getSolrServer(solrConfig, coreName)

def p = new ModifiableSolrParams()
p.set("q", (queryParams.q ?: "*:*") as String)
queryParams.fq?.each { p.add("fq", it as String) }
if (queryParams.fl) p.set("fl", queryParams.fl as String)
if (queryParams.sort) p.set("sort", queryParams.sort as String)
if (queryParams.start != null) p.set("start", String.valueOf(queryParams.start))
if (queryParams.rows != null) p.set("rows", String.valueOf(queryParams.rows))
if (queryParams.qOp) p.set("q.op", queryParams.qOp as String)
if (queryParams.defType) p.set("defType", queryParams.defType as String)
if (queryParams.facet != null) p.set("facet", String.valueOf(queryParams.facet))
queryParams.facetField?.each { p.add("facet.field", it as String) }
queryParams.extra?.each { k, v ->
    if (v instanceof List) v.each { p.add(k as String, it as String) }
    else p.set(k as String, v as String)
}

def handlerPath = queryParams.requestHandler
    ? ("/" + (queryParams.requestHandler as String).replaceFirst(/^\\//, ""))
    : "/select"

def request = new QueryRequest(p)
request.setPath(handlerPath)

def response = request.process(client)
println JsonOutput.toJson([
    core: coreName,
    facetSearchConfig: matchedFsName,
    response: response.response.asMap(20)
])
`;
}

export function schemaFieldsScript(core: string, fsConfig?: string): string {
  return resolveCoreSnippet(core, fsConfig) + `
import org.apache.solr.client.solrj.SolrClient
import org.apache.solr.client.solrj.request.schema.SchemaRequest
import groovy.json.JsonOutput

SolrClient client = solrServerService.getSolrServer(solrConfig, coreName)

def fields = new SchemaRequest.Fields().process(client).fields
def dynamic = new SchemaRequest.DynamicFields().process(client).dynamicFields
def uniqueKey = new SchemaRequest.UniqueKey().process(client).uniqueKey

println JsonOutput.toJson([
    core: coreName,
    facetSearchConfig: matchedFsName,
    fields: fields,
    dynamicFields: dynamic,
    uniqueKey: uniqueKey
])
`;
}

function replicationStatusScript(core: string, command: 'details' | 'restorestatus', fsConfig?: string): string {
  return resolveCoreSnippet(core, fsConfig) + `
import org.apache.solr.client.solrj.SolrClient
import org.apache.solr.client.solrj.SolrRequest
import org.apache.solr.client.solrj.request.QueryRequest
import org.apache.solr.common.params.ModifiableSolrParams
import groovy.json.JsonOutput

SolrClient client = solrServerService.getSolrServer(solrConfig, coreName)

def p = new ModifiableSolrParams()
p.set("command", "${command}")
def req = new QueryRequest(p)
req.setPath("/replication")
req.setMethod(SolrRequest.METHOD.GET)
def resp = req.process(client)

println JsonOutput.toJson([
    core: coreName,
    facetSearchConfig: matchedFsName,
    command: "${command}",
    response: resp.response.asMap(20)
])
`;
}

export function backupStatusScript(core: string, fsConfig?: string): string {
  return replicationStatusScript(core, 'details', fsConfig);
}

export function restoreStatusScript(core: string, fsConfig?: string): string {
  return replicationStatusScript(core, 'restorestatus', fsConfig);
}
