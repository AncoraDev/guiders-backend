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
  let host = withoutWww;
  if (lastColon !== -1) {
    const maybePort = withoutWww.slice(lastColon + 1);
    if (/^\d+$/.test(maybePort)) {
      host = withoutWww.slice(0, lastColon);
    }
  }
  // En local, 127.0.0.1 y localhost son el mismo sitio (demo PHP :8083).
  return host === '127.0.0.1' ? 'localhost' : host;
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
  const candidates = [trimmed, withoutWww, hostOnly];
  if (hostOnly === 'localhost') {
    candidates.push('localhost', '127.0.0.1');
  }
  return [...new Set(candidates.filter(Boolean))];
}
