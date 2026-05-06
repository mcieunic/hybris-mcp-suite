/**
 * Hybris API Client for interacting with SAP Commerce Cloud
 */

import { buildExportCmsPageScript, ExportCmsPageParams } from './export-cms-page.js';

export interface HybrisConfig {
  baseUrl: string;
  username: string;
  password: string;
  hacPath?: string; // HAC path prefix, defaults to '/hac'
}

export interface FlexibleSearchResult {
  results: Record<string, unknown>[];
  count: number;
}

interface FlexSearchHacResponse {
  resultList?: unknown[][];
  headers?: string[];
  query?: string;
  executionTime?: number;
  resultCount?: number;
}

export interface ImpexResult {
  success: boolean;
  message: string;
  errors?: string[];
}

interface HacSession {
  cookies: string[];
  csrfToken: string;
}

export class HybrisClient {
  private static readonly REQUEST_TIMEOUT_MS = 30000;

  private config: HybrisConfig;
  private hacSession: HacSession | null = null;

  constructor(config: HybrisConfig) {
    this.config = {
      hacPath: '/hac',
      ...config,
    };
  }

  private get hacPrefix(): string {
    return this.config.hacPath || '/hac';
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = HybrisClient.REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private mergeCookies(existing: string[], incoming: string[]): string[] {
    const cookieMap = new Map<string, string>();
    for (const cookie of [...existing, ...incoming]) {
      const [name] = cookie.split('=');
      cookieMap.set(name, cookie);
    }
    return Array.from(cookieMap.values());
  }

  /**
   * Escape a string for safe interpolation in Groovy GStrings.
   * Prevents code injection via ${...} syntax.
   */
  private escapeGroovyString(input: string): string {
    return input
      .replace(/\\/g, '\\\\')   // Backslashes first
      .replace(/"/g, '\\"')     // Double quotes
      .replace(/\$/g, '\\$')    // Dollar signs (prevents GString injection)
      .replace(/\n/g, '\\n')    // Newlines
      .replace(/\r/g, '\\r')    // Carriage returns
      .replace(/\t/g, '\\t');   // Tabs
  }

  /**
   * Sanitize error messages to prevent leaking sensitive information.
   */
  private sanitizeErrorMessage(message: string, maxLength = 500): string {
    let sanitized = message
      .replace(/password[=:]["']?[^"'\s]+["']?/gi, 'password=***')
      .replace(/token[=:]["']?[^"'\s]+["']?/gi, 'token=***')
      .replace(/bearer\s+[^\s]+/gi, 'bearer ***')
      .replace(/authorization[=:]["']?[^"'\s]+["']?/gi, 'authorization=***');

    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '... (truncated)';
    }
    return sanitized;
  }

  /**
   * Type guard for FlexibleSearch HAC response.
   */
  private isFlexSearchResponse(data: unknown): data is FlexSearchHacResponse {
    return typeof data === 'object' && data !== null;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getAuthHeaders();
    const url = `${this.config.baseUrl}${endpoint}`;

    const response = await this.fetchWithTimeout(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hybris API error (${response.status}): ${this.sanitizeErrorMessage(errorText)}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    const text = await response.text();
    if (contentType?.includes('text/html') && text.includes('<html')) {
      throw new Error(
        `Unexpected HTML response (possible auth failure): ${text.substring(0, 200)}...`
      );
    }
    return text as unknown as T;
  }

  // HAC Session Management

  private extractCsrfToken(html: string): string | null {
    // Handle various attribute orderings and quote styles
    const patterns = [
      /name=["']_csrf["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*name=["']_csrf["']/i,
      /name=["']_csrf["'][^>]*value=["']([^"']+)["']/i,
      /value=["']([^"']+)["'][^>]*name=["']_csrf["']/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  private extractCookies(response: Response): string[] {
    const cookies: string[] = [];
    const setCookieHeaders = response.headers.getSetCookie?.() || [];

    for (const cookie of setCookieHeaders) {
      // Extract just the cookie name=value part
      const cookiePart = cookie.split(';')[0];
      if (cookiePart) {
        cookies.push(cookiePart);
      }
    }

    return cookies;
  }

  /**
   * Follow redirects manually, collecting cookies at each hop, until a non-redirect
   * response (or max hops) is reached. Returns the final response and accumulated cookies.
   */
  private async followRedirects(
    startUrl: string,
    cookies: string[],
    maxHops = 8
  ): Promise<{ response: Response; html: string; cookies: string[] }> {
    let currentUrl = startUrl;
    let currentCookies = [...cookies];

    for (let i = 0; i < maxHops; i++) {
      const resp = await this.fetchWithTimeout(currentUrl, {
        method: 'GET',
        headers: { 'Cookie': currentCookies.join('; ') },
        redirect: 'manual',
      });

      currentCookies = this.mergeCookies(currentCookies, this.extractCookies(resp));

      if (resp.status !== 301 && resp.status !== 302 && resp.status !== 303 && resp.status !== 307 && resp.status !== 308) {
        const html = await resp.text();
        return { response: resp, html, cookies: currentCookies };
      }

      const location = resp.headers.get('location');
      if (!location) {
        const html = await resp.text();
        return { response: resp, html, cookies: currentCookies };
      }

      currentUrl = location.startsWith('http') ? location : `${this.config.baseUrl}${location}`;
    }

    throw new Error(`Too many redirects following ${startUrl}`);
  }

  private async ensureHacSession(): Promise<HacSession> {
    if (this.hacSession) {
      return this.hacSession;
    }

    // Step 1: Fetch the HAC root and follow redirects to the login page.
    // HAC versions differ on the exact path (/login.jsp vs /login), so start from the
    // root and let redirect following land on whatever login URL this instance uses.
    const loginPageUrl = `${this.config.baseUrl}${this.hacPrefix}/`;
    const { html: loginPageHtml, cookies: loginCookies } = await this.followRedirects(loginPageUrl, []);

    const csrfToken = this.extractCsrfToken(loginPageHtml);
    if (!csrfToken) {
      throw new Error('Failed to extract CSRF token from HAC login page. Check HYBRIS_BASE_URL.');
    }

    // Step 2: Submit login form
    const loginUrl = `${this.config.baseUrl}${this.hacPrefix}/j_spring_security_check`;
    const loginBody = new URLSearchParams({
      j_username: this.config.username,
      j_password: this.config.password,
      _csrf: csrfToken,
    });

    const loginResponse = await this.fetchWithTimeout(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': loginCookies.join('; '),
        'Referer': loginPageUrl,
      },
      body: loginBody,
      redirect: 'manual',
    });

    let cookies = this.mergeCookies(loginCookies, this.extractCookies(loginResponse));

    const loginRedirectLocation = loginResponse.headers.get('location');
    if (loginResponse.status !== 302 || !loginRedirectLocation || loginRedirectLocation.includes('error')) {
      throw new Error('HAC login failed - check HYBRIS_USERNAME and HYBRIS_PASSWORD');
    }

    // Step 3: Follow ALL post-login redirects to reach the authenticated home page,
    // then extract a fresh CSRF token from that page.
    const afterLoginUrl = loginRedirectLocation.startsWith('http')
      ? loginRedirectLocation
      : `${this.config.baseUrl}${loginRedirectLocation}`;

    const { html: homeHtml, cookies: homeCookies } = await this.followRedirects(afterLoginUrl, cookies);
    cookies = homeCookies;

    let newCsrfToken = this.extractCsrfToken(homeHtml);

    // Fallback: if home page has no CSRF meta tag, fetch the scripting console page which always has one
    if (!newCsrfToken) {
      const { html: consolHtml, cookies: consoleCookies } = await this.followRedirects(
        `${this.config.baseUrl}${this.hacPrefix}/console/scripting/`,
        cookies
      );
      cookies = consoleCookies;
      newCsrfToken = this.extractCsrfToken(consolHtml);
    }

    if (!newCsrfToken) {
      throw new Error('Failed to extract CSRF token after HAC login. HAC may be unavailable or configuration is wrong.');
    }

    this.hacSession = { cookies, csrfToken: newCsrfToken };
    return this.hacSession;
  }

  private async hacRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0,
    timeoutMs?: number
  ): Promise<T> {
    const session = await this.ensureHacSession();
    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Cookie': session.cookies.join('; '),
      'X-CSRF-TOKEN': session.csrfToken,
      ...(options.headers as Record<string, string>),
    };

    // Add CSRF token to form data if it's a POST with form data
    let body = options.body;
    if (options.method === 'POST' && body instanceof URLSearchParams) {
      body.set('_csrf', session.csrfToken);
    }

    const response = await this.fetchWithTimeout(
      url,
      {
        ...options,
        headers,
        body,
        redirect: 'manual',
      },
      timeoutMs
    );

    // If we get a redirect to login, session expired - retry once.
    // HAC endpoints using @PostMapping(headers="Accept=application/json")
    // return 405 instead of 302 when the session is gone, so treat 401/403/405
    // the same way as an explicit login redirect.
    const location = response.headers.get('location');
    const sessionExpired =
      (response.status === 302 && location?.includes('login')) ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 405;
    if (sessionExpired) {
      if (retryCount >= 1) {
        throw new Error(`HAC session expired and re-authentication failed (status=${response.status})`);
      }
      this.hacSession = null;
      return this.hacRequest<T>(endpoint, options, retryCount + 1, timeoutMs);
    }

    if (!response.ok && response.status !== 302) {
      const errorText = await response.text();
      throw new Error(`HAC API error (${response.status}): ${this.sanitizeErrorMessage(errorText)}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    const text = await response.text();
    if (contentType?.includes('text/html') && text.includes('<html')) {
      throw new Error(
        `Unexpected HTML response (possible auth failure): ${text.substring(0, 200)}...`
      );
    }
    return text as unknown as T;
  }

  // HAC (Hybris Administration Console) Methods

  async executeFlexibleSearch(query: string, maxCount = 100): Promise<FlexibleSearchResult> {
    const formData = new URLSearchParams({
      flexibleSearchQuery: query,
      maxCount: maxCount.toString(),
    });

    return this.hacRequest<FlexibleSearchResult>(
      `${this.hacPrefix}/console/flexsearch/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: formData,
      }
    );
  }

  async executeGroovyScript(
    script: string,
    commit = false,
    timeoutMs?: number
  ): Promise<{ output: string; result: unknown }> {
    const formData = new URLSearchParams({
      script,
      scriptType: 'groovy',
      commit: commit.toString(),
    });

    const response = await this.hacRequest<{
      outputText?: string;
      executionResult?: unknown;
      stacktraceText?: string;
    }>(
      `${this.hacPrefix}/console/scripting/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: formData,
      },
      0,
      timeoutMs
    );

    // Map HAC response fields to our expected format
    return {
      output: response.outputText || '',
      result: response.executionResult,
    };
  }

  async importImpex(impexContent: string): Promise<ImpexResult> {
    // Use Groovy script for ImpEx import with ImportService
    const escapedContent = this.escapeGroovyString(impexContent);

    const script = `
import de.hybris.platform.servicelayer.impex.ImportService
import de.hybris.platform.servicelayer.impex.ImportConfig
import de.hybris.platform.servicelayer.impex.impl.StreamBasedImpExResource

try {
    def impexContent = "${escapedContent}"
    def importService = spring.getBean("importService")

    def config = new ImportConfig()
    def resource = new StreamBasedImpExResource(
        new ByteArrayInputStream(impexContent.getBytes("UTF-8")),
        "UTF-8"
    )
    config.setScript(resource)
    config.setEnableCodeExecution(true)

    def importResult = importService.importData(config)

    if (importResult.hasUnresolvedLines()) {
        println "WARNING: Import completed with unresolved lines"
        importResult.unresolvedLines.allLines.each { line ->
            println "  Unresolved: " + line
        }
    }

    if (importResult.isError()) {
        println "ERROR: Import failed"
        if (importResult.unresolvedLines?.allLines) {
            importResult.unresolvedLines.allLines.each { line ->
                println "  Error: " + line
            }
        }
        return "ERROR"
    }

    println "SUCCESS: ImpEx import completed"
    return "SUCCESS"
} catch (Exception e) {
    println "ERROR: " + e.getMessage()
    e.printStackTrace()
    return "ERROR: " + e.getMessage()
}
`;
    const result = await this.executeGroovyScript(script, true); // commit=true for imports
    const output = result.output || '';
    const execResult = String(result.result || '');
    const success = output.includes('SUCCESS:') || execResult === 'SUCCESS';
    const errors: string[] = [];

    // Extract unresolved lines as errors
    const unresolvedMatch = output.match(/Unresolved: (.+)/g);
    if (unresolvedMatch) {
      errors.push(...unresolvedMatch);
    }

    const errorMatch = output.match(/ERROR: (.+)/);
    if (errorMatch) {
      errors.push(errorMatch[1]);
    }

    return {
      success,
      message: output || execResult,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async exportImpex(flexQuery: string): Promise<string> {
    // Use Groovy script for ImpEx export
    const escapedQuery = this.escapeGroovyString(flexQuery);

    const script = `
try {
    def flexibleSearchService = spring.getBean("flexibleSearchService")
    def query = "${escapedQuery}"
    def searchResult = flexibleSearchService.search(query)

    if (searchResult.result.isEmpty()) {
        println "No results found for query"
        return "# No results found"
    }

    // Build ImpEx header from first item
    def firstItem = searchResult.result[0]
    def itemType = firstItem.itemtype  // Use lowercase 'itemtype' property

    def sb = new StringBuilder()
    sb.append("# Exported from FlexibleSearch: ").append(query).append("\\n")
    sb.append("# Result count: ").append(searchResult.totalCount).append("\\n\\n")

    // Simple export format
    sb.append("INSERT_UPDATE ").append(itemType).append(";pk[unique=true]\\n")
    searchResult.result.each { item ->
        sb.append(";").append(item.PK.toString()).append("\\n")
    }

    println "SUCCESS: Exported " + searchResult.result.size() + " items"
    return sb.toString()
} catch (Exception e) {
    println "ERROR: " + e.getMessage()
    e.printStackTrace()
    return "# Error: " + e.getMessage()
}
`;
    const result = await this.executeGroovyScript(script);
    const execResult = String(result.result || '');

    // If result looks like ImpEx content, return it
    if (execResult.includes('INSERT_UPDATE') || execResult.includes('# ')) {
      return execResult;
    }

    return result.output || execResult || '# Export failed';
  }

  // Backoffice / Admin API Methods

  async getCronJobs(): Promise<{ cronJobs: { code: string; active: boolean; status: string }[] }> {
    // Use FlexibleSearch to get cron jobs as HAC doesn't have a direct API
    const result = await this.executeFlexibleSearch(
      "SELECT {code}, {active}, {status} FROM {CronJob} ORDER BY {code}",
      1000
    );

    // FlexibleSearch returns resultList as array of arrays, with headers
    if (!this.isFlexSearchResponse(result)) {
      return { cronJobs: [] };
    }
    const resultList = result.resultList || [];
    const headers = result.headers || ['code', 'active', 'status'];

    const codeIdx = headers.findIndex(h => h.toLowerCase().includes('code'));
    const activeIdx = headers.findIndex(h => h.toLowerCase().includes('active'));
    const statusIdx = headers.findIndex(h => h.toLowerCase().includes('status'));

    return {
      cronJobs: resultList.map((row) => ({
        code: String(row[codeIdx >= 0 ? codeIdx : 0] || ''),
        active: row[activeIdx >= 0 ? activeIdx : 1] === true || row[activeIdx >= 0 ? activeIdx : 1] === 'true',
        status: String(row[statusIdx >= 0 ? statusIdx : 2] || ''),
      })),
    };
  }

  async triggerCronJob(cronJobCode: string): Promise<{ success: boolean; message: string }> {
    // Use Groovy script to trigger cron job
    const escapedCode = this.escapeGroovyString(cronJobCode);
    const script = `
import de.hybris.platform.servicelayer.cronjob.CronJobService

def cronJobService = spring.getBean("cronJobService")
def cronJob = cronJobService.getCronJob("${escapedCode}")
if (cronJob == null) {
    println "CronJob not found: ${escapedCode}"
    return "NOT_FOUND"
}
cronJobService.performCronJob(cronJob, true)
println "CronJob triggered: ${escapedCode}"
return "SUCCESS"
`;
    const result = await this.executeGroovyScript(script);
    const output = result.output || '';
    const execResult = String(result.result || '');
    const success = output.includes('triggered') || execResult === 'SUCCESS';
    return {
      success,
      message: success
        ? `CronJob ${cronJobCode} triggered`
        : `Failed to trigger ${cronJobCode}: ${output || execResult || 'Unknown error'}`,
    };
  }

  async clearCache(cacheType?: string): Promise<{ success: boolean; message: string }> {
    // Use Groovy script to clear cache
    const escapedType = cacheType ? this.escapeGroovyString(cacheType) : '';
    const script = `
import de.hybris.platform.core.Registry

def cacheType = "${escapedType}"

if (cacheType == "all" || cacheType == "") {
    Registry.getCurrentTenant().getCache().clear()
    println "All caches cleared"
    return "SUCCESS"
} else {
    // Clear specific cache region if supported
    try {
        def cacheController = spring.getBean("cacheController")
        cacheController.clearCache()
        println "Cache cleared: " + cacheType
        return "SUCCESS"
    } catch (Exception e) {
        Registry.getCurrentTenant().getCache().clear()
        println "Cleared all caches (specific cache type not supported)"
        return "SUCCESS"
    }
}
`;
    const result = await this.executeGroovyScript(script);
    const output = result.output || '';
    const execResult = String(result.result || '');
    const success = output.includes('cleared') || execResult === 'SUCCESS';
    return {
      success,
      message: success ? 'Cache cleared successfully' : `Failed to clear cache: ${output || execResult || 'Unknown error'}`,
    };
  }

  async getSystemInfo(): Promise<Record<string, unknown>> {
    // Use Groovy script to get system info
    const script = `
import de.hybris.platform.core.Registry
import de.hybris.platform.util.Config

def tenant = Registry.getCurrentTenant()
def runtime = Runtime.getRuntime()

def info = [
    hybrisVersion: Config.getString("build.version", "unknown"),
    buildNumber: Config.getString("build.number", "unknown"),
    tenantId: tenant.getTenantID(),
    clusterId: Config.getInt("cluster.id", 0),
    clusterIsland: Config.getInt("cluster.island.id", 0),
    javaVersion: System.getProperty("java.version"),
    javaVendor: System.getProperty("java.vendor"),
    osName: System.getProperty("os.name"),
    osArch: System.getProperty("os.arch"),
    maxMemoryMB: (runtime.maxMemory() / 1024 / 1024) as int,
    totalMemoryMB: (runtime.totalMemory() / 1024 / 1024) as int,
    freeMemoryMB: (runtime.freeMemory() / 1024 / 1024) as int,
    availableProcessors: runtime.availableProcessors()
]

return groovy.json.JsonOutput.toJson(info)
`;
    const result = await this.executeGroovyScript(script);
    try {
      // Parse the JSON result - executionResult contains the returned value
      const jsonStr = String(result.result || '');
      if (jsonStr && jsonStr.startsWith('{')) {
        return JSON.parse(jsonStr);
      }
      // If result is not JSON, return what we have
      return {
        output: result.output,
        result: result.result,
      };
    } catch {
      return {
        output: result.output,
        result: result.result,
        parseError: 'Failed to parse system info JSON',
      };
    }
  }

  // Catalog Synchronization

  async triggerCatalogSync(
    catalogId: string,
    sourceVersion: string,
    targetVersion: string
  ): Promise<{ success: boolean; message: string }> {
    // Use Groovy script to trigger catalog sync by creating a properly configured CronJob
    const escapedCatalogId = this.escapeGroovyString(catalogId);
    const escapedSource = this.escapeGroovyString(sourceVersion);
    const escapedTarget = this.escapeGroovyString(targetVersion);
    const script = `
import de.hybris.platform.catalog.model.synchronization.CatalogVersionSyncCronJobModel
import de.hybris.platform.cronjob.enums.CronJobResult
import de.hybris.platform.cronjob.enums.CronJobStatus
import de.hybris.platform.cronjob.enums.JobLogLevel
import de.hybris.platform.tx.Transaction

try {
    def catalogVersionService = spring.getBean("catalogVersionService")
    def modelService = spring.getBean("modelService")
    def cronJobService = spring.getBean("cronJobService")
    def flexibleSearchService = spring.getBean("flexibleSearchService")

    def sourceCatalogVersion = catalogVersionService.getCatalogVersion("${escapedCatalogId}", "${escapedSource}")
    def targetCatalogVersion = catalogVersionService.getCatalogVersion("${escapedCatalogId}", "${escapedTarget}")

    if (sourceCatalogVersion == null) {
        return "ERROR: Source catalog version not found: ${escapedCatalogId}:${escapedSource}"
    }
    if (targetCatalogVersion == null) {
        return "ERROR: Target catalog version not found: ${escapedCatalogId}:${escapedTarget}"
    }

    // Find sync job using flexible search
    def query = "SELECT {pk} FROM {CatalogVersionSyncJob} WHERE {sourceVersion} = ?source AND {targetVersion} = ?target"
    def params = [source: sourceCatalogVersion, target: targetCatalogVersion]
    def searchResult = flexibleSearchService.search(query, params)

    if (searchResult.result.isEmpty()) {
        def allJobs = flexibleSearchService.search("SELECT {pk}, {code} FROM {CatalogVersionSyncJob}").result
        def available = allJobs.collect { it.code }.join(", ")
        return "ERROR: No sync job found for ${escapedCatalogId} ${escapedSource} -> ${escapedTarget}. Available: " + available
    }

    def syncJob = searchResult.result[0]

    // Create a new CronJob with all mandatory attributes
    def syncCronJob = modelService.create(CatalogVersionSyncCronJobModel.class)
    syncCronJob.setJob(syncJob)
    syncCronJob.setCode("mcp_sync_" + System.currentTimeMillis())

    // sessionLanguage is mandatory on CronJob; without it the job aborts at runtime
    // (ABORTED/ERROR) even though save() succeeds. Inherit from the sync job definition.
    syncCronJob.setSessionLanguage(syncJob.getSessionLanguage())

    // fullSync ensures every item in the source is propagated, not just delta since
    // the last (possibly aborted) sync. Safer default for an on-demand trigger.
    syncCronJob.setFullSync(Boolean.TRUE)

    syncCronJob.setCreateSavedValues(false)
    syncCronJob.setForceUpdate(false)
    syncCronJob.setLogToDatabase(true)
    syncCronJob.setLogToFile(false)
    syncCronJob.setLogLevelDatabase(JobLogLevel.WARNING)
    syncCronJob.setLogLevelFile(JobLogLevel.WARNING)

    modelService.save(syncCronJob)

    // The sync's background executor reads the CronJob row via a separate DB
    // connection. Without forcing a commit here, it would not see the row yet
    // and abort with YNoSuchEntityException. Commit-and-begin flushes the save
    // so the row is visible, while keeping the HAC script transactional.
    def tx = Transaction.current()
    if (tx != null && tx.isRunning()) {
        tx.commit()
        tx.begin()
    }

    // Run synchronously and wait for completion
    cronJobService.performCronJob(syncCronJob, true)

    // performCronJob does not throw on internal abort — we must inspect status/result
    modelService.refresh(syncCronJob)
    def status = syncCronJob.getStatus()
    def jobResult = syncCronJob.getResult()
    def code = syncCronJob.getCode()

    if (CronJobStatus.FINISHED == status && CronJobResult.SUCCESS == jobResult) {
        return "SUCCESS: " + code + " status=" + status + " result=" + jobResult
    }

    def logs = []
    syncCronJob.getLogs()?.take(5)?.each { l -> logs << ("[" + l.level + "] " + l.message) }
    def logStr = logs ? (" | logs: " + logs.join(" ; ")) : ""
    return "ERROR: Sync cronjob did not succeed: " + code + " status=" + status + " result=" + jobResult + logStr
} catch (Throwable t) {
    return "ERROR: " + t.getClass().getName() + ": " + t.getMessage()
}
`;
    // commit=true so the created CronJob (and its FINISHED status) persist
    const result = await this.executeGroovyScript(script, true);
    const execResult = String(result.result || '').trim();
    const output = result.output || '';
    const success = execResult.startsWith('SUCCESS');
    return {
      success,
      message: success
        ? `Catalog sync triggered: ${catalogId} ${sourceVersion} -> ${targetVersion} (${execResult})`
        : (execResult.startsWith('ERROR:')
            ? execResult
            : `Failed to sync: ${execResult || output || 'Unknown error'}`),
    };
  }

  // Project data update for a single extension (HAC "Update Running System" scoped to one ext)

  async runProjectDataUpdate(
    extensionName: string,
    params?: Record<string, string>
  ): Promise<{ success: boolean; message: string; output?: string }> {
    if (!/^[a-zA-Z0-9_]+$/.test(extensionName)) {
      throw new Error('extensionName must match [a-zA-Z0-9_]+');
    }
    const escapedExt = this.escapeGroovyString(extensionName);

    const paramsLiteral = params && Object.keys(params).length > 0
      ? '[' + Object.entries(params)
          .map(([k, v]) => `"${this.escapeGroovyString(k)}": "${this.escapeGroovyString(String(v))}"`)
          .join(', ') + ']'
      : '[:]';

    const script = `
import de.hybris.platform.core.Registry
import de.hybris.platform.core.initialization.SystemSetup
import de.hybris.platform.core.initialization.SystemSetupContext

try {
    def extName = "${escapedExt}"
    def params = ${paramsLiteral} as Map

    def appCtx = Registry.hasCurrentTenant()
        ? Registry.getCurrentTenant().getApplicationContext()
        : Registry.getApplicationContext()
    def beanName = appCtx.getBeanDefinitionNames().find {
        it.equalsIgnoreCase(extName + "SystemSetup")
    }
    if (beanName == null) {
        return "ERROR: SystemSetup bean not found for extension '" + extName + "' (expected bean name '" + extName + "SystemSetup')"
    }

    def setup = appCtx.getBean(beanName)
    def ctx = new SystemSetupContext(params, SystemSetup.Type.PROJECT, SystemSetup.Process.UPDATE, extName)

    def hasMethod = setup.getClass().getMethods().any { it.name == "createProjectData" }
    if (!hasMethod) {
        return "ERROR: bean '" + beanName + "' (" + setup.getClass().getName() + ") has no createProjectData method"
    }

    setup.createProjectData(ctx)
    return "SUCCESS: createProjectData(UPDATE) executed for '" + extName + "' via " + setup.getClass().getName()
} catch (Throwable t) {
    return "ERROR: " + t.getClass().getName() + ": " + t.getMessage()
}
`;
    const result = await this.executeGroovyScript(script, true, 10 * 60 * 1000);
    const execResult = String(result.result || '').trim();
    const output = result.output || '';
    const success = execResult.startsWith('SUCCESS');
    return {
      success,
      message: success
        ? execResult
        : (execResult.startsWith('ERROR:')
            ? execResult
            : `Failed to run project data update: ${execResult || output || 'Unknown error'}`),
      output: output || undefined,
    };
  }

  async exportCmsPage(params: ExportCmsPageParams): Promise<{
    main: string;
    localized: Record<string, string>;
    stats: Record<string, unknown>;
  }> {
    const script = buildExportCmsPageScript(params);
    const result = await this.executeGroovyScript(script, false, 5 * 60 * 1000);
    const execResult = result.result;
    const output = result.output || '';

    let jsonText: string;
    if (typeof execResult === 'string' && execResult.trim().startsWith('{')) {
      jsonText = execResult;
    } else if (typeof execResult === 'string' && execResult.includes('{')) {
      jsonText = execResult.substring(execResult.indexOf('{'));
    } else {
      const msg = output ? output.slice(0, 2000) : String(execResult ?? '');
      throw new Error(`export_cms_page: script did not return JSON. Output: ${msg}`);
    }

    try {
      return JSON.parse(jsonText) as {
        main: string;
        localized: Record<string, string>;
        stats: Record<string, unknown>;
      };
    } catch (e) {
      throw new Error(
        `export_cms_page: failed to parse JSON result: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  // Health check - uses HAC session to verify connectivity
  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    try {
      const result = await this.getSystemInfo();
      return {
        healthy: true,
        details: result,
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }
}