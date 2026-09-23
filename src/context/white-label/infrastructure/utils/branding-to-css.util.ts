/**
 * Convierte WhiteLabelConfig primitives a CSS custom properties (variables).
 *
 * Story 4.1 — Epic 4: White-Label Branding Application.
 *
 * Usado por:
 * - GET /embed/start (Story 4.1) — inline en `<style>` para evitar FOUC
 * - BrandingService en Angular (Story 4.2) — runtime via document.documentElement.style.setProperty
 *
 * Spec: `_bmad-output/planning-artifacts/epics.md` Story 4.1 AC1
 *      + `_bmad-output/implementation-artifacts/4-1-...md`
 */
import type { WhiteLabelConfigPrimitives } from '../../domain/entities/white-label-config';

/**
 * Generates CSS custom properties for the embed HTML wrapper.
 * Returns a complete `:root { ... }` block ready to be inlined.
 *
 * @example
 * brandingToCssVariables({
 *   colors: { primary: '#ff0000', ... },
 *   typography: { fontFamily: 'Inter', ... },
 *   branding: { brandName: 'LeadCars', logoUrl: '...', faviconUrl: '...' },
 *   // ...
 * })
 * // => ':root { --gds-color-primary: #ff0000; ... }'
 */
export function brandingToCssVariables(
  primitives: WhiteLabelConfigPrimitives,
): string {
  const lines: string[] = [':root {'];

  lines.push(`  --gds-color-primary: ${primitives.colors.primary};`);
  lines.push(`  --gds-color-secondary: ${primitives.colors.secondary};`);
  lines.push(`  --gds-color-tertiary: ${primitives.colors.tertiary};`);
  lines.push(`  --gds-color-background: ${primitives.colors.background};`);
  lines.push(`  --gds-color-surface: ${primitives.colors.surface};`);
  lines.push(`  --gds-color-text: ${primitives.colors.text};`);
  lines.push(`  --gds-color-text-muted: ${primitives.colors.textMuted};`);

  lines.push(`  --gds-font-family: ${primitives.typography.fontFamily};`);

  lines.push(
    `  --gds-brand-name: '${escapeCssString(primitives.branding.brandName)}';`,
  );
  lines.push(
    `  --gds-logo-url: url('${escapeCssString(primitives.branding.logoUrl ?? '')}');`,
  );
  lines.push(
    `  --gds-favicon-url: url('${escapeCssString(primitives.branding.faviconUrl ?? '')}');`,
  );

  lines.push('}');
  return lines.join('\n');
}

/**
 * Escapes characters that could break out of CSS string context.
 * Prevents CSS injection attacks via brandName/logoUrl.
 */
function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}
