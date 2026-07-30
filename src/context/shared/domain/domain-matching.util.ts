/**
 * Utilidades para comparar dominios de sitios / API keys.
 *
 * Producto: el puerto NO forma parte de la identidad del sitio.
 * `example.com:8083` y `example.com` deben resolver al mismo tenant.
 * También se ignora el prefijo `www.`.
 */

/**
 * Elimina `www.` y el puerto (si es numérico) para comparación estable.
 * No intenta soportar IPv6 literales (no usados como dominios de sitio).
 */
export function normalizeDomainForMatching(domain: string): string {
  const withoutWww = domain.trim().replace(/^www\./i, '').toLowerCase();
  const lastColon = withoutWww.lastIndexOf(':');
  if (lastColon === -1) {
    return withoutWww;
  }
  const maybePort = withoutWww.slice(lastColon + 1);
  if (/^\d+$/.test(maybePort)) {
    return withoutWww.slice(0, lastColon);
  }
  return withoutWww;
}

/**
 * True si ambos dominios representan el mismo host (ignorando www y puerto).
 */
export function domainsMatch(a: string, b: string): boolean {
  return normalizeDomainForMatching(a) === normalizeDomainForMatching(b);
}

/**
 * Candidatos a probar en búsquedas SQL exactas (dominio tal cual + host sin puerto).
 */
export function domainLookupCandidates(domain: string): string[] {
  const trimmed = domain.trim();
  const withoutWww = trimmed.replace(/^www\./i, '');
  const hostOnly = normalizeDomainForMatching(trimmed);
  return [...new Set([trimmed, withoutWww, hostOnly].filter(Boolean))];
}
