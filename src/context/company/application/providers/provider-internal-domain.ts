/** Dominio interno del proveedor. No se pide en el formulario. */
export function providerInternalDomain(name: string, suffix = ''): string {
  const slug =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'proveedor';
  const extra = suffix ? `-${suffix}` : '';
  return `${slug}${extra}.provider.internal`;
}
