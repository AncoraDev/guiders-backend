/**
 * Generates the full HTML page for GET /embed/start.
 *
 * Story 4.1 — Epic 4: White-Label Branding Application.
 *
 * Returns a complete HTML5 document with:
 * - DOCTYPE + html lang="es"
 * - Inline CSS variables (branding) BEFORE scripts (prevents FOUC)
 * - Angular bundle script tags
 * - <admin-root> mount point
 *
 * Spec: `_bmad-output/planning-artifacts/epics.md` Story 4.1 AC1
 *      + `_bmad-output/implementation-artifacts/4-1-...md`
 */

/**
 * Escapes HTML special characters to prevent XSS via user-controlled data
 * (brandName, logoUrl, faviconUrl).
 *
 * Covers the 5 characters that can break out of HTML context:
 * - & → &amp;
 * - < → &lt;
 * - > → &gt;
 * - " → &quot;
 * - ' → &#39;
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a URL for use inside an HTML attribute (href/src).
 * More aggressive than escapeHtml because URLs can also have JS-context issues.
 */
export function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

/**
 * Generates the embed-start HTML page.
 *
 * @param cssVariables - Output of brandingToCssVariables()
 * @param brandName - Tenant brand name (HTML-escaped)
 * @param scriptUrls - Angular bundle URLs (each HTML-escaped)
 * @returns Complete HTML5 document as string
 */
export function embedStartHtml(
  cssVariables: string,
  brandName: string,
  scriptUrls: ReadonlyArray<string>,
): string {
  const safeBrand = escapeHtml(brandName);
  const scriptTags = scriptUrls
    .map((url) => `  <script src="${escapeHtmlAttribute(url)}" defer></script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Guiders Admin - ${safeBrand}</title>
  <style>${cssVariables}</style>
${scriptTags}
</head>
<body>
  <admin-root></admin-root>
</body>
</html>`;
}
