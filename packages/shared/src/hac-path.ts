/**
 * Resolve the HAC URL prefix from a raw env value.
 *
 * - undefined → `/hac` (default mount on most Hybris instances)
 * - `""` or `"/"` → `""` (HAC mounted at the servlet-context root)
 * - anything else → ensure leading `/`, strip trailing `/`
 *
 * Always returns a string suitable for `${baseUrl}${prefix}/endpoint`
 * concatenation: either empty, or `/something` with no trailing slash.
 */
export function resolveHacPrefix(raw: string | undefined): string {
  if (raw === undefined) return '/hac';
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '/') return '';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}
