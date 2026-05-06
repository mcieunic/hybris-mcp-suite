/**
 * Storefront login client for Hybris Accelerator-style storefronts.
 *
 * Handles the full login dance:
 *   GET login page -> extract CSRF + cookies
 *   POST j_spring_security_check
 *   follow redirects
 *
 * Designed for DEBUGGING: every call returns a step-by-step trace so you
 * can see exactly where login broke (wrong CSRF field name, missing cookie,
 * redirect to /login?error, etc.).
 */

export interface StorefrontConfig {
  baseUrl: string;
  username: string;
  password: string;
  loginPath?: string;
  loginSubmitPath?: string;
  secureCheckPath?: string;
}

export interface LoginStep {
  step: string;
  method: string;
  url: string;
  status: number;
  location?: string;
  setCookies: string[];
  cookiesSent: string[];
  csrfFound?: { field: string; token: string } | null;
  bodySnippet?: string;
  note?: string;
}

export interface LoginResult {
  success: boolean;
  finalUrl: string;
  finalStatus: number;
  cookies: string[];
  csrfToken: string | null;
  isAuthenticated: boolean;
  authenticatedHints: string[];
  steps: LoginStep[];
  errorSummary?: string;
}

export interface StorefrontSession {
  baseUrl: string;
  cookies: string[];
  csrfToken: string | null;
}

const REQUEST_TIMEOUT_MS = 30000;
const MAX_REDIRECT_HOPS = 10;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCookies(response: Response): string[] {
  const cookies: string[] = [];
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookieHeaders) {
    const cookiePart = cookie.split(';')[0];
    if (cookiePart) cookies.push(cookiePart);
  }
  return cookies;
}

function mergeCookies(existing: string[], incoming: string[]): string[] {
  const cookieMap = new Map<string, string>();
  for (const cookie of [...existing, ...incoming]) {
    const [name] = cookie.split('=');
    cookieMap.set(name, cookie);
  }
  return Array.from(cookieMap.values());
}

/**
 * Try multiple CSRF token patterns. Spartacus/Hybris accelerator usually uses
 * `CSRFToken` as a hidden input, but Spring Security default is `_csrf`.
 * Also checks meta tags just in case.
 */
export function extractCsrf(html: string): { field: string; token: string } | null {
  const patterns: { field: string; re: RegExp }[] = [
    { field: 'CSRFToken', re: /name=["']CSRFToken["'][^>]*value=["']([^"']+)["']/i },
    { field: 'CSRFToken', re: /value=["']([^"']+)["'][^>]*name=["']CSRFToken["']/i },
    { field: '_csrf', re: /name=["']_csrf["'][^>]*value=["']([^"']+)["']/i },
    { field: '_csrf', re: /value=["']([^"']+)["'][^>]*name=["']_csrf["']/i },
    { field: '_csrf', re: /name=["']_csrf["'][^>]*content=["']([^"']+)["']/i },
    { field: '_csrf', re: /content=["']([^"']+)["'][^>]*name=["']_csrf["']/i },
  ];
  for (const { field, re } of patterns) {
    const m = html.match(re);
    if (m) return { field, token: m[1] };
  }
  return null;
}

function absolutize(baseUrl: string, location: string): string {
  if (location.startsWith('http://') || location.startsWith('https://')) return location;
  if (location.startsWith('/')) {
    const origin = new URL(baseUrl).origin;
    return origin + location;
  }
  return new URL(location, baseUrl).toString();
}

function bodySnippet(html: string, max = 400): string {
  const stripped = html.replace(/\s+/g, ' ').trim();
  return stripped.length > max ? stripped.slice(0, max) + '...' : stripped;
}

/**
 * Heuristics that indicate the session is logged in vs. still anonymous.
 * Looks for common accelerator markers: logout link, account page links,
 * greeting containing the username, absence of login form.
 */
function detectAuthHints(html: string, username: string): string[] {
  const hints: string[] = [];
  if (/href=["'][^"']*\/logout["']/i.test(html)) hints.push('found /logout link');
  if (/href=["'][^"']*\/my-account["']/i.test(html)) hints.push('found /my-account link');
  if (/href=["'][^"']*\/my-account\/update-profile["']/i.test(html)) hints.push('found /my-account/update-profile link');
  if (username && html.toLowerCase().includes(username.toLowerCase())) hints.push(`username "${username}" present in page`);
  if (/class=["'][^"']*js-logged-in/i.test(html)) hints.push('js-logged-in css marker');
  if (!/name=["']j_username["']/i.test(html)) hints.push('no login form on page');
  return hints;
}

export class StorefrontClient {
  private config: Required<StorefrontConfig>;

  constructor(config: StorefrontConfig) {
    this.config = {
      ...config,
      loginPath: config.loginPath ?? '/login',
      loginSubmitPath: config.loginSubmitPath ?? '/j_spring_security_check',
      secureCheckPath: config.secureCheckPath ?? '/my-account',
    };
  }

  /**
   * Performs the full login flow with verbose diagnostics.
   */
  async login(): Promise<LoginResult> {
    const steps: LoginStep[] = [];
    let cookies: string[] = [];

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const loginPageUrl = baseUrl + this.config.loginPath;

    // --- Step 1: GET login page (follow redirects manually, capturing each hop)
    let currentUrl = loginPageUrl;
    let loginHtml = '';
    let loginPageFinalUrl = loginPageUrl;
    let loginPageStatus = 0;

    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      const cookieHeader = cookies.join('; ');
      const resp = await fetchWithTimeout(currentUrl, {
        method: 'GET',
        headers: cookies.length
          ? { Cookie: cookieHeader, 'User-Agent': 'hybris-mcp-storefront/1.0' }
          : { 'User-Agent': 'hybris-mcp-storefront/1.0' },
        redirect: 'manual',
      });
      const setCookies = extractCookies(resp);
      cookies = mergeCookies(cookies, setCookies);

      const isRedirect = [301, 302, 303, 307, 308].includes(resp.status);
      const location = resp.headers.get('location') ?? undefined;

      if (!isRedirect) {
        loginHtml = await resp.text();
        loginPageFinalUrl = currentUrl;
        loginPageStatus = resp.status;
        steps.push({
          step: `GET login page (hop ${hop})`,
          method: 'GET',
          url: currentUrl,
          status: resp.status,
          location,
          setCookies,
          cookiesSent: cookieHeader ? [cookieHeader] : [],
          bodySnippet: bodySnippet(loginHtml),
        });
        break;
      }

      steps.push({
        step: `GET login page (hop ${hop}, redirect)`,
        method: 'GET',
        url: currentUrl,
        status: resp.status,
        location,
        setCookies,
        cookiesSent: cookieHeader ? [cookieHeader] : [],
      });

      if (!location) {
        return this.failure(steps, cookies, currentUrl, resp.status, 'Redirect without Location header');
      }
      currentUrl = absolutize(baseUrl, location);
    }

    if (!loginHtml) {
      return this.failure(steps, cookies, currentUrl, 0, 'Too many redirects fetching login page');
    }

    // --- Step 2: Extract CSRF from login page
    const csrf = extractCsrf(loginHtml);
    steps[steps.length - 1].csrfFound = csrf;
    if (!csrf) {
      return this.failure(
        steps,
        cookies,
        loginPageFinalUrl,
        loginPageStatus,
        'No CSRF token found on login page. Looked for hidden inputs named CSRFToken or _csrf. Inspect bodySnippet to see what the page actually returned — it may be a redirect to a locale-prefixed login URL, or a WAF/SSO page.'
      );
    }

    // Sanity check: login form should target j_spring_security_check (or similar).
    // Record the actual form action so debugging reveals mismatches.
    const formActionMatch = loginHtml.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/i);
    const detectedFormAction = formActionMatch ? formActionMatch[1] : null;

    // --- Step 3: POST credentials
    const submitUrl = baseUrl + this.config.loginSubmitPath;
    const body = new URLSearchParams();
    body.set('j_username', this.config.username);
    body.set('j_password', this.config.password);
    body.set(csrf.field, csrf.token);

    const postResp = await fetchWithTimeout(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies.join('; '),
        Referer: loginPageFinalUrl,
        'User-Agent': 'hybris-mcp-storefront/1.0',
      },
      body,
      redirect: 'manual',
    });

    const postSetCookies = extractCookies(postResp);
    cookies = mergeCookies(cookies, postSetCookies);
    const postLocation = postResp.headers.get('location') ?? undefined;
    const postStep: LoginStep = {
      step: 'POST credentials',
      method: 'POST',
      url: submitUrl,
      status: postResp.status,
      location: postLocation,
      setCookies: postSetCookies,
      cookiesSent: [cookies.join('; ')],
      note: detectedFormAction ? `login form action attribute = ${detectedFormAction}` : undefined,
    };
    steps.push(postStep);

    // Accelerator returns 302 on both success and failure — differentiate by Location.
    if (postResp.status !== 302 || !postLocation) {
      const body = await postResp.text();
      postStep.bodySnippet = bodySnippet(body);
      return this.failure(
        steps,
        cookies,
        submitUrl,
        postResp.status,
        `Expected 302 redirect after POST, got ${postResp.status}. Check that loginSubmitPath (${this.config.loginSubmitPath}) matches the form action, and that CSRF field name "${csrf.field}" is the one Spring expects.`
      );
    }
    if (/login_error|error=|\/login\?/i.test(postLocation)) {
      return this.failure(
        steps,
        cookies,
        submitUrl,
        302,
        `Login rejected — redirected to ${postLocation}. Credentials invalid, user locked, or user not in a group that grants storefront access (e.g. "Commerce CZ/SK" site group).`
      );
    }

    // --- Step 4: Follow post-login redirects to the landing page
    currentUrl = absolutize(baseUrl, postLocation);
    let landingHtml = '';
    let landingStatus = 0;
    let landingUrl = currentUrl;

    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      const cookieHeader = cookies.join('; ');
      const resp = await fetchWithTimeout(currentUrl, {
        method: 'GET',
        headers: { Cookie: cookieHeader, 'User-Agent': 'hybris-mcp-storefront/1.0' },
        redirect: 'manual',
      });
      const setCookies = extractCookies(resp);
      cookies = mergeCookies(cookies, setCookies);
      const isRedirect = [301, 302, 303, 307, 308].includes(resp.status);
      const location = resp.headers.get('location') ?? undefined;

      if (!isRedirect) {
        landingHtml = await resp.text();
        landingUrl = currentUrl;
        landingStatus = resp.status;
        steps.push({
          step: `GET landing (hop ${hop})`,
          method: 'GET',
          url: currentUrl,
          status: resp.status,
          location,
          setCookies,
          cookiesSent: [cookieHeader],
          bodySnippet: bodySnippet(landingHtml),
        });
        break;
      }

      steps.push({
        step: `GET landing (hop ${hop}, redirect)`,
        method: 'GET',
        url: currentUrl,
        status: resp.status,
        location,
        setCookies,
        cookiesSent: [cookieHeader],
      });

      if (!location) break;
      currentUrl = absolutize(baseUrl, location);
    }

    // --- Step 5: Verify we actually reached an authenticated state
    // Hit a protected page that anonymous users cannot view.
    const secureUrl = baseUrl + this.config.secureCheckPath;
    const secureResp = await fetchWithTimeout(secureUrl, {
      method: 'GET',
      headers: { Cookie: cookies.join('; '), 'User-Agent': 'hybris-mcp-storefront/1.0' },
      redirect: 'manual',
    });
    const secureSetCookies = extractCookies(secureResp);
    cookies = mergeCookies(cookies, secureSetCookies);
    const secureLocation = secureResp.headers.get('location') ?? undefined;
    const redirectedToLogin = secureResp.status === 302 && /\/login/i.test(secureLocation ?? '');

    let secureBody = '';
    if (secureResp.status === 200) {
      secureBody = await secureResp.text();
    }

    steps.push({
      step: 'GET secure check',
      method: 'GET',
      url: secureUrl,
      status: secureResp.status,
      location: secureLocation,
      setCookies: secureSetCookies,
      cookiesSent: [cookies.join('; ')],
      bodySnippet: secureBody ? bodySnippet(secureBody) : undefined,
      note: redirectedToLogin
        ? 'Redirected to login page — session is NOT authenticated'
        : undefined,
    });

    const authHints = detectAuthHints(landingHtml + '\n' + secureBody, this.config.username);
    const isAuthenticated = !redirectedToLogin && (secureResp.status === 200 || authHints.length > 0);

    // Extract fresh CSRF from the landing/secure page for subsequent requests.
    const freshCsrf =
      extractCsrf(secureBody) ??
      extractCsrf(landingHtml);

    return {
      success: isAuthenticated,
      finalUrl: landingUrl,
      finalStatus: landingStatus,
      cookies,
      csrfToken: freshCsrf?.token ?? null,
      isAuthenticated,
      authenticatedHints: authHints,
      steps,
      errorSummary: isAuthenticated
        ? undefined
        : redirectedToLogin
          ? 'Secure page redirected to login — login appeared to succeed but session is anonymous. Likely causes: cookie jar issue, session fixation filter, or user lacks storefront access rights.'
          : 'Could not confirm authenticated state — inspect steps.',
    };
  }

  private failure(
    steps: LoginStep[],
    cookies: string[],
    finalUrl: string,
    finalStatus: number,
    errorSummary: string
  ): LoginResult {
    return {
      success: false,
      finalUrl,
      finalStatus,
      cookies,
      csrfToken: null,
      isAuthenticated: false,
      authenticatedHints: [],
      steps,
      errorSummary,
    };
  }

  /**
   * GET an arbitrary URL (absolute or path) using a previously-obtained session.
   * Handy for poking around after login to confirm what the user actually sees.
   */
  async authenticatedGet(session: StorefrontSession, urlOrPath: string): Promise<{
    status: number;
    finalUrl: string;
    cookies: string[];
    bodySnippet: string;
    bodyLength: number;
  }> {
    const baseUrl = session.baseUrl.replace(/\/$/, '');
    let url = urlOrPath.startsWith('http') ? urlOrPath : baseUrl + (urlOrPath.startsWith('/') ? urlOrPath : '/' + urlOrPath);
    let cookies = [...session.cookies];

    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      const resp = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { Cookie: cookies.join('; '), 'User-Agent': 'hybris-mcp-storefront/1.0' },
        redirect: 'manual',
      });
      cookies = mergeCookies(cookies, extractCookies(resp));
      const isRedirect = [301, 302, 303, 307, 308].includes(resp.status);
      if (!isRedirect) {
        const body = await resp.text();
        return {
          status: resp.status,
          finalUrl: url,
          cookies,
          bodySnippet: bodySnippet(body, 1000),
          bodyLength: body.length,
        };
      }
      const location = resp.headers.get('location');
      if (!location) {
        return { status: resp.status, finalUrl: url, cookies, bodySnippet: '', bodyLength: 0 };
      }
      url = absolutize(baseUrl, location);
    }
    throw new Error(`Too many redirects for ${urlOrPath}`);
  }
}
