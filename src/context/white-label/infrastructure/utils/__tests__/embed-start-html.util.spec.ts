/**
 * Tests para embed-start-html.util (Story 4.1).
 * AI-3 compliance: usa assertions específicas de string content.
 */
import { embedStartHtml, escapeHtml } from '../embed-start-html.util';

describe('escapeHtml (XSS prevention)', () => {
  it('debe escapar & a &amp;', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('debe escapar < a &lt;', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('debe escapar > a &gt;', () => {
    expect(escapeHtml('A > B')).toBe('A &gt; B');
  });

  it('debe escapar " a &quot;', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it("debe escapar ' a &#39;", () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('debe escapar XSS payload completo', () => {
    const malicious = '<script>alert("XSS")</script>';
    const safe = escapeHtml(malicious);
    expect(safe).not.toContain('<script>');
    expect(safe).toContain('&lt;script&gt;');
  });
});

describe('embedStartHtml', () => {
  const sampleCss = ':root { --gds-color-primary: #ff0000; }';
  const sampleScripts = [
    'https://cdn.guiders.com/admin/runtime.js',
    'https://cdn.guiders.com/admin/main.js',
  ];

  describe('AC1 — HTML structure', () => {
    it('debe incluir <!DOCTYPE html>', () => {
      const html = embedStartHtml(sampleCss, 'LeadCars', sampleScripts);
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('debe incluir <html lang="es">', () => {
      const html = embedStartHtml(sampleCss, 'LeadCars', sampleScripts);
      expect(html).toContain('<html lang="es">');
    });

    it('debe incluir <title>Guiders Admin - {brandName}</title>', () => {
      const html = embedStartHtml(sampleCss, 'LeadCars', sampleScripts);
      expect(html).toContain('<title>Guiders Admin - LeadCars</title>');
    });

    it('debe incluir CSS variables inline en <style>', () => {
      const html = embedStartHtml(sampleCss, 'LeadCars', sampleScripts);
      expect(html).toContain(
        '<style>:root { --gds-color-primary: #ff0000; }</style>',
      );
    });

    it('debe incluir <admin-root></admin-root> en <body>', () => {
      const html = embedStartHtml(sampleCss, 'LeadCars', sampleScripts);
      expect(html).toContain('<admin-root></admin-root>');
    });

    it('debe incluir script src tags', () => {
      const html = embedStartHtml(sampleCss, 'LeadCars', sampleScripts);
      expect(html).toContain(
        '<script src="https://cdn.guiders.com/admin/runtime.js" defer></script>',
      );
      expect(html).toContain(
        '<script src="https://cdn.guiders.com/admin/main.js" defer></script>',
      );
    });

    it('debe poner CSS ANTES de scripts (FOUC prevention)', () => {
      const html = embedStartHtml(sampleCss, 'Brand', sampleScripts);
      const cssIndex = html.indexOf('<style>');
      const scriptsIndex = html.indexOf('<script');
      expect(cssIndex).toBeGreaterThan(-1);
      expect(scriptsIndex).toBeGreaterThan(-1);
      expect(cssIndex).toBeLessThan(scriptsIndex);
    });
  });

  describe('XSS prevention in HTML', () => {
    it('debe escapar brandName con <script>', () => {
      const html = embedStartHtml(
        sampleCss,
        '<script>alert(1)</script>',
        sampleScripts,
      );
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('debe escapar script URL con caracteres especiales', () => {
      const maliciousUrl = 'https://cdn.com/main.js?"><script>';
      const html = embedStartHtml(sampleCss, 'Brand', [maliciousUrl]);
      expect(html).not.toContain('"><script>');
    });
  });

  describe('edge cases', () => {
    it('debe manejar scriptUrls vacío', () => {
      const html = embedStartHtml(sampleCss, 'Brand', []);
      expect(html).toContain('<body>');
      expect(html).not.toContain('<script');
    });

    it('debe manejar brandName con caracteres Unicode', () => {
      const html = embedStartHtml(sampleCss, 'LëädCàrs 🚀', sampleScripts);
      expect(html).toContain('LëädCàrs 🚀');
    });
  });
});
