/**
 * PUBLIC controller for GET /embed/start.
 *
 * Story 4.1 — Epic 4: White-Label Branding Application.
 *
 * Returns an HTML page with inline CSS branding variables + Angular bundle
 * script tags. The iframe parent (e.g., LeadCars) loads this URL and
 * displays a branded Guiders admin panel.
 *
 * **No auth required**: this is the entry point for the embed iframe.
 * The `?company=<companyId>` param is used to look up branding config.
 *
 * Spec: `_bmad-output/planning-artifacts/epics.md` Story 4.1
 *      + `_bmad-output/implementation-artifacts/4-1-...md`
 */
import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Inject } from '@nestjs/common';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from '../../domain/white-label-config.repository';
import { WhiteLabelConfig } from '../../domain/entities/white-label-config';
import { InMemoryTtlCache } from 'src/context/shared/infrastructure/cache/in-memory-ttl-cache';
import { brandingToCssVariables } from '../utils/branding-to-css.util';
import { embedStartHtml } from '../utils/embed-start-html.util';
import { CacheMetricsService } from 'src/context/shared/infrastructure/cache/cache-metrics.service';

const CACHE_NAME = 'white-label-config';

/**
 * Default Guiders branding palette used as fallback when:
 * - MongoDB is slow (> 1s timeout)
 * - Company doesn't have a white_label_configs document
 * - Branding service fails
 *
 * Per AC3: response is still served (not delayed) — degrades gracefully.
 */
const DEFAULT_BRAND_NAME = 'Guiders';
const DEFAULT_PRIMARY_COLOR = '#007bff';
const DEFAULT_SECONDARY_COLOR = '#6c757d';
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const DEFAULT_TEXT_COLOR = '#212529';
const DEFAULT_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

/**
 * Angular bundle URLs. In production, these come from CDN.
 * In dev/test, they point to the local Nx serve.
 */
const SCRIPT_URLS: ReadonlyArray<string> = [
  '/admin/runtime.js',
  '/admin/main.js',
  '/admin/polyfills.js',
];

/**
 * Timeout (ms) for MongoDB lookup. Per AC3: after 1s, fall back to default.
 */
const MONGODB_TIMEOUT_MS = 1_000;

/**
 * Cache TTL (ms) per Story 4.3 AC1.
 */
const CACHE_TTL_MS = 60_000;

@Controller('embed')
export class EmbedStartController {
  private readonly logger = new Logger(EmbedStartController.name);

  constructor(
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY)
    private readonly repository: IWhiteLabelConfigRepository,
    private readonly cache: InMemoryTtlCache<string, WhiteLabelConfig>,
    private readonly metrics: CacheMetricsService,
  ) {}

  /**
   * GET /embed/start?company=<companyId>
   *
   * Returns an HTML page with branded inline CSS + Angular bundles.
   */
  @Get('start')
  async start(
    @Query('company') companyId: string,
    @Res() res: Response,
  ): Promise<void> {
    // AC4: validate companyId param
    if (!companyId || typeof companyId !== 'string') {
      res.status(HttpStatus.BAD_REQUEST).json({
        code: 'EMBED_COMPANY_REQUIRED',
        message: 'Query param "company" is required and must be a string',
      });
      return;
    }

    // AC1 + AC3: load config with cache + timeout fallback
    const configResult = await this.loadConfigWithFallback(companyId);

    if (!configResult.ok) {
      // AC4: 403 when company not found or embedEnabled=false
      res.status(HttpStatus.FORBIDDEN).json({
        code: 'EMBED_DISABLED_FOR_TENANT',
        message: 'Embed is not enabled for this tenant or company not found',
      });
      return;
    }

    // Generate HTML with inline branding
    const cssVariables = brandingToCssVariables(
      configResult.value.toPrimitives(),
    );
    const html = embedStartHtml(
      cssVariables,
      configResult.value.branding.brandName,
      SCRIPT_URLS,
    );

    // AC2: security headers
    this.setSecurityHeaders(res, configResult.value.embedAllowedOrigins);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(html);
  }

  /**
   * Loads white-label config with cache (60s TTL) and 1s MongoDB timeout.
   *
   * Returns:
   * - `{ ok: true, value: config }` — config loaded successfully (from cache or Mongo)
   * - `{ ok: false }` — company not found, embed disabled, or timeout
   *
   * On timeout: falls back to DEFAULT_BRANDING to satisfy AC3 (response not delayed).
   */
  private async loadConfigWithFallback(
    companyId: string,
  ): Promise<{ ok: true; value: WhiteLabelConfig } | { ok: false }> {
    // Try cache first (Story 4.3 AC2)
    const cached = this.cache.get(companyId);
    if (cached && cached.embedEnabled) {
      this.metrics.recordHit(CACHE_NAME);
      return { ok: true, value: cached };
    }
    this.metrics.recordMiss(CACHE_NAME);

    // AC3: MongoDB with 1s timeout
    try {
      const result = await this.withTimeout(
        this.repository.findByCompanyId(companyId),
        MONGODB_TIMEOUT_MS,
      );

      if (result.isOk()) {
        const config = result.unwrap();
        if (config.embedEnabled) {
          // Cache for next request
          this.cache.set(companyId, config);
          this.metrics.recordSet(CACHE_NAME);
          return { ok: true, value: config };
        }
        // embedEnabled=false → 403
        return { ok: false };
      }

      // Repository returned err (company not found)
      return { ok: false };
    } catch (err) {
      // Timeout or other error → fallback to default branding
      this.logger.warn(
        `Failed to load white-label config for company=${companyId} (falling back to default): ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return { ok: true, value: this.getDefaultBranding() };
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private getDefaultBranding(): WhiteLabelConfig {
    // Use createDefault — factory that takes minimal params and fills defaults.
    // Note: this is a server-side fallback only, never persisted to MongoDB.
    return WhiteLabelConfig.createDefault(
      'default-fallback-id',
      'default-fallback-company',
      DEFAULT_BRAND_NAME,
    );
  }

  private setSecurityHeaders(
    res: Response,
    embedAllowedOrigins: ReadonlyArray<string>,
  ): void {
    // AC2: required security headers per spec
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // CSP frame-ancestors: spec uses allowed origins from config
    // If no origins, use 'none' (most restrictive)
    const ancestors =
      embedAllowedOrigins.length > 0 ? embedAllowedOrigins.join(' ') : "'none'";
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; frame-ancestors ${ancestors}`,
    );
  }
}
