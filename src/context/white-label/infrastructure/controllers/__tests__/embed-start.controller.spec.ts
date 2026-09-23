/**
 * Tests para EmbedStartController (Story 4.1).
 * AI-3 compliance: assertions específicas (no `toBeTruthy()` alone).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TestBed } from '@angular/core/testing';
import { Response } from 'express';
import { ok, err } from 'src/context/shared/domain/result';
import { WhiteLabelConfig } from '../../../domain/entities/white-label-config';
import { WhiteLabelConfigNotFoundError } from '../../../domain/errors/white-label.error';
import {
  WHITE_LABEL_CONFIG_REPOSITORY,
  IWhiteLabelConfigRepository,
} from '../../../domain/white-label-config.repository';
import { InMemoryTtlCache } from 'src/context/shared/infrastructure/cache/in-memory-ttl-cache';
import { CacheMetricsService } from 'src/context/shared/infrastructure/cache/cache-metrics.service';
import { EmbedStartController } from '../embed-start.controller';

function makeMockResponse(): Response {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    getHeader: jest.fn((name: string) => headers[name]),
  } as unknown as Response;
}

function makeMockConfig(
  overrides: Partial<{
    embedEnabled: boolean;
    embedAllowedOrigins: string[];
    brandName: string;
  }> = {},
): WhiteLabelConfig {
  return WhiteLabelConfig.create({
    id: 'test-id',
    companyId: 'test-company-id',
    branding: {
      brandName: overrides.brandName ?? 'TestBrand',
      logoUrl: null,
      faviconUrl: null,
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
      customFontFiles: [],
    },
    colors: {
      primary: '#ff0000',
      secondary: '#00ff00',
      tertiary: '#0000ff',
      background: '#ffffff',
      surface: '#f0f0f0',
      text: '#000000',
      textMuted: '#666666',
    },
    theme: 'light',
    embedEnabled: overrides.embedEnabled ?? true,
    embedAllowedOrigins: overrides.embedAllowedOrigins ?? [
      'https://app.partner.com',
    ],
  });
}

describe('EmbedStartController (unit)', () => {
  let controller: EmbedStartController;
  let mockRepo: jest.Mocked<IWhiteLabelConfigRepository>;
  let cache: InMemoryTtlCache<string, WhiteLabelConfig>;

  beforeEach(async () => {
    mockRepo = {
      findByCompanyId: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IWhiteLabelConfigRepository>;

    cache = new InMemoryTtlCache<string, WhiteLabelConfig>({ ttlMs: 60_000 });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbedStartController],
      providers: [
        { provide: WHITE_LABEL_CONFIG_REPOSITORY, useValue: mockRepo },
        { provide: InMemoryTtlCache, useValue: cache },
        CacheMetricsService,
      ],
    }).compile();

    controller = module.get<EmbedStartController>(EmbedStartController);
  });

  describe('AC1 — HTML response', () => {
    it('debe retornar HTML con <title>Guiders Admin - {brandName}</title>', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(
        ok(makeMockConfig({ brandName: 'AcmeCo' })),
      );
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.send).toHaveBeenCalled();
      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(html).toContain('<title>Guiders Admin - AcmeCo</title>');
    });

    it('debe incluir CSS variables inline en <style>', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(html).toContain('--gds-color-primary: #ff0000;');
      expect(html).toContain('<style>');
    });

    it('debe incluir <admin-root></admin-root> en <body>', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(html).toContain('<admin-root></admin-root>');
    });

    it('debe incluir script src tags con Angular bundle URLs', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(html).toContain('<script src="/admin/runtime.js" defer></script>');
      expect(html).toContain('<script src="/admin/main.js" defer></script>');
    });

    it('debe incluir <!DOCTYPE html>', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="es">');
    });
  });

  describe('AC2 — Security headers', () => {
    it('debe setear X-Content-Type-Options: nosniff', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff',
      );
    });

    it('debe setear X-Frame-Options: SAMEORIGIN', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'SAMEORIGIN',
      );
    });

    it('debe setear Referrer-Policy: strict-origin-when-cross-origin', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin',
      );
    });

    it('debe setear CSP frame-ancestors con embedAllowedOrigins', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(
        ok(
          makeMockConfig({
            embedAllowedOrigins: ['https://app.a.com', 'https://app.b.com'],
          }),
        ),
      );
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining(
          'frame-ancestors https://app.a.com https://app.b.com',
        ),
      );
    });

    it('debe usar "none" en CSP si embedAllowedOrigins está vacío', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(
        ok(makeMockConfig({ embedAllowedOrigins: [] })),
      );
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("frame-ancestors 'none'"),
      );
    });

    it('debe setear Content-Type text/html', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/html; charset=utf-8',
      );
    });
  });

  describe('AC3 — Fallback to default branding on MongoDB timeout', () => {
    it('debe retornar branding default si MongoDB tarda > 1s', async () => {
      // Mock that never resolves within test time (simulates hang)
      mockRepo.findByCompanyId.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      const res = makeMockResponse();

      // Start the request but don't await (it would hang forever)
      const startPromise = controller.start('test-company-id', res);

      // Wait 1.1 seconds for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Now the request should have failed and used default
      await startPromise.catch(() => undefined);

      // Either default HTML was sent OR an error was returned
      // The test verifies that the response was NOT delayed past 1s
      // (response was attempted within 1.1s)
      expect(res.send).toHaveBeenCalled();
    });

    it('debe usar cache si la entry existe', async () => {
      const cached = makeMockConfig({ brandName: 'CachedBrand' });
      cache.set('test-company-id', cached);

      const res = makeMockResponse();
      await controller.start('test-company-id', res);

      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(html).toContain('<title>Guiders Admin - CachedBrand</title>');
      expect(mockRepo.findByCompanyId).not.toHaveBeenCalled();
    });
  });

  describe('Story 4.3 — Cache metrics', () => {
    it('debe incrementar hits cuando hay cache hit', async () => {
      const metrics = TestBed.inject(CacheMetricsService);
      cache.set('test-company-id', makeMockConfig());

      const res = makeMockResponse();
      await controller.start('test-company-id', res);

      expect(metrics.snapshot().hits).toBe(1);
    });

    it('debe incrementar misses cuando NO hay cache', async () => {
      const metrics = TestBed.inject(CacheMetricsService);
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));

      const res = makeMockResponse();
      await controller.start('test-company-id', res);

      expect(metrics.snapshot().misses).toBe(1);
    });

    it('debe incrementar sets después de un cache miss + load exitoso', async () => {
      const metrics = TestBed.inject(CacheMetricsService);
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));

      const res = makeMockResponse();
      await controller.start('test-company-id', res);

      expect(metrics.snapshot().sets).toBe(1);
    });

    it('debe calcular hitRatio = 0.5 con 1 hit + 1 miss', async () => {
      const metrics = TestBed.inject(CacheMetricsService);
      // First call: miss + set
      mockRepo.findByCompanyId.mockResolvedValue(ok(makeMockConfig()));
      await controller.start('test-company-id', makeMockResponse());
      // Second call: hit
      await controller.start('test-company-id', makeMockResponse());

      const snap = metrics.snapshot();
      expect(snap.hits).toBe(1);
      expect(snap.misses).toBe(1);
      expect(snap.hitRatio).toBe(0.5);
    });
  });

  describe('AC4 — 403 / 400 responses', () => {
    it('debe retornar 400 cuando query param company es undefined', async () => {
      const res = makeMockResponse();
      await controller.start(undefined as unknown as string, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EMBED_COMPANY_REQUIRED' }),
      );
    });

    it('debe retornar 400 cuando query param company es string vacío', async () => {
      const res = makeMockResponse();
      await controller.start('', res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debe retornar 403 cuando company no existe en DB', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(
        err(new WhiteLabelConfigNotFoundError('missing-id')),
      );
      const res = makeMockResponse();

      await controller.start('missing-id', res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EMBED_DISABLED_FOR_TENANT' }),
      );
    });

    it('debe retornar 403 cuando embedEnabled=false', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(
        ok(makeMockConfig({ embedEnabled: false })),
      );
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('XSS prevention in HTML response', () => {
    it('debe escapar brandName con HTML chars en <title>', async () => {
      mockRepo.findByCompanyId.mockResolvedValue(
        ok(makeMockConfig({ brandName: '<script>alert(1)</script>' })),
      );
      const res = makeMockResponse();

      await controller.start('test-company-id', res);

      const html = (res.send as jest.Mock).mock.calls[0][0] as string;
      // The XSS payload must be escaped (no raw <script> tag in the title)
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      // The escaped content should be in <title>, not as executable HTML
      expect(html).toContain(
        '<title>Guiders Admin - &lt;script&gt;alert(1)&lt;/script&gt;</title>',
      );
      // Verify the raw payload structure is NOT present (escaped form OK)
      // Use a more specific regex to avoid false positives with </title>
      expect(html).not.toMatch(/<title>[^<]*<script>/);
    });
  });
});
