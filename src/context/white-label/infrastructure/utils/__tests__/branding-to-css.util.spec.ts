/**
 * Tests para branding-to-css.util (Story 4.1).
 * AI-3 compliance: usa assertions específicas, no `toBeTruthy()` alone.
 */
import { brandingToCssVariables } from '../branding-to-css.util';
import type { WhiteLabelConfigPrimitives } from '../../../domain/entities/white-label-config';

const samplePrimitives: WhiteLabelConfigPrimitives = {
  id: 'test-id',
  companyId: 'test-company-id',
  colors: {
    primary: '#ff0000',
    secondary: '#00ff00',
    tertiary: '#0000ff',
    background: '#ffffff',
    surface: '#f0f0f0',
    text: '#000000',
    textMuted: '#666666',
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
    customFontFiles: [],
  },
  branding: {
    brandName: 'TestBrand',
    logoUrl: 'https://example.com/logo.png',
    faviconUrl: 'https://example.com/favicon.ico',
  },
  theme: 'light',
  embedEnabled: true,
  embedAllowedOrigins: ['https://app.partner.com'],
};

describe('brandingToCssVariables', () => {
  describe('color variables (AC1)', () => {
    it('debe incluir --gds-color-primary', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-primary: #ff0000;');
    });

    it('debe incluir --gds-color-secondary', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-secondary: #00ff00;');
    });

    it('debe incluir --gds-color-tertiary', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-tertiary: #0000ff;');
    });

    it('debe incluir --gds-color-background', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-background: #ffffff;');
    });

    it('debe incluir --gds-color-surface', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-surface: #f0f0f0;');
    });

    it('debe incluir --gds-color-text', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-text: #000000;');
    });

    it('debe incluir --gds-color-text-muted', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-color-text-muted: #666666;');
    });
  });

  describe('typography + branding', () => {
    it('debe incluir --gds-font-family', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain('--gds-font-family: Inter, sans-serif;');
    });

    it('debe incluir --gds-brand-name con comillas simples', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain(`--gds-brand-name: 'TestBrand';`);
    });

    it('debe incluir --gds-logo-url como url()', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain(
        `--gds-logo-url: url('https://example.com/logo.png');`,
      );
    });

    it('debe incluir --gds-favicon-url como url()', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css).toContain(
        `--gds-favicon-url: url('https://example.com/favicon.ico');`,
      );
    });
  });

  describe('CSS structure', () => {
    it('debe envolver variables en :root { ... }', () => {
      const css = brandingToCssVariables(samplePrimitives);
      expect(css.trim().startsWith(':root {')).toBe(true);
      expect(css.trim().endsWith('}')).toBe(true);
    });
  });

  describe('null handling', () => {
    it('debe manejar logoUrl null como string vacío', () => {
      const css = brandingToCssVariables({
        ...samplePrimitives,
        branding: { ...samplePrimitives.branding, logoUrl: null },
      });
      expect(css).toContain("--gds-logo-url: url('');");
    });

    it('debe manejar faviconUrl null como string vacío', () => {
      const css = brandingToCssVariables({
        ...samplePrimitives,
        branding: { ...samplePrimitives.branding, faviconUrl: null },
      });
      expect(css).toContain("--gds-favicon-url: url('');");
    });
  });

  describe('CSS injection prevention (security)', () => {
    it('debe escapar backslash en brandName', () => {
      const css = brandingToCssVariables({
        ...samplePrimitives,
        branding: { ...samplePrimitives.branding, brandName: 'A\\B' },
      });
      expect(css).toContain(`--gds-brand-name: 'A\\\\B';`);
    });

    it('debe escapar single quote en brandName', () => {
      const css = brandingToCssVariables({
        ...samplePrimitives,
        branding: { ...samplePrimitives.branding, brandName: "A'B" },
      });
      expect(css).toContain(`--gds-brand-name: 'A\\'B';`);
    });

    it('debe eliminar newlines en brandName', () => {
      const css = brandingToCssVariables({
        ...samplePrimitives,
        branding: { ...samplePrimitives.branding, brandName: 'A\nB' },
      });
      expect(css).not.toContain('A\nB');
      expect(css).toContain(`--gds-brand-name: 'A B';`);
    });
  });
});
