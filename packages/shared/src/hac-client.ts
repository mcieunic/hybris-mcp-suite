/**
 * Minimal HAC (Hybris Administration Console) client.
 *
 * Handles CSRF + cookie session against HAC and exposes a single primitive:
 * `executeGroovyScript(script, commit?, timeoutMs?)`. Anything heavier (FlexibleSearch
 * tooling, ImpEx, log readers, storefront) lives in higher-level clients in their own
 * packages.
 */

export interface HacConfig {
  baseUrl: string;
  username: string;
  password: string;
  hacPath?: string;
}

export interface GroovyResult {
  output: string;
  result: unknown;
}

interface HacSession {
  cookies: string[];
  csrfToken: string;
}

export class HacClient {
  private static readonly REQUEST_TIMEOUT_MS = 30000;

  private readonly config: Required<HacConfig>;
  private session: HacSession | null = null;

  constructor(config: HacConfig) {
    this.config = {
      hacPath: '/hac',
      ...config,
    };
  }

  private get hacPrefix(): string {
    return this.config.hacPath;
  }

  /**
   * Escape a string for safe interpolation in Groovy double-quoted GStrings.
   * Prevents `${...}` injection.
   */
  static escapeGroovyString(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = HacClient.REQUEST_TIMEOUT_MS
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
    const map = new Map<string, string>();
    for (const cookie of [...existing, ...incoming]) {
      const [name] = cookie.split('=');
      map.set(name, cookie);
    }
    return Array.from(map.values());
  }

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

  private extractCsrfToken(html: string): string | null {
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
      const cookiePart = cookie.split(';')[0];
      if (cookiePart) cookies.push(cookiePart);
    }
    return cookies;
  }

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

  private async ensureSession(): Promise<HacSession> {
    if (this.session) return this.session;

    const loginPageUrl = `${this.config.baseUrl}${this.hacPrefix}/`;
    const { html: loginPageHtml, cookies: loginCookies } = await this.followRedirects(loginPageUrl, []);

    const csrfToken = this.extractCsrfToken(loginPageHtml);
    if (!csrfToken) {
      throw new Error('Failed to extract CSRF token from HAC login page. Check HYBRIS_BASE_URL.');
    }

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

    const afterLoginUrl = loginRedirectLocation.startsWith('http')
      ? loginRedirectLocation
      : `${this.config.baseUrl}${loginRedirectLocation}`;

    const { html: homeHtml, cookies: homeCookies } = await this.followRedirects(afterLoginUrl, cookies);
    cookies = homeCookies;

    let newCsrfToken = this.extractCsrfToken(homeHtml);
    if (!newCsrfToken) {
      const { html: consoleHtml, cookies: consoleCookies } = await this.followRedirects(
        `${this.config.baseUrl}${this.hacPrefix}/console/scripting/`,
        cookies
      );
      cookies = consoleCookies;
      newCsrfToken = this.extractCsrfToken(consoleHtml);
    }

    if (!newCsrfToken) {
      throw new Error('Failed to extract CSRF token after HAC login. HAC may be unavailable or configuration is wrong.');
    }

    this.session = { cookies, csrfToken: newCsrfToken };
    return this.session;
  }

  private async hacRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0,
    timeoutMs?: number
  ): Promise<T> {
    const session = await this.ensureSession();
    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Cookie': session.cookies.join('; '),
      'X-CSRF-TOKEN': session.csrfToken,
      ...(options.headers as Record<string, string>),
    };

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
      this.session = null;
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

  async executeGroovyScript(
    script: string,
    commit = false,
    timeoutMs?: number
  ): Promise<GroovyResult> {
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

    if (response.stacktraceText && response.stacktraceText.trim().length > 0) {
      throw new Error(`Groovy script error: ${this.sanitizeErrorMessage(response.stacktraceText)}`);
    }

    return {
      output: response.outputText || '',
      result: response.executionResult,
    };
  }
}
